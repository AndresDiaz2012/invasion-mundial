// ============================================================
// EVENTS.JS - DOMINIO GLOBAL
// Dynamic world events
// ============================================================

const EVENTS = [
  // ── ECONOMIC ──────────────────────────────────────────────
  {
    id: 'global_recession',
    name: 'Recesión Económica Global',
    icon: '📉',
    type: 'economy',
    weight: 12,
    description: 'Una crisis financiera sacude los mercados mundiales.',
    effect: (state) => {
      for (const country of Object.values(state.countries)) {
        country.economy = Math.max(5, country.economy - rnd(5, 15));
      }
      state.budget.income = Math.floor(state.budget.income * 0.85);
      state.addLog('Recesión global: tus ingresos cayeron un 15%.', 'danger');
    },
    choices: null,
  },
  {
    id: 'oil_spike',
    name: 'Disparo del Precio del Petróleo',
    icon: '🛢️',
    type: 'economy',
    weight: 10,
    description: 'El precio del petróleo se dispara en los mercados internacionales.',
    effect: (state) => {
      const oilCountries = ['saudi_arabia', 'russia', 'iran'];
      for (const id of oilCountries) {
        if (state.countries[id]) state.countries[id].economy = Math.min(100, state.countries[id].economy + rnd(8, 18));
      }
      if (!oilCountries.includes(state.playerCountryId)) {
        state.budget.income = Math.floor(state.budget.income * 0.92);
        state.addLog('Alza del petróleo: tus costos de importación aumentaron.', 'warning');
      } else {
        state.budget.income = Math.floor(state.budget.income * 1.15);
        state.addLog('El alza del petróleo llenó tus arcas.', 'success');
      }
    },
    choices: null,
  },
  {
    id: 'tech_boom',
    name: 'Auge Tecnológico',
    icon: '💻',
    type: 'economy',
    weight: 8,
    description: 'Una ola de innovación tecnológica impulsa la economía global.',
    effect: (state) => {
      state.countries[state.playerCountryId].economy = Math.min(100,
        state.countries[state.playerCountryId].economy + rnd(3, 8));
      state.budget.income = Math.floor(state.budget.income * 1.08);
      state.addLog('El auge tecnológico global aumenta tus ingresos un 8%.', 'success');
    },
  },
  {
    id: 'sanctions_pressure',
    name: 'Presión Económica Internacional',
    icon: '🚫',
    type: 'economy',
    weight: 7,
    trigger: (state) => {
      const pc = state.countries[state.playerCountryId];
      return pc.atWar.length > 0;
    },
    description: 'La comunidad internacional exige sanciones contra los países en guerra.',
    effect: (state) => {
      state.budget.income = Math.floor(state.budget.income * 0.90);
      state.addLog('Sanciones internacionales: ingresos reducidos 10% por estar en guerra.', 'danger');
    },
  },

  // ── POLITICAL ─────────────────────────────────────────────
  {
    id: 'coup_attempt',
    name: 'Intento de Golpe de Estado',
    icon: '🎖️',
    type: 'political',
    weight: 9,
    trigger: (state) => state.countries[state.playerCountryId].stability < 40,
    description: 'Generales descontentos amenazan con tomar el poder.',
    choices: [
      {
        label: 'Sofocar con ejército (-20 estabilidad, -10 relaciones con aliados)',
        effect: (state) => {
          state.countries[state.playerCountryId].stability = Math.max(5,
            state.countries[state.playerCountryId].stability - 20);
          for (const id of Object.keys(state.countries)) {
            if (id !== state.playerCountryId && state.getRelation(state.playerCountryId, id) > 30) {
              state.changeRelation(state.playerCountryId, id, -10);
            }
          }
          state.addLog('Sofocaste el golpe a la fuerza. Costo político alto.', 'warning');
        }
      },
      {
        label: 'Negociar concesiones (-10 estabilidad, +5 relaciones)',
        effect: (state) => {
          state.countries[state.playerCountryId].stability = Math.max(5,
            state.countries[state.playerCountryId].stability - 10);
          state.addLog('Negociaste con los militares. Paz frágil.', 'info');
        }
      },
      {
        label: 'Gastos de bienestar (+$, -tesoro, +15 estabilidad)',
        effect: (state) => {
          const cost = Math.floor(state.budget.income * 0.30);
          if (state.treasury >= cost) {
            state.treasury -= cost;
            state.countries[state.playerCountryId].stability = Math.min(100,
              state.countries[state.playerCountryId].stability + 15);
            state.addLog('Compraste lealtad popular. Costoso pero efectivo.', 'success');
          } else {
            state.addLog('No tienes fondos suficientes. El golpe se acerca.', 'danger');
            state.countries[state.playerCountryId].stability -= 15;
          }
        }
      },
    ]
  },
  {
    id: 'elections',
    name: 'Elecciones Internas',
    icon: '🗳️',
    type: 'political',
    weight: 8,
    description: 'Tu país celebra elecciones nacionales. Los resultados afectarán tu gobierno.',
    choices: [
      {
        label: 'Campaña de bienestar (+15 estabilidad, -10% ingresos/turno)',
        effect: (state) => {
          state.countries[state.playerCountryId].stability = Math.min(100,
            state.countries[state.playerCountryId].stability + 15);
          state.budget.militaryPct = Math.max(10, state.budget.militaryPct - 5);
          state.addLog('Ganaste con promesas sociales. Estabilidad alta, gasto militar reducido.', 'info');
        }
      },
      {
        label: 'Campaña nacionalista (+8 estabilidad, -10 relaciones vecinos)',
        effect: (state) => {
          state.countries[state.playerCountryId].stability = Math.min(100,
            state.countries[state.playerCountryId].stability + 8);
          for (const id of Object.keys(state.countries)) {
            if (id !== state.playerCountryId) state.changeRelation(state.playerCountryId, id, -8);
          }
          state.addLog('Campaña nacionalista exitosa. Tensiones internacionales.', 'warning');
        }
      },
    ]
  },
  {
    id: 'internal_protest',
    name: 'Protestas Masivas',
    icon: '✊',
    type: 'political',
    weight: 11,
    trigger: (state) => {
      const pc = state.countries[state.playerCountryId];
      return pc.stability < 55 || pc.atWar.length > 0;
    },
    description: 'Miles de ciudadanos salen a las calles exigiendo cambios.',
    effect: (state) => {
      const pc = state.countries[state.playerCountryId];
      const drop = rnd(8, 20);
      pc.stability = Math.max(5, pc.stability - drop);
      state.addLog(`Protestas internas: estabilidad cayó ${drop} puntos.`, 'danger');
    },
  },

  // ── MILITARY ──────────────────────────────────────────────
  {
    id: 'arms_deal',
    name: 'Oferta de Venta de Armas',
    icon: '🔫',
    type: 'military',
    weight: 8,
    description: 'Un proveedor extranjero ofrece equipamiento militar de alta calidad.',
    choices: [
      {
        label: 'Comprar armamento (+3 tech, -25% tesoro)',
        effect: (state) => {
          const cost = Math.floor(state.treasury * 0.25);
          state.treasury -= cost;
          state.countries[state.playerCountryId].techLevel = Math.min(10,
            (state.countries[state.playerCountryId].techLevel || 5) + 3);
          state.addLog('Compraste armamento avanzado. Tu nivel tecnológico aumentó.', 'success');
        }
      },
      {
        label: 'Rechazar la oferta',
        effect: (state) => {
          state.addLog('Rechazaste la oferta de armas.', 'info');
        }
      }
    ]
  },
  {
    id: 'military_mutiny',
    name: 'Motín Militar',
    icon: '⚔️',
    type: 'military',
    weight: 6,
    trigger: (state) => {
      const exp = state.expensesPerTurn;
      return exp.military < state.budget.income * 0.10;
    },
    description: 'Soldados mal pagados amenazan con desertar en masa.',
    effect: (state) => {
      const pc = state.countries[state.playerCountryId];
      pc.armySize = Math.floor(pc.armySize * 0.85);
      pc.stability = Math.max(5, pc.stability - 12);
      state.addLog('Motín militar: perdiste el 15% de tu ejército y estabilidad.', 'danger');
    },
  },
  {
    id: 'border_incident',
    name: 'Incidente Fronterizo',
    icon: '💥',
    type: 'military',
    weight: 10,
    trigger: (state) => {
      const pc = state.countries[state.playerCountryId];
      return Object.values(pc.relations).some(r => r < -50);
    },
    description: 'Un choque entre fuerzas en la frontera escala la tensión.',
    effect: (state) => {
      // Find a hostile country
      const pc = state.countries[state.playerCountryId];
      const hostile = Object.entries(pc.relations)
        .filter(([id, r]) => r < -50 && state.countries[id])
        .sort((a, b) => a[1] - b[1]);
      if (hostile.length > 0) {
        const [targetId] = hostile[0];
        state.changeRelation(state.playerCountryId, targetId, -15);
        state.addLog(`Incidente fronterizo con ${state.countries[targetId].name}. Relaciones se deterioran.`, 'danger');
      }
    },
  },

  // ── ESPIONAGE ─────────────────────────────────────────────
  {
    id: 'intelligence_leak',
    name: 'Filtración de Inteligencia',
    icon: '📰',
    type: 'espionage',
    weight: 7,
    description: 'Documentos secretos del gobierno fueron filtrados a la prensa.',
    effect: (state) => {
      const pc = state.countries[state.playerCountryId];
      pc.stability = Math.max(5, pc.stability - 10);
      for (const id of Object.keys(state.countries)) {
        if (id !== state.playerCountryId) {
          state.changeRelation(state.playerCountryId, id, -8);
        }
      }
      state.addLog('Filtración de documentos: estabilidad y relaciones internacionales dañadas.', 'danger');
    },
  },
  {
    id: 'spy_caught',
    name: 'Espía Capturado',
    icon: '🕵️',
    type: 'espionage',
    weight: 9,
    trigger: (state) => state.activeOps.length > 0,
    description: 'Uno de tus agentes fue capturado en territorio enemigo.',
    effect: (state) => {
      // Pick a random active operation target
      if (state.activeOps.length > 0) {
        const op = state.activeOps[Math.floor(Math.random() * state.activeOps.length)];
        state.changeRelation(state.playerCountryId, op.target, -20);
        state.changeRelation(op.target, state.playerCountryId, -20);
        const idx = state.activeOps.indexOf(op);
        state.activeOps.splice(idx, 1);
        state.addLog(`Espía capturado operando en ${state.countries[op.target]?.name}. Escándalo diplomático.`, 'danger');
      }
    },
  },
  {
    id: 'foreign_spy_caught',
    name: 'Espía Enemigo Descubierto',
    icon: '🔍',
    type: 'espionage',
    weight: 8,
    description: 'Tus agentes descubren una red de espionaje extranjera en tu país.',
    choices: [
      {
        label: 'Expulsar al agente (relaciones -20 con ese país)',
        effect: (state) => {
          // Find a hostile country with espionage
          const hostile = Object.entries(state.countries)
            .filter(([id, c]) => id !== state.playerCountryId && c.espionage > 50 &&
              state.getRelation(state.playerCountryId, id) < 0)
            .sort(([, a], [, b]) => b.espionage - a.espionage);
          if (hostile.length > 0) {
            const [targetId, target] = hostile[0];
            state.changeRelation(state.playerCountryId, targetId, -20);
            state.addLog(`Expulsaste espías de ${target.name}. Tensión diplomática severa.`, 'warning');
          }
        }
      },
      {
        label: 'Usar al agente como doble espía (+información)',
        effect: (state) => {
          state.countries[state.playerCountryId].espionage = Math.min(100,
            state.countries[state.playerCountryId].espionage + 5);
          state.addLog('Convertiste al espía enemigo en agente doble. Inteligencia valiosa obtenida.', 'success');
        }
      },
    ]
  },

  // ── DIPLOMATIC ────────────────────────────────────────────
  {
    id: 'peace_offer',
    name: 'Oferta de Paz',
    icon: '🕊️',
    type: 'diplomacy',
    weight: 8,
    trigger: (state) => state.countries[state.playerCountryId].atWar.length > 0,
    description: 'Un país en conflicto contigo propone una tregua.',
    choices: [
      {
        label: 'Aceptar la paz (relaciones +30, estabilidad +10)',
        effect: (state) => {
          const pc = state.countries[state.playerCountryId];
          if (pc.atWar.length > 0) {
            const enemyId = pc.atWar[0];
            pc.atWar = pc.atWar.filter(id => id !== enemyId);
            state.countries[enemyId].atWar = state.countries[enemyId].atWar.filter(id => id !== state.playerCountryId);
            state.wars = state.wars.filter(w =>
              !(w.attacker === state.playerCountryId && w.defender === enemyId) &&
              !(w.attacker === enemyId && w.defender === state.playerCountryId)
            );
            state.changeRelation(state.playerCountryId, enemyId, 30);
            pc.stability = Math.min(100, pc.stability + 10);
            state.addLog(`Paz firmada con ${state.countries[enemyId]?.name}. Estabilidad mejora.`, 'success');
          }
        }
      },
      {
        label: 'Rechazar: continuar la guerra',
        effect: (state) => {
          state.addLog('Rechazaste la oferta de paz. La guerra continúa.', 'warning');
          const pc = state.countries[state.playerCountryId];
          if (pc.atWar.length > 0) {
            const enemyId = pc.atWar[0];
            state.changeRelation(state.playerCountryId, enemyId, -10);
          }
        }
      },
    ]
  },
  {
    id: 'alliance_opportunity',
    name: 'Oportunidad de Alianza',
    icon: '🤝',
    type: 'diplomacy',
    weight: 9,
    description: 'Un país quiere formalizaros una alianza estratégica.',
    effect: (state) => {
      // Find a friendly country not yet allied
      const friendly = Object.entries(state.countries)
        .filter(([id, c]) => id !== state.playerCountryId &&
          state.getRelation(state.playerCountryId, id) > 50 &&
          !state.countries[state.playerCountryId].allies.includes(id))
        .sort(([, a], [, b]) => b.military - a.military);
      if (friendly.length > 0) {
        const [targetId, target] = friendly[0];
        state.changeRelation(state.playerCountryId, targetId, 15);
        state.countries[state.playerCountryId].allies.push(targetId);
        if (!state.countries[targetId].allies.includes(state.playerCountryId)) {
          state.countries[targetId].allies.push(state.playerCountryId);
        }
        state.addLog(`¡${target.name} propuso una alianza formal! La aceptaste.`, 'success');
      }
    }
  },
  {
    id: 'international_crisis',
    name: 'Crisis Internacional',
    icon: '🌪️',
    type: 'diplomacy',
    weight: 10,
    description: 'Un conflicto regional amenaza con desestabilizar el orden mundial.',
    effect: (state) => {
      // Random hostile pair
      const ids = Object.keys(state.countries).filter(id => id !== state.playerCountryId);
      if (ids.length >= 2) {
        const a = ids[Math.floor(Math.random() * ids.length)];
        let b;
        do { b = ids[Math.floor(Math.random() * ids.length)]; } while (b === a);
        state.changeRelation(a, b, -25);
        state.changeRelation(b, a, -25);
        state.addLog(`Crisis entre ${state.countries[a]?.name} y ${state.countries[b]?.name}. El mundo observa.`, 'warning');
      }
    }
  },

  // ── NATURAL ───────────────────────────────────────────────
  {
    id: 'natural_disaster',
    name: 'Desastre Natural',
    icon: '🌊',
    type: 'natural',
    weight: 8,
    description: 'Un desastre natural devastador golpea tu país.',
    effect: (state) => {
      const pc = state.countries[state.playerCountryId];
      const economyDrop = rnd(10, 25);
      const stabilityDrop = rnd(8, 18);
      pc.economy = Math.max(5, pc.economy - economyDrop);
      pc.stability = Math.max(5, pc.stability - stabilityDrop);
      const cost = Math.floor(state.budget.income * 0.15);
      state.treasury -= cost;
      state.addLog(`Desastre natural: economía -${economyDrop}, estabilidad -${stabilityDrop}. Costo de reconstrucción.`, 'danger');
    },
  },
  {
    id: 'pandemic',
    name: 'Brote Epidémico',
    icon: '🦠',
    type: 'natural',
    weight: 5,
    description: 'Una epidemia se extiende por tu país afectando la productividad.',
    effect: (state) => {
      const pc = state.countries[state.playerCountryId];
      pc.stability = Math.max(5, pc.stability - 15);
      state.budget.income = Math.floor(state.budget.income * 0.88);
      state.addLog('Pandemia: estabilidad -15, ingresos -12% por reducción de productividad.', 'danger');
    },
  },
];

function rnd(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandomEvent(state) {
  const eligible = EVENTS.filter(e => !e.trigger || e.trigger(state));
  const totalWeight = eligible.reduce((sum, e) => sum + e.weight, 0);
  let rand = Math.random() * totalWeight;
  for (const event of eligible) {
    rand -= event.weight;
    if (rand <= 0) return event;
  }
  return eligible[eligible.length - 1];
}
