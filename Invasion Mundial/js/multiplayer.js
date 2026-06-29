// ============================================================
// MULTIPLAYER.JS  â  MQTT-based networking (broker.hivemq.com)
// No WebRTC / No TURN servers needed. Works on any local network.
// Max 8 players. Host runs authoritative GameState.
// ============================================================

/* global mqtt, GameState, ACTIONS, COUNTRIES, UI, DEBATE_UI */

const _MQTT_BROKERS = [
  'wss://broker.hivemq.com:8884/mqtt',   // HiveMQ public â port 8884
  'wss://broker.emqx.io:8084/mqtt',      // EMQX public   â port 8084
  'wss://mqtt.eclipseprojects.io:443/mqtt', // Eclipse â port 443 (never blocked)
];

// ââ NETWORK LAYER âââââââââââââââââââââââââââââââââââââââââââââ
const MP = {
  enabled: false,
  _mqtt: null,
  isHost: false,
  roomCode: null,
  connections: {},   // kept for API compat (unused in MQTT mode)
  hostConn: null,
  myPeerId: null,
  myName: 'Jugador',
  myCountryId: null,
  lobby: { players: [], started: false },
  _joinPending: null,

  // ââ TOPICS âââââââââââââââââââââââââââââââââââââââââââââââ
  _T(sub) { return `im/${this.roomCode}/${sub}`; },

  // ââ GENERATE IDs âââââââââââââââââââââââââââââââââââââââââ
  _genId()   { return 'p' + Math.random().toString(36).slice(2, 12); },
  _genCode() {
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join('');
  },

  // ââ CONNECT TO MQTT BROKER ââââââââââââââââââââââââââââââââ
  async _initMQTT() {
    let lastErr = null;
    for (const broker of _MQTT_BROKERS) {
      try { await this._connectBroker(broker); return; } catch(e) { lastErr = e; }
    }
    throw lastErr || new Error('No se pudo conectar. Verifica tu internet.');
  },

  _connectBroker(broker) {
    return new Promise((resolve, reject) => {
      const clientId = 'im_' + Math.random().toString(36).slice(2, 14);
      const willPayload = JSON.stringify({ type: 'DISCONNECT', _from: this.myPeerId });
      const client = mqtt.connect(broker, {
        clientId,
        keepalive: 15,           // detect drops faster (was 30s)
        connectTimeout: 8000,
        reconnectPeriod: 3000,   // auto-reconnect + queues QoS-1 msgs during gap (was 0)
        will: { topic: this._T('c'), payload: willPayload, qos: 1, retain: false },
      });
      const t = setTimeout(() => { client.end(true); reject(new Error('Timeout: ' + broker)); }, 12000);
      let resolved = false;
      client.on('connect', () => {
        clearTimeout(t);
        this._mqtt = client;
        this._activeBroker = broker;
        if (!resolved) {
          resolved = true;
          resolve();
        } else if (this.enabled) {
          this._subscribe().catch(() => {});
          if (this.isHost && MP_GAME.game) this._bcastState();
        }
      });
      client.on('error', e => {
        if (!resolved) { clearTimeout(t); client.end(true); reject(e); }
      });
      client.on('message', (topic, buf) => {
        try {
          const d = JSON.parse(buf.toString());
          if (d._from === this.myPeerId) return;
          if (this.isHost) this._onFromClient(d._from, d);
          else             this._onFromHost(d);
        } catch(_) {}
      });
    });
  },

  async _reconnect() {
    if (!this.enabled || !this.roomCode || this._mqtt) return;
    try {
      // Reconnect to the same broker (stored in _activeBroker) to avoid cross-broker splits
      await this._connectBroker(this._activeBroker || _MQTT_BROKERS[0]);
      await this._subscribe();
      if (this.isHost && MP_GAME.game) this._bcastState();
    } catch(e) { setTimeout(() => this._reconnect(), 5000); }
  },

  async _subscribe() {
    const topics = this.isHost
      ? [this._T('c')]
      : [this._T('h'), this._T('p/' + this.myPeerId)];
    for (const t of topics) {
      await new Promise((res, rej) => this._mqtt.subscribe(t, { qos: 1 }, err => err ? rej(err) : res()));
    }
  },

  _pub(topic, data) {
    if (!this._mqtt) return; // reconnectPeriod>0 queues msgs when disconnected
    this._mqtt.publish(topic, JSON.stringify({ ...data, _from: this.myPeerId }), { qos: 1, retain: false });
  },

  // ââ CREATE ROOM (host) ââââââââââââââââââââââââââââââââââââ
  async createRoom(name) {
    this.myName   = name || 'Jugador';
    this.myPeerId = this._genId();
    this.isHost   = true;

    // Try each broker in order; record WHICH one succeeded so the code encodes it
    let brokerIdx = -1;
    let lastErr   = null;
    for (let i = 0; i < _MQTT_BROKERS.length; i++) {
      try {
        await this._connectBroker(_MQTT_BROKERS[i]);
        brokerIdx = i;
        break;
      } catch(e) { lastErr = e; }
    }
    if (brokerIdx === -1) throw lastErr || new Error('No se pudo conectar al servidor de juego.');

    // roomCode = pure 6-char ID used for MQTT topics
    // Returned display code = broker digit + roomCode so clients know which broker to use
    this.roomCode    = this._genCode();
    this._brokerIdx  = brokerIdx;
    this.displayCode = String(brokerIdx) + this.roomCode; // full code to share with friends
    await this._subscribe();
    this.enabled = true;
    this.lobby = { players: [{ peerId: this.myPeerId, name: this.myName, countryId: null }], started: false };
    LOBBY_UI.refresh(this.lobby);
    return this.displayCode;
  },

  // ââ JOIN ROOM (client) ââââââââââââââââââââââââââââââââââââ
  async joinRoom(code, name) {
    this.myName   = name || 'Jugador';
    this.myPeerId = this._genId();
    this.isHost   = false;

    const clean = code.trim().toUpperCase();

    // First character of the code encodes which broker the host used
    let brokerIdx = 0;
    if (/^[0-9]/.test(clean)) {
      brokerIdx = parseInt(clean[0]);
      this.roomCode = clean.slice(1); // strip prefix for topic naming
    } else {
      this.roomCode = clean; // legacy code without broker prefix
    }

    // Connect ONLY to the same broker the host used â never fall through to a different one
    const brokerUrl = _MQTT_BROKERS[brokerIdx] || _MQTT_BROKERS[0];
    let connected = false;
    let lastErr   = null;
    for (let attempt = 0; attempt < 3 && !connected; attempt++) {
      try {
        await this._connectBroker(brokerUrl);
        connected = true;
      } catch(e) {
        lastErr = e;
        if (attempt < 2) await new Promise(r => setTimeout(r, 1500));
      }
    }
    if (!connected) throw lastErr || new Error('No se pudo conectar al servidor de juego.');

    await this._subscribe();
    // Small delay so subscription propagates to broker before sending JOIN
    await new Promise(r => setTimeout(r, 400));
    this.enabled = true;

    await new Promise((resolve, reject) => {
      let attempts = 0;
      const MAX_ATTEMPTS = 6;
      const RETRY_MS     = 5000;
      const TOTAL_MS     = MAX_ATTEMPTS * RETRY_MS; // 30 seconds total

      const done = (ok, val) => {
        clearInterval(retryInterval);
        clearTimeout(totalTimer);
        this._joinPending = null;
        if (ok) resolve(val); else reject(val);
      };

      this._joinPending = { resolve: v => done(true, v), reject: v => done(false, v) };

      const sendJoin = () => {
        attempts++;
        this._pub(this._T('c'), { type: 'JOIN', name: this.myName });
        if (typeof UI !== 'undefined' && attempts > 1) {
          UI.showToast(`ð¡ Intentando conectarâ¦ (${attempts}/${MAX_ATTEMPTS})`, 'info');
        }
      };

      const retryInterval = setInterval(() => {
        if (!this._joinPending) { clearInterval(retryInterval); return; }
        if (attempts < MAX_ATTEMPTS) sendJoin();
      }, RETRY_MS);

      const totalTimer = setTimeout(() => {
        done(false, new Error(
          `El host no respondiÃ³ despuÃ©s de ${MAX_ATTEMPTS} intentos.\n` +
          'â¢ Verifica que el cÃ³digo sea correcto.\n' +
          'â¢ AsegÃºrate de que el host estÃ© en la sala con internet activo.'
        ));
      }, TOTAL_MS);

      sendJoin(); // first attempt immediately
    });
  },

  // ââ COUNTRY SELECT ââââââââââââââââââââââââââââââââââââââââ
  selectCountry(cid) {
    this.myCountryId = cid;
    if (this.isHost) {
      const me = this.lobby.players.find(p => p.peerId === this.myPeerId);
      if (me) me.countryId = cid;
      this._bcastLobby();
    } else {
      this._toHost({ type: 'SELECT', cid });
    }
  },

  // ââ START GAME (host only) ââââââââââââââââââââââââââââââââ
  startGame() {
    if (!this.isHost) return;
    if (this.lobby.players.filter(p => p.countryId).length < 1) {
      LOBBY_UI.showError('Al menos el host debe elegir un paÃ­s.'); return;
    }
    this.lobby.started = true;
    this._bcast({ type: 'GAME_START', lobby: this.lobby });
    LOBBY_UI.onGameStart(this.lobby);
  },

  // ââ IN-GAME: SEND ACTION ââââââââââââââââââââââââââââââââââ
  sendAction(payload) {
    if (this.isHost) {
      const { result, animQueue, privateLog } = MP_GAME.exec(this.myPeerId, payload);
      // Host stores their own private log entries
      if (privateLog?.length) {
        if (!MP_GAME._myPrivateLog) MP_GAME._myPrivateLog = [];
        MP_GAME._myPrivateLog = [...MP_GAME._myPrivateLog, ...privateLog].slice(-40);
      }
      if (result?._skipImmedBcast) {
        // mp_war actions with delayed state broadcast â only show modal now
        if (typeof UI !== 'undefined' && result && !result._silent)
          UI.showModal({ icon: result.success ? (result._icon || 'âï¸') : 'â', title: result._name || 'Combate', body: result.msg || '', choices: [] });
      } else if (!result?.pending) {
        this._bcastState();
        // Send animations to the defending/target player
        if (animQueue?.length && payload.targetId) {
          const defPid = MP_GAME.game?.playerCountries?.[payload.targetId];
          if (defPid && defPid !== this.myPeerId) this._sendTo(defPid, { type: 'ANIM_EVENT', animQueue });
        }
        // Notify defending human player when host declares war
        if (result?.success && payload.id === 'invade' && payload.targetId) {
          const defPid = MP_GAME.game?.playerCountries?.[payload.targetId];
          if (defPid && defPid !== this.myPeerId) {
            const myC = MP_GAME.game?.countries[this.myCountryId];
            const warAlert = {
              type: 'WAR_ALERT',
              attackerCountryId: this.myCountryId,
              attackerPeerId: this.myPeerId,
              attackerFlag: myC?.flag || 'âï¸',
              attackerName: myC?.name || '',
              targetId: payload.targetId,
            };
            // Delay so STATE arrives first (MQTT doesn't guarantee order across topics)
            setTimeout(() => this._sendTo(defPid, warAlert), 400);
          }
        }
        if (typeof UI !== 'undefined' && result && !result._silent) {
          UI.showModal({ icon: result.success ? (result._icon || 'â') : 'â', title: result._name || 'AcciÃ³n', body: result.msg || '', choices: [] });
        }
      } else if (result?.pending && typeof UI !== 'undefined') {
        UI.showToast(`â³ ${result.msg}`, 'info');
      }
    } else {
      this._toHost({ type: 'ACTION', payload });
    }
  },

  // ââ IN-GAME: SEND CHAT ââââââââââââââââââââââââââââââââââââ
  sendChat(toCountryId, message) {
    const msg = { from: this.myCountryId, to: toCountryId, text: message, ts: Date.now() };
    if (this.isHost) {
      this._routeChat(this.myPeerId, msg);
    } else {
      this._toHost({ type: 'CHAT', msg });
    }
  },

  // ââ HOST: HANDLE CLIENT MESSAGE âââââââââââââââââââââââââââ
  _onFromClient(pid, d) {
    switch (d.type) {
      case 'JOIN': {
        if (this.lobby.started)         { this._sendTo(pid, { type: 'ERR', msg: 'La partida ya comenzÃ³.' }); return; }
        if (this.lobby.players.length >= 8) { this._sendTo(pid, { type: 'ERR', msg: 'Sala llena (mÃ¡x. 8).' }); return; }
        if (this.lobby.players.find(p => p.peerId === pid)) {
          // Re-join after reconnect â send current state
          this._bcastLobby();
          if (MP_GAME.game) this._sendTo(pid, { type: 'STATE', state: MP_GAME.serialize() });
          break;
        }
        this.lobby.players.push({ peerId: pid, name: d.name || 'Jugador', countryId: null });
        this._bcastLobby();
        if (MP_GAME.game) this._sendTo(pid, { type: 'STATE', state: MP_GAME.serialize() });
        break;
      }
      case 'DISCONNECT': {
        const dp = this.lobby.players.find(p => p.peerId === pid);
        if (!dp) break;
        this.lobby.players = this.lobby.players.filter(p => p.peerId !== pid);
        this._bcastLobby();
        if (MP_GAME.game) {
          MP_GAME.game.addLog('ð¡ ' + dp.name + ' se desconectÃ³.', 'warning');
          this._bcastState();
        }
        break;
      }
      case 'SELECT': {
        const taken = this.lobby.players.some(p => p.peerId !== pid && p.countryId === d.cid);
        if (taken) { this._sendTo(pid, { type: 'CID_TAKEN', cid: d.cid }); return; }
        const p = this.lobby.players.find(p => p.peerId === pid);
        if (p) {
          if (p.countryId && MP_GAME.game?.playerCountries) delete MP_GAME.game.playerCountries[p.countryId];
          p.countryId = d.cid;
          if (MP_GAME.game?.playerCountries) MP_GAME.game.playerCountries[d.cid] = pid;
        }
        this._bcastLobby();
        break;
      }
      case 'ACTION': {
        const { result, animQueue, privateLog } = MP_GAME.exec(pid, d.payload);
        if (result && result.pending) {
          // Action is waiting for consent from another player â just tell requester
          this._sendTo(pid, { type: 'ACTION_RESULT', result, animQueue: [], privateLog: privateLog || [] });
        } else if (result?._skipImmedBcast) {
          // mp_war action with delayed broadcast â only notify acting player now
          this._sendTo(pid, { type: 'ACTION_RESULT', result, animQueue: [], privateLog: privateLog || [] });
        } else {
          this._bcastState();
          if (result) this._sendTo(pid, { type: 'ACTION_RESULT', result, animQueue: animQueue || [], privateLog: privateLog || [] });
          // Also send animations to the defending/target player if they're human
          if (animQueue?.length && d.payload?.targetId) {
            const defPid = MP_GAME.game?.playerCountries?.[d.payload.targetId];
            if (defPid && defPid !== pid) this._sendTo(defPid, { type: 'ANIM_EVENT', animQueue });
          }
          // Notify defending human player when war is declared against them
          if (result?.success && d.payload?.id === 'invade' && d.payload?.targetId) {
            const defPid = MP_GAME.game?.playerCountries?.[d.payload.targetId];
            if (defPid) {
              const actP = this.lobby.players.find(lp => lp.peerId === pid);
              const attackerC = actP && MP_GAME.game?.countries[actP.countryId];
              const warAlert = {
                type: 'WAR_ALERT',
                attackerCountryId: actP?.countryId,
                attackerPeerId: pid,
                attackerFlag: attackerC?.flag || 'âï¸',
                attackerName: attackerC?.name || '',
                targetId: d.payload.targetId,
              };
              if (defPid !== this.myPeerId) {
                // Delay so STATE arrives first (MQTT doesn't guarantee order across topics)
                setTimeout(() => this._sendTo(defPid, warAlert), 400);
              } else {
                // Host is defender â game state already live, no delay needed
                this._handleWarAlert(warAlert);
              }
            }
          }
        }
        break;
      }
      case 'P2P_RESPONSE': {
        const { reqId, accepted } = d;
        const req = MP_GAME.game?._p2pRequests?.[reqId];
        if (!req) break;
        delete MP_GAME.game._p2pRequests[reqId];
        if (accepted) {
          const { result, animQueue, privateLog } = MP_GAME.exec(req.fromPid, { ...req.payload, skipConsent: true });
          this._bcastState();
          if (result) this._sendTo(req.fromPid, { type: 'ACTION_RESULT', result, animQueue: animQueue || [], privateLog: privateLog || [] });
        } else {
          const fromPlayer = this.lobby.players.find(p => p.peerId === req.fromPid);
          const fromC = fromPlayer && MP_GAME.game?.countries[fromPlayer.countryId];
          this._sendTo(req.fromPid, {
            type: 'ACTION_RESULT',
            result: { success: false, msg: 'Tu solicitud fue rechazada por el otro jugador.', _icon: 'â', _name: 'Rechazado' },
            animQueue: [],
          });
        }
        break;
      }
      case 'CHAT':
        this._routeChat(pid, d.msg);
        break;
      case 'NEG_TREATY':
      case 'NEG_TRADE':
      case 'NEG_LOAN':
        if (typeof NEG !== 'undefined') {
          NEG.hostHandleNEG(pid, d, MP_GAME.game,
            (toPid, msg) => {
              if (toPid === this.myPeerId) {
                // Host is the target â dispatch locally
                MP._onFromHost({ type: 'NEG_MSG', data: msg });
              } else {
                this._sendTo(toPid, { type: 'NEG_MSG', data: msg });
              }
            },
            () => this._bcastState());
        }
        break;
    }
  },

  // ââ HOST: ROUTE CHAT âââââââââââââââââââââââââââââââââââââ
  _routeChat(fromPid, msg) {
    if (!MP_GAME.game) return;
    const fromP = this.lobby.players.find(p => p.peerId === fromPid);
    if (!fromP) return;
    msg.from = fromP.countryId;

    const toP = this.lobby.players.find(p => p.countryId === msg.to);
    const isPublic = msg.to === 'all';

    // Deliver to sender
    this._deliverChat(fromPid, msg, false);

    if (isPublic) {
      for (const [pid] of Object.entries(this.connections)) {
        if (pid !== fromPid) this._deliverChat(pid, msg, false);
      }
      // Host also sees public if not sender
      if (fromPid !== this.myPeerId) MP_UI.receive(msg, false);
    } else {
      // Deliver to recipient
      if (toP) {
        if (toP.peerId === this.myPeerId) MP_UI.receive(msg, false);
        else this._deliverChat(toP.peerId, msg, false);
      }
      // Spy interception
      for (const spy of this._getSpies(msg.from, msg.to)) {
        if (spy === this.myPeerId) MP_UI.receive(msg, true);
        else this._deliverChat(spy, msg, true);
      }
    }
  },

  _deliverChat(pid, msg, intercepted) {
    if (pid === this.myPeerId) { MP_UI.receive(msg, intercepted); return; }
    this._sendTo(pid, { type: intercepted ? 'INTERCEPT' : 'CHAT', msg });
  },

  // ââ SPY DETECTION âââââââââââââââââââââââââââââââââââââââââ
  _getSpies(fromCid, toCid) {
    if (!MP_GAME.game) return [];
    const ops = MP_GAME.game.activeOps || [];
    return this.lobby.players
      .filter(p => p.countryId && p.countryId !== fromCid && p.countryId !== toCid)
      .filter(p => ops.some(op =>
        op.source === p.countryId && op.type === 'network' &&
        (op.target === fromCid || op.target === toCid)
      ))
      .map(p => p.peerId);
  },

  // ââ CLIENT: HANDLE HOST MESSAGE âââââââââââââââââââââââââââ
  _onFromHost(d) {
    // Resolve/reject the joinRoom() promise
    if (this._joinPending) {
      if (d.type === 'ERR') {
        clearTimeout(this._joinPending._timer);
        const rej = this._joinPending.reject;
        this._joinPending = null;
        rej(new Error(d.msg));
        return;
      }
      if (d.type === 'LOBBY' || d.type === 'GAME_START') {
        clearTimeout(this._joinPending._timer);
        const res = this._joinPending.resolve;
        this._joinPending = null;
        // fall through to process the message, then resolve
        setTimeout(res, 0);
      }
    }
    switch (d.type) {
      case 'LOBBY':      this.lobby = d.lobby; LOBBY_UI.refresh(d.lobby); break;
      case 'GAME_START': this.lobby = d.lobby; LOBBY_UI.onGameStart(d.lobby); break;
      case 'STATE':      MP_GAME.applyState(d.state); break;
      case 'CHAT':       MP_UI.receive(d.msg, false); break;
      case 'INTERCEPT':  MP_UI.receive(d.msg, true); break;
      case 'CID_TAKEN':  LOBBY_UI.onCountryTaken(d.cid); break;
      case 'ERR':        LOBBY_UI.showError(d.msg); break;
      case 'ACTION_RESULT': {
        const { result, animQueue, privateLog } = d;
        // Store this player's private log entries for merging into their log view
        if (privateLog?.length) {
          if (!MP_GAME._myPrivateLog) MP_GAME._myPrivateLog = [];
          MP_GAME._myPrivateLog = [...MP_GAME._myPrivateLog, ...privateLog].slice(-40);
        }
        if (result && typeof UI !== 'undefined') {
          if (!result.pending) {
            // Play contextual sounds for MP action results
            if (typeof SFX !== 'undefined') {
              if (result._name?.includes('Combate') || result._name?.includes('Ataque') || result._icon === 'âï¸') {
                result.success ? SFX.explosion() : SFX.fail();
              } else if (result._name?.includes('Conquista') || result._icon === 'ð') {
                SFX.conquer();
              } else if (result._name?.includes('Nuclear') || result._icon === 'â¢ï¸') {
                SFX.nuke();
              } else if (result._name?.includes('Alianza') || result._icon === 'ð¤') {
                result.success ? SFX.fanfare() : SFX.fail();
              } else if (result.success) {
                SFX.success();
              } else {
                SFX.fail();
              }
            }
            UI.showToast(
              `${result._icon || ''} <strong>${result._name || 'AcciÃ³n'}</strong>: ${(result.msg || '').substring(0, 90)}${(result.msg || '').length > 90 ? 'â¦' : ''}`,
              result.success ? 'success' : 'warning'
            );
            UI.showModal({ icon: result.success ? (result._icon || 'â') : 'â', title: result._name || 'AcciÃ³n', body: result.msg || '', choices: [] });
          } else {
            UI.showToast(`â³ ${result.msg}`, 'info');
          }
        }
        if (animQueue?.length && typeof ANIM !== 'undefined') {
          animQueue.forEach(({ method, args }) => { try { ANIM[method]?.(...args); } catch(e) {} });
        }
        break;
      }
      case 'P2P_REQUEST':
        MP_UI.showConsentRequest(d);
        break;
      case 'WAR_ALERT':
        MP._handleWarAlert(d);
        break;
      case 'ANIM_EVENT':
        if (d.animQueue?.length && typeof ANIM !== 'undefined') {
          d.animQueue.forEach(({ method, args }) => { try { ANIM[method]?.(...args); } catch(e) {} });
        }
        break;
      case 'INCOMING_ATTACK':
        MP._handleIncomingAttack(d);
        break;
      case 'NEG_MSG':
        if (typeof NEG !== 'undefined' && d.data) {
          const nd = d.data;
          if (nd.type === 'NEG_TREATY') {
            if (nd.sub === 'propose') NEG.receiveTreaty(nd);
            else if (nd.sub === 'signed')   NEG.showSigningAnimation(() => { if (typeof UI !== 'undefined') UI.refresh(); });
            else if (nd.sub === 'rejected') { if (typeof UI !== 'undefined') UI.showToast('â Tu propuesta de tratado fue rechazada.', 'danger'); NEG.closeTreaty(); }
            else if (nd.sub === 'sign')     { if (typeof UI !== 'undefined') UI.showToast('âï¸ El otro jugador tambiÃ©n firmÃ³. Esperando confirmaciÃ³n del host.', 'info'); }
          } else if (nd.type === 'NEG_TRADE') {
            if (nd.sub === 'open')     { NEG.openTrade(nd.fromId, false); }
            else if (nd.sub === 'offer')    NEG.receiveTradeOffer(nd);
            else if (nd.sub === 'done')     NEG.tradeCompleted(nd);
            else if (nd.sub === 'rejected') { NEG.closeTrade(); if (typeof UI !== 'undefined') UI.showToast('â El otro jugador rechazÃ³ el comercio.', 'warning'); }
          } else if (nd.type === 'NEG_LOAN') {
            if (nd.sub === 'propose') NEG.receiveLoan(nd);
            else if (nd.sub === 'accepted') { if (typeof UI !== 'undefined') UI.showToast('â Â¡El prÃ©stamo fue aceptado!', 'success'); NEG.closeLoan(); }
            else if (nd.sub === 'rejected') { if (typeof UI !== 'undefined') UI.showToast('â El prÃ©stamo fue rechazado.', 'danger'); NEG.closeLoan(); }
          }
        }
        break;
    }
  },

  // ââ HELPERS âââââââââââââââââââââââââââââââââââââââââââââââ

  // Pending attack timers: { [attackId]: timeoutId }
  _pendingTimers: {},

  _handleIncomingAttack(d) {
    if (typeof UI === 'undefined') return;
    if (!UI._mpIncomingAttacks) UI._mpIncomingAttacks = [];
    UI._mpIncomingAttacks.push(d);

    if (typeof SFX !== 'undefined') {
      if (d.attackType === 'missile') SFX.missile();
      else SFX.explosion();
    }

    const typeLabel = { air: 'AÃ©reo', naval: 'Naval', missile: 'Misil BalÃ­stico' }[d.attackType] || d.attackType;
    const radarActive = UI._mpRadarActive && d.defenderHasRadar;
    UI.showToast(`ð¨ Â¡Ataque ${typeLabel} entrante!${radarActive ? ' Haz clic en el blip para INTERCEPTAR.' : (d.defenderHasRadar ? ' Activa el radar para interceptar.' : '')}`, 'danger');

    // Blips only visible when radar is active (player must have radar AND have it toggled on)
    if (radarActive && typeof MAP !== 'undefined' && MAP.showAttackBlip) {
      const blipTypeMap = { air: 'aerial', naval: 'naval', missile: 'missiles' };
      MAP.showAttackBlip({
        id: d.attackId,
        type: blipTypeMap[d.attackType] || d.attackType,
        fromId: d.fromId,
        toId: d.toId,
        onIntercept: () => {
          MP.sendAction({ cat: 'mp_war', id: 'intercept', targetId: d.fromId,
                          params: { attackId: d.attackId } });
          UI.showToast('â Â¡Interceptor activado! El ataque fue neutralizado.', 'success');
        },
        onImpact: () => {
          if (UI._mpIncomingAttacks) {
            UI._mpIncomingAttacks = UI._mpIncomingAttacks.filter(a => a.attackId !== d.attackId);
          }
        },
      });
    }

    if (UI.game?.activeTab === 'military') UI.refresh();
  },

  _handleWarAlert(d) {
    if (typeof UI === 'undefined') return;
    if (typeof SFX !== 'undefined') SFX.war();
    UI.showToast(`ð¨ Â¡<strong>${d.attackerFlag} ${d.attackerName}</strong> te ha declarado la GUERRA!`, 'danger');
    if (!UI.game || !d.attackerCountryId) return;

    // Patch UI.game immediately so war panel renders even if STATE hasn't arrived yet
    const myC = UI.game.countries?.[MP.myCountryId];
    if (myC && !myC.atWar?.includes(d.attackerCountryId)) {
      myC.atWar = [...(myC.atWar || []), d.attackerCountryId];
    }
    if (d.attackerPeerId) {
      if (!UI.game.playerCountries) UI.game.playerCountries = {};
      UI.game.playerCountries[d.attackerCountryId] = d.attackerPeerId;
    }
    // Initialize minimal mpWarData so panel renders instead of "Cargando..."
    if (!UI.game.mpWarData) UI.game.mpWarData = {};
    const warKey = [MP.myCountryId, d.attackerCountryId].sort().join('_');
    if (!UI.game.mpWarData[warKey]) {
      const enC = UI.game.countries?.[d.attackerCountryId];
      UI.game.mpWarData[warKey] = {
        attacker: d.attackerCountryId, defender: MP.myCountryId, progress: 50,
        troops: { [d.attackerCountryId]: enC?.armySize || 100000, [MP.myCountryId]: myC?.armySize || 100000 },
        tech: { [d.attackerCountryId]: 0, [MP.myCountryId]: 0 },
        weapons: {
          [d.attackerCountryId]: { aerial: 0, naval: 0, missiles: 0, interceptors: 0 },
          [MP.myCountryId]:      { aerial: 0, naval: 0, missiles: 0, interceptors: 0 },
        },
        shield: { [d.attackerCountryId]: false, [MP.myCountryId]: false },
        pendingAttacks: [],
      };
    }

    // Switch DOM to EXTERIOR + MILITAR tab group immediately
    const switchToMilitary = () => {
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.cat-btn[data-cat="external"]')?.classList.add('active');
      document.getElementById('internal-tabs')?.classList.add('hidden');
      document.getElementById('external-tabs')?.classList.remove('hidden');
      document.querySelectorAll('#external-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('#external-tabs .tab-btn[data-tab="military"]')?.classList.add('active');
      if (UI.game) UI.game.activeTab = 'military';
      UI.refresh();
    };

    // Show war declaration modal
    UI.showModal({
      icon: 'âï¸',
      title: 'Â¡DECLARACIÃN DE GUERRA!',
      body: `${d.attackerFlag} ${d.attackerName} te ha declarado la guerra.\n\nActiva el radar y prepara tu defensa. Puedes comprar interceptores para detener ataques entrantes.`,
      choices: [{ label: 'âï¸ Ir al panel militar', effect: () => {} }],
    });

    switchToMilitary();
    // Retry after STATE arrives in case mpWarData was empty
    setTimeout(switchToMilitary, 800);
    setTimeout(switchToMilitary, 2000);
  },

  // Execute a P2P war action (called from exec())
  _execMPWar(countryId, enemyId, action, params, game) {
    if (!game || typeof WAR_MP === 'undefined') return { success: false, msg: 'Sistema P2P no disponible.', _icon: 'â', _name: 'Error' };

    // Treasury swap so canAfford/spend work for this player
    const pt = game.playerTreasuries || {};
    const savedT = game.treasury;
    if (pt[countryId] !== undefined) game.treasury = pt[countryId];
    const prevId = game.playerCountryId;
    game.playerCountryId = countryId;

    let res = null;
    const ANIM_DURATIONS = { offensive: 3300, air: 2600, naval: 3600, missile: 1900 };

    const finalize = (attackId, attackType) => {
      // Called after animation delay to apply pending damage
      const w = WAR_MP.get(game, countryId, enemyId);
      if (!w) return;
      const pa = w.pendingAttacks.find(a => a.id === attackId);
      if (!pa) return; // already intercepted
      w.pendingAttacks = w.pendingAttacks.filter(a => a.id !== attackId);
      // Apply stored damage
      const actIsOrigAtk2 = w.attacker === countryId;
      w.troops[enemyId] = Math.max(0, (w.troops[enemyId] || 0) - pa.enLoss);
      w.progress = actIsOrigAtk2 ? Math.min(100, w.progress + pa.gained) : Math.max(0, w.progress - pa.gained);
      const winner2 = WAR_MP._checkConquest(w);
      if (winner2) {
        const loser2 = winner2 === w.attacker ? w.defender : w.attacker;
        WAR_MP.conquer(game, winner2, loser2);
      }
      delete MP._pendingTimers[attackId];
      MP._bcastState();
    };

    switch (action) {
      case 'offensive': {
        res = WAR_MP.doOffensive(game, countryId, enemyId);
        res._icon = 'âï¸'; res._name = 'Ofensiva General';
        if (res.success || res.shielded) {
          const delay = ANIM_DURATIONS.offensive;
          // Broadcast troop animation to BOTH players immediately
          const animData = { type: 'ANIM_EVENT', animQueue: [
            { method: 'showTroops', args: [countryId, enemyId, { count: 8000, duration: 3200 }] },
          ]};
          this._bcast(animData);
          if (typeof ANIM !== 'undefined') ANIM.showTroops(countryId, enemyId, { count: 8000, duration: 3200 });
          if (res.success) {
            // Check conquest after animation delay
            const tid = setTimeout(() => {
              const w2 = WAR_MP.get(game, countryId, enemyId);
              const winner = w2 && WAR_MP._checkConquest(w2);
              if (winner) {
                const loser = winner === w2.attacker ? w2.defender : w2.attacker;
                WAR_MP.conquer(game, winner, loser);
              }
              MP._bcastState();
            }, delay);
            MP._pendingTimers[`off_${Date.now()}`] = tid;
          } else {
            // Shield blocked â broadcast after short delay (shield flag already cleared)
            const tid = setTimeout(() => MP._bcastState(), delay);
            MP._pendingTimers[`off_${Date.now()}`] = tid;
          }
          res._skipImmedBcast = true;
        }
        break;
      }
      case 'air':
      case 'naval':
      case 'missile': {
        const METHOD = { air: 'doAir', naval: 'doNaval', missile: 'doMissile' }[action];
        const PRE = { air: 'âï¸', naval: 'â', missile: 'ð' }[action];
        const NAMES = { air: 'Bombardeo AÃ©reo', naval: 'Ataque Naval', missile: 'Misil BalÃ­stico' }[action];
        const delay = ANIM_DURATIONS[action];

        // Pre-compute damage amounts WITHOUT applying to state yet
        const w = WAR_MP.get(game, countryId, enemyId);
        if (!w) { res = { success: false, msg: 'Sin estado de guerra.', _icon: PRE, _name: NAMES }; break; }
        const wp = w.weapons[countryId];
        if (!wp || wp[action === 'air' ? 'aerial' : action === 'naval' ? 'naval' : 'missiles'] <= 0) {
          const lack = { air: 'bombarderos', naval: 'flota naval', missile: 'misiles balÃ­sticos' }[action];
          res = { success: false, msg: `Sin ${lack} disponibles.`, _icon: PRE, _name: NAMES };
          break;
        }
        const weaponKey = action === 'air' ? 'aerial' : action === 'naval' ? 'naval' : 'missiles';
        wp[weaponKey]--;  // consume weapon now (shows in state immediately)
        const enLoss = { air: [4000,14000], naval: [3000,11000], missile: [15000,38000] }[action];
        const gainRng = { air: [9,22], naval: [7,18], missile: [20,40] }[action];
        const computedLoss = enLoss[0] + Math.floor(Math.random() * (enLoss[1] - enLoss[0] + 1));
        const computedGain = gainRng[0] + Math.floor(Math.random() * (gainRng[1] - gainRng[0] + 1));

        const attackId = `atk_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
        w.pendingAttacks = w.pendingAttacks || [];
        w.pendingAttacks.push({ id: attackId, type: action, fromId: countryId, toId: enemyId, enLoss: computedLoss, gained: computedGain, expiresAt: Date.now() + delay });

        // Only attacker sees animation immediately
        if (typeof ANIM !== 'undefined') {
          const animMap = { air: ['showPlane', [countryId, enemyId, { emoji: 'âï¸', label: 'bombardeo', color: '#c9a227', duration: delay - 100 }]],
                            naval: ['showPlane', [countryId, enemyId, { emoji: 'ð¢', label: 'flota naval', color: '#4a90d9', duration: delay - 100 }]],
                            missile: ['showPlane', [countryId, enemyId, { emoji: 'ð', label: 'Â¡MISIL!', color: '#ff3333', duration: delay - 100 }]] };
          const [am, aa] = animMap[action];
          ANIM[am]?.(...aa);
        }
        // Tell attacker's client about animation too
        const atkPid = game.playerCountries?.[countryId];
        if (atkPid && atkPid !== MP.myPeerId) {
          const animMap = { air: { method: 'showPlane', args: [countryId, enemyId, { emoji: 'âï¸', label: 'bombardeo', color: '#c9a227', duration: delay - 100 }] },
                            naval: { method: 'showPlane', args: [countryId, enemyId, { emoji: 'ð¢', label: 'flota naval', color: '#4a90d9', duration: delay - 100 }] },
                            missile: { method: 'showPlane', args: [countryId, enemyId, { emoji: 'ð', label: 'Â¡MISIL!', color: '#ff3333', duration: delay - 100 }] } };
          MP._sendTo(atkPid, { type: 'ANIM_EVENT', animQueue: [animMap[action]] });
        }

        // Notify defender if they have radar (so they can intercept)
        const defPid = game.playerCountries?.[enemyId];
        const defHasRadar = (WAR_MP.get(game, countryId, enemyId)?.tech?.[enemyId] || 0) >= WAR_MP.TECH_RADAR;
        const incomingMsg = { type: 'INCOMING_ATTACK', attackId, attackType: action, fromId: countryId, toId: enemyId, delay, defenderHasRadar: defHasRadar };
        if (defPid && defPid !== MP.myPeerId) MP._sendTo(defPid, incomingMsg);
        else if (defPid === MP.myPeerId) MP._handleIncomingAttack(incomingMsg);

        // Schedule damage after delay (unless intercepted)
        const tid = setTimeout(() => finalize(attackId, action), delay);
        MP._pendingTimers[attackId] = tid;

        // Broadcast state immediately so pendingAttacks are visible
        res = { success: true, _icon: PRE, _name: NAMES, msg: `${PRE} Ataque lanzado. ImpactarÃ¡ en ${(delay/1000).toFixed(1)}s.` };
        break;
      }
      case 'shield':
        res = WAR_MP.doShield(game, countryId, enemyId);
        res._icon = 'ð¡ï¸'; res._name = 'Defensa EstratÃ©gica';
        break;
      case 'intercept': {
        const attackId = params?.attackId;
        if (!attackId) { res = { success: false, msg: 'ID de ataque no especificado.', _icon: 'ð¯', _name: 'Interceptor' }; break; }
        res = WAR_MP.doIntercept(game, countryId, enemyId, attackId);
        res._icon = 'ð¯'; res._name = 'Interceptor';
        if (res.success && MP._pendingTimers[attackId]) {
          clearTimeout(MP._pendingTimers[attackId]);
          delete MP._pendingTimers[attackId];
        }
        break;
      }
      case 'tech_invest':
        res = WAR_MP.doInvestTech(game, countryId, enemyId);
        res._icon = 'ð¬'; res._name = 'InversiÃ³n TecnolÃ³gica';
        break;
      case 'buy_weapon': {
        const { weaponType, build } = params || {};
        res = WAR_MP.doBuyWeapon(game, countryId, enemyId, weaponType, !!build);
        res._icon = build ? 'ð­' : 'ð'; res._name = build ? 'Construir Armamento' : 'Comprar Armamento';
        break;
      }
      case 'nuclear':
        res = WAR_MP.doNuclear(game, countryId, enemyId);
        res._icon = 'â¢ï¸'; res._name = 'Bomba Nuclear';
        if (res.success) {
          this._bcast({ type: 'ANIM_EVENT', animQueue: [{ method: 'showExplosion', args: [enemyId] }] });
          if (typeof ANIM !== 'undefined') ANIM.showExplosion?.(enemyId);
          setTimeout(() => { WAR_MP.conquer(game, countryId, enemyId); MP._bcastState(); }, 2500);
          res._skipImmedBcast = true;
        }
        break;
      default:
        res = { success: false, msg: `AcciÃ³n mp_war desconocida: ${action}`, _icon: 'â', _name: action };
    }

    // Restore treasury
    if (!game.playerTreasuries) game.playerTreasuries = {};
    game.playerTreasuries[countryId] = game.treasury;
    game.treasury = savedT;
    game.playerCountryId = prevId;

    // Add public log entry for combat events (visible to all players)
    if (res?.success) {
      const actor  = game.countries[countryId];
      const target = game.countries[enemyId];
      const an = actor  ? `${actor.flag} ${actor.name}`   : countryId;
      const tn = target ? `${target.flag} ${target.name}` : enemyId;
      const WAR_PUBLIC = {
        offensive: `âï¸ ${an} lanzÃ³ una ofensiva contra ${tn}.`,
        air:       `âï¸ ${an} ejecutÃ³ un bombardeo aÃ©reo sobre ${tn}.`,
        naval:     `â ${an} atacÃ³ con su flota naval a ${tn}.`,
        missile:   `ð ${an} lanzÃ³ un misil balÃ­stico contra ${tn}.`,
        nuclear:   `â¢ï¸ Â¡${an} lanzÃ³ un ATAQUE NUCLEAR contra ${tn}!`,
        intercept: `ð¡ï¸ ${tn} interceptÃ³ un ataque de ${an}.`,
      };
      const pubMsg = WAR_PUBLIC[action];
      if (pubMsg) game.log.unshift({ message: pubMsg, type: action === 'nuclear' ? 'danger' : 'warning', _public: true });
    }

    return res || { success: false, msg: 'Error interno.', _icon: 'â', _name: 'Error' };
  },

  _bcast(d)    { this._pub(this._T('h'), d); },
  _sendTo(pid, d) { this._pub(this._T('p/' + pid), d); },
  _toHost(d)   {
    if (this.isHost) {
      // Host shortcuts directly to _onFromClient so own messages aren't filtered
      this._onFromClient(this.myPeerId, d);
    } else {
      this._pub(this._T('c'), d);
    }
  },

  _execMPTech(countryId, action, params, game) {
    const country = game.countries[countryId];
    if (!country) return { success: false, msg: 'PaÃ­s no encontrado.', _icon: 'â', _name: 'Error' };

    // Find active P2P war for this player
    const pvpWar = Object.values(game.mpWarData || {}).find(w =>
      w.attacker === countryId || w.defender === countryId
    );

    // Swap in player treasury
    const pt = game.playerTreasuries || {};
    const savedT = game.treasury;
    if (pt[countryId] !== undefined) game.treasury = pt[countryId];
    const prevId = game.playerCountryId;
    game.playerCountryId = countryId;

    const COSTS    = WAR_MP.TECH_COSTS;
    const BUILD_LV = WAR_MP.TECH_BUILD;
    const RADAR_LV = WAR_MP.TECH_RADAR;
    const NUKE_LV  = WAR_MP.TECH_NUKE;

    let result;

    if (action === 'invest_tech') {
      const curTech = pvpWar ? (pvpWar.tech?.[countryId] || 0) : (country.mpTech || 0);
      if (curTech >= 10) {
        result = { success: false, _icon: 'ð¬', _name: 'TecnologÃ­a', msg: 'ð¬ Ya tienes el nivel mÃ¡ximo de tecnologÃ­a (Lv.10).' };
      } else {
        const cost = COSTS[curTech];
        if (!game.canAfford(cost)) {
          result = { success: false, _icon: 'ð°', _name: 'TecnologÃ­a', msg: `ð° Necesitas $${cost}B para invertir en tecnologÃ­a.` };
        } else {
          game.spend(cost);
          const nl = curTech + 1;
          if (pvpWar) pvpWar.tech[countryId] = nl;
          country.mpTech = nl;
          let extra = '';
          if (nl === BUILD_LV) extra = '\nð­ NUEVO: Puedes construir armamento (2Ã potente).';
          if (nl === RADAR_LV) extra = '\nð¡ NUEVO: Radar activo â detecta ataques enemigos.';
          if (nl === NUKE_LV)  extra = '\nâ¢ï¸ NUEVO: Programa Nuclear desbloqueado.';
          game.addLog(`ð¬ TecnologÃ­a Lv.${nl} ($${cost}B).`, 'success');
          result = { success: true, _icon: 'ð¬', _name: 'InversiÃ³n TecnolÃ³gica', msg: `ð¬ TecnologÃ­a militar: Nivel ${nl}/10${extra}` };
        }
      }

    } else if (action === 'buy_weapon') {
      const { weaponType, build } = params || {};
      const curTech = pvpWar ? (pvpWar.tech?.[countryId] || 0) : (country.mpTech || 0);
      if (build && curTech < BUILD_LV) {
        result = { success: false, _icon: 'ð­', _name: 'Construir', msg: `ð Necesitas TecnologÃ­a Lv.${BUILD_LV} para construir armamento.` };
      } else {
        const BUY   = { aerial: 100, naval: 80, missiles: 160, interceptors: 120 };
        const BUILD = { aerial: 160, naval: 130, missiles: 250, interceptors: 190 };
        const cost = (build ? BUILD : BUY)[weaponType];
        if (!cost) {
          result = { success: false, _icon: 'â', _name: 'Error', msg: 'Tipo de armamento no vÃ¡lido.' };
        } else if (!game.canAfford(cost)) {
          result = { success: false, _icon: 'ð°', _name: build ? 'Construir' : 'Comprar', msg: `ð° Necesitas $${cost}B.` };
        } else {
          game.spend(cost);
          const qty = build ? 2 : 1;
          if (pvpWar) {
            if (!pvpWar.weapons[countryId]) pvpWar.weapons[countryId] = { aerial:0, naval:0, missiles:0, interceptors:0 };
            pvpWar.weapons[countryId][weaponType] = (pvpWar.weapons[countryId][weaponType] || 0) + qty;
          } else {
            if (!country.mpWeapons) country.mpWeapons = { aerial:0, naval:0, missiles:0, interceptors:0 };
            country.mpWeapons[weaponType] = (country.mpWeapons[weaponType] || 0) + qty;
          }
          const names = { aerial:'bombarderos', naval:'flotas navales', missiles:'misiles', interceptors:'interceptores' };
          const verb = build ? 'ð­ Construido' : 'ð Comprado';
          game.addLog(`${verb}: ${qty} ${names[weaponType]} ($${cost}B).`, 'success');
          result = { success: true, _icon: build ? 'ð­' : 'ð', _name: build ? 'Construir' : 'Comprar',
            msg: `${verb}: ${qty} ${names[weaponType]}\nCoste: $${cost}B${pvpWar ? '' : '\n(Armamento en reserva, se usarÃ¡ en la prÃ³xima guerra)'}` };
        }
      }
    } else {
      result = { success: false, _icon: 'â', _name: 'Error', msg: 'AcciÃ³n tecnolÃ³gica desconocida.' };
    }

    // Restore treasury
    if (!game.playerTreasuries) game.playerTreasuries = {};
    game.playerTreasuries[countryId] = game.treasury;
    game.treasury = savedT;
    game.playerCountryId = prevId;

    return result;
  },

  _bcastLobby() {
    this._bcast({ type: 'LOBBY', lobby: this.lobby });
    LOBBY_UI.refresh(this.lobby);
  },
  _bcastState() {
    if (!MP_GAME.game) return;
    MP_GAME.state = MP_GAME.serialize();
    this._bcast({ type: 'STATE', state: MP_GAME.state });
    // Host: auto-deactivate radar if war ended
    if (typeof UI !== 'undefined') {
      if (UI._mpRadarActive) {
        const myC = MP_GAME.game.countries?.[MP.myCountryId];
        const stillAtWar = (myC?.atWar || []).some(eid => MP_GAME.game.playerCountries?.[eid]);
        if (!stillAtWar) {
          UI._mpRadarActive = false;
          if (typeof MAP !== 'undefined') {
            MAP.clearAllBlips?.();
            const mc = document.getElementById('map-container');
            if (mc) MAP._syncRadarOverlay(false, mc);
          }
          UI.showToast('ð¡ Radar desactivado â la guerra ha terminado.', 'info');
        }
      }
      UI.refresh();
    }
  },
};

// ââ GAME STATE MANAGEMENT âââââââââââââââââââââââââââââââââââââ
const MP_GAME = {
  game: null,      // GameState instance (host only)
  state: null,     // Serialized snapshot (clients + host UI)

  // Host: initialize game when lobby starts
  initGame(lobby) {
    const hostP = lobby.players.find(p => p.peerId === MP.myPeerId);
    if (!hostP || !hostP.countryId) return;

    this.game = new GameState(hostP.countryId);
    this.game.isMP = true;
    // Map of countryId â peerId for all human players
    this.game.playerCountries = {};
    // Per-player treasury so each player manages their own money
    this.game.playerTreasuries = {};
    this.game.playerIncomes = {};
    for (const p of lobby.players) {
      if (p.countryId) {
        this.game.playerCountries[p.countryId] = p.peerId;
        this.game.playerTreasuries[p.countryId] = this.game.countries[p.countryId].economy * 15;
      }
    }
    this.state = this.serialize();
    return this.game;
  },

  // Client: update from host snapshot
  applyState(state) {
    this.state = state;
    if (typeof UI === 'undefined') return;

    const prev          = UI.game;
    const isFirstState  = !prev && !MP.isHost;
    const prevSelected  = (prev && prev.selectedCountryId) || MP.myCountryId;
    const prevActiveTab = (prev && prev.activeTab) || 'economy';

    // Per-player treasury: state.playerTreasuries[myCountryId] overrides global
    const myTreasury = (state.playerTreasuries && state.playerTreasuries[MP.myCountryId]) !== undefined
      ? state.playerTreasuries[MP.myCountryId]
      : (state.treasury || 0);
    const myIncome = (state.playerIncomes && state.playerIncomes[MP.myCountryId]) !== undefined
      ? state.playerIncomes[MP.myCountryId]
      : (state.income || 0);

    // Merge private log (this player's own actions) with public log from host
    const myPrivate = (MP_GAME._myPrivateLog || []).slice(-25);
    const mergedLog = [...(state.log || []), ...myPrivate];

    // Build a game-like proxy so all UI.game.* calls work read-only on clients
    UI.game = Object.assign(Object.create({
      _calcIncome()        { return this.income || 0; },
      getRelation(a, b)    {
        const key = [a, b].sort().join('_');
        return (this.relations && this.relations[key]) || 0;
      },
      canAfford(cost)      { return (this.treasury || 0) >= cost; },
      spend()              {},
      addLog()             {},
      suppressArmedGroup() { return { ok: false, msg: 'AcciÃ³n controlada por el host.' }; },
    }), state, {
      playerCountryId   : MP.myCountryId,
      selectedCountryId : prevSelected,
      activeTab         : prevActiveTab,
      treasury          : myTreasury,
      income            : myIncome,
      log               : mergedLog,
      pendingDeliveries : state.pendingDeliveries || [],
      activeOps         : state.activeOps || [],
      isMP              : true,
    });

    // Sync client-side timer display from host's timer value
    if (typeof state.timerSeconds === 'number') this._startClientTimer(state.timerSeconds);

    // Auto-deactivate radar when no longer at war with any human player
    if (typeof UI !== 'undefined' && UI._mpRadarActive) {
      const myC = state.countries?.[MP.myCountryId];
      const stillAtWar = (myC?.atWar || []).some(eid => state.playerCountries?.[eid]);
      if (!stillAtWar) {
        UI._mpRadarActive = false;
        if (typeof MAP !== 'undefined') {
          MAP.clearAllBlips?.();
          const mc = document.getElementById('map-container');
          if (mc) MAP._syncRadarOverlay(false, mc);
        }
        UI.showToast('ð¡ Radar desactivado â la guerra ha terminado.', 'info');
      }
    }

    UI.refresh();

    if (isFirstState && typeof MAP !== 'undefined') {
      try { MAP.init(); setTimeout(() => MAP.zoomToCountry(MP.myCountryId, 900), 300); } catch(e) {}
    }
  },

  // Client: countdown display (no game logic â purely visual)
  _clientTimerInterval: null,
  _clientTimerSecs: 0,
  _startClientTimer(secs) {
    this._clientTimerSecs = secs;
    if (this._clientTimerInterval) return; // already running, just updated the value
    this._clientTimerInterval = setInterval(() => {
      if (this._clientTimerSecs > 0) this._clientTimerSecs--;
      const el = document.getElementById('hud-timer');
      if (el) {
        const m = Math.floor(this._clientTimerSecs / 60);
        const s = this._clientTimerSecs % 60;
        el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
        el.style.color = this._clientTimerSecs < 60 ? '#ff4444'
          : this._clientTimerSecs < 180 ? '#c9a227' : '';
      }
    }, 1000);
  },

  // Wraps ANIM calls during fn(), returns collected animation queue
  _captureAnim(fn) {
    const queue = [];
    const methods = ['showTroops', 'showPlane', 'showBattle', 'showExplosion', 'showSpy'];
    const orig = {};
    const clean = a => {
      if (typeof a === 'function') return null;
      if (a && typeof a === 'object' && !Array.isArray(a)) {
        const r = {}; for (const k in a) if (typeof a[k] !== 'function') r[k] = a[k]; return r;
      }
      return a;
    };
    if (typeof ANIM !== 'undefined') {
      methods.forEach(m => {
        if (!ANIM[m]) return;
        orig[m] = ANIM[m].bind(ANIM);
        ANIM[m] = (...args) => { queue.push({ method: m, args: args.map(clean) }); orig[m](...args); };
      });
    }
    try { fn(); } catch(e) { console.error('MP exec error:', e); }
    if (typeof ANIM !== 'undefined') methods.forEach(m => { if (orig[m]) ANIM[m] = orig[m]; });
    return queue;
  },

  // Actions that require consent from a player-controlled target country
  _CONSENT_ACTIONS: new Set(['propose_alliance', 'send_aid', 'negotiate', 'trade_deal', 'diplomatic_pressure', 'peace_offer']),

  // Host: run an action on behalf of a player; returns {result, animQueue}
  exec(pid, payload) {
    if (!this.game) return {};
    const p = MP.lobby.players.find(p => p.peerId === pid);
    if (!p || !p.countryId) return {};

    const { cat, id, targetId, params } = payload;

    // Find the action definition
    let action = cat === 'aid' ? null : (ACTIONS[cat] || []).find(a => a.id === id);
    if (!action && cat !== 'aid' && cat !== 'speech') {
      for (const acts of Object.values(ACTIONS)) {
        action = acts.find(a => a.id === id);
        if (action) break;
      }
    }

    // P2P War actions â handled separately with delayed broadcasts
    if (cat === 'mp_war') {
      const result = MP._execMPWar(p.countryId, targetId, id, params, this.game);
      if (!result._skipImmedBcast) this.state = this.serialize();
      return { result, animQueue: [] };
    }

    // MP Technology actions (internal panel â pre-war or in-war)
    if (cat === 'mp_tech') {
      const techLogBefore = (this.game.log || []).length;
      const result = MP._execMPTech(p.countryId, id, params, this.game);
      // addLog uses unshift â new entries are at the START of the array
      const numNewTech = (this.game.log || []).length - techLogBefore;
      const techPrivateLog = numNewTech > 0 ? this.game.log.slice(0, numNewTech) : [];
      techPrivateLog.forEach(e => { if (typeof e === 'object') e._fromPid = p.countryId; });
      this.state = this.serialize();
      return { result, animQueue: [], privateLog: techPrivateLog };
    }

    // Consent check: if target is a human player, ask them first (skip if already approved)
    if (targetId && action && this._CONSENT_ACTIONS.has(id) && !payload.skipConsent) {
      const targetPid = this.game.playerCountries?.[targetId];
      if (targetPid && targetPid !== pid) {
        if (!this.game._p2pRequests) this.game._p2pRequests = {};
        const reqId = `r${Date.now()}`;
        this.game._p2pRequests[reqId] = { fromPid: pid, payload, ts: Date.now() };
        const fromC = this.game.countries[p.countryId];
        const _descMap = {
          propose_alliance : `Propone una alianza formal. Si aceptas, serÃ¡n aliados oficiales.`,
          send_aid         : `Quiere enviarte ayuda. MejorarÃ¡ tus indicadores y relaciones.`,
          negotiate        : `Solicita abrir negociaciones diplomÃ¡ticas contigo.`,
          trade_deal       : `Propone un acuerdo comercial bilateral.`,
          diplomatic_pressure: `Quiere ejercer presiÃ³n diplomÃ¡tica sobre tu paÃ­s.`,
          peace_offer      : `Propone un alto el fuego para poner fin a la guerra.`,
        };
        const reqData = {
          type: 'P2P_REQUEST', reqId,
          fromFlag: fromC?.flag, fromName: fromC?.name,
          actionId: id, actionName: action.name, actionIcon: action.icon,
          actionDesc: _descMap[id] || action.desc || '',
          targetId,
        };
        if (targetPid === MP.myPeerId) {
          // Target is the host â show consent card directly on host's screen
          MP_UI.showConsentRequest(reqData);
        } else {
          MP._sendTo(targetPid, reqData);
        }
        return {
          result: { success: true, pending: true, _icon: 'â³', _name: action.name,
            msg: `Solicitud enviada a ${this.game.countries[targetId]?.name || targetId}. Esperando respuestaâ¦` },
          animQueue: [],
        };
      }
    }

    // Consent check for ally help requests targeting human players
    if (cat === 'ally_help' && id === 'request_ally_help' && targetId && !payload.skipConsent) {
      const allyPid = this.game.playerCountries?.[targetId];
      if (allyPid && allyPid !== pid) {
        if (!this.game._p2pRequests) this.game._p2pRequests = {};
        const reqId = `r${Date.now()}`;
        this.game._p2pRequests[reqId] = { fromPid: pid, payload, ts: Date.now() };
        const fromC = this.game.countries[p.countryId];
        const helpLabels = { economy: 'Ayuda EconÃ³mica', troops: 'Apoyo Militar', weapons: 'EnvÃ­o de Armas', joinwar: 'Entrar en tu Guerra', attackcountry: 'Atacar Objetivo' };
        const helpLabel = helpLabels[params?.helpType] || 'Solicitud de Aliado';
        const helpDescs = {
          economy: `Solicita ayuda econÃ³mica para estabilizar su situaciÃ³n.`,
          troops : `Pide que envÃ­es tropas de apoyo militar.`,
          weapons: `Solicita envÃ­o de armamento y suministros.`,
          joinwar: `Pide que te unas a su guerra como aliado.`,
          attackcountry: `Solicita que ataques un objetivo especÃ­fico.`,
        };
        const reqData = {
          type: 'P2P_REQUEST', reqId,
          fromFlag: fromC?.flag, fromName: fromC?.name,
          actionId: 'request_ally_help', actionName: helpLabel, actionIcon: 'ð¤',
          actionDesc: helpDescs[params?.helpType] || 'Tu aliado solicita apoyo.',
          targetId,
        };
        if (allyPid === MP.myPeerId) {
          MP_UI.showConsentRequest(reqData);
        } else {
          MP._sendTo(allyPid, reqData);
        }
        return {
          result: { success: true, pending: true, _icon: 'â³', _name: helpLabel,
            msg: `Solicitud enviada a ${this.game.countries[targetId]?.name || targetId}. Esperando respuestaâ¦` },
          animQueue: [],
        };
      }
    }

    // Swap in player's own treasury balance
    const pt = this.game.playerTreasuries || {};
    const savedTreasury = this.game.treasury;
    if (pt[p.countryId] !== undefined) this.game.treasury = pt[p.countryId];
    const prevId = this.game.playerCountryId;
    this.game.playerCountryId = p.countryId;

    // Mark log entries added during this action as private (only visible to acting player)
    const _logBefore = (this.game.log || []).length;

    let result = null;
    const animQueue = this._captureAnim(() => {
      if (cat === 'speech' && id === 'suppress_group' && params?.groupId) {
        result = this.game.suppressArmedGroup(params.groupId);
        if (result) { result._icon = 'ð¥'; result._name = 'Suprimir grupo'; }

      } else if (cat === 'aid' && id === 'send_aid' && params?.amount) {
        // Aid sent from modal with specific amount & type
        const { amount, aidType } = params;
        if (!this.game.canAfford(amount)) {
          result = { success: false, msg: `Fondos insuficientes ($${Math.round(this.game.treasury)}B disponibles).`, _icon: 'ð¤²', _name: 'Ayuda' };
        } else {
          const t = this.game.countries[targetId];
          if (!t) { result = { success: false, msg: 'PaÃ­s no encontrado.', _icon: 'â', _name: 'Error' }; }
          else {
            const relGain = Math.round(amount / (aidType === 'military' ? 3 : 2));
            this.game.spend(amount);
            this.game.changeRelation(this.game.playerCountryId, targetId, relGain);
            if (aidType === 'economic') t.economy  = Math.min(100, t.economy  + Math.round(amount / 8));
            else if (aidType === 'military') t.military = Math.min(100, t.military + Math.round(amount / 10));
            else if (aidType === 'medicine') t.stability = Math.min(100, t.stability + Math.round(amount / 5));
            else if (aidType === 'food')    t.stability = Math.min(100, t.stability + Math.round(amount / 6));
            const typeLabel = { economic:'econÃ³mica', military:'militar', medicine:'mÃ©dica', food:'alimentaria' }[aidType] || aidType;
            this.game.addLog(`ð¤² Ayuda ${typeLabel} $${amount}B â ${t.name}. Rel +${relGain}.`, 'success');
            // If receiver is a human player, credit their treasury too
            if (this.game.playerCountries?.[targetId] && this.game.playerTreasuries) {
              this.game.playerTreasuries[targetId] = (this.game.playerTreasuries[targetId] || 0) + amount;
            }
            result = { success: true, _icon: 'ð¤²', _name: 'Ayuda Enviada',
              msg: `Enviaste $${amount}B en ayuda ${typeLabel} a ${t.flag} ${t.name}. Relaciones +${relGain}.` };
          }
        }
      } else if (cat === 'ally_help' && id === 'request_ally_help' && targetId) {
        // Ally help request â targetId is the ally country being asked
        const helpType = params?.helpType;
        const r = this.game.requestAllyHelp(targetId, helpType, { ...params?.options, forced: !!payload.skipConsent });
        const helpLabels = { economy: 'Ayuda EconÃ³mica', troops: 'Apoyo Militar', weapons: 'EnvÃ­o de Armas', joinwar: 'Entrar en Guerra', attackcountry: 'Atacar Objetivo' };
        result = r;
        result._icon = r.accepted ? 'ð¤' : 'â';
        result._name = helpLabels[helpType] || 'Solicitud de Aliado';
        result.success = r.accepted;

      } else if (action) {
        if (!this.game.canAfford(action.cost)) {
          result = { success: false, msg: `Fondos insuficientes. Necesitas $${action.cost}B.`, noSpend: true };
        } else {
          this.game.spend(action.cost);
          // Mark consent approval so actions with random success (alliance, peace) always succeed
          if (payload.skipConsent && this._CONSENT_ACTIONS.has(id)) this.game._p2pForceSuccess = true;
          result = action.execute(this.game, targetId, params);
          delete this.game._p2pForceSuccess;
          if (result && !result.success && result.noSpend) this.game.treasury += action.cost;
          // Init P2P war state when human player declares war on another human player
          if (result?.success && action.id === 'invade' && targetId && this.game.playerCountries?.[targetId] && typeof WAR_MP !== 'undefined') {
            WAR_MP.init(this.game, p.countryId, targetId);
          }
        }
        if (!result) result = { success: false, msg: 'La acciÃ³n no produjo resultado.' };
        result._icon = action.icon;
        result._name = action.name;
      } else {
        result = { success: false, msg: `AcciÃ³n desconocida: ${id}`, _icon: 'â', _name: id };
      }
    });

    // Save back player treasury and restore game state
    if (!this.game.playerTreasuries) this.game.playerTreasuries = {};
    this.game.playerTreasuries[p.countryId] = this.game.treasury;
    this.game.treasury = savedTreasury;
    this.game.playerCountryId = prevId;

    // Mark all new log entries as private (tagged with acting player's country)
    // addLog uses unshift â new entries are at the FRONT of the array
    const numNew = (this.game.log || []).length - _logBefore;
    const newEntries = numNew > 0 ? this.game.log.slice(0, numNew) : [];
    newEntries.forEach(e => { if (typeof e === 'object') e._fromPid = p.countryId; });

    // For diplomatic/military public events, add a GLOBAL log entry (no _fromPid)
    // so all players can see it in their event log
    const PUBLIC_ACTIONS = {
      invade:             (actor, target) => `âï¸ ${actor} declarÃ³ la guerra a ${target}.`,
      propose_alliance:   (actor, target, r) => r?.success ? `ð¤ ${actor} y ${target} forjaron una alianza.` : null,
      break_alliance:     (actor, target) => `ð ${actor} rompiÃ³ la alianza con ${target}.`,
      peace_offer:        (actor, target, r) => r?.success ? `ðï¸ ${actor} y ${target} firmaron la paz.` : null,
      threaten:           (actor, target) => `â ï¸ ${actor} amenazÃ³ a ${target}.`,
      naval_deploy:       (actor, target) => `â ${actor} desplegÃ³ flota cerca de ${target}.`,
      sabotage:           (actor, target, r) => r?.success ? `ð¥ Sabotaje detectado en ${target} por ${actor}.` : null,
    };
    if (result?.success && PUBLIC_ACTIONS[id]) {
      const actor  = this.game.countries[p.countryId];
      const target = targetId && this.game.countries[targetId];
      const actorName  = actor  ? `${actor.flag} ${actor.name}`  : p.countryId;
      const targetName = target ? `${target.flag} ${target.name}` : (targetId || '');
      const msg = PUBLIC_ACTIONS[id](actorName, targetName, result);
      if (msg) this.game.log.unshift({ message: msg, type: 'warning', _public: true });
    }

    this.state = this.serialize();
    return { result, animQueue, privateLog: newEntries };
  },

  // Serialize state for network (host â clients)
  serialize() {
    const g = this.game;
    if (!g) return null;
    return {
      year: g.year, month: g.month, taxRate: g.taxRate,
      treasury: g.treasury, income: g.income,
      globalTension: g.globalTension,
      wars: g.wars ? JSON.parse(JSON.stringify(g.wars)) : [],
      commitments: g.commitments || [],
      countries: JSON.parse(JSON.stringify(g.countries)),
      relations: g.relations || {},
      industries: g.industries || [],
      armedGroups: g.armedGroups || [],
      log: (g.log || []).filter(e => !e._fromPid || e._public).slice(-40),
      playerCountries: g.playerCountries || {},
      playerCountryId: g.playerCountryId,
      playerTreasuries: g.playerTreasuries || {},
      playerIncomes: g.playerIncomes || {},
      gameOver: g.gameOver || false,
      missiles: g.missiles || 0,
      timerSeconds: typeof getTimerSeconds === 'function' ? getTimerSeconds() : 720,
      mpWarData: g.mpWarData ? JSON.parse(JSON.stringify(g.mpWarData)) : {},
    };
  },

  // Get the current view (host uses live game, clients use snapshot)
  view() {
    return (MP.isHost && this.game) ? this.game : this.state;
  },
};

// ââ MULTIPLAYER CHAT UI âââââââââââââââââââââââââââââââââââââââ
const MP_UI = {
  history: {},      // countryId â [msg]
  intercepted: [],  // intercepted private messages
  currentTo: null,

  receive(msg, isIntercept) {
    if (isIntercept) {
      this.intercepted.push({ ...msg, intercepted: true });
      if (typeof UI !== 'undefined') UI.showToast('ðµï¸ Mensaje interceptado Â· ' + msg.from, 'warning');
      // Refresh intercept panel if open
      if (document.getElementById('intercept-panel') && !document.getElementById('intercept-panel').classList.contains('hidden')) {
        this._renderIntercepts();
      }
      return;
    }

    // Normal message: key = the other party
    const key = msg.to === 'all' ? 'all'
              : msg.from === MP.myCountryId ? msg.to
              : msg.from;

    if (!this.history[key]) this.history[key] = [];
    this.history[key].push(msg);

    // Update chat if open
    if (this.currentTo === key) {
      this._renderMessages(key);
    } else {
      const v = MP_GAME.view();
      const c = v && v.countries && v.countries[msg.from];
      const name = c ? (c.flag + ' ' + c.name) : msg.from;
      if (typeof UI !== 'undefined') UI.showToast('ð¬ ' + name + ': ' + msg.text.slice(0, 50), 'info');
    }
  },

  open(toCountryId) {
    const overlay = document.getElementById('mp-chat-overlay');
    if (!overlay) return;
    this.currentTo = toCountryId;
    overlay.classList.remove('hidden');

    const v = MP_GAME.view();
    const c = v && v.countries && v.countries[toCountryId];
    document.getElementById('mp-chat-title').textContent = c ? (c.flag + ' ' + c.name) : toCountryId;
    document.getElementById('mp-chat-overlay').dataset.to = toCountryId;

    this._renderMessages(toCountryId);
    document.getElementById('mp-chat-input').focus();
  },

  close() {
    const el = document.getElementById('mp-chat-overlay');
    if (el) el.classList.add('hidden');
    this.currentTo = null;
  },

  send() {
    const inp = document.getElementById('mp-chat-input');
    const to = document.getElementById('mp-chat-overlay').dataset.to;
    const text = inp.value.trim();
    if (!text || !to) return;
    inp.value = '';
    MP.sendChat(to, text);
  },

  _renderMessages(key) {
    const el = document.getElementById('mp-chat-messages');
    if (!el) return;
    const msgs = this.history[key] || [];
    const v = MP_GAME.view();
    el.innerHTML = msgs.length === 0
      ? '<div style="color:#555;font-size:12px;text-align:center;padding:20px">Sin mensajes aÃºn. Â¡Inicia la diplomacia!</div>'
      : msgs.map(m => {
          const isMe = m.from === MP.myCountryId;
          const c = v && v.countries && v.countries[m.from];
          const name = c ? (c.flag + ' ' + c.name) : m.from;
          return `<div class="mp-msg ${isMe ? 'mp-msg-mine' : 'mp-msg-theirs'}">
            <div class="mp-msg-author">${name}</div>
            <div class="mp-msg-text">${m.text}</div>
          </div>`;
        }).join('');
    el.scrollTop = el.scrollHeight;
  },

  _renderIntercepts() {
    const el = document.getElementById('intercept-list');
    if (!el) return;
    const v = MP_GAME.view();
    el.innerHTML = this.intercepted.length === 0
      ? '<div style="color:#555;font-size:12px;text-align:center;padding:20px">Sin mensajes interceptados.</div>'
      : this.intercepted.map((m, i) => {
          const cf = v && v.countries && v.countries[m.from];
          const ct = v && v.countries && v.countries[m.to];
          const fn = cf ? (cf.flag + ' ' + cf.name) : m.from;
          const tn = ct ? (ct.flag + ' ' + ct.name) : m.to;
          return `<div class="intercept-card">
            <div class="intercept-header">
              <span>ðµï¸ ${fn} â ${tn}</span>
              <button class="intercept-reveal-btn" data-idx="${i}">ð¢ Revelar</button>
            </div>
            <div class="intercept-text">${m.text}</div>
          </div>`;
        }).join('');
    el.querySelectorAll('.intercept-reveal-btn').forEach(btn => {
      btn.addEventListener('click', () => this._reveal(parseInt(btn.dataset.idx)));
    });
  },

  _reveal(idx) {
    const m = this.intercepted[idx];
    if (!m) return;
    const v = MP_GAME.view();
    const cf = v && v.countries && v.countries[m.from];
    const ct = v && v.countries && v.countries[m.to];
    const fn = cf ? cf.name : m.from;
    const tn = ct ? ct.name : m.to;
    MP.sendChat('all', 'ðµï¸ MENSAJE INTERCEPTADO [' + fn + ' â ' + tn + ']: "' + m.text + '"');
    this.intercepted.splice(idx, 1);
    this._renderIntercepts();
  },

  openIntercepts() {
    const p = document.getElementById('intercept-panel');
    if (p) { p.classList.toggle('hidden'); this._renderIntercepts(); }
  },

  // Show a consent request card when another player targets this player's country
  showConsentRequest(req) {
    // Remove any old card for the same request
    const old = document.getElementById('p2p-req-' + req.reqId);
    if (old) old.remove();

    const card = document.createElement('div');
    card.id = 'p2p-req-' + req.reqId;
    card.className = 'p2p-request-card';
    card.innerHTML = `
      <div class="p2p-req-icon">${req.actionIcon || 'ð¨'}</div>
      <div class="p2p-req-title">${req.actionName || 'Solicitud diplomÃ¡tica'}</div>
      <div class="p2p-req-from">${req.fromFlag || ''} <strong>${req.fromName || 'Jugador'}</strong> solicita esto a tu paÃ­s</div>
      ${req.actionDesc ? `<div class="p2p-req-desc">${req.actionDesc}</div>` : ''}
      <div class="p2p-req-btns">
        <button class="p2p-accept-btn">â Aceptar</button>
        <button class="p2p-decline-btn">â Rechazar</button>
      </div>
      <div class="p2p-req-countdown">Responde en <span class="p2p-secs">30</span>s o se rechaza automÃ¡ticamente</div>`;

    card.querySelector('.p2p-accept-btn').addEventListener('click', () => {
      MP._toHost({ type: 'P2P_RESPONSE', reqId: req.reqId, accepted: true });
      card.remove();
      clearInterval(card._timer);
    });
    card.querySelector('.p2p-decline-btn').addEventListener('click', () => {
      MP._toHost({ type: 'P2P_RESPONSE', reqId: req.reqId, accepted: false });
      card.remove();
      clearInterval(card._timer);
    });

    document.body.appendChild(card);

    // Auto-decline after 30 seconds
    let secs = 30;
    card._timer = setInterval(() => {
      secs--;
      const el = card.querySelector('.p2p-secs');
      if (el) el.textContent = secs;
      if (secs <= 0) {
        clearInterval(card._timer);
        MP._toHost({ type: 'P2P_RESPONSE', reqId: req.reqId, accepted: false });
        card.remove();
      }
    }, 1000);
  },
};

// ââ LOBBY UI âââââââââââââââââââââââââââââââââââââââââââââââââ
const LOBBY_UI = {
  refresh(lobby) {
    this._renderPlayers(lobby);
    this._renderCountries(lobby);
    const startBtn = document.getElementById('lobby-start-btn');
    if (startBtn) startBtn.disabled = !MP.isHost || lobby.players.length < 1;
    // Room code
    const codeEl = document.getElementById('lobby-code-display');
    if (codeEl && MP.roomCode) codeEl.textContent = (MP.displayCode || MP.roomCode).slice(0, 20);
    // Player count
    const countEl = document.getElementById('lobby-count');
    if (countEl) countEl.textContent = lobby.players.length;
  },

  onGameStart(lobby) {
    MP.myCountryId = (lobby.players.find(p => p.peerId === MP.myPeerId) || {}).countryId;

    if (MP.isHost) {
      const game = MP_GAME.initGame(lobby);
      UI.game = game;
      game.selectedCountryId = MP.myCountryId;
      MP._bcastState();
    }

    document.getElementById('screen-lobby').classList.remove('active');
    document.getElementById('screen-lobby').style.display = 'none';
    UI.showScreen('screen-game');

    // In MP nobody manually skips the year â time is automatic
    const yearBtn = document.getElementById('btn-end-turn');
    if (yearBtn) yearBtn.style.display = 'none';

    if (typeof MAP !== 'undefined') {
      try { MAP.init(); setTimeout(() => MAP.zoomToCountry(MP.myCountryId, 900), 200); } catch(e) {}
    }

    if (MP.isHost) {
      UI.game.selectedCountryId = MP.myCountryId;
      UI.refresh();
      UI.selectGameCountry(MP.myCountryId);
    }

    // Show MP-only UI elements (e.g., TECNO tab)
    document.querySelectorAll('.mp-only').forEach(el => el.style.display = '');

    if (typeof startMPTimer === 'function') startMPTimer();
  },

  onCountryTaken(cid) {
    if (typeof UI !== 'undefined') UI.showToast('Ese paÃ­s ya fue tomado. Elige otro.', 'warning');
    // Re-render to mark it taken
    this._renderCountries(MP.lobby);
  },

  showError(msg) {
    const el = document.getElementById('lobby-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  },

  _renderPlayers(lobby) {
    const el = document.getElementById('lobby-players');
    if (!el) return;
    el.innerHTML = lobby.players.map((p, i) => {
      const isMe = p.peerId === MP.myPeerId;
      const isHost = i === 0;
      const c = p.countryId && COUNTRIES[p.countryId];
      return `<div class="lobby-player-card ${isMe ? 'me' : ''}">
        <span style="font-size:24px">${c ? c.flag : 'ð'}</span>
        <div style="flex:1">
          <div class="lobby-player-name">${p.name}${isHost ? ' ð' : ''}${isMe ? ' (tÃº)' : ''}</div>
          <div class="lobby-player-country">${c ? c.name : 'Sin paÃ­s elegido'}</div>
        </div>
        <div class="lobby-player-status ${p.countryId ? 'ready' : 'waiting'}">
          ${p.countryId ? 'â' : 'â³'}
        </div>
      </div>`;
    }).join('');
  },

  _renderCountries(lobby) {
    const el = document.getElementById('lobby-country-grid');
    if (!el) return;
    const takenBy = {};
    for (const p of lobby.players) if (p.countryId) takenBy[p.countryId] = p;

    el.innerHTML = Object.entries(COUNTRIES).map(([id, c]) => {
      const owner = takenBy[id];
      const isMe = owner && owner.peerId === MP.myPeerId;
      const isTaken = owner && !isMe;
      return `<div class="lobby-country-card ${isMe ? 'mine' : ''} ${isTaken ? 'taken' : ''}" data-id="${id}">
        <div class="lobby-country-flag">${c.flag}</div>
        <div class="lobby-country-name">${c.name}</div>
        ${isTaken ? `<div class="lobby-taken-badge">${owner.name}</div>` : ''}
        ${isMe ? '<div class="lobby-mine-badge">TÃº</div>' : ''}
      </div>`;
    }).join('');

    el.querySelectorAll('.lobby-country-card:not(.taken)').forEach(card => {
      card.addEventListener('click', () => MP.selectCountry(card.dataset.id));
    });
  },
};
