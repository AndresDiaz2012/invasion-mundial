// ============================================================
// GEMINI.JS — Diplomatic debate engine
// Primary: Groq API (free at groq.com) with Llama 3.3 70B
// Fallback: Advanced local context-aware engine
// ============================================================

const GEMINI = {
  history:        [],
  enemyId:        null,
  game:           null,
  favorableCount: 0,
  _mood:          0,

  // Conversation state tracking
  _turn:          0,
  _playerThreats: 0,
  _playerPraises: 0,
  _playerApologies:0,
  _playerDemands: 0,
  _counterDemandMade: false,

  // ── GROQ API ─────────────────────────────────────────────
  _getKey() {
    return localStorage.getItem('im_groq_key') || '';
  },

  async _callGroq(systemPrompt, messages, maxTokens = 220) {
    const key = this._getKey();
    if (!key) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          temperature: 0.82,
          max_tokens: maxTokens,
        }),
      });
      clearTimeout(timeout);
      if (!res.ok) { console.warn('Groq error', res.status); return null; }
      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch (e) {
      clearTimeout(timeout);
      if (e.name !== 'AbortError') console.warn('Groq fetch error', e);
      return null;
    }
  },

  _buildSystemPrompt(enemy, pc, game) {
    const pid    = game.playerCountryId;
    const rel    = game.getRelation(pid, this.enemyId);
    const atWar  = pc.atWar.includes(this.enemyId);
    const relLabel = rel > 60 ? 'aliados' : rel > 20 ? 'relaciones amistosas' : rel > -20 ? 'relaciones neutras' : rel > -50 ? 'relaciones tensas' : 'hostilidad abierta';
    const pDesc  = {
      diplomatic:    'Eres conciliador pero firme. Buscas acuerdos mutuamente beneficiosos. En guerra buscas salidas dignas antes que rendiciones.',
      aggressive:    'Eres confrontativo y solo respetas la fuerza. En guerra, muestras dureza total pero también sabes cuándo retirarte estratégicamente.',
      defensive:     'Eres desconfiado y cauteloso. En guerra te concentras en proteger a tus ciudadanos — si estás perdiendo, priorizas la supervivencia.',
      opportunistic: 'Eres calculador. En guerra evalúas costos y beneficios en tiempo real — si la guerra te sale cara, negocias sin dudar.',
      expansionist:  'Tienes ambiciones regionales. En guerra luchas hasta ganar, pero si pierdes terreno, reformulas tu estrategia.',
      neutral:       'Eres pragmático. En guerra buscas la salida más racional con el menor costo para tu nación.',
    }[enemy.personality] || 'Eres un líder pragmático que defiende los intereses nacionales.';

    const milBalance = enemy.military - pc.military;
    const ecoBalance = enemy.economy - pc.economy;

    // War context — inject who's winning, troop counts, morale
    let warContext = atWar ? `EN GUERRA ACTIVA con ${pc.name}` : 'sin conflicto activo';
    let warDetails = '';
    if (atWar && typeof WAR !== 'undefined') {
      const w = WAR.getWarState(game, this.enemyId);
      if (w) {
        const prog = w.progress ?? 50;
        const enemyProgress = 100 - prog;
        const winningLabel  = prog > 60 ? `${pc.name} va ganando (control territorial ${prog}%)` :
                              prog < 40 ? `${enemy.name} va ganando (control enemigo ${enemyProgress}%)` :
                              'combate equilibrado';
        warDetails = `\n• Estado de la guerra: ${winningLabel}
• Tus tropas: ${Math.round((w.dTroops || 0) / 1000)}K · Moral: ${w.dMorale ?? 70}%
• Sus tropas: ${Math.round((w.aTroops || 0) / 1000)}K · Moral: ${w.aMorale ?? 70}%
• ${prog > 65 ? '⚠️ ESTÁS PERDIENDO la guerra — considera negociar antes de colapsar' :
   prog < 35 ? '💪 Tu nación tiene ventaja en el campo de batalla' :
   'La guerra está equilibrada — cualquier lado puede romper el balance'}`;
      }
    }

    // Active commitments context
    const pendingCommitments = (game.commitments || []).filter(c => c.status === 'pending' && c.targetId === this.enemyId);
    const commitmentCtx = pendingCommitments.length > 0
      ? `\n\nCOMPROMISOS PENDIENTES (acordados previamente):\n${pendingCommitments.map(c => `• ${c.description} (vence año ${c.deadline})`).join('\n')}`
      : '';

    return `Eres el jefe de Estado de ${enemy.flag} ${enemy.name}.

SITUACIÓN ACTUAL:
• Tu nación: Militar ${enemy.military}/100, Economía ${enemy.economy}/100, Estabilidad ${enemy.stability}/100
• ${pc.name} (jugador): Militar ${pc.military}/100, Economía ${pc.economy}/100
• Balance militar: ${milBalance > 15 ? `tu ejército supera al suyo (+${milBalance})` : milBalance < -15 ? `su ejército te supera (${milBalance})` : 'fuerzas equivalentes'}
• Balance económico: ${ecoBalance > 10 ? 'tu economía es más fuerte' : ecoBalance < -10 ? 'su economía es más sólida' : 'economías similares'}
• Estado: ${warContext}${warDetails}
• Relación histórica: ${relLabel} (${rel}/100)
• Tensión mundial: ${game.globalTension}/100${enemy.nuclearArms ? '\n• ⚠️ Posees armamento nuclear' : ''}${commitmentCtx}

TU PERSONALIDAD: ${pDesc}

COMPORTAMIENTO EN ESTE CONTEXTO:
${atWar && this._playerWinning ? '⚠️ Estás PERDIENDO la guerra. Considera proponer paz con condiciones, amenazar con escalar, o pedir tregua. Muestra desesperación si la situación es crítica.' : ''}
${atWar && !this._playerWinning ? '💪 Tienes ventaja militar. Puedes imponer condiciones, rechazar concesiones fáciles, o exigir rendición.' : ''}
${!atWar && milBalance < -20 ? '😰 Militarmente eres más débil. Evita provocar — prioriza diplomacia y acuerdos protectores.' : ''}

ACCIONES REALES DEL JUEGO (solo puedes pedir o proponer ESTAS cosas):
• ALIANZA FORMAL — ambos países se defienden mutuamente
• TRATADO DE PAZ — fin del conflicto armado
• TRATADO COMERCIAL — mejora relaciones económicas
• AYUDA ECONÓMICA/MILITAR — dinero (en billones $B) o tropas
• NO AGRESIÓN — compromiso de no declarar guerra durante X años
• AUMENTO MILITAR — el jugador invierte en sus fuerzas armadas (medido en puntos de fuerza militar del 0-100)
• MEJORA ECONÓMICA — el jugador invierte en su economía (medido en puntos del 0-100)
PROHIBIDO pedir: petróleo, gas, materias primas específicas, acceso territorial, embargos, sanciones, acuerdos que no sean de los tipos listados arriba.

REGLAS ABSOLUTAS:
1. Responde ÚNICAMENTE en español
2. Eres un jefe de Estado REAL con orgullo nacional, no un chatbot
3. 2-4 oraciones directas. Crea tensión dramática genuina
4. Propón condiciones SOLO de la lista de acciones reales del juego
5. Menciona datos reales de la guerra/economía para justificar tu posición
6. Nunca rompas el personaje ni menciones que eres IA
7. Si el jugador te declara la guerra en texto, responde con furia/aceptación según tu personalidad`;
  },

  // ── LOCAL ENGINE — ADVANCED ───────────────────────────────

  _p: (arr) => arr[Math.floor(Math.random() * arr.length)],

  _fill(s, enemy, pc) {
    return s
      .replace(/\{E\}/g, enemy.name)
      .replace(/\{EF\}/g, enemy.flag)
      .replace(/\{P\}/g, pc.name);
  },

  _detectIntent(text) {
    const t = text.toLowerCase();
    if (/\b(paz|tregua|armisticio|cese del fuego|alto el fuego|dejar de pelear|terminar la guerra)\b/.test(t)) return 'peace';
    if (/\b(alianza|aliado|aliados|juntos|unidos|cooperar|colaborar|pacto|unirnos)\b/.test(t)) return 'alliance';
    if (/\b(comercio|tratado comercial|intercambio comercial|negoci|econom|recursos|dinero|inversión)\b/.test(t)) return 'trade';
    if (/\b(amenaz|atac|destruir|invadir|consecuencias|fuerza militar|aplastar|aniquilar|arrepentirás|represalia)\b/.test(t)) return 'threat';
    if (/\b(disculp|perdón|lamento|fue un error|nos equivocamos|arrepiento|reconozco el error)\b/.test(t)) return 'apology';
    if (/\b(admiro|respeto|grande|poderoso|fuerte|excelente|honorable|impresionante|líder|nación admirable)\b/.test(t)) return 'praise';
    if (/\b(exijo|exigimos|debes|tienes que|requerimos|es obligatorio|no tienen opción|ultimátum|rendición)\b/.test(t)) return 'demand';
    return 'neutral';
  },

  _updateMood(intent) {
    const delta = { peace: 7, alliance: 5, trade: 6, praise: 9, apology: 11, threat: -16, demand: -11, neutral: 1 }[intent] ?? 0;
    const noise = Math.round((Math.random() - 0.5) * 4);
    this._mood = Math.max(-45, Math.min(40, this._mood + delta + noise));
    if (intent === 'threat') this._playerThreats++;
    if (intent === 'praise') this._playerPraises++;
    if (intent === 'apology') this._playerApologies++;
    if (intent === 'demand') this._playerDemands++;
  },

  _localOpen(enemy, pc, rel, atWar) {
    const p = enemy.personality;
    const mil = enemy.military; const eco = enemy.economy;
    const T = {
      diplomatic: {
        war:     [`La guerra entre nuestras naciones tiene un costo que ambas estamos pagando. Te recibo porque incluso en el conflicto, el diálogo puede salvar vidas. ¿Qué propones?`, `${enemy.name} ha sufrido tanto como ${pc.name} en este conflicto. Estoy aquí porque creo que hay una salida negociada. ¿Cuál es tu posición?`],
        hostile: [`Las relaciones entre ${enemy.name} y ${pc.name} han llegado a un punto que me preocupa. He decidido recibirte para intentar cambiar ese rumbo. Habla.`, `A pesar de la tensión entre nosotros, el diálogo siempre es preferible al conflicto. ¿Qué te trae aquí?`],
        neutral: [`Bienvenido, líder de ${pc.name}. ${enemy.name} siempre está dispuesto al diálogo constructivo cuando hay propuestas concretas en la mesa.`, `Es un buen momento para esta conversación. Nuestras naciones tienen intereses que podrían complementarse. ¿Qué propones?`],
        friendly:[`Es un placer recibirte. Las relaciones entre ${enemy.name} y ${pc.name} han sido positivas y confío en que podamos profundizarlas hoy.`, `Siempre es bienvenido el representante de ${pc.name}. ¿Qué nuevas propuestas traes esta vez?`],
      },
      aggressive: {
        war:     [`Así que el enemigo viene a hablar. Sé breve y directo — ${enemy.name} no da segundas oportunidades. ¿Qué quieres?`, `¿Vienes a rendirte o a negociar? Con un ejército de ${mil} puntos de capacidad, no necesitamos esta conversación. Habla rápido.`],
        hostile: [`Tienes valor al presentarte aquí. No tengo tiempo para rodeos — haz tu propuesta y la evaluaré. ${enemy.name} solo negocia desde la fortaleza.`, `¿Qué quieres? Sé directo. ${enemy.name} no tiene paciencia para discursos vacíos.`],
        neutral: [`Al grano. ¿Qué propone ${pc.name}? Recuerda que con ${mil} de capacidad militar, ${enemy.name} no negocia desde la debilidad.`, `Habla. Pero recuerda: si lo que ofreces no sirve los intereses de ${enemy.name}, esta reunión termina aquí.`],
        friendly:[`${pc.name} sabe cómo tratar con nosotros. Habla, escucho. Pero entiende que cualquier acuerdo debe favorecernos primero.`, `Bien que hayas venido directamente. No pierdo el tiempo con quienes van por las ramas.`],
      },
      defensive: {
        war:     [`Acepto esta reunión con la mayor cautela. ${enemy.name} no olvida lo que pasó. Antes de cualquier propuesta, quiero garantías de seguridad.`, `Recibirte aquí es señal de que aún existe posibilidad de solución. Pero necesitaré compromisos muy concretos — no palabras.`],
        hostile: [`No confío fácilmente en ${pc.name}. Pero escucharé. Nuestra doctrina de seguridad nacional es innegociable.`, `Acepto escucharte, con reservas. ¿Qué garantías concretas traes?`],
        neutral: [`${enemy.name} evalúa cada reunión con cuidado. Tengo preguntas antes de responder a cualquier propuesta. ¿Cuál es el propósito de esta visita?`, `Acepto esta conversación, aunque la cautela siempre me acompaña. Haz tu propuesta.`],
        friendly:[`Gracias por venir. Las relaciones son aceptables, pero nunca bajo la guardia. ¿De qué deseas hablar?`, `Bien que vengas en términos amistosos. ${enemy.name} lo aprecia, aunque la precaución es siempre necesaria.`],
      },
      opportunistic: {
        war:     [`Interesante que el enemigo pida hablar. Todo tiene un precio, incluyendo la paz. Con una economía de ${eco} y ejército de ${mil}, ${enemy.name} puede esperar. Pero escucho. ¿Qué ofreces?`, `La guerra es costosa para los dos. Lo reconozco. Dime qué hay en la mesa y evaluaré si vale la pena negociar.`],
        hostile: [`Dime qué ofreces y evaluaré si vale mi tiempo. ${enemy.name} no hace reuniones sin beneficio concreto.`, `Si tienes algo de valor real, encontrarás en ${enemy.name} un interlocutor muy receptivo. Si no, no perdamos el tiempo.`],
        neutral: [`Bienvenido. ${enemy.name} siempre está abierto a oportunidades. Si traes algo concreto y rentable, tendrás toda mi atención.`, `Siempre hay oportunidades en el diálogo. Presenta tu propuesta y la evaluaré con objetividad.`],
        friendly:[`¡${pc.name}! Las buenas relaciones generan buenas oportunidades. ¿Qué traes hoy que sea de valor?`, `Buenas relaciones y buenas propuestas van de la mano. Estoy expectante.`],
      },
      expansionist: {
        war:     [`${enemy.name} está en posición de fuerza. Si vienes a negociar, las condiciones las dicto yo. ¿En qué términos propones hablar?`, `¿Vienes a discutir la rendición o algo más? Habla con claridad — ${enemy.name} tiene objetivos estratégicos que no negociará.`],
        hostile: [`Vienes a hablar mientras ${enemy.name} consolida su influencia en la región. Considera cuánto tiempo puedes ignorar nuestra expansión.`, `Te recibo porque el diálogo puede ser útil. Pero entiende que ${enemy.name} tiene una visión estratégica clara. ¿Propones algo que la respete?`],
        neutral: [`${enemy.name} tiene objetivos de largo plazo bien definidos. Cualquier acuerdo debe respetar esa visión. ¿En qué términos vienes?`, `Habla. Pero sabe que ${enemy.name} no compromete su posición estratégica por acuerdos de corto plazo.`],
        friendly:[`${pc.name} ha sido inteligente al mantener buenas relaciones con nosotros. Eso tiene valor. ¿Qué buscas hoy?`, `Bien que vengas. ${enemy.name} aprecia a los que reconocen nuestra creciente influencia regional.`],
      },
      neutral: {
        war:     [`A pesar del conflicto, ${enemy.name} siempre preferirá el diálogo. Escucho tu propuesta. Sin compromisos previos.`, `Incluso en guerra, la diplomacia tiene su lugar. ¿Qué propones? Lo evaluaré con imparcialidad.`],
        hostile: [`A pesar de las tensiones, ${enemy.name} prefiere el diálogo. Sin embargo, no esperes concesiones sin reciprocidad.`, `${enemy.name} mantiene una política pragmática. Si esta conversación puede ser mutuamente útil, sigamos adelante.`],
        neutral: [`Bienvenido. ${enemy.name} evalúa cada relación con pragmatismo. Si hay bases para un acuerdo, lo encontraremos.`, `${enemy.name} tiene una política de puertas abiertas. ¿Cuál es el motivo de tu visita?`],
        friendly:[`Gracias por venir. Las relaciones han sido razonables y espero que sigamos por ese camino.`, `${enemy.name} valora la estabilidad. ¿En qué podemos ayudarnos mutuamente?`],
      },
    };
    const tone = atWar ? 'war' : rel > 30 ? 'friendly' : rel < -30 ? 'hostile' : 'neutral';
    const pool = (T[p] ?? T.neutral)[tone] ?? T.neutral.neutral;
    return this._p(pool);
  },

  _localResponse(intent, enemy, pc, game) {
    const p   = enemy.personality;
    const rel = game.getRelation(game.playerCountryId, this.enemyId);
    const atWar = pc.atWar.includes(this.enemyId);
    const milAdv = enemy.military - pc.military;
    const ecoAdv = enemy.economy - pc.economy;

    // ── Callback on inconsistent player behavior ──
    if (this._playerThreats > 0 && intent === 'peace') {
      const inconsistent = [
        `Hace un momento amenazabas con la fuerza, y ahora pides paz. ¿Cuál es tu posición real, ${pc.name}?`,
        `Es curiosa esa transición — de las amenazas a la paz en tan poco tiempo. ${enemy.name} toma nota de esa inestabilidad.`,
        `Primero amenazas, luego propones paz. En diplomacia eso se llama falta de coherencia. ¿En qué posición estás realmente?`,
      ];
      return this._p(inconsistent);
    }
    if (this._playerApologies >= 2 && intent === 'demand') {
      const inconsist2 = [
        `Primero te disculpas y ahora exiges. ${enemy.name} no sabe cómo interpretar eso. Decide qué posición representas.`,
        `Las disculpas y las exigencias no conviven bien. ¿Estás negociando o jugando?`,
      ];
      return this._p(inconsist2);
    }
    if (this._playerPraises > 1 && intent === 'threat') {
      return this._p([
        `Curioso — primero elogios, ahora amenazas. Esa estrategia no funciona con ${enemy.name}.`,
        `Los elogios vacíos seguidos de amenazas solo demuestran desesperación. ${enemy.name} no se deja manipular así.`,
      ]);
    }

    // ── Main response by personality × intent ──
    const R = {
      diplomatic: {
        peace:    [
          `La paz es la decisión más racional en este punto. Pero ${enemy.name} necesita términos claros — no promesas vagas. ¿Cuáles son las condiciones concretas que propones?`,
          `Escucho tu llamado a la paz con atención. El conflicto tiene costos para todos. Si ${pc.name} está comprometida, ${enemy.name} también lo está. Definamos los términos.`,
          `Apoyamos la paz, pero debe ser duradera. ¿Qué garantías ofrece ${pc.name} de que se respetará el acuerdo?`,
        ],
        alliance: [`Una alianza requiere confianza construida, no solo declarada. ¿En qué términos específicos la propones? ¿Defensa mutua, economía, ambas?`,
          `La idea de una alianza formal es interesante si compartimos objetivos estratégicos. Cuéntame más sobre tu visión.`],
        trade:    [`El comercio es una base sólida para cualquier relación duradera. Presentemos los números concretos — ${enemy.name} está abierto a negociar.`,
          `Un tratado comercial beneficia a ambas economías. Con la economía de ${enemy.name} en ${enemy.economy} y la tuya en ${pc.economy}, hay complementariedad posible.`],
        threat:   [`Las amenazas no son el camino en esta sala. Si deseas resultados, elige la persuasión. ${enemy.name} no cede ante presiones.`,
          `Amenazar a ${enemy.name} solo complica nuestra conversación. Recapacita — las amenazas cierran puertas que después son difíciles de abrir.`],
        praise:   [`Aprecio tus palabras. El reconocimiento mutuo facilita el diálogo. ¿Cuál es tu propuesta concreta que acompaña esos elogios?`,
          `Gracias. Pero los elogios sin propuestas son solo palabras. ¿Qué busca ${pc.name} lograr concretamente?`],
        apology:  [`La disculpa requiere valentía y la acepto. Podemos trabajar desde aquí para reconstruir la confianza. ¿Cuál es el primer paso concreto que propones?`,
          `Aprecio la honestidad. El camino a seguir es lo que importa. ¿Qué medida concreta propones para reparar lo dañado?`],
        demand:   [`Las demandas unilaterales raramente producen acuerdos duraderos. Si tienes necesidades legítimas, podemos explorarlas como propuesta negociable — no como ultimátum.`,
          `Entiendo tu posición, pero las exigencias sin reciprocidad son un callejón sin salida. Reformúlalo como una propuesta y hablaremos.`],
        neutral:  [`Escucho. La diplomacia requiere paciencia y claridad. ¿Hay algo más concreto que desees proponer?`,
          `Interesante perspectiva. ${enemy.name} considera todos los puntos de vista. ¿Cuál es tu posición exacta?`],
      },
      aggressive: {
        peace:    [`¿Paz? Eso lo dice quien ya no puede más. Convénceme de que ${pc.name} merece esa consideración antes de que la contemple.`,
          `La paz tiene un precio. ${enemy.name} no la da gratis — especialmente con un ejército de ${enemy.military} puntos de capacidad. ¿Qué ofreces?`,
          `Podría considerar el cese si ${pc.name} reconoce nuestra posición superior. Sin eso, no hay conversación.`],
        alliance: [`¿Una alianza? Solo me alío con los que demuestran fuerza real. ¿Qué hace a ${pc.name} digno de eso?`,
          `Los aliados son una carga si no aportan valor concreto. ¿Qué tiene ${pc.name} que no tengamos ya?`],
        trade:    [`El comercio solo me interesa si ${enemy.name} recibe la mayor tajada. Dame los números exactos — no generlidades.`,
          `Bien, el comercio es poder. Si no hay ventaja clara y medible para nosotros, no hay trato.`],
        threat:   [`¿Una amenaza? Me gusta que seas directo. Pero ${enemy.name} no se intimida — tenemos ${enemy.military} de capacidad militar. ¿Realmente quieres ese camino?`,
          `Así que prefieres el conflicto. ${enemy.name} ha enfrentado peores. Eso confirma que no podemos confiar en ti.`],
        praise:   [`Los elogios son para los débiles. ${enemy.name} no necesita tu admiración — necesita respeto demostrado con hechos. ¿Qué propones concretamente?`,
          `Prefiero la honestidad brutal a los cumplidos vacíos. ¿Qué es lo que realmente quieres?`],
        apology:  [`Una disculpa. Reconoces que estabas equivocado. Bien. Pero las palabras no reparan el daño — ¿qué más ofreces?`,
          `Las disculpas son un comienzo, no un final. ${enemy.name} necesita acciones concretas, no solo palabras.`],
        demand:   [`¿EXIGES? Nadie le exige nada a ${enemy.name}. Si quieres algo, primero demuestra que tienes el poder para respaldarlo — con ${pc.military} de capacidad militar, dudo que sea el caso.`,
          `Nadie da órdenes aquí. Si eso es lo que vienes a hacer, esta conversación ya terminó.`],
        neutral:  [`Al grano. ¿Qué propones exactamente? ${enemy.name} no tiene tiempo para rodeos — cada minuto que pierdo tiene un costo.`,
          `Necesito claridad y hechos concretos. ¿Cuál es tu posición?`],
      },
      defensive: {
        peace:    [`La paz es lo que siempre hemos querido. Pero ${enemy.name} no firma nada sin garantías verificables. ¿Cómo aseguras que esto no es una táctica?`,
          `Interesante propuesta. Sin embargo, las palabras no son suficientes. Necesito compromisos concretos de seguridad antes de avanzar.`],
        alliance: [`Una alianza podría reforzar nuestra seguridad mutua... o exponernos si el socio no es confiable. Necesito mucho más antes de comprometerme.`,
          `No tomo las alianzas a la ligera. ¿Cómo garantizas que ${pc.name} cumplirá sus obligaciones cuando seamos vulnerables?`],
        trade:    [`El comercio puede reforzar nuestra seguridad económica... si los términos son correctos y verificables. ${enemy.name} revisará cada cláusula con cuidado.`,
          `Los tratados tienen implicaciones de largo plazo. Necesito revisar cuidadosamente antes de comprometer a ${enemy.name}.`],
        threat:   [`Las amenazas refuerzan exactamente la desconfianza que ya tenía. Has retrocedido cualquier progreso posible en esta conversación.`,
          `Es exactamente lo que ${enemy.name} temía. Las amenazas solo confirman que necesitamos más defensa, no menos.`],
        praise:   [`Agradezco el gesto, pero la historia me ha enseñado a desconfiar de quien elogia antes de pedir. ¿Qué hay detrás de esas palabras?`,
          `Es amable de tu parte. Pero ${enemy.name} toma decisiones basadas en hechos verificables, no en palabras.`],
        apology:  [`Acepto la disculpa, aunque con reservas. ${enemy.name} ha sido lastimado antes. Necesito tiempo y hechos concretos para verificar que es genuina.`,
          `Es un paso positivo. No olvido fácilmente, pero tampoco soy inflexible. ¿Qué propones como siguiente paso concreto?`],
        demand:   [`Ese tono de exigencia no ayuda — solo aumenta mi desconfianza. ${enemy.name} no actúa bajo coerción, nunca.`,
          `Las exigencias sin garantías son inaceptables. Quien exige debe también ofrecer algo verificable a cambio.`],
        neutral:  [`Necesito más información antes de responder. ${enemy.name} no toma posiciones sin análisis cuidadoso.`,
          `Entiendo tu punto, aunque me reservo el juicio. ¿Puedes ser más específico en lo que buscas?`],
      },
      opportunistic: {
        peace:    [`La paz puede ser un buen negocio... si los términos son correctos. Con nuestra economía en ${enemy.economy}, tenemos más paciencia que tú. ¿Qué ofreces concretamente?`,
          `Todo es posible si el precio es justo. Define exactamente qué pones en la mesa y qué pides a cambio.`],
        alliance: [`Una alianza... necesito ver el retorno concreto para ${enemy.name}. El apoyo simbólico no sirve — ¿qué beneficios tangibles propones?`,
          `Las alianzas son inversiones. ¿Cuál sería el rendimiento específico para ${enemy.name}? Sé preciso.`],
        trade:    [`¡Ahora hablamos el mismo idioma! El comercio es el lenguaje que más aprecio. Dame los números específicos y encontraremos un acuerdo.`,
          `El comercio es siempre una buena idea cuando los beneficios son claros y medibles. Presenta los términos detallados.`],
        threat:   [`Las amenazas solo encarecen el costo de cualquier acuerdo. Recalibra tu estrategia — ${enemy.name} responde mejor a los incentivos que a la presión.`,
          `Interesante táctica, pero contraproducente. Si me amenazas, el precio de cualquier arreglo sube considerablemente.`],
        praise:   [`Los cumplidos son baratos. Si admiras a ${enemy.name}, demuéstralo con algo concreto en la mesa de negociación.`,
          `Bien, bien. Pero seamos honestos: los elogios no pagan facturas. ¿Qué vienes a proponer realmente?`],
        apology:  [`La disculpa es necesaria pero no suficiente. ¿Qué compensación concreta ofreces como muestra de buena fe?`,
          `Aceptado. Ahora convirtamos esto en algo productivo. ¿Qué estás dispuesto a ofrecer?`],
        demand:   [`¿Exigencias? Si exiges, también debes ofrecer algo de valor equivalente. ¿Qué hay en la mesa para ${enemy.name} en ese trato?`,
          `Las demandas tienen un precio. Mejora la oferta si quieres que ${enemy.name} actúe.`],
        neutral:  [`Eso está bien, pero hasta ahora no veo dónde está el beneficio concreto para ${enemy.name}. Sé más específico.`,
          `Escucho, pero necesito ver las cifras. ¿Qué gana exactamente ${enemy.name}?`],
      },
      expansionist: {
        peace:    [`Consideraré la paz solo si ${pc.name} reconoce la nueva realidad geopolítica de la región. ${enemy.name} no retrocede en sus posiciones.`,
          `La paz tiene costos para nosotros también. ¿Qué ofreces que justifique detener nuestro avance estratégico?`],
        alliance: [`Una alianza es útil si ${pc.name} apoya los objetivos estratégicos de ${enemy.name} en la región. Sin ese compromiso, no tiene sentido.`,
          `Los socios deben compartir visiones. ¿Está ${pc.name} dispuesto a apoyar nuestra posición regional?`],
        trade:    [`El comercio puede financiar los objetivos de ${enemy.name}. Si los términos refuerzan nuestra posición estratégica, podemos hablar.`,
          `El intercambio económico es una herramienta de influencia. ¿Qué recursos ofrece ${pc.name}?`],
        threat:   [`¿Una amenaza? Casi un cumplido — reconoces nuestro poder. Pero las amenazas vacías no frenan la expansión de ${enemy.name}.`,
          `Me gusta la valentía, aunque sea imprudente. ${enemy.name} ha crecido enfrentando exactamente este tipo de presión.`],
        praise:   [`El reconocimiento de nuestro poder es lo mínimo esperado. Ahora, ¿cómo planeas respaldar esas palabras con acciones concretas?`,
          `Justo. ${enemy.name} merece ese reconocimiento. Ahora, ¿qué propones concretamente?`],
        apology:  [`La disculpa demuestra que ${pc.name} comprende su posición. Podemos avanzar, pero ${enemy.name} dictará los términos.`,
          `Aceptado. Pero recuerda que ${enemy.name} tiene memoria larga. Demuestra con hechos que el cambio es real.`],
        demand:   [`Curioso que exijas tú, cuando ${enemy.name} tiene la posición de fuerza con ${enemy.military} de capacidad. Reconsidera.`,
          `Las exigencias de los más débiles son solo ruido. Preséntame argumentos reales, no ultimátums.`],
        neutral:  [`Quizás. Pero ${enemy.name} actúa según sus objetivos estratégicos de largo plazo. ¿Cómo encaja lo que propones?`,
          `Todo suena bien en teoría. ¿Pero qué impacto concreto tiene en los intereses regionales de ${enemy.name}?`],
      },
      neutral: {
        peace:    [`La paz es siempre preferible. ${enemy.name} no tiene interés en conflictos prolongados. Podemos discutir términos razonables.`,
          `Un acuerdo de paz beneficiaría a ambas partes. Presentemos los términos y evaluemos objetivamente.`],
        alliance: [`Una alianza formal es un paso importante. Necesitaríamos definir claramente las obligaciones mutuas y los límites.`,
          `No nos oponemos a una alianza si preserva nuestra autonomía. Los compromisos deben ser proporcionales.`],
        trade:    [`El comercio mutuamente beneficioso es exactamente el tipo de acuerdo que ${enemy.name} busca. Presentemos los términos específicos.`,
          `Un tratado comercial equilibrado es una buena base para la relación. ${enemy.name} está dispuesto a negociar con buena fe.`],
        threat:   [`Ese tono no es constructivo. ${enemy.name} prefiere el diálogo racional. Las amenazas solo complican innecesariamente.`,
          `Las amenazas no son la vía. Hablemos con datos y propuestas concretas, no con intimidación.`],
        praise:   [`Gracias por el reconocimiento. También tenemos una valoración positiva de ${pc.name}. ¿En qué podemos colaborar?`,
          `El reconocimiento mutuo facilita el diálogo. ¿Qué propones concretamente?`],
        apology:  [`Aprecio la disculpa y la tomo como señal de buena fe. ${enemy.name} prefiere siempre mirar hacia adelante.`,
          `Aceptado. Los errores pueden quedar atrás si ambas partes actúan de buena fe a partir de ahora.`],
        demand:   [`Ese tono no facilita el diálogo. Propongamos alternativas de manera constructiva — las exigencias unilaterales rara vez funcionan.`,
          `Si tienes necesidades legítimas, podemos discutirlas. Pero las demandas como posición de apertura cierran puertas.`],
        neutral:  [`Entendido. ${enemy.name} evalúa cada propuesta con pragmatismo. ¿Tienes algo más concreto que agregar?`,
          `Razonable. ¿Hay algo más que ayude a clarificar tu posición?`],
      },
    };

    const byP   = R[p] ?? R.neutral;
    const pool  = byP[intent] ?? byP.neutral;
    let text    = this._p(pool);

    // ── Add situational context ──
    if (milAdv > 20 && ['threat', 'demand'].includes(intent)) {
      text += ' ' + this._p([
        `Recuerda que nuestras fuerzas militares superan a las tuyas — ${enemy.military} contra ${pc.military}.`,
        `Con ${enemy.military} de capacidad militar frente a tus ${pc.military}, deberías elegir con más cuidado tus palabras.`,
      ]);
    } else if (milAdv < -20 && intent === 'peace') {
      text += ' ' + this._p([
        `A pesar de que sus fuerzas nos superan militarmente, preferimos la solución diplomática.`,
        `La fuerza no siempre debe usarse. Te escuchamos, aunque tu posición militar sea más favorable.`,
      ]);
    }
    if (ecoAdv > 20 && intent === 'trade') {
      text += ' ' + this._p([
        `Con una economía de ${enemy.economy} frente a tus ${pc.economy}, ${enemy.name} tiene ventaja en esta negociación.`,
        `Nuestra posición económica es más sólida, lo que nos da margen para negociar en mejores términos.`,
      ]);
    }

    // ── Add counter-demand (once per conversation) ──
    if (!this._counterDemandMade && ['peace', 'alliance', 'trade'].includes(intent) && this._mood > -15) {
      const cd = this._counterDemand(intent, p, enemy, pc, game);
      if (cd) { text += ' ' + cd; this._counterDemandMade = true; }
    }

    return text;
  },

  _counterDemand(intent, p, enemy, pc, game) {
    const occupied = Object.values(game.countries).filter(c => c.conquered && c.conqueror === game.playerCountryId).length;
    const D = {
      peace: {
        aggressive:    [`Sin embargo, exigimos compensación económica por los costos de esta guerra antes de firmar cualquier acuerdo.`, `La paz tiene un precio — reparaciones de guerra. ¿Estás dispuesto a pagar?`],
        defensive:     [`Solo consideraré la paz si garantizas que ninguna tropa tuya se acercará a nuestras fronteras por al menos 5 años.`, `Necesito garantías de seguridad verificables. Ni un soldado más cerca de nuestra frontera.`],
        expansionist:  [`Aceptaríamos la paz si reconoces formalmente nuestra zona de influencia en la región.`, `La paz es posible solo si ${pc.name} reconoce públicamente nuestra supremacía regional.`],
        opportunistic: [`Discutiré la paz solo con compensación económica sustancial sobre la mesa. ¿Cuánto vale para ti detener este conflicto?`],
        diplomatic:    [`Para avanzar en la paz, necesitamos un acuerdo paralelo que garantice la relación comercial entre nuestros países.`],
        neutral:       [`Si firmamos la paz, ${pc.name} debe comprometerse a no apoyar a nuestros opositores regionales.`],
      },
      alliance: {
        aggressive:    [`Una alianza con ${enemy.name} requiere que apoyes nuestra política exterior sin reservas. ¿Estás dispuesto a eso?`],
        defensive:     [`Solo formamos alianzas con quienes comparten acceso a inteligencia. ¿Estás dispuesto a compartir información clasificada?`],
        expansionist:  [`La alianza es viable si ${pc.name} apoya activamente nuestra expansión de influencia en la región.`],
        opportunistic: [`Si hay alianza, quiero acceso preferencial a tus recursos naturales. ¿Cuáles son y en qué condiciones?`],
        diplomatic:    [`La alianza tiene más sentido si incluye un marco de resolución de conflictos vinculante para ambas partes.`],
        neutral:       [`Para formalizar la alianza, necesito compromisos concretos sobre defensa mutua — no solo declaraciones.`],
      },
      trade: {
        aggressive:    [`El comercio solo si la balanza favorece a ${enemy.name}. Quiero las cifras exactas sobre la mesa.`],
        defensive:     [`El tratado comercial debe incluir cláusulas de no-dependencia estratégica. ${enemy.name} no puede quedar vulnerable.`],
        expansionist:  [`El tratado es viable si incluye acceso preferencial a las rutas comerciales de la región que ${enemy.name} controla.`],
        opportunistic: [`Acepto explorar el comercio, pero quiero tarifas preferenciales para nuestros productos en tu mercado.`],
        diplomatic:    [`El tratado es interesante si incluye cooperación en educación y tecnología, no solo bienes.`],
        neutral:       [`El tratado comercial debe tener mecanismos de arbitraje claros en caso de disputas.`],
      },
    };
    const pool = D[intent]?.[p] || D[intent]?.neutral;
    return pool ? this._p(pool) : null;
  },

  _localTreaty(type, enemy, pc, accepted) {
    const p = enemy.personality;
    const T = {
      peace: {
        accepted: {
          diplomatic:    `Tras reflexionar sobre todo lo conversado, la paz es la decisión más sensata. La guerra solo trae pérdidas que ninguna nación puede permitirse indefinidamente. ${enemy.name} acepta el armisticio.`,
          aggressive:    `...No lo esperaba, pero has presentado argumentos que no puedo ignorar completamente. Acepto un cese temporal. Pero no confundas esto con debilidad — es un cálculo estratégico.`,
          defensive:     `Esta conversación me ha dado razones suficientes para confiar lo mínimo necesario. ${enemy.name} acepta la paz, con la esperanza de que se respete cada cláusula.`,
          opportunistic: `He calculado los costos y los beneficios. La paz en este momento sirve mejor los intereses de ${enemy.name}. Acepto — pero cualquier violación anulará el acuerdo inmediatamente.`,
          expansionist:  `La consolidación de mis ganancias requiere estabilidad. Acepto la paz por ahora — pero ${enemy.name} no abandona sus objetivos estratégicos de largo plazo.`,
          neutral:       `Es la decisión lógica. Ambas partes tenemos más que ganar con la paz que con la guerra. ${enemy.name} acepta.`,
        },
        rejected: {
          diplomatic:    `Quisiera aceptar, pero las condiciones actuales no permiten un acuerdo duradero. Necesito más garantías concretas antes de firmar.`,
          aggressive:    `${enemy.name} no firma la paz en estos términos. Primero demuestra que mereces mejores condiciones.`,
          defensive:     `No puedo aceptar con tantas incertidumbres sin resolver. ${enemy.name} necesita garantías de seguridad más sólidas y verificables.`,
          opportunistic: `Los términos no son suficientemente ventajosos para ${enemy.name}. Vuelve con una oferta más concreta y atractiva.`,
          expansionist:  `${enemy.name} tiene objetivos que aún no se han completado. No firmaré la paz hasta que nuestra posición sea más favorable.`,
          neutral:       `Después de evaluar la situación, las condiciones no son las adecuadas para un acuerdo en este momento.`,
        },
      },
      alliance: {
        accepted: {
          diplomatic:    `Una alianza entre ${enemy.name} y ${pc.name} tiene sentido estratégico y diplomático. La acepto con genuino interés en que sea duradera.`,
          aggressive:    `Contra todo pronóstico, veo valor real en esta alianza. Has demostrado ser digno de consideración. Acepto — pero espero lealtad total.`,
          defensive:     `Después de considerar cuidadosamente, creo que una alianza podría reforzar la seguridad mutua. ${enemy.name} acepta, con expectativas claras.`,
          opportunistic: `Los números cuadran. Esta alianza maximiza el beneficio para ${enemy.name} en el contexto actual. Trato hecho.`,
          expansionist:  `Esta alianza refuerza mi posición estratégica regional. ${enemy.name} acepta, con la expectativa de apoyo mutuo.`,
          neutral:       `Dados los beneficios mutuos que hemos discutido, ${enemy.name} acepta la alianza formal. Que sea duradera.`,
        },
        rejected: {
          diplomatic:    `Una alianza formal requiere más confianza de la que hemos construido en esta conversación. Sigamos trabajando.`,
          aggressive:    `${pc.name} aún no ha demostrado ser el tipo de aliado que ${enemy.name} necesita. Rechazado por ahora.`,
          defensive:     `Demasiado riesgo demasiado pronto. ${enemy.name} no puede comprometerse a una alianza formal en este momento.`,
          opportunistic: `Los beneficios no están suficientemente claros ni garantizados. Necesito más antes de comprometer a ${enemy.name}.`,
          expansionist:  `Una alianza limita la flexibilidad estratégica de ${enemy.name}. Prefiero mantener la autonomía por ahora.`,
          neutral:       `No estamos listos para un compromiso de ese nivel todavía. Construyamos más confianza primero.`,
        },
      },
      trade: {
        accepted: {
          diplomatic:    `Un tratado comercial es exactamente el tipo de cooperación concreta que construye relaciones duraderas. ${enemy.name} acepta.`,
          aggressive:    `Los números son aceptables — el balance favorece a ${enemy.name} lo suficiente. Firmamos, pero cada cláusula se cumple al pie de la letra.`,
          defensive:     `Después de revisar los riesgos, creo que este tratado puede beneficiar a ambas naciones sin vulnerarnos. Acepto.`,
          opportunistic: `¡Excelente negocio! ${enemy.name} siempre reconoce una buena oportunidad. Trato hecho y sellado.`,
          expansionist:  `El tratado fortalece la economía de ${enemy.name}, apoyando nuestros objetivos estratégicos. Acepto.`,
          neutral:       `Un intercambio comercial equilibrado es exactamente lo que ambas economías necesitan. ${enemy.name} acepta.`,
        },
        rejected: {
          diplomatic:    `Los términos no están suficientemente equilibrados para ambas partes. Necesitamos ajustes antes de firmar.`,
          aggressive:    `${enemy.name} no ve suficiente ventaja en este trato. Vuelve con mejores condiciones.`,
          defensive:     `Hay demasiadas variables económicas sin resolver. ${enemy.name} no puede comprometerse ahora mismo.`,
          opportunistic: `No es suficientemente rentable para ${enemy.name}. Mejora los términos y podríamos hablar.`,
          expansionist:  `Este tratado no apoya suficientemente los objetivos de ${enemy.name}. Rechazado.`,
          neutral:       `Los términos no están suficientemente equilibrados. Con condiciones más justas, podríamos reconsiderar.`,
        },
      },
    };
    T.aid = {
      accepted: {
        diplomatic:    `Las conversaciones han mostrado que la cooperación es posible. ${enemy.name} enviará los recursos acordados como señal de buena fe.`,
        aggressive:    `Acepto enviar apoyo, pero esto crea una deuda. ${enemy.name} esperará reciprocidad cuando llegue el momento.`,
        defensive:     `Si esto fortalece la estabilidad regional, tiene sentido para ${enemy.name}. Autorizamos el envío de recursos.`,
        opportunistic: `Un préstamo de recursos puede generar retornos interesantes. ${enemy.name} acepta — con interés implícito.`,
        expansionist:  `Esta ayuda posiciona a ${enemy.name} como potencia generosa. Acepto — la influencia tiene su precio.`,
        neutral:       `Dado el tono de esta conversación, parece razonable. ${enemy.name} enviará los recursos solicitados.`,
      },
      rejected: {
        diplomatic:    `Lamentablemente las condiciones actuales no permiten a ${enemy.name} comprometer recursos en este momento.`,
        aggressive:    `¿Pides ayuda? ${enemy.name} no es un banco de caridad. Gánate esa ayuda primero.`,
        defensive:     `${enemy.name} necesita sus recursos para su propia seguridad. No estamos en posición de comprometer activos.`,
        opportunistic: `La solicitud no ofrece suficiente beneficio para ${enemy.name}. Mejora la oferta y lo reconsideraré.`,
        expansionist:  `¿Por qué habría de financiar a ${enemy.name} sin garantías claras de retorno estratégico?`,
        neutral:       `Lamentablemente no podemos comprometer recursos en este momento. Las condiciones no son las adecuadas.`,
      },
    };
    return T[type]?.[accepted ? 'accepted' : 'rejected']?.[p]
        ?? (accepted ? `${enemy.name} acepta la propuesta. Firmemos el acuerdo.` : `${enemy.name} no acepta estos términos. Necesito mejores condiciones.`);
  },

  // ── PUBLIC API ─────────────────────────────────────────────

  async startDebate(game, enemyId) {
    this.game     = game;
    this.enemyId  = enemyId;
    this.history  = [];
    this.favorableCount   = 0;
    this._turn            = 0;
    this._playerThreats   = 0;
    this._playerPraises   = 0;
    this._playerApologies = 0;
    this._playerDemands   = 0;
    this._counterDemandMade = false;
    this._pendingEffect   = null;
    this._warProgress     = null;
    this._playerWinning   = false;
    this._agreedEffects   = [];    // tracks effects applied during this debate
    this._debateYear      = game.year;

    const enemy = game.countries[enemyId];
    const pc    = game.countries[game.playerCountryId];
    const rel   = game.getRelation(game.playerCountryId, enemyId);
    const atWar = pc.atWar.includes(enemyId);

    this._mood = Math.round(rel / 5);
    if (enemy.personality === 'diplomatic') this._mood += 5;
    if (enemy.personality === 'aggressive') this._mood -= 8;

    // War context adjusts mood and opening dramatically
    if (atWar && typeof WAR !== 'undefined') {
      const w = WAR.getWarState(game, enemyId);
      if (w) {
        this._warProgress   = w.progress ?? 50;
        this._playerWinning = this._warProgress > 55;
        const enemyWinning  = this._warProgress < 35;
        if (this._playerWinning) {
          // Player winning → enemy desperate, more willing to make peace
          this._mood += 15;
          // But aggressive personalities resist showing desperation
          if (enemy.personality === 'aggressive') this._mood -= 8;
        } else if (enemyWinning) {
          // Enemy winning → enemy is confident, harder to negotiate
          this._mood -= 22;
        } else {
          this._mood -= 12;
        }
        // Very low enemy morale = desperate for peace
        if ((w.dMorale ?? 70) < 35) this._mood += 12;
        if ((w.dTroops ?? 50000) < 10000) this._mood += 18;
      } else {
        this._mood -= 15;
      }
    } else if (!atWar) {
      const milPower = enemy.military + enemy.economy;
      const pcPower  = pc.military + pc.economy;
      if (milPower < pcPower * 0.6) this._mood += 8; // weak country more eager
    }

    this._mood = Math.max(-40, Math.min(30, this._mood));

    // Use Groq for opening message if available
    let text;
    if (this._getKey()) {
      const sys  = this._buildSystemPrompt(enemy, pc, game);
      const opening = atWar
        ? `El jugador ha solicitado una audiencia en plena guerra. Abre la negociación con 2-3 oraciones que reflejen el estado actual del conflicto y tu posición.`
        : `El jugador ha solicitado una audiencia diplomática. Abre con 2-3 oraciones que reflejen tu personalidad y el estado de la relación bilateral.`;
      text = await this._callGroq(sys, [{ role: 'user', content: opening }]);
    }
    if (!text) text = this._localOpen(enemy, pc, rel, atWar);

    this.history.push({ role: 'assistant', content: text });
    return { text, favorable: this._mood > 5, error: false };
  },

  async sendMessage(userText) {
    if (!userText.trim() || !this.game) return null;
    const enemy = this.game.countries[this.enemyId];
    const pc    = this.game.countries[this.game.playerCountryId];
    this._turn++;

    const intent = this._detectIntent(userText);
    this._updateMood(intent);

    this.history.push({ role: 'user', content: userText });

    let text = null;

    // Try Groq if key available
    if (this._getKey()) {
      const sys  = this._buildSystemPrompt(enemy, pc, this.game);
      const msgs = this.history.slice(0, -1).map(m => ({ role: m.role, content: m.content }));
      msgs.push({ role: 'user', content: userText });
      text = await this._callGroq(sys, msgs);
    }

    // Fall back to local engine
    if (!text) {
      text = this._localResponse(intent, enemy, pc, this.game);
    }

    this.history.push({ role: 'assistant', content: text });
    const favorable = this._mood > 0;
    if (favorable) this.favorableCount++;

    // Detect conversation effects: what should happen in the game from this exchange?
    this._pendingEffect = this._detectConversationEffect(userText, text, intent, enemy);

    return { text, favorable, pendingEffect: this._pendingEffect, error: false };
  },

  // Detect if this conversation exchange should trigger a real game effect
  _detectConversationEffect(playerMsg, enemyResponse, intent, enemy) {
    const pm = playerMsg.toLowerCase();
    const er = enemyResponse.toLowerCase();
    const p  = enemy.personality;

    // Player declares war in text → offer to formalize it
    const warDeclare = /te\s+declaro\s+la\s+guerra|voy\s+a\s+atacar|comenzamos\s+la\s+guerra|invadir(é|e)|declaramos\s+guerra/.test(pm);
    if (warDeclare) {
      return { type: 'declare_war', label: '⚔️ Declarar Guerra Oficialmente', danger: true };
    }

    // Enemy accepts peace (in response text) and player asked for peace
    const enemyAcceptsPeace = /acepto\s+(?:la\s+)?(?:paz|tregua|armisticio|cese)|firmo\s+la\s+paz|detenemos\s+(?:la\s+)?guerra/.test(er);
    const playerWantsPeace  = /paz|tregua|armisticio|dejar\s+de\s+pelear|fin\s+(?:a\s+)?la\s+guerra/.test(pm);
    if (playerWantsPeace && enemyAcceptsPeace && intent !== 'threat') {
      return { type: 'peace', label: '🕊️ Formalizar Paz (acuerdo verbal)', icon: '🕊️' };
    }

    // Enemy accepts alliance (in response text) and player proposed it
    const enemyAcceptsAlliance = /acepto\s+(?:la\s+)?alianza|somos\s+aliados|formamos\s+(?:una\s+)?alianza|alianza\s+(?:está\s+)?aceptada/.test(er);
    const playerWantsAlliance  = /alianza|aliarnos|aliados|uni(rnos|ón)|pacto\s+de\s+defensa/.test(pm);
    if (playerWantsAlliance && enemyAcceptsAlliance && this._mood > 5) {
      return { type: 'alliance', label: '🤝 Formalizar Alianza (acuerdo verbal)', icon: '🤝' };
    }

    // Enemy is desperate for peace (losing war badly)
    if (this._playerWinning && this._warProgress > 70 && /necesitamos\s+paz|pido\s+la\s+paz|acepto\s+(?:un\s+)?cese|no\s+podemos\s+continuar/.test(er)) {
      return { type: 'peace_urgent', label: '🕊️ Aceptar su Rendición', icon: '🕊️', urgent: true };
    }

    // Enemy proposes a conditional (detects "si tú haces X, yo haré Y" pattern)
    const conditionalPattern = /si\s+(?:tú\s+)?(?:das?|pagas?|ofreces?|comprometes?|garantizas?|dejas?|acuerda[ns]?).*(?:entonces|yo|nosotros|aceptar[eé]|firmar[eé]|alianza|paz)/;
    if (conditionalPattern.test(er) && this._mood > -5) {
      return { type: 'conditional', label: '📋 Crear Compromiso con esta Condición', icon: '📋' };
    }

    return null;
  },

  // Create a conditional commitment from a negotiation
  createConditionalTreaty(type, description, obligation, reward, rewardDesc, penalty, penaltyDesc, deadline) {
    if (!this.game || !this.enemyId) return false;
    this.game.addCommitment({
      type,
      description,
      targetId: this.enemyId,
      deadline: deadline || this.game.year + 1,
      obligation,
      reward,
      rewardDesc: rewardDesc || 'Acuerdo cumplido.',
      penalty,
      penaltyDesc: penaltyDesc || 'Consecuencias por incumplimiento.',
    });
    const enemy = this.game.countries[this.enemyId];
    this.game.addLog(`📋 Compromiso creado con ${enemy?.flag} ${enemy?.name}: ${description} (hasta año ${deadline || this.game.year + 1})`, 'info');
    return true;
  },

  async proposeTreaty(type) {
    const enemy = this.game.countries[this.enemyId];
    const pc    = this.game.countries[this.game.playerCountryId];
    const rel   = this.game.getRelation(this.game.playerCountryId, this.enemyId);
    const p     = enemy.personality;

    let accepted = false;
    if (type === 'peace') {
      accepted = this._mood >= 0
        || (this._mood >= -10 && ['diplomatic', 'neutral', 'opportunistic'].includes(p) && Math.random() < 0.4);
    } else if (type === 'alliance') {
      accepted = this._mood >= 12 && rel >= 20;
      if (!accepted && this._mood >= 8 && p === 'diplomatic') accepted = Math.random() < 0.4;
    } else if (type === 'trade') {
      accepted = this._mood >= 0 && ['diplomatic', 'opportunistic', 'neutral'].includes(p);
      if (!accepted && this._mood >= 5) accepted = Math.random() < 0.35;
    } else if (type === 'aid') {
      // Aid is harder — requires real goodwill
      accepted = this._mood >= 8 && ['diplomatic', 'opportunistic', 'neutral'].includes(p) && rel >= 10;
      if (!accepted && this._mood >= 15 && p === 'diplomatic') accepted = Math.random() < 0.5;
    }

    let text = null;

    // Try Groq treaty response
    if (this._getKey()) {
      const sys  = this._buildSystemPrompt(enemy, pc, this.game);
      const tLabel = { peace: 'paz/armisticio', alliance: 'alianza formal', trade: 'tratado comercial' }[type];
      const treMsg = `El jugador propone formalmente un tratado de ${tLabel}. Tu respuesta es: ${accepted ? 'ACEPTAS' : 'RECHAZAS'}. Da una respuesta presidencial de 2-3 oraciones explicando por qué.`;
      const msgs = [...this.history.slice(-4), { role: 'user', content: treMsg }];
      text = await this._callGroq(sys, msgs);
    }

    if (!text) {
      text = this._localTreaty(type, enemy, pc, accepted);
    }

    if (accepted) this.favorableCount++;
    this.history.push({ role: 'assistant', content: text });
    return { text, favorable: accepted, error: false, accepted, type };
  },

  applyTreatyResult(game, enemyId, type, accepted) {
    const enemy = game.countries[enemyId];
    const pc    = game.countries[game.playerCountryId];
    const pid   = game.playerCountryId;

    if (accepted) {
      if (type === 'peace') {
        pc.atWar    = pc.atWar.filter(id => id !== enemyId);
        enemy.atWar = enemy.atWar.filter(id => id !== pid);
        game.wars   = game.wars.filter(w =>
          !(w.attacker === pid && w.defender === enemyId) &&
          !(w.attacker === enemyId && w.defender === pid)
        );
        // Boost relation enough that both sides move away from hostility
        const newRel = Math.max(-10, (game.getRelation(pid, enemyId) || 0) + 30);
        game.countries[pid].relations[enemyId]  = newRel;
        game.countries[enemyId].relations[pid]  = Math.max(-10, ((game.countries[enemyId].relations[pid]) || 0) + 15);
        pc.stability = Math.min(100, pc.stability + 10);
        game.income  = game._calcIncome();
        game.addLog(`🕊️ Paz firmada con ${enemy.flag} ${enemy.name}. El conflicto termina. Estabilidad +10.`, 'success');
        return { summary: `🕊️ Paz firmada con ${enemy.name}.\nRelaciones mejoradas. Estabilidad +10.` };

      } else if (type === 'alliance') {
        // FIX: set relation to minimum 70 BEFORE updating ally status
        // so _updateAllyStatus doesn't strip the new alliance
        const boostedRel = Math.max(70, (game.getRelation(pid, enemyId) || 0) + 35);
        game.countries[pid].relations[enemyId]   = boostedRel;
        game.countries[enemyId].relations[pid]   = Math.max(60, ((game.countries[enemyId].relations[pid]) || 0) + 18);
        if (!pc.allies.includes(enemyId))                    pc.allies.push(enemyId);
        if (!enemy.allies.includes(pid))                     enemy.allies.push(pid);
        game.addLog(`🤝 Alianza formal establecida con ${enemy.flag} ${enemy.name}. Relaciones: ${boostedRel}.`, 'success');
        return { summary: `🤝 Alianza con ${enemy.name} formalizada.\nAhora aparece como aliado en el mapa.` };

      } else if (type === 'trade') {
        const tradeBonus = Math.round(20 + enemy.economy * 0.4);
        game.changeRelation(pid, enemyId, 15);
        pc.economy    = Math.min(100, pc.economy + 4);
        game.treasury += tradeBonus;
        game.income   = game._calcIncome();
        game.addLog(`💱 Tratado comercial con ${enemy.flag} ${enemy.name}. +$${tradeBonus}B · Economía +4.`, 'success');
        return { summary: `💱 Tratado comercial firmado con ${enemy.name}.\n+$${tradeBonus}B al tesoro · Economía +4.` };

      } else if (type === 'aid') {
        const aidAmount = Math.round(40 + enemy.economy * 0.6 + enemy.military * 0.3);
        const troops    = Math.round(enemy.armySize * 0.08);
        game.changeRelation(pid, enemyId, 12);
        game.treasury  += aidAmount;
        pc.armySize    += troops;
        game.addLog(`💰 ${enemy.flag} ${enemy.name} envía ayuda: +$${aidAmount}B y +${troops.toLocaleString()} soldados.`, 'success');
        return { summary: `💰 Ayuda recibida de ${enemy.name}.\n+$${aidAmount}B al tesoro · +${troops.toLocaleString()} tropas.` };
      }

    } else {
      // Bad negotiation — relation penalty scales with how poorly it went
      const penalty = type === 'aid' ? -12 : type === 'alliance' ? -10 : -8;
      game.changeRelation(pid, enemyId, penalty);
      const label = { peace: 'paz', alliance: 'alianza', trade: 'tratado comercial', aid: 'ayuda' }[type] || type;
      game.addLog(`❌ ${enemy.flag} ${enemy.name} rechazó la propuesta de ${label}. Relaciones ${penalty}.`, 'warning');
      return { summary: `❌ ${enemy.name} rechazó la propuesta.\nRelaciones ${penalty}.` };
    }
    return null;
  },

  async finalizeNegotiation() {
    if (!this.game || !this.enemyId) return null;
    const game    = this.game;
    const enemyId = this.enemyId;
    const enemy   = game.countries[enemyId];
    const pc      = game.countries[game.playerCountryId];
    const mood    = this._mood;

    // 1. Apply mood-based relation change
    const relChange = Math.round(Math.max(-30, Math.min(25, mood * 0.65)));
    if (relChange !== 0) game.changeRelation(game.playerCountryId, enemyId, relChange);

    // 2. Collect effects already applied during debate (via effect buttons)
    const agreed = [...this._agreedEffects];

    // 3. Use Groq to extract agreements + generate summary IN PARALLEL
    const extractedCommitments = [];
    let narrativeSummary = null;

    if (this._getKey() && this.history.length >= 4) {
      const historySlice = this.history.slice(-12).map(m => ({ role: m.role, content: m.content }));
      const shortSlice   = this.history.slice(-6).map(m => ({ role: m.role, content: m.content }));

      const extractPrompt = `Analiza esta conversación diplomática. Responde SOLO con JSON válido (sin texto extra).

Formato exacto:
{"commitments":[{
  "description": "descripción completa del acuerdo en español",
  "obligations": [
    {"type":"pay","amount":30,"desc":"Pagar $30B al aliado"},
    {"type":"military_increase","desc":"Reforzar las fuerzas armadas"},
    {"type":"stability_increase","desc":"Mejorar la estabilidad del gobierno"}
  ],
  "reward": "alliance|peace|trade|resources|relation",
  "rewardDesc": "descripción de lo que recibe el jugador",
  "penalty": "war|relation|none",
  "deadlineYears": 1,
  "alreadyApplied": false
}]}

REGLAS DE obligations (array — incluye TODAS las condiciones del acuerdo en un solo objeto):
- type "pay": jugador debe pagar dinero; incluye amount en $B (usa 20 si no se especificó)
- type "military_increase": jugador debe invertir en ejército / subir fuerza militar / duplicar hombres
- type "economy_increase": jugador debe mejorar economía / invertir económicamente
- type "stability_increase": jugador debe mejorar gobierno / estabilidad / aprobar reformas
- type "non_aggression": jugador NO debe atacar ni declarar guerra al país durante el plazo
NUNCA inventes obligaciones que no sean de esos 5 tipos. IGNORA petróleo/gas/minerales/territorios.

REGLAS DE reward:
- "alliance" = alianza formal
- "peace" = fin de guerra
- "trade" = tratado comercial
- "resources" = el otro país da dinero/tropas al jugador
- "relation" = solo mejora diplomática

alreadyApplied = true ÚNICAMENTE si el acuerdo se ejecutó INMEDIATAMENTE en la conversación.
deadlineYears = plazo en años (usa 1 por defecto).
Sin acuerdos reales: {"commitments":[]}`;

      const summaryPrompt = `Eres secretario de actas diplomáticas. Resume en 2-4 puntos breves (con •) esta reunión entre ${pc.flag} ${pc.name} y ${enemy.flag} ${enemy.name}. Solo en español, máximo 4 líneas.`;

      const [jsonRaw, summaryRaw] = await Promise.all([
        this._callGroq(extractPrompt, historySlice, 500),
        this._callGroq(summaryPrompt, shortSlice, 200),
      ]);

      if (jsonRaw) {
        try {
          const cleaned = jsonRaw.replace(/```json|```/g, '').trim();
          const start   = cleaned.indexOf('{');
          const end     = cleaned.lastIndexOf('}');
          const parsed  = JSON.parse(start >= 0 && end >= 0 ? cleaned.slice(start, end + 1) : cleaned);
          for (const c of (parsed.commitments || [])) extractedCommitments.push(c);
        } catch (e) { console.warn('Commitment JSON parse failed:', e.message); }
      }
      if (summaryRaw) narrativeSummary = summaryRaw;
    }

    // 4. Apply immediately-applied effects from Groq extraction (if not already in _agreedEffects)
    for (const c of extractedCommitments) {
      if (c.alreadyApplied && !agreed.includes(c.reward)) {
        if (['peace', 'alliance', 'trade', 'aid'].includes(c.reward)) {
          this.applyTreatyResult(game, enemyId, c.reward, true);
          agreed.push(c.reward);
        }
      }
    }

    // 5. Create commitment records for everything
    const effectLabels = {
      peace:    `🕊️ Acuerdo de paz con ${enemy.flag} ${enemy.name}`,
      alliance: `🤝 Alianza con ${enemy.flag} ${enemy.name}`,
      trade:    `💱 Tratado comercial con ${enemy.flag} ${enemy.name}`,
      aid:      `💰 Ayuda de ${enemy.flag} ${enemy.name}`,
      relation: `📈 Mejora de relaciones con ${enemy.flag} ${enemy.name}`,
      resources:`💵 Recursos de ${enemy.flag} ${enemy.name}`,
    };

    // Fulfilled records for directly-applied effects
    for (const type of agreed) {
      game.addCommitment({
        type, status: 'fulfilled',
        description: effectLabels[type] || type,
        targetId: enemyId,
        deadline: game.year + 50,
        obligation: { action: 'automatic' },
        reward: { type },
        rewardDesc: effectLabels[type] || type,
        penalty: { type: 'none' }, penaltyDesc: '—',
      });
    }

    // Pending commitments from Groq extraction (conditional ones)
    const newCommitments = [];
    for (const c of extractedCommitments) {
      if (c.alreadyApplied) continue;

      // Build obligations array with current-value snapshots for comparison
      const obligations = (c.obligations || []).map(ob => ({
        ...ob,
        milSnapshot:  pc.military,
        ecoSnapshot:  pc.economy,
        stabSnapshot: pc.stability,
      }));

      // Fallback: if Groq returned old single-obligation format
      if (!obligations.length && c.obligation) {
        obligations.push({
          type: c.obligation, amount: c.obligationValue || 0, desc: c.obligationDesc,
          milSnapshot: pc.military, ecoSnapshot: pc.economy, stabSnapshot: pc.stability,
        });
      }

      const commitment = {
        description: c.description || `Acuerdo con ${enemy.name}`,
        targetId: enemyId,
        deadline: game.year + (c.deadlineYears || 1),
        obligations,
        reward: { type: c.reward || 'relation', value: 20, amount: 50 },
        rewardDesc: c.rewardDesc || effectLabels[c.reward] || 'Recompensa acordada',
        penalty: { type: c.penalty || 'relation', value: -20 },
        penaltyDesc: c.penalty === 'war' ? '⚔️ Guerra declarada' : '📉 Relaciones −20',
      };
      game.addCommitment(commitment);
      newCommitments.push(commitment);
    }

    // Fallback: if no Groq extraction and there's a pending effect, register it manually
    if (!this._getKey() && this._pendingEffect && mood > -5 && !['declare_war'].includes(this._pendingEffect.type)) {
      const type = this._pendingEffect.type === 'peace_urgent' ? 'peace' : this._pendingEffect.type;
      if (!agreed.includes(type) && effectLabels[type]) {
        const c = game.addCommitment({
          type, description: `${effectLabels[type]} — pendiente`,
          targetId: enemyId, deadline: game.year + 1,
          obligation: { action: 'manual' },
          reward: { type }, rewardDesc: effectLabels[type],
          penalty: { type: 'relation', value: -15 }, penaltyDesc: 'Relaciones −15',
        });
        newCommitments.push(c);
      }
    }

    // 6. Fallback summary if Groq didn't return one
    if (!narrativeSummary) {
      const lines = [];
      if (agreed.includes('peace'))         lines.push('• 🕊️ Acuerdo de paz establecido');
      if (agreed.includes('alliance'))      lines.push('• 🤝 Alianza formal activada');
      if (agreed.includes('trade'))         lines.push('• 💱 Tratado comercial activo');
      if (extractedCommitments.filter(c => !c.alreadyApplied).length > 0)
        lines.push(`• 📋 ${extractedCommitments.filter(c => !c.alreadyApplied).length} compromiso(s) pendiente(s) registrado(s)`);
      if (relChange > 5)  lines.push(`• 📈 Relaciones mejoraron (+${relChange})`);
      if (relChange < -5) lines.push(`• 📉 Relaciones se deterioraron (${relChange})`);
      if (!lines.length)  lines.push(mood > 0 ? '• Conversación cordial sin compromisos formales' : '• La negociación terminó sin acuerdos claros');
      narrativeSummary = lines.join('\n');
    }

    game.addLog(`📋 Negociación con ${enemy.flag} ${enemy.name} finalizada. ${newCommitments.length} compromisos registrados. Relaciones: ${relChange >= 0 ? '+' : ''}${relChange}.`, relChange >= 0 ? 'success' : 'warning');
    return { narrativeSummary, relChange, agreed, newCommitments, mood };
  },

  reset() {
    this.history = []; this.enemyId = null; this.game = null;
    this.favorableCount = 0; this._mood = 0; this._turn = 0;
    this._playerThreats = 0; this._playerPraises = 0;
    this._playerApologies = 0; this._playerDemands = 0;
    this._counterDemandMade = false;
    this._agreedEffects = []; this._pendingEffect = null;
    this._warProgress = null; this._playerWinning = false;
    this._debateYear = null;
  },
};

