// ============================================================
// GAME.JS - Core game state engine
// ============================================================

class GameState {
  constructor(playerCountryId) {
    this.playerCountryId = playerCountryId;
    this.turn = 1;
    this.year = 2025;
    this.globalTension = 20;
    this.treasury = 0;
    this.income = 0;
    this.wars = [];
    this.activeOps = [];
    this.log = [];
    this.selectedCountryId = null;
    this.activeTab = 'economy';
    this.gameOver = false;
    this.victoryType = null;
    this.countries = {};
    this.budget = { income: 0, militaryPct: 30 };
    this.aiTreasuries = {};
    this._pendingEvent = null;
    this.pendingDeliveries = [];
    this.missiles = 0;
    this.commitments = [];
    // New features
    this.month = 0;           // 0-11 (Jan-Dec)
    this.taxRate = 2;         // 1=Mínimos 2=Normales 3=Altos 4=Muy Altos 5=Extremos
    this.industries = [];     // [{id,type,name,annualIncome}]
    this.armedGroups = [];    // [{id,name,strength,type,monthsActive}]
    this._taxHighMonths = 0;  // consecutive months taxRate>=4
    this._monthsSinceConf = 999; // months since last press conference
    this._init();
  }

  _init() {
    // Deep copy + add runtime fields
    for (const [id, data] of Object.entries(COUNTRIES)) {
      this.countries[id] = {
        ...data,
        id,
        relations: {},
        allies: [],
        warPacts: [],
        atWar: [],
        armySize: Math.round(data.military * 8 + Math.random() * 50),
        techLevel: Math.max(1, Math.round(data.military / 20) + 2),
        nuclearArms: ['usa', 'russia', 'china', 'uk', 'france', 'india', 'pakistan', 'north_korea', 'israel'].includes(id),
        sanctions: 0,
        spiesIn: [],
      };
    }
    // Initialize relations from startingRelations
    for (const [id, country] of Object.entries(this.countries)) {
      country.relations = {};
      for (const [otherId] of Object.entries(this.countries)) {
        if (otherId === id) continue;
        const sr = COUNTRIES[id].startingRelations || {};
        const osr = COUNTRIES[otherId].startingRelations || {};
        const myVal = sr[otherId] ?? 0;
        const theirVal = osr[id] ?? 0;
        country.relations[otherId] = Math.round((myVal + theirVal) / 2) || 0;
      }
    }
    // Set allies from relations > 60
    for (const [id, country] of Object.entries(this.countries)) {
      for (const [otherId, rel] of Object.entries(country.relations)) {
        if (rel >= 60 && !country.allies.includes(otherId)) {
          country.allies.push(otherId);
        }
      }
    }
    // AI country treasuries (grow each turn like income)
    for (const [id, country] of Object.entries(this.countries)) {
      this.aiTreasuries[id] = Math.round(country.economy * 5 + Math.random() * 150);
    }
    // Player starting treasury
    this.income = this._calcIncome();
    this.treasury = this.income * 5;
  }

  // Compatibility getter for events.js which accesses state.expensesPerTurn
  get expensesPerTurn() {
    return {
      military: Math.round(this.budget.income * (this.budget.militaryPct / 100)),
    };
  }

  _calcIncome() {
    const pc = this.countries[this.playerCountryId];
    let base = Math.round(pc.economy * 1.2 + (pc.resources || 0) * 0.6 + 20);
    // Conquered territory income (reduced by resistance; autonomy cuts income but decays resistance)
    for (const [, territory] of Object.entries(this.countries)) {
      if (!territory.conquered || territory.conqueror !== this.playerCountryId) continue;
      const resistance    = territory.resistanceLevel || 0;
      const efficiency    = Math.max(0.1, 1 - resistance / 130);
      const autonomyMult  = territory.autonomy ? 0.55 : 1;
      base += Math.round((territory.economy * 0.35 + (territory.resources || 0) * 0.15) * efficiency * autonomyMult);
    }
    // Apply sanctions
    if (pc.sanctions > 0) base = Math.round(base * (1 - pc.sanctions * 0.05));
    // Bonus effects
    if (pc.bonusEffect === 'economy_boost_1.2') base = Math.round(base * 1.2);
    if (pc.bonusEffect === 'economy_boost_1.15') base = Math.round(base * 1.15);
    if (pc.bonusEffect === 'resource_income_1.3') base = Math.round(base * 1.15);
    if (pc.bonusEffect === 'resource_income_1.5') base = Math.round(base * 1.3);
    if (pc.bonusEffect === 'resource_income_1.4') base = Math.round(base * 1.2);
    if (pc.bonusEffect === 'oil_income_2.0') base = Math.round(base * 1.5);
    if (pc.bonusEffect === 'industrial_powerhouse') base = Math.round(base * 1.35);
    // Trade bonuses from allies
    const allyBonus = pc.allies.length * 3;
    let result = base + allyBonus;
    // Tax multiplier
    const TAX_MULT = [0, 0.6, 1.0, 1.4, 1.8, 2.5];
    result = Math.round(result * (TAX_MULT[this.taxRate] || 1.0));
    // Industries
    const industryIncome = (this.industries || []).reduce((sum, i) => sum + (i.annualIncome || 0), 0);
    result += industryIncome;
    if (this.budget) this.budget.income = result;
    return result;
  }

  // Called every minute (1 game month)
  nextMonth() {
    this.month = (this.month + 1) % 12;

    // Monthly income = annual / 12
    this.income = this._calcIncome();
    const monthly = Math.round(this.income / 12);
    this.treasury += monthly;

    // Stability drain/gain from tax rate
    const TAX_DRAIN = { 1: 1, 2: 0, 3: -1, 4: -2, 5: -4 };
    const pc = this.countries[this.playerCountryId];
    const drain = TAX_DRAIN[this.taxRate] ?? 0;
    if (drain !== 0) pc.stability = Math.max(0, Math.min(100, pc.stability + drain));

    // Track high-tax streak for armed group formation
    if (this.taxRate >= 4) this._taxHighMonths = (this._taxHighMonths || 0) + 1;
    else this._taxHighMonths = Math.max(0, (this._taxHighMonths || 0) - 1);

    // Update armed groups
    this._updateArmedGroups();

    // AI monthly actions (arms buying, spontaneous wars)
    this._aiMonthlyActions();

    // Monthly press conference check
    this._monthsSinceConf = (this._monthsSinceConf || 999) + 1;
    if (this._monthsSinceConf >= 6 && pc.stability < 40 && typeof UI !== 'undefined') {
      UI.showToast(`📢 Tu pueblo exige una conferencia de prensa. Ve a <strong>INTERIOR → CHARLA</strong>.`, 'warning');
      this._monthsSinceConf = 3; // give 3 more months before next reminder
    }

    return this.month === 0; // true → year just wrapped
  }

  setTaxRate(rate) {
    if (rate < 1 || rate > 5) return;
    const pc = this.countries[this.playerCountryId];
    const TAX_NAMES = ['', 'Mínimos', 'Normales', 'Altos', 'Muy Altos', 'Extremos'];
    const old = this.taxRate;
    this.taxRate = rate;
    this.income = this._calcIncome();
    const diff = rate - old;
    const monthlyDrain = { 1: '+1', 2: '0', 3: '−1', 4: '−2', 5: '−4' }[rate];
    this.addLog(`💰 Impuestos → ${TAX_NAMES[rate]}. Ingresos anuales: $${this.income}B. Estabilidad mensual: ${monthlyDrain}.`, rate >= 4 ? 'warning' : 'info');
    if (rate >= 4) UI?.showToast?.('⚠️ Impuestos muy altos. La población empieza a descontentarse.', 'warning');
  }

