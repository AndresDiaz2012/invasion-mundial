// ============================================================
// NEGOTIATION.JS — Treaty, Trade & Loan system
// P2P negotiation between human players via MQTT
// ============================================================

const NEG = {
  _treaty: null,   // active treaty negotiation state
  _trade:  null,   // active trade session state
  _loan:   null,   // active loan proposal state

  // ── LABELS ────────────────────────────────────────────────
  OBTAINED_LABELS: {
    alliance:     '🤝 Alianza Formal',
    economic_aid: '💰 Ayuda Económica',
    military_aid: '⚔️ Apoyo Militar',
    protection:   '🛡️ Protección en Guerra',
    trade_deal:   '📦 Acuerdo Comercial',
    peace:        '🕊️ Paz / No Agresión',
    custom:       '✏️ Acuerdo personalizado',
  },

  // ─────────────────────────────────────────────────────────
  // TREATY
  // ─────────────────────────────────────────────────────────

  openTreaty(targetCountryId) {
    const g = UI.game;
    const me = g.countries[g.playerCountryId];
    const them = g.countries[targetCountryId];
    if (!me || !them) return;

    this._treaty = { targetId: targetCountryId, mode: 'editor', mySign: false, theirSign: false };
    document.getElementById('treaty-editor').classList.remove('hidden');
    document.getElementById('treaty-viewer').classList.add('hidden');
    document.getElementById('treaty-signing').classList.add('hidden');

    // Seals & parties
    document.getElementById('treaty-seal-a').textContent = me.flag   || '🔴';
    document.getElementById('treaty-seal-b').textContent = them.flag || '🔵';
    document.getElementById('treaty-parties').textContent =
      `${me.flag} ${me.name}  ✦  ${them.flag} ${them.name}`;

    // Reset form
    document.getElementById('treaty-obtained').value = '';
    document.getElementById('treaty-obtained-desc').value = '';
    document.getElementById('commit-who-1').value = 'me';
    document.getElementById('commit-text-1').value = '';
    document.getElementById('commit-row-2').style.display = 'none';
    document.getElementById('commit-text-2').value = '';
    document.getElementById('treaty-deadline').value = '';
    document.getElementById('treaty-penalty-row').style.display = 'none';
    document.getElementById('treaty-penalty').value = '';

    document.getElementById('treaty-overlay').classList.remove('hidden');
    this._wireTreatyEditor(targetCountryId);
  },

  _wireTreatyEditor(targetCountryId) {
    // Second commitment row toggle
    const addBtn = document.getElementById('treaty-add-commit-btn');
    if (addBtn) {
      addBtn.onclick = () => {
        const row2 = document.getElementById('commit-row-2');
        row2.style.display = row2.style.display === 'none' ? 'flex' : 'none';
      };
    }

    // Penalty row toggle
    const deadlineInput = document.getElementById('treaty-deadline');
    if (deadlineInput) {
      deadlineInput.oninput = () => {
        const penRow = document.getElementById('treaty-penalty-row');
        penRow.style.display = deadlineInput.value ? 'block' : 'none';
      };
    }

    document.getElementById('treaty-cancel').onclick = () => this.closeTreaty();
    document.getElementById('treaty-propose').onclick = () => this._proposeTreaty(targetCountryId);
  },

  _proposeTreaty(targetCountryId) {
    const obtained    = document.getElementById('treaty-obtained').value;
    const obtainedDesc = document.getElementById('treaty-obtained-desc').value.trim();
    if (!obtained) { alert('Debes seleccionar qué se obtiene con el tratado.'); return; }

    const commitments = [];
    const w1 = document.getElementById('commit-who-1').value;
    const t1 = document.getElementById('commit-text-1').value.trim();
    if (t1) commitments.push({ who: w1, text: t1 });

    const row2vis = document.getElementById('commit-row-2').style.display !== 'none';
    if (row2vis) {
      const w2 = document.getElementById('commit-who-2').value;
      const t2 = document.getElementById('commit-text-2').value.trim();
      if (t2) commitments.push({ who: w2, text: t2 });
    }

    const deadline = parseInt(document.getElementById('treaty-deadline').value) || null;
    const penalty  = deadline ? (document.getElementById('treaty-penalty').value.trim() || null) : null;

    const g = UI.game;
    const me = g.countries[g.playerCountryId];
    const them = g.countries[targetCountryId];

    const terms = { obtained, obtainedDesc, commitments, deadline, penalty };
    const id = 'treaty_' + Date.now();
    this._treaty = { id, targetId: targetCountryId, terms, mode: 'awaiting', mySign: false, theirSign: false };

    // Dispatch via MP
    if (typeof MP !== 'undefined' && MP.enabled) {
      MP._toHost({
        type: 'NEG_TREATY',
        sub: 'propose',
        id,
        targetId: targetCountryId,
        fromId: g.playerCountryId,
        fromFlag: me.flag, fromName: me.name,
        toFlag: them.flag, toName: them.name,
        terms,
      });
    }

    // Show awaiting state
    document.getElementById('treaty-propose').textContent = '⏳ Esperando respuesta…';
    document.getElementById('treaty-propose').disabled = true;
    if (typeof UI !== 'undefined') UI.showToast('📜 Tratado enviado. Esperando firma del otro país.', 'info');
  },

  receiveTreaty(data) {
    const { id, fromId, fromFlag, fromName, toFlag, toName, terms } = data;
    this._treaty = { id, targetId: fromId, terms, mode: 'receiver', mySign: false, theirSign: false };

    const g = UI.game;
    const me = g.countries[g.playerCountryId];
    document.getElementById('treaty-seal-a').textContent = fromFlag || '🔴';
    document.getElementById('treaty-seal-b').textContent = me.flag   || '🔵';
    document.getElementById('treaty-parties').textContent =
      `${fromFlag} ${fromName}  ✦  ${me.flag} ${me.name}`;

    document.getElementById('treaty-editor').classList.add('hidden');
    document.getElementById('treaty-signing').classList.add('hidden');
    document.getElementById('treaty-viewer').classList.remove('hidden');
    this._renderTreatyView(terms, fromFlag, fromName);

    document.getElementById('treaty-reject').onclick  = () => {
      this._rejectTreaty(id, fromId);
    };
    document.getElementById('treaty-counter').onclick = () => {
      this.openTreaty(fromId); // Re-open editor targeting the original proposer
    };
    document.getElementById('treaty-sign').onclick    = () => {
      this._signTreaty(id, fromId);
    };

    document.getElementById('treaty-overlay').classList.remove('hidden');
    if (typeof UI !== 'undefined') UI.showToast('📜 ¡Tratado recibido! Revisa y firma o rechaza.', 'warning');
  },

  _renderTreatyView(terms, fromFlag, fromName) {
    const whoLabels = { me: fromFlag + ' ' + fromName, them: '(tú)', both: 'Ambos países' };
    const commitHTML = (terms.commitments || []).map(c =>
      `<div class="treaty-view-field">
        <div class="treaty-view-label">Compromiso de ${c.who === 'me' ? fromName : c.who === 'both' ? 'ambos' : 'tu país'}</div>
        <div class="treaty-view-val">${c.text}</div>
      </div>`
    ).join('');

    document.getElementById('treaty-view-content').innerHTML = `
      <div class="treaty-view-field">
        <div class="treaty-view-label">Lo que se obtiene</div>
        <div class="treaty-view-val"><strong>${NEG.OBTAINED_LABELS[terms.obtained] || terms.obtained}</strong>
          ${terms.obtainedDesc ? `<br><em>${terms.obtainedDesc}</em>` : ''}</div>
      </div>
      ${commitHTML}
      ${terms.deadline ? `<div class="treaty-view-field">
        <div class="treaty-view-label">Plazo</div>
        <div class="treaty-view-val">${terms.deadline} turnos${terms.penalty ? ` · Penalización: ${terms.penalty}` : ''}</div>
      </div>` : ''}`;
  },

  _signTreaty(id, targetId) {
    const g = UI.game;
    if (typeof MP !== 'undefined' && MP.enabled) {
      MP._toHost({
        type: 'NEG_TREATY', sub: 'sign',
        id, fromId: g.playerCountryId, targetId,
      });
    }
    // Show partial animation; full animation triggers when both signed
    document.getElementById('treaty-sign').textContent = '✅ Firmado. Esperando contraparte…';
    document.getElementById('treaty-sign').disabled = true;
    if (typeof UI !== 'undefined') UI.showToast('✍️ Firmaste el tratado. Esperando la firma del otro jugador.', 'info');
  },

  _rejectTreaty(id, targetId) {
    const g = UI.game;
    if (typeof MP !== 'undefined' && MP.enabled) {
      MP._toHost({ type: 'NEG_TREATY', sub: 'reject', id, fromId: g.playerCountryId, targetId });
    }
    this.closeTreaty();
    if (typeof UI !== 'undefined') UI.showToast('❌ Rechazaste el tratado.', 'warning');
  },

  showSigningAnimation(onDone) {
    document.getElementById('treaty-editor').classList.add('hidden');
    document.getElementById('treaty-viewer').classList.add('hidden');
    document.getElementById('treaty-signing').classList.remove('hidden');
    // Re-trigger animation
    const scene = document.querySelector('.signing-scene');
    if (scene) { scene.style.animation = 'none'; void scene.offsetWidth; scene.style.animation = ''; }
    if (typeof SFX !== 'undefined' && SFX.success) SFX.success();
    setTimeout(() => {
      this.closeTreaty();
      if (onDone) onDone();
    }, 3200);
  },

  closeTreaty() {
    document.getElementById('treaty-overlay').classList.add('hidden');
    this._treaty = null;
  },

  // ─────────────────────────────────────────────────────────
  // TRADE
  // ─────────────────────────────────────────────────────────

  openTrade(targetCountryId, initiator = true) {
    const g = UI.game;
    const me = g.countries[g.playerCountryId];
    const them = g.countries[targetCountryId];
    if (!me || !them) return;

    this._trade = {
      targetId: targetCountryId,
      initiator,
      myOffer: null,
      theirOffer: null,
      id: 'trade_' + Date.now(),
      round: 1,
    };

    const myLabel   = `${me.flag} ${me.name}`;
    const theirLabel = `${them.flag} ${them.name}`;
    document.getElementById('trade-my-label').textContent    = myLabel + ' — Mis Ofertas';
    document.getElementById('trade-their-label').textContent = theirLabel + ' — Sus Ofertas';
    document.getElementById('trade-title').textContent       =
      `🤝 Mesa de Comercio · ${myLabel} ↔ ${theirLabel}`;

    // Reset form
    ['money','troops','aerial','naval','missiles'].forEach(k =>
      (document.getElementById('to-' + k).value = '0'));
    document.getElementById('trade-my-status').textContent = '';
    document.getElementById('trade-their-offer').innerHTML =
      '<div class="trade-waiting">Esperando oferta…</div>';
    document.getElementById('trade-btn-accept').disabled = true;

    document.getElementById('trade-overlay').classList.remove('hidden');
    this._wireTradeButtons(targetCountryId, initiator);

    if (initiator) {
      if (typeof UI !== 'undefined') UI.showToast('🤝 Mesa de comercio abierta. Envía tu oferta.', 'info');
    }
  },

  _wireTradeButtons(targetCountryId, initiator) {
    document.getElementById('trade-close').onclick = () => {
      this.closeTrade(targetCountryId, 'cancel');
    };
    document.getElementById('trade-btn-reject').onclick = () => {
      this.closeTrade(targetCountryId, 'reject');
    };
    document.getElementById('trade-btn-propose').onclick = () => {
      this._submitTradeOffer(targetCountryId);
    };
    document.getElementById('trade-btn-more').onclick = () => {
      if (typeof UI !== 'undefined') UI.showToast('💬 Solicita más en el chat diplomático.', 'info');
    };
    document.getElementById('trade-btn-accept').onclick = () => {
      this._acceptTrade(targetCountryId);
    };

    // Live validation
    ['money','troops','aerial','naval','missiles'].forEach(k => {
      document.getElementById('to-' + k).oninput = () => this._validateTradeOffer();
    });
  },

  _validateTradeOffer() {
    const g = UI.game;
    const myC = g.countries[g.playerCountryId];
    const st  = document.getElementById('trade-my-status');
    const money   = +document.getElementById('to-money').value   || 0;
    const troops  = +document.getElementById('to-troops').value  || 0;
    const aerial  = +document.getElementById('to-aerial').value  || 0;
    const naval   = +document.getElementById('to-naval').value   || 0;
    const missiles= +document.getElementById('to-missiles').value|| 0;

    const errors = [];
    if (money   > Math.round(g.treasury))          errors.push(`Fondos insuficientes ($${Math.round(g.treasury)}B disponible)`);
    if (troops  > (myC.armySize  || 0))            errors.push('Tropas insuficientes');
    if (aerial  > (myC.aerial    || 0))            errors.push('Bombarderos insuficientes');
    if (naval   > (myC.naval     || 0))            errors.push('Flota naval insuficiente');
    if (missiles> (myC.missiles  || 0))            errors.push('Misiles insuficientes');

    if (errors.length > 0) {
      st.textContent = '⚠️ ' + errors[0];
      st.className = 'trade-status error';
      return false;
    }
    st.textContent = '✅ Oferta válida';
    st.className = 'trade-status ok';
    return true;
  },

  _submitTradeOffer(targetCountryId) {
    if (!this._validateTradeOffer()) return;

    const offer = {
      money:   +document.getElementById('to-money').value    || 0,
      troops:  +document.getElementById('to-troops').value   || 0,
      aerial:  +document.getElementById('to-aerial').value   || 0,
      naval:   +document.getElementById('to-naval').value    || 0,
      missiles:+document.getElementById('to-missiles').value || 0,
    };
    const g = UI.game;
    this._trade.myOffer = offer;

    if (typeof MP !== 'undefined' && MP.enabled) {
      MP._toHost({
        type: 'NEG_TRADE', sub: 'offer',
        id: this._trade.id,
        fromId: g.playerCountryId, targetId: targetCountryId,
        offer,
      });
    }
    document.getElementById('trade-btn-propose').disabled = true;
    document.getElementById('trade-btn-propose').textContent = '⏳ Enviado…';
    if (typeof UI !== 'undefined') UI.showToast('📤 Oferta enviada. Esperando la oferta del otro jugador.', 'info');
  },

  receiveTradeOffer(data) {
    const { offer, fromId } = data;
    if (!this._trade) {
      this.openTrade(fromId, false);
    }
    this._trade.theirOffer = offer;
    const g  = UI.game;
    const tc = g.countries[fromId];
    const labels = { money:'💰 Dinero', troops:'🪖 Tropas', aerial:'✈️ Bombarderos', naval:'⚓ Flota Naval', missiles:'🚀 Misiles' };
    const rows = Object.entries(offer)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `<div class="trade-their-row">
        <span class="trade-their-amount">${v.toLocaleString()}</span>
        <span>${labels[k] || k}</span></div>`)
      .join('');

    document.getElementById('trade-their-offer').innerHTML = rows ||
      '<div class="trade-waiting">Sin oferta (no ofrece nada)</div>';
    document.getElementById('trade-btn-accept').disabled = false;

    if (typeof UI !== 'undefined') UI.showToast(
      `🤝 ${tc?.flag || ''} ${tc?.name || fromId} ha enviado su oferta.`, 'info');
  },

  _acceptTrade(targetCountryId) {
    const g = UI.game;
    if (typeof MP !== 'undefined' && MP.enabled) {
      MP._toHost({
        type: 'NEG_TRADE', sub: 'accept',
        id: this._trade?.id,
        fromId: g.playerCountryId, targetId: targetCountryId,
        myOffer: this._trade?.myOffer,
      });
    }
    this.closeTrade();
    if (typeof UI !== 'undefined') UI.showToast('✅ ¡Comercio aceptado! El intercambio se ejecutará pronto.', 'success');
  },

  tradeCompleted(data) {
    if (typeof UI !== 'undefined') {
      UI.showToast('✅ ¡Intercambio comercial completado!', 'success');
      UI.refresh();
    }
    this.closeTrade();
  },

  closeTrade(targetCountryId, reason) {
    if (reason === 'reject' || reason === 'cancel') {
      if (typeof MP !== 'undefined' && MP.enabled && targetCountryId) {
        MP._toHost({
          type: 'NEG_TRADE', sub: 'reject',
          id: this._trade?.id,
          fromId: UI.game?.playerCountryId, targetId: targetCountryId,
        });
      }
      if (typeof UI !== 'undefined') UI.showToast('❌ Comercio cancelado.', 'warning');
    }
    document.getElementById('trade-overlay').classList.add('hidden');
    this._trade = null;
  },

  // ─────────────────────────────────────────────────────────
  // LOAN
  // ─────────────────────────────────────────────────────────

  openLoan(targetCountryId) {
    const g = UI.game;
    const me = g.countries[g.playerCountryId];
    const them = g.countries[targetCountryId];
    if (!me || !them) return;

    this._loan = { targetId: targetCountryId, mode: 'editor' };

    document.getElementById('loan-title').textContent = `💰 Préstamo · ${me.flag} ${me.name} ↔ ${them.flag} ${them.name}`;
    document.getElementById('loan-editor').classList.remove('hidden');
    document.getElementById('loan-viewer').classList.add('hidden');

    // Reset
    document.getElementById('loan-role').value = 'lender';
    document.getElementById('loan-amount').value = '100';
    document.getElementById('loan-turns').value = '10';
    document.getElementById('loan-penalty-type').value = 'war';
    document.getElementById('loan-penalty-amount').value = '0';
    document.getElementById('loan-penalty-custom').style.display = 'none';

    document.getElementById('loan-overlay').classList.remove('hidden');
    this._wireLoanEditor(targetCountryId);
  },

  _wireLoanEditor(targetCountryId) {
    document.getElementById('loan-close').onclick   = () => this.closeLoan();
    document.getElementById('loan-cancel').onclick  = () => this.closeLoan();
    document.getElementById('loan-penalty-type').onchange = (e) => {
      const isCustom = e.target.value === 'custom';
      document.getElementById('loan-penalty-amount').style.display = isCustom ? 'none' : '';
      document.getElementById('loan-penalty-custom').style.display = isCustom ? '' : 'none';
    };
    document.getElementById('loan-propose').onclick = () => {
      this._proposeLoan(targetCountryId);
    };
  },

  _proposeLoan(targetCountryId) {
    const role         = document.getElementById('loan-role').value;
    const amount       = +document.getElementById('loan-amount').value;
    const turns        = +document.getElementById('loan-turns').value;
    const penaltyType  = document.getElementById('loan-penalty-type').value;
    const penaltyAmt   = +document.getElementById('loan-penalty-amount').value;
    const penaltyCustom= document.getElementById('loan-penalty-custom').value.trim();

    if (!amount || amount <= 0) { alert('Ingresa un monto válido.'); return; }
    if (!turns  || turns <= 0)  { alert('Ingresa un plazo válido.'); return; }

    const g = UI.game;
    const me = g.countries[g.playerCountryId];
    const them = g.countries[targetCountryId];
    const lenderId   = role === 'lender' ? g.playerCountryId : targetCountryId;
    const borrowerId = role === 'lender' ? targetCountryId   : g.playerCountryId;

    const terms = { amount, turns, penaltyType, penaltyAmount: penaltyAmt, penaltyCustom, lenderId, borrowerId };
    const id = 'loan_' + Date.now();
    this._loan = { id, targetId: targetCountryId, terms, mode: 'awaiting' };

    if (typeof MP !== 'undefined' && MP.enabled) {
      MP._toHost({
        type: 'NEG_LOAN', sub: 'propose',
        id, fromId: g.playerCountryId, targetId: targetCountryId,
        fromFlag: me.flag, fromName: me.name, toFlag: them.flag, toName: them.name,
        terms,
      });
    }
    document.getElementById('loan-propose').textContent = '⏳ Esperando respuesta…';
    document.getElementById('loan-propose').disabled = true;
    if (typeof UI !== 'undefined') UI.showToast('💰 Propuesta de préstamo enviada.', 'info');
  },

  receiveLoan(data) {
    const { id, fromId, fromFlag, fromName, terms } = data;
    this._loan = { id, targetId: fromId, terms, mode: 'receiver' };

    const g = UI.game;
    const me = g.countries[g.playerCountryId];
    const lenderName   = terms.lenderId === fromId ? `${fromFlag} ${fromName}` : `${me.flag} ${me.name}`;
    const borrowerName = terms.borrowerId === fromId ? `${fromFlag} ${fromName}` : `${me.flag} ${me.name}`;
    const penLabels = { war:'Declaración de guerra', troops:'Transferencia de tropas',
      aerial:'Transferencia de bombarderos', naval:'Transferencia de flota', custom: terms.penaltyCustom };

    document.getElementById('loan-view-content').innerHTML = `
      <div class="loan-view-row"><div class="loan-view-label">Prestamista</div>
        <div class="loan-view-val">${lenderName}</div></div>
      <div class="loan-view-row"><div class="loan-view-label">Prestatario</div>
        <div class="loan-view-val">${borrowerName}</div></div>
      <div class="loan-view-row"><div class="loan-view-label">Monto</div>
        <div class="loan-view-val">💰 $${terms.amount}B</div></div>
      <div class="loan-view-row"><div class="loan-view-label">Plazo</div>
        <div class="loan-view-val">⏳ ${terms.turns} turnos</div></div>
      <div class="loan-view-row"><div class="loan-view-label">Condición si no se paga</div>
        <div class="loan-view-val">⚠️ ${penLabels[terms.penaltyType] || terms.penaltyType}
          ${terms.penaltyAmount > 0 ? ` (${terms.penaltyAmount.toLocaleString()})` : ''}</div></div>`;

    document.getElementById('loan-title').textContent = `💰 Propuesta de Préstamo`;
    document.getElementById('loan-editor').classList.add('hidden');
    document.getElementById('loan-viewer').classList.remove('hidden');

    document.getElementById('loan-reject').onclick = () => {
      if (typeof MP !== 'undefined' && MP.enabled) {
        MP._toHost({ type: 'NEG_LOAN', sub: 'reject', id, fromId: g.playerCountryId, targetId: fromId });
      }
      this.closeLoan();
      if (typeof UI !== 'undefined') UI.showToast('❌ Rechazaste la propuesta de préstamo.', 'warning');
    };
    document.getElementById('loan-accept').onclick = () => {
      if (typeof MP !== 'undefined' && MP.enabled) {
        MP._toHost({ type: 'NEG_LOAN', sub: 'accept', id, fromId: g.playerCountryId, targetId: fromId });
      }
      this.closeLoan();
      if (typeof UI !== 'undefined') UI.showToast('✅ Préstamo aceptado. Se registró en tus compromisos.', 'success');
    };

    document.getElementById('loan-overlay').classList.remove('hidden');
    if (typeof UI !== 'undefined') UI.showToast('💰 ¡Propuesta de préstamo recibida! Revisa y decide.', 'warning');
  },

  closeLoan() {
    document.getElementById('loan-overlay').classList.add('hidden');
    this._loan = null;
  },

  // ─────────────────────────────────────────────────────────
  // HOST-SIDE ROUTING (called from multiplayer.js)
  // ─────────────────────────────────────────────────────────

  hostHandleNEG(pid, msg, game, sendTo, bcastState) {
    const { type, sub, id, fromId, targetId } = msg;

    if (type === 'NEG_TREATY') {
      if (sub === 'propose') {
        // Route to target player
        const targetPid = game.playerCountries?.[targetId];
        if (targetPid) {
          if (targetPid === pid) {
            // Target is host — show directly
            NEG.receiveTreaty(msg);
          } else {
            sendTo(targetPid, msg);
          }
        }
        // Store pending treaty
        if (!game._pendingTreaties) game._pendingTreaties = {};
        game._pendingTreaties[id] = { ...msg, signatures: {} };

      } else if (sub === 'sign') {
        const pt = game._pendingTreaties?.[id];
        if (!pt) return;
        pt.signatures[fromId] = true;

        // Check if BOTH parties have signed
        const bothSigned = pt.signatures[pt.fromId] && pt.signatures[pt.targetId];
        if (bothSigned) {
          // Execute treaty effects
          NEG._executeTreaty(pt.terms, pt.fromId, pt.targetId, game);
          delete game._pendingTreaties[id];
          bcastState();
          // Notify both with signing animation
          const msg2 = { type: 'NEG_TREATY', sub: 'signed', id, fromId: pt.fromId, targetId: pt.targetId };
          [pt.fromId, pt.targetId].forEach(cid => {
            const cpid = game.playerCountries?.[cid];
            if (cpid) sendTo(cpid, msg2);
          });
        } else {
          // Notify other party to sign
          const otherCId = fromId === pt.fromId ? pt.targetId : pt.fromId;
          const otherPid = game.playerCountries?.[otherCId];
          if (otherPid) sendTo(otherPid, msg);
        }

      } else if (sub === 'reject') {
        const pt = game._pendingTreaties?.[id];
        if (pt) delete game._pendingTreaties[id];
        const proposerPid = game.playerCountries?.[pt?.fromId || targetId];
        if (proposerPid) sendTo(proposerPid, { type: 'NEG_TREATY', sub: 'rejected', id });

      } else if (sub === 'signed') {
        // Both parties signed — show animation
        NEG.showSigningAnimation(() => {
          if (typeof UI !== 'undefined') UI.refresh();
        });

      } else if (sub === 'rejected') {
        if (typeof UI !== 'undefined') UI.showToast('❌ Tu propuesta de tratado fue rechazada.', 'danger');
        NEG.closeTreaty();
      }
    }

    if (type === 'NEG_TRADE') {
      if (sub === 'request') {
        // Forward the trade request to the target player
        const targetPid = game.playerCountries?.[targetId];
        if (targetPid) sendTo(targetPid, { ...msg });

      } else if (sub === 'request_accept') {
        // fromId = accepter's country, targetId = requester's country
        const requesterPid = game.playerCountries?.[targetId];
        const accepterPid  = game.playerCountries?.[fromId];
        const tradeId = 'trade_' + Date.now();
        if (requesterPid) sendTo(requesterPid, { type: 'NEG_TRADE', sub: 'open', fromId, targetId, id: tradeId, initiator: true });
        if (accepterPid)  sendTo(accepterPid,  { type: 'NEG_TRADE', sub: 'open', fromId: targetId, targetId: fromId, id: tradeId, initiator: false });

      } else if (sub === 'request_reject') {
        const requesterPid = game.playerCountries?.[targetId];
        if (requesterPid) sendTo(requesterPid, { type: 'NEG_TRADE', sub: 'request_rejected', fromId, fromFlag: msg.fromFlag, fromName: msg.fromName });

      } else if (sub === 'offer') {
        // Route offer to the other player
        const targetPid = game.playerCountries?.[targetId];
        if (!game._pendingTrades) game._pendingTrades = {};
        if (!game._pendingTrades[id]) {
          game._pendingTrades[id] = { id, players: { [fromId]: msg.offer }, fromId, targetId };
        } else {
          game._pendingTrades[id].players[fromId] = msg.offer;
        }
        // Forward offer to the other side
        if (targetPid) sendTo(targetPid, { type: 'NEG_TRADE', sub: 'offer', id, fromId, offer: msg.offer });

      } else if (sub === 'accept') {
        const pt = game._pendingTrades?.[id];
        if (!pt) return;
        // Execute trade if both have offers
        const myOff    = msg.myOffer || pt.players[fromId];
        const theirOff = pt.players[targetId];
        if (myOff && theirOff) {
          NEG._executeTrade(fromId, targetId, myOff, theirOff, game);
          delete game._pendingTrades[id];
          bcastState();
          const doneMsg = { type: 'NEG_TRADE', sub: 'done' };
          [fromId, targetId].forEach(cid => {
            const cp = game.playerCountries?.[cid];
            if (cp) sendTo(cp, doneMsg);
          });
        }

      } else if (sub === 'reject') {
        const pt = game._pendingTrades?.[id];
        if (pt) delete game._pendingTrades[id];
        const otherCId = fromId === pt?.fromId ? pt?.targetId : pt?.fromId;
        const otherPid = game.playerCountries?.[otherCId] || game.playerCountries?.[targetId];
        if (otherPid) sendTo(otherPid, { type: 'NEG_TRADE', sub: 'rejected' });

      } else if (sub === 'open') {
        // Target receives open signal — open trade window (host-side dispatch for host-is-target case)
        NEG.openTrade(fromId, !!msg.initiator);

      } else if (sub === 'done') {
        NEG.tradeCompleted({});

      } else if (sub === 'rejected') {
        NEG.closeTrade();
        if (typeof UI !== 'undefined') UI.showToast('❌ El otro jugador rechazó el comercio.', 'warning');
      }
    }

    if (type === 'NEG_LOAN') {
      if (sub === 'request') {
        // Forward the loan request to the target player (no terms yet)
        const targetPid = game.playerCountries?.[targetId];
        if (targetPid) sendTo(targetPid, { ...msg });

      } else if (sub === 'request_accept') {
        // fromId = accepter's country, targetId = requester's country
        // Tell the requester to open their loan editor targeting the accepter
        const requesterPid = game.playerCountries?.[targetId];
        if (requesterPid) sendTo(requesterPid, { type: 'NEG_LOAN', sub: 'request_open', targetId: fromId, fromFlag: msg.fromFlag, fromName: msg.fromName });

      } else if (sub === 'request_reject') {
        const requesterPid = game.playerCountries?.[targetId];
        if (requesterPid) sendTo(requesterPid, { type: 'NEG_LOAN', sub: 'request_rejected', fromId, fromFlag: msg.fromFlag, fromName: msg.fromName });

      } else if (sub === 'propose') {
        const targetPid = game.playerCountries?.[targetId];
        if (!game._pendingLoans) game._pendingLoans = {};
        game._pendingLoans[id] = msg;
        if (targetPid) sendTo(targetPid, msg);

      } else if (sub === 'accept') {
        const pl = game._pendingLoans?.[id];
        if (!pl) return;
        NEG._executeLoan(pl.terms, pl.fromId, pl.targetId, game);
        delete game._pendingLoans[id];
        bcastState();
        const proposerPid = game.playerCountries?.[pl.fromId];
        if (proposerPid) sendTo(proposerPid, { type: 'NEG_LOAN', sub: 'accepted', id });

      } else if (sub === 'reject') {
        const pl = game._pendingLoans?.[id];
        if (pl) delete game._pendingLoans[id];
        const proposerPid = pl ? game.playerCountries?.[pl.fromId] : game.playerCountries?.[targetId];
        if (proposerPid) sendTo(proposerPid, { type: 'NEG_LOAN', sub: 'rejected' });

      } else if (sub === 'accepted') {
        if (typeof UI !== 'undefined') UI.showToast('✅ ¡El préstamo fue aceptado!', 'success');

      } else if (sub === 'rejected') {
        if (typeof UI !== 'undefined') UI.showToast('❌ El préstamo fue rechazado.', 'danger');
        NEG.closeLoan();
      }
    }
  },

  // ─────────────────────────────────────────────────────────
  // EXECUTE effects (host only)
  // ─────────────────────────────────────────────────────────

  _executeTreaty(terms, fromId, targetId, game) {
    const fromC = game.countries[fromId];
    const toC   = game.countries[targetId];
    if (!fromC || !toC) return;

    if (terms.obtained === 'alliance') {
      if (!fromC.allies.includes(targetId)) fromC.allies.push(targetId);
      if (!toC.allies.includes(fromId))     toC.allies.push(fromId);
    } else if (terms.obtained === 'peace') {
      fromC.atWar = (fromC.atWar || []).filter(id => id !== targetId);
      toC.atWar   = (toC.atWar   || []).filter(id => id !== fromId);
      game.wars   = (game.wars   || []).filter(w =>
        !(w.attacker === fromId && w.defender === targetId) &&
        !(w.attacker === targetId && w.defender === fromId));
      if (game.mpWarData) {
        const wk = [fromId, targetId].sort().join('_');
        delete game.mpWarData[wk];
      }
    }
    game.changeRelation(fromId, targetId, 25);

    // Save as commitment
    if (!game.commitments) game.commitments = [];
    const deadline = terms.deadline
      ? { turns: terms.deadline, penalty: terms.penalty, startTurn: game.turn }
      : null;
    game.commitments.push({
      type: 'treaty', id: 'treaty_' + Date.now(),
      parties: [fromId, targetId],
      obtained: terms.obtained,
      description: NEG.OBTAINED_LABELS[terms.obtained] || terms.obtained,
      commitments: terms.commitments,
      deadline,
      turn: game.turn,
    });

    game.addLog(`📜 Tratado firmado: ${NEG.OBTAINED_LABELS[terms.obtained] || terms.obtained} entre ${fromC.flag} ${fromC.name} y ${toC.flag} ${toC.name}.`, 'success');
  },

  _executeTrade(fromId, targetId, fromOffer, toOffer, game) {
    const g = game;

    const transfer = (giverId, receiverId, offer) => {
      const gc = g.countries[giverId];
      const rc = g.countries[receiverId];
      if (!gc || !rc) return;
      if (offer.money > 0) {
        if (g.playerTreasuries) {
          g.playerTreasuries[giverId]    = (g.playerTreasuries[giverId]    || 0) - offer.money;
          g.playerTreasuries[receiverId] = (g.playerTreasuries[receiverId] || 0) + offer.money;
        }
      }
      if (offer.troops  > 0) { gc.armySize  = Math.max(0, (gc.armySize  || 0) - offer.troops);  rc.armySize  = (rc.armySize  || 0) + offer.troops; }
      if (offer.aerial  > 0) { gc.aerial    = Math.max(0, (gc.aerial    || 0) - offer.aerial);   rc.aerial    = (rc.aerial    || 0) + offer.aerial; }
      if (offer.naval   > 0) { gc.naval     = Math.max(0, (gc.naval     || 0) - offer.naval);    rc.naval     = (rc.naval     || 0) + offer.naval; }
      if (offer.missiles> 0) { gc.missiles  = Math.max(0, (gc.missiles  || 0) - offer.missiles); rc.missiles  = (rc.missiles  || 0) + offer.missiles; }
    };

    transfer(fromId, targetId, fromOffer);
    transfer(targetId, fromId, toOffer);

    const fc = game.countries[fromId];
    const tc = game.countries[targetId];
    game.addLog(`🤝 Intercambio comercial completado: ${fc?.flag} ${fc?.name} ↔ ${tc?.flag} ${tc?.name}.`, 'success');
  },

  _executeLoan(terms, fromId, targetId, game) {
    const { lenderId, borrowerId, amount } = terms;
    if (game.playerTreasuries) {
      game.playerTreasuries[lenderId]  = (game.playerTreasuries[lenderId]  || 0) - amount;
      game.playerTreasuries[borrowerId]= (game.playerTreasuries[borrowerId]|| 0) + amount;
    }
    if (!game.commitments) game.commitments = [];
    game.commitments.push({
      type: 'loan', id: 'loan_' + Date.now(),
      lenderId, borrowerId, amount,
      dueInTurns: terms.turns,
      startTurn: game.turn,
      penalty: { type: terms.penaltyType, amount: terms.penaltyAmount, custom: terms.penaltyCustom },
    });
    const lc = game.countries[lenderId];
    const bc = game.countries[borrowerId];
    game.addLog(`💰 Préstamo: ${lc?.flag} ${lc?.name} prestó $${amount}B a ${bc?.flag} ${bc?.name}. Plazo: ${terms.turns} turnos.`, 'success');
  },

  // ─────────────────────────────────────────────────────────
  // REQUEST HELPERS (send request before opening windows)
  // ─────────────────────────────────────────────────────────

  requestTrade(to) {
    const g = UI.game;
    const me = g?.countries?.[g.playerCountryId];
    if (!me) return;
    if (typeof MP !== 'undefined' && MP.enabled) {
      MP._toHost({
        type: 'NEG_TRADE', sub: 'request',
        fromId: g.playerCountryId, targetId: to,
        fromFlag: me.flag, fromName: me.name,
      });
      if (typeof UI !== 'undefined') UI.showToast('🤝 Solicitud de comercio enviada. Esperando respuesta…', 'info');
    }
  },

  requestLoan(to) {
    const g = UI.game;
    const me = g?.countries?.[g.playerCountryId];
    if (!me) return;
    if (typeof MP !== 'undefined' && MP.enabled) {
      MP._toHost({
        type: 'NEG_LOAN', sub: 'request',
        fromId: g.playerCountryId, targetId: to,
        fromFlag: me.flag, fromName: me.name,
      });
      if (typeof UI !== 'undefined') UI.showToast('💰 Solicitud de préstamo enviada. Esperando respuesta…', 'info');
    }
  },

  // ─────────────────────────────────────────────────────────
  // CHAT TOOLBAR INIT
  // ─────────────────────────────────────────────────────────

  initChatButtons() {
    document.getElementById('neg-btn-treaty')?.addEventListener('click', () => {
      const to = document.getElementById('mp-chat-overlay')?.dataset.to;
      if (!to) { alert('Abre un chat diplomático primero.'); return; }
      NEG.openTreaty(to);
    });
    document.getElementById('neg-btn-trade')?.addEventListener('click', () => {
      const to = document.getElementById('mp-chat-overlay')?.dataset.to;
      if (!to) { alert('Abre un chat diplomático primero.'); return; }
      NEG.requestTrade(to);
    });
    document.getElementById('neg-btn-loan')?.addEventListener('click', () => {
      const to = document.getElementById('mp-chat-overlay')?.dataset.to;
      if (!to) { alert('Abre un chat diplomático primero.'); return; }
      NEG.requestLoan(to);
    });
  },
};

// Wire buttons on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => NEG.initChatButtons());
