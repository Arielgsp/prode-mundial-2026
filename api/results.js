/**
 * /api/results.js — Vercel Serverless Function
 *
 * Proxy entre el frontend y API-Football.
 * Oculta la API key del cliente. Agrega cache de 60s.
 *
 * Variables de entorno requeridas en Vercel:
 *   API_FOOTBALL_KEY = tu_key_de_api-sports.io
 *
 * Endpoint: GET /api/results
 */

// Mapeo de nombres de equipo (API-Football → nuestros nombres internos)
// API-Football usa nombres en inglés; los ajustamos a nuestra app
const TEAM_NAME_MAP = {
  // Grupo A
  "Mexico": "México",
  "South Korea": "Corea del Sur",
  "South Africa": "Sudáfrica",
  "Czech Republic": "Rep. Checa",
  // Grupo B
  "Canada": "Canadá",
  "Switzerland": "Suiza",
  "Qatar": "Qatar",
  "Bosnia": "Bosnia y Herz.",
  // Grupo C
  "Brazil": "Brasil",
  "Morocco": "Marruecos",
  "Scotland": "Escocia",
  "Haiti": "Haití",
  // Grupo D
  "USA": "EE.UU.",
  "United States": "EE.UU.",
  "Australia": "Australia",
  "Paraguay": "Paraguay",
  "Turkey": "Turquía",
  "Türkiye": "Turquía",
  // Grupo E
  "Germany": "Alemania",
  "Ecuador": "Ecuador",
  "Ivory Coast": "Costa de Marfil",
  "Cote d'Ivoire": "Costa de Marfil",
  "Curacao": "Curazao",
  // Grupo F
  "Netherlands": "Países Bajos",
  "Japan": "Japón",
  "Tunisia": "Túnez",
  "Sweden": "Suecia",
  // Grupo G
  "Belgium": "Bélgica",
  "Iran": "Irán",
  "Egypt": "Egipto",
  "New Zealand": "Nueva Zelanda",
  // Grupo H
  "Spain": "España",
  "Uruguay": "Uruguay",
  "Cape Verde": "Cabo Verde",
  "Saudi Arabia": "Arabia Saudita",
  // Grupo I
  "France": "Francia",
  "Senegal": "Senegal",
  "Norway": "Noruega",
  "Iraq": "Iraq",
  // Grupo J
  "Argentina": "Argentina",
  "Algeria": "Argelia",
  "Austria": "Austria",
  "Jordan": "Jordania",
  // Grupo K
  "Portugal": "Portugal",
  "Colombia": "Colombia",
  "Uzbekistan": "Uzbekistán",
  "DR Congo": "RD Congo",
  "Congo DR": "RD Congo",
  // Grupo L
  "England": "Inglaterra",
  "Croatia": "Croacia",
  "Panama": "Panamá",
  "Ghana": "Ghana",
};

// Fixture de partidos: [nuestroId, local, visitante]
// Usamos esto para hacer el match de equipos → ID interno
const FIXTURES = [
  ["G1","México","Sudáfrica"],["G2","Corea del Sur","Rep. Checa"],
  ["G3","Rep. Checa","Sudáfrica"],["G4","México","Corea del Sur"],
  ["G5","Rep. Checa","México"],["G6","Sudáfrica","Corea del Sur"],
  ["G7","Canadá","Bosnia y Herz."],["G8","Qatar","Suiza"],
  ["G9","Suiza","Bosnia y Herz."],["G10","Canadá","Qatar"],
  ["G11","Suiza","Canadá"],["G12","Bosnia y Herz.","Qatar"],
  ["G13","Brasil","Marruecos"],["G14","Haití","Escocia"],
  ["G15","Escocia","Marruecos"],["G16","Brasil","Haití"],
  ["G17","Escocia","Brasil"],["G18","Marruecos","Haití"],
  ["G19","EE.UU.","Paraguay"],["G20","Australia","Turquía"],
  ["G21","Turquía","Paraguay"],["G22","EE.UU.","Australia"],
  ["G23","Turquía","EE.UU."],["G24","Paraguay","Australia"],
  ["G25","Alemania","Curazao"],["G26","Costa de Marfil","Ecuador"],
  ["G27","Alemania","Costa de Marfil"],["G28","Ecuador","Curazao"],
  ["G29","Ecuador","Alemania"],["G30","Curazao","Costa de Marfil"],
  ["G31","Países Bajos","Japón"],["G32","Suecia","Túnez"],
  ["G33","Países Bajos","Suecia"],["G34","Túnez","Japón"],
  ["G35","Japón","Suecia"],["G36","Túnez","Países Bajos"],
  ["G37","Irán","Nueva Zelanda"],["G38","Bélgica","Egipto"],
  ["G39","Bélgica","Irán"],["G40","Nueva Zelanda","Egipto"],
  ["G41","Egipto","Irán"],["G42","Nueva Zelanda","Bélgica"],
  ["G43","España","Cabo Verde"],["G44","Arabia Saudita","Uruguay"],
  ["G45","España","Arabia Saudita"],["G46","Uruguay","Cabo Verde"],
  ["G47","Cabo Verde","Arabia Saudita"],["G48","Uruguay","España"],
  ["G49","Francia","Senegal"],["G50","Iraq","Noruega"],
  ["G51","Francia","Iraq"],["G52","Noruega","Senegal"],
  ["G53","Noruega","Francia"],["G54","Senegal","Iraq"],
  ["G55","Argentina","Argelia"],["G56","Austria","Jordania"],
  ["G57","Argentina","Austria"],["G58","Jordania","Argelia"],
  ["G59","Argelia","Austria"],["G60","Jordania","Argentina"],
  ["G61","Portugal","RD Congo"],["G62","Uzbekistán","Colombia"],
  ["G63","Portugal","Uzbekistán"],["G64","RD Congo","Colombia"],
  ["G65","Colombia","Portugal"],["G66","RD Congo","Uzbekistán"],
  ["G67","Inglaterra","Croacia"],["G68","Ghana","Panamá"],
  ["G69","Inglaterra","Ghana"],["G70","Panamá","Croacia"],
  ["G71","Panamá","Inglaterra"],["G72","Croacia","Ghana"],
];

