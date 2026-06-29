'use strict';
/* eslint-disable no-use-before-define */

// ────────────────────────────────────────────────────────────────────────────
// WAR_MP — Player-vs-Player war system
// All methods called on the HOST with real game state.
// ────────────────────────────────────────────────────────────────────────────

const WAR_MP = {
  TECH_BUILD : 3,
  TECH_RADAR : 5,
  TECH_NUKE  : 8,
  // Cost to reach each tech level (index = current level, value = cost to go up)
  TECH_COSTS : [80, 100, 120, 150, 200, 250, 300, 400, 500, 800],
  NUKE_COST  : 2000,
  NUKE_TERR  : 65,   // % territory required before nuclear launch

  warKey(a, b) { return [a, b].sort().join('_'); },

  // Create mpWarData entry when a P2P war starts
  init(game, attackerId, defenderId) {
    if (!game.mpWarData) game.mpWarData = {};
    const key = this.warKey(attackerId, defenderId);
    if (game.mpWarData[key]) return game.mpWarData[key];
    const aC = game.countries[attackerId];
    const dC = game.countries[defenderId];
    game.mpWarData[key] = {
      attacker   : attackerId,
      defender   : defenderId,
      progress   : 50,                             // 100 = attacker wins
      troops     : {
        [attackerId]: Math.max(50000, aC?.armySize || 100000),
        [defenderId]: Math.max(50000, dC?.armySize || 100000),
      },
      tech       : {
        [attackerId]: aC?.mpTech || 0,
        [defenderId]: dC?.mpTech || 0,
      },
      weapons    : {
        [attackerId]: Object.assign({ aerial:0, naval:0, missiles:0, interceptors:0 }, aC?.mpWeapons || {}),
        [defenderId]: Object.assign({ aerial:0, naval:0, missiles:0, interceptors:0 }, dC?.mpWeapons || {}),
      },
      shield         : { [attackerId]: false, [defenderId]: false },
      pendingAttacks : [],                          // interceptable incoming attacks
    };
    return game.mpWarData[key];
  },

  get(game, aId, bId) {
    return game.mpWarData?.[this.warKey(aId, bId)];
  },

  // ── ATTACK ACTIONS ───────────────────────────────────────────────────────

  doOffensive(game, attackerId, defenderId) {
    const w = this.get(game, attackerId, defenderId);
    if (!w) return { success: false, msg: 'Sin estado de guerra.' };

    // Check if defender has active shield
    if (w.shield[defenderId]) {
      w.shield[defenderId] = false;
      game.addLog(`🛡️ ¡El escudo de ${game.countries[defenderId]?.name} bloqueó la ofensiva!`, 'warning');
      return {
        success   : false,
        shielded  : true,
        animType  : 'troops',
        msg       : `🛡️ ¡La Defensa Estratégica bloqueó tu ofensiva!\nEl escudo se ha desactivado.`,
      };
    }

    // Direction: if acting player is the original war attacker, progress goes UP; defender counter pushes DOWN
    const actIsOrigAtk = attackerId === w.attacker;

    const myT  = w.troops[attackerId] || 10000;
    const enT  = w.troops[defenderId] || 10000;
    const myTk = w.tech[attackerId] || 0;
    const enTk = w.tech[defenderId] || 0;

    const techBonus  = (myTk - enTk) * 1.5;
    const troopRatio = myT / Math.max(1, enT);
    const base       = 8 + Math.max(-5, Math.min(10, techBonus));
    const gained     = Math.max(1, Math.round(base * Math.min(2, Math.max(0.3, troopRatio))));
    const myLoss     = Math.round(myT * (_rnd(3, 8) / 100));
    const enLoss     = Math.round(enT * (_rnd(5, 12) / 100));

    w.troops[attackerId] = Math.max(500, myT - myLoss);
    w.troops[defenderId] = Math.max(0, enT - enLoss);
    w.progress = actIsOrigAtk
      ? Math.min(100, w.progress + gained)
      : Math.max(0,   w.progress - gained);

    game.addLog(`⚔️ Ofensiva: ${actIsOrigAtk ? '+' : '-'}${gained}% control. ${enLoss.toLocaleString()} bajas enemigas.`, 'success');
    const conquered = this._checkConquest(w);
    return {
      success  : true,
      conquered: !!conquered,
      winner   : conquered,
      animType : 'troops',
      msg      : conquered === attackerId
        ? `⚔️ ¡VICTORIA! Tu ejército ha conquistado ${game.countries[defenderId]?.name}.`
        : conquered
          ? `⚔️ ¡Derrota! ${game.countries[defenderId]?.name} ha repelido tu ofensiva.`
          : `⚔️ Ofensiva completada.\n${actIsOrigAtk?'+':'-'}${gained}% control territorial.\nBajas enemigas: ${enLoss.toLocaleString()} · Tus bajas: ${myLoss.toLocaleString()}`,
    };
  },

  // Returns winnerId if war ended, null if ongoing
  _checkConquest(w) {
    if (w.progress >= 100) return w.attacker;
    if (w.progress <= 0)   return w.defender;
    return null;
  },

  doAir(game, attackerId, defenderId) {
    const w  = this.get(game, attackerId, defenderId);
    if (!w) return { success: false, msg: 'Sin estado de guerra.' };
    const wp = w.weapons[attackerId];
    if (!wp || wp.aerial <= 0)
      return { success: false, msg: '✈️ Sin bombarderos. Compra o construye armamento aéreo.' };
    const actIsOrigAtk = attackerId === w.attacker;
    wp.aerial--;
    const enLoss = _rnd(4000, 14000);
    const gained = _rnd(9, 22);
    w.troops[defenderId] = Math.max(0, (w.troops[defenderId] || 10000) - enLoss);
    w.progress = actIsOrigAtk ? Math.min(100, w.progress + gained) : Math.max(0, w.progress - gained);
    game.addLog(`✈️ Bombardeo aéreo: ${actIsOrigAtk?'+':'-'}${gained}% control. ${enLoss.toLocaleString()} bajas.`, 'success');
    const conquered = this._checkConquest(w);
    return {
      success  : true,
      conquered: !!conquered,
      winner   : conquered,
      animType : 'air',
      msg      : conquered === attackerId
        ? `✈️ ¡VICTORIA AÉREA! ${game.countries[defenderId]?.name} ha caído.`
        : `✈️ Bombardeo aéreo exitoso.\n${actIsOrigAtk?'+':'-'}${gained}% control.\n${enLoss.toLocaleString()} bajas enemigas.\nBombarderos: ${wp.aerial}`,
    };
  },

  doNaval(game, attackerId, defenderId) {
    const w  = this.get(game, attackerId, defenderId);
    if (!w) return { success: false, msg: 'Sin estado de guerra.' };
    const wp = w.weapons[attackerId];
    if (!wp || wp.naval <= 0)
      return { success: false, msg: '⚓ Sin flota de guerra. Compra o construye armamento naval.' };
    const actIsOrigAtk = attackerId === w.attacker;
    wp.naval--;
    const enLoss = _rnd(3000, 11000);
    const gained = _rnd(7, 18);
    w.troops[defenderId] = Math.max(0, (w.troops[defenderId] || 10000) - enLoss);
    w.progress = actIsOrigAtk ? Math.min(100, w.progress + gained) : Math.max(0, w.progress - gained);
    game.addLog(`⚓ Ataque naval: ${actIsOrigAtk?'+':'-'}${gained}% control. ${enLoss.toLocaleString()} bajas.`, 'success');
    const conquered = this._checkConquest(w);
    return {
      success  : true,
      conquered: !!conquered,
      winner   : conquered,
      animType : 'naval',
      msg      : conquered === attackerId
        ? `⚓ ¡VICTORIA NAVAL! ${game.countries[defenderId]?.name} ha caído.`
        : `⚓ Ataque naval exitoso.\n${actIsOrigAtk?'+':'-'}${gained}% control.\n${enLoss.toLocaleString()} bajas enemigas.\nFlota: ${wp.naval}`,
    };
  },

  doMissile(game, attackerId, defenderId) {
    const w  = this.get(game, attackerId, defenderId);
    if (!w) return { success: false, msg: 'Sin estado de guerra.' };
    const wp = w.weapons[attackerId];
    if (!wp || wp.missiles <= 0)
      return { success: false, msg: '🚀 Sin misiles balísticos. Compra misiles primero.' };
    const actIsOrigAtk = attackerId === w.attacker;
    wp.missiles--;
    const enLoss = _rnd(15000, 38000);
    const gained = _rnd(20, 40);
    w.troops[defenderId] = Math.max(0, (w.troops[defenderId] || 10000) - enLoss);
    w.progress = actIsOrigAtk ? Math.min(100, w.progress + gained) : Math.max(0, w.progress - gained);
    game.globalTension = Math.min(100, (game.globalTension || 0) + 12);
    game.addLog(`🚀 ¡MISIL BALÍSTICO! ${actIsOrigAtk?'+':'-'}${gained}% control. ${enLoss.toLocaleString()} bajas. Tensión +12.`, 'danger');
    const conquered = this._checkConquest(w);
    return {
      success  : true,
      conquered: !!conquered,
      winner   : conquered,
      animType : 'missile',
      msg      : conquered === attackerId
        ? `🚀 ¡VICTORIA TOTAL! Los misiles han destruido ${game.countries[defenderId]?.name}.`
        : `🚀 Misil balístico impactó ${game.countries[defenderId]?.name}.\n${actIsOrigAtk?'+':'-'}${gained}% control.\n${enLoss.toLocaleString()} bajas devastadoras.\nMisiles: ${wp.missiles}`,
    };
  },

  // ── DEFENSE / SUPPORT ACTIONS ─────────────────────────────────────────────

  doShield(game, countryId, enemyId) {
    const w = this.get(game, countryId, enemyId);
    if (!w) return { success: false, msg: 'Sin estado de guerra.' };
    if (w.shield[countryId]) return { success: false, msg: '🛡️ El escudo ya está activo.' };
    w.shield[countryId] = true;
    game.addLog(`🛡️ Defensa Estratégica activada por ${game.countries[countryId]?.name}.`, 'success');
    return {
      success : true,
      msg     : '🛡️ Defensa Estratégica activada.\nTu próxima Ofensiva General recibida será bloqueada automáticamente.\n⚠️ Mientras el escudo esté activo NO puedes lanzar Ofensiva General.',
    };
  },

  doIntercept(game, countryId, enemyId, attackId) {
    const w  = this.get(game, countryId, enemyId);
    if (!w) return { success: false, msg: 'Sin estado de guerra.' };
    const wp = w.weapons[countryId];
    if (!wp || wp.interceptors <= 0) return { success: false, msg: '🎯 Sin interceptores disponibles.' };
    const idx = (w.pendingAttacks || []).findIndex(a => a.id === attackId && a.toId === countryId);
    if (idx < 0) return { success: false, msg: '❌ El ataque ya impactó o no existe.' };
    wp.interceptors--;
    const attack = w.pendingAttacks[idx];
    w.pendingAttacks.splice(idx, 1);
    game.addLog(`🎯 ¡Interceptor destruye ataque ${attack.type} entrante!`, 'success');
    return {
      success    : true,
      intercepted: attackId,
      msg        : `🎯 ¡Ataque ${attack.type} interceptado con éxito!\nInterceptores: ${wp.interceptors}`,
    };
  },

  doInvestTech(game, countryId, enemyId) {
    const w = this.get(game, countryId, enemyId);
    if (!w) return { success: false, msg: 'Sin estado de guerra.' };
    const cur = w.tech[countryId] || 0;
    if (cur >= 10) return { success: false, msg: '🔬 Ya tienes el máximo nivel tecnológico (10).' };
    const cost = this.TECH_COSTS[cur];
    if (!game.canAfford(cost)) return { success: false, msg: `💰 Necesitas $${cost}B para nivel ${cur + 1}.` };
    game.spend(cost);
    const nl = cur + 1;
    w.tech[countryId] = nl;
    let extra = '';
    if (nl === this.TECH_BUILD) extra = '\n🏭 DESBLOQUEADO: Construir armamento (2× unidades, más potente).';
    if (nl === this.TECH_RADAR) extra = '\n📡 DESBLOQUEADO: RADAR — detecta ataques entrantes e intercepta.';
    if (nl === this.TECH_NUKE)  extra = '\n☢️ DESBLOQUEADO: Programa de Bomba Nuclear.';
    game.addLog(`🔬 Nivel tecnológico ${nl} ($${cost}B).`, 'success');
    return { success: true, msg: `🔬 Tecnología: Nivel ${nl}/10${extra}` };
  },

  doBuyWeapon(game, countryId, enemyId, weaponType, build) {
    const w = this.get(game, countryId, enemyId);
    if (!w) return { success: false, msg: 'Sin estado de guerra.' };
    if (build && (w.tech[countryId] || 0) < this.TECH_BUILD)
      return { success: false, msg: `🏭 Necesitas nivel tecnológico ${this.TECH_BUILD} para construir.` };
    const BUY   = { aerial: 100, naval: 80,  missiles: 160, interceptors: 120 };
    const BUILD = { aerial: 160, naval: 130, missiles: 250, interceptors: 190 };
    const cost  = (build ? BUILD : BUY)[weaponType];
    if (!cost) return { success: false, msg: 'Tipo de arma inválido.' };
    if (!game.canAfford(cost)) return { success: false, msg: `💰 Necesitas $${cost}B.` };
    game.spend(cost);
    const qty = build ? 2 : 1;
    const wp  = w.weapons[countryId];
    wp[weaponType] = (wp[weaponType] || 0) + qty;
    const names = { aerial: 'bombardero(s)', naval: 'flota(s) naval(es)', missiles: 'misil(es)', interceptors: 'interceptor(es)' };
    const verb  = build ? '🏭 Construido' : '🛒 Comprado';
    game.addLog(`${verb}: ${qty} ${names[weaponType]} ($${cost}B).`, 'success');
    return { success: true, msg: `${verb}: ${qty} ${names[weaponType]}\nCoste: $${cost}B · Total: ${wp[weaponType]}` };
  },

  doNuclear(game, countryId, enemyId) {
    const w = this.get(game, countryId, enemyId);
    if (!w) return { success: false, msg: 'Sin estado de guerra.' };
    if ((w.tech[countryId] || 0) < this.TECH_NUKE)
      return { success: false, msg: `☢️ Necesitas nivel tecnológico ${this.TECH_NUKE}.` };
    if (!game.canAfford(this.NUKE_COST))
      return { success: false, msg: `☢️ Necesitas $${this.NUKE_COST}B.` };
    if (w.progress < this.NUKE_TERR)
      return { success: false, msg: `☢️ Necesitas controlar ${this.NUKE_TERR}% del territorio (tienes ${w.progress}%).` };
    game.spend(this.NUKE_COST);
    const ec = game.countries[enemyId];
    if (ec) { ec.military = 0; ec.stability = 0; }
    w.troops[enemyId] = 0;
    w.progress = 100;
    game.globalTension = 100;
    game.addLog(`☢️ ¡¡BOMBA NUCLEAR!! ${game.countries[countryId]?.name} destruye ${ec?.name}. Tensión MÁXIMA.`, 'danger');
    return {
      success  : true,
      conquered: true,
      nuclear  : true,
      animType : 'nuclear',
      msg      : `☢️ ¡BOMBA NUCLEAR LANZADA!\n${ec?.name} ha sido aniquilado.\nTensión global: MÁXIMA`,
    };
  },

  // ── CONQUEST FINALIZATION ─────────────────────────────────────────────────

  conquer(game, winnerId, loserId) {
    const wc = game.countries[winnerId];
    const lc = game.countries[loserId];
    if (!wc || !lc) return;
    lc.conquered = true;
    lc.conqueror = winnerId;
    wc.armySize  = (wc.armySize || 0) + Math.round((lc.armySize || 0) * 0.3);
    wc.atWar = (wc.atWar || []).filter(id => id !== loserId);
    lc.atWar = (lc.atWar || []).filter(id => id !== winnerId);
    game.wars = (game.wars || []).filter(wr =>
      !((wr.attacker === winnerId && wr.defender === loserId) ||
        (wr.attacker === loserId  && wr.defender === winnerId))
    );
    game.addLog(`🏆 ${wc.name} conquista ${lc.name}.`, 'success');
  },
};

// ─── helper copied from war.js scope (safe to re-declare here) ───────────────
function _rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
