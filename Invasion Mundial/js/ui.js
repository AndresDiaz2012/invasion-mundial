// ============================================================
// UI.JS - All rendering, DOM and animations
// ============================================================

const UI = {
  game: null,
  _prevTreasury: 0,

  // In MP client mode, game data comes from the host via MP_GAME.state
  _g() {
    if (typeof MP !== 'undefined' && MP.enabled && !MP.isHost && typeof MP_GAME !== 'undefined') {
      return MP_GAME.state || this.game;
    }
    return this.game;
  },

  // ── SCREEN MANAGEMENT ────────────────────────────────────

  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  },

  // ── ANIMATIONS ────────────────────────────────────────────

  flashValue(el, direction) {
    if (!el) return;
    el.classList.remove('flash-up', 'flash-down');
    void el.offsetWidth;
    el.classList.add(direction === 'up' ? 'flash-up' : 'flash-down');
    setTimeout(() => el.classList.remove('flash-up', 'flash-down'), 700);
  },

  floatNumber(text, x, y, isPositive) {
    const el = document.createElement('div');
    el.className = `float-num ${isPositive ? 'positive' : 'negative'}`;
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top  = y + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  },

  showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    // Play sound based on type
    if (typeof SFX !== 'undefined') {
      if (type === 'danger') SFX.war();
      else if (type === 'success') SFX.success();
      else if (type === 'warning') SFX.alert();
      else SFX.alert();
    }

    // Screen shake on critical alerts
    if (type === 'danger') {
      document.body.classList.remove('screen-shake');
      void document.body.offsetWidth;
      document.body.classList.add('screen-shake');
      setTimeout(() => document.body.classList.remove('screen-shake'), 600);
    }

    // Cap stack at 4 toasts — remove oldest if over
    const existing = container.querySelectorAll('.toast');
    if (existing.length >= 4) existing[0].remove();

    const DURATION = type === 'danger' ? 5000 : 3200;
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `
      <div class="toast-body">${msg}</div>
      <div class="toast-bar"><div class="toast-bar-fill" style="animation-duration:${DURATION}ms"></div></div>`;
    container.appendChild(t);

    // Trigger progress bar animation after paint
    requestAnimationFrame(() => requestAnimationFrame(() => t.querySelector('.toast-bar-fill').classList.add('running')));

    const removeToast = () => {
      t.classList.add('toast-out');
      setTimeout(() => t.remove(), 420);
    };
    const tid = setTimeout(removeToast, DURATION);
    t.addEventListener('click', () => { clearTimeout(tid); removeToast(); });
  },

  showYearTransition(year, callback) {
    if (typeof SFX !== 'undefined') SFX.year();

    const g = UI.game;
    const pc = g?.countries[g?.playerCountryId];

    // ── Build ranking lists ───────────────────────────────────
    const countries = g ? Object.entries(g.countries).filter(([, c]) => !c.conquered) : [];
    const byPower = [...countries].sort(([, a], [, b]) =>
      (b.military * 1.5 + b.economy + b.stability * 0.3) - (a.military * 1.5 + a.economy + a.stability * 0.3)
    ).slice(0, 5);
    const myRank = countries.sort(([, a], [, b]) =>
      (b.military * 1.5 + b.economy + b.stability * 0.3) - (a.military * 1.5 + a.economy + a.stability * 0.3)
    ).findIndex(([id]) => id === g?.playerCountryId) + 1;

    // Recent log entries (last year's notable events)
    const recentLog = (g?.log || [])
      .filter(e => e && e.message && !e.message.startsWith('───') && (!e._fromPid || e._public))
      .slice(-6);

    // Wars summary
    const warCount = (g?.countries[g?.playerCountryId]?.atWar || []).length;
    const allyCount = (g?.countries[g?.playerCountryId]?.allies || []).length;

    const rankRows = byPower.map(([id, c], i) => {
      const isMe = id === g?.playerCountryId;
      const power = Math.round(c.military * 1.5 + c.economy + c.stability * 0.3);
      return `<div class="yr-rank-row${isMe ? ' yr-rank-me' : ''}">
        <span class="yr-rank-num">#${i + 1}</span>
        <span class="yr-rank-flag">${c.flag}</span>
        <span class="yr-rank-name">${c.name}</span>
        <span class="yr-rank-score">${power}</span>
      </div>`;
    }).join('');

    const logRows = recentLog.length
      ? recentLog.map(e => `<div class="yr-log-entry yr-log-${e.type || 'info'}">${e.message}</div>`).join('')
      : '<div class="yr-log-entry yr-log-info">Sin eventos registrados.</div>';

    const overlay = document.createElement('div');
    overlay.id = 'year-brief-overlay';
    overlay.innerHTML = `
      <div id="year-brief-box">
        <div id="year-brief-stamp">CLASIFICADO</div>
        <div id="year-brief-header">
          <div id="year-brief-title">◆ INFORME ANUAL DE INTELIGENCIA ◆</div>
          <div id="year-brief-year">AÑO ${year}</div>
        </div>
        <div id="year-brief-body">
          <div class="yr-section">
            <div class="yr-section-title">▶ ESTADO DE ${pc?.name?.toUpperCase() || 'TU NACIÓN'}</div>
            <div class="yr-stat-row">
              <span>💰 Tesoro</span><strong>$${Math.round(pc?.economy * 12 || 0)}B</strong>
            </div>
            <div class="yr-stat-row">
              <span>⚔️ En guerra con</span><strong style="color:${warCount > 0 ? '#d94f4f' : '#3dba6f'}">${warCount > 0 ? warCount + ' nación(es)' : 'Nadie'}</strong>
            </div>
            <div class="yr-stat-row">
              <span>🤝 Alianzas</span><strong style="color:#3dba6f">${allyCount}</strong>
            </div>
            <div class="yr-stat-row">
              <span>🌍 Posición global</span><strong style="color:#c9a227">#${myRank} de ${countries.length}</strong>
            </div>
          </div>
          <div class="yr-section">
            <div class="yr-section-title">▶ POTENCIAS MUNDIALES</div>
            ${rankRows}
          </div>
          <div class="yr-section yr-section-log">
            <div class="yr-section-title">▶ EVENTOS RECIENTES</div>
            ${logRows}
          </div>
        </div>
        <div id="year-brief-footer">
          <button id="year-brief-skip">CONTINUAR →</button>
          <span id="year-brief-countdown">Continúa en <strong id="year-brief-secs">8</strong>s</span>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    // Reveal animation — lines appear staggered
    requestAnimationFrame(() => overlay.classList.add('yr-visible'));

    let secs = 8;
    const secEl = overlay.querySelector('#year-brief-secs');
    const secsTimer = setInterval(() => {
      secs--;
      if (secEl) secEl.textContent = secs;
      if (secs <= 0) finish();
    }, 1000);

    const finish = () => {
      clearInterval(secsTimer);
      overlay.querySelector('#year-brief-skip').removeEventListener('click', finish);
      overlay.classList.add('yr-fadeout');
      setTimeout(() => { overlay.remove(); if (callback) callback(); }, 500);
    };

    overlay.querySelector('#year-brief-skip').addEventListener('click', finish);
  },

  // ── COUNTRY SELECTION SCREEN ─────────────────────────────

  renderCountrySelect() {
    const grid = document.getElementById('country-grid');
    grid.innerHTML = '';
    for (const region of REGIONS) {
      const countries = Object.entries(COUNTRIES).filter(([, c]) => c.region === region);
      if (!countries.length) continue;
      const section = document.createElement('div');
      section.className = 'region-section';
      section.innerHTML = `<div class="region-label">◆ ${region.toUpperCase()}</div><div class="region-countries"></div>`;
      const container = section.querySelector('.region-countries');
      for (const [id, country] of countries) {
        const diff = UI._getDifficulty(country);
        const card = document.createElement('div');
        card.className = 'country-card';
        card.dataset.id = id;
        card.innerHTML = `
          <span class="card-flag">${country.flag}</span>
          <div class="card-info">
            <div class="card-name">${country.name}</div>
            <div class="card-region">${region}</div>
            <div class="card-diff" style="color:${diff.color}">${diff.label}</div>
          </div>`;
        card.addEventListener('click', () => UI.selectCountry(id));
        container.appendChild(card);
      }
      grid.appendChild(section);
    }
  },

  _getDifficulty(country) {
    const score = country.economy + country.military + country.stability;
    if (score > 220) return { label: '● Fácil', color: '#3dba6f' };
    if (score > 150) return { label: '● Medio', color: '#c9a227' };
    return { label: '● Difícil', color: '#d94f4f' };
  },

  selectCountry(id) {
    document.querySelectorAll('.country-card').forEach(c => c.classList.remove('selected'));
    document.querySelector(`.country-card[data-id="${id}"]`)?.classList.add('selected');
    const country = COUNTRIES[id];
    const detail = document.getElementById('country-detail');
    detail.classList.remove('hidden');
    document.getElementById('detail-flag').textContent = country.flag;
    document.getElementById('detail-name').textContent = country.name;
    document.getElementById('detail-region').textContent = country.region;
    const stats = [
      { label: 'ECONOMÍA',   value: country.economy,   color: '#3dba6f' },
      { label: 'MILITAR',    value: country.military,  color: '#d94f4f' },
      { label: 'ESTABILIDAD',value: country.stability, color: '#4a90d9' },
      { label: 'ESPIONAJE',  value: country.espionage, color: '#c9a227' },
      { label: 'RECURSOS',   value: country.resources, color: '#7ab8f5' },
    ];
    document.getElementById('detail-stats').innerHTML = stats.map(s => `
      <div class="stat-row">
        <span class="stat-label">${s.label}</span>
        <div class="stat-bar"><div class="stat-fill" style="width:${s.value}%;background:${s.color}"></div></div>
        <span class="stat-value">${s.value}</span>
      </div>`).join('');
    document.getElementById('detail-bonus').innerHTML = `
      <div class="bonus-title">⭐ ${country.bonus}</div>
      <div class="bonus-desc">${country.bonusDesc}</div>`;
    const sr = country.startingRelations || {};
    const relEntries = Object.entries(sr).sort((a, b) => b[1] - a[1]).slice(0, 8);
    document.getElementById('detail-relations').innerHTML = `
      <div class="relations-title">RELACIONES INICIALES</div>
      ${relEntries.map(([rid, v]) => {
        const c = COUNTRIES[rid];
        return c ? `<div class="rel-item"><span>${c.flag} ${c.name}</span><span class="${v >= 0 ? 'rel-pos' : 'rel-neg'}">${v > 0 ? '+' : ''}${v}</span></div>` : '';
      }).join('')}`;
    document.getElementById('btn-choose').dataset.id = id;
  },

  // ── HUD ───────────────────────────────────────────────────

  updateHUD() {
    const g = UI.game;
    const pc = g.countries[g.playerCountryId];
    const income = g._calcIncome();

    const pending  = g.pendingDeliveries?.length ?? 0;
    const missiles = g.missiles ?? 0;
    document.getElementById('hud-country-info').innerHTML =
      `<span class="hud-flag">${pc.flag}</span><span class="hud-country-name" id="hud-cname" title="Clic para renombrar" style="cursor:pointer">${pc.name}</span>`
      + (pending > 0  ? `<span class="hud-transit" title="${pending} envío(s) en tránsito">✈️${pending}</span>` : '')
      + (missiles > 0 ? `<span class="hud-transit" style="color:#ff5555;border-color:#ff333344" title="${missiles} misil(es) listo(s)">🚀${missiles}</span>` : '');
    document.getElementById('hud-cname')?.addEventListener('click', () => UI.openRenameDialog());


    const tEl = document.getElementById('hud-treasury');
    // In MP mode, host uses per-player treasury; clients already have it via applyState proxy
    const rawTreasury = (typeof MP !== 'undefined' && MP.enabled && MP.isHost && g.playerTreasuries)
      ? (g.playerTreasuries[g.playerCountryId] ?? g.treasury)
      : g.treasury;
    const newTreasury = Math.round(rawTreasury);
    if (Math.abs(newTreasury - UI._prevTreasury) > 0 && UI._prevTreasury !== 0) {
      UI.flashValue(tEl, newTreasury > UI._prevTreasury ? 'up' : 'down');
    }
    UI._prevTreasury = newTreasury;
    tEl.textContent = `$${newTreasury}B`;

    document.getElementById('hud-income').textContent = `+$${income}B`;
    document.getElementById('hud-turn').textContent = g.year;
    const MONTH_NAMES_HUD = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const mHud = document.getElementById('hud-month');
    if (mHud) mHud.textContent = MONTH_NAMES_HUD[g.month] || '';

    const stabEl = document.getElementById('hud-stability');
    stabEl.textContent = `${pc.stability}%`;
    stabEl.className = 'hud-value ' + (pc.stability >= 60 ? 'green' : pc.stability >= 35 ? 'gold' : 'red blink');

    const tensEl = document.getElementById('hud-tension');
    tensEl.textContent = `${g.globalTension}%`;
    tensEl.className = 'hud-value ' + (g.globalTension >= 70 ? 'red' : g.globalTension >= 40 ? 'gold' : 'green');

    // Opponents badge
    const oppBadge = document.getElementById('hud-opponents');
    if (oppBadge) {
      const count = POLITICS.opponents.length;
      oppBadge.textContent = count;
      oppBadge.style.display = count > 0 ? 'inline' : 'none';
    }
  },

  // ── MAP DELEGATION ────────────────────────────────────────

  renderWorldGrid() { MAP.colorAll(); },

  selectGameCountry(id) {
    if (!UI.game.countries[id]) return;
    UI.game.selectedCountryId = id;
    MAP.colorAll();
    UI.renderCountryInfo(id);
    UI.renderActionList();
  },

  // ── COUNTRY INFO PANEL ────────────────────────────────────

  renderCountryInfo(id) {
    const g = UI.game;
    const country = g.countries[id];
    const pc = g.countries[g.playerCountryId];
    const isPlayer = id === g.playerCountryId;
    const rel = g.getRelation(g.playerCountryId, id);
    const panel = document.getElementById('country-info-content');

    const relColor = rel > 30 ? '#3dba6f' : rel < -30 ? '#d94f4f' : '#c9a227';
    const relLabel = rel > 60 ? 'Aliado' : rel > 30 ? 'Amistoso' : rel > -30 ? 'Neutral' : rel > -60 ? 'Hostil' : 'Enemigo declarado';
    const relWidth = Math.abs(rel) / 2;
    const relLeft = rel >= 0 ? '50%' : `${50 - relWidth}%`;

    const personalityLabels = {
      diplomatic: 'Diplomático', aggressive: 'Agresivo', defensive: 'Defensivo',
      opportunistic: 'Oportunista', expansionist: 'Expansionista', neutral: 'Neutral',
    };

    const alliesDisplay = country.allies
      .filter(aid => g.countries[aid])
      .map(aid => `<span class="info-ally-chip" title="${g.countries[aid].name}">${g.countries[aid].flag}</span>`)
      .join('');
    const atWarDisplay = country.atWar.map(wid => g.countries[wid]?.name).filter(Boolean).join(', ');

    const isConquered = !isPlayer && country.conquered && country.conqueror === g.playerCountryId;
    const incomeEst   = isConquered
      ? Math.round((country.economy * 0.35 + (country.resources || 0) * 0.15) * Math.max(0.1, 1 - (country.resistanceLevel || 0) / 130))
      : 0;

    if (isConquered) {
      panel.innerHTML = `
        <div class="info-flag">${country.flag}</div>
        <div class="info-name">${country.name}</div>
        <div class="info-region" style="color:#c9a227;font-weight:700">⭐ TERRITORIO CONQUISTADO</div>
        <div class="info-stat-grid">
          <div class="info-stat-item"><div class="info-stat-lbl">RESISTENCIA</div><div class="info-stat-val" style="color:${(country.resistanceLevel||0)>60?'#d94f4f':(country.resistanceLevel||0)>30?'#c9a227':'#3dba6f'}">${country.resistanceLevel || 0}%</div></div>
          <div class="info-stat-item"><div class="info-stat-lbl">INGRESO</div><div class="info-stat-val text-green">+$${incomeEst}B</div></div>
          <div class="info-stat-item"><div class="info-stat-lbl">TURNOS OCUP.</div><div class="info-stat-val text-gold">${country.occupationTurns || 0}</div></div>
          <div class="info-stat-item"><div class="info-stat-lbl">ESTABILIDAD</div><div class="info-stat-val text-blue">${country.stability}</div></div>
        </div>
        <div class="info-personality" style="color:#c9a227">Economía: ${country.economy} · Militar: ${country.military}${country.autonomy ? ' · Autonomía' : ''}</div>
        <div class="divider"></div>
        <div style="font-size:10px;color:var(--text-dim)">Gestiona este territorio en la pestaña activa.</div>`;
      return;
    }

    panel.innerHTML = `
      <div class="info-flag">${country.flag}</div>
      <div class="info-name">${country.name}</div>
      <div class="info-region">${country.region}</div>
      ${!isPlayer ? `
      <div class="info-relation-bar">
        <div class="info-rel-label">RELACIÓN CONTIGO</div>
        <div class="info-rel-track">
          <div class="info-rel-fill" style="left:${relLeft};width:${relWidth}%;background:${relColor}"></div>
          <div class="info-rel-zero"></div>
        </div>
        <div class="info-rel-value" style="color:${relColor}">${rel > 0 ? '+' : ''}${rel} — ${relLabel}</div>
      </div>` : ''}
      <div class="info-stat-grid">
        <div class="info-stat-item"><div class="info-stat-lbl">MILITAR</div><div class="info-stat-val text-red">${country.military}</div></div>
        <div class="info-stat-item"><div class="info-stat-lbl">ECONOMÍA</div><div class="info-stat-val text-green">${country.economy}</div></div>
        <div class="info-stat-item"><div class="info-stat-lbl">ESTABILIDAD</div><div class="info-stat-val text-blue">${country.stability}</div></div>
        <div class="info-stat-item"><div class="info-stat-lbl">ESPIONAJE</div><div class="info-stat-val text-gold">${country.espionage}</div></div>
      </div>
      <div class="info-personality">Personalidad: <strong>${personalityLabels[country.personality] || country.personality}</strong>${country.nuclearArms ? ' · ☢️ Nuclear' : ''}</div>
      ${atWarDisplay ? `<div class="info-at-war">⚔️ En guerra con: ${atWarDisplay}</div>` : ''}
      ${alliesDisplay ? `<div class="info-allies-title">ALIADOS</div><div class="info-allies-list">${alliesDisplay}</div>` : ''}
      <div class="divider"></div>
      <div style="font-size:10px;color:var(--text-dim)">⭐ ${country.bonus}: ${country.bonusDesc}</div>`;
  },

  // ── ACTION PANEL ──────────────────────────────────────────

  _EXTERNAL_TABS: new Set(['diplomacy', 'military', 'espionage', 'recon']),

  renderActionList() {
    const g = UI.game;
    const tab = g.activeTab;
    const contextEl = document.getElementById('actions-context');
    const list = document.getElementById('action-list');

    // ── INTERNAL SPECIAL PANELS ───────────────────────────
    if (tab === 'speech') {
      contextEl.innerHTML = `<span class="context-internal">${g.countries[g.playerCountryId].flag} ${g.countries[g.playerCountryId].name} · Discursos</span>`;
      UI._renderSpeechPanel();
      return;
    }
    if (tab === 'opponents') {
      const count = POLITICS.opponents.length;
      contextEl.innerHTML = count
        ? `<span class="context-warning">⚠️ ${count} opositor${count > 1 ? 'es' : ''} activo${count > 1 ? 's' : ''}</span>`
        : `<span class="context-internal">${g.countries[g.playerCountryId].flag} Situación Política</span>`;
      UI._renderOpponentsPanel();
      return;
    }
    if (tab === 'commitments') {
      contextEl.innerHTML = `<span class="context-internal">📋 Lista de Compromisos</span>`;
      UI._renderCommitmentsPanel();
      return;
    }
    if (tab === 'industries') {
      contextEl.innerHTML = `<span class="context-internal">🏭 Industrias & Impuestos</span>`;
      UI._renderIndustriesPanel();
      return;
    }
    if (tab === 'technology' && typeof MP !== 'undefined' && MP.enabled) {
      const pc = g.countries[g.playerCountryId];
      contextEl.innerHTML = `<span class="context-internal">🔬 ${pc.flag} ${pc.name} · Tecnología Militar</span>`;
      UI._renderMPTechPanel();
      return;
    }

    // ── INTERNAL TABS (economy, internal politics) ────────
    if (!UI._EXTERNAL_TABS.has(tab)) {
      const pc = g.countries[g.playerCountryId];
      contextEl.innerHTML = `<span class="context-internal">${pc.flag} ${pc.name}</span>`;
      const actions = ACTIONS[tab] || [];
      list.innerHTML = '';
      for (const action of actions) {
        const cantAfford = !g.canAfford(action.cost);
        const btn = document.createElement('button');
        btn.className = 'btn-action';
        btn.disabled = cantAfford;
        btn.innerHTML = `
          <span class="action-icon">${action.icon}</span>
          <div class="action-info">
            <div class="action-name">${action.name}</div>
            <div class="action-desc">${action.desc}</div>
            <div class="action-cost">${action.cost > 0 ? `💰 $${action.cost}B` : '💰 Gratis'}${cantAfford ? ` · <span class="text-red">Sin fondos</span>` : ''}</div>
          </div>`;
        if (!cantAfford) {
          btn.addEventListener('click', (e) => UI.executeAction(action, null, e));
        }
        list.appendChild(btn);
      }
      return;
    }

    // ── EXTERNAL TABS (diplomacy, military, espionage) ────

    // P2P war panel: check BEFORE target gate so defender (who has own country selected) still sees it
    if (tab === 'military' && typeof MP !== 'undefined' && MP.enabled) {
      const pc2 = g.countries[g.playerCountryId];
      const pvpEnemyId = (pc2?.atWar || []).find(id => g.playerCountries?.[id]);
      if (pvpEnemyId) {
        const extTabs = document.getElementById('external-tabs');
        const intTabs = document.getElementById('internal-tabs');
        if (extTabs?.classList.contains('hidden')) {
          document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
          document.querySelector('.cat-btn[data-cat="external"]')?.classList.add('active');
          intTabs?.classList.add('hidden');
          extTabs.classList.remove('hidden');
          document.querySelectorAll('#external-tabs .tab-btn').forEach(b => b.classList.remove('active'));
          document.querySelector('#external-tabs .tab-btn[data-tab="military"]')?.classList.add('active');
        }
        UI._renderMPWarPanel(pvpEnemyId);
        return;
      }
    }

    const targetId = g.selectedCountryId;
    const target   = targetId && targetId !== g.playerCountryId ? g.countries[targetId] : null;

    if (!target) {
      contextEl.innerHTML = `<span class="context-hint">Haz clic en un país del mapa</span>`;
      list.innerHTML = `
        <div class="external-no-target">
          <div class="no-target-icon">🌍</div>
          <p>Selecciona un país en el mapa para ver las acciones disponibles.</p>
          <p class="no-target-sub">Las acciones exteriores requieren un objetivo.</p>
        </div>`;
      return;
    }

    const rel = g.getRelation(g.playerCountryId, targetId);
    const atWar = g.countries[g.playerCountryId].atWar.includes(targetId);

    // ── CONQUERED TERRITORY — takes over ALL tabs ─────────────
    if (target.conquered && target.conqueror === g.playerCountryId) {
      contextEl.innerHTML = `
        <span class="context-internal">
          ${target.flag} <strong>${target.name}</strong>
          <span class="ctx-rel-badge" style="color:#c9a227">⭐ Tu Territorio</span>
        </span>`;
      list.innerHTML = '';
      list.appendChild(UI._buildConquestPanel(g, targetId));
      return;
    }

    const relLabel = rel > 60 ? '🤝 Aliado' : rel > 30 ? '😊 Amistoso' : rel > -30 ? '😐 Neutral' : rel > -60 ? '😠 Hostil' : '💀 Enemigo';
    const isHumanTarget = typeof MP !== 'undefined' && MP.enabled && g.playerCountries?.[targetId];

    contextEl.innerHTML = `
      <span class="context-external">
        ${target.flag} <strong>${target.name}</strong>
        ${atWar
          ? `<span class="ctx-rel-badge" style="color:#ff3333">⚔️ En Guerra</span>`
          : isHumanTarget
            ? `<span class="ctx-rel-badge" style="color:#3dba6f;border:1px solid #3dba6f;border-radius:4px;padding:1px 5px">👤 JUGADOR</span>`
            : `<span class="ctx-rel-badge" style="color:${rel>30?'#3dba6f':rel<-30?'#d94f4f':'#c9a227'}">${relLabel}</span>`
        }
      </span>`;

    // War panel takes over MILITAR tab when at war with target
    if (tab === 'military' && atWar) {
      UI._renderWarPanel(targetId);
      return;
    }

    // Alliance request panel injected for formal allies in DIPLO tab
    list.innerHTML = '';

    const isAlly = g.countries[g.playerCountryId].allies.includes(targetId);
    if (tab === 'diplomacy' && isAlly) {
      list.appendChild(UI._buildAlliancePanel(g, targetId));
    }

    // MP: if target is a human player, show chat button instead of AI debate
    const isHumanPlayer = typeof MP !== 'undefined' && MP.enabled && g.playerCountries && g.playerCountries[targetId];

    if (tab === 'diplomacy' && isHumanPlayer) {
      const chatBtn = document.createElement('button');
      chatBtn.className = 'btn-action btn-debate-top';
      chatBtn.style.borderColor = '#3dba6f';
      chatBtn.innerHTML = `
        <span class="action-icon">💬</span>
        <div class="action-info">
          <div class="action-name">Chat Diplomático <span class="badge-ai" style="background:#3dba6f">JUGADOR</span></div>
          <div class="action-desc">Envía un mensaje directo al jugador que controla ${target.name}. Los espías pueden interceptar la conversación.</div>
          <div class="action-cost">💰 Gratis</div>
        </div>`;
      chatBtn.addEventListener('click', () => MP_UI.requestMeeting(targetId));
      list.appendChild(chatBtn);
    }

    // AI Debate button (only when target is NOT a human player)
    if (tab === 'diplomacy' && !isHumanPlayer) {
      const isMPClient = typeof MP !== 'undefined' && MP.enabled && !MP.isHost;
      const debateBtn = document.createElement('button');
      debateBtn.className = 'btn-action btn-debate-top';
      debateBtn.innerHTML = `
        <span class="action-icon">🎙️</span>
        <div class="action-info">
          <div class="action-name">Debate Presidencial <span class="badge-ai">IA</span></div>
          <div class="action-desc">${isMPClient ? 'Disponible solo para el host en modo multijugador.' : `Habla directamente con el líder de ${target.name}. Usa argumentos para ganar concesiones diplomáticas.`}</div>
          <div class="action-cost">💰 $20B</div>
        </div>`;
      if (isMPClient) {
        debateBtn.disabled = true;
      } else if (g.canAfford(20)) {
        debateBtn.addEventListener('click', () => {
          g.spend(20);
          DEBATE_UI.open(g, targetId);
        });
      } else {
        debateBtn.disabled = true;
      }
      list.appendChild(debateBtn);
    }

    const actions = ACTIONS[tab] || [];
    for (const action of actions) {
      const cantAfford = !g.canAfford(action.cost);
      const btn = document.createElement('button');
      btn.className = 'btn-action';
      btn.disabled = cantAfford;
      btn.innerHTML = `
        <span class="action-icon">${action.icon}</span>
        <div class="action-info">
          <div class="action-name">${action.name}</div>
          <div class="action-desc">${action.desc}</div>
          <div class="action-cost">${action.cost > 0 ? `💰 $${action.cost}B` : '💰 Gratis'}${cantAfford ? ` · <span class="text-red">Sin fondos</span>` : ''}</div>
        </div>`;
      if (!cantAfford) {
        btn.addEventListener('click', (e) => UI.executeAction(action, targetId, e));
      }
      list.appendChild(btn);
    }
  },

  // ── WAR BATTLE PANEL ─────────────────────────────────────

  _renderWarPanel(enemyId) {
    const g   = UI.game;
    const w   = WAR.getWarState(g, enemyId);
    const enemy = g.countries[enemyId];
    const list  = document.getElementById('action-list');
    if (!w) { list.innerHTML = '<div class="external-no-target"><p>No hay datos de guerra activos.</p></div>'; return; }

    const isAtk    = WAR.isPlayerAttacker(g, enemyId);
    const progColor = w.progress < 30 ? '#d94f4f' : w.progress < 60 ? '#c9a227' : '#3dba6f';
    const foodColor = w.aSupplies.food < 30 ? '#d94f4f' : w.aSupplies.food < 60 ? '#c9a227' : '#3dba6f';
    const ammoColor = w.aSupplies.ammo < 30 ? '#d94f4f' : w.aSupplies.ammo < 60 ? '#c9a227' : '#3dba6f';
    const moralColor = w.aMorale < 35 ? '#d94f4f' : w.aMorale < 60 ? '#c9a227' : '#3dba6f';

    const troopsFmt = (n) => n >= 1000 ? `${(n/1000).toFixed(1)}K` : n;

    list.innerHTML = `
      <!-- TERRITORY PROGRESS -->
      <div class="war-section">
        <div class="war-section-title">📍 CONTROL TERRITORIAL</div>
        <div class="war-progress-wrap">
          <div class="war-progress-fill" style="width:${w.progress}%;background:${progColor}"></div>
        </div>
        <div class="war-progress-labels">
          <span>Tú ${w.progress}%</span>
          <span>${enemy.flag} ${100 - w.progress}%</span>
        </div>
      </div>

      <!-- FORCES -->
      <div class="war-section">
        <div class="war-section-title">⚔️ FUERZAS EN CAMPO</div>
        <div class="war-forces">
          <div class="war-force player-force">
            <div class="war-force-count">${troopsFmt(w.aTroops)}</div>
            <div class="war-force-label">🪖 Tus tropas</div>
            <div class="war-morale-bar">
              <div class="war-morale-fill" style="width:${w.aMorale}%;background:${moralColor}"></div>
            </div>
            <div class="war-morale-label" style="color:${moralColor}">Moral ${w.aMorale}%</div>
          </div>
          <div class="war-vs">VS</div>
          <div class="war-force enemy-force">
            <div class="war-force-count">${troopsFmt(w.dTroops)}</div>
            <div class="war-force-label">${enemy.flag} ${enemy.name}</div>
            <div class="war-morale-bar">
              <div class="war-morale-fill" style="width:${w.dMorale}%;background:#8a2020"></div>
            </div>
            <div class="war-morale-label" style="color:#888">Moral ${w.dMorale}%</div>
          </div>
        </div>
      </div>

      <!-- SUPPLIES -->
      <div class="war-section">
        <div class="war-section-title">📦 SUMINISTROS</div>
        <div class="war-supply-row">
          <span class="supply-icon">🍞</span>
          <div class="supply-bar"><div class="supply-fill" style="width:${w.aSupplies.food}%;background:${foodColor}"></div></div>
          <span class="supply-val" style="color:${foodColor}">${w.aSupplies.food}%</span>
          <button class="btn-supply" data-type="food">Enviar ($16B)</button>
        </div>
        <div class="war-supply-row">
          <span class="supply-icon">🔫</span>
          <div class="supply-bar"><div class="supply-fill" style="width:${w.aSupplies.ammo}%;background:${ammoColor}"></div></div>
          <span class="supply-val" style="color:${ammoColor}">${w.aSupplies.ammo}%</span>
          <button class="btn-supply" data-type="ammo">Enviar ($22B)</button>
        </div>
        <div class="war-strikes">
          ✈️ Misiones aéreas: <strong>${w.aAirStrikes}</strong> &nbsp;|&nbsp; ⚓ Misiones navales: <strong>${w.aNavalStrikes}</strong>
        </div>
      </div>

      ${w.activeEvent ? `
      <!-- ACTIVE WAR EVENT -->
      <div class="war-event-box">
        <div class="war-event-title">${w.activeEvent.title}</div>
        <div class="war-event-desc">${w.activeEvent.desc}</div>
        <div class="war-event-choices">
          ${w.activeEvent.choices.map((ch, i) => `<button class="btn-war-event" data-choice="${i}">${ch.label}</button>`).join('')}
        </div>
      </div>` : ''}

      <!-- BATTLE BUTTONS -->
      <div class="war-section">
        <div class="war-section-title">⚔️ ÓRDENES DE COMBATE</div>
        <div class="war-battle-btns">
          <button class="btn-battle offensive" data-action="offensive">
            <span>⚔️</span><span>Ofensiva General</span>
          </button>
          <button class="btn-battle defense" data-action="defense">
            <span>🛡️</span><span>Defensa Estratégica</span>
          </button>
          <button class="btn-battle air ${w.aAirStrikes <= 0 ? 'disabled' : ''}" data-action="air" ${w.aAirStrikes <= 0 ? 'disabled' : ''}>
            <span>✈️</span><span>Bombardeo Aéreo (${w.aAirStrikes})</span>
          </button>
          <button class="btn-battle naval ${w.aNavalStrikes <= 0 ? 'disabled' : ''}" data-action="naval" ${w.aNavalStrikes <= 0 ? 'disabled' : ''}>
            <span>⚓</span><span>Ataque Naval (${w.aNavalStrikes})</span>
          </button>
          <button class="btn-battle missile ${(g.missiles || 0) <= 0 ? 'disabled' : ''}" data-action="missile" ${(g.missiles || 0) <= 0 ? 'disabled' : ''}>
            <span>🚀</span><span>Misil Balístico (${g.missiles || 0})</span>
          </button>
        </div>
        <button class="btn-action btn-armistice" data-action="armistice">
          🕊️ Proponer Armisticio ($20B)
        </button>
      </div>`;

    // Wire battle buttons
    list.querySelectorAll('.btn-battle:not(.disabled)').forEach(btn => {
      btn.addEventListener('click', () => {
        let result;
        const pcId = g.playerCountryId;
        switch (btn.dataset.action) {
          case 'offensive':
            if (typeof ANIM !== 'undefined') ANIM.showTroops(pcId, enemyId, { count: 8000, duration: 3200 });
            result = WAR.launchOffensive(g, enemyId);
            break;
          case 'defense':
            result = WAR.strategicDefense(g, enemyId);
            break;
          case 'air':
            if (typeof ANIM !== 'undefined') ANIM.showPlane(pcId, enemyId, { emoji: '✈️', label: 'bombardeo', color: '#c9a227', duration: 2500 });
            result = WAR.launchAirStrike(g, enemyId);
            break;
          case 'naval':
            if (typeof ANIM !== 'undefined') ANIM.showPlane(pcId, enemyId, { emoji: '🚢', label: 'flota naval', color: '#4a90d9', duration: 3500 });
            result = WAR.launchNavalStrike(g, enemyId);
            break;
          case 'missile':
            if (typeof ANIM !== 'undefined') ANIM.showPlane(pcId, enemyId, { emoji: '🚀', label: '¡MISIL!', color: '#ff3333', duration: 1800 });
            result = WAR.launchMissileStrike(g, enemyId);
            break;
        }
        if (result) {
          if (result.success && typeof ANIM !== 'undefined') setTimeout(() => ANIM.showBattle(enemyId, 2500), 1200);
          if (typeof SFX !== 'undefined') {
            if (result.conquered) SFX.conquer();
            else if (result.success) SFX.explosion();
            else SFX.fail();
          }
          UI.showModal({ icon: result.conquered ? '🏆' : (result.success ? '⚔️' : '💔'), title: 'Reporte de Combate', body: result.msg, choices: [] });
          UI.refresh();
        }
      });
    });

    // Wire supply buttons
    list.querySelectorAll('.btn-supply').forEach(btn => {
      btn.addEventListener('click', () => {
        const result = WAR.sendSupplies(g, enemyId, btn.dataset.type);
        UI.showToast(result.msg, result.success ? 'success' : 'warning');
        UI.refresh();
      });
    });

    // Wire war event choices
    list.querySelectorAll('.btn-war-event').forEach(btn => {
      btn.addEventListener('click', () => {
        const result = WAR.resolveWarEvent(g, enemyId, +btn.dataset.choice);
        UI.showModal({ icon: result.icon || '⚡', title: 'Evento Resuelto', body: result.msg, choices: [] });
        UI.refresh();
      });
    });

    // Armistice
    const armBtn = list.querySelector('.btn-armistice');
    if (armBtn) {
      armBtn.addEventListener('click', () => {
        if (!g.canAfford(20)) { UI.showToast('Sin fondos para armisticio.', 'warning'); return; }
        const r = ACTIONS.military.find(a => a.id === 'peace_offer').execute(g, enemyId);
        g.spend(r.success ? 20 : 0);
        UI.showModal({ icon: r.success ? '🕊️' : '❌', title: 'Armisticio', body: r.msg, choices: [] });
        UI.refresh();
      });
    }
  },

  // ── P2P WAR PANEL (multiplayer player-vs-player) ──────────

  _mpRadarActive: false,  // local client-side radar toggle

  _renderMPWarPanel(enemyId) {
    const g     = UI.game;
    const list  = document.getElementById('action-list');
    const myId  = g.playerCountryId;
    const enemy = g.countries[enemyId];
    if (!enemy) { list.innerHTML = '<div class="external-no-target"><p>Error: país enemigo no encontrado.</p></div>'; return; }

    const warKey = [myId, enemyId].sort().join('_');
    const mpWar  = (g.mpWarData || {})[warKey];
    if (!mpWar) {
      list.innerHTML = `<div class="external-no-target"><div class="no-target-icon">⚔️</div><p style="color:#ff4444"><strong>En guerra con ${enemy.flag} ${enemy.name}</strong></p><p>Sincronizando datos de guerra…</p></div>`;
      // Auto-retry: STATE with mpWarData may still be in transit
      setTimeout(() => { if (UI.game?.activeTab === 'military') UI.refresh(); }, 600);
      setTimeout(() => { if (UI.game?.activeTab === 'military') UI.refresh(); }, 1800);
      return;
    }

    const myWeapons  = mpWar.weapons?.[myId]  || { aerial: 0, naval: 0, missiles: 0, interceptors: 0 };
    const myTech     = mpWar.tech?.[myId]      || 0;
    const enTech     = mpWar.tech?.[enemyId]   || 0;
    const myTroops   = mpWar.troops?.[myId]    || 0;
    const enTroops   = mpWar.troops?.[enemyId] || 0;
    const myShield   = mpWar.shield?.[myId]    || false;
    const enShield   = mpWar.shield?.[enemyId] || false;
    // progress=0 means original defender wins, progress=100 means original attacker wins
    const amIOriginalAttacker = mpWar.attacker === myId;
    const rawProgress  = mpWar.progress ?? 50;
    // From viewer's perspective: my control %
    const myProgress   = amIOriginalAttacker ? rawProgress : 100 - rawProgress;
    const enProgress   = 100 - myProgress;
    const hasRadar   = myTech >= (typeof WAR_MP !== 'undefined' ? WAR_MP.TECH_RADAR : 5);
    const canBuild   = myTech >= (typeof WAR_MP !== 'undefined' ? WAR_MP.TECH_BUILD : 3);
    const canNuke    = myTech >= (typeof WAR_MP !== 'undefined' ? WAR_MP.TECH_NUKE  : 8);
    const radarOn    = UI._mpRadarActive && hasRadar;
    const techCosts  = typeof WAR_MP !== 'undefined' ? WAR_MP.TECH_COSTS : [80,100,120,150,200,250,300,400,500,800];
    const nextCost   = myTech < 10 ? techCosts[myTech] : null;
    const pending    = mpWar.pendingAttacks || [];
    const fmt        = n => n >= 1000000 ? `${(n/1000000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(0)}K` : n;
    const progColor  = myProgress < 30 ? '#d94f4f' : myProgress < 60 ? '#c9a227' : '#3dba6f';

    list.innerHTML = `
      <!-- TERRITORY CONTROL BAR -->
      <div class="war-section">
        <div class="war-section-title">📍 CONTROL TERRITORIAL</div>
        <div class="war-progress-wrap">
          <div class="war-progress-fill" style="width:${myProgress}%;background:${progColor}"></div>
        </div>
        <div class="war-progress-labels">
          <span>🫵 Tú ${myProgress}%</span>
          <span>${enemy.flag} ${enProgress}%</span>
        </div>
      </div>

      <!-- FORCES -->
      <div class="war-section">
        <div class="war-section-title">⚔️ FUERZAS EN CAMPO</div>
        <div class="war-forces">
          <div class="war-force player-force">
            <div class="war-force-count">${fmt(myTroops)}</div>
            <div class="war-force-label">🪖 Tus tropas</div>
          </div>
          <div class="war-vs">VS</div>
          <div class="war-force enemy-force">
            <div class="war-force-count">${fmt(enTroops)}</div>
            <div class="war-force-label">${enemy.flag} ${enemy.name}</div>
          </div>
        </div>
        <div class="war-tech-row">
          <span>🔬 Tu tecnología: <strong>Lv.${myTech}</strong></span>
          <span>🔬 Su tecnología: <strong>Lv.${enTech}</strong></span>
        </div>
        ${myShield ? '<div class="war-shield-active">🛡️ ESCUDO ACTIVO — protege contra Ofensiva General</div>' : ''}
        ${enShield ? `<div class="war-shield-enemy">🛡️ ${enemy.name} tiene escudo activo</div>` : ''}
      </div>

      <!-- INCOMING ATTACKS (visible only in radar mode) -->
      ${radarOn && pending.filter(a => a.toId === myId).length > 0 ? `
      <div class="war-section war-radar-section">
        <div class="war-section-title">📡 ATAQUES ENTRANTES</div>
        ${pending.filter(a => a.toId === myId).map(a => `
          <div class="war-incoming-attack" data-attack-id="${a.id}">
            <span>${a.type === 'air' ? '✈️' : a.type === 'naval' ? '🚢' : '🚀'} Ataque ${a.type}</span>
            ${myWeapons.interceptors > 0
              ? `<button class="btn-intercept" data-attack-id="${a.id}">🎯 Interceptar</button>`
              : '<span class="no-interceptors">Sin interceptores</span>'}
          </div>`).join('')}
      </div>` : ''}

      <!-- WEAPONS INVENTORY -->
      <div class="war-section">
        <div class="war-section-title">🗄️ ARSENAL</div>
        <div class="war-arsenal">
          <span title="Bombarderos">✈️ ${myWeapons.aerial}</span>
          <span title="Flota naval">⚓ ${myWeapons.naval}</span>
          <span title="Misiles balísticos">🚀 ${myWeapons.missiles}</span>
          ${hasRadar ? `<span title="Interceptores">🎯 ${myWeapons.interceptors}</span>` : ''}
        </div>
      </div>

      <!-- COMBAT ACTIONS -->
      <div class="war-section">
        <div class="war-section-title">${radarOn ? '📡 MODO RADAR — DEFENSA' : '⚔️ ÓRDENES DE COMBATE'}</div>
        ${radarOn ? `
        <!-- RADAR MODE: DEFENSE BUTTONS -->
        <div class="war-battle-btns">
          <button class="btn-battle defense mp-war-btn" data-mp-action="shield" ${myShield ? 'disabled' : ''}>
            <span>🛡️</span><span>Defensa Estratégica${myShield ? ' (ACTIVA)' : ''}</span>
          </button>
          <button class="btn-battle interceptor btn-buy-weapon mp-war-btn" data-weapon="interceptors" data-build="0">
            <span>🎯</span><span>Comprar Interceptor ($120B) ×${myWeapons.interceptors}</span>
          </button>
          ${canBuild
            ? `<button class="btn-battle air btn-buy-weapon mp-war-btn" data-weapon="interceptors" data-build="1"><span>🏭</span><span>Construir interceptores ($190B×2)</span></button>`
            : ''}
        </div>
        <button class="btn-radar-toggle btn-action" id="btn-radar-off">📡 Desactivar Radar</button>
        ` : `
        <!-- NORMAL MODE: ATTACK BUTTONS -->
        <div class="war-battle-btns">
          <button class="btn-battle offensive mp-war-btn ${myShield ? 'disabled' : ''}" data-mp-action="offensive" ${myShield ? 'disabled title="Desactiva el escudo para atacar"' : ''}>
            <span>⚔️</span><span>Ofensiva General</span>
          </button>
          <button class="btn-battle defense mp-war-btn ${myShield ? 'disabled' : ''}" data-mp-action="shield" ${myShield ? 'disabled' : ''}>
            <span>🛡️</span><span>Defensa Estratégica${myShield ? ' (ACTIVA)' : ''}</span>
          </button>
          <button class="btn-battle air mp-war-btn ${myWeapons.aerial <= 0 ? 'disabled' : ''}" data-mp-action="air" ${myWeapons.aerial <= 0 ? 'disabled' : ''}>
            <span>✈️</span><span>Bombardeo Aéreo (${myWeapons.aerial})</span>
          </button>
          <button class="btn-battle naval mp-war-btn ${myWeapons.naval <= 0 ? 'disabled' : ''}" data-mp-action="naval" ${myWeapons.naval <= 0 ? 'disabled' : ''}>
            <span>⚓</span><span>Ataque Naval (${myWeapons.naval})</span>
          </button>
          <button class="btn-battle missile mp-war-btn ${myWeapons.missiles <= 0 ? 'disabled' : ''}" data-mp-action="missile" ${myWeapons.missiles <= 0 ? 'disabled' : ''}>
            <span>🚀</span><span>Misil Balístico (${myWeapons.missiles})</span>
          </button>
          ${canNuke ? `<button class="btn-battle nuclear mp-war-btn" data-mp-action="nuclear"><span>☢️</span><span>BOMBA NUCLEAR ($${typeof WAR_MP !== 'undefined' ? WAR_MP.NUKE_COST : 2000}B)</span></button>` : ''}
        </div>
        ${hasRadar ? `<button class="btn-radar-toggle btn-action" id="btn-radar-on">📡 Activar Radar</button>` : ''}
        `}
        <button class="btn-action btn-mp-peace" id="btn-mp-peace-offer" style="border-color:#3dba6f;color:#3dba6f;margin-top:4px">
          🕊️ Solicitar Paz al Enemigo ($20B)
        </button>
      </div>

      <!-- TECH + WEAPONS SHOP -->
      <div class="war-section war-shop-section">
        <div class="war-section-title">🛒 TECNOLOGÍA Y ARMAMENTO</div>
        ${nextCost ? `
        <button class="btn-action btn-war-tech mp-war-btn" data-mp-action="tech_invest">
          <span class="action-icon">🔬</span>
          <div class="action-info">
            <div class="action-name">Invertir en Tecnología (Lv.${myTech}→${myTech+1})</div>
            <div class="action-desc">${myTech + 1 === (typeof WAR_MP !== 'undefined' ? WAR_MP.TECH_BUILD : 3) ? '🏭 Desbloquea construcción de armas' : myTech + 1 === (typeof WAR_MP !== 'undefined' ? WAR_MP.TECH_RADAR : 5) ? '📡 Desbloquea Radar' : myTech + 1 === (typeof WAR_MP !== 'undefined' ? WAR_MP.TECH_NUKE : 8) ? '☢️ Desbloquea Bomba Nuclear' : `Mejora eficacia del armamento`}</div>
            <div class="action-cost">💰 $${nextCost}B</div>
          </div>
        </button>` : '<div class="war-max-tech">🔬 Tecnología máxima alcanzada (Lv.10)</div>'}

        <div class="war-shop-grid">
          <button class="btn-buy-weapon mp-war-btn" data-weapon="aerial" data-build="0">🛒 Comprar Bombardero ($100B)</button>
          <button class="btn-buy-weapon mp-war-btn" data-weapon="naval"  data-build="0">🛒 Comprar Flota Naval ($80B)</button>
          <button class="btn-buy-weapon mp-war-btn" data-weapon="missiles" data-build="0">🛒 Comprar Misil ($160B)</button>
          ${hasRadar ? `<button class="btn-buy-weapon mp-war-btn" data-weapon="interceptors" data-build="0">🛒 Comprar Interceptor ($120B)</button>` : ''}
          ${canBuild ? `
          <button class="btn-buy-weapon mp-war-btn" data-weapon="aerial" data-build="1">🏭 Construir Bombardero ($160B×2)</button>
          <button class="btn-buy-weapon mp-war-btn" data-weapon="naval"  data-build="1">🏭 Construir Flota Naval ($130B×2)</button>
          <button class="btn-buy-weapon mp-war-btn" data-weapon="missiles" data-build="1">🏭 Construir Misil ($250B×2)</button>
          ${hasRadar ? `<button class="btn-buy-weapon mp-war-btn" data-weapon="interceptors" data-build="1">🏭 Construir Interceptores ($190B×2)</button>` : ''}
          ` : ''}
        </div>
      </div>`;

    // ── Wire all mp_war action buttons ──
    const sendWar = (action, extraParams = {}) => {
      if (typeof MP !== 'undefined' && MP.enabled) {
        MP.sendAction({ cat: 'mp_war', id: action, targetId: enemyId, params: extraParams });
      }
    };

    // Attack / defense buttons
    list.querySelectorAll('.mp-war-btn[data-mp-action]').forEach(btn => {
      if (btn.disabled) return;
      btn.addEventListener('click', () => sendWar(btn.dataset.mpAction));
    });

    // Intercept buttons (in radar mode, on incoming attack rows)
    list.querySelectorAll('.btn-intercept[data-attack-id]').forEach(btn => {
      btn.addEventListener('click', () => sendWar('intercept', { attackId: btn.dataset.attackId }));
    });

    // Buy/build weapon buttons
    list.querySelectorAll('.btn-buy-weapon[data-weapon]').forEach(btn => {
      btn.addEventListener('click', () => {
        sendWar('buy_weapon', { weaponType: btn.dataset.weapon, build: btn.dataset.build === '1' });
      });
    });

    // Radar toggle
    const radarOnBtn  = list.querySelector('#btn-radar-on');
    const radarOffBtn = list.querySelector('#btn-radar-off');
    if (radarOnBtn)  radarOnBtn.addEventListener('click',  () => { UI._mpRadarActive = true;  UI.refresh(); });
    if (radarOffBtn) radarOffBtn.addEventListener('click', () => { UI._mpRadarActive = false; UI.refresh(); });

    // Radar mode CSS on map — also handled by MAP.colorAll() via radar-mode class on #map-container
    const mapEl = document.getElementById('map');
    if (mapEl) mapEl.classList.toggle('radar-mode', !!radarOn);

    // Peace request button — sends through P2P consent system (enemy must accept/reject)
    const peaceBtnEl = list.querySelector('#btn-mp-peace-offer');
    if (peaceBtnEl) {
      peaceBtnEl.addEventListener('click', () => {
        if (!g.canAfford(20)) { UI.showToast('Sin fondos para solicitar paz ($20B requeridos).', 'warning'); return; }
        if (typeof MP === 'undefined' || !MP.enabled) return;
        MP.sendAction({ cat: 'military', id: 'peace_offer', targetId: enemyId, params: {} });
        UI.showToast('🕊️ Solicitud de paz enviada. Esperando respuesta del enemigo…', 'info');
      });
    }
  },

  // ── CONQUERED TERRITORY PANEL ────────────────────────────

  _buildConquestPanel(g, territoryId) {
    const t   = g.countries[territoryId];
    const res = t.resistanceLevel || 0;
    const occ = t.occupationTurns || 0;
    const efficiency = Math.max(0.1, 1 - res / 130);
    const incomeNow  = Math.round((t.economy * 0.35 + (t.resources || 0) * 0.15) * efficiency);
    const incomeMax  = Math.round(t.economy * 0.35 + (t.resources || 0) * 0.15);

    const resColor = res > 70 ? '#d94f4f' : res > 40 ? '#c9a227' : '#3dba6f';

    const wrap = document.createElement('div');
    wrap.className = 'conquest-panel';
    wrap.innerHTML = `
      <div class="conquest-title">🏴 TERRITORIO OCUPADO</div>
      <div class="conquest-sub">${t.flag} ${t.name} — Año ${occ} de ocupación</div>

      <div class="conquest-stats">
        <div class="cq-stat">
          <div class="cq-label">RESISTENCIA INTERNA</div>
          <div class="cq-bar-wrap"><div class="cq-bar" style="width:${res}%;background:${resColor}"></div></div>
          <div class="cq-value" style="color:${resColor}">${res}%</div>
        </div>
        <div class="cq-stat">
          <div class="cq-label">INGRESOS DEL TERRITORIO</div>
          <div class="cq-bar-wrap"><div class="cq-bar" style="width:${(incomeNow/incomeMax*100).toFixed(0)}%;background:#c9a227"></div></div>
          <div class="cq-value" style="color:#c9a227">$${incomeNow}B / $${incomeMax}B max</div>
        </div>
      </div>

      <div class="conquest-actions-title">GESTIÓN DEL TERRITORIO</div>
      <div class="conquest-btns" id="cq-btns-${territoryId}"></div>
      <div class="conquest-risk">⚠️ Alta resistencia puede provocar revuelta y guerra de independencia.</div>
    `;

    const actions = [
      {
        id: 'pacify', icon: '🕊️', name: 'Pacificación', cost: 40,
        desc: 'Inversión en infraestructura y gobernanza. Resistencia -15.',
        fn: () => {
          if (!g.canAfford(40)) return 'Sin fondos suficientes.';
          g.spend(40);
          t.resistanceLevel = Math.max(0, t.resistanceLevel - 15);
          g.addLog(`🕊️ Pacificación en ${t.name}: resistencia -15.`, 'success');
          return `Inversión en ${t.name}. Resistencia: ${t.resistanceLevel}%.`;
        },
      },
      {
        id: 'garrison', icon: '🪖', name: 'Guarnición Militar', cost: 30,
        desc: 'Desplegar tropas. Resistencia -10, estabilidad propia -3.',
        fn: () => {
          if (!g.canAfford(30)) return 'Sin fondos suficientes.';
          g.spend(30);
          t.resistanceLevel = Math.max(0, t.resistanceLevel - 10);
          g.countries[g.playerCountryId].stability = Math.max(5, g.countries[g.playerCountryId].stability - 3);
          g.addLog(`🪖 Guarnición en ${t.name}: resistencia -10, tu estabilidad -3.`, 'success');
          return `Guarnición desplegada. Resistencia: ${t.resistanceLevel}%.`;
        },
      },
      {
        id: 'exploit', icon: '⛏️', name: 'Explotación de Recursos', cost: 0,
        desc: 'Extraer recursos a corto plazo. +$50B pero resistencia +12.',
        fn: () => {
          g.treasury += 50;
          t.resistanceLevel = Math.min(100, t.resistanceLevel + 12);
          g.addLog(`⛏️ Explotación en ${t.name}: +$50B, resistencia +12.`, 'warning');
          return `Recursos extraídos. +$50B. Resistencia ahora: ${t.resistanceLevel}%.`;
        },
      },
      {
        id: 'autonomy', icon: '🏛️', name: 'Otorgar Autonomía', cost: 0,
        desc: 'Reducir control directo. Resistencia -25 pero ingresos -40%.',
        fn: () => {
          t.resistanceLevel = Math.max(0, t.resistanceLevel - 25);
          t.autonomy = true;
          g.addLog(`🏛️ Autonomía otorgada a ${t.name}: resistencia -25. Ingresos reducidos.`, 'info');
          return `${t.name} recibe autonomía. Resistencia: ${t.resistanceLevel}%. Ingresos reducidos permanentemente.`;
        },
      },
    ];

    const btnsContainer = wrap.querySelector(`#cq-btns-${territoryId}`);
    for (const action of actions) {
      const cantAfford = action.cost > 0 && !g.canAfford(action.cost);
      const btn = document.createElement('button');
      btn.className = 'btn-ally-request';
      btn.disabled = cantAfford;
      btn.innerHTML = `
        <span style="font-size:18px">${action.icon}</span>
        <div>
          <div class="ally-req-name">${action.name}${action.cost > 0 ? ` · $${action.cost}B` : ' · Gratis'}</div>
          <div class="ally-req-desc">${action.desc}</div>
        </div>`;
      btn.addEventListener('click', () => {
        const msg = action.fn();
        UI.showModal({ icon: action.icon, title: action.name, body: msg, choices: [] });
        UI.refresh();
      });
      btnsContainer.appendChild(btn);
    }
    return wrap;
  },

  // ── ALLIANCE PANEL (inside diplomacy tab for allies) ──────

  _buildAlliancePanel(g, allyId) {
    const ally    = g.countries[allyId];
    const pc      = g.countries[g.playerCountryId];
    const rel     = g.getRelation(g.playerCountryId, allyId);
    const budget  = Math.round(g.aiTreasuries[allyId] || 0);
    const atWar   = pc.atWar.length > 0;
    const hasWP   = (pc.warPacts || []).includes(allyId);

    const wrap = document.createElement('div');
    wrap.className = 'alliance-panel';

    // War pact badge
    const wpBadge = hasWP
      ? `<span class="wp-badge wp-active">🛡️ PACTO DE GUERRA ACTIVO</span>`
      : ``;

    wrap.innerHTML = `
      <div class="alliance-panel-title">🤝 ALIANZA — ${ally.flag} ${ally.name} ${wpBadge}</div>
      <div class="alliance-rel-hint">Relación: <strong>${rel > 0 ? '+' : ''}${rel}</strong> · Reservas del aliado: ~$${budget}B</div>
      <div class="alliance-btns" id="ap-btns-${allyId}"></div>
      <div class="alliance-risk-note">⚠️ Una negativa puede dañar la alianza o romperla</div>`;

    const pc2 = g.countries[g.playerCountryId];
    const btns = [
      { icon: '💰', name: 'Ayuda Económica', desc: `Fondos de emergencia · reservas: ~$${budget}B`, type: 'economy', disabled: false },
      { icon: '🪖', name: 'Solicitar Tropas', desc: 'Refuerzos militares · llegarán en 2 turnos', type: 'troops', disabled: false },
      { icon: '🔫', name: 'Solicitar Armamento', desc: 'Equipamiento · llega el próximo turno', type: 'weapons', disabled: false },
      { icon: '⚔️', name: 'Pedir que entre en guerra', desc: atWar ? 'Que luchen junto a ti' : 'Solo disponible si estás en guerra', type: 'joinwar', disabled: !atWar },
    ];

    if (!hasWP) {
      const canPact = rel >= 65 && g.treasury >= 80;
      btns.push({ icon: '🛡️', name: 'Establecer Pacto de Defensa', desc: canPact ? 'Defensa mutua automática · $80B' : `Requiere relación ≥65 (tienes ${rel}) y $80B`, type: 'pact', disabled: !canPact });
    } else {
      // War pact options
      btns.push({ icon: '🎯', name: 'Pedir que ataque un País', desc: 'Ordenar un ataque en tu nombre (solo pacto de guerra)', type: 'attackpick', disabled: false });
      const canUnion = rel >= 85 && g.treasury >= 500;
      btns.push({ icon: '⭐', name: 'Proponer Unión · Superpotencia', desc: canUnion ? 'Fusionarse en una sola nación · $500B' : `Requiere rel ≥85 (tienes ${rel}), $500B y pacto de guerra`, type: 'superpower', disabled: !canUnion });
    }

    const container = wrap.querySelector(`#ap-btns-${allyId}`);
    for (const b of btns) {
      const btn = document.createElement('button');
      btn.className = 'btn-ally-request' + (b.disabled ? ' ally-req-disabled' : '');
      if (b.disabled) btn.disabled = true;
      btn.innerHTML = `<span style="font-size:17px">${b.icon}</span><div><div class="ally-req-name">${b.name}</div><div class="ally-req-desc">${b.desc}</div></div>`;
      btn.addEventListener('click', () => {
        if (b.type === 'pact') {
          const r = g.establishWarPact(allyId);
          UI.showModal({ icon: r.ok ? '🛡️' : '❌', title: r.ok ? 'Pacto Firmado' : 'Sin Pacto', body: r.msg, choices: [] });
          UI.refresh(); return;
        }
        if (b.type === 'attackpick') {
          UI._showAttackPickModal(g, allyId); return;
        }
        if (b.type === 'superpower') {
          const r = g.formSuperpower(allyId);
          if (r.ok && typeof ANIM !== 'undefined') { ANIM.showExplosion(allyId, '⭐'); ANIM.showExplosion(g.playerCountryId, '⭐'); }
          UI.showModal({ icon: r.ok ? '⭐' : '❌', title: r.ok ? '¡SUPERPOTENCIA FORMADA!' : 'Unión Rechazada', body: r.msg, choices: [] });
          UI.refresh(); return;
        }
        // In MP: route through multiplayer system if client, or if host asking a human ally
        if (typeof MP !== 'undefined' && MP.enabled) {
          const pcMap = MP.isHost ? MP_GAME.game?.playerCountries : MP_GAME.state?.playerCountries;
          if (!MP.isHost || pcMap?.[allyId]) {
            MP.sendAction({ cat: 'ally_help', id: 'request_ally_help', targetId: allyId, params: { helpType: b.type } });
            return;
          }
        }
        const result = g.requestAllyHelp(allyId, b.type);
        const icon   = result.allianceBroken ? '💔' : result.accepted ? '✅' : '❌';
        UI.showModal({ icon, title: result.accepted ? 'Solicitud Aceptada' : 'Rechazada', body: result.msg, choices: [] });
        UI.refresh();
      });
      container.appendChild(btn);
    }
    return wrap;
  },

  _showAttackPickModal(g, allyId) {
    const ally = g.countries[allyId];
    const pc   = g.countries[g.playerCountryId];
    const targets = Object.entries(g.countries)
      .filter(([id]) => id !== g.playerCountryId && id !== allyId && !pc.allies.includes(id))
      .sort((a, b) => g.getRelation(g.playerCountryId, a[0]) - g.getRelation(g.playerCountryId, b[0]));

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box" style="max-width:360px">
        <div class="modal-icon">🎯</div>
        <div class="modal-header">Pedir a ${ally.flag} ${ally.name} que ataque</div>
        <div class="modal-body" style="margin-bottom:8px">Elige el objetivo:</div>
        <div id="attack-pick-list" style="max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:4px"></div>
        <div class="modal-footer"><button id="atk-cancel" class="modal-close-btn">Cancelar</button></div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('atk-cancel').addEventListener('click', () => overlay.remove());

    const list = document.getElementById('attack-pick-list');
    for (const [id, country] of targets) {
      const btn = document.createElement('button');
      const rel = g.getRelation(g.playerCountryId, id);
      btn.className = 'btn-ally-request';
      btn.style.padding = '6px 10px';
      btn.innerHTML = `<span>${country.flag}</span><div><div class="ally-req-name">${country.name}</div><div class="ally-req-desc">Tu rel: ${rel > 0 ? '+' : ''}${rel}</div></div>`;
      btn.addEventListener('click', () => {
        overlay.remove();
        if (typeof MP !== 'undefined' && MP.enabled) {
          const pcMap = MP.isHost ? MP_GAME.game?.playerCountries : MP_GAME.state?.playerCountries;
          if (!MP.isHost || pcMap?.[allyId]) {
            MP.sendAction({ cat: 'ally_help', id: 'request_ally_help', targetId: allyId, params: { helpType: 'attackcountry', options: { targetId: id } } });
            return;
          }
        }
        const result = g.requestAllyHelp(allyId, 'attackcountry', { targetId: id });
        UI.showModal({ icon: result.accepted ? '⚔️' : '❌', title: result.accepted ? 'Ataque Ordenado' : 'Rechazado', body: result.msg, choices: [] });
        UI.refresh();
      });
      list.appendChild(btn);
    }
  },

  _renderSpeechPanel() {
    const g = UI.game;
    const pc = g.countries[g.playerCountryId];
    const list = document.getElementById('action-list');
    const approval = pc.stability;
    const barColor = approval >= 60 ? '#3dba6f' : approval >= 35 ? '#c9a227' : '#d94f4f';
    const confReady = (g._monthsSinceConf || 0) >= 1;
    const armedGrps = (g.armedGroups || []);

    list.innerHTML = `
      <div class="speech-approval">
        <div class="speech-apr-label">APROBACIÓN POPULAR</div>
        <div class="speech-apr-bar"><div class="speech-apr-fill" style="width:${approval}%;background:${barColor}"></div></div>
        <div class="speech-apr-value" style="color:${barColor}">${approval}%</div>
      </div>
      <button id="btn-pressconf" style="width:100%;margin:8px 0;padding:12px;border-radius:10px;border:2px solid ${confReady ? '#c9a227' : '#2a3650'};background:${confReady ? '#1a1200' : '#0a1020'};color:${confReady ? '#c9a227' : '#555'};font-size:13px;font-weight:700;cursor:${confReady ? 'pointer' : 'not-allowed'};transition:all .2s" ${confReady ? '' : 'disabled'}>
        🎙️ CONFERENCIA DE PRENSA ${confReady ? '' : '— (espera al menos 1 mes)'}
      </button>
      ${armedGrps.length > 0 ? `<div style="margin-bottom:8px;padding:10px;background:#1e0d0d;border:1px solid #5a1a1a;border-radius:8px">
        <div style="color:#e88;font-weight:700;margin-bottom:6px">⚠️ GRUPOS ARMADOS ACTIVOS (${armedGrps.length})</div>
        ${armedGrps.map(grp => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #3a1a1a">
            <div>
              <div style="color:#eee;font-size:13px">${grp.name}</div>
              <div style="color:#888;font-size:11px">Fuerza: ${'🔴'.repeat(grp.strength)}${'⚫'.repeat(3-grp.strength)} · ${grp.monthsActive} mes(es)</div>
            </div>
            <button class="btn-suppress" data-grp="${grp.id}" style="background:#2a0d0d;border:1px solid #d94f4f;color:#e88;padding:5px 10px;border-radius:6px;font-size:11px;cursor:pointer">
              💥 Suprimir ($${grp.strength * 40}B)
            </button>
          </div>`).join('')}
      </div>` : ''}
      <div class="speech-cost-note">Costo por discurso: $25B</div>
      ${SPEECH_TOPICS.map(t => `
        <button class="btn-speech ${!POLITICS.canGiveSpeeach(g) ? 'disabled' : ''}"
          data-topic="${t.id}" ${!POLITICS.canGiveSpeeach(g) ? 'disabled' : ''}>
          <span class="speech-icon" style="color:${t.color}">${t.icon}</span>
          <div class="speech-info">
            <div class="speech-name">${t.name}</div>
            <div class="speech-desc">${t.desc}</div>
          </div>
        </button>`).join('')}`;

    list.querySelectorAll('.btn-speech:not(.disabled)').forEach(btn => {
      btn.addEventListener('click', () => UI.openSpeechModal(btn.dataset.topic));
    });

    const confBtn = document.getElementById('btn-pressconf');
    if (confBtn && confReady) {
      confBtn.addEventListener('click', () => {
        if (typeof PRESS_CONF !== 'undefined') PRESS_CONF.open(g);
      });
    }

    list.querySelectorAll('.btn-suppress').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof MP !== 'undefined' && MP.enabled && !MP.isHost) {
          MP.sendAction({ cat: 'speech', id: 'suppress_group', targetId: null, params: { groupId: btn.dataset.grp } });
          UI.showToast('💥 Supresión enviada al servidor…', 'info');
        } else {
          const result = g.suppressArmedGroup(btn.dataset.grp);
          UI.showToast(result.msg, result.ok ? 'success' : 'warning');
          if (result.ok) { UI.refresh(); UI._renderSpeechPanel(); }
        }
      });
    });
  },

  _renderIndustriesPanel() {
    const g = UI.game;
    const pc = g.countries[g.playerCountryId];
    const list = document.getElementById('action-list');
    const industries = g.industries || [];
    const cap = Math.floor(pc.economy / 20) + 3;
    const totalInd = industries.reduce((s, i) => s + i.annualIncome, 0);

    list.innerHTML = `
      <div style="padding:10px;background:#0a1020;border:1px solid #1a2640;border-radius:10px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="color:#c9a227;font-weight:700;font-size:12px;letter-spacing:1px">🏭 MIS INDUSTRIAS</div>
          <div style="font-size:11px;color:#555">${industries.length}/${cap} slots</div>
        </div>
        ${industries.length === 0
          ? '<div style="color:#555;font-size:12px;text-align:center;padding:10px">Sin industrias construidas aún.</div>'
          : industries.map(ind => `
            <div class="industry-built-card">
              <span style="font-size:20px">${ind.name.split(' ')[0]}</span>
              <div style="flex:1">
                <div style="color:#eee;font-size:13px">${ind.name}</div>
                <div style="color:#3dba6f;font-size:11px">+$${ind.annualIncome}B/año &nbsp;·&nbsp; +$${Math.round(ind.annualIncome/12)}B/mes</div>
              </div>
            </div>`).join('')}
        ${industries.length > 0 ? `<div style="margin-top:8px;font-size:11px;color:#3dba6f;text-align:right">Total industrias: +$${totalInd}B/año</div>` : ''}
      </div>

      <div style="color:#c9a227;font-weight:700;font-size:12px;letter-spacing:1px;margin-bottom:8px">CONSTRUIR NUEVA INDUSTRIA</div>
      ${industries.length >= cap ? `<div style="color:#d94f4f;font-size:12px;padding:8px;background:#1e0d0d;border-radius:8px;margin-bottom:8px">⚠️ Capacidad máxima (${cap}). Mejora economía para ampliar.</div>` : ''}
      <div class="industry-build-grid">
        ${Object.entries(typeof INDUSTRY_DEFS !== 'undefined' ? INDUSTRY_DEFS : {}).map(([type, def]) => {
          const canBuy = g.canAfford(def.cost) && industries.length < cap;
          return `<div class="industry-build-card ${canBuy ? '' : 'disabled'}" data-type="${type}">
            <div style="font-size:22px">${def.name.split(' ')[0]}</div>
            <div style="font-size:12px;color:#eee;margin:4px 0">${def.name.slice(def.name.indexOf(' ') + 1)}</div>
            <div style="font-size:11px;color:#888">${def.desc}</div>
            <div style="display:flex;justify-content:space-between;margin-top:6px">
              <span style="color:#d94f4f;font-size:11px">$${def.cost}B</span>
              <span style="color:#3dba6f;font-size:11px">+$${def.annualIncome}B/año</span>
            </div>
          </div>`;
        }).join('')}
      </div>`;

    list.querySelectorAll('.industry-build-card:not(.disabled)').forEach(card => {
      card.addEventListener('click', () => {
        const result = g.buildIndustry(card.dataset.type);
        UI.showToast(result.msg, result.ok ? 'success' : 'warning');
        if (result.ok) UI._renderIndustriesPanel();
      });
    });
  },

  _renderOpponentsPanel() {
    const list = document.getElementById('action-list');
    if (!POLITICS.opponents.length) {
      list.innerHTML = `<div class="no-opponents"><div style="font-size:32px;margin-bottom:8px">✅</div>No hay opositores activos.<br>Tu posición política es estable.</div>`;
      return;
    }
    list.innerHTML = POLITICS.opponents.map(opp => `
      <div class="opponent-card" data-name="${opp.name}">
        <div class="opp-header">
          <span class="opp-icon">${opp.icon}</span>
          <div class="opp-info">
            <div class="opp-name">${opp.name}</div>
            <div class="opp-title">${opp.title}</div>
          </div>
          <div class="opp-pop ${opp.popularity > 50 ? 'high' : 'low'}">${opp.popularity}%</div>
        </div>
        <div class="opp-desc">${opp.desc}</div>
        <div class="opp-bar"><div class="opp-bar-fill" style="width:${opp.popularity}%;background:${opp.popularity>50?'#d94f4f':'#c9a227'}"></div></div>
        <div class="opp-actions">
          <button class="opp-btn" data-action="debate" data-name="${opp.name}">💬 Debatir</button>
          <button class="opp-btn" data-action="buy"    data-name="${opp.name}">💼 Cooptar ($60B)</button>
          <button class="opp-btn" data-action="repress" data-name="${opp.name}">🚔 Reprimir</button>
          <button class="opp-btn" data-action="ignore" data-name="${opp.name}">🙈 Ignorar</button>
        </div>
      </div>`).join('');

    list.querySelectorAll('.opp-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const result = POLITICS.handleOpponent(UI.game, btn.dataset.name, btn.dataset.action);
        UI.showModal({ icon: result.success ? '✅' : '❌', title: 'Gestión Política', body: result.msg, choices: [] });
        UI.refresh();
      });
    });
  },

  _renderMPTechPanel() {
    const g = UI.game;
    const myId = g.playerCountryId;
    const list = document.getElementById('action-list');

    // Find active P2P war to get war-state tech, otherwise use country-level
    const pvpWar = Object.values(g.mpWarData || {}).find(w =>
      w.attacker === myId || w.defender === myId
    );
    const curTech = pvpWar ? (pvpWar.tech?.[myId] || 0) : (g.countries[myId]?.mpTech || 0);
    const COSTS   = typeof WAR_MP !== 'undefined' ? WAR_MP.TECH_COSTS : [80,100,120,150,200,250,300,400,500,800];
    const BUILD_LV = typeof WAR_MP !== 'undefined' ? WAR_MP.TECH_BUILD : 3;
    const RADAR_LV = typeof WAR_MP !== 'undefined' ? WAR_MP.TECH_RADAR : 5;
    const NUKE_LV  = typeof WAR_MP !== 'undefined' ? WAR_MP.TECH_NUKE  : 8;
    const nextCost = curTech < 10 ? COSTS[curTech] : null;
    const canAffordInvest = nextCost !== null && g.canAfford(nextCost);
    const tPct = Math.round((curTech / 10) * 100);

    // Weapons in stockpile (pre-war) or in war
    const wps = pvpWar ? (pvpWar.weapons?.[myId] || {}) : (g.countries[myId]?.mpWeapons || {});
    const canBuild = curTech >= BUILD_LV;
    const BUY_COSTS  = { aerial: 100, naval: 80, missiles: 160, interceptors: 120 };
    const BUILD_COSTS = { aerial: 160, naval: 130, missiles: 250, interceptors: 190 };
    const weaponNames = { aerial:'Bombarderos', naval:'Flota Naval', missiles:'Misiles', interceptors:'Interceptores' };
    const weaponIcons = { aerial:'✈️', naval:'🚢', missiles:'🚀', interceptors:'🛡️' };

    const unlockBadge = (lv) => curTech >= lv
      ? `<span style="color:#3dba6f;font-size:10px">✅ DESBLOQUEADO</span>`
      : `<span style="color:#888;font-size:10px">🔒 Lv.${lv}</span>`;

    const inWarNote = pvpWar
      ? `<div style="color:#ff9944;font-size:11px;text-align:center;margin-bottom:10px">⚔️ En guerra — mejoras activas en este conflicto</div>`
      : `<div style="color:#888;font-size:11px;text-align:center;margin-bottom:10px">Sin guerra activa — armamento se guardará en reserva</div>`;

    list.innerHTML = `
      <div style="padding:12px 8px">
        ${inWarNote}
        <div class="war-section-title">🔬 NIVEL DE TECNOLOGÍA</div>
        <div style="display:flex;align-items:center;gap:8px;margin:8px 0 4px">
          <div style="flex:1;height:10px;background:#111;border-radius:5px;border:1px solid #333;overflow:hidden">
            <div style="height:100%;width:${tPct}%;background:linear-gradient(90deg,#3dba6f,#c9a227);border-radius:5px;transition:width .4s"></div>
          </div>
          <span style="color:#c9a227;font-weight:700;min-width:36px;text-align:right">Lv.${curTech}/10</span>
        </div>
        <div style="font-size:10px;color:#aaa;margin-bottom:8px;display:flex;gap:16px;flex-wrap:wrap">
          <span>🏭 Construir: ${unlockBadge(BUILD_LV)}</span>
          <span>📡 Radar: ${unlockBadge(RADAR_LV)}</span>
          <span>☢️ Nuclear: ${unlockBadge(NUKE_LV)}</span>
        </div>
        <button id="mp-tech-invest-btn" class="btn-action" style="width:100%;margin-bottom:14px" ${!canAffordInvest ? 'disabled' : ''}>
          <span class="action-icon">🔬</span>
          <div class="action-info">
            <div class="action-name">${curTech >= 10 ? 'Tecnología Máxima' : `Invertir en Tecnología → Lv.${curTech + 1}`}</div>
            <div class="action-desc">${curTech >= 10 ? 'Has alcanzado el nivel máximo.' : 'Aumenta nivel tecnológico y desbloquea capacidades.'}</div>
            <div class="action-cost">${nextCost ? `💰 $${nextCost}B${!canAffordInvest ? ' · <span class="text-red">Sin fondos</span>' : ''}` : '—'}</div>
          </div>
        </button>

        <div class="war-section-title">🛒 COMPRAR ARMAMENTO</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px">
          ${['aerial','naval','missiles','interceptors'].map(wt => {
            const qty = wps[wt] || 0;
            const cost = BUY_COSTS[wt];
            const canA = g.canAfford(cost);
            return `<button class="btn-action mp-buy-btn" data-wtype="${wt}" data-build="0" ${!canA ? 'disabled' : ''}>
              <span class="action-icon">${weaponIcons[wt]}</span>
              <div class="action-info">
                <div class="action-name">${weaponNames[wt]} <span style="color:#c9a227">${qty > 0 ? `(×${qty})` : ''}</span></div>
                <div class="action-cost">💰 $${cost}B${!canA ? ' · <span class="text-red">Sin fondos</span>' : ''}</div>
              </div>
            </button>`;
          }).join('')}
        </div>

        ${canBuild ? `
        <div class="war-section-title">🏭 CONSTRUIR ARMAMENTO <span style="color:#3dba6f;font-size:10px">(+potente, +caro)</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          ${['aerial','naval','missiles','interceptors'].map(wt => {
            const cost = BUILD_COSTS[wt];
            const canA = g.canAfford(cost);
            return `<button class="btn-action mp-buy-btn" data-wtype="${wt}" data-build="1" ${!canA ? 'disabled' : ''}>
              <span class="action-icon">${weaponIcons[wt]}</span>
              <div class="action-info">
                <div class="action-name">Construir ${weaponNames[wt]}</div>
                <div class="action-desc" style="color:#3dba6f">2× daño</div>
                <div class="action-cost">💰 $${cost}B${!canA ? ' · <span class="text-red">Sin fondos</span>' : ''}</div>
              </div>
            </button>`;
          }).join('')}
        </div>` : `
        <div style="text-align:center;color:#555;font-size:11px;padding:10px 0">
          🔒 Construir armamento requiere Tecnología Lv.${BUILD_LV}
        </div>`}
      </div>`;

    // Invest button handler
    document.getElementById('mp-tech-invest-btn')?.addEventListener('click', () => {
      if (!canAffordInvest) return;
      MP.sendAction({ cat: 'mp_tech', id: 'invest_tech', targetId: null, params: {} });
    });

    // Buy/build weapon handlers
    list.querySelectorAll('.mp-buy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const weaponType = btn.dataset.wtype;
        const build = btn.dataset.build === '1';
        MP.sendAction({ cat: 'mp_tech', id: 'buy_weapon', targetId: null, params: { weaponType, build } });
      });
    });
  },

  _renderCommitmentsPanel() {
    const g    = UI.game;
    const pc   = g.countries[g.playerCountryId];
    const list = document.getElementById('action-list');
    const all  = g.commitments || [];
    const pending   = all.filter(c => c.status === 'pending');
    const fulfilled = all.filter(c => c.status === 'fulfilled');
    const broken    = all.filter(c => c.status === 'broken');

    if (!all.length) {
      list.innerHTML = `<div class="no-opponents" style="text-align:center;padding:30px 16px">
        <div style="font-size:36px;margin-bottom:10px">📋</div>
        <div style="color:#c9a227;font-weight:700;margin-bottom:6px">Sin compromisos activos</div>
        <div style="color:#888;font-size:12px">Los compromisos se crean durante negociaciones diplomáticas.<br>Ve a <strong>EXTERIOR → DIPLO</strong> y abre un Debate Presidencial.</div>
      </div>`;
      return;
    }

    const yearsLeft = (deadline) => {
      const diff = deadline - g.year;
      if (diff <= 0) return '<span style="color:#d94f4f">¡Vencido!</span>';
      if (diff === 1) return '<span style="color:#c9a227">Este año</span>';
      return `<span style="color:#3dba6f">${diff} años</span>`;
    };

    const rewardLabel   = { alliance: '🤝 Alianza formal', peace: '🕊️ Fin de guerra', trade: '💱 Tratado comercial', relation: '📈 Relaciones +20', resources: '💵 Recursos / tropas' };
    const penaltyLabel  = { war: '⚔️ Declaran guerra', relation: '📉 Relaciones −20', none: '—' };

    // Evaluate each obligation against current game state
    const evalOb = (ob, targetId) => {
      if (ob.type === 'pay') {
        const met = g.canAfford(ob.amount || 0);
        return { met, icon: met ? '✅' : '❌', label: `Pagar $${ob.amount || '?'}B`, detail: met ? `tienes $${Math.round(g.treasury)}B` : `te faltan $${Math.max(0,(ob.amount||0)-Math.round(g.treasury))}B`, cost: `−$${ob.amount}B del tesoro` };
      }
      if (ob.type === 'military_increase') {
        const met = pc.military > (ob.milSnapshot ?? 0);
        return { met, icon: met ? '✅' : '⏳', label: 'Aumentar ejército', detail: `actual ${pc.military} / era ${ob.milSnapshot ?? 0}`, cost: 'Invierte en Fuerzas Militares (INTERIOR → ECONO)' };
      }
      if (ob.type === 'economy_increase') {
        const met = pc.economy > (ob.ecoSnapshot ?? 0);
        return { met, icon: met ? '✅' : '⏳', label: 'Mejorar economía', detail: `actual ${pc.economy} / era ${ob.ecoSnapshot ?? 0}`, cost: 'Invierte en Economía (INTERIOR → ECONO)' };
      }
      if (ob.type === 'stability_increase') {
        const met = pc.stability > (ob.stabSnapshot ?? 0);
        return { met, icon: met ? '✅' : '⏳', label: 'Mejorar gobierno', detail: `estabilidad actual ${pc.stability} / era ${ob.stabSnapshot ?? 0}`, cost: 'Mejora estabilidad política (INTERIOR → POLIT)' };
      }
      if (ob.type === 'non_aggression' || ob.type === 'no_attack') {
        const met = !pc.atWar.includes(targetId);
        return { met, icon: met ? '✅' : '❌', label: 'No agredir', detail: met ? 'cumpliendo' : '¡ESTÁS EN GUERRA!', cost: 'Automático — no declares guerra' };
      }
      return { met: false, icon: '📝', label: ob.desc || ob.type, detail: '', cost: '' };
    };

    const renderCard = (c) => {
      const target    = g.countries[c.targetId];
      const isPending = c.status === 'pending';
      const obligations = c.obligations || [];
      const isAutoOnly  = obligations.length > 0 && obligations.every(ob => ob.type === 'non_aggression' || ob.type === 'no_attack');

      const obEvals   = obligations.map(ob => evalOb(ob, c.targetId));
      const allMet    = obEvals.length > 0 && obEvals.every(r => r.met);
      const canFulfill = isPending && allMet && !isAutoOnly;

      const borderColor = c.status === 'fulfilled' ? '#3dba6f' : c.status === 'broken' ? '#6b1414' : allMet ? '#c9a227' : '#c9a22744';
      const statusBadge = c.status === 'fulfilled' ? '<span style="color:#3dba6f;font-weight:700">✅ Cumplido</span>'
                        : c.status === 'broken'    ? '<span style="color:#d94f4f;font-weight:700">❌ Roto</span>'
                        : allMet                   ? '<span style="color:#c9a227;font-weight:700">🟡 Listo para cumplir</span>'
                        :                            '<span style="color:#888;font-weight:700">⏳ Pendiente</span>';

      const obRows = obEvals.map((ev, i) => `
        <div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;${i < obEvals.length-1 ? 'border-bottom:1px solid #ffffff0e' : ''}">
          <span style="font-size:14px;flex-shrink:0">${ev.icon}</span>
          <div style="flex:1;min-width:0">
            <div style="color:${ev.met ? '#ddd' : '#aaa'};font-size:12px;font-weight:600">${ev.label}</div>
            <div style="color:#666;font-size:10px">${ev.detail}</div>
            ${!ev.met && isPending ? `<div style="color:#555;font-size:10px;font-style:italic">${ev.cost}</div>` : ''}
          </div>
        </div>`).join('');

      return `<div class="commitment-card" data-id="${c.id}" style="background:#0d1824;border:1px solid ${borderColor};border-radius:10px;padding:12px;margin-bottom:10px;transition:border-color .3s">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px">
          <div style="font-weight:700;font-size:13px;color:#eee">${target?.flag ?? ''} ${target?.name ?? c.targetId}</div>
          ${statusBadge}
        </div>
        <div style="color:#bbb;font-size:12px;margin-bottom:10px;line-height:1.4">${c.description}</div>

        ${obligations.length > 0 ? `<div style="background:#070f1a;border-radius:7px;padding:8px 10px;margin-bottom:8px">
          <div style="color:#555;font-size:10px;font-weight:700;letter-spacing:1px;margin-bottom:4px">CONDICIONES</div>
          ${obRows}
        </div>` : ''}

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;font-size:11px;margin-bottom:${isPending && !isAutoOnly ? '10px' : '0'}">
          <div style="background:#070f1a;border-radius:6px;padding:6px">
            <div style="color:#555;font-size:10px;margin-bottom:2px">RECOMPENSA</div>
            <div style="color:#3dba6f">${rewardLabel[c.reward?.type] || c.rewardDesc || '—'}</div>
          </div>
          <div style="background:#070f1a;border-radius:6px;padding:6px">
            <div style="color:#555;font-size:10px;margin-bottom:2px">PLAZO</div>
            <div>${isPending ? yearsLeft(c.deadline) : `Año ${c.deadline}`}</div>
          </div>
          <div style="background:#070f1a;border-radius:6px;padding:6px;grid-column:span 2">
            <div style="color:#555;font-size:10px;margin-bottom:2px">SI INCUMPLES</div>
            <div style="color:#e88">${penaltyLabel[c.penalty?.type] || c.penaltyDesc || '—'}</div>
          </div>
        </div>

        ${isPending && !isAutoOnly ? `<button class="commitment-fulfill" data-id="${c.id}"
          style="width:100%;padding:10px;font-size:13px;font-weight:700;border-radius:7px;cursor:${canFulfill ? 'pointer' : 'default'};border:1px solid ${canFulfill ? '#3dba6f' : '#333'};
          background:${canFulfill ? 'linear-gradient(135deg,#0d240d,#1a3a1a)' : '#0a0a0a'};color:${canFulfill ? '#3dba6f' : '#444'};transition:all .2s"
          ${canFulfill ? '' : 'disabled'}>
          ${canFulfill ? '✅ Cumplir Compromiso' : '⏳ Completa las condiciones primero'}
        </button>` : ''}
        ${isPending && isAutoOnly ? `<div style="font-size:11px;color:#3dba6f;text-align:center;padding:6px 8px;background:#0d1e0d;border-radius:6px">🔄 Automático — se cumple al vencer el plazo si no has atacado</div>` : ''}
      </div>`;
    };

    let html = '';
    if (pending.length)   html += `<div style="color:#c9a227;font-size:10px;font-weight:700;margin-bottom:8px;letter-spacing:1px">ACTIVOS (${pending.length})</div>` + pending.map(renderCard).join('');
    if (fulfilled.length) html += `<div style="color:#3dba6f;font-size:10px;font-weight:700;margin:14px 0 8px;letter-spacing:1px">CUMPLIDOS (${fulfilled.length})</div>` + fulfilled.map(renderCard).join('');
    if (broken.length)    html += `<div style="color:#d94f4f;font-size:10px;font-weight:700;margin:14px 0 8px;letter-spacing:1px">ROTOS (${broken.length})</div>` + broken.map(renderCard).join('');
    list.innerHTML = html;

    list.querySelectorAll('.commitment-fulfill').forEach(btn => {
      btn.addEventListener('click', () => {
        const result = g.fulfillCommitment(btn.dataset.id);
        if (result.ok) {
          UI.showToast(`✅ ${result.msg}`, 'success');
          UI.refresh();
          MAP.colorAll();
        } else {
          UI.showToast(result.msg.replace(/\n/g, '<br>'), 'warning');
          UI._renderCommitmentsPanel();
        }
      });
    });
  },

  executeAction(action, targetId, event) {
    const g = UI.game;

    // Aid action opens dedicated modal (both local and MP clients)
    if (action.id === 'send_aid' && targetId && typeof openAidModal === 'function') {
      openAidModal(targetId); return;
    }

    // MP client: forward all actions to the host; don't execute locally
    if (typeof MP !== 'undefined' && MP.enabled && !MP.isHost) {
      // Find which ACTIONS category this action belongs to
      let mpCat = null;
      for (const [key, acts] of Object.entries(ACTIONS)) {
        if (acts.some(a => a.id === action.id)) { mpCat = key; break; }
      }
      MP.sendAction({ cat: mpCat, id: action.id, targetId, params: {} });
      if (action.cost > 0 && event) {
        UI.floatNumber(`-$${action.cost}B`, event.clientX - 20, event.clientY - 10, false);
      }
      return;
    }

    // MP host: if target is a human player, let consent system handle it (no chat redirect)
    if (typeof MP !== 'undefined' && MP.enabled && MP.isHost && targetId) {
      const pc = g && g.playerCountries && g.playerCountries[targetId];
      if (pc) {
        // Execute through consent system — exec() will send P2P_REQUEST automatically
        let mpCat = null;
        for (const [key, acts] of Object.entries(ACTIONS)) {
          if (acts.some(a => a.id === action.id)) { mpCat = key; break; }
        }
        MP.sendAction({ cat: mpCat, id: action.id, targetId, params: {} });
        return;
      }
    }

    if (!g.canAfford(action.cost)) return;

    g.spend(action.cost);
    const result = action.execute(g, targetId);

    // Refund if action blocked without executing (noSpend flag)
    if (!result.success && result.noSpend) {
      g.treasury += action.cost;
    }

    // Floating cost near cursor only when money was actually spent
    if (action.cost > 0 && event && !(result.noSpend && !result.success)) {
      UI.floatNumber(`-$${action.cost}B`, event.clientX - 20, event.clientY - 10, false);
    }

    // Toast for quick feedback
    UI.showToast(
      `${action.icon} <strong>${action.name}</strong>: ${result.msg.substring(0, 90)}${result.msg.length > 90 ? '…' : ''}`,
      result.success ? 'success' : 'warning'
    );

    // Full modal
    UI.showModal({ icon: result.success ? action.icon : '❌', title: action.name, body: result.msg, choices: [] });
    UI.refresh();
  },

  // ── SPEECH MODAL ──────────────────────────────────────────

  openSpeechModal(topicId) {
    const topic = SPEECH_TOPICS.find(t => t.id === topicId);
    if (!topic) return;

    const overlay = document.getElementById('speech-overlay');
    overlay.classList.remove('hidden');

    // Step 1: show topic intro
    const deliverEl = document.getElementById('speech-step-deliver');
    deliverEl.classList.remove('hidden');
    document.getElementById('speech-step-result').classList.add('hidden');

    const quote = topic.quotes[Math.floor(Math.random() * topic.quotes.length)];
    document.getElementById('speech-crowd').textContent = topic.crowdSize;
    document.getElementById('speech-topic-name').textContent = topic.icon + ' ' + topic.name;
    document.getElementById('speech-quote-text').textContent = quote;

    // Animate progress bar
    const bar = document.getElementById('speech-progress-bar');
    bar.style.width = '0%';
    bar.style.background = topic.color;
    setTimeout(() => { bar.style.width = '100%'; }, 50);

    // After 2.5s, show result
    setTimeout(() => {
      const result = POLITICS.giveSpeeach(UI.game, topicId);
      if (!result) return;

      deliverEl.classList.add('hidden');
      const resultEl = document.getElementById('speech-step-result');
      resultEl.classList.remove('hidden');

      document.getElementById('speech-result-icon').textContent = result.icon;
      document.getElementById('speech-result-title').textContent =
        result.outcome === 'great' ? '¡Discurso histórico!' :
        result.outcome === 'success' ? 'Discurso exitoso' :
        result.outcome === 'tepid' ? 'Reacción tibia' :
        result.outcome === 'protest' ? '¡Protestas estallaron!' : '¡Ataque opositor!';

      const effects = [];
      if (result.stability !== 0) effects.push(`<span class="${result.stability > 0 ? 'pos' : 'neg'}">Estabilidad ${result.stability > 0 ? '+' : ''}${result.stability}</span>`);
      if (result.economy !== 0) effects.push(`<span class="${result.economy > 0 ? 'pos' : 'neg'}">Economía ${result.economy > 0 ? '+' : ''}${result.economy}</span>`);
      document.getElementById('speech-result-effects').innerHTML = effects.join(' · ');

      const comp = document.getElementById('speech-complications');
      if (result.complication === 'protest') {
        comp.innerHTML = `<div class="complication danger">✊ ¡Protestas en las calles! Un opositor apareció.</div>`;
      } else if (result.complication === 'media') {
        comp.innerHTML = `<div class="complication danger">📰 La prensa independiente te ataca. Revisa Opositores.</div>`;
      } else {
        comp.innerHTML = '';
      }

      UI.refresh();
    }, 2500);
  },

  closeSpeechModal() {
    document.getElementById('speech-overlay').classList.add('hidden');
    document.getElementById('speech-step-deliver').classList.remove('hidden');
    document.getElementById('speech-step-result').classList.add('hidden');
    UI.refresh();
  },

  // ── RENAME COUNTRY ────────────────────────────────────────

  openRenameDialog() {
    const g  = UI.game;
    const pc = g.countries[g.playerCountryId];
    const overlay = document.createElement('div');
    overlay.id = 'rename-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box" style="max-width:340px">
        <div class="modal-icon">✏️</div>
        <div class="modal-header">Renombrar País</div>
        <div class="modal-body" style="margin-bottom:12px">Nombre actual: <strong>${pc.name}</strong></div>
        <input id="rename-input" class="rename-input" type="text" maxlength="28" value="${pc.name}" placeholder="Nuevo nombre..." />
        <div class="modal-footer" style="display:flex;gap:8px;margin-top:12px">
          <button class="btn-action" style="flex:1" id="rename-confirm">✓ Confirmar</button>
          <button class="btn-action" style="flex:1" id="rename-cancel">✕ Cancelar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const input = document.getElementById('rename-input');
    input.focus(); input.select();
    document.getElementById('rename-confirm').addEventListener('click', () => {
      const newName = input.value.trim();
      if (newName) { pc.name = newName; UI.refresh(); }
      overlay.remove();
    });
    document.getElementById('rename-cancel').addEventListener('click', () => overlay.remove());
    input.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('rename-confirm').click(); });
  },

  // ── REGULAR MODAL ─────────────────────────────────────────

  showModal({ icon, title, body, choices }) {
    document.getElementById('modal-icon').textContent = icon || '';
    document.getElementById('modal-header').textContent = title;
    document.getElementById('modal-body').textContent = body;
    const choicesEl = document.getElementById('modal-choices');
    choicesEl.innerHTML = '';
    if (choices && choices.length > 0) {
      choices.forEach(ch => {
        const btn = document.createElement('button');
        btn.className = 'modal-choice-btn';
        btn.textContent = ch.label;
        btn.addEventListener('click', () => {
          if (ch.effect) ch.effect(UI.game);
          UI.closeModal(); UI.refresh();
        });
        choicesEl.appendChild(btn);
      });
      document.getElementById('modal-footer').classList.add('hidden');
    } else {
      document.getElementById('modal-footer').classList.remove('hidden');
    }
    document.getElementById('modal-overlay').classList.remove('hidden');
  },

  // ── CINEMATIC EVENT MODAL (Messenger-style character dialog) ──
  showEventModal(event) {
    const g = UI.game;
    const overlay = document.getElementById('event-overlay');
    if (!overlay) {
      UI.showModal({ icon: event.icon, title: event.name, body: event.description, choices: event.choices || [] });
      return;
    }
    if (typeof SFX !== 'undefined') SFX.alert();

    // Leader portrait
    const leader = typeof getLeader !== 'undefined' ? getLeader(g.playerCountryId) : null;
    const pc = g.countries[g.playerCountryId];
    document.getElementById('event-leader-face').textContent = leader?.avatar || pc?.flag || '👤';
    document.getElementById('event-leader-label').textContent = leader ? `${leader.name}` : '';

    // Type badge
    const badge = document.getElementById('event-type-badge');
    const typeLabels = { economy:'ECONOMÍA', political:'POLÍTICA', military:'MILITAR', espionage:'ESPIONAJE', diplomacy:'DIPLOMACIA', natural:'NATURAL' };
    badge.textContent = typeLabels[event.type] || 'EVENTO';
    badge.className = `event-badge-${event.type || 'political'}`;

    document.getElementById('event-icon-big').textContent = event.icon || '📢';
    document.getElementById('event-title').textContent = event.name;

    // Typewriter effect on description
    const descEl = document.getElementById('event-desc');
    descEl.textContent = '';
    descEl.classList.add('typing');
    const text = event.description || '';
    let i = 0;
    const typeInterval = setInterval(() => {
      descEl.textContent += text[i++];
      if (i >= text.length) { clearInterval(typeInterval); descEl.classList.remove('typing'); }
    }, 20);

    // Choices
    const choicesEl = document.getElementById('event-choices');
    choicesEl.innerHTML = '';
    const choices = event.choices || [];
    if (choices.length > 0) {
      choices.forEach((choice, idx) => {
        const btn = document.createElement('button');
        btn.className = 'event-choice-btn';
        btn.textContent = choice.label;
        btn.addEventListener('click', () => {
          clearInterval(typeInterval);
          overlay.classList.add('hidden');
          if (choice.effect) choice.effect(g);
          g._pendingEvent = null;
          UI.refresh();
          if (typeof SFX !== 'undefined') SFX.click();
        });
        choicesEl.appendChild(btn);
      });
    } else {
      const btn = document.createElement('button');
      btn.className = 'event-choice-btn confirm-only';
      btn.textContent = '✓ Entendido';
      btn.addEventListener('click', () => {
        clearInterval(typeInterval);
        overlay.classList.add('hidden');
        if (event.effect) event.effect(g);
        g._pendingEvent = null;
        UI.refresh();
      });
      choicesEl.appendChild(btn);
    }

    overlay.classList.remove('hidden');
    if (typeof SFX !== 'undefined') {
      const isWar = event.type === 'military';
      const isDanger = event.type === 'natural' || event.type === 'political';
      if (isWar) SFX.war(); else if (isDanger) SFX.alert();
    }
  },

  // ── LEADER AVATAR UPDATE ───────────────────────────────────
  updateLeaderHUD() {
    const g = UI.game;
    if (!g || typeof getLeader === 'undefined') return;
    const leader = getLeader(g.playerCountryId);
    const mood   = typeof getLeaderMood !== 'undefined' ? getLeaderMood(g) : { emoji: '😐', label: 'Neutral', color: '#888' };

    const avatarEl = document.getElementById('leader-avatar');
    const nameEl   = document.getElementById('leader-name');
    const moodEl   = document.getElementById('leader-mood');
    const hudLeader = document.getElementById('hud-leader');

    if (avatarEl) avatarEl.textContent = leader.avatar;
    if (nameEl)   nameEl.textContent   = leader.name;
    if (moodEl)   { moodEl.textContent = mood.emoji; moodEl.style.filter = `drop-shadow(0 0 4px ${mood.color})`; }
    if (hudLeader) hudLeader.dataset.moodLabel = `${mood.emoji} ${mood.label}`;
  },

  // ── LEADER QUIP (speech bubble like Messenger dialog) ─────
  showLeaderQuip() {
    const g = UI.game;
    if (!g || typeof getLeaderQuip === 'undefined') return;
    const existing = document.getElementById('leader-quip');
    if (existing) existing.remove();
    const quip = getLeaderQuip(g.playerCountryId);
    const el = document.createElement('div');
    el.id = 'leader-quip';
    el.textContent = `"${quip}"`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  },

  // ── OBJECTIVES PANEL (Messenger checklist) ────────────────
  renderObjectives() {
    const g = UI.game;
    const listEl = document.getElementById('objectives-list');
    if (!listEl || !g || typeof buildObjectives === 'undefined') return;

    if (!UI._objectives) UI._objectives = buildObjectives(g);
    const objectives = UI._objectives;
    const prevDone = objectives.map(o => UI._objDoneState?.[o.id]);

    listEl.innerHTML = '';
    const newDone = {};
    objectives.forEach((obj, i) => {
      const value  = obj.check(g);
      const pct    = Math.min(100, (value / obj.target) * 100);
      const done   = value >= obj.target;
      newDone[obj.id] = done;

      const item = document.createElement('div');
      item.className = `obj-item${done ? ' done' : ''}`;
      if (done && !prevDone[i]) {
        item.classList.add('just-completed');
        setTimeout(() => item.classList.remove('just-completed'), 700);
        if (typeof SFX !== 'undefined') SFX.success();
        UI.showLeaderQuip();
        // Award treasury bonus on first completion
        g.treasury += 50;
        g.addLog(`🏆 Objetivo completado: "${obj.label}". Bonus +$50B`, 'success');
      }

      item.innerHTML = `
        <div class="obj-check">${done ? '✓' : ''}</div>
        <div class="obj-content">
          <div class="obj-label">${obj.icon} ${obj.label}</div>
          <div class="obj-progress-bar">
            <div class="obj-progress-fill" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="obj-value">${obj.format(value, obj.target)}</div>`;
      listEl.appendChild(item);
    });

    UI._objDoneState = newDone;
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('modal-footer').classList.remove('hidden');
  },

  // ── LOG ───────────────────────────────────────────────────

  renderLog() {
    const entries = document.getElementById('log-entries');
    entries.innerHTML = '';
    const myCountry = UI.game?.playerCountryId;
    const isMP = typeof MP !== 'undefined' && MP.enabled;
    const rawLog = UI.game.log || [];
    // In MP: show own actions + public events; hide other players' private actions
    const log = isMP
      ? rawLog.filter(e => !e._fromPid || e._fromPid === myCountry || e._public)
      : rawLog;
    for (const entry of log.slice(0, 60)) {
      if (entry.message.startsWith('───')) {
        const div = document.createElement('div');
        div.className = 'log-turn'; div.textContent = entry.message;
        entries.appendChild(div); continue;
      }
      const div = document.createElement('div');
      div.className = `log-entry ${entry.type}`;
      // Mark public events from OTHER players with a subtle "GLOBAL" badge
      if (isMP && entry._public && entry._fromPid && entry._fromPid !== myCountry) {
        div.classList.add('log-public');
      }
      div.textContent = entry.message;
      entries.appendChild(div);
    }
  },

  // ── GAME OVER ─────────────────────────────────────────────

  showGameOver() {
    const g = UI.game;
    const pc = g.countries[g.playerCountryId];
    const data = {
      collapse:      { icon: '💥', title: 'COLAPSO DEL ESTADO',   color: '#d94f4f', desc: 'La inestabilidad destruyó tu gobierno. El régimen cayó.' },
      defeat:        { icon: '🏳️', title: 'DERROTA MILITAR',      color: '#d94f4f', desc: 'Tu ejército fue destruido. Has sido conquistado.' },
      bankruptcy:    { icon: '📉', title: 'BANCARROTA',           color: '#d94f4f', desc: 'Tu economía colapsó. No puedes sostener el Estado.' },
      diplomatic:    { icon: '🌍', title: '¡VICTORIA DIPLOMÁTICA!',color: '#3dba6f', desc: 'El mundo entero es tu aliado. Eres el líder de la paz global.' },
      economic:      { icon: '💰', title: '¡DOMINIO ECONÓMICO!',  color: '#c9a227', desc: 'Tu economía domina el planeta. Todos dependen de ti.' },
      military:      { icon: '⚔️', title: '¡HEGEMONÍA MILITAR!', color: '#4a90d9', desc: 'Tu poderío militar es incontestable. Nadie te desafía.' },
      superalliance: { icon: '🤝', title: '¡SUPERALIANZA GLOBAL!',color: '#c9a227', desc: 'Lideras la mayor alianza de la historia.' },
    }[g.victoryType] || { icon: '💥', title: 'FIN DE PARTIDA', color: '#d94f4f', desc: '' };

    document.getElementById('gameover-icon').textContent = data.icon;
    document.getElementById('gameover-title').textContent = data.title;
    document.getElementById('gameover-title').style.color = data.color;
    document.getElementById('gameover-desc').textContent = data.desc;
    document.getElementById('gameover-stats').innerHTML = `
      <div class="gameover-stat"><span>País</span><span>${pc.flag} ${pc.name}</span></div>
      <div class="gameover-stat"><span>Años jugados</span><span>${g.turn}</span></div>
      <div class="gameover-stat"><span>Tesoro final</span><span>$${Math.round(g.treasury)}B</span></div>
      <div class="gameover-stat"><span>Aliados</span><span>${pc.allies.length}</span></div>
      <div class="gameover-stat"><span>Poder Militar</span><span>${pc.military}</span></div>
      <div class="gameover-stat"><span>Aprobación</span><span>${pc.stability}%</span></div>`;
    document.getElementById('gameover-overlay').classList.remove('hidden');
  },

  // ── FULL REFRESH ──────────────────────────────────────────

  refresh() {
    UI.updateHUD();
    MAP.colorAll();
    UI.renderActionList();
    UI.renderLog();
    if (UI.game.selectedCountryId) UI.renderCountryInfo(UI.game.selectedCountryId);
    if (UI.game.gameOver) UI.showGameOver();
  },
};
