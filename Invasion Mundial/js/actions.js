// ============================================================
// ACTIONS.JS - Player actions by category
// ============================================================

const ACTIONS = {
  diplomacy: [
    {
      id: 'negotiate',
      name: 'Reunión Diplomática',
      icon: '🤝',
      desc: 'Negocia con el país seleccionado. Resultado según relaciones y personalidad.',
      cost: 15,
      needsTarget: true,
      targetExcludeSelf: true,
      execute(state, targetId) {
        const target = state.countries[targetId];
        const rel = state.getRelation(state.playerCountryId, targetId);
        const pc = state.countries[state.playerCountryId];
        const personality = target.personality;

        let successChance = 0.3 + (rel / 200) + (pc.economy / 300);
        if (personality === 'diplomatic') successChance += 0.2;
        if (personality === 'aggressive') successChance -= 0.15;
        if (personality === 'traitor') successChance -= 0.1;
        if (pc.bonusEffect === 'diplomacy_cost_0.8') successChance += 0.1;

        const roll = Math.random();
        if (roll < successChance) {
          const gain = _rnd(10, 20);
          state.changeRelation(state.playerCountryId, targetId, gain);
          state.addLog(`Reunión exitosa con ${target.name}. Relaciones +${gain}.`, 'success');
          return { success: true, msg: `La reunión fue un éxito. ${target.name} recibió tus propuestas positivamente. Relaciones +${gain}.` };
        } else if (roll < successChance + 0.3) {
          state.addLog(`${target.name} fue neutral en la reunión. Sin cambios.`, 'info');
          return { success: false, msg: `${target.name} escuchó tus propuestas pero no se comprometió a nada.` };
        } else {
          state.changeRelation(state.playerCountryId, targetId, -5);
          state.addLog(`${target.name} rechazó tus propuestas. Relaciones -5.`, 'warning');
          return { success: false, msg: `${target.name} rechazó tus avances diplomáticos. La reunión terminó mal.` };
        }
      }
    },
    {
      id: 'propose_alliance',
      name: 'Proponer Alianza',
      icon: '📜',
      desc: 'Propón un tratado de alianza formal. Requiere relaciones > 40.',
      cost: 30,
      needsTarget: true,
      targetExcludeSelf: true,
      execute(state, targetId) {
        const target = state.countries[targetId];
        const rel = state.getRelation(state.playerCountryId, targetId);
        const pc = state.countries[state.playerCountryId];

        if (rel < 40) return { success: false, msg: `${target.name} no confía en ti lo suficiente. Necesitas relaciones > 40 (actual: ${rel}).` };
        if (pc.allies.includes(targetId)) return { success: false, msg: `Ya eres aliado de ${target.name}.` };
        if (target.atWar.includes(state.playerCountryId)) return { success: false, msg: 'No puedes aliar con un país en guerra contigo.' };

        const chance = 0.4 + (rel - 40) / 120 + (target.personality === 'diplomatic' ? 0.2 : 0);
        if (state._p2pForceSuccess || Math.random() < chance) {
          pc.allies.push(targetId);
          target.allies.push(state.playerCountryId);
          state.changeRelation(state.playerCountryId, targetId, 15);
          state.addLog(`¡Alianza formal firmada con ${target.name}!`, 'success');
          return { success: true, msg: `${target.name} aceptó la alianza. Ahora son aliados formales. Tus relaciones han mejorado.` };
        } else {
          state.addLog(`${target.name} rechazó la alianza por ahora.`, 'warning');
          return { success: false, msg: `${target.name} declinó la oferta de alianza. Mejora las relaciones primero.` };
        }
      }
    },
    {
      id: 'trade_deal',
      name: 'Acuerdo Comercial',
      icon: '💱',
      desc: 'Establece acuerdos comerciales bilaterales. Mejora economía y relaciones.',
      cost: 20,
      needsTarget: true,
      targetExcludeSelf: true,
      execute(state, targetId) {
        const target = state.countries[targetId];
        const rel = state.getRelation(state.playerCountryId, targetId);
        if (rel < -20) return { success: false, msg: `${target.name} no comerciará contigo bajo tanta tensión.` };
        const gain = _rnd(5, 12);
        state.changeRelation(state.playerCountryId, targetId, gain);
        state.countries[state.playerCountryId].economy = Math.min(100, state.countries[state.playerCountryId].economy + 2);
        target.economy = Math.min(100, target.economy + 1);
        state.addLog(`Acuerdo comercial con ${target.name}. Economía +2, Relaciones +${gain}.`, 'success');
        return { success: true, msg: `Tratado comercial firmado con ${target.name}. Ambos países se benefician del intercambio.` };
      }
    },
    {
      id: 'send_aid',
      name: 'Enviar Ayuda',
      icon: '🤲',
      desc: 'Envía ayuda (económica, militar, médica o alimentaria) a otro país.',
      cost: 0,
      needsTarget: true,
      targetExcludeSelf: true,
      openModal: true,  // handled by openAidModal() in main.js
      execute(state, targetId) {
        // Handled via aid modal — this is a fallback for AI use
        const target = state.countries[targetId];
        const amount = _rnd(20, 50);
        state.spend(amount);
        const gain = _rnd(12, 22);
        state.changeRelation(state.playerCountryId, targetId, gain);
        target.economy = Math.min(100, target.economy + Math.round(amount / 8));
        state.addLog(`Ayuda enviada a ${target.name} ($${amount}B). Relaciones +${gain}.`, 'success');
        return { success: true, msg: `${target.name} agradeció la ayuda. Relaciones +${gain}.` };
      }
    },
    {
      id: 'diplomatic_pressure',
      name: 'Presión Diplomática',
      icon: '📢',
      desc: 'Presiona a un país para que cambie su conducta. Puede irritar o ceder.',
      cost: 15,
      needsTarget: true,
      targetExcludeSelf: true,
      execute(state, targetId) {
        const target = state.countries[targetId];
        const pc = state.countries[state.playerCountryId];
        const powerRatio = pc.military / Math.max(10, target.military);
        const chance = 0.3 + powerRatio * 0.15;
        if (Math.random() < chance) {
          state.changeRelation(state.playerCountryId, targetId, 5);
          if (target.atWar.includes(state.playerCountryId)) {
            state.changeRelation(state.playerCountryId, targetId, 10);
          }
          state.addLog(`${target.name} cedió ante tu presión diplomática.`, 'success');
          return { success: true, msg: `${target.name} reconoció tu posición. Tu presión fue efectiva.` };
        } else {
          state.changeRelation(state.playerCountryId, targetId, -8);
          state.addLog(`${target.name} respondió negativamente a tu presión. Relaciones -8.`, 'warning');
          return { success: false, msg: `${target.name} rechazó tus presiones y las calificó de "injerencia inaceptable".` };
        }
      }
    },
    {
      id: 'threaten',
      name: 'Amenazar',
      icon: '⚡',
      desc: 'Lanza una amenaza. Puede intimidar, pero aumenta tensión global.',
      cost: 10,
      needsTarget: true,
      targetExcludeSelf: true,
      execute(state, targetId) {
        const target = state.countries[targetId];
        const pc = state.countries[state.playerCountryId];
        const powerAdv = pc.military - target.military;
        state.globalTension = Math.min(100, state.globalTension + 5);
        if (powerAdv > 20) {
          state.changeRelation(state.playerCountryId, targetId, -5);
          target.stability = Math.max(5, target.stability - 5);
          state.addLog(`${target.name} se intimida por tu amenaza.`, 'warning');
          return { success: true, msg: `Tu amenaza fue efectiva. ${target.name} reduce actividades hostiles temporalmente. Tensión global aumentó.` };
        } else {
          state.changeRelation(state.playerCountryId, targetId, -15);
          state.globalTension = Math.min(100, state.globalTension + 5);
          state.addLog(`${target.name} respondió a tu amenaza con hostilidad. Relaciones -15.`, 'danger');
          return { success: false, msg: `${target.name} rechazó tu amenaza con contundencia. Ahora las relaciones son más tensas.` };
        }
      }
    },
    {
      id: 'break_alliance',
      name: 'Romper Alianza',
      icon: '💔',
      desc: 'Disuelve una alianza existente. Daña relaciones con ese país.',
      cost: 5,
      needsTarget: true,
      targetExcludeSelf: true,
      execute(state, targetId) {
        const pc = state.countries[state.playerCountryId];
        const target = state.countries[targetId];
        if (!pc.allies.includes(targetId)) return { success: false, msg: `No tienes una alianza activa con ${target.name}.` };
        pc.allies = pc.allies.filter(id => id !== targetId);
        target.allies = target.allies.filter(id => id !== state.playerCountryId);
        state.changeRelation(state.playerCountryId, targetId, -20);
        state.addLog(`Alianza con ${target.name} rota. Relaciones -20.`, 'warning');
        return { success: true, msg: `Rompiste la alianza con ${target.name}. Las relaciones se enfriarán.` };
      }
    },
  ],

  military: [
    {
      id: 'invade',
      name: 'Invadir País',
      icon: '⚔️',
      desc: 'Declara guerra e inicia una invasión militar.',
      cost: 80,
      needsTarget: true,
      targetExcludeSelf: true,
      execute(state, targetId) {
        const target = state.countries[targetId];
        const pc = state.countries[state.playerCountryId];
        if (target.conquered && target.conqueror === state.playerCountryId) return { success: false, noSpend: true, msg: `${target.name} ya es tu territorio. No puedes invadirte a ti mismo.` };
        if (pc.atWar.includes(targetId)) return { success: false, noSpend: true, msg: `Ya estás en guerra con ${target.name}.` };
        if (pc.allies.includes(targetId)) return { success: false, noSpend: true, msg: `No puedes invadir a un aliado. Rompe la alianza primero.` };
        const isNuclear = !!target.nuclearArms;
        if (typeof SFX !== 'undefined') SFX.war();
        state.startWar(state.playerCountryId, targetId);
        state.addLog(`☠️ ¡${pc.flag} ${pc.name} declara la guerra a ${target.flag} ${target.name}!`, 'danger');

        // Alliance cascade — target's allies join the war against player
        const allyJoiners = (target.allies || []).filter(allyId => {
          const ally = state.countries[allyId];
          return ally && !ally.conquered && !ally.atWar.includes(state.playerCountryId) && allyId !== state.playerCountryId;
        });
        if (allyJoiners.length > 0) {
          for (const allyId of allyJoiners) state.startWar(allyId, state.playerCountryId);
          const allyNames = allyJoiners.map(id => `${state.countries[id]?.flag} ${state.countries[id]?.name}`).join(', ');
          state.addLog(`⚔️ ¡Los aliados de ${target.name} entran en guerra contigo: ${allyNames}!`, 'danger');
          if (typeof UI !== 'undefined') UI.showToast(`⚔️ ¡Cascada de alianzas! <strong>${allyNames}</strong> te declaran la guerra.`, 'warning');
        }

        // Notify player's allies
        const playerAllies = pc.allies.filter(aid => !state.countries[aid]?.atWar.includes(targetId));
        if (playerAllies.length > 0) {
          const pAllyNames = playerAllies.slice(0, 2).map(id => state.countries[id]?.name).filter(Boolean).join(', ');
          state.addLog(`🤝 Tus aliados (${pAllyNames}) están atentos y pueden apoyarte.`, 'info');
        }

        if (isNuclear) {
          state.globalTension = Math.min(100, state.globalTension + 25);
          state.changeRelation(state.playerCountryId, targetId, -25);
          const nukes = ['usa','russia','china','uk','france','india','pakistan','north_korea','israel'].filter(id => id !== state.playerCountryId && id !== targetId);
          for (const nid of nukes) if (state.countries[nid]) state.changeRelation(state.playerCountryId, nid, -15);
          pc.stability = Math.max(5, pc.stability - 12);
          return { success: true, msg: `☢️ GUERRA CONTRA POTENCIA NUCLEAR\n\nAtacas a ${target.name} — armamento nuclear confirmado. La comunidad internacional condena la agresión. Tensión global +25.${allyJoiners.length > 0 ? `\n\n⚔️ ¡${allyJoiners.length} aliado(s) de ${target.name} también entran en guerra!` : ''}` };
        }
        return { success: true, msg: `⚔️ La guerra ha comenzado contra ${target.name}.${allyJoiners.length > 0 ? `\n\n⚔️ ¡CASCADA DE ALIANZAS! ${allyJoiners.length} país(es) más te declaran la guerra.` : ''}` };
      }
    },
    {
      id: 'defend',
      name: 'Fortalecer Defensa',
      icon: '🛡️',
      desc: 'Refuerza tus defensas fronterizas. +10 defensa en combate este turno.',
      cost: 30,
      needsTarget: false,
      execute(state) {
        const pc = state.countries[state.playerCountryId];
        pc.military = Math.min(100, pc.military + 3);
        pc.armySize = Math.round(pc.armySize * 1.1);
        state.addLog('Defensas reforzadas. Ejército +10%, militar +3.', 'success');
        return { success: true, msg: 'Tus ingenieros militares han reforzado las posiciones defensivas. Tu ejército es ahora más difícil de vencer.' };
      }
    },
    {
      id: 'buy_arms',
      name: 'Comprar Armamento',
      icon: '🔫',
      desc: 'Adquiere equipamiento militar avanzado. Mejora nivel tecnológico.',
      cost: 50,
      needsTarget: false,
      execute(state) {
        const pc = state.countries[state.playerCountryId];
        pc.techLevel = Math.min(10, (pc.techLevel || 3) + 1);
        pc.military = Math.min(100, pc.military + 4);
        state.addLog('Armamento adquirido. Tech +1, Militar +4.', 'success');
        return { success: true, msg: 'Nuevo equipamiento llega a tus fuerzas armadas. Tu poder bélico aumenta significativamente.' };
      }
    },
    {
      id: 'train_troops',
      name: 'Entrenar Soldados',
      icon: '🪖',
      desc: 'Invierte en entrenamiento militar. Mejora tamaño y calidad del ejército.',
      cost: 35,
      needsTarget: false,
      execute(state) {
        const pc = state.countries[state.playerCountryId];
        const newTroops = _rnd(20, 50);
        pc.armySize += newTroops;
        pc.military = Math.min(100, pc.military + 2);
        state.addLog(`Reclutas entrenados. +${newTroops} tropas, Militar +2.`, 'success');
        return { success: true, msg: `Nuevas unidades completaron el entrenamiento. +${newTroops} efectivos listos para combate.` };
      }
    },
    {
      id: 'naval_deploy',
      name: 'Flota Naval',
      icon: '⚓',
      desc: 'Despliega flota naval para control marítimo y proyección de poder.',
      cost: 60,
      needsTarget: false,
      execute(state) {
        const pc = state.countries[state.playerCountryId];
        pc.military = Math.min(100, pc.military + 5);
        state.globalTension = Math.min(100, state.globalTension + 3);
        state.addLog('Flota naval desplegada. Militar +5. Tensión global +3.', 'info');
        return { success: true, msg: 'Tu flota naval patrulla aguas internacionales. Tu proyección de poder marítimo aumenta.' };
      }
    },
    {
      id: 'military_base',
      name: 'Base Militar',
      icon: '🏗️',
      desc: 'Construye una base militar. Mejora la defensa permanentemente.',
      cost: 70,
      needsTarget: false,
      execute(state) {
        const pc = state.countries[state.playerCountryId];
        pc.military = Math.min(100, pc.military + 6);
        pc.techLevel = Math.min(10, (pc.techLevel || 3) + 1);
        state.addLog('Base militar construida. Militar +6, Tech +1.', 'success');
        return { success: true, msg: 'Nueva instalación militar operativa. Tu capacidad logística y de respuesta mejoran permanentemente.' };
      }
    },
    {
      id: 'buy_missiles',
      name: 'Misiles Balísticos',
      icon: '🚀',
      desc: 'Adquiere 3 misiles de largo alcance para bombardeos devastadores en guerra.',
      cost: 90,
      needsTarget: false,
      execute(state) {
        state.missiles = (state.missiles || 0) + 3;
        state.addLog(`🚀 3 misiles balísticos adquiridos. Total: ${state.missiles} misiles.`, 'success');
        return { success: true, msg: `Misiles balísticos en silos listos para lanzamiento. Total: ${state.missiles} misiles disponibles.` };
      }
    },
    {
      id: 'peace_offer',
      name: 'Proponer Paz',
      icon: '🕊️',
      desc: 'Ofrece un alto el fuego a un país con el que estás en guerra.',
      cost: 20,
      needsTarget: true,
      targetExcludeSelf: true,
      execute(state, targetId) {
        const target = state.countries[targetId];
        const pc = state.countries[state.playerCountryId];
        if (!pc.atWar.includes(targetId)) return { success: false, msg: `No estás en guerra con ${target.name}.` };
        const chance = 0.5 + (target.stability < 40 ? 0.3 : 0);
        if (state._p2pForceSuccess || Math.random() < chance) {
          pc.atWar = pc.atWar.filter(id => id !== targetId);
          target.atWar = target.atWar.filter(id => id !== state.playerCountryId);
          state.wars = state.wars.filter(w =>
            !(w.attacker === state.playerCountryId && w.defender === targetId) &&
            !(w.attacker === targetId && w.defender === state.playerCountryId)
          );
          // Also clean up P2P war data if present
          if (state.mpWarData) {
            const warKey = [state.playerCountryId, targetId].sort().join('_');
            delete state.mpWarData[warKey];
          }
          state.changeRelation(state.playerCountryId, targetId, 20);
          pc.stability = Math.min(100, pc.stability + 8);
          state.addLog(`Paz firmada con ${target.name}.`, 'success');
          return { success: true, msg: `${target.name} aceptó el alto el fuego. La paz trae alivio a tu población.` };
        } else {
          state.addLog(`${target.name} rechazó tu oferta de paz.`, 'warning');
          return { success: false, msg: `${target.name} rechazó la paz. El conflicto continúa.` };
        }
      }
    },
  ],

  espionage: [
    {
      id: 'infiltrate',
      name: 'Infiltrar Espías',
      icon: '🕵️',
      desc: 'Envía agentes al país objetivo para recopilar inteligencia.',
      cost: 20,
      needsTarget: true,
      targetExcludeSelf: true,
      execute(state, targetId) {
        const target = state.countries[targetId];
        const pc = state.countries[state.playerCountryId];
        const successChance = 0.5 + pc.espionage / 200 - target.espionage / 300;
        const bonusMossad = pc.bonusEffect === 'mossad' ? 0.2 : 0;
        if (Math.random() < successChance + bonusMossad) {
          state.activeOps.push({ source: state.playerCountryId, target: targetId, type: 'intel', turn: state.turn });
          state.changeRelation(state.playerCountryId, targetId, -2);
          state.addLog(`Espías infiltrados en ${target.name}. Inteligencia activa.`, 'success');
          const info = `Militar: ${target.military} | Economía: ${target.economy} | Estabilidad: ${target.stability}`;
          return { success: true, msg: `Tus agentes están activos en ${target.name}. Inteligencia obtenida:\n${info}` };
        } else {
          state.changeRelation(state.playerCountryId, targetId, -15);
          state.addLog(`Espía capturado en ${target.name}. Escándalo diplomático.`, 'danger');
          return { success: false, msg: `Uno de tus agentes fue capturado. ${target.name} protestó formalmente. Relaciones -15.` };
        }
      }
    },
    {
      id: 'steal_tech',
      name: 'Robar Tecnología',
      icon: '💾',
      desc: 'Operación para robar secretos tecnológicos militares del objetivo.',
      cost: 35,
      needsTarget: true,
      targetExcludeSelf: true,
      execute(state, targetId) {
        const target = state.countries[targetId];
        const pc = state.countries[state.playerCountryId];
        const existingOp = state.activeOps.find(op => op.source === state.playerCountryId && op.target === targetId);
        const bonus = (existingOp ? 0.15 : 0) + (pc.bonusEffect === 'mossad' || pc.bonusEffect === 'spy_success_1.25' ? 0.15 : 0);
        const chance = 0.35 + pc.espionage / 200 + bonus;
        if (Math.random() < chance) {
          const techGain = _rnd(1, 2);
          pc.techLevel = Math.min(10, (pc.techLevel || 3) + techGain);
          state.addLog(`Tecnología robada de ${target.name}. Tech +${techGain}.`, 'success');
          return { success: true, msg: `¡Operación exitosa! Tus científicos analizan la tecnología robada de ${target.name}. TechLevel +${techGain}.` };
        } else {
          state.changeRelation(state.playerCountryId, targetId, -20);
          state.addLog(`Operación de robo tecnológico en ${target.name} descubierta.`, 'danger');
          return { success: false, msg: `La operación falló. ${target.name} descubrió tus métodos. Sanciones internacionales posibles.` };
        }
      }
    },
    {
      id: 'sabotage',
      name: 'Sabotear Economía',
      icon: '💣',
      desc: 'Sabotea infraestructura económica clave del objetivo.',
      cost: 40,
      needsTarget: true,
      targetExcludeSelf: true,
      execute(state, targetId) {
        const target = state.countries[targetId];
        const pc = state.countries[state.playerCountryId];
        const chance = 0.4 + pc.espionage / 250 - target.espionage / 400;
        if (Math.random() < chance) {
          const dmg = _rnd(8, 20);
          target.economy = Math.max(5, target.economy - dmg);
          target.stability = Math.max(5, target.stability - _rnd(3, 8));
          state.addLog(`Economía de ${target.name} saboteada. Economía -${dmg}.`, 'success');
          return { success: true, msg: `Operación de sabotaje completada. La economía de ${target.name} sufre disrupciones graves.` };
        } else {
          state.changeRelation(state.playerCountryId, targetId, -25);
          state.globalTension = Math.min(100, state.globalTension + 5);
          state.addLog(`Sabotaje en ${target.name} descubierto. Tensión global +5.`, 'danger');
          return { success: false, msg: `El sabotaje fue descubierto. ${target.name} acusa a tu gobierno públicamente. Crisis diplomática.` };
        }
      }
    },
    {
      id: 'detect_spies',
      name: 'Detectar Espías',
      icon: '🔍',
      desc: 'Activa contraespionaje para detectar y neutralizar agentes enemigos.',
      cost: 15,
      needsTarget: false,
      execute(state) {
        const enemyOps = state.activeOps.filter(op => op.target === state.playerCountryId && op.type === 'enemy');
        if (enemyOps.length === 0) {
          state.addLog('Contrainteligencia: no se detectaron operaciones enemigas activas.', 'info');
          return { success: true, msg: 'Tus servicios de inteligencia no detectaron actividad enemiga activa en tu territorio.' };
        }
        const detected = enemyOps[Math.floor(Math.random() * enemyOps.length)];
        const source = state.countries[detected.source];
        state.activeOps = state.activeOps.filter(op => op !== detected);
        state.changeRelation(state.playerCountryId, detected.source, -15);
        state.addLog(`Red de espionaje de ${source?.name} desmantelada.`, 'success');
        return { success: true, msg: `¡Agentes de ${source?.name} capturados! Su red de espionaje en tu territorio ha sido neutralizada.` };
      }
    },
    {
      id: 'propaganda',
      name: 'Manipular Opinión',
      icon: '📡',
      desc: 'Campaña de desinformación para desestabilizar un país objetivo.',
      cost: 25,
      needsTarget: true,
      targetExcludeSelf: true,
      execute(state, targetId) {
        const target = state.countries[targetId];
        const pc = state.countries[state.playerCountryId];
        const chance = 0.45 + pc.espionage / 200;
        if (Math.random() < chance) {
          const drop = _rnd(5, 15);
          target.stability = Math.max(5, target.stability - drop);
          state.addLog(`Campaña de propaganda en ${target.name}. Estabilidad -${drop}.`, 'success');
          return { success: true, msg: `Tu campaña de desinformación siembra el caos en ${target.name}. Su estabilidad se erosiona.` };
        } else {
          state.addLog(`Campaña de propaganda en ${target.name} detectada y neutralizada.`, 'warning');
          return { success: false, msg: `${target.name} detectó la campaña y la utilizó para unir a su población contra ti.` };
        }
      }
    },
    {
      id: 'covert_op',
      name: 'Operación Encubierta',
      icon: '🎭',
      desc: 'Operación de alto riesgo y alto impacto. Puede desestabilizar o mejorar alianzas.',
      cost: 60,
      needsTarget: true,
      targetExcludeSelf: true,
      execute(state, targetId) {
        const target = state.countries[targetId];
        const pc = state.countries[state.playerCountryId];
        const roll = Math.random();
        const successChance = 0.3 + pc.espionage / 300 + (pc.bonusEffect === 'mossad' ? 0.2 : 0);
        if (roll < successChance) {
          target.military = Math.max(5, target.military - _rnd(10, 20));
          target.stability = Math.max(5, target.stability - _rnd(10, 20));
          state.addLog(`Operación encubierta exitosa en ${target.name}. Impacto devastador.`, 'success');
          return { success: true, msg: `Operación de élite completada. ${target.name} sufre desorganización interna. Resultados: Militar y Estabilidad fuertemente dañados.` };
        } else if (roll < successChance + 0.35) {
          state.addLog(`Operación encubierta en ${target.name} sin efecto notable.`, 'warning');
          return { success: false, msg: 'La operación no tuvo el efecto deseado. Los agentes regresaron sin completar los objetivos.' };
        } else {
          state.changeRelation(state.playerCountryId, targetId, -35);
          state.globalTension = Math.min(100, state.globalTension + 10);
          target.atWar.indexOf(state.playerCountryId) === -1 &&
            state.addLog(`Operación encubierta descubierta en ${target.name}. Crisis grave.`, 'danger');
          return { success: false, msg: `Desastre. Tus agentes fueron capturados y confesaron. Crisis diplomática internacional. Tensión global aumenta drásticamente.` };
        }
      }
    },
  ],

  economy: [
    {
      id: 'infrastructure',
      name: 'Invertir Infraestructura',
      icon: '🏗️',
      desc: 'Mejora carreteras, puertos y redes. Sube economía y estabilidad.',
      cost: 50,
      needsTarget: false,
      execute(state) {
        const pc = state.countries[state.playerCountryId];
        pc.economy = Math.min(100, pc.economy + 4);
        pc.stability = Math.min(100, pc.stability + 3);
        state.income = state._calcIncome();
        state.addLog('Infraestructura mejorada. Economía +4, Estabilidad +3.', 'success');
        return { success: true, msg: 'Nuevos proyectos de infraestructura impulsan la productividad y la satisfacción ciudadana.' };
      }
    },
    {
      id: 'tax_hike',
      name: 'Subir Impuestos',
      icon: '📈',
      desc: 'Aumenta los impuestos. Más ingresos pero baja estabilidad.',
      cost: 0,
      needsTarget: false,
      execute(state) {
        const pc = state.countries[state.playerCountryId];
        const incomeGain = Math.round(state.income * 0.15);
        state.treasury += incomeGain;
        pc.stability = Math.max(5, pc.stability - 8);
        state.addLog(`Impuestos subidos. +$${incomeGain} inmediato. Estabilidad -8.`, 'warning');
        return { success: true, msg: `El gobierno recauda $${incomeGain}B adicionales, pero la ciudadanía protesta ante la carga fiscal.` };
      }
    },
    {
      id: 'tax_cut',
      name: 'Bajar Impuestos',
      icon: '📉',
      desc: 'Reduce impuestos. Menos ingresos pero mejora estabilidad.',
      cost: 0,
      needsTarget: false,
      execute(state) {
        const pc = state.countries[state.playerCountryId];
        pc.economy = Math.min(100, pc.economy + 3);
        pc.stability = Math.min(100, pc.stability + 10);
        state.income = state._calcIncome();
        state.addLog('Impuestos reducidos. Economía +3, Estabilidad +10.', 'success');
        return { success: true, msg: 'La ciudadanía celebra la reducción fiscal. El consumo privado se dispara.' };
      }
    },
    {
      id: 'develop_resources',
      name: 'Explotar Recursos',
      icon: '⛏️',
      desc: 'Intensifica la extracción de recursos naturales para más ingresos.',
      cost: 35,
      needsTarget: false,
      execute(state) {
        const pc = state.countries[state.playerCountryId];
        const gain = _rnd(20, 50);
        state.treasury += gain;
        pc.resources = Math.min(100, pc.resources + 2);
        state.addLog(`Recursos explotados. +$${gain}B inmediatos.`, 'success');
        return { success: true, msg: `Nuevas concesiones extractivas generan $${gain}B inmediatos. Tus reservas de recursos crecen.` };
      }
    },
    {
      id: 'military_industry',
      name: 'Industria Militar',
      icon: '🏭',
      desc: 'Desarrolla complejos industriales militares. Reduce costos militares futuros.',
      cost: 60,
      needsTarget: false,
      execute(state) {
        const pc = state.countries[state.playerCountryId];
        pc.economy = Math.min(100, pc.economy + 3);
        pc.military = Math.min(100, pc.military + 5);
        state.addLog('Industria militar desarrollada. Economía +3, Militar +5.', 'success');
        return { success: true, msg: 'El complejo industrial-militar está operativo. Tu capacidad de producción bélica aumenta.' };
      }
    },
    {
      id: 'control_inflation',
      name: 'Control Inflación',
      icon: '🏦',
      desc: 'Implementa políticas monetarias para estabilizar la economía.',
      cost: 25,
      needsTarget: false,
      execute(state) {
        const pc = state.countries[state.playerCountryId];
        pc.economy = Math.min(100, pc.economy + 5);
        pc.stability = Math.min(100, pc.stability + 4);
        state.income = state._calcIncome();
        state.addLog('Inflación controlada. Economía +5, Estabilidad +4.', 'success');
        return { success: true, msg: 'El banco central implementa políticas efectivas. La economía se estabiliza y los ciudadanos recuperan confianza.' };
      }
    },
  ],

  internal: [
    {
      id: 'propaganda_int',
      name: 'Propaganda Nacional',
      icon: '📺',
      desc: 'Campaña mediática para subir popularidad y estabilidad interna.',
      cost: 20,
      needsTarget: false,
      execute(state) {
        const pc = state.countries[state.playerCountryId];
        const gain = _rnd(8, 16);
        pc.stability = Math.min(100, pc.stability + gain);
        state.addLog(`Propaganda nacional. Estabilidad +${gain}.`, 'success');
        return { success: true, msg: `Los medios difunden mensajes patrióticos. Tu popularidad sube +${gain} puntos.` };
      }
    },
    {
      id: 'control_protests',
      name: 'Control de Protestas',
      icon: '🛡️',
      desc: 'Usa fuerzas de orden público para suprimir protestas. Estabilidad sube, pero puede tensarse.',
      cost: 15,
      needsTarget: false,
      execute(state) {
        const pc = state.countries[state.playerCountryId];
        const gain = _rnd(5, 15);
        pc.stability = Math.min(100, pc.stability + gain);
        if (Math.random() < 0.3) {
          for (const [id] of Object.entries(state.countries)) {
            if (id !== state.playerCountryId) state.changeRelation(state.playerCountryId, id, -3);
          }
          state.addLog(`Protestas reprimidas. Estabilidad +${gain}. Críticas internacionales.`, 'warning');
          return { success: true, msg: 'Las protestas fueron disueltas, pero la comunidad internacional critica tus métodos.' };
        }
        state.addLog(`Protestas controladas. Estabilidad +${gain}.`, 'success');
        return { success: true, msg: `El orden fue restaurado. Estabilidad +${gain}.` };
      }
    },
    {
      id: 'political_reform',
      name: 'Reforma Política',
      icon: '📋',
      desc: 'Implementa reformas institucionales. Mejora estabilidad y reputación internacional.',
      cost: 40,
      needsTarget: false,
      execute(state) {
        const pc = state.countries[state.playerCountryId];
        pc.stability = Math.min(100, pc.stability + 15);
        for (const [id] of Object.entries(state.countries)) {
          if (id !== state.playerCountryId) state.changeRelation(state.playerCountryId, id, 3);
        }
        state.addLog('Reformas políticas implementadas. Estabilidad +15, relaciones internacionales mejoran.', 'success');
        return { success: true, msg: 'Las reformas democráticas mejoran tu imagen global. Estabilidad y relaciones internacionales suben.' };
      }
    },
    {
      id: 'crisis_management',
      name: 'Gestión de Crisis',
      icon: '🚨',
      desc: 'Activa protocolo de emergencia para frenar el deterioro interno.',
      cost: 30,
      needsTarget: false,
      execute(state) {
        const pc = state.countries[state.playerCountryId];
        if (pc.stability > 50) return { success: false, msg: 'No hay una crisis activa que requiera gestión de emergencia.' };
        const recovery = _rnd(10, 20);
        pc.stability = Math.min(100, pc.stability + recovery);
        state.addLog(`Gestión de crisis: Estabilidad +${recovery}.`, 'success');
        return { success: true, msg: `El gobierno de emergencia funciona. Estabilidad recuperada +${recovery} puntos.` };
      }
    },
    {
      id: 'anticorruption',
      name: 'Anticorrupción',
      icon: '⚖️',
      desc: 'Campaña anti-corrupción. Mejora economía y estabilidad a largo plazo.',
      cost: 35,
      needsTarget: false,
      execute(state) {
        const pc = state.countries[state.playerCountryId];
        pc.economy = Math.min(100, pc.economy + 4);
        pc.stability = Math.min(100, pc.stability + 6);
        state.income = state._calcIncome();
        state.addLog('Campaña anticorrupción. Economía +4, Estabilidad +6.', 'success');
        return { success: true, msg: 'La purga de corrupción libera recursos productivos. La ciudadanía confía más en el gobierno.' };
      }
    },
    {
      id: 'welfare_spending',
      name: 'Gasto en Bienestar',
      icon: '🏥',
      desc: 'Invierte en salud, educación y seguridad social. Alto costo, alta estabilidad.',
      cost: 55,
      needsTarget: false,
      execute(state) {
        const pc = state.countries[state.playerCountryId];
        pc.stability = Math.min(100, pc.stability + 20);
        pc.economy = Math.min(100, pc.economy + 2);
        state.addLog('Gasto social masivo. Estabilidad +20, Economía +2.', 'success');
        return { success: true, msg: 'La inversión social genera un enorme aumento de popularidad. Tu gobierno goza de apoyo histórico.' };
      }
    },
  ],

  // ── INVESTIGACIÓN INTERNA ─────────────────────────────────
  intelligence: [
    {
      id: 'hunt_spies',
      name: 'Cazar Espías',
      icon: '🕵️‍♂️',
      desc: 'Detecta y neutraliza agentes extranjeros activos en tu territorio.',
      cost: 25,
      needsTarget: false,
      execute(state) {
        const pid = state.playerCountryId;
        const pc  = state.countries[pid];
        const enemyOps = state.activeOps.filter(op => op.target === pid && op.source !== pid);
        const chance = 0.45 + (pc.espionage || 40) / 180;
        if (enemyOps.length === 0) {
          pc.espionage = Math.min(100, (pc.espionage || 40) + 4);
          state.addLog('Búsqueda de espías: territorio limpio. Contrainteligencia +4.', 'success');
          return { success: true, msg: 'Búsqueda exhaustiva completada.\n\n✅ No se detectaron agentes extranjeros activos.\n\nTu contrainteligencia mejora por el ejercicio. Espionaje +4.' };
        }
        if (Math.random() < chance) {
          const op  = enemyOps[Math.floor(Math.random() * enemyOps.length)];
          const spy = state.countries[op.source];
          state.activeOps = state.activeOps.filter(o => o !== op);
          state.changeRelation(pid, op.source, -10);
          state.addLog(`Espía de ${spy.name} capturado y expulsado.`, 'warning');
          const remaining = enemyOps.length - 1;
          return { success: true, msg: `🎯 AGENTE NEUTRALIZADO\n\nAgente de ${spy.flag} ${spy.name} identificado y expulsado.\nDocumentos clasificados asegurados.\nRelaciones con ${spy.name} -10.\n\n${remaining > 0 ? `⚠️ Se detectan ${remaining} operación(es) enemigas adicionales. Continúa la búsqueda.` : '✅ Ninguna operación enemiga adicional detectada.'}` };
        } else {
          return { success: false, msg: `La operación no fue concluyente.\n\nSe sospecha de ${enemyOps.length} operación(es) activa(s) en tu territorio pero los agentes no pudieron ser localizados con precisión.\n\nIntensifica la contrainteligencia.` };
        }
      }
    },
    {
      id: 'investigate_leak',
      name: 'Investigar Filtración',
      icon: '📂',
      desc: 'Investiga por qué se filtraron documentos clasificados e identifica al responsable.',
      cost: 30,
      needsTarget: false,
      execute(state) {
        const pid = state.playerCountryId;
        const pc  = state.countries[pid];
        const suspects = Object.entries(state.countries).filter(([id, c]) =>
          id !== pid && (c.atWar?.includes(pid) || state.getRelation(pid, id) < -10 || state.activeOps.some(op => op.target === pid && op.source === id))
        );
        if (suspects.length === 0) {
          pc.stability = Math.min(100, pc.stability + 5);
          return { success: true, msg: '📂 INVESTIGACIÓN CERRADA\n\nNo se encontraron actores externos involucrados.\n\nConclusión: error humano interno. Funcionario negligente identificado y despedido.\nMedidas de seguridad reforzadas. Estabilidad +5.' };
        }
        const chance = 0.55 + (pc.espionage || 40) / 200;
        if (Math.random() < chance) {
          const [suspId, susp] = suspects[Math.floor(Math.random() * suspects.length)];
          state.changeRelation(pid, suspId, -15);
          state.globalTension = Math.min(100, state.globalTension + 5);
          state.addLog(`Filtración vinculada a ${susp.name}. Escándalo internacional.`, 'warning');
          return { success: true, msg: `📂 INFORME CLASIFICADO\n\n${susp.flag} ${susp.name} vinculado a la filtración de documentos.\n\nMétodo: agentes infiltrados + soborno de funcionarios.\nEvidencia: comunicaciones interceptadas y transferencias financieras.\n\nRespuesta: expulsión de diplomáticos, denuncia formal ante la ONU.\nRelaciones con ${susp.name} -15 · Tensión global +5.` };
        } else {
          pc.stability = Math.max(5, pc.stability - 3);
          return { success: false, msg: 'Investigación sin resultados concluyentes.\n\nEl caso permanece abierto. La incertidumbre genera desconfianza interna.\n\nEstabilidad -3.' };
        }
      }
    },
    {
      id: 'counter_intel',
      name: 'Auditoría de Seguridad',
      icon: '🔒',
      desc: 'Refuerza los protocolos internos. Hace el espionaje enemigo más difícil.',
      cost: 20,
      needsTarget: false,
      execute(state) {
        const pc   = state.countries[state.playerCountryId];
        const gain = _rnd(5, 12);
        pc.espionage = Math.min(100, (pc.espionage || 40) + gain);
        pc.stability = Math.min(100, pc.stability + 2);
        state.addLog(`Auditoría de seguridad. Contrainteligencia +${gain}.`, 'success');
        return { success: true, msg: `🔒 AUDITORÍA COMPLETADA\n\nProtocolos actualizados:\n• Comunicaciones cifradas de extremo a extremo\n• Acceso a documentos clasificados restringido\n• Nuevos procedimientos de verificación de personal\n\nEspionaje (contrainteligencia) +${gain}\nEstabilidad +2` };
      }
    },
    {
      id: 'threat_assessment',
      name: 'Informe de Amenazas',
      icon: '📊',
      desc: 'Genera un informe ejecutivo de todas las amenazas internas y externas activas.',
      cost: 0,
      needsTarget: false,
      execute(state) {
        const pid = state.playerCountryId;
        const pc  = state.countries[pid];
        const occupied = Object.values(state.countries).filter(c => c.conquered && c.conqueror === pid);
        const highRes  = occupied.filter(c => (c.resistanceLevel || 0) > 60);
        const enemyOps = state.activeOps.filter(op => op.target === pid);
        const hostiles = Object.entries(state.countries)
          .filter(([id]) => id !== pid && state.getRelation(pid, id) < -40)
          .map(([, c]) => `${c.flag} ${c.name}`).slice(0, 4);
        const warPacts = (pc.warPacts || []).length;
        const tensionLabel = state.globalTension < 30 ? '🟢 BAJA' : state.globalTension < 60 ? '🟡 MODERADA' : '🔴 ALTA';
        const msg = [
          `📊 INFORME EJECUTIVO DE SEGURIDAD — Turno ${state.turn}`,
          '─────────────────────────────────',
          `Amenaza global: ${tensionLabel} (${state.globalTension}/100)`,
          '',
          '[ SITUACIÓN INTERNA ]',
          `• Estabilidad: ${pc.stability}%`,
          `• Territorios ocupados: ${occupied.length}${highRes.length > 0 ? ` (⚠️ ${highRes.length} con resistencia alta)` : ''}`,
          `• Operaciones enemigas detectadas: ${enemyOps.length > 0 ? `⚠️ ${enemyOps.length} activa(s)` : '✅ Ninguna'}`,
          '',
          '[ SITUACIÓN EXTERIOR ]',
          `• En guerra con: ${pc.atWar.length > 0 ? pc.atWar.map(id => state.countries[id]?.name).join(', ') : 'Nadie'}`,
          `• Países hostiles (rel<-40): ${hostiles.length > 0 ? hostiles.join(', ') : 'Ninguno'}`,
          '',
          '[ ALIANZAS ]',
          `• Aliados formales: ${pc.allies.length} · Pactos de guerra: ${warPacts}`,
          `• Misiles disponibles: ${state.missiles || 0} 🚀`,
        ].join('\n');
        return { success: true, msg };
      }
    },
  ],

  // ── RECONOCIMIENTO EXTERIOR ───────────────────────────────
  recon: [
    {
      id: 'military_analysis',
      name: 'Analizar Fuerzas Militares',
      icon: '🎯',
      desc: 'Inteligencia detallada del ejército del objetivo: tropas, armamento y capacidad real.',
      cost: 20,
      needsTarget: true,
      targetExcludeSelf: true,
      execute(state, targetId) {
        const target = state.countries[targetId];
        const pc     = state.countries[state.playerCountryId];
        const hasOp  = state.activeOps.find(op => op.source === state.playerCountryId && op.target === targetId);
        const chance = 0.50 + (pc.espionage || 40) / 200 + (hasOp ? 0.15 : 0);
        if (Math.random() < chance) {
          const size  = (target.armySize || 50000).toLocaleString();
          const tier  = (target.armySize || 0) > 500000 ? 'MASIVO' : (target.armySize || 0) > 200000 ? 'GRANDE' : (target.armySize || 0) > 80000 ? 'MEDIANO' : 'REDUCIDO';
          const risk  = target.military > 80 ? '🔴 MUY ALTO' : target.military > 60 ? '🟠 ALTO' : target.military > 40 ? '🟡 MODERADO' : '🟢 BAJO';
          const nukes = target.nuclearArms ? '☢️ CONFIRMADO' : '✅ No detectado';
          state.addLog(`Informe militar de ${target.name} obtenido.`, 'success');
          return { success: true, msg: `🎯 INFORME MILITAR · ${target.flag} ${target.name}\n${'─'.repeat(32)}\nTropas activas: ${size} (${tier})\nCapacidad militar: ${target.military}/100\nNivel de amenaza: ${risk}\nArmamento nuclear: ${nukes}\nEstabilidad política: ${target.stability}/100\nEconomía de guerra: ${target.economy}/100\nMisiles balísticos: ${target.missiles || 0} unidades` };
        } else {
          state.changeRelation(state.playerCountryId, targetId, -8);
          return { success: false, msg: `${target.name} detectó movimientos sospechosos cerca de sus instalaciones. La misión fue abortada. Relaciones -8.` };
        }
      }
    },
    {
      id: 'weapon_intel',
      name: 'Investigar Arsenal y Programas',
      icon: '💣',
      desc: 'Infiltra instalaciones secretas para descubrir armamento y proyectos de investigación.',
      cost: 35,
      needsTarget: true,
      targetExcludeSelf: true,
      execute(state, targetId) {
        const target = state.countries[targetId];
        const pc     = state.countries[state.playerCountryId];
        const chance = 0.40 + (pc.espionage || 40) / 220;
        if (Math.random() < chance) {
          const tech  = target.techLevel || 3;
          const techLabel = tech >= 8 ? 'AVANZADO — potencia mundial' : tech >= 5 ? 'MEDIO — capacidad regional' : 'BÁSICO — limitado';
          const rnd   = Math.random();
          state.addLog(`Arsenal de ${target.name} investigado.`, 'success');
          return { success: true, msg: `💣 INFORME DE ARSENAL · ${target.flag} ${target.name}\n${'─'.repeat(32)}\nNivel tecnológico: ${tech}/10 (${techLabel})\nMisiles balísticos: ${target.missiles || 0 > 0 ? `${target.missiles} ⚠️` : '✅ Ninguno detectado'}\nArmamento nuclear: ${target.nuclearArms ? '☢️ CONFIRMADO — PELIGRO EXTREMO' : '✅ No detectado'}\nPrograma I+D: ${tech >= 7 ? '🔬 Activo y financiado' : '⚙️ Limitado'}\nCapacidad producción: ${target.economy > 60 ? 'Alta' : target.economy > 30 ? 'Media' : 'Baja'}` };
        } else if (Math.random() < 0.5) {
          state.changeRelation(state.playerCountryId, targetId, -20);
          state.addLog(`Agente capturado en instalación de ${target.name}.`, 'danger');
          return { success: false, msg: `Agente capturado en instalación militar clasificada de ${target.name}.\n\nIncidente diplomático grave. Relaciones -20.` };
        } else {
          return { success: false, msg: `Seguridad demasiado estricta en las instalaciones de ${target.name}. Agentes retirados sin comprometer la misión.` };
        }
      }
    },
    {
      id: 'war_prediction',
      name: 'Detectar Planes de Ataque',
      icon: '📡',
      desc: 'Analiza señales de inteligencia para saber si el objetivo prepara una guerra contra ti o tus aliados.',
      cost: 40,
      needsTarget: true,
      targetExcludeSelf: true,
      execute(state, targetId) {
        const target = state.countries[targetId];
        const pc     = state.countries[state.playerCountryId];
        const pid    = state.playerCountryId;
        const chance = 0.55 + (pc.espionage || 40) / 200;
        if (Math.random() < chance) {
          const rel    = state.getRelation(pid, targetId);
          const allyEnemy = Object.values(state.countries).some(c =>
            c.atWar?.includes(pid) && (c.allies?.includes(targetId) || (c.warPacts || []).includes(targetId))
          );
          let score = 0;
          if (rel < -50) score += 3; else if (rel < -20) score += 2; else if (rel < 0) score += 1;
          if (target.military > 70) score += 2; else if (target.military > 50) score += 1;
          if (state.globalTension > 60) score += 2; else if (state.globalTension > 40) score += 1;
          if (allyEnemy) score += 3;
          if (target.atWar?.includes(pid)) score += 6;

          let riskLevel, detail;
          if (score >= 7) {
            riskLevel = '🔴 INMINENTE';
            detail    = 'Concentración de tropas detectada en frontera. Comunicaciones militares cifradas intensas. Posible ataque en 1-2 turnos.';
          } else if (score >= 4) {
            riskLevel = '🟠 ELEVADO';
            detail    = 'Movimientos militares inusuales. Aumento de presupuesto de defensa. Posible conflicto en 3-5 turnos.';
          } else if (score >= 2) {
            riskLevel = '🟡 MODERADO';
            detail    = 'Retórica agresiva en medios estatales. Ejercicios militares frecuentes cerca de tus zonas de influencia.';
          } else {
            riskLevel = '🟢 BAJO';
            detail    = 'Sin indicadores de preparación bélica. Relaciones tensas pero sin señales de ataque inmediato.';
          }
          const threatenAllies = pc.allies.filter(id => state.getRelation(targetId, id) < -30).map(id => state.countries[id]?.name).filter(Boolean);
          state.addLog(`Análisis de amenaza de ${target.name}: ${riskLevel}.`, 'info');
          return { success: true, msg: `📡 ANÁLISIS DE AMENAZA · ${target.flag} ${target.name}\n${'─'.repeat(32)}\nRiesgo de ataque contra ti: ${riskLevel}\n\n${detail}\n\nRelación actual: ${rel} (${rel < -30 ? 'Hostil' : rel < 0 ? 'Fría' : rel < 30 ? 'Neutra' : 'Positiva'})\nPoder militar enemigo: ${target.military}/100${threatenAllies.length > 0 ? `\n\n⚠️ También muestran hostilidad hacia: ${threatenAllies.join(', ')}` : ''}` };
        } else {
          return { success: false, msg: `No se pudieron interceptar suficientes señales de inteligencia.\n\nResultado inconclusivo. Considera instalar una red de informantes primero.` };
        }
      }
    },
    {
      id: 'informant_network',
      name: 'Red de Informantes',
      icon: '🌐',
      desc: 'Establece una red permanente de espías locales que te alertará de ataques y planes secretos.',
      cost: 55,
      needsTarget: true,
      targetExcludeSelf: true,
      execute(state, targetId) {
        const target = state.countries[targetId];
        const pc     = state.countries[state.playerCountryId];
        const chance = 0.50 + (pc.espionage || 40) / 220;
        if (Math.random() < chance) {
          const existing = state.activeOps.find(op => op.source === state.playerCountryId && op.target === targetId && op.type === 'network');
          if (existing) {
            existing.turn = state.turn;
            return { success: true, msg: `Red de informantes en ${target.flag} ${target.name} renovada.\nSeguirá activa por 6 turnos más.` };
          }
          state.activeOps.push({ source: state.playerCountryId, target: targetId, type: 'network', turn: state.turn, duration: 6 });
          state.addLog(`Red de informantes activa en ${target.name} (6 turnos).`, 'success');
          return { success: true, msg: `🌐 RED ESTABLECIDA · ${target.flag} ${target.name}\n${'─'.repeat(32)}\nRed de 12 informantes locales activada.\nDuración: 6 turnos\n\nBeneficios activos:\n• Alerta automática si declaran guerra contra ti\n• +15% éxito en futuras operaciones en este país\n• Inteligencia pasiva cada turno en el log` };
        } else {
          state.changeRelation(state.playerCountryId, targetId, -25);
          state.globalTension = Math.min(100, state.globalTension + 8);
          state.addLog(`Red de informantes desmantelada en ${target.name}. Crisis.`, 'danger');
          return { success: false, msg: `Contraespionaje de ${target.name} desmanteló la red completa.\nVarios agentes capturados y confesaron.\n\nRelaciones -25 · Tensión global +8.` };
        }
      }
    },
  ],

  // Tax rate actions (used by the tax panel — not rendered as regular action buttons)
  taxes: [],

  // Industries (used by industries panel — not regular buttons)
  industries: [],
};

// Industry definitions (used by UI panel)
const INDUSTRY_DEFS = {
  factory:            { name: '🏭 Fábrica',             annualIncome: 30, cost: 80,  desc: 'Producción manufacturera básica' },
  port:               { name: '⚓ Puerto Comercial',     annualIncome: 40, cost: 100, desc: 'Exportaciones e importaciones' },
  power_plant:        { name: '⚡ Central Eléctrica',    annualIncome: 25, cost: 60,  desc: 'Suministro energético nacional' },
  tech_park:          { name: '🔬 Parque Tecnológico',  annualIncome: 55, cost: 160, desc: 'Innovación y tecnología avanzada' },
  industrial_complex: { name: '🏗️ Complejo Industrial', annualIncome: 80, cost: 220, desc: 'Polo industrial de gran escala' },
};