// Construir lookup: "LocalVisitante" → matchId
const MATCH_LOOKUP = {};
for (const [id, home, away] of FIXTURES) {
  MATCH_LOOKUP[`${home}|${away}`] = id;
}

function normalizeName(name) {
  return TEAM_NAME_MAP[name] || name;
}

function findMatchId(homeApi, awayApi) {
  const home = normalizeName(homeApi);
  const away = normalizeName(awayApi);
  return MATCH_LOOKUP[`${home}|${away}`] || null;
}

// Cache en memoria (Vercel reutiliza el proceso por ~60s)
let cache = { data: null, ts: 0 };
const CACHE_TTL = 60_000; // 60 segundos

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=30");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // Servir desde cache si es reciente
  if (cache.data && Date.now() - cache.ts < CACHE_TTL) {
    res.status(200).json({ ...cache.data, cached: true });
    return;
  }

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "API_FOOTBALL_KEY not configured" });
    return;
  }

  try {
    // Traer todos los partidos finalizados del Mundial 2026
    const [ftResp, liveResp] = await Promise.all([
      fetch("https://v3.football.api-sports.io/fixtures?league=1&season=2026&status=FT", {
        headers: { "x-apisports-key": apiKey },
      }),
      fetch("https://v3.football.api-sports.io/fixtures?league=1&season=2026&status=LIVE", {
        headers: { "x-apisports-key": apiKey },
      }),
    ]);

    const [ftData, liveData] = await Promise.all([ftResp.json(), liveResp.json()]);

    const allFixtures = [
      ...(ftData.response || []),
      ...(liveData.response || []),
    ];

    const results = [];
    const live = [];

    for (const fixture of allFixtures) {
      const homeApi = fixture.teams?.home?.name;
      const awayApi = fixture.teams?.away?.name;
      const homeGoals = fixture.goals?.home;
      const awayGoals = fixture.goals?.away;
      const status = fixture.fixture?.status?.short;

      if (homeGoals === null || awayGoals === null) continue;

      const matchId = findMatchId(homeApi, awayApi);
      if (!matchId) continue;

      const isLive = ["1H", "HT", "2H", "ET", "P"].includes(status);
      const isFinal = status === "FT";

      if (isFinal) {
        results.push({ id: matchId, home: homeGoals, away: awayGoals });
      } else if (isLive) {
        live.push({ id: matchId, home: homeGoals, away: awayGoals, status });
      }
    }

    const response = {
      results,        // Partidos finalizados
      live,           // Partidos en curso (para mostrar al usuario, no puntuar)
      updated_at: new Date().toISOString(),
      source: "api-football",
      requests_used: ftData.results + liveData.results,
    };

    cache = { data: response, ts: Date.now() };
    res.status(200).json(response);

  } catch (err) {
    console.error("API-Football error:", err);
    res.status(500).json({ error: err.message });
  }
}