  buildIndustry(type) {
    const TYPES = {
      factory:           { name: '🏭 Fábrica',             annualIncome: 30, cost: 80  },
      tech_park:         { name: '🔬 Parque Tecnológico',  annualIncome: 55, cost: 160 },
      port:              { name: '⚓ Puerto Comercial',     annualIncome: 40, cost: 100 },
      power_plant:       { name: '⚡ Central Eléctrica',    annualIncome: 25, cost: 60  },
      industrial_complex:{ name: '🏗️ Complejo Industrial', annualIncome: 80, cost: 220 },
    };
    const def = TYPES[type];
    if (!def) return { ok: false, msg: 'Tipo de industria inválido.' };
    if (!this.canAfford(def.cost)) return { ok: false, msg: `Fondos insuficientes. Necesitas $${def.cost}B.` };
    const cap = Math.floor(this.countries[this.playerCountryId].economy / 20) + 3;
    if ((this.industries || []).length >= cap) return { ok: false, msg: `Capacidad máxima de industrias alcanzada (${cap}). Mejora tu economía para ampliar.` };
    this.spend(def.cost);
    const ind = { id: Date.now() + '_' + type, type, name: def.name, annualIncome: def.annualIncome };
    this.industries.push(ind);
    this.income = this._calcIncome();
    this.addLog(`🏭 ${def.name} construida. Ingresos anuales +$${def.annualIncome}B.`, 'success');
    return { ok: true, msg: `${def.name} construida. Genera +$${def.annualIncome}B/año adicionales.` };
  }

  _updateArmedGroups() {
    const pc = this.countries[this.playerCountryId];
    const dangerous = pc.stability < 40 || (this._taxHighMonths || 0) >= 3;
    if (dangerous && (this.armedGroups || []).length < 3 && Math.random() < 0.12) {
      const strength = pc.stability < 20 ? 2 : 1;
      const type = (this._taxHighMonths || 0) >= 6 ? 'rebels' : 'militia';
      this.armedGroups = this.armedGroups || [];
      this.armedGroups.push({
        id: Date.now() + '_grp',
        name: type === 'rebels' ? 'Rebeldes Armados' : 'Grupo Miliciano',
        type, strength, monthsActive: 0,
      });
      this.addLog(`⚠️ Ha surgido un ${type === 'rebels' ? 'grupo rebelde' : 'grupo miliciano'} en tu territorio.`, 'danger');
      UI?.showToast?.('⚠️ Nuevo grupo armado. Ve a <strong>INTERIOR → POLIT</strong> para suprimirlo.', 'warning');
    }
    this.armedGroups = this.armedGroups || [];
    for (const grp of this.armedGroups) {
      grp.monthsActive = (grp.monthsActive || 0) + 1;
      if (grp.monthsActive % 4 === 0 && grp.strength < 3) {
        grp.strength++;
        if (grp.strength === 3) {
          grp.name = 'Golpistas';
          grp.type = 'coup_plotters';
          this.addLog('🔴 ¡El grupo se ha convertido en golpistas! Peligro inminente de golpe.', 'danger');
          UI?.showToast?.('🔴 ¡ALERTA DE GOLPE! Suppríme el grupo inmediatamente.', 'warning');
        }
      }
      const actionChance = grp.type === 'coup_plotters' ? 0.35 : grp.strength * 0.08;
      if (Math.random() < actionChance) {
        if (grp.type === 'coup_plotters') this._attemptCoup(grp);
        else {
          const impact = grp.strength * _rnd(2, 5);
          pc.stability = Math.max(0, pc.stability - impact);
          const msgs = [
            `💥 ${grp.name} atacó instalaciones gubernamentales. Estabilidad −${impact}.`,
            `📢 ${grp.name} organiza protestas masivas. Estabilidad −${impact}.`,
            `🔥 ${grp.name} incita disturbios en la capital. Estabilidad −${impact}.`,
          ];
          this.addLog(msgs[_rnd(0, 2)], 'warning');
        }
      }
    }
  }

  _attemptCoup(grp) {
    const pc = this.countries[this.playerCountryId];
    this.addLog('🚨 ¡INTENTO DE GOLPE DE ESTADO EN CURSO!', 'danger');
    UI?.showToast?.('🚨 ¡GOLPE DE ESTADO! Tu ejército combate a los golpistas.', 'warning');
    if (pc.military >= 65) {
      const hit = _rnd(8, 15);
      pc.stability = Math.max(5, pc.stability - hit);
      this.armedGroups = this.armedGroups.filter(g => g.id !== grp.id);
      this.addLog(`✅ Golpe FRACASADO. Fuerzas leales aplastaron a los golpistas. Estabilidad −${hit}.`, 'success');
    } else if (pc.military < 30 || (Math.random() < 0.5 && pc.military < 50)) {
      this.gameOver = true;
      this.victoryType = 'coup';
      this.addLog('☠️ El golpe de estado tuvo ÉXITO. El gobierno ha caído. GAME OVER.', 'danger');
    } else {
      const hit = _rnd(10, 20);
      pc.stability = Math.max(5, pc.stability - hit);
      this.armedGroups = this.armedGroups.filter(g => g.id !== grp.id);
      this.addLog(`✅ Golpe repelido por poco. Estabilidad −${hit}.`, 'warning');
    }
  }

  suppressArmedGroup(groupId) {
    const pc = this.countries[this.playerCountryId];
    const grp = (this.armedGroups || []).find(g => g.id === groupId);
    if (!grp) return { ok: false, msg: 'Grupo no encontrado.' };
    const cost = grp.strength * 40;
    if (!this.canAfford(cost)) return { ok: false, msg: `Necesitas $${cost}B para suprimir este grupo.` };
    if (pc.military < 30) return { ok: false, msg: 'Tu ejército es demasiado débil para una supresión efectiva.' };
    this.spend(cost);
    this.armedGroups = this.armedGroups.filter(g => g.id !== groupId);
    pc.stability = Math.min(100, pc.stability + _rnd(3, 8));
    this.addLog(`✅ ${grp.name} suprimido. La región se estabiliza.`, 'success');
    return { ok: true, msg: `${grp.name} neutralizado. Estabilidad recuperada.` };
  }

  _aiMonthlyActions() {
    const pid = this.playerCountryId;
    const pc = this.countries[pid];
    for (const [id, country] of Object.entries(this.countries)) {
      if (id === pid || country.conquered) continue;
      if (this.playerCountries?.[id]) continue; // human player controls this country
      const rel = this.getRelation(id, pid);
      const rand = Math.random();
      // AI buys arms randomly
      if (this.aiTreasuries[id] > 80 && rand < 0.06) {
        country.military = Math.min(100, country.military + _rnd(1, 3));
        this.aiTreasuries[id] -= _rnd(15, 40);
      }
      // AI spontaneously declares war when very hostile and strong enough
      const canWar = rel < -60
        && country.military > pc.military * 0.85
        && !country.atWar.includes(pid)
        && !pc.allies.includes(id)
        && rand < 0.015;
      if (canWar) {
        this.startWar(id, pid);
        this.addLog(`🚨 ¡${country.flag} ${country.name} TE HA DECLARADO LA GUERRA!`, 'danger');
        this.globalTension = Math.min(100, this.globalTension + 15);
        UI?.showToast?.(`🚨 ¡<strong>${country.name}</strong> ha declarado guerra! Prepara tu defensa.`, 'warning');
      }
    }
  }

  getRelation(a, b) {
    return this.countries[a]?.relations[b] ?? 0;
  }

