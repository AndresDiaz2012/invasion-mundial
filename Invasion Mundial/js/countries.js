// ============================================================
// COUNTRIES.JS - DOMINIO GLOBAL
// All country data definitions
// ============================================================

const COUNTRIES = {

  // ── AMÉRICA DEL NORTE ─────────────────────────────────────
  usa: {
    name: 'Estados Unidos', flag: '🇺🇸', region: 'América del Norte',
    economy: 95, military: 100, stability: 72, espionage: 88, resources: 70,
    population: 335, gdp: 25000,
    bonus: 'Superpotencia Global', bonusDesc: 'Costos militares reducidos 20%.',
    bonusEffect: 'military_cost_0.8', personality: 'expansionist',
    startingRelations: {
      canada: 85, uk: 82, germany: 75, france: 73, australia: 80, japan: 70,
      south_korea: 68, israel: 75, colombia: 55, spain: 50, italy: 52, poland: 65,
      russia: -30, china: -15, iran: -80, north_korea: -95, venezuela: -75, cuba: -85
    }
  },
  canada: {
    name: 'Canadá', flag: '🇨🇦', region: 'América del Norte',
    economy: 78, military: 55, stability: 88, espionage: 60, resources: 85,
    population: 38, gdp: 2100,
    bonus: 'Recursos Naturales', bonusDesc: 'Ingresos por recursos +30%.',
    bonusEffect: 'resource_income_1.3', personality: 'diplomatic',
    startingRelations: {
      usa: 85, uk: 78, france: 72, germany: 65, australia: 70,
      russia: -10, iran: -30
    }
  },
  mexico: {
    name: 'México', flag: '🇲🇽', region: 'América del Norte',
    economy: 52, military: 40, stability: 48, espionage: 35, resources: 60,
    population: 130, gdp: 1300,
    bonus: 'Economía Emergente', bonusDesc: 'Crecimiento económico acelerado +20%.',
    bonusEffect: 'economy_boost_1.2', personality: 'neutral',
    startingRelations: {
      usa: 45, colombia: 38, spain: 45, brazil: 35, argentina: 30, cuba: 30,
      russia: -10
    }
  },

  // ── AMÉRICA CENTRAL ───────────────────────────────────────
  cuba: {
    name: 'Cuba', flag: '🇨🇺', region: 'América Central',
    economy: 22, military: 42, stability: 55, espionage: 68, resources: 28,
    population: 11, gdp: 110,
    bonus: 'Resistencia', bonusDesc: 'Defensa +40% en territorio propio. Alta moral bajo presión.',
    bonusEffect: 'defense_boost_1.4', personality: 'defensive',
    startingRelations: {
      russia: 60, venezuela: 65, iran: 35, china: 42, mexico: 30,
      usa: -85, uk: -40, germany: -30, france: -25
    }
  },

  // ── AMÉRICA DEL SUR ────────────────────────────────────────
  venezuela: {
    name: 'Venezuela', flag: '🇻🇪', region: 'América del Sur',
    economy: 25, military: 35, stability: 18, espionage: 30, resources: 80,
    population: 28, gdp: 270,
    bonus: 'Mayor Reserva de Petróleo', bonusDesc: 'Ingresos por petróleo x2. Pero estabilidad frágil.',
    bonusEffect: 'oil_income_2.0', personality: 'aggressive',
    startingRelations: {
      cuba: 65, russia: 55, iran: 42, china: 38, nicaragua: 55,
      usa: -75, colombia: -30, brazil: -15, argentina: 10
    }
  },
  colombia: {
    name: 'Colombia', flag: '🇨🇴', region: 'América del Sur',
    economy: 50, military: 45, stability: 42, espionage: 55, resources: 55,
    population: 52, gdp: 320,
    bonus: 'Megabiodiversidad', bonusDesc: 'Diversificación de recursos: ingresos +30%.',
    bonusEffect: 'resource_income_1.3', personality: 'diplomatic',
    startingRelations: {
      usa: 55, brazil: 40, peru: 38, spain: 35, mexico: 38,
      venezuela: -30, russia: -20
    }
  },
  brazil: {
    name: 'Brasil', flag: '🇧🇷', region: 'América del Sur',
    economy: 58, military: 52, stability: 48, espionage: 38, resources: 95,
    population: 215, gdp: 1900,
    bonus: 'Abundancia de Recursos', bonusDesc: 'Ingresos por recursos x1.5.',
    bonusEffect: 'resource_income_1.5', personality: 'neutral',
    startingRelations: {
      argentina: 52, colombia: 40, chile: 42, peru: 38, mexico: 35,
      usa: 28, germany: 40, venezuela: -15
    }
  },
  argentina: {
    name: 'Argentina', flag: '🇦🇷', region: 'América del Sur',
    economy: 40, military: 38, stability: 38, espionage: 30, resources: 70,
    population: 46, gdp: 630,
    bonus: 'Reservas Estratégicas', bonusDesc: 'Recursos agrícolas abundantes. Ingresos +15%.',
    bonusEffect: 'economy_boost_1.15', personality: 'neutral',
    startingRelations: {
      brazil: 52, chile: 48, uruguay: 55, colombia: 35, spain: 45,
      usa: 20, uk: 15
    }
  },
  chile: {
    name: 'Chile', flag: '🇨🇱', region: 'América del Sur',
    economy: 63, military: 40, stability: 68, espionage: 40, resources: 62,
    population: 19, gdp: 320,
    bonus: 'Cobre del Mundo', bonusDesc: 'Mayor exportador de cobre. Recursos +40%.',
    bonusEffect: 'resource_income_1.4', personality: 'diplomatic',
    startingRelations: {
      usa: 45, brazil: 42, argentina: 48, peru: 35, colombia: 40,
      germany: 38, spain: 40
    }
  },
  peru: {
    name: 'Perú', flag: '🇵🇪', region: 'América del Sur',
    economy: 48, military: 35, stability: 45, espionage: 32, resources: 65,
    population: 33, gdp: 240,
    bonus: 'Riqueza Andina', bonusDesc: 'Litio, plata y oro. Ingresos por recursos +30%.',
    bonusEffect: 'resource_income_1.3', personality: 'neutral',
    startingRelations: {
      brazil: 38, colombia: 38, chile: 35, usa: 35, spain: 35
    }
  },

  // ── EUROPA ────────────────────────────────────────────────
  uk: {
    name: 'Reino Unido', flag: '🇬🇧', region: 'Europa',
    economy: 80, military: 72, stability: 78, espionage: 85, resources: 35,
    population: 67, gdp: 3100,
    bonus: 'Red de Inteligencia Global', bonusDesc: 'Éxito de operaciones spy +25%.',
    bonusEffect: 'spy_success_1.25', personality: 'diplomatic',
    startingRelations: {
      usa: 82, canada: 78, australia: 80, france: 72, germany: 74, israel: 55,
      spain: 55, italy: 50, poland: 58,
      russia: -35, iran: -55, north_korea: -70, venezuela: -35
    }
  },
  germany: {
    name: 'Alemania', flag: '🇩🇪', region: 'Europa',
    economy: 88, military: 65, stability: 85, espionage: 60, resources: 38,
    population: 84, gdp: 4100,
    bonus: 'Industria Avanzada', bonusDesc: 'Ingresos económicos +20%.',
    bonusEffect: 'economy_boost_1.2', personality: 'diplomatic',
    startingRelations: {
      france: 85, uk: 74, usa: 75, canada: 65, japan: 60, poland: 60,
      spain: 62, italy: 65, turkey: 35,
      russia: -25, iran: -45, north_korea: -60
    }
  },
  france: {
    name: 'Francia', flag: '🇫🇷', region: 'Europa',
    economy: 78, military: 73, stability: 62, espionage: 72, resources: 42,
    population: 68, gdp: 2900,
    bonus: 'Influencia Diplomática', bonusDesc: 'Costos diplomáticos -20%.',
    bonusEffect: 'diplomacy_cost_0.8', personality: 'diplomatic',
    startingRelations: {
      germany: 85, uk: 72, canada: 72, usa: 73, spain: 70, italy: 72,
      russia: -15, iran: -30, north_korea: -55
    }
  },
  spain: {
    name: 'España', flag: '🇪🇸', region: 'Europa',
    economy: 63, military: 48, stability: 58, espionage: 45, resources: 28,
    population: 47, gdp: 1450,
    bonus: 'Hispanidad', bonusDesc: 'Influencia cultural en toda Latinoamérica. Diplomacia -20%.',
    bonusEffect: 'diplomacy_cost_0.8', personality: 'diplomatic',
    startingRelations: {
      france: 70, germany: 62, uk: 55, italy: 60, usa: 50,
      mexico: 45, argentina: 40, colombia: 35, chile: 40, brazil: 40,
      russia: -15
    }
  },
  italy: {
    name: 'Italia', flag: '🇮🇹', region: 'Europa',
    economy: 60, military: 45, stability: 45, espionage: 50, resources: 22,
    population: 59, gdp: 2100,
    bonus: 'Potencia Cultural', bonusDesc: 'Turismo masivo e industria cultural. Economía +15%.',
    bonusEffect: 'economy_boost_1.15', personality: 'opportunistic',
    startingRelations: {
      france: 72, germany: 65, usa: 52, uk: 48, spain: 60,
      russia: -10, iran: -25
    }
  },
  poland: {
    name: 'Polonia', flag: '🇵🇱', region: 'Europa',
    economy: 58, military: 55, stability: 62, espionage: 42, resources: 30,
    population: 38, gdp: 700,
    bonus: 'Escudo del Este', bonusDesc: 'Defensa reforzada en flanco oriental. Defensa +40%.',
    bonusEffect: 'defense_boost_1.4', personality: 'defensive',
    startingRelations: {
      germany: 60, usa: 65, uk: 58, ukraine: 68, france: 52,
      russia: -60, belarus: -30
    }
  },
  russia: {
    name: 'Rusia', flag: '🇷🇺', region: 'Europa',
    economy: 60, military: 92, stability: 52, espionage: 92, resources: 98,
    population: 145, gdp: 1800,
    bonus: 'Arsenal Nuclear', bonusDesc: 'Disuasión nuclear: enemigos dudan antes de atacar.',
    bonusEffect: 'nuclear_deterrence', personality: 'aggressive',
    startingRelations: {
      china: 55, india: 38, iran: 48, north_korea: 35, venezuela: 55, cuba: 60,
      usa: -30, uk: -38, germany: -25, france: -15, ukraine: -75, poland: -60
    }
  },
  ukraine: {
    name: 'Ucrania', flag: '🇺🇦', region: 'Europa',
    economy: 28, military: 48, stability: 22, espionage: 38, resources: 55,
    population: 44, gdp: 180,
    bonus: 'Resistencia Nacional', bonusDesc: 'Defensa +40% en territorio propio.',
    bonusEffect: 'defense_boost_1.4', personality: 'defensive',
    startingRelations: {
      usa: 65, uk: 58, germany: 55, france: 50, poland: 68, canada: 52,
      russia: -85
    }
  },
  turkey: {
    name: 'Turquía', flag: '🇹🇷', region: 'Europa',
    economy: 55, military: 65, stability: 42, espionage: 55, resources: 32,
    population: 85, gdp: 900,
    bonus: 'Puente de Civilizaciones', bonusDesc: 'Control estratégico del Bósforo. Economía +15%.',
    bonusEffect: 'economy_boost_1.15', personality: 'opportunistic',
    startingRelations: {
      usa: 30, germany: 35, france: 28, uk: 30, saudi_arabia: 35,
      russia: -20, iran: 15, israel: -22, greece: -30
    }
  },

  // ── MEDIO ORIENTE ─────────────────────────────────────────
  iran: {
    name: 'Irán', flag: '🇮🇷', region: 'Medio Oriente',
    economy: 38, military: 58, stability: 38, espionage: 72, resources: 82,
    population: 88, gdp: 650,
    bonus: 'Petróleo y Proxies', bonusDesc: 'Operaciones de espionaje 30% más baratas.',
    bonusEffect: 'spy_cost_0.7', personality: 'aggressive',
    startingRelations: {
      russia: 45, china: 32, venezuela: 42, cuba: 35,
      usa: -82, israel: -92, saudi_arabia: -55, uk: -52
    }
  },
  israel: {
    name: 'Israel', flag: '🇮🇱', region: 'Medio Oriente',
    economy: 65, military: 78, stability: 62, espionage: 95, resources: 15,
    population: 9, gdp: 520,
    bonus: 'Mossad', bonusDesc: 'Espionaje: éxito +40%, riesgo de descubrimiento -30%.',
    bonusEffect: 'mossad', personality: 'defensive',
    startingRelations: {
      usa: 75, uk: 55, germany: 50, canada: 48,
      iran: -92, russia: -25, north_korea: -60, turkey: -22
    }
  },
  saudi_arabia: {
    name: 'Arabia Saudita', flag: '🇸🇦', region: 'Medio Oriente',
    economy: 70, military: 55, stability: 55, espionage: 58, resources: 100,
    population: 35, gdp: 1050,
    bonus: 'El Mayor Petróleo', bonusDesc: 'Ingresos de recursos x2.',
    bonusEffect: 'oil_income_2.0', personality: 'opportunistic',
    startingRelations: {
      usa: 55, uk: 48, france: 42, pakistan: 60, turkey: 35,
      iran: -58, israel: -28
    }
  },
  egypt: {
    name: 'Egipto', flag: '🇪🇬', region: 'Medio Oriente',
    economy: 38, military: 52, stability: 38, espionage: 45, resources: 38,
    population: 105, gdp: 480,
    bonus: 'Canal de Suez', bonusDesc: 'Control del 12% del comercio mundial. Economía +15%.',
    bonusEffect: 'economy_boost_1.15', personality: 'opportunistic',
    startingRelations: {
      usa: 35, russia: 30, saudi_arabia: 45, china: 28,
      israel: -20, iran: -35
    }
  },

  // ── ASIA ──────────────────────────────────────────────────
  china: {
    name: 'China', flag: '🇨🇳', region: 'Asia',
    economy: 90, military: 87, stability: 68, espionage: 88, resources: 62,
    population: 1400, gdp: 17500,
    bonus: 'Motor Industrial', bonusDesc: 'Ingresos x1.35, ejército más barato.',
    bonusEffect: 'industrial_powerhouse', personality: 'expansionist',
    startingRelations: {
      russia: 55, north_korea: 62, pakistan: 65, venezuela: 38, cuba: 42,
      usa: -15, india: -22, japan: -35, south_korea: -10
    }
  },
  japan: {
    name: 'Japón', flag: '🇯🇵', region: 'Asia',
    economy: 87, military: 55, stability: 82, espionage: 65, resources: 18,
    population: 125, gdp: 4300,
    bonus: 'Tecnología de Vanguardia', bonusDesc: 'Nivel tecnológico militar +2.',
    bonusEffect: 'tech_boost_2', personality: 'defensive',
    startingRelations: {
      usa: 72, south_korea: 42, australia: 62, germany: 58,
      china: -32, north_korea: -85, russia: -22
    }
  },
  south_korea: {
    name: 'Corea del Sur', flag: '🇰🇷', region: 'Asia',
    economy: 76, military: 62, stability: 75, espionage: 55, resources: 22,
    population: 52, gdp: 1750,
    bonus: 'Electrónica Global', bonusDesc: 'Ingresos económicos +15%.',
    bonusEffect: 'economy_boost_1.15', personality: 'defensive',
    startingRelations: {
      usa: 70, japan: 42, germany: 50, australia: 52,
      north_korea: -85, china: -10
    }
  },
  north_korea: {
    name: 'Corea del Norte', flag: '🇰🇵', region: 'Asia',
    economy: 8, military: 58, stability: 82, espionage: 68, resources: 28,
    population: 26, gdp: 28,
    bonus: 'Nuclearización Acelerada', bonusDesc: 'Programa nuclear 50% más rápido.',
    bonusEffect: 'nuclear_speed_1.5', personality: 'aggressive',
    startingRelations: {
      china: 62, russia: 30,
      usa: -95, south_korea: -85, japan: -82
    }
  },
  india: {
    name: 'India', flag: '🇮🇳', region: 'Asia',
    economy: 65, military: 72, stability: 58, espionage: 55, resources: 58,
    population: 1420, gdp: 3500,
    bonus: 'Fuerza Laboral Masiva', bonusDesc: 'Costo del ejército -30%.',
    bonusEffect: 'army_cost_0.7', personality: 'opportunistic',
    startingRelations: {
      russia: 40, usa: 35, france: 42,
      pakistan: -72, china: -22
    }
  },
  pakistan: {
    name: 'Pakistán', flag: '🇵🇰', region: 'Asia',
    economy: 35, military: 55, stability: 35, espionage: 45, resources: 35,
    population: 230, gdp: 360,
    bonus: 'Arsenal Estratégico', bonusDesc: 'Armas nucleares tácticas. Disuasión ante grandes potencias.',
    bonusEffect: 'nuclear_tactical', personality: 'neutral',
    startingRelations: {
      china: 65, saudi_arabia: 55,
      india: -72, usa: -15
    }
  },
  indonesia: {
    name: 'Indonesia', flag: '🇮🇩', region: 'Asia del Sudeste',
    economy: 52, military: 48, stability: 52, espionage: 35, resources: 65,
    population: 275, gdp: 1300,
    bonus: 'Archipiélago Estratégico', bonusDesc: 'Control del Estrecho de Malaca. Recursos +30%.',
    bonusEffect: 'resource_income_1.3', personality: 'neutral',
    startingRelations: {
      australia: 28, usa: 35, china: 25, india: 30
    }
  },

  // ── OCEANÍA ───────────────────────────────────────────────
  australia: {
    name: 'Australia', flag: '🇦🇺', region: 'Oceanía',
    economy: 75, military: 55, stability: 80, espionage: 55, resources: 75,
    population: 26, gdp: 1750,
    bonus: 'Nación Recurso', bonusDesc: 'Vastos recursos naturales. Ingresos por recursos x1.5.',
    bonusEffect: 'resource_income_1.5', personality: 'diplomatic',
    startingRelations: {
      usa: 80, uk: 82, canada: 70, japan: 62, south_korea: 55, india: 40,
      china: -10, indonesia: 28
    }
  },

  // ── ÁFRICA ────────────────────────────────────────────────
  nigeria: {
    name: 'Nigeria', flag: '🇳🇬', region: 'África',
    economy: 42, military: 42, stability: 32, espionage: 28, resources: 72,
    population: 220, gdp: 480,
    bonus: 'Petróleo del Atlántico', bonusDesc: 'Vastas reservas de petróleo. Recursos x1.5.',
    bonusEffect: 'resource_income_1.5', personality: 'opportunistic',
    startingRelations: {
      usa: 25, uk: 28, china: 32, south_africa: 38
    }
  },
  ethiopia: {
    name: 'Etiopía', flag: '🇪🇹', region: 'África',
    economy: 32, military: 45, stability: 35, espionage: 25, resources: 52,
    population: 125, gdp: 130,
    bonus: 'Nilo Azul', bonusDesc: 'Control estratégico de recursos hídricos regionales. +30% recursos.',
    bonusEffect: 'resource_income_1.3', personality: 'expansionist',
    startingRelations: {
      china: 40, russia: 25, usa: 20, south_africa: 28
    }
  },
  south_africa: {
    name: 'Sudáfrica', flag: '🇿🇦', region: 'África',
    economy: 48, military: 40, stability: 45, espionage: 32, resources: 78,
    population: 60, gdp: 420,
    bonus: 'Minerales Estratégicos', bonusDesc: 'Diamantes, oro y platino. Recursos +40%.',
    bonusEffect: 'resource_income_1.4', personality: 'diplomatic',
    startingRelations: {
      uk: 30, usa: 25, germany: 28, brazil: 35, china: 22, nigeria: 38, ethiopia: 28
    }
  },
};

// Region display order for the selection screen
const REGIONS = [
  'América del Norte',
  'América Central',
  'América del Sur',
  'Europa',
  'Medio Oriente',
  'Asia',
  'Asia del Sudeste',
  'Oceanía',
  'África',
];
