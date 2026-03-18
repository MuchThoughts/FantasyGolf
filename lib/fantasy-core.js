const APP_NAME = 'Fantasy Golf Majors';
const AVAILABLE_SEASON_YEARS = [2025, 2026];
const DEFAULT_SEASON_YEAR = 2025;
const DEFAULT_LEAGUE_NAME = 'Davidson';
const LEAGUE_USER_LIMIT = 20;
const MIN_PLAYERS_PER_USER = 4;
const MAX_PLAYERS_PER_USER = 8;
const CACHE_TTL_MS = 10 * 60 * 1000;
const PLAYER_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const DRAFT_POOL_CACHE_TTL_MS = 10 * 60 * 1000;
const TOP_PLAYER_LIMIT = 200;
const LEAGUES_TABLE = 'fantasy_leagues';
const SELECTIONS_TABLE = 'league_selections';

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

const KNOWN_PLAYER_ALIASES = {
  'Victor Hovland': ['Viktor Hovland'],
  'Cam Smith': ['Cameron Smith'],
  'Xander Schauffle': ['Xander Schauffele'],
  'Ricky Fowler': ['Rickie Fowler'],
  'Tyrell Hatton': ['Tyrrell Hatton'],
  'Bryson Dechambeau': ['Bryson DeChambeau']
};