// ── DEBATE UI ──────────────────────────────────────────────

const DEBATE_UI = {
  _autoCloseTimer: null,

  open(game, enemyId) {
    const enemy   = game.countries[enemyId];
    const overlay = document.getElementById('debate-overlay');
    if (!overlay) return;

    // Cancel any pending auto-close from a previous finalization
    if (DEBATE_UI._autoCloseTimer) {
      clearTimeout(DEBATE_UI._autoCloseTimer);
      DEBATE_UI._autoCloseTimer = null;
    }

    document.getElementById('debate-enemy-flag').textContent  = enemy.flag;
    document.getElementById('debate-enemy-name').textContent  = enemy.name;
    document.getElementById('debate-enemy-title').textContent = enemy.region + ' — ' + ({ diplomatic:'Diplomático', aggressive:'Agresivo', defensive:'Defensivo', opportunistic:'Oportunista', expansionist:'Expansionista', neutral:'Neutral' }[enemy.personality] || enemy.personality);
    document.getElementById('debate-messages').innerHTML = '';
    document.getElementById('debate-input').value = '';
    document.getElementById('debate-input').disabled  = true;
    document.getElementById('debate-send').disabled   = true;
    document.getElementById('debate-treaty-area').classList.add('hidden');

    // Reset finalize button in case a previous session left it disabled
    const finalizeBtn = document.getElementById('debate-finalize-btn');
    finalizeBtn.disabled = false;
    finalizeBtn.textContent = '🏁 Finalizar Negociación';

    // API key badge
    const hdr = document.getElementById('debate-header');
    let keyBtn = document.getElementById('debate-key-btn');
    if (!keyBtn) {
      keyBtn = document.createElement('button');
      keyBtn.id = 'debate-key-btn';
      keyBtn.className = 'btn-secondary';
      keyBtn.style.cssText = 'font-size:11px;padding:4px 8px;margin-right:6px';
      keyBtn.addEventListener('click', () => DEBATE_UI._showKeyModal());
      hdr.insertBefore(keyBtn, document.getElementById('debate-close'));
    }
    const hasKey = !!GEMINI._getKey();
    keyBtn.textContent = hasKey ? '🤖 IA Activa' : '🔑 Activar IA';
    keyBtn.style.color = hasKey ? '#3dba6f' : '#c9a227';

    overlay.classList.remove('hidden');
    DEBATE_UI._addMessage('system', `🎙️ Audiencia diplomática con ${enemy.flag} ${enemy.name} iniciada.${hasKey ? ' <span style="color:#3dba6f">IA Groq activa.</span>' : ' <span style="color:#c9a227">Motor local. Activa IA Groq para mejor experiencia.</span>'}`);
    DEBATE_UI._setThinking(true);

    GEMINI.startDebate(game, enemyId).then(result => {
      DEBATE_UI._setThinking(false);
      DEBATE_UI._addMessage('enemy', result.text, enemy.flag);
      document.getElementById('debate-input').disabled = false;
      document.getElementById('debate-send').disabled  = false;
      document.getElementById('debate-input').focus();
      setTimeout(() => document.getElementById('debate-treaty-area').classList.remove('hidden'), 800);
    });
  },

  _showKeyModal() {
    const existing = document.getElementById('groq-key-modal');
    if (existing) { existing.remove(); return; }
    const current = GEMINI._getKey();
    const modal = document.createElement('div');
    modal.id = 'groq-key-modal';
    modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1a1a2e;border:1px solid #c9a22755;border-radius:12px;padding:24px;z-index:9999;width:360px;box-shadow:0 20px 60px #000a';
    modal.innerHTML = `
      <div style="font-weight:700;color:#c9a227;margin-bottom:8px">🤖 IA de Negociación (Groq)</div>
      <div style="font-size:12px;color:#aaa;margin-bottom:14px;line-height:1.5">
        Usa <strong>Llama 3.3 70B</strong> para negociaciones realistas.<br>
        Groq es <strong>100% gratis</strong> — crea tu cuenta en <em>groq.com</em> y genera una API key.
      </div>
      <input id="groq-key-input" type="password" placeholder="gsk_xxxxxxxxxxxxxxxx" value="${current}"
        style="width:100%;box-sizing:border-box;background:#0d1824;border:1px solid #c9a22744;border-radius:6px;color:#eee;padding:8px 10px;font-size:13px;margin-bottom:10px;outline:none">
      <div style="display:flex;gap:8px">
        <button id="groq-save-btn" style="flex:1;background:#c9a227;color:#000;border:none;border-radius:6px;padding:8px;font-weight:700;cursor:pointer">Guardar y Activar</button>
        <button id="groq-clear-btn" style="background:transparent;color:#888;border:1px solid #444;border-radius:6px;padding:8px 12px;cursor:pointer">Borrar</button>
        <button id="groq-cancel-btn" style="background:transparent;color:#888;border:1px solid #444;border-radius:6px;padding:8px 12px;cursor:pointer">✕</button>
      </div>
      <div id="groq-status" style="margin-top:10px;font-size:11px;color:#aaa;min-height:16px"></div>`;
    document.body.appendChild(modal);
    document.getElementById('groq-save-btn').onclick = async () => {
      const key = document.getElementById('groq-key-input').value.trim();
      if (!key) return;
      document.getElementById('groq-status').textContent = 'Verificando…';
      localStorage.setItem('im_groq_key', key);
      const test = await GEMINI._callGroq('Responde solo "OK"', [{ role: 'user', content: 'test' }]);
      if (test) {
        document.getElementById('groq-status').style.color = '#3dba6f';
        document.getElementById('groq-status').textContent = '✅ Conectado. La IA Groq está activa.';
        const keyBtn = document.getElementById('debate-key-btn');
        if (keyBtn) { keyBtn.textContent = '🤖 IA Activa'; keyBtn.style.color = '#3dba6f'; }
        setTimeout(() => modal.remove(), 1500);
      } else {
        localStorage.removeItem('im_groq_key');
        document.getElementById('groq-status').style.color = '#d94f4f';
        document.getElementById('groq-status').textContent = '❌ Clave inválida o error de conexión.';
      }
    };
    document.getElementById('groq-clear-btn').onclick = () => {
      localStorage.removeItem('im_groq_key');
      document.getElementById('groq-key-input').value = '';
      document.getElementById('groq-status').textContent = 'Clave borrada.';
    };
    document.getElementById('groq-cancel-btn').onclick = () => modal.remove();
  },

  async finalize() {
    if (!GEMINI.game || !GEMINI.enemyId) return;
    const enemy = GEMINI.game.countries[GEMINI.enemyId];
    const finalizeBtn = document.getElementById('debate-finalize-btn');

    const unlock = () => {
      DEBATE_UI._setThinking(false);
      finalizeBtn.disabled = false;
      finalizeBtn.textContent = '🏁 Finalizar Negociación';
    };

    // Lock input during finalization
    document.getElementById('debate-input').disabled = true;
    document.getElementById('debate-send').disabled  = true;
    finalizeBtn.disabled = true;
    finalizeBtn.textContent = '⏳ Procesando…';
    DEBATE_UI._setThinking(true);

    let result;
    try {
      result = await GEMINI.finalizeNegotiation();
    } catch (err) {
      console.error('finalizeNegotiation error:', err);
      unlock();
      return;
    }
    DEBATE_UI._setThinking(false);

    if (!result) { unlock(); DEBATE_UI.close(); return; }

    // Show finalization summary as a special system message
    const relStr = result.relChange >= 0 ? `+${result.relChange}` : `${result.relChange}`;
    const commitStr = result.newCommitments.length > 0
      ? `\n\n📋 <strong>Compromisos creados (${result.newCommitments.length}):</strong>\n` +
        result.newCommitments.map(c => `• ${c.description} — vence año ${c.deadline}`).join('\n')
      : '';

    const html = `<div style="background:#0d1824;border:1px solid #c9a22755;border-radius:8px;padding:12px;font-size:13px;line-height:1.6;white-space:pre-wrap">
<div style="color:#c9a227;font-weight:700;margin-bottom:8px">🏁 ACTA DE NEGOCIACIÓN — ${enemy.flag} ${enemy.name}</div>
${result.narrativeSummary}${commitStr}
<div style="margin-top:10px;font-size:11px;color:#888">Relaciones: <span style="color:${result.relChange >= 0 ? '#3dba6f' : '#d94f4f'}">${relStr}</span></div>
</div>`;

    DEBATE_UI._addMessage('system', html);

    UI.refresh();
    MAP.colorAll();

    // Auto-close after a few seconds so user can read it
    DEBATE_UI._autoCloseTimer = setTimeout(() => {
      DEBATE_UI._autoCloseTimer = null;
      DEBATE_UI.close();
    }, 4000);
  },

  close(treatySummary = null) {
    // Apply mood penalty if conversation went badly with no treaty
    if (GEMINI.game && GEMINI.enemyId && !treatySummary) {
      const mood = GEMINI._mood;
      if (mood < -15) {
        const penalty = Math.round(Math.abs(mood) / 4);
        GEMINI.game.changeRelation(GEMINI.game.playerCountryId, GEMINI.enemyId, -penalty);
        const enemy = GEMINI.game.countries[GEMINI.enemyId];
        GEMINI.game.addLog(`📉 Negociación fallida con ${enemy.flag} ${enemy.name}. La tensión quedó en el aire. Relaciones -${penalty}.`, 'warning');
        if (typeof UI !== 'undefined') UI.showToast(`📉 Negociación con <strong>${enemy.name}</strong> terminó mal. Relaciones -${penalty}.`, 'warning');
      }
    }
    document.getElementById('debate-overlay').classList.add('hidden');
    // Show treaty result as toast if a treaty was signed
    if (treatySummary && typeof UI !== 'undefined') {
      UI.showToast(treatySummary.replace(/\n/g, '<br>'), 'success');
    }
    if (typeof UI !== 'undefined')  { UI.refresh(); }
    if (typeof MAP !== 'undefined') { MAP.colorAll(); }
    GEMINI.reset();
  },

  async sendMessage() {
    const input = document.getElementById('debate-input');
    const text  = input.value.trim();
    if (!text || !GEMINI.game) return;
    input.value = '';
    input.disabled = true;
    document.getElementById('debate-send').disabled = true;
    DEBATE_UI._addMessage('player', text, GEMINI.game.countries[GEMINI.game.playerCountryId].flag);
    DEBATE_UI._setThinking(true);
    const result = await GEMINI.sendMessage(text);
    DEBATE_UI._setThinking(false);
    if (result) {
      const enemy = GEMINI.game.countries[GEMINI.enemyId];
      DEBATE_UI._addMessage(result.error ? 'error' : 'enemy', result.text, enemy.flag);
      // Show detected conversation effect as an action button
      if (result.pendingEffect) {
        DEBATE_UI._showEffectButton(result.pendingEffect);
      } else {
        DEBATE_UI._clearEffectButton();
      }
    }
    input.disabled = false;
    document.getElementById('debate-send').disabled = false;
    input.focus();
  },

  _showEffectButton(effect) {
    let zone = document.getElementById('debate-effect-zone');
    if (!zone) {
      zone = document.createElement('div');
      zone.id = 'debate-effect-zone';
      zone.style.cssText = 'padding:8px 12px;display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid #c9a22722;';
      const inputArea = document.getElementById('debate-input-area');
      inputArea.parentNode.insertBefore(zone, inputArea);
    }
    zone.innerHTML = '';

    const btn = document.createElement('button');
    btn.className = effect.danger ? 'btn-secondary' : 'btn-primary';
    btn.style.cssText = `font-size:12px;padding:6px 14px;${effect.danger ? 'background:#6b1414;border-color:#d94f4f;color:#f88;' : ''}`;
    btn.textContent = effect.label;
    btn.onclick = () => DEBATE_UI._applyConversationEffect(effect);
    zone.appendChild(btn);

    // Always offer conditional commitment option
    if (!effect.danger && effect.type !== 'declare_war') {
      const condBtn = document.createElement('button');
      condBtn.className = 'btn-secondary';
      condBtn.style.cssText = 'font-size:12px;padding:6px 14px;';
      condBtn.textContent = '📋 Crear Compromiso';
      condBtn.onclick = () => DEBATE_UI._openCommitmentModal();
      zone.appendChild(condBtn);
    }
  },

  _clearEffectButton() {
    const zone = document.getElementById('debate-effect-zone');
    if (zone) zone.innerHTML = '';
  },

  _applyConversationEffect(effect) {
    const game    = GEMINI.game;
    const enemyId = GEMINI.enemyId;
    const enemy   = game.countries[enemyId];
    const pc      = game.countries[game.playerCountryId];

    if (effect.type === 'declare_war') {
      if (!pc.atWar.includes(enemyId)) {
        game.startWar(game.playerCountryId, enemyId);
        game.addLog(`⚔️ Guerra declarada a ${enemy.flag} ${enemy.name} tras ruptura diplomática.`, 'danger');
        DEBATE_UI._addMessage('system', `⚔️ ¡Has declarado la guerra a ${enemy.name}! El debate ha concluido.`);
      }
      DEBATE_UI.close();
      return;
    }
    if (effect.type === 'peace' || effect.type === 'peace_urgent') {
      GEMINI.applyTreatyResult(game, enemyId, 'peace', true);
      GEMINI._agreedEffects.push('peace');
      DEBATE_UI._addMessage('system', `🕊️ Paz formalizada con ${enemy.name}. Se aplicará al finalizar la negociación.`);
      DEBATE_UI._clearEffectButton();
      return;
    }
    if (effect.type === 'alliance') {
      GEMINI.applyTreatyResult(game, enemyId, 'alliance', true);
      GEMINI._agreedEffects.push('alliance');
      DEBATE_UI._addMessage('system', `🤝 Alianza con ${enemy.name} acordada. Se aplicará al finalizar la negociación.`);
      DEBATE_UI._clearEffectButton();
      return;
    }
    if (effect.type === 'conditional') {
      DEBATE_UI._openCommitmentModal();
    }
    DEBATE_UI._clearEffectButton();
  },

  _openCommitmentModal() {
    const existing = document.getElementById('commitment-modal');
    if (existing) { existing.remove(); return; }
    const game  = GEMINI.game;
    const enemy = game.countries[GEMINI.enemyId];
    const modal = document.createElement('div');
    modal.id    = 'commitment-modal';
    modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1a1a2e;border:1px solid #c9a22755;border-radius:12px;padding:22px;z-index:9999;width:400px;box-shadow:0 20px 60px #000a;max-height:80vh;overflow-y:auto';
    modal.innerHTML = `
      <div style="font-weight:700;color:#c9a227;margin-bottom:12px">📋 Crear Compromiso con ${enemy.flag} ${enemy.name}</div>
      <div style="font-size:12px;color:#aaa;margin-bottom:14px">Define qué debes hacer y qué obtienes a cambio. El compromiso queda registrado y tiene consecuencias si no se cumple.</div>
      <div style="margin-bottom:10px">
        <label style="font-size:11px;color:#c9a227">Descripción del acuerdo</label>
        <input id="cmt-desc" type="text" placeholder="ej: Pagar $80B a cambio de alianza" style="width:100%;box-sizing:border-box;background:#0d1824;border:1px solid #c9a22744;border-radius:6px;color:#eee;padding:7px 10px;font-size:12px;margin-top:4px">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div>
          <label style="font-size:11px;color:#c9a227">Tu obligación</label>
          <select id="cmt-action" style="width:100%;background:#0d1824;border:1px solid #c9a22744;border-radius:6px;color:#eee;padding:7px;font-size:12px;margin-top:4px">
            <option value="pay">💰 Pagar (dinero)</option>
            <option value="no_attack">🛡️ No agredir</option>
            <option value="manual">📝 Acción manual</option>
          </select>
        </div>
        <div>
          <label style="font-size:11px;color:#c9a227">Cantidad ($B si es pago)</label>
          <input id="cmt-amount" type="number" value="50" min="0" style="width:100%;box-sizing:border-box;background:#0d1824;border:1px solid #c9a22744;border-radius:6px;color:#eee;padding:7px;font-size:12px;margin-top:4px">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div>
          <label style="font-size:11px;color:#c9a227">Lo que recibes</label>
          <select id="cmt-reward" style="width:100%;background:#0d1824;border:1px solid #c9a22744;border-radius:6px;color:#eee;padding:7px;font-size:12px;margin-top:4px">
            <option value="alliance">🤝 Alianza</option>
            <option value="peace">🕊️ Fin de la guerra</option>
            <option value="relation">📈 Mejora de relaciones</option>
            <option value="resources">💵 Recursos</option>
          </select>
        </div>
        <div>
          <label style="font-size:11px;color:#c9a227">Si incumples</label>
          <select id="cmt-penalty" style="width:100%;background:#0d1824;border:1px solid #c9a22744;border-radius:6px;color:#eee;padding:7px;font-size:12px;margin-top:4px">
            <option value="war">⚔️ Guerra</option>
            <option value="relation">📉 Relaciones −30</option>
            <option value="none">Sin consecuencia</option>
          </select>
        </div>
      </div>
      <div style="margin-bottom:14px">
        <label style="font-size:11px;color:#c9a227">Plazo (año límite)</label>
        <input id="cmt-deadline" type="number" value="${game.year + 1}" min="${game.year + 1}" max="${game.year + 10}" style="width:100%;box-sizing:border-box;background:#0d1824;border:1px solid #c9a22744;border-radius:6px;color:#eee;padding:7px;font-size:12px;margin-top:4px">
      </div>
      <div style="display:flex;gap:8px">
        <button id="cmt-save" style="flex:1;background:#c9a227;color:#000;border:none;border-radius:6px;padding:9px;font-weight:700;cursor:pointer">✅ Crear Compromiso</button>
        <button id="cmt-cancel" style="background:transparent;color:#888;border:1px solid #444;border-radius:6px;padding:9px 14px;cursor:pointer">✕</button>
      </div>`;
    document.body.appendChild(modal);

    document.getElementById('cmt-save').onclick = () => {
      const desc     = document.getElementById('cmt-desc').value.trim();
      const action   = document.getElementById('cmt-action').value;
      const amount   = parseInt(document.getElementById('cmt-amount').value) || 0;
      const rewardT  = document.getElementById('cmt-reward').value;
      const penaltyT = document.getElementById('cmt-penalty').value;
      const deadline = parseInt(document.getElementById('cmt-deadline').value) || game.year + 1;
      if (!desc) return;

      const rewardLabels  = { alliance: '🤝 Alianza', peace: '🕊️ Fin de guerra', relation: '📈 Relaciones +20', resources: '💵 Recursos' };
      const penaltyLabels = { war: '⚔️ Guerra declarada', relation: '📉 Relaciones −30', none: 'Sin consecuencia' };

      GEMINI.createConditionalTreaty(
        action,
        desc,
        { action, amount },
        { type: rewardT, value: 20, amount: 50 },
        rewardLabels[rewardT] || '',
        { type: penaltyT, value: -30 },
        penaltyLabels[penaltyT] || '',
        deadline
      );

      DEBATE_UI._addMessage('system', `📋 Compromiso creado: <em>${desc}</em>. Plazo: año ${deadline}. Si lo cumples: ${rewardLabels[rewardT]}.`);
      modal.remove();
      DEBATE_UI._clearEffectButton();
    };
    document.getElementById('cmt-cancel').onclick = () => modal.remove();
  },

  async proposeTreaty(type) {
    if (!GEMINI.game) return;
    document.getElementById('debate-treaty-area').classList.add('hidden');
    document.getElementById('debate-input').disabled = true;
    document.getElementById('debate-send').disabled  = true;
    DEBATE_UI._setThinking(true);

    const result = await GEMINI.proposeTreaty(type);
    DEBATE_UI._setThinking(false);

    const enemy  = GEMINI.game.countries[GEMINI.enemyId];
    const labels = { peace: 'Paz', alliance: 'Alianza', trade: 'Tratado Comercial', aid: 'Ayuda Económica/Militar' };
    DEBATE_UI._addMessage('enemy', result.text, enemy.flag);

    let treatySummary = null;
    if (result.accepted) {
      DEBATE_UI._addMessage('system', `✅ ¡${enemy.name} ACEPTÓ la propuesta de ${labels[type]}!`);
      treatySummary = GEMINI.applyTreatyResult(GEMINI.game, GEMINI.enemyId, type, true)?.summary || null;
    } else {
      DEBATE_UI._addMessage('system', `❌ ${enemy.name} rechazó la propuesta de ${labels[type]}.`);
      GEMINI.applyTreatyResult(GEMINI.game, GEMINI.enemyId, type, false);
    }
    UI.refresh();
    MAP.colorAll();
    setTimeout(() => DEBATE_UI.close(treatySummary), 2000);
  },

  _addMessage(role, text, flag = '') {
    const el  = document.createElement('div');
    el.className = `debate-msg debate-${role}`;
    el.innerHTML = flag
      ? `<span class="debate-flag">${flag}</span><div class="debate-bubble">${text}</div>`
      : `<div class="debate-bubble">${text}</div>`;
    const msgs = document.getElementById('debate-messages');
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
  },

  _setThinking(on) {
    const el = document.getElementById('debate-thinking');
    if (el) el.classList.toggle('hidden', !on);
  },
};

