// ============================================================
// WAR.JS - Battle engine, war events, territory conquest
// ============================================================

const WAR = {

  // ── WAR EVENTS ───────────────────────────────────────────────
  WAR_EVENTS: [
    {
      id: 'lost_squad',
      title: '⚠️ Escuadrón Perdido',
      icon: '🪖',
      desc: 'Un escuadrón de 500 soldados se perdió en terreno enemigo. Señales de radio intermitentes. ¿Qué ordenas?',
      choices: [
        { label: '🚁 Rescate urgente  (-$15B)', cost: 15, effect: (w) => { w.aTroops += 400; w.aMorale = Math.min(100, w.aMorale + 12); return { icon:'✅', msg: '400 hombres rescatados. Moral +12.' }; } },
        { label: '💀 Abandonarlos (sin costo)', cost: 0, effect: (w) => { w.aTroops = Math.max(0, w.aTroops - 500); w.aMorale = Math.max(5, w.aMorale - 20); return { icon:'💔', msg: 'El escuadrón se perdió. Moral cae -20.' }; } },
      ],
    },
    {
      id: 'ammo_shortage',
      title: '🔫 Escasez de Munición',
      icon: '📦',
      desc: 'Las líneas de suministro fueron cortadas. Tus tropas tienen munición para 48 horas de combate.',
      choices: [
        { label: '✈️ Envío aéreo urgente (-$25B)', cost: 25, effect: (w) => { w.aSupplies.ammo = Math.min(100, w.aSupplies.ammo + 60); return { icon:'✅', msg: 'Suministros aéreos llegaron. Munición +60.' }; } },
        { label: '🛡️ Retirada táctica (gratis)', cost: 0, effect: (w) => { w.progress = Math.max(0, w.progress - 15); w.aMorale = Math.max(5, w.aMorale - 10); return { icon:'😞', msg: 'Retirada táctica. Terreno cedido (-15% progreso).' }; } },
      ],
    },
    {
      id: 'enemy_camp',
      title: '🏕️ Campamento Enemigo Detectado',
      icon: '🗺️',
      desc: 'Reconocimiento aéreo detectó un gran campamento logístico enemigo a 30km. ¿Atacas?',
      choices: [
        { label: '💥 Bombardear (-$20B)', cost: 20, effect: (w) => { w.dSupplies.ammo = Math.max(0, w.dSupplies.ammo - 50); w.dTroops = Math.max(0, w.dTroops - 3000); w.progress = Math.min(100, w.progress + 10); return { icon:'💥', msg: '¡Campamento destruido! +10% progreso. -3000 tropas enemigas.' }; } },
        { label: '👁️ Solo vigilar (gratis)', cost: 0, effect: (w) => { w.dMorale = Math.min(100, w.dMorale + 5); return { icon:'🔭', msg: 'El campamento sigue operativo. El enemigo refuerza posiciones.' }; } },
      ],
    },
    {
      id: 'food_shortage',
      title: '🍞 Hambre en el Frente',
      icon: '🥖',
      desc: 'Tus soldados llevan 3 días sin provisiones adecuadas. Las deserciones comienzan.',
      choices: [
        { label: '🚛 Enviar víveres (-$18B)', cost: 18, effect: (w) => { w.aSupplies.food = Math.min(100, w.aSupplies.food + 60); w.aMorale = Math.min(100, w.aMorale + 15); return { icon:'✅', msg: 'Víveres llegaron. Moral +15.' }; } },
        { label: 'Continuar con lo que hay', cost: 0, effect: (w) => { w.aMorale = Math.max(5, w.aMorale - 25); w.aTroops = Math.max(0, w.aTroops - 2000); return { icon:'😞', msg: '2000 soldados desertan por hambre. Moral -25.' }; } },
      ],
    },
    {
      id: 'wounded_hospital',
      title: '🏥 Hospitales de Campaña Desbordados',
      icon: '🚑',
      desc: 'Miles de heridos no reciben atención. Los médicos de campo piden refuerzos urgentes.',
      choices: [
        { label: '💊 Ayuda médica masiva (-$30B)', cost: 30, effect: (w) => { w.aTroops = Math.min(w.aTroops + 3000, w.aTroops + 3000); w.aMorale = Math.min(100, w.aMorale + 10); return { icon:'✅', msg: '3000 heridos se recuperan y regresan al frente. Moral +10.' }; } },
        { label: 'Priorizar combatientes activos', cost: 0, effect: (w) => { w.aTroops = Math.max(0, w.aTroops - 2000); w.aMorale = Math.max(5, w.aMorale - 12); return { icon:'💔', msg: '2000 bajas adicionales por falta de atención médica.' }; } },
      ],
    },
    {
      id: 'desertion_wave',
      title: '🏃 Ola de Deserciones',
      icon: '🚩',
      desc: 'Con la moral baja, 3500 soldados han desertado o se han rendido en los últimas 24h.',
      choices: [
        { label: '📢 Discurso motivacional (-$15B)', cost: 15, effect: (w) => { w.aMorale = Math.min(100, w.aMorale + 28); return { icon:'✅', msg: 'El discurso detiene las deserciones. Moral +28.' }; } },
        { label: '⛓️ Ley marcial (gratis)', cost: 0, effect: (w) => { w.aTroops = Math.max(0, w.aTroops - 3500); w.aMorale = Math.max(5, w.aMorale - 5); return { icon:'⚖️', msg: '3500 desertores no regresan. Ley marcial implementada.' }; } },
      ],
    },
    {
      id: 'spy_intel',
      title: '🕵️ Inteligencia Capturada',
      icon: '📡',
      desc: 'Tus espías robaron los planes de batalla enemigos. ¿Cómo los usas?',
      choices: [
        { label: '⚔️ Ataque sorpresa inmediato', cost: 0, effect: (w) => { const gain = _rnd(15, 25); w.progress = Math.min(100, w.progress + gain); w.dTroops = Math.max(0, w.dTroops - 6000); return { icon:'💥', msg: `¡Ataque sorpresa! +${gain}% progreso. -6000 tropas enemigas.` }; } },
        { label: '📁 Guardar para ofensiva mayor', cost: 0, effect: (w) => { w._savedIntel = true; return { icon:'📋', msg: 'Intel guardado. Tu próxima ofensiva tendrá +20% de efectividad.' }; } },
      ],
    },
    {
      id: 'refugee_crisis',
      title: '👨‍👩‍👧‍👦 Crisis de Refugiados',
      icon: '🏕️',
      desc: 'Miles de civiles huyen de la zona de guerra hacia tu territorio. La situación humanitaria es crítica.',
      choices: [
        { label: '🤲 Abrir fronteras (-$20B)', cost: 20, effect: (w) => { w.aMorale = Math.min(100, w.aMorale + 5); return { icon:'❤️', msg: 'Acción humanitaria valorada internacionalmente. Moral +5.' }; } },
        { label: '🚧 Cerrar fronteras (gratis)', cost: 0, effect: (w) => { w.aMorale = Math.max(5, w.aMorale - 8); return { icon:'⚠️', msg: 'La prensa internacional te critica. Moral -8.' }; } },
      ],
    },
  ],

  // ── HELPERS ────────────────────────────────────────────────

  getWarState(game, enemyId) {
    return game.wars.find(w =>
      (w.attacker === game.playerCountryId && w.defender === enemyId) ||
      (w.attacker === enemyId && w.defender === game.playerCountryId)
    ) || null;
  },

  isPlayerAttacker(game, enemyId) {
    const w = this.getWarState(game, enemyId);
    return w ? w.attacker === game.playerCountryId : false;
  },

  // Called when a war starts — enriches the war entry with battle state
  initWarState(game, attackerId, defenderId) {
    const w = game.wars.find(e => e.attacker === attackerId && e.defender === defenderId);
    if (!w || w.progress !== undefined) return;
    const atk = game.countries[attackerId];
    const def = game.countries[defenderId];
    w.progress      = 0;
    w.aTroops       = Math.max(10000, atk.armySize * 120);
    w.dTroops       = Math.max(8000,  def.armySize * 120);
    w.aSupplies     = { food: 100, ammo: 100 };
    w.dSupplies     = { food: 100, ammo: 100 };
    w.aAirStrikes   = Math.max(1, Math.floor(atk.military / 18));
    w.aNavalStrikes = Math.max(0, Math.floor(atk.military / 28));
    w.aMorale       = Math.min(95, 55 + Math.floor(atk.stability / 3));
    w.dMorale       = Math.min(95, 55 + Math.floor(def.stability / 3));
    w.activeEvent   = null;
    w._turnsSinceEvent = 0;
    w._savedIntel   = false;
  },

  // ── BATTLE ACTIONS ─────────────────────────────────────────

  launchOffensive(game, enemyId) {
    const w = this.getWarState(game, enemyId);
    if (!w) return { success: false, msg: 'No estás en guerra con este país.' };
    const enemy = game.countries[enemyId];
    const pc    = game.countries[game.playerCountryId];

    // Spend supplies
    w.aSupplies.ammo = Math.max(0, w.aSupplies.ammo - 22);
    w.aSupplies.food = Math.max(0, w.aSupplies.food - 12);

    // Power formula: troops × supply quality × morale × tech
    const intelBonus = w._savedIntel ? 1.2 : 1.0;
    if (w._savedIntel) w._savedIntel = false;

    const myPow  = (w.aTroops / 5000) * (w.aSupplies.ammo / 100 + 0.1) * (w.aMorale / 100 + 0.1) * pc.military * intelBonus;
    const ePow   = (w.dTroops / 5000) * (w.dSupplies.ammo / 100 + 0.1) * (w.dMorale / 100 + 0.1) * enemy.military;
    const hitChance = myPow / (myPow + ePow);

    if (Math.random() < hitChance) {
      const myLost  = _rnd(300, 1500);
      const eLost   = _rnd(1500, 6000);
      const gained  = _rnd(6, 18);
      w.aTroops = Math.max(0, w.aTroops - myLost);
      w.dTroops = Math.max(0, w.dTroops - eLost);
      w.progress = Math.min(100, w.progress + gained);
      w.dMorale  = Math.max(5, w.dMorale - _rnd(5, 14));
      game.addLog(`✅ Ofensiva exitosa: +${gained}% control. Bajas enemigas: ${eLost.toLocaleString()}.`, 'success');
      if (w.progress >= 100) { this.conquer(game, w); return { success: true, conquered: true, msg: `¡Victoria total! ${enemy.name} ha caído.` }; }
      return { success: true, msg: `Ofensiva exitosa. Progreso: ${w.progress}%.\nBajas enemigas: ${eLost.toLocaleString()} · Bajas propias: ${myLost.toLocaleString()}.` };
    } else {
      const myLost  = _rnd(2000, 6000);
      const lost    = _rnd(3, 10);
      w.aTroops  = Math.max(0, w.aTroops - myLost);
      w.progress = Math.max(0, w.progress - lost);
      w.aMorale  = Math.max(5, w.aMorale - _rnd(8, 18));
      game.addLog(`❌ Ofensiva repelida. -${lost}% terreno. Bajas: ${myLost.toLocaleString()}.`, 'danger');
      return { success: false, msg: `Ofensiva repelida. Perdiste ${myLost.toLocaleString()} hombres y ${lost}% del terreno ganado.\nMoral actual: ${w.aMorale}%.` };
    }
  },

  strategicDefense(game, enemyId) {
    const w = this.getWarState(game, enemyId);
    if (!w) return { success: false, msg: 'No estás en guerra.' };
    const myLost = _rnd(100, 600);
    const eLost  = _rnd(800, 2500);
    const gained = _rnd(1, 5);
    w.aTroops  = Math.max(0, w.aTroops - myLost);
    w.dTroops  = Math.max(0, w.dTroops - eLost);
    w.aMorale  = Math.min(100, w.aMorale + 5);
    w.aSupplies.ammo = Math.max(0, w.aSupplies.ammo - 8);
    w.progress = Math.min(100, w.progress + gained);
    game.addLog(`🛡️ Defensa activa: progreso +${gained}%. Bajas mínimas.`, 'info');
    return { success: true, msg: `Defensa estratégica ejecutada. Posición consolidada.\nBajas propias: ${myLost.toLocaleString()} · Bajas enemigas: ${eLost.toLocaleString()} · Moral +5.` };
  },

  launchAirStrike(game, enemyId) {
    const w = this.getWarState(game, enemyId);
    if (!w) return { success: false, msg: 'No estás en guerra.' };
    if (w.aAirStrikes <= 0) return { success: false, msg: 'Sin misiones aéreas disponibles. Compra armamento para recargar.' };
    const enemy = game.countries[enemyId];
    w.aAirStrikes--;
    if (Math.random() < 0.78) {
      const eLost  = _rnd(3000, 9000);
      const sDmg   = _rnd(20, 45);
      const gained = _rnd(8, 20);
      w.dTroops    = Math.max(0, w.dTroops - eLost);
      w.dSupplies.ammo = Math.max(0, w.dSupplies.ammo - sDmg);
      w.dMorale    = Math.max(5, w.dMorale - _rnd(10, 22));
      w.progress   = Math.min(100, w.progress + gained);
      game.addLog(`✈️ Bombardeo aéreo: -${eLost.toLocaleString()} tropas enemigas. Progreso +${gained}%.`, 'success');
      if (w.progress >= 100) { this.conquer(game, w); return { success: true, conquered: true, msg: `¡Victoria total! Bombardeo decisivo.` }; }
      return { success: true, msg: `✈️ Bombardeo exitoso sobre posiciones de ${enemy.name}.\n${eLost.toLocaleString()} bajas enemigas · Suministros dañados -${sDmg}.\nMisiones restantes: ${w.aAirStrikes}` };
    } else {
      game.addLog('✈️ Bombardeo interceptado por la DCA enemiga.', 'warning');
      return { success: false, msg: `El bombardeo fue interceptado. La defensa antiaérea de ${enemy.name} fue efectiva.\nMisiones restantes: ${w.aAirStrikes}` };
    }
  },

  launchNavalStrike(game, enemyId) {
    const w = this.getWarState(game, enemyId);
    if (!w) return { success: false, msg: 'No estás en guerra.' };
    if (w.aNavalStrikes <= 0) return { success: false, msg: 'Sin misiones navales disponibles.' };
    const enemy = game.countries[enemyId];
    w.aNavalStrikes--;
    const eLost  = _rnd(2000, 7000);
    const sDmg   = _rnd(30, 55);
    const gained = _rnd(5, 14);
    w.dTroops    = Math.max(0, w.dTroops - eLost);
    w.dSupplies.food = Math.max(0, w.dSupplies.food - sDmg);
    w.progress   = Math.min(100, w.progress + gained);
    game.addLog(`⚓ Bombardeo naval: +${gained}% progreso. Costas de ${enemy.name} dañadas.`, 'success');
    if (w.progress >= 100) { this.conquer(game, w); return { success: true, conquered: true }; }
    return { success: true, msg: `⚓ Flota naval bombardea costas de ${enemy.name}.\n${eLost.toLocaleString()} bajas · Suministros cortados -${sDmg}.\nMisiones restantes: ${w.aNavalStrikes}` };
  },

  launchMissileStrike(game, enemyId) {
    const w = this.getWarState(game, enemyId);
    if (!w) return { success: false, msg: 'No estás en guerra con este país.' };
    if ((game.missiles || 0) <= 0) return { success: false, msg: '🚀 Sin misiles disponibles. Compra "Misiles Balísticos" en la pestaña Militar.' };
    const enemy = game.countries[enemyId];
    game.missiles--;
    const eLost  = _rnd(10000, 25000);
    const sDmg   = _rnd(45, 75);
    const gained = _rnd(18, 38);
    w.dTroops        = Math.max(0, w.dTroops - eLost);
    w.dSupplies.ammo = Math.max(0, w.dSupplies.ammo - sDmg);
    w.dMorale        = Math.max(5, w.dMorale - _rnd(22, 40));
    w.progress       = Math.min(100, w.progress + gained);
    enemy.stability  = Math.max(5, enemy.stability - _rnd(10, 22));
    game.globalTension = Math.min(100, game.globalTension + 14);
    game.addLog(`🚀 Ataque con misiles balísticos devastador sobre ${enemy.name}. +${gained}% control territorial.`, 'success');
    if (w.progress >= 100) { this.conquer(game, w); return { success: true, conquered: true, msg: `🚀 ¡Victoria! Los misiles destruyeron la resistencia de ${enemy.name}.` }; }
    return { success: true, msg: `🚀 Misiles balísticos lanzados sobre ${enemy.name}.\n${eLost.toLocaleString()} bajas · Suministros destruidos -${sDmg}%.\nMisiles restantes: ${game.missiles}\nProgreso: ${w.progress}%` };
  },

  sendSupplies(game, enemyId, type) {
    const w = this.getWarState(game, enemyId);
    if (!w) return { success: false, msg: 'No estás en guerra.' };
    const cost = type === 'ammo' ? 22 : 16;
    if (!game.canAfford(cost)) return { success: false, msg: `Sin fondos. Necesitas $${cost}B.` };
    game.spend(cost);
    if (type === 'ammo') {
      w.aSupplies.ammo = Math.min(100, w.aSupplies.ammo + 55);
      w.aMorale = Math.min(100, w.aMorale + 5);
      game.addLog('📦 Munición enviada al frente.', 'success');
      return { success: true, msg: 'Convoy de munición llegó al frente. Capacidad de fuego restaurada. Moral +5.' };
    } else {
      w.aSupplies.food = Math.min(100, w.aSupplies.food + 55);
      w.aMorale = Math.min(100, w.aMorale + 8);
      game.addLog('🍞 Víveres enviados al frente.', 'success');
      return { success: true, msg: 'Convoy de alimentos llegó al frente. Las tropas comen bien. Moral +8.' };
    }
  },

  // ── TURN PROCESSING ────────────────────────────────────────

  processTurn(game) {
    const pc = game.countries[game.playerCountryId];
    for (const w of [...game.wars]) {
      this.initWarState(game, w.attacker, w.defender);
      const isPlayerWar = (w.attacker === game.playerCountryId || w.defender === game.playerCountryId);
      if (!isPlayerWar) continue;
      // P2P wars between two human players are managed entirely by WAR_MP — skip old auto-resolution
      if (game.playerCountries?.[w.attacker] && game.playerCountries?.[w.defender]) continue;

      // Supply drain every turn
      w.aSupplies.food = Math.max(0, w.aSupplies.food - 9);
      w.aSupplies.ammo = Math.max(0, w.aSupplies.ammo - 6);
      if (w.aSupplies.food < 25) { w.aMorale = Math.max(5, w.aMorale - 10); }
      if (w.aSupplies.ammo < 20) { w.aMorale = Math.max(5, w.aMorale - 14); }

      // Enemy morale recovers slightly
      w.dMorale = Math.min(95, w.dMorale + 3);

      // War unpopularity
      const stabilityLoss = _rnd(2, 5);
      pc.stability = Math.max(5, pc.stability - stabilityLoss);
      if (Math.random() < 0.45) {
        game.addLog(`⚠️ La guerra genera descontento. Aprobación -${stabilityLoss}.`, 'warning');
      }

      // Random war event (if no active one)
      w._turnsSinceEvent = (w._turnsSinceEvent || 0) + 1;
      if (!w.activeEvent && w._turnsSinceEvent >= 1 && Math.random() < 0.55) {
        const evt = this._pickWarEvent(w);
        if (evt) {
          w.activeEvent = { ...evt };
          w._turnsSinceEvent = 0;
          game.addLog(`🚨 Evento de guerra: ${evt.title}`, 'warning');
        }
      }
    }
  },

  _pickWarEvent(war) {
    let pool = [...this.WAR_EVENTS];
    if (war.aSupplies.ammo < 35) pool = [this.WAR_EVENTS.find(e => e.id === 'ammo_shortage'), ...pool];
    if (war.aSupplies.food < 35) pool = [this.WAR_EVENTS.find(e => e.id === 'food_shortage'), ...pool];
    if (war.aMorale < 35)         pool = [this.WAR_EVENTS.find(e => e.id === 'desertion_wave'), ...pool];
    pool = pool.filter(Boolean);
    return pool[Math.floor(Math.random() * pool.length)];
  },

  resolveWarEvent(game, enemyId, choiceIdx) {
    const w = this.getWarState(game, enemyId);
    if (!w || !w.activeEvent) return { success: false, msg: 'No hay evento activo.' };
    const choice = w.activeEvent.choices[choiceIdx];
    if (!choice) return { success: false, msg: 'Elección inválida.' };
    if (choice.cost > 0 && !game.canAfford(choice.cost)) {
      return { success: false, msg: `Sin fondos. Necesitas $${choice.cost}B.` };
    }
    if (choice.cost > 0) game.spend(choice.cost);
    const result = choice.effect(w);
    w.activeEvent = null;
    if (w.progress >= 100) this.conquer(game, w);
    return { success: true, icon: result.icon, msg: result.msg };
  },

  // ── CONQUEST ───────────────────────────────────────────────

  conquer(game, war) {
    const pid     = game.playerCountryId;
    const isAtk   = war.attacker === pid;
    const enemyId = isAtk ? war.defender : war.attacker;
    const pc      = game.countries[pid];
    const enemy   = game.countries[enemyId];

    // Remove from war lists
    enemy.atWar  = enemy.atWar.filter(id => id !== pid);
    pc.atWar     = pc.atWar.filter(id => id !== enemyId);
    game.wars    = game.wars.filter(w => w !== war);

    // REMOVE from allies — conquered territory is NOT an ally
    pc.allies    = pc.allies.filter(id => id !== enemyId);
    enemy.allies = enemy.allies.filter(id => id !== pid);
    pc.warPacts  = (pc.warPacts || []).filter(id => id !== enemyId);

    // Mark as conquered territory with resistance system
    enemy.conquered       = true;
    enemy.conqueror       = pid;
    enemy.occupationTurns = 0;
    enemy.resistanceLevel = Math.min(92, Math.round(enemy.stability * 0.75 + 35));

    // Spoils of war
    const loot         = _rnd(80, 180) + Math.round(enemy.economy * 2.0);
    const capturedArmy = Math.round((enemy.armySize || 100) * 0.30);
    const capturedMil  = Math.round(enemy.military * 0.18);
    const stabilityHit = _rnd(8, 18);

    game.treasury    += loot;
    pc.armySize      += capturedArmy;
    pc.military       = Math.min(100, pc.military + capturedMil);
    pc.stability      = Math.max(5, pc.stability - stabilityHit);
    game.globalTension = Math.min(100, game.globalTension + 18);
    game.income       = game._calcIncome();

    // International reaction
    for (const [id] of Object.entries(game.countries)) {
      if (id !== pid && id !== enemyId) game.changeRelation(pid, id, -8);
    }

    const incomeBonus = Math.round(enemy.economy * 0.35 + (enemy.resources || 0) * 0.15);
    game.addLog(`🏆 ¡${enemy.name} CONQUISTADO! Botín: +$${loot}B, +${capturedArmy} soldados, +${capturedMil} poder militar.`, 'success');
    game.addLog(`📊 Territorio aporta +$${incomeBonus}B/turno. Resistencia: ${enemy.resistanceLevel}%. Tu estabilidad -${stabilityHit}.`, 'warning');
    if (typeof UI !== 'undefined') UI.showToast(`🏆 <strong>${enemy.name} conquistado y anexado</strong>. Resistencia interna: ${enemy.resistanceLevel}%.`, 'success');
  },
};