  changeRelation(a, b, delta) {
    if (!this.countries[a] || !this.countries[b]) return;
    const current = this.countries[a].relations[b] ?? 0;
    this.countries[a].relations[b] = Math.max(-100, Math.min(100, current + delta));
    // Mirror (asymmetric — other side shifts half as much)
    const mirrorCurrent = this.countries[b].relations[a] ?? 0;
    this.countries[b].relations[a] = Math.max(-100, Math.min(100, mirrorCurrent + Math.round(delta / 2)));
    // Update ally status
    this._updateAllyStatus(a, b);
  }

  _updateAllyStatus(a, b) {
    const rel      = this.getRelation(a, b);
    const countryA = this.countries[a];
    const countryB = this.countries[b];
    const pid      = this.playerCountryId;
    // Never add conquered territories back to allies
    const aConquered = countryA.conquered && countryA.conqueror === pid;
    const bConquered = countryB.conquered && countryB.conqueror === pid;
    if (!aConquered && !bConquered && rel >= 60) {
      if (!countryA.allies.includes(b)) countryA.allies.push(b);
      if (!countryB.allies.includes(a)) countryB.allies.push(a);
    } else {
      countryA.allies = countryA.allies.filter(id => id !== b);
      countryB.allies = countryB.allies.filter(id => id !== a);
    }
    // War pact breaks if relation drops below 50
    if (rel < 50 || aConquered || bConquered) {
      countryA.warPacts = (countryA.warPacts || []).filter(id => id !== b);
      countryB.warPacts = (countryB.warPacts || []).filter(id => id !== a);
    }
  }

  // Merge with an ally to form a superpower
  formSuperpower(allyId) {
    const pc   = this.countries[this.playerCountryId];
    const ally = this.countries[allyId];
    if (!pc || !ally) return { ok: false, msg: 'País no encontrado.' };
    if (!(pc.warPacts || []).includes(allyId))
      return { ok: false, msg: `Necesitas un Pacto de Guerra con ${ally.name} para proponer la unión.` };
    const rel = this.getRelation(this.playerCountryId, allyId);
    if (rel < 85) return { ok: false, msg: `Relación insuficiente (necesitas ≥85, tienes ${rel}). Mejora la relación primero.` };
    if (this.treasury < 500) return { ok: false, msg: 'La unión requiere $500B para infraestructura común.' };

    this.treasury -= 500;

    // Merge stats
    const econGain   = Math.round(ally.economy * 0.45);
    const milGain    = Math.round(ally.military * 0.35);
    const resGain    = Math.round((ally.resources || 0) * 0.5);
    pc.economy       = Math.min(100, pc.economy + econGain);
    pc.military      = Math.min(100, pc.military + milGain);
    pc.resources     = Math.min(100, (pc.resources || 0) + resGain);
    pc.stability     = Math.round((pc.stability + ally.stability) / 2);
    pc.armySize      += Math.round(ally.armySize * 0.6);

    // Mark ally as merged
    ally.merged        = true;
    ally.mergedInto    = this.playerCountryId;
    ally.conquered     = true;
    ally.conqueror     = this.playerCountryId;
    ally.resistanceLevel = 0;
    ally.occupationTurns = 0;

    // Remove from separate ally lists
    pc.allies    = pc.allies.filter(id => id !== allyId);
    pc.warPacts  = (pc.warPacts || []).filter(id => id !== allyId);

    this.globalTension = Math.min(100, this.globalTension + 20);
    // International relations hit
    for (const [id] of Object.entries(this.countries)) {
      if (id !== this.playerCountryId && id !== allyId) this.changeRelation(this.playerCountryId, id, -5);
    }

    this.income = this._calcIncome();
    this.addLog(`⭐ ¡${ally.name} y ${pc.name} se fusionan en una SUPERPOTENCIA! Economía +${econGain}, Militar +${milGain}.`, 'success');
    return { ok: true, msg: `¡${ally.flag} ${ally.name} se une a tu nación! Economía +${econGain}, Militar +${milGain}, Recursos +${resGain}.\nNuevas tropas integradas: +${Math.round(ally.armySize * 0.6).toLocaleString()}.` };
  }

  // Establish a defense pact between player and an ally
  establishWarPact(allyId) {
    const pc   = this.countries[this.playerCountryId];
    const ally = this.countries[allyId];
    if (!pc || !ally) return { ok: false, msg: 'País no encontrado.' };
    if (!pc.allies.includes(allyId)) return { ok: false, msg: `${ally.name} debe ser aliado formal primero.` };
    if ((pc.warPacts || []).includes(allyId)) return { ok: false, msg: `Ya tienes un pacto de guerra con ${ally.name}.` };
    const rel = this.getRelation(this.playerCountryId, allyId);
    if (rel < 65) return { ok: false, msg: `Relación insuficiente con ${ally.name} (necesitas ≥65, tienes ${rel}).` };
    if (this.treasury < 80) return { ok: false, msg: 'Necesitas $80B para formalizar el pacto.' };
    this.treasury -= 80;
    pc.warPacts    = pc.warPacts || [];
    ally.warPacts  = ally.warPacts || [];
    if (!pc.warPacts.includes(allyId))   pc.warPacts.push(allyId);
    if (!ally.warPacts.includes(this.playerCountryId)) ally.warPacts.push(this.playerCountryId);
    this.changeRelation(this.playerCountryId, allyId, 15);
    this.addLog(`🛡️ Pacto de Defensa Mutua firmado con ${ally.flag} ${ally.name}. Si te atacan, ellos entran a la guerra.`, 'success');
    return { ok: true, msg: `Pacto de Defensa firmado con ${ally.name}. Coste: $80B. Relación +15.` };
  }

  addLog(message, type = 'info') {
    this.log.unshift({ message, type, turn: this.turn });
    if (this.log.length > 100) this.log.pop();
  }

  // ── ACTIONS ──────────────────────────────────────────────

  canAfford(cost) {
    return this.treasury >= cost;
  }

  spend(cost) {
    this.treasury -= cost;
    this.income = this._calcIncome();
  }

  // ── TURN PROCESSING ──────────────────────────────────────

  _applyDeliveries() {
    const pc = this.countries[this.playerCountryId];
    for (const d of [...this.pendingDeliveries]) {
      if (d.arrivesOnTurn > this.turn) continue;
      this.pendingDeliveries = this.pendingDeliveries.filter(x => x !== d);
      switch (d.type) {
        case 'economy':
          this.treasury += d.amount;
          if (typeof ANIM !== 'undefined') ANIM.showExplosion(this.playerCountryId, '💰');
          this.addLog(`✅ Fondos de ${d.fromName} recibidos: +$${d.amount}B.`, 'success');
          break;
        case 'troops':
          pc.armySize += d.amount;
          if (typeof ANIM !== 'undefined') ANIM.showExplosion(this.playerCountryId, '🪖');
          this.addLog(`✅ Refuerzos de ${d.fromName} han llegado: +${d.amount.toLocaleString()} soldados.`, 'success');
          break;
        case 'weapons':
          pc.military = Math.min(100, pc.military + d.amount);
          if (pc.atWar.length > 0) {
            const w = this.wars.find(ww => ww.attacker === this.playerCountryId || ww.defender === this.playerCountryId);
            if (w && w.aSupplies) w.aSupplies.ammo = Math.min(100, w.aSupplies.ammo + 20);
          }
          if (typeof ANIM !== 'undefined') ANIM.showExplosion(this.playerCountryId, '🔫');
          this.addLog(`✅ Armamento de ${d.fromName} recibido: poder militar +${d.amount}.`, 'success');
          break;
      }
    }
  }