const DEFAULT_LEAGUE_TEAMS = [
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

const cache = new Map();
const playerCache = new Map();
const draftPoolCache = new Map();

function cloneTeamDefinitions(teamDefinitions) {
  return teamDefinitions.map((team) => ({
    name: team.name,
    players: (team.players || []).map((player) => ({
      name: player.name,
      aliases: Array.isArray(player.aliases) ? [...player.aliases] : []
    }))
  }));
}

function getDefaultLeagueUsers() {
  return DEFAULT_LEAGUE_TEAMS.map((team) => ({
    name: team.name,
    players: team.players.map((player) => player.name)
  }));
}

function getLeagueLimits() {
  return {
    maxUsers: LEAGUE_USER_LIMIT,
    minPlayersPerUser: MIN_PLAYERS_PER_USER,
    maxPlayersPerUser: MAX_PLAYERS_PER_USER
  };
}

function parseSeasonYear(value) {
  const parsed = Number.parseInt(String(value || DEFAULT_SEASON_YEAR), 10);
  if (!AVAILABLE_SEASON_YEARS.includes(parsed)) {
    return DEFAULT_SEASON_YEAR;
  }

  return parsed;
}

function parseLeagueName(value) {
  const name = String(value || '').trim();
  if (!name) {
    return DEFAULT_LEAGUE_NAME;
  }

  return name.slice(0, 80);
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

function getReadOnlyLeagueResponse() {
  return {
    configured: false,
    storageReady: false,
    leagues: [
      {
        name: DEFAULT_LEAGUE_NAME,
        users: getDefaultLeagueUsers(),
        isDefault: true,
        updatedAt: null
      }
    ]
  };
}

function parseLeagueUsers(rawUsers) {
  if (!Array.isArray(rawUsers)) {
    throw new Error('users must be an array.');
  }

  if (rawUsers.length === 0 || rawUsers.length > LEAGUE_USER_LIMIT) {
    throw new Error(`A league must have between 1 and ${LEAGUE_USER_LIMIT} users.`);
  }

  const seenUserNames = new Set();
  const seenLeaguePlayers = new Set();
  const users = [];

  for (const [index, rawUser] of rawUsers.entries()) {
    const userName = String(rawUser?.name || '').trim();
    if (!userName) {
      throw new Error(`User ${index + 1} is missing a name.`);
    }

    const normalizedUserName = normalizeName(userName);
    if (seenUserNames.has(normalizedUserName)) {
      throw new Error(`Duplicate user name: ${userName}`);
    }
    seenUserNames.add(normalizedUserName);

    const rawPlayers = Array.isArray(rawUser?.players) ? rawUser.players : [];
    const players = [];
    const seenPlayers = new Set();

    for (const rawPlayer of rawPlayers) {
      const playerName = typeof rawPlayer === 'string'
        ? rawPlayer
        : String(rawPlayer?.name || '');
      const cleanPlayerName = playerName.trim();
      if (!cleanPlayerName) {
        continue;
      }

      const normalizedPlayerName = normalizeName(cleanPlayerName);
      if (seenPlayers.has(normalizedPlayerName)) {
        continue;
      }

      players.push(cleanPlayerName);
      seenPlayers.add(normalizedPlayerName);
    }

    if (players.length < MIN_PLAYERS_PER_USER || players.length > MAX_PLAYERS_PER_USER) {
      throw new Error(
        `${userName} must have between ${MIN_PLAYERS_PER_USER} and ${MAX_PLAYERS_PER_USER} golfers.`
      );
    }

    for (const playerName of players) {
      const normalizedPlayerName = normalizeName(playerName);
      if (seenLeaguePlayers.has(normalizedPlayerName)) {
        throw new Error(`Player ${playerName} is already assigned to another user in this league.`);
      }
      seenLeaguePlayers.add(normalizedPlayerName);
    }

    users.push({
      name: userName.slice(0, 80),
      players: players.slice(0, MAX_PLAYERS_PER_USER)
    });
  }

  return users;
}

function usersToTeamDefinitions(users) {
  return users.map((user) => ({
    name: user.name,
    players: user.players.map((playerName) => ({
      name: playerName,
      aliases: KNOWN_PLAYER_ALIASES[playerName] || []
    }))
  }));
}

async function fetchSupabaseLeagueRows() {
  const supabaseConfig = getSupabaseConfig();
  if (!supabaseConfig) {
    return getReadOnlyLeagueResponse();
  }

  const params = new URLSearchParams({
    select: 'name,users,updated_at',
    order: 'name.asc'
  });

  const response = await fetch(`${supabaseConfig.url}/rest/v1/${LEAGUES_TABLE}?${params.toString()}`, {
    headers: getSupabaseHeaders(supabaseConfig)
  });

  if (!response.ok) {
    const detail = await response.text();
    if (/does not exist/i.test(detail)) {
      return {
        configured: true,
        storageReady: false,
        leagues: [
          {
            name: DEFAULT_LEAGUE_NAME,
            users: getDefaultLeagueUsers(),
            isDefault: true,
            updatedAt: null
          }
        ]
      };
    }
    throw new Error(`Supabase leagues read failed (${response.status}): ${detail}`);
  }

  const rows = await response.json();
  const map = new Map();
  map.set(DEFAULT_LEAGUE_NAME.toLowerCase(), {
    name: DEFAULT_LEAGUE_NAME,
    users: getDefaultLeagueUsers(),
    isDefault: true,
    updatedAt: null
  });

  for (const row of Array.isArray(rows) ? rows : []) {
    const name = String(row?.name || '').trim();
    if (!name) {
      continue;
    }

    try {
      const users = parseLeagueUsers(row?.users);
      map.set(name.toLowerCase(), {
        name,
        users,
        isDefault: name.toLowerCase() === DEFAULT_LEAGUE_NAME.toLowerCase(),
        updatedAt: row?.updated_at || null
      });
    } catch (error) {
      // Skip malformed rows without breaking reads.
    }
  }

  const leagues = Array.from(map.values()).sort((a, b) => {
    if (a.name === DEFAULT_LEAGUE_NAME) {
      return -1;
    }
    if (b.name === DEFAULT_LEAGUE_NAME) {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });

  return {
    configured: true,
    storageReady: true,
    leagues
  };
}

async function fetchAllLeagues() {
  return fetchSupabaseLeagueRows();
}

async function resolveLeague(leagueName) {
  const parsedLeagueName = parseLeagueName(leagueName);
  const leagueResponse = await fetchAllLeagues();
  const found = leagueResponse.leagues.find(
    (league) => league.name.toLowerCase() === parsedLeagueName.toLowerCase()
  );

  const league = found || leagueResponse.leagues[0];
  if (!league) {
    return {
      leagueName: DEFAULT_LEAGUE_NAME,
      users: getDefaultLeagueUsers(),
      teams: cloneTeamDefinitions(DEFAULT_LEAGUE_TEAMS)
    };
  }

  if (league.name.toLowerCase() === DEFAULT_LEAGUE_NAME.toLowerCase() && !found) {
    return {
      leagueName: DEFAULT_LEAGUE_NAME,
      users: getDefaultLeagueUsers(),
      teams: cloneTeamDefinitions(DEFAULT_LEAGUE_TEAMS)
    };
  }

  if (league.name === DEFAULT_LEAGUE_NAME && league.updatedAt === null) {
    return {
      leagueName: league.name,
      users: league.users,
      teams: cloneTeamDefinitions(DEFAULT_LEAGUE_TEAMS)
    };
  }

  return {
    leagueName: league.name,
    users: league.users,
    teams: usersToTeamDefinitions(league.users)
  };
}

function getTeamDefinition(teamDefinitions, teamName) {
  return teamDefinitions.find((team) => team.name === teamName) || null;
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

function getFallbackTopPlayers() {
  const byName = new Map();
  for (const team of DEFAULT_LEAGUE_TEAMS) {
    for (const player of team.players || []) {
      const name = String(player?.name || '').trim();
      if (!name) {
        continue;
      }

      const normalized = normalizeName(name);
      if (!normalized || byName.has(normalized)) {
        continue;
      }

      byName.set(normalized, name);
    }
  }

  return Array.from(byName.values())
    .sort((a, b) => a.localeCompare(b))
    .map((name, index) => ({
      rank: index + 1,
      name
    }));
}

async function fetchTopPlayersFromEspn(seasonYear, limit = TOP_PLAYER_LIMIT) {
  const rankingsPayload = await fetchJson('https://site.api.espn.com/apis/site/v2/sports/golf/all/rankings');
  const rankingCollections = Array.isArray(rankingsPayload?.rankings) ? rankingsPayload.rankings : [];
  const worldRankingCollection = rankingCollections.find(
    (ranking) => String(ranking?.type || '').toUpperCase() === 'WORLDRANK'
  ) || rankingCollections[0];

  const ranks = Array.isArray(worldRankingCollection?.ranks) ? worldRankingCollection.ranks : [];
  if (!ranks.length) {
    throw new Error(`No world ranking rows found for season ${seasonYear}.`);
  }

  const deduped = new Map();
  for (const [index, rankRow] of ranks.entries()) {
    if (deduped.size >= limit) {
      break;
    }

    const name = String(rankRow?.athlete?.displayName || rankRow?.athlete?.fullName || '').trim();
    if (!name) {
      continue;
    }

    const normalized = normalizeName(name);
    if (!normalized) {
      continue;
    }

    const rawRank = Number.parseInt(String(rankRow?.current || index + 1), 10);
    const rank = Number.isFinite(rawRank) ? rawRank : index + 1;
    const existing = deduped.get(normalized);
    if (!existing || rank < existing.rank) {
      deduped.set(normalized, {
        rank,
        name
      });
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => {
      if (a.rank !== b.rank) {
        return a.rank - b.rank;
      }
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

async function fetchTopPlayers(seasonYear, forceRefresh = false) {
  const parsedSeasonYear = parseSeasonYear(seasonYear);
  const cachedEntry = playerCache.get(parsedSeasonYear);
  if (!forceRefresh && cachedEntry && cachedEntry.expiresAt > Date.now()) {
    return cachedEntry.payload;
  }

  let source = 'ESPN OWGR API';
  let players = [];

  try {
    players = await fetchTopPlayersFromEspn(parsedSeasonYear, TOP_PLAYER_LIMIT);
    if (players.length < 25) {
      throw new Error('OWGR feed returned too few players.');
    }
  } catch (error) {
    source = 'Fallback player list';
    players = getFallbackTopPlayers();
  }

  const payload = {
    seasonYear: parsedSeasonYear,
    count: players.length,
    source,
    players
  };

  playerCache.set(parsedSeasonYear, {
    payload,
    expiresAt: Date.now() + PLAYER_CACHE_TTL_MS
  });

  return payload;
}

function getLookupNamesForPlayerName(playerName) {
  const normalized = normalizeName(playerName);
  if (!normalized) {
    return [];
  }

  const lookupNames = new Set([normalized]);
  for (const [canonicalName, aliases] of Object.entries(KNOWN_PLAYER_ALIASES)) {
    const canonicalNormalized = normalizeName(canonicalName);
    const aliasNormalized = Array.isArray(aliases)
      ? aliases.map((alias) => normalizeName(alias)).filter(Boolean)
      : [];

    if (canonicalNormalized === normalized || aliasNormalized.includes(normalized)) {
      lookupNames.add(canonicalNormalized);
      for (const aliasName of aliasNormalized) {
        lookupNames.add(aliasName);
      }
    }
  }

  return Array.from(lookupNames);
}

function resolveScoreForLookupNames(majorWithScores, lookupNames) {
  for (const lookupName of lookupNames) {
    const scoreValue = majorWithScores.scoresByName.get(lookupName);
    if (typeof scoreValue === 'number') {
      return scoreValue;
    }
  }

  return null;
}

async function fetchDraftPool(seasonYear, forceRefresh = false) {
  const parsedSeasonYear = parseSeasonYear(seasonYear);
  const cachedEntry = draftPoolCache.get(parsedSeasonYear);
  if (!forceRefresh && cachedEntry && cachedEntry.expiresAt > Date.now()) {
    return cachedEntry.payload;
  }

  const topPlayersPayload = await fetchTopPlayers(parsedSeasonYear, forceRefresh);
  let majorsWithScores = [];

  try {
    const majorEvents = await fetchMajorEvents(parsedSeasonYear);
    majorsWithScores = await Promise.all(majorEvents.map(fetchMajorScoreMap));
  } catch (error) {
    majorsWithScores = MAJOR_DEFINITIONS.map((major) => ({
      ...major,
      eventId: null,
      endDate: null,
      scoresByName: new Map()
    }));
  }

  if (!majorsWithScores.length) {
    majorsWithScores = MAJOR_DEFINITIONS.map((major) => ({
      ...major,
      eventId: null,
      endDate: null,
      scoresByName: new Map()
    }));
  }

  const players = (topPlayersPayload.players || [])
    .map((player) => {
      const playerName = String(player?.name || '').trim();
      if (!playerName) {
        return null;
      }

      const lookupNames = getLookupNamesForPlayerName(playerName);
      const majorScores = {};
      let overallSum = 0;
      let scoredCount = 0;
      let missingCount = 0;

      for (const major of majorsWithScores) {
        const scoreValue = resolveScoreForLookupNames(major, lookupNames);
        if (typeof scoreValue === 'number') {
          majorScores[major.key] = formatRelativeScore(scoreValue);
          overallSum += scoreValue;
          scoredCount += 1;
        } else {
          majorScores[major.key] = 'N/A';
          missingCount += 1;
        }
      }

      return {
        rank: Number.isFinite(player?.rank) ? player.rank : null,
        name: playerName,
        majorScores,
        overall: scoredCount > 0
          ? formatTotalDisplay(overallSum, missingCount, scoredCount)
          : 'N/A'
      };
    })
    .filter(Boolean);

  const payload = {
    seasonYear: parsedSeasonYear,
    count: players.length,
    source: topPlayersPayload.source,
    majors: majorsWithScores.map((major) => ({
      key: major.key,
      name: major.name
    })),
    players
  };

  draftPoolCache.set(parsedSeasonYear, {
    payload,
    expiresAt: Date.now() + DRAFT_POOL_CACHE_TTL_MS
  });

  return payload;
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

async function buildPayload(seasonYear, leagueName) {
  const parsedSeasonYear = parseSeasonYear(seasonYear);
  const resolvedLeague = await resolveLeague(leagueName);
  const majorEvents = await fetchMajorEvents(parsedSeasonYear);
  const majorsWithScores = await Promise.all(majorEvents.map(fetchMajorScoreMap));
  const teams = resolvedLeague.teams.map((teamDefinition) => buildTeamData(teamDefinition, majorsWithScores));

  return {
    appName: APP_NAME,
    seasonYear: parsedSeasonYear,
    availableSeasons: AVAILABLE_SEASON_YEARS,
    leagueName: resolvedLeague.leagueName,
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

function getCacheKey(seasonYear, leagueName) {
  return `${seasonYear}:${leagueName.toLowerCase()}`;
}

function clearLeagueCache(leagueName) {
  const normalizedLeagueName = parseLeagueName(leagueName).toLowerCase();
  for (const key of cache.keys()) {
    if (key.endsWith(`:${normalizedLeagueName}`)) {
      cache.delete(key);
    }
  }
}

async function getCachedPayload(seasonYear, leagueName, forceRefresh = false) {
  const parsedSeasonYear = parseSeasonYear(seasonYear);
  const parsedLeagueName = parseLeagueName(leagueName);
  const requestedCacheKey = getCacheKey(parsedSeasonYear, parsedLeagueName);
  const cachedEntry = cache.get(requestedCacheKey);

  if (!forceRefresh && cachedEntry && cachedEntry.expiresAt > Date.now()) {
    return cachedEntry.payload;
  }

  const payload = await buildPayload(parsedSeasonYear, parsedLeagueName);
  const resolvedCacheKey = getCacheKey(parsedSeasonYear, payload.leagueName);

  const newEntry = {
    payload,
    expiresAt: Date.now() + CACHE_TTL_MS
  };
  cache.set(requestedCacheKey, newEntry);
  cache.set(resolvedCacheKey, newEntry);

  return payload;
}

async function fetchStoredSelections(seasonYear, leagueName) {
  const parsedSeasonYear = parseSeasonYear(seasonYear);
  const parsedLeagueName = parseLeagueName(leagueName);
  const supabaseConfig = getSupabaseConfig();
  if (!supabaseConfig) {
    return {
      configured: false,
      storageReady: false,
      seasonYear: parsedSeasonYear,
      leagueName: parsedLeagueName,
      rows: []
    };
  }

  const params = new URLSearchParams({
    season_year: `eq.${parsedSeasonYear}`,
    league_name: `eq.${parsedLeagueName}`,
    select: 'league_name,team_name,selections,season_year,updated_at'
  });

  const response = await fetch(`${supabaseConfig.url}/rest/v1/${SELECTIONS_TABLE}?${params.toString()}`, {
    headers: getSupabaseHeaders(supabaseConfig)
  });

  if (!response.ok) {
    const detail = await response.text();
    if (/does not exist/i.test(detail)) {
      return {
        configured: true,
        storageReady: false,
        seasonYear: parsedSeasonYear,
        leagueName: parsedLeagueName,
        rows: []
      };
    }
    throw new Error(`Supabase selections read failed (${response.status}): ${detail}`);
  }

  const rows = await response.json();
  return {
    configured: true,
    storageReady: true,
    seasonYear: parsedSeasonYear,
    leagueName: parsedLeagueName,
    rows: Array.isArray(rows) ? rows : []
  };
}

async function upsertSelections(seasonYear, leagueName, teamName, rawSelections) {
  const parsedSeasonYear = parseSeasonYear(seasonYear);
  const parsedLeagueName = parseLeagueName(leagueName);
  const cleanTeamName = String(teamName || '').trim();
  const supabaseConfig = getSupabaseConfig();
  if (!supabaseConfig) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).');
  }

  const resolvedLeague = await resolveLeague(parsedLeagueName);
  const teamDefinition = getTeamDefinition(resolvedLeague.teams, cleanTeamName);
  if (!teamDefinition) {
    throw new Error(`Unknown team for league ${resolvedLeague.leagueName}: ${cleanTeamName}`);
  }

  const selections = sanitizeSelectionsPayload(teamDefinition, rawSelections);

  const response = await fetch(
    `${supabaseConfig.url}/rest/v1/${SELECTIONS_TABLE}?on_conflict=league_name,season_year,team_name`,
    {
      method: 'POST',
      headers: {
        ...getSupabaseHeaders(supabaseConfig),
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify([
        {
          league_name: resolvedLeague.leagueName,
          season_year: parsedSeasonYear,
          team_name: cleanTeamName,
          selections
        }
      ])
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    if (/does not exist/i.test(detail)) {
      throw new Error(`Selections table ${SELECTIONS_TABLE} is missing. Run the Supabase SQL setup.`);
    }
    throw new Error(`Supabase selections write failed (${response.status}): ${detail}`);
  }

  const rows = await response.json();
  return {
    seasonYear: parsedSeasonYear,
    leagueName: resolvedLeague.leagueName,
    teamName: cleanTeamName,
    saved: rows?.[0] || null
  };
}

async function saveLeague(leagueName, rawUsers) {
  const cleanLeagueName = parseLeagueName(leagueName);
  if (!cleanLeagueName) {
    throw new Error('League name is required.');
  }

  const supabaseConfig = getSupabaseConfig();
  if (!supabaseConfig) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).');
  }

  const users = parseLeagueUsers(rawUsers);
  const response = await fetch(`${supabaseConfig.url}/rest/v1/${LEAGUES_TABLE}?on_conflict=name`, {
    method: 'POST',
    headers: {
      ...getSupabaseHeaders(supabaseConfig),
      Prefer: 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify([
      {
        name: cleanLeagueName,
        users
      }
    ])
  });

  if (!response.ok) {
    const detail = await response.text();
    if (/does not exist/i.test(detail)) {
      throw new Error(`Leagues table ${LEAGUES_TABLE} is missing. Run the Supabase SQL setup.`);
    }
    throw new Error(`Supabase leagues write failed (${response.status}): ${detail}`);
  }

  clearLeagueCache(cleanLeagueName);

  const rows = await response.json();
  const savedRow = rows?.[0] || {};
  return {
    name: savedRow?.name || cleanLeagueName,
    users,
    updatedAt: savedRow?.updated_at || new Date().toISOString()
  };
}

async function deleteLeague(leagueName) {
  const cleanLeagueName = parseLeagueName(leagueName);
  if (!cleanLeagueName) {
    throw new Error('League name is required.');
  }

  if (cleanLeagueName.toLowerCase() === DEFAULT_LEAGUE_NAME.toLowerCase()) {
    throw new Error(`${DEFAULT_LEAGUE_NAME} is the default league and cannot be deleted.`);
  }

  const supabaseConfig = getSupabaseConfig();
  if (!supabaseConfig) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).');
  }

  const leagueDeleteParams = new URLSearchParams({
    name: `eq.${cleanLeagueName}`
  });
  const deleteLeagueResponse = await fetch(
    `${supabaseConfig.url}/rest/v1/${LEAGUES_TABLE}?${leagueDeleteParams.toString()}`,
    {
      method: 'DELETE',
      headers: {
        ...getSupabaseHeaders(supabaseConfig),
        Prefer: 'return=minimal'
      }
    }
  );

  if (!deleteLeagueResponse.ok) {
    const detail = await deleteLeagueResponse.text();
    if (/does not exist/i.test(detail)) {
      throw new Error(`Leagues table ${LEAGUES_TABLE} is missing. Run the Supabase SQL setup.`);
    }
    throw new Error(`Supabase league delete failed (${deleteLeagueResponse.status}): ${detail}`);
  }

  const selectionDeleteParams = new URLSearchParams({
    league_name: `eq.${cleanLeagueName}`
  });
  const deleteSelectionsResponse = await fetch(
    `${supabaseConfig.url}/rest/v1/${SELECTIONS_TABLE}?${selectionDeleteParams.toString()}`,
    {
      method: 'DELETE',
      headers: {
        ...getSupabaseHeaders(supabaseConfig),
        Prefer: 'return=minimal'
      }
    }
  );

  if (!deleteSelectionsResponse.ok) {
    const detail = await deleteSelectionsResponse.text();
    if (/does not exist/i.test(detail)) {
      throw new Error(`Selections table ${SELECTIONS_TABLE} is missing. Run the Supabase SQL setup.`);
    }
    throw new Error(`Supabase selections delete failed (${deleteSelectionsResponse.status}): ${detail}`);
  }

  clearLeagueCache(cleanLeagueName);

  return {
    name: cleanLeagueName,
    deleted: true
  };
}

async function readRawRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function parseJsonText(text) {
  if (!String(text || '').trim()) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('Invalid JSON body.');
  }
}

async function readJsonBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) {
      return parseJsonText(req.body.toString('utf8'));
    }

    if (typeof req.body === 'string') {
      return parseJsonText(req.body);
    }

    if (typeof req.body === 'object') {
      return req.body;
    }
  }

  const rawBody = await readRawRequestBody(req);
  return parseJsonText(rawBody);
}

module.exports = {
  APP_NAME,
  AVAILABLE_SEASON_YEARS,
  DEFAULT_LEAGUE_NAME,
  DEFAULT_SEASON_YEAR,
  MAJOR_DEFINITIONS,
  getLeagueLimits,
  parseSeasonYear,
  parseLeagueName,
  getCachedPayload,
  fetchTopPlayers,
  fetchDraftPool,
  fetchStoredSelections,
  upsertSelections,
  fetchAllLeagues,
  saveLeague,
  deleteLeague,
  readJsonBody
};
