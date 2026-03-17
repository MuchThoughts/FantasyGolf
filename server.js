const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const CACHE_TTL_MS = 10 * 60 * 1000;
const APP_NAME = 'Fantasy Golf Majors';
const AVAILABLE_SEASON_YEARS = [2025, 2026];
const DEFAULT_SEASON_YEAR = 2025;

const MAJOR_DEFINITIONS = [
  {
    key: 'masters',
    name: 'Masters',
    matches: (label) => /masters/i.test(label)
  },
  {
    key: 'pga',
    name: 'PGA',
    matches: (label) => /pga championship/i.test(label)
  },
  {
    key: 'us_open',
    name: 'U.S. Open',
    matches: (label) => /u\.?s\.? open/i.test(label)
  },
  {
    key: 'the_open',
    name: 'The Open',
    matches: (label) => /^(the open|open championship)/i.test(label)
  }
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

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon'
};

const cache = new Map();

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

function normalizeName(name) {
  if (!name) {
    return '';
  }

  return String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toDateStamp(dateValue) {
  if (!dateValue) {
    return null;
  }

  const [datePart] = String(dateValue).split('T');
  return datePart.replace(/-/g, '');
}

function parseRelativeScore(scoreText) {
  if (typeof scoreText !== 'string') {
    return null;
  }

  const value = scoreText.trim();
  if (!value || value === '--' || value === '-') {
    return null;
  }

  if (value === 'E') {
    return 0;
  }

  if (/^[+-]?\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }

  return null;
}

function formatRelativeScore(score) {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return 'N/A';
  }

  if (score === 0) {
    return 'E';
  }

  return score > 0 ? `+${score}` : `${score}`;
}

function formatTotalDisplay(sum, missingCount, totalEntries) {
  if (totalEntries === 0) {
    return 'N/A';
  }

  const base = formatRelativeScore(sum);
  return missingCount > 0 ? `${base}*` : base;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': `${APP_NAME} (Node.js)`
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return response.json();
}