  nextTurn() {
    // Resolve in-transit deliveries
    this._applyDeliveries();

    // Income is now collected monthly (nextMonth) — just refresh the display value
    this.income = this._calcIncome();

    // War attrition
    this._processWars();

    // Conquered territory resistance & protests
    this._processConquests();

    // Alliance auto-help + AI budget growth
    this._allyAutoHelp();

    // AI decisions
    this._aiTurn();

    // AI alliance formation + enemy persuasion of player allies
    this._processAIAlliances();

    // Random event
    const event = pickRandomEvent(this);
    if (event) {
      this._fireEvent(event);
    }

    // Passive changes
    this._passiveUpdates();

    // Check victory/defeat
    this._checkGameOver();

    // War events / supply drain
    if (typeof WAR !== 'undefined') WAR.processTurn(this);

    // Political opponents take their turn
    if (typeof POLITICS !== 'undefined') POLITICS.processTurn(this);

    this.turn++;
    this.year++;
    this.addLog(`─── Año ${this.year} ───`, 'info');
    this.income = this._calcIncome();

    return event;
  }

  _processWars() {
    const pc = this.countries[this.playerCountryId];
    for (const war of [...this.wars]) {
      const attacker = this.countries[war.attacker];
      const defender = this.countries[war.defender];
      if (!attacker || !defender) continue;

      const isPlayerWar = (war.attacker === this.playerCountryId || war.defender === this.playerCountryId);

      // Player-controlled wars use WAR.js battle system + active AI defense
      if (isPlayerWar) {
        this.treasury -= _rnd(8, 18);
        this.globalTension = Math.min(100, this.globalTension + 2);

        const enemy   = war.attacker === this.playerCountryId ? defender : attacker;
        const enemyId = war.attacker === this.playerCountryId ? war.defender : war.attacker;
        const playerIsAttacker = war.attacker === this.playerCountryId;

        // ── ENEMY ACTIVE RESPONSE ─────────────────────────────
        // 1. Spy sabotage against player
        if (enemy.espionage > 45 && Math.random() < 0.18) {
          const loss = _rnd(2, 7);
          pc.stability = Math.max(5, pc.stability - loss);
          if (typeof ANIM !== 'undefined') ANIM.showSpy(enemyId, this.playerCountryId);
          this.addLog(`🕵️ Sabotaje de ${enemy.flag} ${enemy.name}: estabilidad -${loss}.`, 'warning');
        }

        // 2. Enemy tries to recruit allies
        if (Math.random() < 0.10) {
          const potentialAlly = Object.entries(enemy.relations)
            .filter(([tid, rel]) => {
              if (tid === this.playerCountryId) return false;
              const c = this.countries[tid];
              return c && rel > 35 && !c.atWar.includes(enemyId) && !c.allies.includes(this.playerCountryId);
            })
            .sort((a, b) => b[1] - a[1])[0];
          if (potentialAlly) {
            const [allyId] = potentialAlly;
            const allyCountry = this.countries[allyId];
            if (Math.random() < 0.30) {
              if (!allyCountry.atWar.includes(this.playerCountryId)) {
                this.startWar(allyId, this.playerCountryId);
                this.addLog(`⚠️ ¡${allyCountry.flag} ${allyCountry.name} se une a la guerra contra ti por influencia de ${enemy.name}!`, 'danger');
              }
            } else {
              this.addLog(`🔔 ${enemy.name} busca apoyo de ${allyCountry.name}. Vigilancia aumentada.`, 'warning');
            }
          }
        }

        // 3. Counter-attack by defender (reduces player's war progress)
        if (playerIsAttacker && war.progress > 5 && Math.random() < 0.22) {
          const counter  = _rnd(3, 12);
          war.progress   = Math.max(0, (war.progress || 0) - counter);
          const armyLoss = _rnd(50, 200);
          pc.armySize    = Math.max(0, pc.armySize - armyLoss);
          if (typeof ANIM !== 'undefined') ANIM.showBattle(enemyId, 2500);
          this.addLog(`⚔️ Contraofensiva de ${enemy.flag} ${enemy.name}: progreso -${counter}%, pierdes ${armyLoss} soldados.`, 'warning');
        }

        // 4. If player is defender, attacker pushes
        if (!playerIsAttacker && war.progress !== undefined) {
          const atkPush = _rnd(2, 6);
          war.progress  = Math.min(100, (war.progress || 0) + atkPush);
          if (war.progress >= 100) { this._endWar(war, war.attacker); }
          else if (atkPush > 2) this.addLog(`${enemy.flag} ${enemy.name} presiona tus defensas. Progreso enemigo +${atkPush}%.`, 'danger');
        }
        continue;
      }

      // AI vs AI wars — full auto-combat
      const atkPower = attacker.military * attacker.techLevel + attacker.armySize * 0.5;
      const defPower = defender.military * defender.techLevel + defender.armySize * 0.5 + 20;
      const atkWin   = Math.random() > (defPower / (atkPower + defPower));
      if (atkWin) {
        defender.military  = Math.max(5, defender.military  - _rnd(3, 8));
        defender.stability = Math.max(5, defender.stability - _rnd(4, 10));
        defender.economy   = Math.max(5, defender.economy   - _rnd(2, 6));
        attacker.armySize  = Math.floor(attacker.armySize * 0.95);
        if (defender.military < 10 && defender.stability < 15) { this._endWar(war, war.attacker); continue; }
      } else {
        attacker.military = Math.max(5, attacker.military - _rnd(2, 6));
        attacker.armySize = Math.floor(attacker.armySize * 0.92);
      }
      this.globalTension = Math.min(100, this.globalTension + 2);
    }
  }

  _endWar(war, winnerId) {
    const winner = this.countries[winnerId];
    const loserId = winnerId === war.attacker ? war.defender : war.attacker;
    const loser = this.countries[loserId];
    loser.atWar  = loser.atWar.filter(id => id !== winnerId);
    winner.atWar = winner.atWar.filter(id => id !== loserId);
    this.wars    = this.wars.filter(w => w !== war);

    if (winnerId === this.playerCountryId) {
      // Scale rewards by how powerful the loser was
      const powerMult    = 1 + (loser.military + loser.economy) / 120;
      const stabilityLoss = Math.round(_rnd(8, 18) * (1 + loser.military / 150));
      const loot          = Math.round((_rnd(60, 150) + loser.economy * 2.2 + loser.military * 1.5) * powerMult);
      const capturedArmy  = Math.round((loser.armySize || 100) * 0.35);
      const capturedMil   = Math.round(loser.military * 0.22);
      const techGain      = loser.techLevel >= 7 ? 1 : 0;

      // Mark conquered — remove from all relation lists (it's territory, not a country)
      loser.conquered       = true;
      loser.conqueror       = this.playerCountryId;
      loser.occupationTurns = 0;
      loser.resistanceLevel = Math.min(92, Math.round(loser.stability * 0.75 + 35));
      winner.allies    = winner.allies.filter(id => id !== loserId);
      winner.warPacts  = (winner.warPacts || []).filter(id => id !== loserId);
      loser.allies     = loser.allies.filter(id => id !== this.playerCountryId);

      // Spoils of war — scale with power
      this.treasury    += loot;
      winner.armySize  += capturedArmy;
      winner.military   = Math.min(100, winner.military + capturedMil);
      if (techGain > 0) winner.techLevel = Math.min(10, (winner.techLevel || 3) + techGain);

      // Occupation cost
      winner.stability = Math.max(5, winner.stability - stabilityLoss);
      this.globalTension = Math.min(100, this.globalTension + 15);

      const incomeBonus = Math.round(loser.economy * 0.35 + (loser.resources || 0) * 0.15);
      this.addLog(`🏴 ¡${loser.name} CONQUISTADO! Botín: +$${loot}B · +${capturedArmy.toLocaleString()} soldados · Poder militar +${capturedMil}${techGain ? ' · Tech +1' : ''}.`, 'success');
      this.addLog(`📊 Territorio aporta +$${incomeBonus}B/turno. Resistencia: ${loser.resistanceLevel}%. Tu estabilidad -${stabilityLoss}.`, 'warning');
      this.income = this._calcIncome();

    } else if (loserId === this.playerCountryId) {
      this.addLog(`Derrota. ${winner.name} ha destruido tu capacidad de combate.`, 'danger');
    } else {
      // AI conquest: also mark as conquered by winner AI
      loser.conquered       = true;
      loser.conqueror       = winnerId;
      loser.occupationTurns = 0;
      loser.resistanceLevel = Math.min(90, Math.round(loser.stability * 0.6 + 20));
      this.addLog(`${winner.name} derrota y conquista ${loser.name}.`, 'warning');
    }
  }