// ============================================================
// PRESS CONFERENCE — 100% local, no API required
// ============================================================
const PRESS_CONF = (function () {
  let _game = null;
  let _qNum = 0;
  let _mood = 50;
  let _totalEffect = 0;
  const MAX_Q = 3;

  const JOURNALISTS = [
    { name: 'CNN Internacional', icon: '📰' },
    { name: 'Reuters Global',    icon: '📡' },
    { name: 'BBC Mundo',         icon: '🎙️' },
    { name: 'France 24',         icon: '📺' },
    { name: 'Al Jazeera',        icon: '🌍' },
    { name: 'El País',           icon: '🗞️' },
  ];

  function _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function _rndN(min, max) { return Math.round(Math.random() * (max - min) + min); }

  function _buildQuestions(game) {
    const pc = game.countries[game.playerCountryId];
    const warWith = pc.atWar.map(function(id) { return game.countries[id] && game.countries[id].name; }).filter(Boolean);
    const hasWar = warWith.length > 0;
    const highTax = game.taxRate >= 4;
    const groups = (game.armedGroups || []).length;
    const lowStab = pc.stability < 40;
    const TAX_LABEL = ['', 'mínimos', 'normales', 'altos', 'muy altos', 'extremos'][game.taxRate] || 'normales';
    const warStr = warWith.join(' y ');

    var pool = [];
    if (hasWar) {
      pool.push('Presidente, los muertos en el conflicto con ' + warStr + ' van en aumento. ¿Cuándo terminará la guerra y cuál es su estrategia de salida?');
      pool.push('¿Puede garantizar que la guerra con ' + warStr + ' no arruinará la economía nacional?');
      pool.push('Señor presidente, la oposición acusa que la guerra con ' + warStr + ' es innecesaria. ¿Cómo responde?');
    }
    if (highTax) {
      pool.push('Los impuestos ' + TAX_LABEL + ' están asfixiando a las familias. ¿Hasta cuándo mantendrá esta política?');
      pool.push('La ciudadanía protesta contra la carga fiscal. ¿Cómo justifica los impuestos ' + TAX_LABEL + '?');
    }
    if (groups > 0) {
      pool.push('Hay grupos armados activos en el territorio. ¿Ha perdido usted el control de la situación?');
      pool.push('¿Puede garantizar la seguridad de los ciudadanos ante los grupos rebeldes que operan libremente?');
    }
    if (lowStab) {
      pool.push('La estabilidad del país está en mínimos históricos. ¿Qué hará para recuperar la confianza del pueblo?');
      pool.push('Las encuestas muestran una aprobación catastrófica. ¿Considera renunciar?');
    }
    // General questions always available
    pool.push('Presidente, ¿cuáles son sus tres prioridades concretas para los próximos meses?');
    pool.push('La economía necesita reformas urgentes. ¿Cuándo actuará su gobierno?');
    pool.push('¿Cómo evalúa su propia gestión y qué cambiaría de sus decisiones recientes?');
    pool.push('¿Qué mensaje le da a los ciudadanos que han perdido la confianza en su liderazgo?');
    pool.push('Presidente, ¿puede comprometerse hoy con alguna medida concreta que beneficie al pueblo?');
    return pool;
  }

  function _evaluate(answer) {
    var a = answer.toLowerCase();
    var positiveWords = ['comprometo', 'aseguro', 'garantizo', 'mejorar', 'trabajar', 'juntos', 'pueblo', 'solución', 'plan', 'acción', 'invertir', 'proteger', 'vamos', 'lograr'];
    var negativeWords = ['no sé', 'no puedo', 'imposible', 'tal vez', 'quizás', 'difícil', 'no tengo', 'error', 'culpa'];
    var evasiveWords = ['ya veremos', 'en su momento', 'lo estudiaremos', 'depende'];

    var pos = positiveWords.filter(function(w) { return a.includes(w); }).length;
    var neg = negativeWords.filter(function(w) { return a.includes(w); }).length;
    var eva = evasiveWords.filter(function(w) { return a.includes(w); }).length;
    var longAnswer = answer.trim().split(' ').length >= 10;

    var score = pos * 2 - neg * 3 - eva * 2 + (longAnswer ? 2 : -1);

    var moodDelta, stabilityDelta, reaction;
    if (score >= 4) {
      moodDelta = _rndN(10, 20);
      stabilityDelta = _rndN(3, 6);
      reaction = _pick([
        'Los aplausos llenan la sala. Los periodistas asienten con aprobación.',
        'Respuesta sólida y convincente. La sala queda satisfecha.',
        'El presidente muestra firmeza. El público reacciona positivamente.',
        'Gran discurso. Los periodistas anotan con entusiasmo.',
      ]);
    } else if (score >= 0) {
      moodDelta = _rndN(-5, 8);
      stabilityDelta = _rndN(-2, 2);
      reaction = _pick([
        'Reacción tibia. El público escucha sin entusiasmo ni rechazo.',
        'Respuesta moderada. Los periodistas no quedan del todo convencidos.',
        'La sala permanece cautelosa. Aplausos educados.',
        'Respuesta aceptable pero sin convicción notable.',
      ]);
    } else {
      moodDelta = _rndN(-20, -8);
      stabilityDelta = _rndN(-6, -2);
      reaction = _pick([
        'Murmullo de desaprobación. Varios periodistas fruncen el ceño.',
        'La sala reacciona negativamente. Silencio incómodo.',
        'Abucheos dispersos desde el fondo. La rueda de prensa se tensa.',
        'El público no queda convencido. Se escuchan protestas.',
      ]);
    }
    return { moodDelta: moodDelta, stabilityDelta: stabilityDelta, reaction: reaction };
  }

  function _updateMoodBar() {
    var fill = document.getElementById('pressconf-mood-fill');
    if (!fill) return;
    fill.style.width = _mood + '%';
    fill.style.background = _mood >= 60
      ? 'linear-gradient(90deg,#3dba6f,#5de882)'
      : _mood >= 35
        ? 'linear-gradient(90deg,#c9a227,#e8c444)'
        : 'linear-gradient(90deg,#d94f4f,#f07070)';
  }

  function _showQuestion(question) {
    document.getElementById('pressconf-question-text').textContent = question;
    document.getElementById('pressconf-reaction').classList.add('hidden');
    document.getElementById('pressconf-input').value = '';
    document.getElementById('pressconf-input').disabled = false;
    document.getElementById('pressconf-send').disabled = false;
    document.getElementById('pressconf-input').focus();
  }

  var _questions = [];

  function open(game) {
    if (!game) return;
    _game = game;
    _qNum = 0;
    _totalEffect = 0;
    var pc = game.countries[game.playerCountryId];
    _mood = Math.round(50 + (pc.stability - 50) * 0.3);

    // Build question pool and pick MAX_Q unique ones
    var pool = _buildQuestions(game);
    _questions = [];
    var used = {};
    while (_questions.length < MAX_Q && _questions.length < pool.length) {
      var idx = Math.floor(Math.random() * pool.length);
      if (!used[idx]) { used[idx] = true; _questions.push(pool[idx]); }
    }

    // Setup DOM
    document.getElementById('pressconf-flag').textContent = pc.flag;
    document.getElementById('pressconf-leader-name').textContent = pc.name.toUpperCase();
    document.getElementById('pressconf-reaction').classList.add('hidden');
    document.getElementById('pressconf-overlay').classList.remove('hidden');
    _updateMoodBar();
    if (window.TIMER) window.TIMER.pause();
    game._monthsSinceConf = 0;

    // Wire send button
    var sendBtn = document.getElementById('pressconf-send');
    var inp = document.getElementById('pressconf-input');
    sendBtn.onclick = function () { _answer(); };
    inp.onkeydown = function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _answer(); }
    };

    _nextQuestion();
  }

  function _nextQuestion() {
    _qNum++;
    document.getElementById('pressconf-q-num').textContent = _qNum;
    var j = _pick(JOURNALISTS);
    document.getElementById('pressconf-journalist-icon').textContent = j.icon;
    document.getElementById('pressconf-journalist-name').textContent = j.name;
    _showQuestion(_questions[_qNum - 1] || '¿Qué mensaje le da al pueblo hoy?');
  }

  function _answer() {
    var inp = document.getElementById('pressconf-input');
    var answer = inp.value.trim();
    if (!answer) return;

    document.getElementById('pressconf-send').disabled = true;
    inp.disabled = true;

    var ev = _evaluate(answer);
    _mood = Math.max(0, Math.min(100, _mood + ev.moodDelta));
    _totalEffect += ev.stabilityDelta;
    _updateMoodBar();

    var reactionEl = document.getElementById('pressconf-reaction');
    reactionEl.textContent = ev.reaction;
    reactionEl.className = ev.moodDelta > 3 ? 'positive' : ev.moodDelta < -3 ? 'negative' : 'neutral';

    if (_qNum >= MAX_Q) {
      setTimeout(function () { _end(); }, 1500);
    } else {
      setTimeout(function () { _nextQuestion(); }, 2000);
    }
  }

  function _end() {
    var game = _game;
    if (!game) return;
    var pc = game.countries[game.playerCountryId];
    var effect = Math.round(_totalEffect);
    pc.stability = Math.max(0, Math.min(100, pc.stability + effect));
    var moodLabel = _mood >= 60 ? '👏 Positiva' : _mood >= 35 ? '😐 Neutral' : '😤 Negativa';
    game.addLog('🎙️ Conferencia finalizada. Estabilidad ' + (effect >= 0 ? '+' : '') + effect + '. Audiencia: ' + moodLabel + '.', effect >= 0 ? 'success' : 'warning');

    var reactionEl = document.getElementById('pressconf-reaction');
    reactionEl.textContent = 'La conferencia ha concluido. Efecto en estabilidad: ' + (effect >= 0 ? '+' : '') + effect + '. Audiencia: ' + moodLabel;
    reactionEl.className = effect >= 0 ? 'positive' : 'negative';

    document.getElementById('pressconf-input').disabled = true;
    document.getElementById('pressconf-send').disabled = true;

    if (typeof UI !== 'undefined') {
      UI.showToast('🎙️ Conferencia finalizada. Estabilidad ' + (effect >= 0 ? '+' : '') + effect + '.', effect >= 0 ? 'success' : 'warning');
      setTimeout(function () { UI.refresh(); }, 100);
    }
    setTimeout(function () {
      document.getElementById('pressconf-overlay').classList.add('hidden');
      if (window.TIMER) window.TIMER.resume();
      _game = null;
    }, 3000);
  }

  return { open: open };
}());
