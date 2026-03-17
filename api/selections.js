const AVAILABLE_SEASON_YEARS = [2025, 2026];
const DEFAULT_SEASON_YEAR = 2025;

const MAJOR_DEFINITIONS = [
  { key: 'masters' },
  { key: 'pga' },
  { key: 'us_open' },
  { key: 'the_open' }
];

const TEAM_DEFINITIONS = [
  {
    name: 'Sean',
    players: [
      { name: 'Rory McIlroy' },
      { name: 'Jon Rahm' },
      { name: 'Russell Henley' },
      { name: 'Victor Hovland', aliases: ['Viktor Hovland'] },
      { name: 'Tony Finau' },
      { name: 'Joaquin Niemann' }
    ]
  },
  {
    name: 'Lia',
    players: [
      { name: 'Ludvig Aberg' },
      { name: 'Tommy Fleetwood' },
      { name: 'Collin Morikawa' },
      { name: 'Cameron Young' },
      { name: 'Cam Smith', aliases: ['Cameron Smith'] },
      { name: 'Patrick Cantlay' }
    ]
  },
  {
    name: 'Adair',
    players: [
      { name: 'Xander Schauffle', aliases: ['Xander Schauffele'] },
      { name: 'Hideki Matsuyama' },
      { name: 'Chris Gotterup' },
      { name: 'Shane Lowry' },
      { name: 'Max Homa' },
      { name: 'Ricky Fowler', aliases: ['Rickie Fowler'] }
    ]
  },
  {
    name: 'Rhett',
    players: [
      { name: 'Scottie Scheffler' },
      { name: 'Sepp Straka' },
      { name: 'Jordan Spieth' },
      { name: 'Patrick Reed' },
      { name: 'Ben Griffin' },
      { name: 'Tyrell Hatton', aliases: ['Tyrrell Hatton'] }
    ]
  },
  {
    name: 'VP',
    players: [
      { name: 'Bryson Dechambeau', aliases: ['Bryson DeChambeau'] },
      { name: 'Justin Rose' },
      { name: 'Si Woo Kim' },
      { name: 'Brooks Koepka' },
      { name: 'Justin Thomas' },
      { name: 'Wyndham Clark' }
    ]
  }
];

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

  if (!url || !serviceRoleKey) {
    return null;
  }

  return {
    url: url.replace(/\/$/, ''),
    serviceRoleKey
  };
}

function getSupabaseHeaders(supabaseConfig) {
  return {
    apikey: supabaseConfig.serviceRoleKey,
    Authorization: `Bearer ${supabaseConfig.serviceRoleKey}`,
    'Content-Type': 'application/json'
  };
}

function getQueryValue(req, key) {
  const value = req.query?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function parseSeasonYear(value) {
  const parsed = Number.parseInt(String(value || DEFAULT_SEASON_YEAR), 10);
  if (!AVAILABLE_SEASON_YEARS.includes(parsed)) {
    return DEFAULT_SEASON_YEAR;
  }

  return parsed;
}

function getTeamDefinition(teamName) {
  return TEAM_DEFINITIONS.find((team) => team.name === teamName) || null;
}

function sanitizeSelectionsPayload(teamDefinition, rawSelections) {
  const validPlayerNames = new Set(teamDefinition.players.map((player) => player.name));
  const selections = {};

  for (const major of MAJOR_DEFINITIONS) {
    const input = Array.isArray(rawSelections?.[major.key]) ? rawSelections[major.key] : [];
    const seen = new Set();
    const output = [];

    for (const value of input) {
      const playerName = String(value || '').trim();
      if (!playerName || seen.has(playerName) || !validPlayerNames.has(playerName)) {
        continue;
      }

      output.push(playerName);
      seen.add(playerName);

      if (output.length === 4) {
        break;
      }
    }

    selections[major.key] = output;
  }

  return selections;
}

function readJsonBody(req) {
  if (!req.body) {
    return {};
  }

  if (typeof req.body === 'object') {
    return req.body;
  }

  if (typeof req.body === 'string') {
    if (!req.body.trim()) {
      return {};
    }

    try {
      return JSON.parse(req.body);
    } catch (error) {
      throw new Error('Invalid JSON body.');
    }
  }

  throw new Error('Invalid JSON body.');
}

async function fetchStoredSelections(seasonYear) {
  const supabaseConfig = getSupabaseConfig();
  if (!supabaseConfig) {
    return {
      rows: [],
      configured: false
    };
  }

  const params = new URLSearchParams({
    season_year: `eq.${seasonYear}`,
    select: 'team_name,selections,season_year,updated_at'
  });

  const response = await fetch(`${supabaseConfig.url}/rest/v1/team_selections?${params.toString()}`, {
    headers: getSupabaseHeaders(supabaseConfig)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase read failed (${response.status}): ${detail}`);
  }

  const rows = await response.json();
  return {
    rows: Array.isArray(rows) ? rows : [],
    configured: true
  };
}

async function upsertSelections(seasonYear, teamName, rawSelections) {
  const supabaseConfig = getSupabaseConfig();
  if (!supabaseConfig) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).');
  }

  const teamDefinition = getTeamDefinition(teamName);
  if (!teamDefinition) {
    throw new Error(`Unknown team: ${teamName}`);
  }

  const selections = sanitizeSelectionsPayload(teamDefinition, rawSelections);

  const response = await fetch(
    `${supabaseConfig.url}/rest/v1/team_selections?on_conflict=season_year,team_name`,
    {
      method: 'POST',
      headers: {
        ...getSupabaseHeaders(supabaseConfig),
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify([
        {
          season_year: seasonYear,
          team_name: teamName,
          selections
        }
      ])
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase write failed (${response.status}): ${detail}`);
  }

  const rows = await response.json();
  return rows?.[0] || null;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const seasonYear = parseSeasonYear(getQueryValue(req, 'year'));
      const result = await fetchStoredSelections(seasonYear);

      res.status(200).json({
        seasonYear,
        configured: result.configured,
        rows: result.rows
      });
      return;
    }

    if (req.method === 'POST') {
      const body = readJsonBody(req);
      const bodySeasonYear = parseSeasonYear(body?.seasonYear);
      const teamName = String(body?.teamName || '').trim();
      const selections = body?.selections || {};

      if (!teamName) {
        res.status(400).json({ error: 'teamName is required.' });
        return;
      }

      const saved = await upsertSelections(bodySeasonYear, teamName, selections);
      res.status(200).json({
        seasonYear: bodySeasonYear,
        teamName,
        saved
      });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    res.status(500).json({
      error: 'Selections API failed.',
      detail: error.message
    });
  }
};