  startWar(attackerId, defenderId) {
    if (this.wars.find(w =>
      (w.attacker === attackerId && w.defender === defenderId) ||
      (w.attacker === defenderId && w.defender === attackerId)
    )) return false;
    const attacker = this.countries[attackerId];
    const defender = this.countries[defenderId];
    attacker.atWar.push(defenderId);
    defender.atWar.push(attackerId);
    this.wars.push({ attacker: attackerId, defender: defenderId, turn: this.turn });
    this.changeRelation(attackerId, defenderId, -40);
    this.globalTension = Math.min(100, this.globalTension + 8);
    if (typeof WAR !== 'undefined') WAR.initWarState(this, attackerId, defenderId);

    // WAR PACT allies of defender AUTO-JOIN (defense treaty)
    const pactIds = defender.warPacts || [];
    for (const pactId of pactIds) {
      if (pactId === attackerId) continue;
      const pactCountry = this.countries[pactId];
      if (!pactCountry || pactCountry.atWar.includes(attackerId)) continue;
      // Pact country declares war on the attacker
      pactCountry.atWar.push(attackerId);
      attacker.atWar.push(pactId);
      this.wars.push({ attacker: pactId, defender: attackerId, turn: this.turn });
      this.changeRelation(attackerId, pactId, -30);
      this.globalTension = Math.min(100, this.globalTension + 6);
      if (attackerId === this.playerCountryId) {
        this.addLog(`🔴 ¡PACTO ACTIVADO! ${pactCountry.flag} ${pactCountry.name} entra en guerra en defensa de ${defender.name}!`, 'danger');
      } else if (defenderId === this.playerCountryId) {
        this.addLog(`🟢 ¡PACTO ACTIVADO! ${pactCountry.flag} ${pactCountry.name} entra en guerra para defenderte!`, 'success');
      } else {
        this.addLog(`⚔️ ${pactCountry.name} honra su pacto con ${defender.name} y declara guerra a ${attacker.name}.`, 'warning');
      }
    }

    // Formal allies of defender may join (lower probability, optional)
    for (const allyId of defender.allies) {
      if (allyId === attackerId || (defender.warPacts || []).includes(allyId)) continue;
      const ally = this.countries[allyId];
      if (!ally || ally.atWar.includes(attackerId)) continue;
      const joinChance = attackerId === this.playerCountryId ? 0.25 : 0.35;
      if (Math.random() < joinChance) {
        this.addLog(`${ally.flag} ${ally.name} declara solidaridad con ${defender.name} y corta relaciones.`, 'warning');
        this.changeRelation(attackerId, allyId, -25);
      }
    }
    return true;
  }

  _aiTurn() {
    const playerCountry = this.countries[this.playerCountryId];

    for (const [id, country] of Object.entries(this.countries)) {
      if (id === this.playerCountryId) continue;
      if (this.playerCountries?.[id]) continue; // human player controls this country
      const rand = Math.random();

      // Aggressive countries may attack weakened neighbors
      if (country.personality === 'aggressive' && country.military > 60 && rand < 0.08) {
        const targets = Object.entries(country.relations)
          .filter(([tid, rel]) => rel < -40 && this.countries[tid] && !country.atWar.includes(tid)
            && this.countries[tid].military < country.military
            && !this.playerCountries?.[tid])  // never auto-attack human players
          .sort((a, b) => a[1] - b[1]);
        if (targets.length > 0) {
          const [targetId] = targets[0];
          if (targetId !== this.playerCountryId || country.military > playerCountry.military * 1.5) {
            this.startWar(id, targetId);
            if (targetId === this.playerCountryId) {
              this.addLog(`⚠️ ¡${country.name} te ha declarado la guerra!`, 'danger');
            } else {
              this.addLog(`${country.name} invade ${this.countries[targetId].name}.`, 'warning');
            }
          }
        }
      }

      // Expansionist may build relations
      if ((country.personality === 'expansionist' || country.personality === 'diplomatic') && rand < 0.12) {
        const potentials = Object.entries(country.relations)
          .filter(([tid, rel]) => rel > 20 && rel < 70 && this.countries[tid] && !country.allies.includes(tid)
            && !this.playerCountries?.[tid])  // never auto-adjust relations with human players
          .sort((a, b) => b[1] - a[1]);
        if (potentials.length > 0) {
          const [targetId] = potentials[0];
          this.changeRelation(id, targetId, _rnd(3, 8));
          if (targetId === this.playerCountryId) {
            this.addLog(`${country.name} busca mejorar relaciones contigo.`, 'info');
          }
        }
      }

      // Opportunistic may betray allies if player is weak
      if (country.personality === 'opportunistic' && country.allies.includes(this.playerCountryId) && rand < 0.04) {
        if (playerCountry.stability < 35 && playerCountry.military < country.military) {
          this.changeRelation(id, this.playerCountryId, -25);
          this.addLog(`¡${country.name} ha roto la alianza contigo!`, 'danger');
        }
      }

      // Spy operations against player (plant new ops)
      if (country.espionage > 60 && rand < 0.10) {
        const existingOp = this.activeOps.find(op => op.source === id && op.target === this.playerCountryId);
        if (!existingOp && country.relations[this.playerCountryId] < -20) {
          this.activeOps.push({ source: id, target: this.playerCountryId, type: 'enemy', turn: this.turn });
          if (Math.random() < 0.3) {
            this.addLog(`🔴 Actividad sospechosa detectada: posible espía de ${country.name}.`, 'warning');
          }
        }
      }
    }

    // Activate enemy spy ops (processed once, not per country)
    for (const op of [...this.activeOps.filter(o => o.target === this.playerCountryId && o.type === 'enemy')]) {
      if (Math.random() < 0.15) {
        const src = this.countries[op.source];
        const impact = _rnd(5, 15);
        playerCountry.economy = Math.max(5, playerCountry.economy - impact);
        this.addLog(`Sabotaje de ${src?.name ?? 'agente desconocido'}: economía -${impact}.`, 'danger');
        this.activeOps = this.activeOps.filter(o => o !== op);
      }
    }
  }

  _fireEvent(event) {
    if (event.choices && event.choices.length > 0) {
      // Deferred to UI to show modal
      this._pendingEvent = event;
    } else if (event.effect) {
      event.effect(this);
      this._pendingEvent = null;
    }
  }

