// ============================================================
// LEADERS.JS - Country leader avatars, moods & personalities
// Inspired by Messenger's character-driven narrative approach
// ============================================================

const LEADERS = {
  usa:          { name: 'James Mitchell',    title: 'Presidente',           avatar: '👨‍💼', personality: 'pragmatic'  },
  china:        { name: 'Wei Zhongshan',     title: 'Secretario General',   avatar: '🧑‍💼', personality: 'strategic'  },
  russia:       { name: 'Viktor Sorokin',    title: 'Presidente',           avatar: '👨‍✈️', personality: 'aggressive' },
  germany:      { name: 'Klaus Richter',     title: 'Canciller',            avatar: '👨‍⚖️', personality: 'diplomatic' },
  france:       { name: 'Jean-Paul Moreau',  title: 'Presidente',           avatar: '🧑‍🎨', personality: 'diplomatic' },
  uk:           { name: 'Elizabeth Harrow',  title: 'Primera Ministra',     avatar: '👩‍💼', personality: 'pragmatic'  },
  japan:        { name: 'Kenji Yamamoto',    title: 'Primer Ministro',      avatar: '🧑‍🔬', personality: 'strategic'  },
  india:        { name: 'Raj Krishnamurthy', title: 'Primer Ministro',      avatar: '👨‍🏫', personality: 'pragmatic'  },
  brazil:       { name: 'Carlos Ferreira',   title: 'Presidente',           avatar: '👨‍🌾', personality: 'charismatic'},
  australia:    { name: 'Sarah Connolly',    title: 'Primera Ministra',     avatar: '👩‍🌾', personality: 'diplomatic' },
  canada:       { name: 'Marc Beaumont',     title: 'Primer Ministro',      avatar: '👨‍🏫', personality: 'diplomatic' },
  mexico:       { name: 'Andrés Sandoval',   title: 'Presidente',           avatar: '👨‍🌾', personality: 'charismatic'},
  argentina:    { name: 'Lucía Gómez',       title: 'Presidenta',           avatar: '👩‍⚖️', personality: 'pragmatic'  },
  saudi_arabia: { name: 'Prince Al-Rashid',  title: 'Rey',                  avatar: '👑',   personality: 'strategic'  },
  iran:         { name: 'Hassan Shirazi',    title: 'Presidente',           avatar: '🧑‍🏫', personality: 'aggressive' },
  turkey:       { name: 'Mehmet Yilmaz',     title: 'Presidente',           avatar: '👨‍⚖️', personality: 'strategic'  },
  south_korea:  { name: 'Kim Ji-Young',      title: 'Presidenta',           avatar: '👩‍💼', personality: 'pragmatic'  },
  indonesia:    { name: 'Budi Santoso',      title: 'Presidente',           avatar: '👨‍🌾', personality: 'charismatic'},
  nigeria:      { name: 'Emeka Okonkwo',     title: 'Presidente',           avatar: '👨‍💼', personality: 'charismatic'},
  south_africa: { name: 'Sipho Dlamini',     title: 'Presidente',           avatar: '👨‍🏫', personality: 'diplomatic' },
  egypt:        { name: 'Omar Farouk',       title: 'Presidente',           avatar: '👨‍⚖️', personality: 'strategic'  },
  israel:       { name: 'Miriam Cohen',      title: 'Primera Ministra',     avatar: '👩‍💼', personality: 'strategic'  },
  ukraine:      { name: 'Oleksiy Marchenko', title: 'Presidente',           avatar: '👨‍💼', personality: 'pragmatic'  },
  poland:       { name: 'Piotr Kowalski',    title: 'Primer Ministro',      avatar: '👨‍⚖️', personality: 'diplomatic' },
  spain:        { name: 'Isabel Ramírez',    title: 'Presidenta',           avatar: '👩‍💼', personality: 'diplomatic' },
  italy:        { name: 'Marco Rossi',       title: 'Primer Ministro',      avatar: '🧑‍🎨', personality: 'charismatic'},
  north_korea:  { name: 'Supreme Leader',    title: 'Líder Supremo',        avatar: '👤',   personality: 'aggressive' },
  pakistan:     { name: 'Imran Qureshi',     title: 'Primer Ministro',      avatar: '👨‍⚖️', personality: 'strategic'  },
  vietnam:      { name: 'Nguyen Van Minh',   title: 'Primer Ministro',      avatar: '👨‍🌾', personality: 'pragmatic'  },
  thailand:     { name: 'Chaiwat Suksri',    title: 'Primer Ministro',      avatar: '👨‍🏫', personality: 'diplomatic' },
  colombia:     { name: 'Diego Herrera',     title: 'Presidente',           avatar: '👨‍🌾', personality: 'charismatic'},
  venezuela:    { name: 'Rafael Morales',    title: 'Presidente',           avatar: '🧑‍💼', personality: 'aggressive' },
  chile:        { name: 'Valentina Cruz',    title: 'Presidenta',           avatar: '👩‍🌾', personality: 'pragmatic'  },
  peru:         { name: 'Jorge Mamani',      title: 'Presidente',           avatar: '👨‍🌾', personality: 'pragmatic'  },
  ethiopia:     { name: 'Abebe Tadesse',     title: 'Primer Ministro',      avatar: '👨‍🏫', personality: 'diplomatic' },
  kenya:        { name: 'Grace Wanjiru',     title: 'Presidenta',           avatar: '👩‍💼', personality: 'diplomatic' },
  _default:     { name: 'Líder Nacional',    title: 'Jefe de Estado',       avatar: '👤',   personality: 'pragmatic'  },
};