async function fetchMajorEvents(year) {
  const schedule = await fetchJson(
    `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?dates=${year}`
  );

  const calendarEvents = schedule?.leagues?.[0]?.calendar ?? [];

  return MAJOR_DEFINITIONS.map((major) => {
    const event = calendarEvents.find((calendarEvent) => major.matches(calendarEvent?.label || ''));

    return {
      ...major,
      eventId: event?.id || null,
      endDate: event?.endDate || null
    };
  }).filter((event) => event.eventId && event.endDate);
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

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

async function fetchMajorScoreMap(majorEvent) {
  const dateStamp = toDateStamp(majorEvent.endDate);
  if (!dateStamp) {
    return {
      ...majorEvent,
      scoresByName: new Map()
    };
  }

  const scoreboard = await fetchJson(
    `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?dates=${dateStamp}`
  );

  const event = (scoreboard?.events ?? []).find((eventRow) => {
    return String(eventRow?.id) === String(majorEvent.eventId) ||
      majorEvent.matches(eventRow?.name || '') ||
      majorEvent.matches(eventRow?.shortName || '');
  });

  const competitors = event?.competitions?.[0]?.competitors ?? [];
  const scoresByName = new Map();

  for (const competitor of competitors) {
    const playerName = competitor?.athlete?.fullName || competitor?.athlete?.displayName || null;
    const score = parseRelativeScore(competitor?.score);

    if (!playerName || score === null) {
      continue;
    }

    const normalized = normalizeName(playerName);
    if (!normalized) {
      continue;
    }

    scoresByName.set(normalized, score);
  }

  return {
    ...majorEvent,
    scoresByName
  };
}

function resolvePlayerMajorScore(player, major) {
  for (const normalizedName of player.lookupNames) {
    const score = major.scoresByName.get(normalizedName);
    if (typeof score === 'number') {
      return score;
    }
  }

  return null;
}

function buildTeamData(teamDefinition, majors) {
  const players = teamDefinition.players.map((playerDef) => {
    const lookupNames = [playerDef.name, ...(playerDef.aliases || [])]
      .map((name) => normalizeName(name))
      .filter(Boolean);

    let overallSum = 0;
    let missingMajors = 0;
    let scoredMajors = 0;
    const majorScores = {};
    const majorScoreValues = {};

    for (const major of majors) {
      const scoreValue = resolvePlayerMajorScore({ lookupNames }, major);

      if (scoreValue === null) {
        missingMajors += 1;
        majorScores[major.key] = 'N/A';
        majorScoreValues[major.key] = null;
      } else {
        overallSum += scoreValue;
        scoredMajors += 1;
        majorScores[major.key] = formatRelativeScore(scoreValue);
        majorScoreValues[major.key] = scoreValue;
      }
    }

    const overall = scoredMajors === 0
      ? 'N/A'
      : formatTotalDisplay(overallSum, missingMajors, scoredMajors);

    return {
      name: playerDef.name,
      majorScores,
      majorScoreValues,
      overall,
      overallValue: scoredMajors === 0 ? null : overallSum,
      missingMajors
    };
  });

  const majorTotals = {};
  let overallTeamSum = 0;
  let overallMissingEntries = 0;
  let overallScoredEntries = 0;

  for (const major of majors) {
    let sum = 0;
    let missing = 0;
    let scored = 0;

    for (const player of players) {
      const value = player.majorScoreValues[major.key];
      if (value === null) {
        missing += 1;
        overallMissingEntries += 1;
        continue;
      }

      sum += value;
      scored += 1;
      overallTeamSum += value;
      overallScoredEntries += 1;
    }

    majorTotals[major.key] = {
      display: formatTotalDisplay(sum, missing, scored),
      value: scored === 0 ? null : sum,
      missingPlayers: missing,
      scoredPlayers: scored
    };
  }

  const overall = overallScoredEntries === 0
    ? 'N/A'
    : formatTotalDisplay(overallTeamSum, overallMissingEntries, overallScoredEntries);

  const top3MajorTotals = {};
  let top3OverallSum = 0;
  let top3OverallMissingEntries = 0;
  let top3OverallScoredEntries = 0;

  for (const major of majors) {
    const availableScores = players
      .map((player) => player.majorScoreValues[major.key])
      .filter((value) => typeof value === 'number')
      .sort((a, b) => a - b);

    const selectedScores = availableScores.slice(0, 3);
    const selectedCount = selectedScores.length;
    const missingToThree = Math.max(0, 3 - selectedCount);
    const top3Sum = selectedScores.reduce((sum, score) => sum + score, 0);

    top3MajorTotals[major.key] = {
      display: selectedCount === 0
        ? 'N/A'
        : formatTotalDisplay(top3Sum, missingToThree, selectedCount),
      value: selectedCount === 0 ? null : top3Sum,
      selectedPlayers: selectedCount,
      missingToThree
    };

    if (selectedCount > 0) {
      top3OverallSum += top3Sum;
      top3OverallScoredEntries += selectedCount;
    }
    top3OverallMissingEntries += missingToThree;
  }

  const top3Overall = top3OverallScoredEntries === 0
    ? 'N/A'
    : formatTotalDisplay(top3OverallSum, top3OverallMissingEntries, top3OverallScoredEntries);

  return {
    name: teamDefinition.name,
    players,
    totals: {
      majorTotals,
      overall: {
        display: overall,
        value: overallScoredEntries === 0 ? null : overallTeamSum,
        missingEntries: overallMissingEntries,
        scoredEntries: overallScoredEntries
      },
      top3: {
        majorTotals: top3MajorTotals,
        overall: {
          display: top3Overall,
          value: top3OverallScoredEntries === 0 ? null : top3OverallSum,
          missingEntries: top3OverallMissingEntries,
          scoredEntries: top3OverallScoredEntries
        }
      }
    }
  };
}

async function buildPayload(seasonYear) {
  const majorEvents = await fetchMajorEvents(seasonYear);
  const majorsWithScores = await Promise.all(majorEvents.map(fetchMajorScoreMap));

  const teams = TEAM_DEFINITIONS.map((teamDefinition) => buildTeamData(teamDefinition, majorsWithScores));

  return {
    appName: APP_NAME,
    seasonYear,
    availableSeasons: AVAILABLE_SEASON_YEARS,
    majors: majorsWithScores.map((major) => ({
      key: major.key,
      name: major.name,
      eventId: major.eventId,
      endDate: major.endDate
    })),
    teams,
    updatedAt: new Date().toISOString(),
    notes: {
      scoresSource: 'ESPN PGA scoreboard API',
      totalsLegend: '* indicates one or more missing player scores in that total.'
    }
  };
}

async function getCachedPayload(seasonYear, forceRefresh = false) {
  const cachedEntry = cache.get(seasonYear);
  if (!forceRefresh && cachedEntry && cachedEntry.expiresAt > Date.now()) {
    return cachedEntry.payload;
  }

  const payload = await buildPayload(seasonYear);
  cache.set(seasonYear, {
    payload,
    expiresAt: Date.now() + CACHE_TTL_MS
  });

  return payload;
}

async function serveStaticFile(res, requestedPathname) {
  let pathname = requestedPathname;
  if (pathname === '/') {
    pathname = '/index.html';
  }

  const absolutePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!absolutePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Forbidden' }));
    return;
  }

  try {
    const fileBuffer = await fs.readFile(absolutePath);
    const extension = path.extname(absolutePath).toLowerCase();
    const contentType = MIME_TYPES[extension] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(fileBuffer);
  } catch (error) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/api/majors') {
      const forceRefresh = url.searchParams.get('refresh') === '1';
      const seasonYear = parseSeasonYear(url.searchParams.get('year'));
      const payload = await getCachedPayload(seasonYear, forceRefresh);

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(JSON.stringify(payload));
      return;
    }

    if (url.pathname === '/api/selections') {
      const seasonYear = parseSeasonYear(url.searchParams.get('year'));

      if (req.method === 'GET') {
        const result = await fetchStoredSelections(seasonYear);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({
            seasonYear,
            configured: result.configured,
            rows: result.rows
          })
        );
        return;
      }

      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        const bodySeasonYear = parseSeasonYear(body?.seasonYear);
        const teamName = String(body?.teamName || '').trim();
        const selections = body?.selections || {};

        if (!teamName) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'teamName is required.' }));
          return;
        }

        const saved = await upsertSelections(bodySeasonYear, teamName, selections);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({
            seasonYear: bodySeasonYear,
            teamName,
            saved
          })
        );
        return;
      }

      res.writeHead(405, {
        'Content-Type': 'application/json; charset=utf-8',
        Allow: 'GET, POST'
      });
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      return;
    }

    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    await serveStaticFile(res, url.pathname);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        error: 'Failed to load golf data.',
        detail: error.message
      })
    );
  }
});

server.listen(PORT, HOST, () => {
  console.log(`${APP_NAME} running at http://${HOST}:${PORT}`);
});