  _processConquests() {
    const pc = this.countries[this.playerCountryId];
    for (const [id, territory] of Object.entries(this.countries)) {
      if (!territory.conquered || territory.conqueror !== this.playerCountryId) continue;
      territory.occupationTurns = (territory.occupationTurns || 0) + 1;

      // Resistance decays over time — slower while player is at war elsewhere
      const decay = pc.stability > 60 ? 3 : pc.stability > 40 ? 2 : 1;
      const warPenalty = pc.atWar.filter(wid => wid !== id).length > 0 ? 4 : 0;
      const autonomyBonus = territory.autonomy ? 3 : 0;
      territory.resistanceLevel = Math.max(0, (territory.resistanceLevel || 0) - decay - autonomyBonus + warPenalty);

      // Protest events — chance scales with resistance level
      const protestChance = territory.resistanceLevel / 180;
      if (Math.random() < protestChance) {
        const loss = _rnd(2, 8);
        pc.stability = Math.max(5, pc.stability - loss);
        const msgs = [
          `📢 Protestas masivas en ${territory.name}. La población rechaza la ocupación.`,
          `🪧 Disturbios civiles en ${territory.name}. Grupos separatistas ganan fuerza.`,
          `⚡ Huelga general en ${territory.name}. Los trabajadores paran la economía ocupada.`,
          `🔴 Movimiento de resistencia activo en ${territory.name}. Ataques a instalaciones.`,
        ];
        this.addLog(`${msgs[Math.floor(Math.random() * msgs.length)]} Estabilidad -${loss}.`, 'warning');
      }

      // Revolt: high resistance + several turns → territory breaks free
      if (territory.resistanceLevel > 72 && territory.occupationTurns >= 4 && Math.random() < 0.10) {
        territory.conquered    = false;
        territory.conqueror    = null;
        territory.military     = Math.min(65, (territory.military || 20) + _rnd(15, 30));
        territory.stability    = _rnd(25, 45);
        const stabilityHit     = _rnd(12, 22);
        pc.stability           = Math.max(5, pc.stability - stabilityHit);
        this.globalTension     = Math.min(100, this.globalTension + 10);
        this.addLog(`🔥 ¡REVUELTA EN ${territory.name.toUpperCase()}! Se han liberado de tu control. Estabilidad -${stabilityHit}. ¡Puedes reconquistar!`, 'danger');
        // Auto-declare war (uprising)
        if (!pc.atWar.includes(id)) {
          this.startWar(id, this.playerCountryId);
          this.addLog(`⚔️ ${territory.name} ha declarado guerra de independencia contra ti.`, 'danger');
        }
        this.income = this._calcIncome();
      }
    }
  }

  // ── COMMITMENT SYSTEM ────────────────────────────────────

  addCommitment(c) {
    this.commitments.push({
      ...c,
      id: Date.now() + '_' + Math.random().toString(36).slice(2),
      status: c.status || 'pending',
      createdYear: this.year,
    });
  }

  fulfillCommitment(id) {
    const c = this.commitments.find(x => x.id === id && x.status === 'pending');
    if (!c) return { ok: false, msg: 'Compromiso no encontrado o ya resuelto.' };

    const pc = this.countries[this.playerCountryId];
    const obligations = c.obligations || [];

    // Verify every condition before executing
    const errors = [];
    for (const ob of obligations) {
      if (ob.type === 'pay') {
        if (!this.canAfford(ob.amount || 0))
          errors.push(`💰 Fondos insuficientes — necesitas $${ob.amount}B (tienes $${Math.round(this.treasury)}B)`);
      } else if (ob.type === 'military_increase') {
        if (pc.military <= (ob.milSnapshot ?? 0))
          errors.push(`⚔️ Ejército sin cambios — debes invertir en fuerzas militares (actual: ${pc.military})`);
      } else if (ob.type === 'economy_increase') {
        if (pc.economy <= (ob.ecoSnapshot ?? 0))
          errors.push(`💹 Economía sin mejora — debes invertir en economía (actual: ${pc.economy})`);
      } else if (ob.type === 'stability_increase') {
        if (pc.stability <= (ob.stabSnapshot ?? 0))
          errors.push(`🏛️ Gobierno sin mejora — debes mejorar estabilidad (actual: ${pc.stability})`);
      } else if (ob.type === 'non_aggression' || ob.type === 'no_attack') {
        if (pc.atWar.includes(c.targetId))
          errors.push(`⚔️ Estás en guerra con ${this.countries[c.targetId]?.name ?? c.targetId} — rompiste el pacto`);
      }
    }
    if (errors.length) return { ok: false, msg: errors.join('\n') };

    // Execute costs
    for (const ob of obligations) {
      if (ob.type === 'pay') this.spend(ob.amount || 0);
    }

    c.status = 'fulfilled';
    this._applyCommitmentEffect(c, true);
    const target = this.countries[c.targetId];
    this.addLog(`✅ Compromiso cumplido con ${target?.flag ?? ''} ${target?.name ?? c.targetId}: ${c.description}`, 'success');
    return { ok: true, msg: c.rewardDesc || 'Compromiso cumplido.' };
  }

  _applyCommitmentEffect(c, fulfilled) {
    const enemy = this.countries[c.targetId];
    const pc    = this.countries[this.playerCountryId];
    const pid   = this.playerCountryId;
    if (!enemy) return;

    if (fulfilled) {
      const r = c.reward;
      if (r?.type === 'alliance') {
        const boosted = Math.max(70, (this.getRelation(pid, c.targetId) || 0) + 35);
        this.countries[pid].relations[c.targetId]   = boosted;
        this.countries[c.targetId].relations[pid]   = Math.max(60, boosted - 10);
        if (!pc.allies.includes(c.targetId))        pc.allies.push(c.targetId);
        if (!enemy.allies.includes(pid))            enemy.allies.push(pid);
      } else if (r?.type === 'peace') {
        pc.atWar    = pc.atWar.filter(id => id !== c.targetId);
        enemy.atWar = enemy.atWar.filter(id => id !== pid);
        this.wars   = this.wars.filter(w =>
          !(w.attacker === pid && w.defender === c.targetId) &&
          !(w.attacker === c.targetId && w.defender === pid)
        );
        this.changeRelation(pid, c.targetId, 25);
        pc.stability = Math.min(100, pc.stability + 8);
      } else if (r?.type === 'relation') {
        this.changeRelation(pid, c.targetId, r.value || 15);
      } else if (r?.type === 'resources') {
        this.treasury += r.amount || 30;
      }
    } else {
      // Broken commitment
      const p = c.penalty;
      if (p?.type === 'war') {
        if (!pc.atWar.includes(c.targetId)) {
          this.startWar(c.targetId, pid);
          this.addLog(`☠️ ¡${enemy.flag} ${enemy.name} declara guerra por incumplimiento del compromiso!`, 'danger');
        }
      } else if (p?.type === 'relation') {
        this.changeRelation(pid, c.targetId, p.value ?? -20);
        this.addLog(`📉 ${enemy.flag} ${enemy.name}: relaciones rotas por incumplir "${c.description}". ${p.value ?? -20} relación.`, 'warning');
      }
    }
  }

  _checkCommitments() {
    const pc = this.countries[this.playerCountryId];
    for (const c of this.commitments) {
      if (c.status !== 'pending') continue;

      const obligations = c.obligations || [];
      const hasNonAgg   = obligations.some(ob => ob.type === 'non_aggression' || ob.type === 'no_attack');
      const onlyNonAgg  = obligations.length > 0 && obligations.every(ob => ob.type === 'non_aggression' || ob.type === 'no_attack');

      // Non-aggression: broken immediately when player attacks
      if (hasNonAgg && pc.atWar.includes(c.targetId)) {
        c.status = 'broken';
        this._applyCommitmentEffect(c, false);
        const n = this.countries[c.targetId]?.name ?? c.targetId;
        this.addLog(`⚠️ Rompiste el pacto de no agresión con ${n} al declararles la guerra. ${c.penaltyDesc}`, 'danger');
        continue;
      }

      // Pure non-aggression commitment: auto-fulfilled when deadline passes without war
      if (onlyNonAgg && this.year >= c.deadline) {
        c.status = 'fulfilled';
        this._applyCommitmentEffect(c, true);
        const n = this.countries[c.targetId]?.name ?? c.targetId;
        this.addLog(`✅ Cumpliste el año de no agresión con ${n}. ${c.rewardDesc}`, 'success');
        continue;
      }

      // All other commitments: deadline passed without pressing "Cumplir" → broken
      if (this.year >= c.deadline) {
        c.status = 'broken';
        this._applyCommitmentEffect(c, false);
        const n = this.countries[c.targetId]?.name ?? c.targetId;
        this.addLog(`❌ Plazo vencido: "${c.description}" con ${n}. ${c.penaltyDesc}`, 'danger');
      }
    }
  }