// Mood system: returns emoji + label based on game state
function getLeaderMood(state) {
  const pc = state.countries[state.playerCountryId];
  const atWar = pc.atWar?.length > 0;
  const stability = pc.stability;
  const treasury = state.treasury;

  if (atWar && stability < 30) return { emoji: '😱', label: 'Desesperado', color: '#d94f4f' };
  if (atWar)                    return { emoji: '😤', label: 'En Guerra',   color: '#ff6b35' };
  if (stability < 20)           return { emoji: '😰', label: 'En Crisis',   color: '#d94f4f' };
  if (stability < 40)           return { emoji: '😟', label: 'Preocupado',  color: '#c9a227' };
  if (treasury < 0)             return { emoji: '😬', label: 'Endeudado',   color: '#c9a227' };
  if (stability > 75 && treasury > 500) return { emoji: '😎', label: 'Próspero', color: '#3dba6f' };
  if (stability > 60)           return { emoji: '😊', label: 'Satisfecho',  color: '#3dba6f' };
  return                               { emoji: '😐', label: 'Neutral',     color: '#8899aa' };
}

function getLeader(countryId) {
  return LEADERS[countryId] || LEADERS._default;
}

// Personality quips shown on mood hover
const PERSONALITY_QUIPS = {
  pragmatic:   ['Tomemos decisiones prácticas.', 'Hay que ser realistas.', 'Lo que funciona, funciona.'],
  strategic:   ['Cada movida cuenta.', 'Pensemos a largo plazo.', 'El tablero es nuestro.'],
  aggressive:  ['¡Mostremos nuestra fuerza!', 'Los débiles pagan el precio.', '¡Nadie nos detiene!'],
  diplomatic:  ['El diálogo es nuestra arma.', 'Preferimos aliados a enemigos.', 'La paz se construye.'],
  charismatic: ['¡El pueblo nos apoya!', '¡Juntos somos invencibles!', 'La historia nos recuerda.'],
};

function getLeaderQuip(countryId) {
  const leader = getLeader(countryId);
  const quips = PERSONALITY_QUIPS[leader.personality] || PERSONALITY_QUIPS.pragmatic;
  return quips[Math.floor(Math.random() * quips.length)];
}

// ── NATIONAL OBJECTIVES ───────────────────────────────────────
// These adapt to the player country and track game progression

function buildObjectives(state) {
  const pc = state.countries[state.playerCountryId];
  const isLarge = pc.gdp > 1000;
  const isMilitary = pc.military > 70;

  return [
    {
      id: 'treasury_goal',
      label: 'Acumular tesoro',
      target: isLarge ? 2000 : 800,
      icon: '💰',
      check: (s) => s.treasury,
      format: (v, t) => `$${Math.round(v)}B / $${t}B`,
    },
    {
      id: 'stability_goal',
      label: 'Aprobación popular',
      target: 75,
      icon: '📊',
      check: (s) => s.countries[s.playerCountryId].stability,
      format: (v, t) => `${Math.round(v)}% / ${t}%`,
    },
    {
      id: 'alliances_goal',
      label: 'Formar alianzas',
      target: isMilitary ? 3 : 5,
      icon: '🤝',
      check: (s) => s.countries[s.playerCountryId].allies?.length || 0,
      format: (v, t) => `${v} / ${t}`,
    },
    {
      id: 'economy_goal',
      label: 'Economía nacional',
      target: 80,
      icon: '📈',
      check: (s) => s.countries[s.playerCountryId].economy,
      format: (v, t) => `${Math.round(v)} / ${t}`,
    },
    {
      id: 'military_goal',
      label: 'Poder militar',
      target: isMilitary ? 90 : 70,
      icon: '⚔️',
      check: (s) => s.countries[s.playerCountryId].military,
      format: (v, t) => `${Math.round(v)} / ${t}`,
    },
  ];
}
