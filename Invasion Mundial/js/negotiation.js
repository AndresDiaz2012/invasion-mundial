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

  // Actions that require a quantity
  COMMIT_QTY_ACTIONS: ['money','troops','aerial','naval','missiles'],
  COMMIT_LABELS: {
    money: '💰 Ayuda monetaria', troops: '🪖 Tropas', aerial: '✈️ Bombarderos',
    naval: '⚓ Flota Naval', missiles: '🚀 Misiles',
    alliance: '🤝 Alianza formal', protection: '🛡️ Protección militar', nonaggression: '🕊️ No agresión',
  },
  RESOURCE_KEYS: { money: 'treasury', troops: 'armySize', aerial: 'aerial', naval: 'naval', missiles: 'missiles' },

  openTreaty(targetCountryId) {
    const g = UI.game;
    const me = g.countries[g.playerCountryId];
    const them = g.countries[targetCountryId];
    if (!me || !them) return;

    this._treaty = { targetId: targetCountryId, mode: 'editor', mySign: false, theirSign: false };
    document.getElementById('treaty-editor').classList.remove('hidden');
    document.getElementById('treaty-viewer').classList.add('hidden');
    document.getElementById('treaty-signing').classList.add('hidden');

    document.getElementById('treaty-seal-a').textContent = me.flag   || '🔴';
    document.getElementById('treaty-seal-b').textContent = them.flag || '🔵';
    document.getElementById('treaty-parties').textContent =
      `${me.flag} ${me.name}  ✦  ${them.flag} ${them.name}`;

    // Reset form
    document.getElementById('treaty-obtained').value = '';
    document.getElementById('treaty-obtained-desc').value = '';
    document.getElementById('commit-who-1').value = 'me';
    document.getElementById('commit-action-1').value = '';
    document.getElementById('commit-qty-1').value = '';
    document.getElementById('commit-qty-1').style.display = 'none';
    document.getElementById('commit-row-2').style.display = 'none';
    document.getElementById('commit-action-2').value = '';
    document.getElementById('commit-qty-2').value = '';
    document.getElementById('commit-qty-2').style.display = 'none';
    document.getElementById('treaty-deadline').value = '';
    document.getElementById('treaty-deadline-unit').value = 'months';
    document.getElementById('treaty-penalty-row').style.display = 'none';
    document.getElementById('treaty-penalty').value = '';
    const hint = document.getElementById('treaty-resource-hint');
    if (hint) { hint.textContent = ''; hint.classList.add('hidden'); }
    // Reset propose button in case it was disabled from a previous proposal
    const proposeBtn = document.getElementById('treaty-propose');
    proposeBtn.textContent = '📜 Proponer Tratado';
    proposeBtn.disabled = false;

    document.getElementById('treaty-overlay').classList.remove('hidden');
    this._wireTreatyEditor(targetCountryId);

    // Notify the target player that a treaty is being drafted
    if (typeof MP !== 'undefined' && MP.enabled) {
      MP._toHost({
        type: 'NEG_TREATY', sub: 'writing',
        fromId: g.playerCountryId, targetId: targetCountryId,
        fromFlag: me.flag, fromName: me.name,
      });
    }
  },

  _wireTreatyEditor(targetCountryId) {
    const addBtn = document.getElementById('treaty-add-commit-btn');
    if (addBtn) {
      addBtn.onclick = () => {
        const row2 = document.getElementById('commit-row-2');
        row2.style.display = row2.style.display === 'none' ? 'flex' : 'none';
      };
    }

    // Show/hide quantity input and validate when action changes
    [1, 2].forEach(n => {
      const actionSel = document.getElementById('commit-action-' + n);
      const qtyInput  = document.getElementById('commit-qty-' + n);
      if (!actionSel) return;
      actionSel.onchange = () => {
        const needsQty = NEG.COMMIT_QTY_ACTIONS.includes(actionSel.value);
        qtyInput.style.display = needsQty ? '' : 'none';
        if (!needsQty) qtyInput.value = '';
        NEG._updateCommitHint(targetCountryId);
      };
      qtyInput.oninput = () => NEG._updateCommitHint(targetCountryId);
    });

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

  _updateCommitHint(targetCountryId) {
    const g  = UI.game;
    const me = g.countries[g.playerCountryId];
    const them = g.countries[targetCountryId];
    const hint = document.getElementById('treaty-resource-hint');
    if (!hint) return;
    const errors = [];
    [1, 2].forEach(n => {
      const action = document.getElementById('commit-action-' + n)?.value;
      const qty    = +document.getElementById('commit-qty-' + n)?.value || 0;
      const who    = document.getElementById('commit-who-' + n)?.value;
      if (!action || !NEG.COMMIT_QTY_ACTIONS.includes(action) || qty <= 0) return;
      const rk = NEG.RESOURCE_KEYS[action];
      if (!rk) return;
      const isMe   = (who === 'me' || who === 'both');
      const isThem = (who === 'them' || who === 'both');
      if (isMe) {
        const avail = action === 'money' ? Math.round(g.treasury) : (me[rk] || 0);
        if (qty > avail) errors.push(`⚠️ Tu país no tiene suficientes ${NEG.COMMIT_LABELS[action]} (disponible: ${avail.toLocaleString()})`);
      }
      if (isThem) {
        const avail = action === 'money' ? Math.round(g.treasury) : (them[rk] || 0);
        if (qty > avail) errors.push(`⚠️ ${them.name} no tiene suficientes ${NEG.COMMIT_LABELS[action]} (disponible: ${avail.toLocaleString()})`);
      }
    });
    if (errors.length > 0) {
      hint.textContent = errors[0];
      hint.classList.remove('hidden');
      hint.style.color = '#e74c3c';
    } else {
      hint.textContent = '';
      hint.classList.add('hidden');
    }
  },

  _proposeTreaty(targetCountryId) {
    const obtained    = document.getElementById('treaty-obtained').value;
    const obtainedDesc = document.getElementById('treaty-obtained-desc').value.trim();
    if (!obtained) { alert('Debes seleccionar qué se obtiene con el tratado.'); return; }

    const g = UI.game;
    const me = g.countries[g.playerCountryId];
    const them = g.countries[targetCountryId];

    // Collect and validate commitments
    const commitments = [];
    const errors = [];
    [1, 2].forEach(n => {
      const row    = document.getElementById('commit-row-' + n);
      if (n === 2 && row?.style.display === 'none') return;
      const action = document.getElementById('commit-action-' + n)?.value;
      const who    = document.getElementById('commit-who-' + n)?.value;
      const qty    = +document.getElementById('commit-qty-' + n)?.value || 0;
      if (!action) return;
      const needsQty = NEG.COMMIT_QTY_ACTIONS.includes(action);
      if (needsQty && qty <= 0) { errors.push(`Compromiso ${n}: indica la cantidad.`); return; }
      // Validate against resources
      if (needsQty) {
        const rk = NEG.RESOURCE_KEYS[action];
        if (who === 'me' || who === 'both') {
          const avail = action === 'money' ? Math.round(g.treasury) : (me[rk] || 0);
          if (qty > avail) { errors.push(`No tienes suficientes ${NEG.COMMIT_LABELS[action]} (tienes: ${avail.toLocaleString()}).`); return; }
        }
      }
      commitments.push({ who, action, qty: needsQty ? qty : null });
    });
    if (errors.length > 0) { alert(errors[0]); return; }

    const deadlineNum = parseInt(document.getElementById('treaty-deadline').value) || null;
    const deadlineUnit = document.getElementById('treaty-deadline-unit').value || 'months';
    const deadline = deadlineNum ? { value: deadlineNum, unit: deadlineUnit } : null;
    const penalty  = deadline ? (document.getElementById('treaty-penalty').value || 'none') : null;
    const sanctionsType   = (penalty === 'sanctions') ? (document.getElementById('sanctions-type')?.value || 'money') : null;
    const sanctionsAmount = (penalty === 'sanctions') ? (parseInt(document.getElementById('sanctions-amount')?.value) || 30) : null;

    const terms = { obtained, obtainedDesc, commitments, deadline, penalty, sanctionsType, sanctionsAmount };
    const id = 'treaty_' + Date.now();
    this._treaty = { id, targetId: targetCountryId, terms, mode: 'awaiting', mySign: false, theirSign: false };

    if (typeof MP !== 'undefined' && MP.enabled) {
      MP._toHost({
        type: 'NEG_TREATY', sub: 'propose', id,
        targetId: targetCountryId, fromId: g.playerCountryId,
        fromFlag: me.flag, fromName: me.name,
        toFlag: them.flag, toName: them.name, terms,
      });
    }

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
    const commitHTML = (terms.commitments || []).map(c => {
      const whoLabel = c.who === 'me' ? `${fromFlag} ${fromName}` : c.who === 'both' ? 'Ambos países' : 'Tu país';
      const actionLabel = NEG.COMMIT_LABELS[c.action] || c.action || c.text || '';
      const qtyStr = (c.qty && c.qty > 0) ? ` — ${c.qty.toLocaleString()}` : '';
      return `<div class="treaty-view-field">
        <div class="treaty-view-label">Compromiso: ${whoLabel}</div>
        <div class="treaty-view-val">${actionLabel}${qtyStr}</div>
      </div>`;
    }).join('');

    const PENALTY_VIEW_LABELS = {
      war:           '⚔️ Declaración de guerra',
      break_alliance:'💔 Ruptura de alianza',
      sanctions:     '💸 Sanciones económicas',
      none:          '',
    };
    const deadlineHTML = (() => {
      if (!terms.deadline) return '';
      const dl = typeof terms.deadline === 'object' ? terms.deadline : { value: terms.deadline, unit: 'months' };
      const unitLabel = dl.unit === 'years' ? 'años' : 'meses';
      const penLabel = (terms.penalty && terms.penalty !== 'none')
        ? (PENALTY_VIEW_LABELS[terms.penalty] || terms.penalty)
        : '';
      return `<div class="treaty-view-field">
        <div class="treaty-view-label">⏳ Plazo</div>
        <div class="treaty-view-val">${dl.value} ${unitLabel}${penLabel ? ` · ⚠️ ${penLabel}` : ''}</div>
      </div>`;
    })();

    document.getElementById('treaty-view-content').innerHTML = `
      <div class="treaty-view-field">
        <div class="treaty-view-label">Lo que se obtiene</div>
        <div class="treaty-view-val"><strong>${NEG.OBTAINED_LABELS[terms.obtained] || terms.obtained}</strong>
          ${terms.obtainedDesc ? `<br><em>${terms.obtainedDesc}</em>` : ''}</div>
      </div>
      ${commitHTML}${deadlineHTML}`;
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

    // Reset form and button state (fixes "stuck in sending" bug between sessions)
    ['money','troops','aerial','naval','missiles'].forEach(k =>
      (document.getElementById('to-' + k).value = '0'));
    document.getElementById('trade-my-status').textContent = '';
    document.getElementById('trade-their-offer').innerHTML =
      '<div class="trade-waiting">Esperando oferta…</div>';
    document.getElementById('trade-btn-accept').disabled = true;
    const propBtn = document.getElementById('trade-btn-propose');
    propBtn.disabled = false;
    propBtn.textContent = '📤 Proponer';

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
      const g = UI.game;
      const me = g?.countries?.[g.playerCountryId];
      if (typeof MP !== 'undefined' && MP.enabled) {
        MP._toHost({ type: 'NEG_TRADE', sub: 'request_more', fromId: g.playerCountryId, targetId: targetCountryId, fromFlag: me?.flag, fromName: me?.name });
      }
      if (typeof UI !== 'undefined') UI.showToast('🔄 Pediste más. El otro jugador puede actualizar su oferta.', 'info');
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
    const pb = document.getElementById('trade-btn-propose');
    pb.textContent = '⏳ Enviado…';
    pb.disabled = true;
    setTimeout(() => { pb.textContent = '✏️ Actualizar oferta'; pb.disabled = false; }, 1500);
    if (typeof UI !== 'undefined') UI.showToast('📤 Oferta enviada. Puedes actualizarla si es necesario.', 'info');
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
      const me = g?.countries?.[g.playerCountryId];
      MP._toHost({
        type: 'NEG_TRADE', sub: 'accept',
        id: this._trade?.id,
        fromId: g.playerCountryId, targetId: targetCountryId,
        myOffer: this._trade?.myOffer,
        fromFlag: me?.flag, fromName: me?.name,
      });
      const btn = document.getElementById('trade-btn-accept');
      if (btn) { btn.disabled = true; btn.textContent = '⏳ Esperando confirmación…'; }
      if (typeof UI !== 'undefined') UI.showToast('⏳ Aceptaste. Esperando que el otro jugador confirme…', 'info');
    } else {
      this.closeTrade();
      if (typeof UI !== 'undefined') UI.showToast('✅ ¡Comercio aceptado!', 'success');
    }
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

  LOAN_ITEM_LABELS: { money: '💰 Dinero ($B)', troops: '🪖 Tropas', aerial: '✈️ Bombarderos', naval: '⚓ Flota Naval', missiles: '🚀 Misiles' },
  LOAN_RESOURCE_KEYS: { money: 'treasury', troops: 'armySize', aerial: 'aerial', naval: 'naval', missiles: 'missiles' },

  openLoan(targetCountryId, role) {
    const g = UI.game;
    const me = g.countries[g.playerCountryId];
    const them = g.countries[targetCountryId];
    if (!me || !them) return;

    const loanRole = role || 'lender';
    this._loan = { targetId: targetCountryId, mode: 'editor', role: loanRole };

    document.getElementById('loan-title').textContent = `💰 Préstamo · ${me.flag} ${me.name} ↔ ${them.flag} ${them.name}`;
    document.getElementById('loan-editor').classList.remove('hidden');
    document.getElementById('loan-viewer').classList.add('hidden');

    // Show role badge (not a selector — role was decided before this window opened)
    const badge = document.getElementById('loan-role-badge');
    if (badge) {
      badge.textContent = loanRole === 'lender'
        ? `💰 Ofrezco un préstamo a ${them.flag} ${them.name}`
        : `🙏 Solicito un préstamo a ${them.flag} ${them.name}`;
    }

    // Reset form
    const itemSel = document.getElementById('loan-item');
    if (itemSel) itemSel.value = 'money';
    document.getElementById('loan-amount').value = '100';
    document.getElementById('loan-turns').value = '6';
    const unitSel = document.getElementById('loan-turns-unit');
    if (unitSel) unitSel.value = 'months';
    document.getElementById('loan-penalty-type').value = 'war';
    document.getElementById('loan-penalty-custom').style.display = 'none';
    const hint = document.getElementById('loan-resource-hint');
    if (hint) hint.textContent = '';
    // Reset propose button
    const propBtn = document.getElementById('loan-propose');
    propBtn.textContent = '💰 Proponer';
    propBtn.disabled = false;

    document.getElementById('loan-overlay').classList.remove('hidden');
    this._wireLoanEditor(targetCountryId, loanRole);
  },

  _wireLoanEditor(targetCountryId, role) {
    document.getElementById('loan-close').onclick  = () => this.closeLoan();
    document.getElementById('loan-cancel').onclick = () => this.closeLoan();
    document.getElementById('loan-penalty-type').onchange = (e) => {
      document.getElementById('loan-penalty-custom').style.display = e.target.value === 'custom' ? '' : 'none';
    };

    // Live resource validation
    const validateLoan = () => {
      const item   = document.getElementById('loan-item')?.value || 'money';
      const amount = +document.getElementById('loan-amount')?.value || 0;
      const hint   = document.getElementById('loan-resource-hint');
      if (!hint) return;
      const g  = UI.game;
      const me = g.countries[g.playerCountryId];
      const rk = NEG.LOAN_RESOURCE_KEYS[item];
      const avail = item === 'money' ? Math.round(g.treasury) : (me[rk] || 0);
      // Only validate availability if we're the one giving (lender)
      if (role === 'lender' && amount > avail) {
        hint.textContent = `⚠️ No tienes suficientes ${NEG.LOAN_ITEM_LABELS[item]} (disponible: ${avail.toLocaleString()})`;
        hint.style.color = '#e74c3c';
      } else {
        hint.textContent = avail > 0 ? `✅ Disponible: ${avail.toLocaleString()}` : '';
        hint.style.color = '#27ae60';
      }
    };
    document.getElementById('loan-item')?.addEventListener('change', validateLoan);
    document.getElementById('loan-amount')?.addEventListener('input', validateLoan);
    validateLoan();

    document.getElementById('loan-propose').onclick = () => this._proposeLoan(targetCountryId, role);
  },

  _proposeLoan(targetCountryId, role) {
    const item         = document.getElementById('loan-item')?.value || 'money';
    const amount       = +document.getElementById('loan-amount').value;
    const turnsNum     = +document.getElementById('loan-turns').value;
    const turnsUnit    = document.getElementById('loan-turns-unit')?.value || 'months';
    const penaltyType  = document.getElementById('loan-penalty-type').value;
    const penaltyCustom= document.getElementById('loan-penalty-custom').value.trim();

    if (!amount || amount <= 0) { alert('Ingresa una cantidad válida.'); return; }
    if (!turnsNum || turnsNum <= 0) { alert('Ingresa un plazo válido.'); return; }

    const g = UI.game;
    const me = g.countries[g.playerCountryId];
    const them = g.countries[targetCountryId];

    // Validate if lender has enough
    if (role === 'lender') {
      const rk = NEG.LOAN_RESOURCE_KEYS[item];
      const avail = item === 'money' ? Math.round(g.treasury) : (me[rk] || 0);
      if (amount > avail) { alert(`No tienes suficientes ${NEG.LOAN_ITEM_LABELS[item]} (disponible: ${avail.toLocaleString()}).`); return; }
    }

    const lenderId   = role === 'lender' ? g.playerCountryId : targetCountryId;
    const borrowerId = role === 'lender' ? targetCountryId   : g.playerCountryId;

    const terms = { item, amount, turns: turnsNum, turnsUnit, penaltyType, penaltyCustom, lenderId, borrowerId };
    const id = 'loan_' + Date.now();
    this._loan = { id, targetId: targetCountryId, terms, mode: 'awaiting', role };

    if (typeof MP !== 'undefined' && MP.enabled) {
      MP._toHost({
        type: 'NEG_LOAN', sub: 'propose', id,
        fromId: g.playerCountryId, targetId: targetCountryId,
        fromFlag: me.flag, fromName: me.name, toFlag: them.flag, toName: them.name, role, terms,
      });
    }
    document.getElementById('loan-propose').textContent = '⏳ Esperando respuesta…';
    document.getElementById('loan-propose').disabled = true;
    if (typeof UI !== 'undefined') UI.showToast('💰 Propuesta de préstamo enviada.', 'info');
  },

  receiveLoan(data) {
    const { id, fromId, fromFlag, fromName, role, terms } = data;
    this._loan = { id, targetId: fromId, terms, mode: 'receiver', role };

    const g = UI.game;
    const me = g.countries[g.playerCountryId];
    const lenderName   = terms.lenderId === fromId ? `${fromFlag} ${fromName}` : `${me.flag} ${me.name}`;
    const borrowerName = terms.borrowerId === fromId ? `${fromFlag} ${fromName}` : `${me.flag} ${me.name}`;
    const penLabels = { war:'Declaración de guerra', troops:'Transferencia de tropas',
      aerial:'Transferencia de bombarderos', naval:'Transferencia de flota', custom: terms.penaltyCustom || '—' };
    const itemLabel = NEG.LOAN_ITEM_LABELS?.[terms.item] || '💰 Dinero ($B)';
    const unitLabel = terms.turnsUnit === 'years' ? 'años' : 'meses';
    const turnsNum  = terms.turns || terms.turnsNum || 0;

    document.getElementById('loan-view-content').innerHTML = `
      <div class="loan-view-row"><div class="loan-view-label">Prestamista</div>
        <div class="loan-view-val">${lenderName}</div></div>
      <div class="loan-view-row"><div class="loan-view-label">Prestatario</div>
        <div class="loan-view-val">${borrowerName}</div></div>
      <div class="loan-view-row"><div class="loan-view-label">Recurso</div>
        <div class="loan-view-val">${itemLabel} — ${Number(terms.amount).toLocaleString()}</div></div>
      <div class="loan-view-row"><div class="loan-view-label">⏳ Plazo</div>
        <div class="loan-view-val">${turnsNum} ${unitLabel}</div></div>
      <div class="loan-view-row"><div class="loan-view-label">⚠️ Si no se paga</div>
        <div class="loan-view-val">${penLabels[terms.penaltyType] || terms.penaltyType}</div></div>`;

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
      if (sub === 'writing') {
        // Notify target that the other player is drafting a treaty
        const targetPid = game.playerCountries?.[targetId];
        if (targetPid) sendTo(targetPid, msg);

      } else if (sub === 'propose') {
        // Route to target player — always re-route even if a previous treaty existed
        const targetPid = game.playerCountries?.[targetId];
        if (targetPid) sendTo(targetPid, msg);
        // Store pending treaty — proposer is considered to have signed by proposing
        if (!game._pendingTreaties) game._pendingTreaties = {};
        game._pendingTreaties[id] = { ...msg, signatures: { [msg.fromId]: true } };

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

      } else if (sub === 'request_more') {
        // Forward "ask for more" to the other player so they can re-propose
        const targetPid = game.playerCountries?.[targetId];
        if (targetPid) sendTo(targetPid, { type: 'NEG_TRADE', sub: 'request_more', fromFlag: msg.fromFlag, fromName: msg.fromName });

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
        // Record offer and acceptance from this party
        if (msg.myOffer) pt.players[fromId] = msg.myOffer;
        if (!pt.acceptances) pt.acceptances = {};
        pt.acceptances[fromId] = true;

        const pA = pt.fromId, pB = pt.targetId;
        const bothAccepted = pt.acceptances[pA] && pt.acceptances[pB];
        const bothHaveOffers = pt.players[pA] && pt.players[pB];

        if (bothAccepted && bothHaveOffers) {
          NEG._executeTrade(pA, pB, pt.players[pA], pt.players[pB], game);
          delete game._pendingTrades[id];
          bcastState();
          const doneMsg = { type: 'NEG_TRADE', sub: 'done' };
          [pA, pB].forEach(cid => {
            const cp = game.playerCountries?.[cid];
            if (cp) sendTo(cp, doneMsg);
          });
        } else {
          // Notify the other party that this party accepted — they need to confirm too
          const otherCId = fromId === pA ? pB : pA;
          const otherPid = game.playerCountries?.[otherCId];
          const fromC = game.countries[fromId];
          if (otherPid) sendTo(otherPid, { type: 'NEG_TRADE', sub: 'partner_accepted', fromId, fromFlag: fromC?.flag, fromName: fromC?.name });
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
        if (requesterPid) sendTo(requesterPid, { type: 'NEG_LOAN', sub: 'request_open', targetId: fromId, role: msg.role, fromFlag: msg.fromFlag, fromName: msg.fromName });

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

    // Save as commitment for deadline enforcement
    if (!game.commitments) game.commitments = [];
    if (terms.deadline) {
      const dl = terms.deadline; // { value, unit }
      const months = dl.unit === 'years' ? dl.value * 12 : dl.value;
      const deadlineMonth = (game.year * 12 + (game.month || 0)) + months;
      game.commitments.push({
        type: 'neg_treaty',
        id: 'treaty_' + Date.now(),
        fromId, targetId,
        obtained: terms.obtained,
        description: NEG.OBTAINED_LABELS[terms.obtained] || terms.obtained,
        commitments: terms.commitments,
        deadlineMonth,
        penaltyType: terms.penalty || 'none',
        sanctionsType: terms.sanctionsType || null,
        sanctionsAmount: terms.sanctionsAmount || null,
        status: 'active',
      });
    }

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

  // Show role picker before sending loan request
  requestLoan(to) {
    const g = UI.game;
    const me = g?.countries?.[g.playerCountryId];
    const them = g?.countries?.[to];
    if (!me || !them) return;

    // Remove any previous picker
    const oldPicker = document.getElementById('loan-role-picker');
    if (oldPicker) oldPicker.remove();

    const picker = document.createElement('div');
    picker.id = 'loan-role-picker';
    picker.className = 'p2p-request-card';
    picker.innerHTML = `
      <div class="p2p-req-title">💰 ¿Tipo de préstamo?</div>
      <div class="p2p-req-desc">¿Qué quieres hacer con ${them.flag} ${them.name}?</div>
      <div class="p2p-req-btns">
        <button class="p2p-accept-btn" id="lrp-offer">💰 Ofrezco un préstamo</button>
        <button class="p2p-decline-btn" id="lrp-request">🙏 Pido un préstamo</button>
      </div>
      <button class="p2p-decline-btn" style="margin-top:6px;width:100%;font-size:0.8em" id="lrp-cancel">✕ Cancelar</button>`;
    document.body.appendChild(picker);

    const send = (role) => {
      picker.remove();
      const roleLabel = role === 'lender' ? 'ofrece un préstamo' : 'solicita un préstamo';
      if (typeof MP !== 'undefined' && MP.enabled) {
        MP._toHost({
          type: 'NEG_LOAN', sub: 'request',
          fromId: g.playerCountryId, targetId: to,
          fromFlag: me.flag, fromName: me.name, role,
        });
        if (typeof UI !== 'undefined') UI.showToast('💰 Solicitud de préstamo enviada. Esperando respuesta…', 'info');
      }
    };

    picker.querySelector('#lrp-offer').onclick   = () => send('lender');
    picker.querySelector('#lrp-request').onclick  = () => send('borrower');
    picker.querySelector('#lrp-cancel').onclick   = () => picker.remove();
  },

  // ─────────────────────────────────────────────────────────
  // TREATY DEADLINE ENFORCEMENT (called from game.nextMonth)
  // ─────────────────────────────────────────────────────────

  _checkTreatyDeadlines(game) {
    if (!game.commitments?.length) return;
    const now = game.year * 12 + (game.month || 0);
    for (const c of game.commitments) {
      if (c.type !== 'neg_treaty' || c.status !== 'active') continue;
      if (c.deadlineMonth == null || now < c.deadlineMonth) continue;
      c.status = 'expired';
      const fromC = game.countries[c.fromId];
      const toC   = game.countries[c.targetId];
      const fromName = fromC ? `${fromC.flag} ${fromC.name}` : c.fromId;
      const toName   = toC   ? `${toC.flag} ${toC.name}`     : c.targetId;
      const pt = c.penaltyType || 'none';
      if (pt === 'war') {
        game.changeRelation(c.fromId, c.targetId, -50);
        game.addLog(`⚔️ Plazo vencido del tratado entre ${fromName} y ${toName}: relaciones rotas. ¡Conflicto inminente!`, 'danger');
      } else if (pt === 'break_alliance') {
        if (fromC) fromC.allies = (fromC.allies || []).filter(id => id !== c.targetId);
        if (toC)   toC.allies   = (toC.allies   || []).filter(id => id !== c.fromId);
        game.changeRelation(c.fromId, c.targetId, -30);
        game.addLog(`💔 Plazo vencido del tratado entre ${fromName} y ${toName}: alianza disuelta.`, 'warning');
      } else if (pt === 'sanctions') {
        game.changeRelation(c.fromId, c.targetId, -25);
        const sType = c.sanctionsType || 'money';
        const sAmt  = c.sanctionsAmount || 30;
        const RESOURCE_KEY = { troops: 'armySize', aerial: 'aerial', missiles: 'missiles' };
        if (sType === 'money') {
          if (game.playerTreasuries) {
            if (game.playerTreasuries[c.fromId]   != null) game.playerTreasuries[c.fromId]   = Math.max(0, game.playerTreasuries[c.fromId]   - sAmt);
            if (game.playerTreasuries[c.targetId] != null) game.playerTreasuries[c.targetId] = Math.max(0, game.playerTreasuries[c.targetId] - sAmt);
          }
          game.addLog(`💸 Sanciones: ${fromName} y ${toName} pierden $${sAmt}B cada uno.`, 'warning');
        } else {
          const rKey = RESOURCE_KEY[sType] || sType;
          const typeLabels = { troops: 'tropas', aerial: 'bombarderos', missiles: 'misiles' };
          const pIdC = game.countries[c.fromId];
          const tIdC = game.countries[c.targetId];
          if (pIdC) pIdC[rKey] = Math.max(0, (pIdC[rKey] || 0) - sAmt);
          if (tIdC) tIdC[rKey] = Math.max(0, (tIdC[rKey] || 0) - sAmt);
          game.addLog(`💸 Sanciones militares: ${fromName} y ${toName} pierden ${sAmt} ${typeLabels[sType] || sType} cada uno.`, 'warning');
        }
      } else {
        game.addLog(`📋 Tratado entre ${fromName} y ${toName} expiró sin consecuencias.`, 'info');
      }
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