  _passiveUpdates() {
    const pc  = this.countries[this.playerCountryId];
    const pid = this.playerCountryId;
    this._checkCommitments();

    // Stability cap reduced by number of occupied territories
    const occupiedCount = Object.values(this.countries).filter(c => c.conquered && c.conqueror === pid).length;
    const stabilityCap  = Math.max(50, 80 - occupiedCount * 7);
    if (pc.atWar.length === 0 && pc.stability < stabilityCap) {
      pc.stability = Math.min(stabilityCap, pc.stability + 2);
    }
    // Military degradation without spending
    pc.armySize = Math.max(10, pc.armySize - 2);
    // Tension decay
    if (this.wars.length === 0) {
      this.globalTension = Math.max(0, this.globalTension - 2);
    }
    // Sanctions decay
    if (pc.sanctions > 0) {
      pc.sanctions = Math.max(0, pc.sanctions - 1);
    }

    // Informant network passive alerts + expiry
    for (const op of [...this.activeOps]) {
      if (op.source !== pid || op.type !== 'network') continue;
      const watched = this.countries[op.target];
      if (!watched) { this.activeOps = this.activeOps.filter(o => o !== op); continue; }
      // Expire after duration turns
      if (this.turn - op.turn >= (op.duration || 6)) {
        this.activeOps = this.activeOps.filter(o => o !== op);
        this.addLog(`📡 Red de informantes en ${watched.flag} ${watched.name} ha expirado.`, 'warning');
        continue;
      }
      // Alert if they're building toward war
      const rel = this.getRelation(pid, op.target);
      if (rel < -30 && watched.military > 60 && Math.random() < 0.25) {
        this.addLog(`🌐 Alerta de red · ${watched.flag} ${watched.name}: movimientos militares sospechosos detectados.`, 'warning');
      }
      // Alert if they joined a war against player
      if (watched.atWar?.includes(pid) && !op._warAlerted) {
        op._warAlerted = true;
        this.addLog(`🚨 RED ALERTA · ${watched.flag} ${watched.name} HA DECLARADO GUERRA. Tus informantes lo confirmaron anticipadamente.`, 'danger');
      }
    }
  }

  _checkGameOver() {
    const pc = this.countries[this.playerCountryId];

    // Defeat conditions
    if (pc.stability <= 0) {
      this.gameOver = true;
      this.victoryType = 'collapse';
      return;
    }
    if (pc.military <= 5 && pc.atWar.length > 0) {
      this.gameOver = true;
      this.victoryType = 'defeat';
      return;
    }
    if (this.treasury < -this.income * 3) {
      this.gameOver = true;
      this.victoryType = 'bankruptcy';
      return;
    }

    // Victory conditions
    const allCountries = Object.keys(this.countries).filter(id => id !== this.playerCountryId);
    const allyCount = pc.allies.length;

    // Military domination: all other countries are allies or at war with you
    if (pc.atWar.length === 0 && allCountries.every(id => pc.allies.includes(id) || this.getRelation(this.playerCountryId, id) > 40)) {
      this.gameOver = true;
      this.victoryType = 'diplomatic';
      return;
    }
    // Economic: economy 95+, treasury 5000+
    if (pc.economy >= 95 && this.treasury >= 5000 && allyCount >= 5) {
      this.gameOver = true;
      this.victoryType = 'economic';
      return;
    }
    // Military hegemony: military 95+ and 5+ enemies defeated (tracked via turn)
    if (pc.military >= 95 && this.turn >= 20 && pc.atWar.length === 0) {
      this.gameOver = true;
      this.victoryType = 'military';
      return;
    }
    // Superalliance: 8+ formal allies
    if (allyCount >= 8 && pc.stability >= 70) {
      this.gameOver = true;
      this.victoryType = 'superalliance';
      return;
    }
  }
  // ── ALLIANCE REQUEST SYSTEM ──────────────────────────────

