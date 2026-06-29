// ============================================================
// POLITICS.JS - Speech system & political opponents
// ============================================================

const SPEECH_TOPICS = [
  {
    id: 'economy',
    name: 'Prosperidad Económica',
    icon: '💰',
    color: '#3dba6f',
    desc: 'Prometes crecimiento, empleos y prosperidad para todos.',
    quotes: [
      '"Cada familia de esta nación merece trabajo digno y un futuro próspero."',
      '"Nuestras industrias liderarán el mundo. El crecimiento es inevitable."',
      '"Reduciremos la pobreza con políticas audaces y decisiones valientes."',
    ],
    baseEffect: (pc) => ({ stability: 10, economy: 3 }),
    crowdSize: '👥👥👥👥👥',
  },
  {
    id: 'security',
    name: 'Defensa Nacional',
    icon: '🛡️',
    color: '#4a90d9',
    desc: 'Refuerzas la soberanía y el poder de las fuerzas armadas.',
    quotes: [
      '"Nadie amenazará nuestra soberanía. Nuestras fronteras son inviolables."',
      '"Nuestros soldados son los guardianes del honor nacional."',
      '"Invertiremos en la defensa porque la paz se gana con fortaleza."',
    ],
    baseEffect: (pc) => ({ stability: 7, military: 4 }),
    crowdSize: '🪖🪖🪖👥👥',
  },
  {
    id: 'unity',
    name: 'Unidad Nacional',
    icon: '🤝',
    color: '#c9a227',
    desc: 'Llamas a la cohesión del pueblo ante los desafíos externos.',
    quotes: [
      '"Unidos somos invencibles. Divididos, somos vulnerables."',
      '"Esta nación tiene un solo destino y lo alcanzaremos juntos."',
      '"Nuestras diferencias son nuestra fortaleza, no nuestra debilidad."',
    ],
    baseEffect: (pc) => ({ stability: 15, economy: 0 }),
    crowdSize: '👥👥👥👥👥👥',
  },
  {
    id: 'social',
    name: 'Bienestar Social',
    icon: '🏥',
    color: '#7ab8f5',
    desc: 'Anuncias mejoras en salud, educación y seguridad social.',
    quotes: [
      '"La salud y la educación son derechos, no privilegios."',
      '"Ningún ciudadano quedará atrás. El Estado cuida a su pueblo."',
      '"Construiremos hospitales, escuelas, y oportunidades para todos."',
    ],
    baseEffect: (pc) => ({ stability: 18, economy: -2 }),
    crowdSize: '👥👥👥👥👥👥👥',
  },
  {
    id: 'anticorruption',
    name: 'Anticorrupción',
    icon: '⚖️',
    color: '#c9a227',
    desc: 'Declaras guerra total a la corrupción y al crimen organizado.',
    quotes: [
      '"Los corruptos temblad: la justicia llega para todos."',
      '"Este gobierno no tiene precio. La corrupción terminó."',
      '"Cada peso del Estado llegará donde debe: al pueblo."',
    ],
    baseEffect: (pc) => ({ stability: 12, economy: 5 }),
    crowdSize: '👥👥👥👥',
  },
  {
    id: 'foreign',
    name: 'Política Exterior',
    icon: '🌍',
    color: '#a070d0',
    desc: 'Presentas tu visión del papel de la nación en el mundo.',
    quotes: [
      '"Seremos un referente de paz y cooperación internacional."',
      '"Nuestros aliados son nuestros hermanos. Juntos prosperaremos."',
      '"El mundo nos respetará por nuestros valores y nuestra fuerza."',
    ],
    baseEffect: (pc) => ({ stability: 6, relations: 5 }),
    crowdSize: '👥👥👥',
  },
];

const OPPONENT_TEMPLATES = [
  {
    name: 'Dr. Ramírez',
    title: 'Líder de Oposición',
    icon: '👔',
    ideology: 'moderate',
    specialty: 'economy',
    threat: 'media',
    desc: 'Político experimentado que critica tu gestión económica en medios nacionales.',
  },
  {
    name: 'La Resistencia',
    title: 'Movimiento Popular',
    icon: '✊',
    ideology: 'left',
    specialty: 'social',
    threat: 'protests',
    desc: 'Organización que moviliza a trabajadores y jóvenes contra tus políticas.',
  },
  {
    name: 'General Vásquez',
    title: 'Facción Militar Disidente',
    icon: '🎖️',
    ideology: 'authoritarian',
    specialty: 'military',
    threat: 'coup',
    desc: 'Sector del ejército descontento que cuestiona tu liderazgo internamente.',
  },
  {
    name: 'Prensa Libre',
    title: 'Coalición Periodística',
    icon: '📰',
    ideology: 'liberal',
    specialty: 'corruption',
    threat: 'scandal',
    desc: 'Periodistas de investigación que buscan filtrar documentos comprometedores.',
  },
  {
    name: 'Frente Popular',
    title: 'Partido Rival',
    icon: '🗳️',
    ideology: 'populist',
    specialty: 'social',
    threat: 'elections',
    desc: 'Partido emergente con alto apoyo popular que amenaza tu posición política.',
  },
];

