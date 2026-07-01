// ============================================================
// MAIN.JS - App bootstrap, timer, and event wiring
// ============================================================

(function () {
  'use strict';

  // ── TURN TIMER — 12 minutos = 1 año, 1 min = 1 mes ──────
  let timerInterval   = null;
  let timerSeconds    = 720;   // 12 minutos por año
  let timerPaused     = false;
  let _lastMonthTick  = 720;   // para detectar cada 60s de mes

  const MONTH_NAMES   = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  function startTimer() {
    clearInterval(timerInterval);
    timerSeconds   = 720;
    timerPaused    = false;
    _lastMonthTick = 720;
    if (UI.game) UI.game.month = 0;
    updateTimer();
    timerInterval = setInterval(() => {
      if (timerPaused) return;
      timerSeconds--;
      // Tick mensual cada 60 segundos (todos los 12 meses, incluyendo diciembre)
      if ((_lastMonthTick - timerSeconds) >= 60) {
        _lastMonthTick = timerSeconds;
        if (UI.game && !UI.game.gameOver) {
          // MP host: capture AI animations during monthly tick and broadcast to all clients
          if (typeof MP !== 'undefined' && MP.enabled && MP.isHost) {
            const aiAnimQueue = MP_GAME._captureAnim(() => { UI.game.nextMonth(); });
            // Give each MP client player their monthly income
            if (MP_GAME.game?.playerCountries) {
              const hostId = UI.game.playerCountryId;
              for (const cId of Object.keys(MP_GAME.game.playerCountries)) {
                if (cId === hostId) continue;
                const saved = MP_GAME.game.playerCountryId;
                MP_GAME.game.playerCountryId = cId;
                const annual = MP_GAME.game._calcIncome();
                MP_GAME.game.playerCountryId = saved;
                MP_GAME.game.playerTreasuries = MP_GAME.game.playerTreasuries || {};
                MP_GAME.game.playerTreasuries[cId] = (MP_GAME.game.playerTreasuries[cId] || 0) + Math.round(annual / 12);
              }
            }
            UI.refresh();
            MP._bcastState();
            if (aiAnimQueue.length) MP._bcast({ type: 'ANIM_EVENT', animQueue: aiAnimQueue });
          } else {
            UI.game.nextMonth();
            UI.refresh();
          }
        }
      }
      updateTimer();
      if (timerSeconds <= 0) {
        clearInterval(timerInterval);
        timerInterval = null;
        autoNextTurn();
      }
    }, 1000);
  }

  function pauseTimer(pause = true) {
    timerPaused = pause;
    if (!pause && !timerInterval) startTimer();
  }

  // Pause/resume for press conference
  window.TIMER = { pause: () => pauseTimer(true), resume: () => pauseTimer(false) };

  let _lastTickSfx = 0;

  function updateTimer() {
    const el = document.getElementById('hud-timer');
    if (!el) return;
    const m = Math.floor(timerSeconds / 60).toString().padStart(2, '0');
    const s = (timerSeconds % 60).toString().padStart(2, '0');
    el.textContent = `${m}:${s}`;
    el.className = 'hud-value ' + (timerSeconds < 60 ? 'red blink' : timerSeconds < 180 ? 'gold' : 'green');
    if (UI.game) {
      const mEl = document.getElementById('hud-month');
      if (mEl) mEl.textContent = MONTH_NAMES[UI.game.month] || '';
    }
    // Tick sounds for the last 30 seconds
    if (typeof SFX !== 'undefined' && timerSeconds > 0 && timerSeconds <= 30) {
      const now = Date.now();
      if (now - _lastTickSfx > 900) {
        _lastTickSfx = now;
        timerSeconds <= 10 ? SFX.tickUrgent() : SFX.tick();
      }
    }
  }

  function autoNextTurn() {
    if (!UI.game || UI.game.gameOver) return;
    doNextTurn(() => startTimer());
  }

  function doNextTurn(callback) {
    const nextYear = UI.game.year + 1;
    timerPaused = false;
    clearInterval(timerInterval);
    timerInterval = null;
    UI.showYearTransition(nextYear, () => {
      UI.game.nextTurn();
      const mpBcast = () => {
        if (typeof MP !== 'undefined' && MP.enabled && MP.isHost) MP._bcastState();
      };
      // Leader quip every ~3 turns
      if (UI.game.turn % 3 === 0 && typeof UI.showLeaderQuip === 'function') {
        setTimeout(() => UI.showLeaderQuip(), 1200);
      }

      if (UI.game._pendingEvent) {
        const e = UI.game._pendingEvent;
        UI.game._pendingEvent = null;
        const choices = (e.choices || []).map(ch => ({
          label: ch.label,
          effect: (state) => ch.effect(state),
        }));
        UI.refresh();
        mpBcast();
        setTimeout(() => {
          UI.showEventModal({ ...e, choices });
          if (callback) callback();
        }, 80);
      } else {
        UI.refresh();
        mpBcast();
        if (callback) callback();
      }
    });
  }

  // ── TITLE SCREEN ─────────────────────────────────────────
  document.getElementById('btn-start').addEventListener('click', () => {
    UI.renderCountrySelect();
    UI.showScreen('screen-select');
  });

  document.getElementById('btn-multiplayer').addEventListener('click', () => {
    document.getElementById('mp-create-overlay').classList.remove('hidden');
    document.getElementById('mp-create-name').focus();
  });

  // ── COUNTRY SELECT ────────────────────────────────────────
  document.getElementById('btn-close-detail').addEventListener('click', () => {
    document.getElementById('country-detail').classList.add('hidden');
    document.querySelectorAll('.country-card').forEach(c => c.classList.remove('selected'));
  });

  document.getElementById('btn-choose').addEventListener('click', e => {
    const id = e.currentTarget.dataset.id;
    if (id) startGame(id);
  });

  // ── CATEGORY TOGGLE (INTERIOR / EXTERIOR) ────────────────
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!UI.game) return;
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cat = btn.dataset.cat;
      const internalTabs = document.getElementById('internal-tabs');
      const externalTabs = document.getElementById('external-tabs');
      if (cat === 'internal') {
        internalTabs.classList.remove('hidden');
        externalTabs.classList.add('hidden');
        const first = internalTabs.querySelector('.tab-btn');
        internalTabs.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
        first.classList.add('active');
        UI.game.activeTab = first.dataset.tab;
      } else {
        internalTabs.classList.add('hidden');
        externalTabs.classList.remove('hidden');
        const first = externalTabs.querySelector('.tab-btn');
        externalTabs.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
        first.classList.add('active');
        UI.game.activeTab = first.dataset.tab;
      }
      UI.renderActionList();
    });
  });

  // ── INTERNAL TABS ────────────────────────────────────────
  document.getElementById('internal-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    document.querySelectorAll('#internal-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (UI.game) { UI.game.activeTab = btn.dataset.tab; UI.renderActionList(); }
  });

  // ── EXTERNAL TABS ────────────────────────────────────────
  document.getElementById('external-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    document.querySelectorAll('#external-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (UI.game) { UI.game.activeTab = btn.dataset.tab; UI.renderActionList(); }
  });

  // ── MAP ZOOM CONTROLS ─────────────────────────────────────
  document.getElementById('btn-zoom-in').addEventListener('click',    () => MAP.zoomIn());
  document.getElementById('btn-zoom-out').addEventListener('click',   () => MAP.zoomOut());
  document.getElementById('btn-zoom-reset').addEventListener('click', () => MAP.resetZoom());

  // ── END TURN (manual year skip — local mode only) ────────
  document.getElementById('btn-end-turn').addEventListener('click', () => {
    if (typeof MP !== 'undefined' && MP.enabled) return; // MP: host auto-advances
    if (!UI.game || UI.game.gameOver) return;
    doNextTurn(() => startTimer());
  });

  // ── MODAL CLOSE ───────────────────────────────────────────
  document.getElementById('modal-close').addEventListener('click', () => {
    UI.closeModal(); UI.refresh();
  });
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target !== document.getElementById('modal-overlay')) return;
    if (!document.getElementById('modal-choices').children.length) {
      UI.closeModal(); UI.refresh();
    }
  });

  // ── SPEECH MODAL ──────────────────────────────────────────
  document.getElementById('speech-close-btn').addEventListener('click', () => {
    UI.closeSpeechModal();
  });
  document.getElementById('speech-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('speech-overlay')) UI.closeSpeechModal();
  });

  // ── DEBATE MODAL ──────────────────────────────────────────
  document.getElementById('debate-close').addEventListener('click', () => DEBATE_UI.close());
  document.getElementById('debate-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('debate-overlay')) DEBATE_UI.close();
  });
  document.getElementById('debate-send').addEventListener('click', () => DEBATE_UI.sendMessage());
  document.getElementById('debate-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); DEBATE_UI.sendMessage(); }
  });
  document.querySelectorAll('.treaty-btn').forEach(btn => {
    btn.addEventListener('click', () => DEBATE_UI.proposeTreaty(btn.dataset.type));
  });
  document.getElementById('debate-finalize-btn').addEventListener('click', () => DEBATE_UI.finalize());

  // ── RESTART ───────────────────────────────────────────────
  document.getElementById('btn-restart').addEventListener('click', () => {
    clearInterval(timerInterval);
    POLITICS.reset();
    document.getElementById('gameover-overlay').classList.add('hidden');
    UI.game = null;
    if (MP.enabled) {
      MP.enabled = false;
      document.getElementById('screen-lobby').style.display = 'none';
    }
    UI.renderCountrySelect();
    UI.showScreen('screen-select');
  });

  // ── WINDOW RESIZE ─────────────────────────────────────────
  window.addEventListener('resize', () => { if (MAP.initialized) MAP.resize(); });

  // ── LOCAL GAME START ──────────────────────────────────────
  function startGame(countryId) {
    POLITICS.reset();
    UI.game = new GameState(countryId);
    UI._prevTreasury = Math.round(UI.game.treasury);
    UI._objectives = null;
    UI._objDoneState = {};
    UI._mpRadarActive = false;
    UI._mpIncomingAttacks = [];
    if (typeof MAP !== 'undefined' && MAP.clearAllBlips) MAP.clearAllBlips();
    UI.showScreen('screen-game');

    try {
      MAP.init();
      setTimeout(() => MAP.zoomToCountry(countryId, 900), 200);
    } catch (err) {
      console.error('Map error:', err);
      document.getElementById('map-loading').innerHTML =
        '<span style="color:#d94f4f">⚠ Error al cargar el mapa</span>';
    }

    UI.game.selectedCountryId = countryId;
    UI.refresh();
    UI.selectGameCountry(countryId);
    UI.game.addLog(`Partida iniciada. Liderando ${UI.game.countries[countryId].name}. ¡Suerte!`, 'success');
    UI.renderLog();
    startTimer();
  }

  // ── MP TIMER (host drives ticks, clients follow state) ────
  window.getTimerSeconds = () => timerSeconds;  // for MP state serialization

  window.startMPTimer = function () {
    if (!MP.isHost) return; // clients get updates via state broadcast
    startTimer();
  };

  // ── MP: CREATE ROOM ───────────────────────────────────────
  document.getElementById('mp-create-confirm').addEventListener('click', async () => {
    const name = document.getElementById('mp-create-name').value.trim() || 'Jugador';
    const errEl = document.getElementById('mp-create-error');
    errEl.style.display = 'none';
    document.getElementById('mp-create-confirm').disabled = true;
    try {
      await MP.createRoom(name);
      MP.enabled = true;
      document.getElementById('mp-create-overlay').classList.add('hidden');
      document.getElementById('mp-create-confirm').disabled = false;
      // Show lobby
      const lobbyEl = document.getElementById('screen-lobby');
      lobbyEl.style.display = 'flex';
      document.querySelectorAll('.screen.active').forEach(s => s.classList.remove('active'));
      lobbyEl.classList.add('active');
      // Show join link hint
      LOBBY_UI.refresh(MP.lobby);
    } catch(e) {
      document.getElementById('mp-create-confirm').disabled = false;
      errEl.textContent = 'Error al crear sala: ' + e.message;
      errEl.style.display = 'block';
    }
  });
  document.getElementById('mp-create-cancel').addEventListener('click', () => {
    document.getElementById('mp-create-overlay').classList.add('hidden');
  });

  // ── MP: JOIN MODAL OPEN ───────────────────────────────────
  // Expose via link: ?join=CODE
  (function checkJoinParam() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('join');
    if (code) {
      document.getElementById('mp-join-code').value = code;
      document.getElementById('mp-join-overlay').classList.remove('hidden');
    }
  })();

  document.getElementById('mp-join-confirm').addEventListener('click', async () => {
    const name = document.getElementById('mp-join-name').value.trim() || 'Jugador';
    const code = document.getElementById('mp-join-code').value.trim();
    const errEl = document.getElementById('mp-join-error');
    errEl.style.display = 'none';
    if (!code) { errEl.textContent = 'Ingresa el código de sala.'; errEl.style.display = 'block'; return; }
    const joinBtn = document.getElementById('mp-join-confirm');
    joinBtn.disabled = true;
    joinBtn.textContent = '📡 Conectando…';
    try {
      await MP.joinRoom(code, name);
      MP.enabled = true;
      document.getElementById('mp-join-overlay').classList.add('hidden');
      joinBtn.disabled = false;
      joinBtn.textContent = 'Unirse';
      const lobbyEl = document.getElementById('screen-lobby');
      lobbyEl.style.display = 'flex';
      document.querySelectorAll('.screen.active').forEach(s => s.classList.remove('active'));
      lobbyEl.classList.add('active');
    } catch(e) {
      joinBtn.disabled = false;
      joinBtn.textContent = 'Unirse';
      errEl.textContent = e.message || 'Error de conexión';
      errEl.style.display = 'block';
    }
  });
  document.getElementById('mp-join-cancel').addEventListener('click', () => {
    document.getElementById('mp-join-overlay').classList.add('hidden');
  });

  // ── LOBBY CONTROLS ────────────────────────────────────────
  document.getElementById('lobby-copy-btn').addEventListener('click', () => {
    // Build join URL
    const url = window.location.href.split('?')[0] + '?join=' + encodeURIComponent(MP.displayCode || MP.roomCode);
    navigator.clipboard.writeText(url).then(() => {
      UI.showToast('¡Link copiado! Compártelo con tus amigos.', 'success');
    }).catch(() => {
      // Fallback: copy just the code
      navigator.clipboard.writeText(MP.displayCode || MP.roomCode);
      UI.showToast('Código copiado: ' + (MP.displayCode || MP.roomCode), 'success');
    });
  });

  document.getElementById('lobby-start-btn').addEventListener('click', () => {
    if (!MP.isHost) return;
    if (!MP.myCountryId) { LOBBY_UI.showError('Debes elegir un país primero.'); return; }
    MP.startGame();
  });

  document.getElementById('lobby-back-btn').addEventListener('click', () => {
    if (MP._mqtt) { try { MP._mqtt.end(true); } catch(_) {} MP._mqtt = null; }
    MP.enabled = false;
    document.getElementById('screen-lobby').style.display = 'none';
    document.querySelectorAll('.screen.active').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-title').classList.add('active');
  });

  // Show "Join" modal button from title (for players who receive a link)
  // Already handled via URL param above. Also add a manual "join" button:
  (function addJoinBtn() {
    const mpBtn = document.getElementById('btn-multiplayer');
    mpBtn.insertAdjacentHTML('afterend', '<button id="btn-join-mp" class="btn-secondary btn-xl" style="margin-top:0">🔗 UNIRSE A SALA</button>');
    document.getElementById('btn-join-mp').addEventListener('click', () => {
      document.getElementById('mp-join-overlay').classList.remove('hidden');
      document.getElementById('mp-join-name').focus();
    });
  })();

  // ── MP CHAT CONTROLS ─────────────────────────────────────
  document.getElementById('mp-chat-close').addEventListener('click', () => MP_UI.close());
  document.getElementById('mp-chat-send').addEventListener('click', () => MP_UI.send());
  document.getElementById('mp-chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); MP_UI.send(); }
  });
  document.getElementById('mp-intercept-btn').addEventListener('click', () => MP_UI.openIntercepts());
  document.getElementById('intercept-close').addEventListener('click', () => {
    document.getElementById('intercept-panel').classList.add('hidden');
  });

  // ── AID MODAL ────────────────────────────────────────────
  let _aidTargetId = null;
  let _aidType = 'economic';

  window.openAidModal = function(targetId) {
    _aidTargetId = targetId;
    _aidType = 'economic';
    const g = UI.game;
    if (!g) return;
    const t = g.countries[targetId];
    document.getElementById('aid-target-info').textContent = 'Destino: ' + (t ? t.flag + ' ' + t.name : targetId);
    document.getElementById('aid-amount').value = 40;
    document.getElementById('aid-amount-label').textContent = '$40B';
    document.querySelectorAll('.aid-type-card').forEach(c => c.classList.toggle('selected', c.dataset.type === 'economic'));
    _updateAidPreview();
    document.getElementById('aid-overlay').classList.remove('hidden');
  };

  function _updateAidPreview() {
    const amount = parseInt(document.getElementById('aid-amount').value);
    const previews = {
      economic: `💰 Economía del país +${Math.round(amount/8)} · Relaciones +${Math.round(amount/2)}`,
      military: `⚔️ Ejército del país +${Math.round(amount/10)} · Relaciones +${Math.round(amount/3)}`,
      medicine: `💊 Estabilidad +${Math.round(amount/5)} · Relaciones +${Math.round(amount/3)}`,
      food:     `🌾 Estabilidad +${Math.round(amount/6)} · Relaciones +${Math.round(amount/2.5)}`,
    };
    document.getElementById('aid-preview').textContent = previews[_aidType] || '';
  }

  document.getElementById('aid-amount').addEventListener('input', function() {
    document.getElementById('aid-amount-label').textContent = '$' + this.value + 'B';
    _updateAidPreview();
  });
  document.querySelectorAll('.aid-type-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.aid-type-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      _aidType = card.dataset.type;
      _updateAidPreview();
    });
  });
  document.getElementById('aid-confirm').addEventListener('click', () => {
    const g = UI.game;
    if (!g || !_aidTargetId) return;
    const amount = parseInt(document.getElementById('aid-amount').value);
    if (!g.canAfford(amount)) { UI.showToast('Fondos insuficientes.', 'warning'); return; }

    // MP client: route through the authoritative host
    if (typeof MP !== 'undefined' && MP.enabled && !MP.isHost) {
      document.getElementById('aid-overlay').classList.add('hidden');
      MP.sendAction({ cat: 'aid', id: 'send_aid', targetId: _aidTargetId, params: { aidType: _aidType, amount } });
      return;
    }

    const t = g.countries[_aidTargetId];
    const relGain = Math.round(amount / (_aidType === 'military' ? 3 : 2));
    g.spend(amount);
    g.changeRelation(g.playerCountryId, _aidTargetId, relGain);

    if (_aidType === 'economic') t.economy = Math.min(100, t.economy + Math.round(amount / 8));
    else if (_aidType === 'military') t.military = Math.min(100, t.military + Math.round(amount / 10));
    else if (_aidType === 'medicine') t.stability = Math.min(100, t.stability + Math.round(amount / 5));
    else if (_aidType === 'food')    { t.stability = Math.min(100, t.stability + Math.round(amount / 6)); }

    // MP host: also credit receiver's treasury if they're a human player
    if (typeof MP !== 'undefined' && MP.enabled && MP.isHost && MP_GAME?.game?.playerCountries?.[_aidTargetId]) {
      MP_GAME.game.playerTreasuries[_aidTargetId] = (MP_GAME.game.playerTreasuries[_aidTargetId] || 0) + amount;
    }

    const typeLabel = { economic: 'económica', military: 'militar', medicine: 'médica', food: 'alimentaria' }[_aidType];
    g.addLog(`🤲 Ayuda ${typeLabel} de $${amount}B enviada a ${t.name}. Relaciones +${relGain}.`, 'success');
    document.getElementById('aid-overlay').classList.add('hidden');
    UI.showModal({ icon: '🤲', title: 'Ayuda Enviada', body: `Has enviado $${amount}B en ayuda ${typeLabel} a ${t.flag} ${t.name}.\nRelaciones +${relGain}.`, choices: [] });
    UI.refresh();
    if (typeof MP !== 'undefined' && MP.enabled && MP.isHost) MP._bcastState();
  });
  document.getElementById('aid-cancel').addEventListener('click', () => {
    document.getElementById('aid-overlay').classList.add('hidden');
  });

  // ── SOUND BUTTON IN HUD ───────────────────────────────────
  (function injectSoundBtn() {
    const hud = document.getElementById('hud');
    if (!hud) return;
    const btn = document.createElement('button');
    btn.id = 'hud-sfx-btn';
    btn.className = 'hud-sfx-btn';
    btn.title = 'Sonido On/Off';
    btn.textContent = typeof SFX !== 'undefined' && SFX.enabled ? '🔊' : '🔇';
    btn.addEventListener('click', () => {
      if (typeof SFX === 'undefined') return;
      const on = SFX.toggle();
      btn.textContent = on ? '🔊' : '🔇';
    });
    hud.appendChild(btn);
  })();

  // ── KEYBOARD SHORTCUTS ─────────────────────────────────────
  document.addEventListener('keydown', e => {
    // Don't intercept when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    if (!UI.game || UI.game.gameOver) return;

    const g = UI.game;
    const internalTabKeys = { '1': 'economy', '2': 'internal', '3': 'speech', '4': 'opponents', '5': 'intelligence', '6': 'commitments', '7': 'industries' };
    const externalTabKeys = { 'q': 'diplomacy', 'w': 'military', 'e': 'espionage', 'r': 'recon' };

    switch (e.key) {
      case 'Escape': {
        // Close modal, deselect country, or switch to internal view
        const modal = document.getElementById('modal-overlay');
        if (modal && !modal.classList.contains('hidden')) { UI.closeModal(); return; }
        const extTabs = document.getElementById('external-tabs');
        if (extTabs && !extTabs.classList.contains('hidden')) {
          document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
          document.querySelector('.cat-btn[data-cat="internal"]')?.classList.add('active');
          document.getElementById('internal-tabs')?.classList.remove('hidden');
          extTabs.classList.add('hidden');
          g.activeTab = 'economy';
          document.querySelectorAll('#internal-tabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'economy'));
          UI.renderActionList();
        }
        break;
      }
      case ' ': {
        e.preventDefault();
        // End turn (single player only)
        if (typeof MP === 'undefined' || !MP.enabled) {
          document.getElementById('btn-end-turn')?.click();
        }
        break;
      }
      case 'Tab': {
        e.preventDefault();
        // Toggle interior/exterior panel
        const isTabs = document.getElementById('internal-tabs');
        if (isTabs && !isTabs.classList.contains('hidden')) {
          document.querySelector('.cat-btn[data-cat="external"]')?.click();
        } else {
          document.querySelector('.cat-btn[data-cat="internal"]')?.click();
        }
        if (typeof SFX !== 'undefined') SFX.tab();
        break;
      }
      case 'z': case 'Z': MAP?.zoomIn?.(); break;
      case 'x': case 'X': MAP?.zoomOut?.(); break;
      case 'c': case 'C': MAP?.zoomToCountry?.(g.playerCountryId, 600); break;
      default: {
        // Number keys 1-7: internal tabs
        if (internalTabKeys[e.key]) {
          const tab = internalTabKeys[e.key];
          // Switch to internal view if needed
          const intTabs = document.getElementById('internal-tabs');
          if (intTabs?.classList.contains('hidden')) {
            document.querySelector('.cat-btn[data-cat="internal"]')?.click();
          }
          document.querySelectorAll('#internal-tabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
          g.activeTab = tab;
          UI.renderActionList();
          if (typeof SFX !== 'undefined') SFX.tab();
        }
        // Q W E R: external tabs (when exterior panel open)
        if (externalTabKeys[e.key]) {
          const extTabs = document.getElementById('external-tabs');
          if (extTabs && !extTabs.classList.contains('hidden')) {
            const tab = externalTabKeys[e.key];
            document.querySelectorAll('#external-tabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
            g.activeTab = tab;
            UI.renderActionList();
            if (typeof SFX !== 'undefined') SFX.tab();
          }
        }
      }
    }
  });

  // ── BUTTON CLICK SOUNDS ───────────────────────────────────
  document.addEventListener('click', e => {
    if (typeof SFX === 'undefined') return;
    const btn = e.target.closest('button, .btn-action, .tab-btn, .cat-btn, .country-card');
    if (!btn) return;
    if (btn.id === 'hud-sfx-btn') return; // handled separately
    SFX.click();
  });

  // ── POWER RANKINGS WIDGET ─────────────────────────────────
  window._updatePowerRankings = function() {
    const el = document.getElementById('power-rankings');
    if (!el || !UI.game) return;
    const g = UI.game;
    const countries = Object.entries(g.countries)
      .filter(([, c]) => !c.conquered)
      .map(([id, c]) => ({ id, c, power: Math.round(c.military * 1.5 + c.economy + c.stability * 0.3) }))
      .sort((a, b) => b.power - a.power);

    const top5 = countries.slice(0, 5);
    const myIdx = countries.findIndex(r => r.id === g.playerCountryId);

    el.innerHTML = top5.map((r, i) => {
      const isMe = r.id === g.playerCountryId;
      const atWar = (g.countries[g.playerCountryId]?.atWar || []).includes(r.id);
      const isAlly = (g.countries[g.playerCountryId]?.allies || []).includes(r.id);
      const badge = atWar ? '⚔️' : isAlly ? '🤝' : '';
      return `<div class="pr-row${isMe ? ' pr-me' : ''}">
        <span class="pr-rank">#${i + 1}</span>
        <span class="pr-flag">${r.c.flag}</span>
        <span class="pr-name">${r.c.name}</span>
        <span class="pr-badge">${badge}</span>
        <span class="pr-score">${r.power}</span>
      </div>`;
    }).join('') + (myIdx >= 5 ? `<div class="pr-row pr-me pr-sep">
        <span class="pr-rank">#${myIdx + 1}</span>
        <span class="pr-flag">${g.countries[g.playerCountryId]?.flag || ''}</span>
        <span class="pr-name">${g.countries[g.playerCountryId]?.name || ''}</span>
        <span class="pr-badge"></span>
        <span class="pr-score">${countries[myIdx]?.power || 0}</span>
      </div>` : '');
  };

  // Inject rankings widget into right panel
  (function injectRankings() {
    const rightPanel = document.getElementById('right-panel');
    if (!rightPanel) return;
    const widget = document.createElement('div');
    widget.id = 'power-rankings-widget';
    widget.innerHTML = `
      <div class="pr-header" id="pr-toggle">
        ⚡ POTENCIAS MUNDIALES
        <span id="pr-chevron">▲</span>
      </div>
      <div id="power-rankings"></div>`;
    rightPanel.insertBefore(widget, rightPanel.firstChild);

    let collapsed = false;
    document.getElementById('pr-toggle')?.addEventListener('click', () => {
      collapsed = !collapsed;
      const prEl = document.getElementById('power-rankings');
      if (prEl) prEl.style.display = collapsed ? 'none' : '';
      const ch = document.getElementById('pr-chevron');
      if (ch) ch.textContent = collapsed ? '▼' : '▲';
      if (typeof SFX !== 'undefined') SFX.click();
    });
  })();

  // Update rankings on each UI refresh — hook into UI.refresh
  const _origRefresh = UI.refresh.bind(UI);
  UI.refresh = function() {
    _origRefresh();
    window._updatePowerRankings?.();
  };

  // ── MESSENGER-STYLE DIAGONAL CURTAIN TRANSITION ───────────
  // Plays a diagonal wipe over screen changes; DOM switch is synchronous.
  (function initCurtain() {
    const curtain = document.getElementById('screen-curtain');
    if (!curtain) return;

    const _origShow = UI.showScreen.bind(UI);
    UI.showScreen = function(screenId) {
      const current = document.querySelector('.screen.active');
      if (current && current.id === screenId) { _origShow(screenId); return; }

      // Phase 1: curtain slides IN (covers screen)
      curtain.classList.remove('curtain-entering', 'curtain-exiting');
      void curtain.offsetWidth;
      curtain.classList.add('curtain-entering');
      if (typeof SFX !== 'undefined') SFX.tab();

      // Switch screen immediately under the curtain (keeps all sync code working)
      _origShow(screenId);

      // Phase 2: slide curtain OUT to reveal new screen after it covers
      setTimeout(() => {
        curtain.classList.remove('curtain-entering');
        curtain.classList.add('curtain-exiting');
        setTimeout(() => curtain.classList.remove('curtain-exiting'), 500);
      }, 420);
    };
  })();

  // ── OBJECTIVES PANEL TOGGLE ───────────────────────────────
  document.getElementById('obj-toggle-btn')?.addEventListener('click', () => {
    const panel = document.getElementById('objectives-panel');
    const btn   = document.getElementById('obj-toggle-btn');
    if (!panel) return;
    panel.classList.toggle('collapsed');
    btn.textContent = panel.classList.contains('collapsed') ? '+' : '−';
  });

  // ── GAME BACKGROUND PARTICLES ─────────────────────────────
  // Spawns subtle floating dots (like Messenger's debris field)
  (function initParticles() {
    const container = document.getElementById('game-particles');
    if (!container) return;

    const COUNT = 18;
    for (let i = 0; i < COUNT; i++) {
      const p = document.createElement('div');
      p.className = 'gp';
      const size = 3 + Math.random() * 6;
      const left = Math.random() * 100;
      const dur  = 20 + Math.random() * 30;
      const delay = -(Math.random() * dur);
      p.style.cssText = `width:${size}px;height:${size}px;left:${left}%;bottom:-10px;animation-duration:${dur}s;animation-delay:${delay}s;opacity:0`;
      container.appendChild(p);
    }
  })();

})();