  requestAllyHelp(allyId, helpType, options = {}) {
    const pc    = this.countries[this.playerCountryId];
    const ally  = this.countries[allyId];
    if (!ally || !pc.allies.includes(allyId))
      return { accepted: false, msg: `${ally?.name ?? allyId} no es tu aliado formal.` };

    const rel      = this.getRelation(this.playerCountryId, allyId);
    const baseWill = Math.max(0.05, Math.min(0.90, (rel + 10) / 120));
    const willing  = options.forced ? true : Math.random() < baseWill;

    if (!willing) {
      const wasAlly = pc.allies.includes(allyId);
      this.changeRelation(this.playerCountryId, allyId, -10);
      const stillAlly = pc.allies.includes(allyId);
      if (wasAlly && !stillAlly) {
        this.addLog(`💔 ${ally.flag} ${ally.name} rechazó la solicitud y rompió la alianza.`, 'danger');
        return { accepted: false, allianceBroken: true, msg: `${ally.name} rechazó la solicitud. La alianza se ha roto. Relación -10.` };
      }
      this.addLog(`${ally.flag} ${ally.name} rechazó tu solicitud. Relación -10.`, 'warning');
      return { accepted: false, msg: `${ally.name} rechazó la solicitud. La relación se deterioró (-10).` };
    }

    switch (helpType) {
      case 'economy': {
        const budget = this.aiTreasuries[allyId] || 0;
        if (budget < 30)
          return { accepted: false, msg: `${ally.name} no tiene fondos suficientes ahora.` };
        const aid = Math.round(Math.min(budget * 0.3, 20 + rel * 0.6));
        this.aiTreasuries[allyId] -= aid;
        this.changeRelation(this.playerCountryId, allyId, 4);
        this.pendingDeliveries.push({ type: 'economy', amount: aid, fromId: allyId, fromName: ally.name + ' ' + ally.flag, toId: this.playerCountryId, arrivesOnTurn: this.turn + 1 });
        if (typeof ANIM !== 'undefined') ANIM.showPlane(allyId, this.playerCountryId, { emoji: '💰', label: `$${aid}B`, duration: 3500 });
        this.addLog(`💰 ${ally.flag} ${ally.name} envía $${aid}B. Llegará el próximo turno. Relación +4.`, 'success');
        return { accepted: true, msg: `${ally.name} envía $${aid}B de ayuda económica. ✈️ Llega el próximo turno.`, amount: aid, pending: true };
      }
      case 'troops': {
        const sent = _rnd(300, 700) + Math.round(ally.military * 5);
        ally.armySize = Math.max(100, ally.armySize - sent);
        this.changeRelation(this.playerCountryId, allyId, 5);
        this.pendingDeliveries.push({ type: 'troops', amount: sent, fromId: allyId, fromName: ally.name + ' ' + ally.flag, toId: this.playerCountryId, arrivesOnTurn: this.turn + 2 });
        if (typeof ANIM !== 'undefined') ANIM.showTroops(allyId, this.playerCountryId, { count: sent, duration: 4500 });
        this.addLog(`🪖 ${ally.flag} ${ally.name} moviliza ${sent.toLocaleString()} soldados. Llegarán en 2 turnos. Relación +5.`, 'success');
        return { accepted: true, msg: `${ally.name} moviliza ${sent.toLocaleString()} soldados. 🪖 Llegarán en 2 turnos.`, pending: true };
      }
      case 'weapons': {
        const boost = _rnd(4, 9);
        this.changeRelation(this.playerCountryId, allyId, 4);
        this.pendingDeliveries.push({ type: 'weapons', amount: boost, fromId: allyId, fromName: ally.name + ' ' + ally.flag, toId: this.playerCountryId, arrivesOnTurn: this.turn + 1 });
        if (typeof ANIM !== 'undefined') ANIM.showPlane(allyId, this.playerCountryId, { emoji: '🚁', label: 'armamento', duration: 3000 });
        this.addLog(`🔫 ${ally.flag} ${ally.name} envía armamento. Llegará el próximo turno. Relación +4.`, 'success');
        return { accepted: true, msg: `${ally.name} envía armamento (+${boost} poder militar). 🚁 Llega el próximo turno.`, pending: true };
      }
      case 'joinwar': {
        if (pc.atWar.length === 0)
          return { accepted: false, msg: 'No estás en ninguna guerra actualmente.' };
        const target     = pc.atWar[0];
        const targetCtry = this.countries[target];
        if (ally.atWar.includes(target))
          return { accepted: false, msg: `${ally.name} ya está en guerra con ${targetCtry?.name}.` };
        this.startWar(allyId, target);
        this.changeRelation(this.playerCountryId, allyId, 10);
        if (typeof ANIM !== 'undefined') ANIM.showTroops(allyId, target, { count: Math.round(ally.armySize * 0.3), duration: 4000 });
        this.addLog(`⚔️ ¡${ally.flag} ${ally.name} entra en guerra contra ${targetCtry?.name}!`, 'success');
        return { accepted: true, msg: `${ally.name} declara guerra a ${targetCtry?.name} en tu apoyo. Alianza +10.` };
      }
      case 'attackcountry': {
        const { targetId } = options;
        const targetCtry   = targetId && this.countries[targetId];
        if (!targetCtry)
          return { accepted: false, msg: 'País objetivo no válido.' };
        if (!pc.warPacts?.includes(allyId))
          return { accepted: false, msg: `Solo puedes pedir esto a aliados de pacto de guerra.` };
        if (ally.atWar.includes(targetId))
          return { accepted: false, msg: `${ally.name} ya está en guerra con ${targetCtry.name}.` };
        const willAttack = Math.random() < (rel + 10) / 110;
        if (!willAttack) {
          this.changeRelation(this.playerCountryId, allyId, -8);
          return { accepted: false, msg: `${ally.name} rechazó atacar a ${targetCtry.name}. Relación -8.` };
        }
        this.startWar(allyId, targetId);
        this.changeRelation(this.playerCountryId, allyId, 8);
        if (typeof ANIM !== 'undefined') ANIM.showTroops(allyId, targetId, { count: Math.round(ally.armySize * 0.4), duration: 4000 });
        this.addLog(`⚔️ ¡${ally.flag} ${ally.name} ataca a ${targetCtry.flag} ${targetCtry.name} por tu solicitud!`, 'success');
        return { accepted: true, msg: `${ally.name} declara guerra a ${targetCtry.name}.` };
      }
      default:
        return { accepted: false, msg: 'Tipo de ayuda desconocido.' };
    }
  }

  // ── ALLY AUTO ECONOMIC SUPPORT ────────────────────────────

  _allyAutoHelp() {
    const pc = this.countries[this.playerCountryId];
    // Passive small aid when player is cash-strapped and ally has surplus
    for (const allyId of pc.allies) {
      const ally   = this.countries[allyId];
      if (!ally) continue;
      const rel    = this.getRelation(this.playerCountryId, allyId);
      const budget = this.aiTreasuries[allyId] || 0;
      if (this.treasury < this.income * 2 && budget > 120 && rel > 65 && Math.random() < 0.22) {
        const aid = _rnd(5, 18);
        this.treasury += aid;
        this.aiTreasuries[allyId] -= aid;
        this.addLog(`${ally.flag} ${ally.name} te envía $${aid}B de apoyo voluntario.`, 'info');
      }
    }
    // AI budgets grow each turn
    for (const [id, country] of Object.entries(this.countries)) {
      if (id === this.playerCountryId) continue;
      const income = Math.round(country.economy * 0.9 + country.resources * 0.35 + 8);
      this.aiTreasuries[id] = Math.min(2000, (this.aiTreasuries[id] || 0) + income);
    }
  }

  // ── AI ALLIANCE DYNAMICS ──────────────────────────────────

  _processAIAlliances() {
    const pc = this.countries[this.playerCountryId];

    // AI countries form alliances with each other
    for (const [id, country] of Object.entries(this.countries)) {
      if (id === this.playerCountryId) continue;
      if (Math.random() > 0.06) continue;
      const potentials = Object.entries(country.relations)
        .filter(([tid, rel]) => {
          if (tid === this.playerCountryId) return false;
          if (rel < 68) return false;
          const other = this.countries[tid];
          if (!other) return false;
          if (country.allies.includes(tid) || country.atWar.includes(tid)) return false;
          return true;
        })
        .sort((a, b) => b[1] - a[1]);

      if (potentials.length > 0) {
        const [newAllyId] = potentials[0];
        const newAlly = this.countries[newAllyId];
        country.allies.push(newAllyId);
        newAlly.allies.push(id);
        const playerRel = this.getRelation(this.playerCountryId, id);
        if (Math.abs(playerRel) > 25 || pc.allies.includes(id) || pc.atWar.includes(id)) {
          this.addLog(`🤝 ${country.flag} ${country.name} forma alianza con ${newAlly.flag} ${newAlly.name}.`, 'info');
        }
      }
    }

    // Enemy countries try to poach player's allies
    for (const enemyId of pc.atWar) {
      const enemy = this.countries[enemyId];
      if (!enemy || Math.random() > 0.10) continue;

      // Find player ally most sympathetic to this enemy
      const targetAllyId = pc.allies.find(allyId => {
        const eRel = this.getRelation(allyId, enemyId);
        const pRel = this.getRelation(allyId, this.playerCountryId);
        return eRel > pRel + 22 && eRel > 30;
      });

      if (!targetAllyId) continue;
      const targetAlly = this.countries[targetAllyId];
      const diff = this.getRelation(targetAllyId, enemyId) - this.getRelation(targetAllyId, this.playerCountryId);

      if (Math.random() < Math.min(0.55, diff / 100)) {
        // Betrayal!
        pc.allies         = pc.allies.filter(id => id !== targetAllyId);
        targetAlly.allies = targetAlly.allies.filter(id => id !== this.playerCountryId);
        this.changeRelation(this.playerCountryId, targetAllyId, -20);
        // Possibly joins the enemy's side
        if (Math.random() < 0.40) {
          if (!targetAlly.allies.includes(enemyId)) targetAlly.allies.push(enemyId);
          if (!enemy.allies.includes(targetAllyId)) enemy.allies.push(targetAllyId);
          this.addLog(`⚠️ ¡${enemy.flag} ${enemy.name} convenció a ${targetAlly.flag} ${targetAlly.name} de traicionarte y unirse a su bando!`, 'danger');
        } else {
          this.addLog(`💔 ${enemy.flag} ${enemy.name} convenció a ${targetAlly.flag} ${targetAlly.name} de abandonar tu alianza.`, 'danger');
        }
      } else if (Math.random() < 0.35) {
        this.addLog(`🔔 ${enemy.flag} ${enemy.name} intenta seducir a ${targetAlly.flag} ${targetAlly.name}. Tu aliado resistió por ahora.`, 'warning');
      }
    }
  }
}

function _rnd(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