const POLITICS = {
  opponents: [],

  // ── SPEECH SYSTEM ────────────────────────────────────────

  canGiveSpeeach(state) {
    return state.treasury >= 25;
  },

  giveSpeeach(state, topicId) {
    const topic = SPEECH_TOPICS.find(t => t.id === topicId);
    if (!topic) return null;

    state.treasury -= 25;
    const pc = state.countries[state.playerCountryId];
    const base = topic.baseEffect(pc);
    const roll = Math.random();

    // Complications and bonuses based on stability and roll
    let result = {
      topic,
      stability: base.stability,
      economy: base.economy || 0,
      military: base.military || 0,
      relations: base.relations || 0,
      outcome: 'success',
      complication: null,
      log: '',
      icon: '✅',
    };

    // Apply ideology bonus
    if (pc.stability < 40) {
      result.stability = Math.round(result.stability * 0.6);
      result.outcome = 'mixed';
    }

    if (roll < 0.15) {
      // GREAT success
      result.stability = Math.round(result.stability * 1.6);
      result.economy += 3;
      result.outcome = 'great';
      result.icon = '🌟';
      result.log = 'Discurso histórico: tu aprobación se disparó.';
    } else if (roll < 0.55) {
      // Normal success
      result.outcome = 'success';
      result.icon = '👏';
      result.log = `Discurso bien recibido. Estabilidad +${result.stability}.`;
    } else if (roll < 0.72) {
      // Tepid
      result.stability = Math.round(result.stability * 0.4);
      result.outcome = 'tepid';
      result.icon = '😐';
      result.log = 'El discurso no convenció a todos.';
    } else if (roll < 0.87) {
      // Complication: protest
      result.stability = Math.round(result.stability * 0.3) - 5;
      result.outcome = 'protest';
      result.icon = '✊';
      result.complication = 'protest';
      result.log = '¡Protestas estallan tras el discurso!';
      pc.stability = Math.max(5, pc.stability - 8);
      this._spawnOpponentIfNew(state, 'La Resistencia');
    } else {
      // Complication: opponent media attack
      result.stability = Math.round(result.stability * 0.2);
      result.outcome = 'scandal';
      result.icon = '📰';
      result.complication = 'media';
      result.log = '¡La oposición aprovecha para atacarte públicamente!';
      this._spawnOpponentIfNew(state, 'Prensa Libre');
    }

    // Apply effects
    pc.stability = Math.min(100, Math.max(5, pc.stability + result.stability));
    pc.economy  = Math.min(100, Math.max(5, pc.economy + result.economy));
    pc.military = Math.min(100, Math.max(5, pc.military + result.military));

    // Relations bonus
    if (result.relations > 0) {
      for (const [id] of Object.entries(state.countries)) {
        if (id !== state.playerCountryId && state.getRelation(state.playerCountryId, id) > 0) {
          state.changeRelation(state.playerCountryId, id, 2);
        }
      }
    }

    state.addLog(result.log, result.outcome === 'great' ? 'success' : result.outcome === 'protest' || result.outcome === 'scandal' ? 'danger' : 'info');
    return result;
  },

  _spawnOpponentIfNew(state, name) {
    if (!this.opponents.find(o => o.name === name)) {
      const tmpl = OPPONENT_TEMPLATES.find(t => t.name === name) || OPPONENT_TEMPLATES[0];
      this.opponents.push({
        ...tmpl,
        popularity: 20 + Math.floor(Math.random() * 20),
        turn: state.turn,
      });
    }
  },

  spawnRandomOpponent(state) {
    const pc = state.countries[state.playerCountryId];
    if (this.opponents.length >= 3) return null;
    const available = OPPONENT_TEMPLATES.filter(t => !this.opponents.find(o => o.name === t.name));
    if (!available.length) return null;
    const tmpl = available[Math.floor(Math.random() * available.length)];
    const opp = {
      ...tmpl,
      popularity: 15 + Math.floor(Math.random() * 25),
      turn: state.turn,
    };
    this.opponents.push(opp);
    state.addLog(`⚠️ ${opp.icon} ${opp.name} (${opp.title}) comienza a ganar apoyo en tu contra.`, 'danger');
    return opp;
  },

  // Each turn, opponents grow and cause damage
  processTurn(state) {
    const pc = state.countries[state.playerCountryId];
    for (const opp of [...this.opponents]) {
      opp.popularity = Math.min(80, opp.popularity + _rnd(1, 5));

      if (opp.popularity > 40) {
        const damage = Math.floor(opp.popularity / 10);
        pc.stability = Math.max(5, pc.stability - damage);
        if (Math.random() < 0.3) {
          state.addLog(`${opp.icon} ${opp.name} está debilitando tu gobierno (-${damage} estabilidad).`, 'warning');
        }
      }

      // Opponent may escalate if unchecked
      if (opp.popularity > 65 && opp.threat === 'coup') {
        pc.stability = Math.max(5, pc.stability - 10);
        state.addLog(`🚨 ¡El ${opp.title} está preparando un movimiento contra ti!`, 'danger');
      }
    }

    // Auto-spawn opponent if stability is low and few opponents
    if (pc.stability < 45 && this.opponents.length < 2 && Math.random() < 0.35) {
      this.spawnRandomOpponent(state);
    }
  },

  // ── HANDLE OPPONENT ────────────────────────────────────────

  handleOpponent(state, oppName, action) {
    const pc = state.countries[state.playerCountryId];
    const idx = this.opponents.findIndex(o => o.name === oppName);
    if (idx === -1) return { success: false, msg: 'Opositor no encontrado.' };
    const opp = this.opponents[idx];
    let msg = '';
    let success = true;

    switch (action) {
      case 'debate': {
        const myScore = pc.stability + pc.economy;
        const oppScore = opp.popularity * 1.5 + 40;
        if (myScore > oppScore || Math.random() < 0.5) {
          opp.popularity = Math.max(0, opp.popularity - _rnd(15, 25));
          msg = `Ganaste el debate contra ${opp.name}. Su popularidad cayó.`;
          state.addLog(`✅ Debate ganado vs ${opp.name}. Estabilidad +5.`, 'success');
          pc.stability = Math.min(100, pc.stability + 5);
          if (opp.popularity < 10) { this.opponents.splice(idx, 1); msg += ' Ha sido neutralizado políticamente.'; }
        } else {
          opp.popularity = Math.min(80, opp.popularity + _rnd(5, 12));
          pc.stability = Math.max(5, pc.stability - 5);
          msg = `${opp.name} dominó el debate. Tu credibilidad sufrió.`;
          state.addLog(`❌ Debate perdido vs ${opp.name}. Estabilidad -5.`, 'danger');
          success = false;
        }
        break;
      }
      case 'ignore': {
        opp.popularity = Math.min(80, opp.popularity + _rnd(8, 15));
        msg = `Ignoraste a ${opp.name}. Está ganando más seguidores.`;
        state.addLog(`${opp.name} gana terreno al no ser confrontado.`, 'warning');
        success = false;
        break;
      }
      case 'buy': {
        const cost = 60;
        if (state.treasury < cost) return { success: false, msg: `No tienes suficientes fondos ($${cost}B requeridos).` };
        state.treasury -= cost;
        if (Math.random() < 0.65) {
          this.opponents.splice(idx, 1);
          msg = `Cooptaste a ${opp.name}. Se unió a tu gobierno silenciosamente.`;
          state.addLog(`💼 ${opp.name} fue cooptado. Ya no representa una amenaza.`, 'success');
        } else {
          msg = `${opp.name} rechazó tu oferta y lo filtró a la prensa. Escándalo.`;
          pc.stability = Math.max(5, pc.stability - 10);
          state.addLog(`📰 Escándalo: oferta a ${opp.name} rechazada y revelada. Estabilidad -10.`, 'danger');
          success = false;
        }
        break;
      }
      case 'repress': {
        if (Math.random() < 0.55) {
          this.opponents.splice(idx, 1);
          for (const [id] of Object.entries(state.countries)) {
            if (id !== state.playerCountryId) state.changeRelation(state.playerCountryId, id, -5);
          }
          msg = `${opp.name} fue suprimido. La comunidad internacional protestó.`;
          state.addLog(`🚔 ${opp.name} suprimido. Críticas internacionales.`, 'warning');
        } else {
          opp.popularity = Math.min(80, opp.popularity + _rnd(15, 25));
          pc.stability = Math.max(5, pc.stability - 12);
          msg = `La represión de ${opp.name} salió mal. Más gente se une a su causa.`;
          state.addLog(`🔥 Represión fallida de ${opp.name}. Estabilidad -12.`, 'danger');
          success = false;
        }
        break;
      }
    }

    return { success, msg, opponent: opp };
  },

  reset() {
    this.opponents = [];
  },
};
