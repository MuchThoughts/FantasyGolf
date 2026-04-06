const teamsContainer = document.getElementById('teams-container');
const statusNode = document.getElementById('status');
const subtitleNode = document.getElementById('subtitle');
const updatedAtNode = document.getElementById('updated-at');
const refreshButton = document.getElementById('refresh');
const yearToggleNode = document.getElementById('year-toggle');
const leagueToggleNode = document.getElementById('league-toggle');
const newLeagueButton = document.getElementById('new-league');
const deleteLeagueButton = document.getElementById('delete-league');
const leagueModal = document.getElementById('league-modal');
const closeLeagueModalButton = document.getElementById('close-league-modal');
const leagueForm = document.getElementById('league-form');
const leagueNameInput = document.getElementById('league-name-input');
const addLeagueUserButton = document.getElementById('add-league-user');
const leagueUsersList = document.getElementById('league-users-list');
const leagueFormStatus = document.getElementById('league-form-status');
const playerOptionsNode = document.getElementById('player-options');
const leagueModeSelect = document.getElementById('league-mode-select');
const draftRoundsWrap = document.getElementById('draft-rounds-wrap');
const draftRoundsSelect = document.getElementById('draft-rounds-select');
const leagueFormHint = document.getElementById('league-form-hint');
const excludeSchefflerWrap = document.getElementById('exclude-scheffler-wrap');
const excludeSchefflerCheckbox = document.getElementById('exclude-scheffler');

const DEFAULT_LEAGUE_NAME = 'Davidson';
const HOME_DEFAULT_LEAGUE_NAME = 'Neighborhood Competition';
const HOME_DEFAULT_TAB = 'masters';
const DRAFT_SETUP_STORAGE_KEY = 'fantasyGolfDraftSetup';
const DRAFT_SEASON_YEAR = 2025;

let currentPayload = null;
let teamUiState = {};
let activeTab = HOME_DEFAULT_TAB;
let selectedSeasonYear = 2026;
let selectedLeagueName = HOME_DEFAULT_LEAGUE_NAME;
let currentLeagueSetupMode = 'selected';
let availableLeagues = [];
let leagueLimits = {
  maxUsers: 20,
  minPlayersPerUser: 4,
  maxPlayersPerUser: 8
};
let topPlayers = [];
let topPlayersSeasonYear = null;
const topPlayerByNormalizedName = new Map();

try {
  const initialParams = new URLSearchParams(window.location.search || '');
  const requestedLeague = String(initialParams.get('league') || '').trim();

  if (requestedLeague) {
    selectedLeagueName = requestedLeague;
  }
} catch (error) {
  // Ignore invalid URL parsing and keep defaults.
}

function normalizePlayerName(name) {
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

function scoreClass(score) {
  if (score === null || score === undefined || score === '-') {
    return 'na';
  }

  const clean = String(score).replace('*', '');
  if (clean === 'E') {
    return 'even';
  }

  if (clean.startsWith('-')) {
    return 'negative';
  }

  if (clean.startsWith('+')) {
    return 'positive';
  }

  return 'na';
}

function parseScoreValue(scoreText) {
  if (scoreText === null || scoreText === undefined) {
    return null;
  }

  const value = String(scoreText).trim().replace('*', '');
  if (!value || value === '-') {
    return null;
  }

  if (value === 'E') {
    return 0;
  }

  if (/^[+-]?\d+(\.\d+)?$/.test(value)) {
    return Number.parseFloat(value);
  }

  return null;
}

function formatScoreValue(scoreValue, partial = false) {
  if (scoreValue === null || scoreValue === undefined || Number.isNaN(scoreValue)) {
    return '-';
  }

  const rounded = Math.round(scoreValue * 10) / 10;
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  const magnitude = Number.isInteger(Math.abs(normalized))
    ? String(Math.abs(normalized))
    : Math.abs(normalized).toFixed(1).replace(/\.0$/, '');
  const base = normalized === 0 ? 'E' : normalized > 0 ? `+${magnitude}` : `-${magnitude}`;
  return partial ? `${base}*` : base;
}

function getMajorFallbackScore(majorKey) {
  const major = getMajorByKey(majorKey);
  if (!major || major.secondRoundComplete !== true) {
    return null;
  }

  const score = major.defaultMissingScore;
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return null;
  }

  return score;
}

function applyMissingScoreRule(scoreValues, missingCount, majorKey) {
  const values = scoreValues
    .filter((value) => typeof value === 'number' && !Number.isNaN(value))
    .slice();
  const fallbackScore = getMajorFallbackScore(majorKey);

  if (missingCount > 1 && typeof fallbackScore === 'number') {
    const fallbackCount = missingCount - 1;
    for (let index = 0; index < fallbackCount; index += 1) {
      values.push(fallbackScore);
    }
  }

  return values;
}

function toFriendlyDate(value) {
  if (!value) {
    return 'Unknown';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

function getSeasonTabLabel() {
  return 'Season Summary';
}

function getMajorByKey(majorKey) {
  return (currentPayload?.majors || []).find((major) => major.key === majorKey) || null;
}

function getMajorName(majorKey) {
  return getMajorByKey(majorKey)?.name || majorKey;
}

function getTeamByName(teamName) {
  return (currentPayload?.teams || []).find((team) => team.name === teamName) || null;
}

function syncYearToggle(payload) {
  if (!yearToggleNode) {
    return;
  }

  const seasons = payload?.availableSeasons || [2025, 2026];
  yearToggleNode.innerHTML = seasons
    .map((season) => `<option value="${season}">${season}</option>`)
    .join('');

  if (!seasons.includes(selectedSeasonYear)) {
    selectedSeasonYear = seasons[0];
  }

  yearToggleNode.value = String(selectedSeasonYear);
}

function syncLeagueToggle() {
  if (!leagueToggleNode) {
    return;
  }

  const leagueNames = availableLeagues.map((league) => league.name);
  if (!leagueNames.length) {
    leagueToggleNode.innerHTML = `<option value="${DEFAULT_LEAGUE_NAME}">${DEFAULT_LEAGUE_NAME}</option>`;
    selectedLeagueName = DEFAULT_LEAGUE_NAME;
    leagueToggleNode.value = selectedLeagueName;
    return;
  }

  if (!leagueNames.some((name) => name === selectedLeagueName)) {
    selectedLeagueName = leagueNames[0];
  }

  leagueToggleNode.innerHTML = leagueNames
    .map((name) => `<option value="${name}">${name}</option>`)
    .join('');
  leagueToggleNode.value = selectedLeagueName;
  syncDeleteLeagueButton();
}

function syncDeleteLeagueButton() {
  if (!deleteLeagueButton) {
    return;
  }

  const isDefaultLeague = selectedLeagueName === DEFAULT_LEAGUE_NAME;
  deleteLeagueButton.disabled = isDefaultLeague;
  deleteLeagueButton.title = isDefaultLeague
    ? `${DEFAULT_LEAGUE_NAME} is the default league and cannot be deleted.`
    : `Delete ${selectedLeagueName}`;
}

function setTopPlayers(players, seasonYear) {
  topPlayers = Array.isArray(players) ? players : [];
  topPlayersSeasonYear = seasonYear;
  topPlayerByNormalizedName.clear();

  const optionsMarkup = topPlayers
    .map((player) => {
      const name = String(player?.name || '').trim();
      if (!name) {
        return '';
      }

      const normalized = normalizePlayerName(name);
      if (!normalized || topPlayerByNormalizedName.has(normalized)) {
        return '';
      }

      topPlayerByNormalizedName.set(normalized, name);
      const rank = player?.rank ? `#${player.rank} ` : '';
      return `<option value="${name}" label="${rank}${name}"></option>`;
    })
    .join('');

  if (playerOptionsNode) {
    playerOptionsNode.innerHTML = optionsMarkup;
  }
}

function canonicalPlayerName(rawName) {
  const normalized = normalizePlayerName(rawName);
  return normalized ? topPlayerByNormalizedName.get(normalized) || null : null;
}

async function loadTopPlayers(forceRefresh = false) {
  const params = new URLSearchParams({
    year: String(selectedSeasonYear)
  });
  if (forceRefresh) {
    params.set('refresh', '1');
  }

  const response = await fetch(`/api/players?${params.toString()}`);
  let responseBody = null;
  try {
    responseBody = await response.json();
  } catch (error) {
    responseBody = null;
  }

  if (!response.ok) {
    const message = responseBody?.detail || responseBody?.error || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  const seasonYear = Number.parseInt(String(responseBody?.seasonYear || selectedSeasonYear), 10);
  setTopPlayers(Array.isArray(responseBody?.players) ? responseBody.players : [], seasonYear);
  return responseBody;
}

async function ensureTopPlayersLoaded() {
  if (topPlayers.length > 0 && topPlayersSeasonYear === selectedSeasonYear) {
    return;
  }

  await loadTopPlayers(false);
}

function makeEmptySelections(majors) {
  const selections = {};
  for (const major of majors) {
    selections[major.key] = new Set();
  }
  return selections;
}

function shouldAutoSelectTeam(team) {
  return (team?.players?.length || 0) === 4;
}

function buildAutoSelections(team, majors) {
  const selections = makeEmptySelections(majors || []);
  const pickCount = Math.min(4, team?.players?.length || 0);

  for (const major of majors || []) {
    const selectedSet = new Set();
    for (let playerIndex = 0; playerIndex < pickCount; playerIndex += 1) {
      selectedSet.add(playerIndex);
    }
    selections[major.key] = selectedSet;
  }

  return selections;
}

function hasAnySelections(selections, majors) {
  return (majors || []).some((major) => (selections?.[major.key]?.size || 0) > 0);
}

function serializeSelectionsForApi(team, selections, majors) {
  const result = {};
  const teamPlayers = team?.players || [];

  for (const major of majors || []) {
    const names = [];
    const seen = new Set();
    const selectedIndexes = Array.from(selections?.[major.key] || []);

    for (const index of selectedIndexes) {
      if (!Number.isInteger(index) || index < 0 || index >= teamPlayers.length) {
        continue;
      }

      const playerName = teamPlayers[index]?.name;
      if (!playerName || seen.has(playerName)) {
        continue;
      }

      names.push(playerName);
      seen.add(playerName);

      if (names.length === 4) {
        break;
      }
    }

    result[major.key] = names;
  }

  return result;
}

function buildSelectionsFromSavedRow(team, majors, rawSelections) {
  const selections = makeEmptySelections(majors || []);
  const playerIndexByName = new Map(
    (team?.players || []).map((player, index) => [normalizePlayerName(player.name), index])
  );

  for (const major of majors || []) {
    const rawNames = Array.isArray(rawSelections?.[major.key]) ? rawSelections[major.key] : [];
    const selectedSet = selections[major.key] || new Set();

    for (const rawName of rawNames) {
      const normalized = normalizePlayerName(rawName);
      const playerIndex = playerIndexByName.get(normalized);

      if (typeof playerIndex !== 'number') {
        continue;
      }

      selectedSet.add(playerIndex);
      if (selectedSet.size === 4) {
        break;
      }
    }

    selections[major.key] = selectedSet;
  }

  return selections;
}

function initializeTeamState(payload) {
  teamUiState = {};
  for (const team of payload.teams || []) {
    const autoSelected = shouldAutoSelectTeam(team);
    teamUiState[team.name] = {
      editing: false,
      autoSelected,
      hasSavedSelection: autoSelected,
      selections: autoSelected
        ? buildAutoSelections(team, payload.majors || [])
        : makeEmptySelections(payload.majors || [])
    };
  }
}

function ensureTeamState(teamName) {
  if (!teamUiState[teamName]) {
    teamUiState[teamName] = {
      editing: false,
      autoSelected: false,
      hasSavedSelection: false,
      selections: makeEmptySelections(currentPayload?.majors || [])
    };
  }

  return teamUiState[teamName];
}

function hydrateSavedSelections(payload, rows) {
  const rowsByTeamName = new Map();
  for (const row of rows || []) {
    const teamName = String(row?.team_name || '').trim();
    if (teamName) {
      rowsByTeamName.set(teamName, row);
    }
  }

  for (const team of payload?.teams || []) {
    const state = ensureTeamState(team.name);
    if (shouldAutoSelectTeam(team)) {
      state.autoSelected = true;
      state.editing = false;
      state.hasSavedSelection = true;
      state.selections = buildAutoSelections(team, payload?.majors || []);
      continue;
    }

    state.autoSelected = false;
    const savedRow = rowsByTeamName.get(team.name);

    if (!savedRow) {
      continue;
    }

    state.selections = buildSelectionsFromSavedRow(team, payload?.majors || [], savedRow.selections || {});
    state.hasSavedSelection = hasAnySelections(state.selections, payload?.majors || []);
  }
}

async function fetchSavedSelectionsForSeason(seasonYear, leagueName) {
  const params = new URLSearchParams({
    year: String(seasonYear),
    league: leagueName
  });
  const response = await fetch(`/api/selections?${params.toString()}`);

  let responseBody = null;
  try {
    responseBody = await response.json();
  } catch (error) {
    responseBody = null;
  }

  if (!response.ok) {
    const message = responseBody?.detail || responseBody?.error || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return {
    configured: responseBody?.configured !== false,
    storageReady: responseBody?.storageReady !== false,
    rows: Array.isArray(responseBody?.rows) ? responseBody.rows : []
  };
}

async function persistTeamSelections(teamName, selections) {
  const team = getTeamByName(teamName);
  if (!team || !currentPayload) {
    throw new Error(`Unable to find team: ${teamName}`);
  }

  const body = {
    seasonYear: selectedSeasonYear,
    leagueName: selectedLeagueName,
    teamName,
    selections: serializeSelectionsForApi(team, selections, currentPayload.majors || [])
  };

  const response = await fetch('/api/selections', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  let responseBody = null;
  try {
    responseBody = await response.json();
  } catch (error) {
    responseBody = null;
  }

  if (!response.ok) {
    const message = responseBody?.detail || responseBody?.error || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return responseBody;
}

async function loadLeagues(preferredLeagueName = selectedLeagueName) {
  const response = await fetch('/api/leagues');

  let responseBody = null;
  try {
    responseBody = await response.json();
  } catch (error) {
    responseBody = null;
  }

  if (!response.ok) {
    const message = responseBody?.detail || responseBody?.error || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  availableLeagues = Array.isArray(responseBody?.leagues) ? responseBody.leagues : [];
  if (responseBody?.limits) {
    leagueLimits = responseBody.limits;
  }

  if (preferredLeagueName && availableLeagues.some((league) => league.name === preferredLeagueName)) {
    selectedLeagueName = preferredLeagueName;
  } else if (availableLeagues.length) {
    selectedLeagueName = availableLeagues[0].name;
  } else {
    selectedLeagueName = DEFAULT_LEAGUE_NAME;
  }

  syncLeagueToggle();
}

function createLeaguePlayerRow(initialPlayerName = '') {
  const row = document.createElement('div');
  row.className = 'league-player-row';
  row.innerHTML = `
    <input
      type="text"
      class="league-player-input"
      list="player-options"
      placeholder="Start typing a golfer name"
      value="${String(initialPlayerName || '').trim()}"
      autocomplete="off"
    />
    <button type="button" class="ghost-button remove-player-button">Remove</button>
  `;
  return row;
}

function getLeagueUserRows() {
  return Array.from(leagueUsersList.querySelectorAll('.league-user-row'));
}

function getPlayerRowsForUser(userRow) {
  return Array.from(userRow.querySelectorAll('.league-player-row'));
}

function addPlayerRowToUser(userRow, initialPlayerName = '') {
  const playerList = userRow.querySelector('.league-player-list');
  if (!playerList) {
    return false;
  }

  const currentCount = getPlayerRowsForUser(userRow).length;
  if (currentCount >= leagueLimits.maxPlayersPerUser) {
    leagueFormStatus.textContent = `Each user can have up to ${leagueLimits.maxPlayersPerUser} golfers.`;
    return false;
  }

  playerList.appendChild(createLeaguePlayerRow(initialPlayerName));
  return true;
}

function ensureMinimumPlayerRows(userRow) {
  while (getPlayerRowsForUser(userRow).length < leagueLimits.minPlayersPerUser) {
    addPlayerRowToUser(userRow);
  }
}

function createLeagueUserRow(initialUser = null) {
  const row = document.createElement('div');
  row.className = 'league-user-row';
  row.innerHTML = `
    <div class="league-user-row-top">
      <input
        type="text"
        class="league-user-name"
        maxlength="80"
        placeholder="User name"
        value="${String(initialUser?.name || '').trim()}"
      />
      <div class="league-player-actions">
        <button type="button" class="secondary-button add-player-button">+ Player</button>
        <button type="button" class="ghost-button remove-league-user">Remove User</button>
      </div>
    </div>
    <div class="league-player-list"></div>
  `;

  const initialPlayers = Array.isArray(initialUser?.players)
    ? initialUser.players.slice(0, leagueLimits.maxPlayersPerUser)
    : [];
  const seeds = initialPlayers.length
    ? initialPlayers
    : Array.from({ length: leagueLimits.minPlayersPerUser }, () => '');

  for (const playerName of seeds) {
    addPlayerRowToUser(row, playerName);
  }
  ensureMinimumPlayerRows(row);
  return row;
}

function getLeagueSetupMode() {
  const mode = String(leagueModeSelect?.value || 'selected').trim().toLowerCase();
  if (mode === 'draft') return 'draft';
  if (mode === 'async') return 'async';
  return 'selected';
}

function updateLeagueSetupModeUi(mode = getLeagueSetupMode()) {
  currentLeagueSetupMode = mode;
  const isDraftMode = mode === 'draft' || mode === 'async';

  if (leagueForm) {
    leagueForm.dataset.setupMode = mode;
  }

  if (leagueUsersList) {
    leagueUsersList.classList.toggle('is-draft-mode', isDraftMode);
  }

  if (draftRoundsWrap) {
    draftRoundsWrap.classList.toggle('hidden-field', !isDraftMode);
  }

  if (excludeSchefflerWrap) {
    excludeSchefflerWrap.classList.toggle('hidden-field', !isDraftMode);
  }

  if (leagueFormHint) {
    if (mode === 'async') {
      leagueFormHint.textContent = 'Enter user names in draft order, pick rounds, then start the async draft. Anyone can open the draft link to make picks when it\'s their turn.';
    } else if (mode === 'draft') {
      leagueFormHint.textContent = 'Enter user names, pick 4-8 rounds, then continue to the live snake draft board.';
    } else {
      leagueFormHint.textContent = 'Each user needs 4-8 golfers. Start with 4 and click + Player to add more.';
    }
  }

  const submitButton = leagueForm?.querySelector('button[type="submit"]');
  if (submitButton) {
    if (mode === 'async') submitButton.textContent = 'Start Async Draft';
    else if (mode === 'draft') submitButton.textContent = 'Continue to Draft';
    else submitButton.textContent = 'Save League';
  }
}

function resetLeagueForm() {
  leagueNameInput.value = '';
  leagueFormStatus.textContent = '';
  if (leagueModeSelect) {
    leagueModeSelect.value = 'selected';
  }
  if (draftRoundsSelect) {
    draftRoundsSelect.value = String(leagueLimits.minPlayersPerUser);
  }
  if (excludeSchefflerCheckbox) {
    excludeSchefflerCheckbox.checked = false;
  }
  updateLeagueSetupModeUi('selected');
  leagueUsersList.innerHTML = '';
  leagueUsersList.appendChild(createLeagueUserRow());
  leagueUsersList.appendChild(createLeagueUserRow());
}

async function openLeagueModal() {
  if (!leagueModal) {
    return;
  }

  resetLeagueForm();
  leagueModal.classList.remove('hidden');
  leagueFormStatus.textContent = 'Loading top players...';

  try {
    await ensureTopPlayersLoaded();
    leagueFormStatus.textContent = '';
  } catch (error) {
    leagueFormStatus.textContent = `Could not load top players: ${error.message}`;
  }
}

function closeLeagueModal() {
  if (!leagueModal) {
    return;
  }
  leagueModal.classList.add('hidden');
}

function addLeagueUserRow() {
  const currentCount = getLeagueUserRows().length;
  if (currentCount >= leagueLimits.maxUsers) {
    leagueFormStatus.textContent = `You can add up to ${leagueLimits.maxUsers} users per league.`;
    return;
  }

  leagueUsersList.appendChild(createLeagueUserRow());
  leagueFormStatus.textContent = '';
}

function validateLeaguePlayerAssignments(showStatus = false) {
  if (currentLeagueSetupMode === 'draft') {
    if (showStatus) {
      leagueFormStatus.textContent = '';
    }
    return {
      ok: true,
      message: ''
    };
  }

  const playerInputs = Array.from(leagueUsersList.querySelectorAll('.league-player-input'));
  for (const input of playerInputs) {
    input.setCustomValidity('');
  }

  if (topPlayerByNormalizedName.size === 0) {
    const message = 'Top player list is still loading. Please try again in a moment.';
    if (showStatus) {
      leagueFormStatus.textContent = message;
    }
    return {
      ok: false,
      message
    };
  }

  const playerMap = new Map();
  let errorMessage = '';

  for (const userRow of getLeagueUserRows()) {
    const userName = String(userRow.querySelector('.league-user-name')?.value || '').trim() || 'Unnamed User';
    const userPlayerInputs = Array.from(userRow.querySelectorAll('.league-player-input'));

    for (const input of userPlayerInputs) {
      const rawValue = String(input.value || '').trim();
      if (!rawValue) {
        continue;
      }

      const canonical = canonicalPlayerName(rawValue);
      if (!canonical) {
        input.setCustomValidity('Choose a golfer from the top-200 dropdown list.');
        if (!errorMessage) {
          errorMessage = `Unknown golfer "${rawValue}". Choose from the top-200 list.`;
        }
        continue;
      }

      input.value = canonical;
      if (!playerMap.has(canonical)) {
        playerMap.set(canonical, []);
      }
      playerMap.get(canonical).push({
        input,
        userName
      });
    }
  }

  for (const [playerName, assignments] of playerMap.entries()) {
    if (assignments.length <= 1) {
      continue;
    }

    const users = assignments.map((assignment) => assignment.userName);
    const duplicateMessage = `${playerName} is assigned more than once (${users.join(', ')}).`;
    for (const assignment of assignments) {
      assignment.input.setCustomValidity('A golfer can only be used by one user in a league.');
    }
    if (!errorMessage) {
      errorMessage = duplicateMessage;
    }
  }

  if (showStatus) {
    leagueFormStatus.textContent = errorMessage;
  }

  return {
    ok: !errorMessage,
    message: errorMessage
  };
}

function collectLeagueUsersFromForm() {
  const rows = getLeagueUserRows();
  if (!rows.length) {
    throw new Error('Add at least one user.');
  }

  if (rows.length > leagueLimits.maxUsers) {
    throw new Error(`You can add up to ${leagueLimits.maxUsers} users per league.`);
  }

  const users = [];
  const seenUserNames = new Set();
  const seenLeaguePlayers = new Map();

  for (const [index, row] of rows.entries()) {
    const userNameInput = row.querySelector('.league-user-name');
    const userName = String(userNameInput?.value || '').trim();

    if (!userName) {
      throw new Error(`User ${index + 1} is missing a name.`);
    }

    const normalizedUserName = normalizePlayerName(userName);
    if (seenUserNames.has(normalizedUserName)) {
      throw new Error(`Duplicate user name: ${userName}`);
    }
    seenUserNames.add(normalizedUserName);

    const playerInputs = Array.from(row.querySelectorAll('.league-player-input'));
    const players = [];
    const seenUserPlayers = new Set();

    for (const input of playerInputs) {
      const rawValue = String(input.value || '').trim();
      if (!rawValue) {
        continue;
      }

      const canonical = canonicalPlayerName(rawValue);
      if (!canonical) {
        throw new Error(`Unknown golfer "${rawValue}" for ${userName}. Choose from the top-200 list.`);
      }

      const normalizedPlayer = normalizePlayerName(canonical);
      if (seenUserPlayers.has(normalizedPlayer)) {
        continue;
      }
      seenUserPlayers.add(normalizedPlayer);
      players.push(canonical);
    }

    if (players.length < leagueLimits.minPlayersPerUser || players.length > leagueLimits.maxPlayersPerUser) {
      throw new Error(
        `${userName} must have ${leagueLimits.minPlayersPerUser}-${leagueLimits.maxPlayersPerUser} golfers.`
      );
    }

    for (const playerName of players) {
      const normalizedPlayer = normalizePlayerName(playerName);
      if (seenLeaguePlayers.has(normalizedPlayer)) {
        const existingUser = seenLeaguePlayers.get(normalizedPlayer);
        throw new Error(`${playerName} is already assigned to ${existingUser}.`);
      }
      seenLeaguePlayers.set(normalizedPlayer, userName);
    }

    users.push({
      name: userName,
      players
    });
  }

  return users;
}

function collectLeagueUsersForDraft() {
  const rows = getLeagueUserRows();
  if (!rows.length) {
    throw new Error("Add at least one user.");
  }

  if (rows.length > leagueLimits.maxUsers) {
    throw new Error("You can add up to " + leagueLimits.maxUsers + " users per league.");
  }

  const users = [];
  const seenUserNames = new Set();

  for (const [index, row] of rows.entries()) {
    const userNameInput = row.querySelector(".league-user-name");
    const userName = String(userNameInput?.value || "").trim();

    if (!userName) {
      throw new Error("User " + (index + 1) + " is missing a name.");
    }

    const normalizedUserName = normalizePlayerName(userName);
    if (seenUserNames.has(normalizedUserName)) {
      throw new Error("Duplicate user name: " + userName);
    }
    seenUserNames.add(normalizedUserName);

    users.push({
      name: userName
    });
  }

  return users;
}

function startDraftFromForm(leagueName, draftMode) {
  const users = collectLeagueUsersForDraft();
  const roundsInput = Number.parseInt(String(draftRoundsSelect?.value || leagueLimits.minPlayersPerUser), 10);
  const rounds = Number.isNaN(roundsInput)
    ? leagueLimits.minPlayersPerUser
    : Math.max(leagueLimits.minPlayersPerUser, Math.min(leagueLimits.maxPlayersPerUser, roundsInput));

  const draftSetup = {
    leagueName,
    seasonYear: DRAFT_SEASON_YEAR,
    rounds,
    users,
    draftMode: draftMode === 'async' ? 'async' : 'snake',
    excludeScheffler: !!(excludeSchefflerCheckbox?.checked),
    createdAt: new Date().toISOString()
  };

  try {
    window.sessionStorage.setItem(DRAFT_SETUP_STORAGE_KEY, JSON.stringify(draftSetup));
  } catch (error) {
    throw new Error("Could not start draft because browser storage is blocked.");
  }

  closeLeagueModal();
  window.location.href = "/draft.html";
}

async function createLeagueFromForm(event) {
  event.preventDefault();
  leagueFormStatus.textContent = "";

  const leagueName = String(leagueNameInput.value || "").trim();
  if (!leagueName) {
    leagueFormStatus.textContent = "League name is required.";
    return;
  }

  const setupMode = getLeagueSetupMode();
  updateLeagueSetupModeUi(setupMode);

  if (setupMode === "draft" || setupMode === "async") {
    try {
      startDraftFromForm(leagueName, setupMode);
    } catch (error) {
      leagueFormStatus.textContent = error.message;
    }
    return;
  }

  const liveValidation = validateLeaguePlayerAssignments(true);
  if (!liveValidation.ok) {
    return;
  }

  let users = [];
  try {
    users = collectLeagueUsersFromForm();
  } catch (error) {
    leagueFormStatus.textContent = error.message;
    return;
  }

  leagueFormStatus.textContent = "Saving league...";

  try {
    const response = await fetch("/api/leagues", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: leagueName,
        users
      })
    });

    const responseBody = await response.json();
    if (!response.ok) {
      throw new Error(responseBody?.detail || responseBody?.error || "Request failed with status " + response.status);
    }

    const savedLeagueName = responseBody?.league?.name || leagueName;
    await loadLeagues(savedLeagueName);
    selectedLeagueName = savedLeagueName;
    closeLeagueModal();
    await loadData(false);
    statusNode.textContent = "Created league " + savedLeagueName + ".";
  } catch (error) {
    leagueFormStatus.textContent = error.message;
  }
}

async function deleteCurrentLeague() {
  if (selectedLeagueName === DEFAULT_LEAGUE_NAME) {
    statusNode.textContent = `${DEFAULT_LEAGUE_NAME} is the default league and cannot be deleted.`;
    return;
  }

  const confirmed = window.confirm(`Delete league "${selectedLeagueName}"? This cannot be undone.`);
  if (!confirmed) {
    return;
  }

  statusNode.textContent = `Deleting league ${selectedLeagueName}...`;

  try {
    const response = await fetch('/api/leagues', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: selectedLeagueName
      })
    });

    const responseBody = await response.json();
    if (!response.ok) {
      throw new Error(responseBody?.detail || responseBody?.error || `Request failed with status ${response.status}`);
    }

    await loadLeagues(DEFAULT_LEAGUE_NAME);
    selectedLeagueName = DEFAULT_LEAGUE_NAME;
    await loadData(false);
    statusNode.textContent = `Deleted league ${responseBody?.league?.name || 'selected league'}.`;
  } catch (error) {
    statusNode.textContent = `Could not delete league: ${error.message}`;
  }
}

function computeTop3FromSelections(team, majors, selections) {
  const majorTotals = {};
  let overallSum = 0;
  let hasOverallValues = false;
  let overallPartial = false;

  for (const major of majors) {
    const selectedIndexes = Array.from(selections[major.key] || []);
    const selectedScoreValues = selectedIndexes
      .map((index) => parseScoreValue(team.players?.[index]?.majorScores?.[major.key]));
    const selectedScores = selectedScoreValues
      .filter((value) => typeof value === 'number');
    const missingScores = selectedScoreValues.length - selectedScores.length;
    const scoredWithFallback = applyMissingScoreRule(selectedScores, missingScores, major.key)
      .sort((a, b) => a - b);

    const bestThree = scoredWithFallback.slice(0, 3);

    if (bestThree.length === 0) {
      majorTotals[major.key] = {
        display: '-',
        value: null,
        partial: true
      };
      overallPartial = true;
      continue;
    }

    const sum = bestThree.reduce((running, score) => running + score, 0);
    const partial = bestThree.length < 3;

    majorTotals[major.key] = {
      display: formatScoreValue(sum, partial),
      value: sum,
      partial
    };

    overallSum += sum;
    hasOverallValues = true;
    if (partial) {
      overallPartial = true;
    }
  }

  return {
    majorTotals,
    overallDisplay: hasOverallValues ? formatScoreValue(overallSum, overallPartial) : '-'
  };
}

function ensureValidActiveTab(payload) {
  const allowedTabs = ['season', ...(payload.majors || []).map((major) => major.key)];
  if (!allowedTabs.includes(activeTab)) {
    activeTab = 'season';
  }
}

function buildTabsMarkup(payload) {
  const majorTabs = (payload.majors || [])
    .map((major) => {
      const activeClass = activeTab === major.key ? ' is-active' : '';
      return `<button type="button" class="view-tab${activeClass}" data-tab="${major.key}">${major.name}</button>`;
    })
    .join('');

  return `
    <nav class="view-tabs" aria-label="View Tabs">
      <button type="button" class="view-tab${activeTab === 'season' ? ' is-active' : ''}" data-tab="season">${getSeasonTabLabel()}</button>
      ${majorTabs}
    </nav>
  `;
}

function buildSeasonView(payload) {
  const majors = payload.majors || [];
  const teams = payload.teams || [];

  if (!teams.length) {
    return '<p class="status">No users found in this league.</p>';
  }

  const cards = teams.map((team) => {
    const state = ensureTeamState(team.name);
    const isAutoSelected = state.autoSelected || shouldAutoSelectTeam(team);

    const headerCells = majors
      .map((major) => `<th scope="col">${major.name}</th>`)
      .join('');

    const top3DisplayData = state.hasSavedSelection
      ? computeTop3FromSelections(team, majors, state.selections)
      : {
          majorTotals: team.totals?.top3?.majorTotals || {},
          overallDisplay: team.totals?.top3?.overall?.display || '-'
        };

    const bodyRows = team.players
      .map((player, playerIndex) => {
        const anyMajorSelected = majors.some((major) => state.selections[major.key]?.has(playerIndex));

        const majorCells = majors
          .map((major) => {
            if (state.editing) {
              const selectedSet = state.selections[major.key] || new Set();
              const checked = selectedSet.has(playerIndex);
              const isAtLimit = selectedSet.size >= 4;
              const disabled = !checked && isAtLimit;

              return `
                <td class="checkbox-cell">
                  <input
                    type="checkbox"
                    class="pick-checkbox"
                    data-team="${team.name}"
                    data-major="${major.key}"
                    data-player-index="${playerIndex}"
                    ${checked ? 'checked' : ''}
                    ${disabled ? 'disabled' : ''}
                    aria-label="Select ${player.name} for ${major.name}"
                  />
                </td>
              `;
            }

            const score = player.majorScores?.[major.key] || '-';
            const muted = state.hasSavedSelection && !state.selections[major.key]?.has(playerIndex);
            return `<td class="score ${scoreClass(score)}${muted ? ' muted-score' : ''}">${score}</td>`;
          })
          .join('');

        const overallScore = state.editing ? '—' : (player.overall || '-');
        const overallMuted = !state.editing && state.hasSavedSelection && !anyMajorSelected;

        return `
          <tr>
            <td>${player.name}</td>
            ${majorCells}
            <td class="score ${scoreClass(overallScore)}${overallMuted ? ' muted-score' : ''}">${overallScore}</td>
          </tr>
        `;
      })
      .join('');

    let totalRowCells = '';
    let totalOverall = '—';
    let top3RowCells = '';
    let top3Overall = '—';

    if (!state.editing) {
      totalRowCells = majors
        .map((major) => {
          const display = team.totals?.majorTotals?.[major.key]?.display || '-';
          return `<td class="score ${scoreClass(display)}">${display}</td>`;
        })
        .join('');
      totalOverall = team.totals?.overall?.display || '-';

      top3RowCells = majors
        .map((major) => {
          const display = top3DisplayData.majorTotals?.[major.key]?.display || '-';
          return `<td class="score ${scoreClass(display)}">${display}</td>`;
        })
        .join('');
      top3Overall = top3DisplayData.overallDisplay || '-';
    } else {
      totalRowCells = majors.map(() => '<td class="score na">—</td>').join('');
      top3RowCells = majors.map(() => '<td class="score na">—</td>').join('');
    }

    const showPartialNote = !state.editing && (String(totalOverall).includes('*') || String(top3Overall).includes('*'));

    return `
      <article class="team-card">
        <div class="team-card-head">
          <h2>${team.name}</h2>
          ${isAutoSelected
            ? '<span class="footnote">Auto-selected (4 players)</span>'
            : `<button type="button" class="team-edit-button" data-team="${team.name}">
            ${state.editing ? 'Save' : 'Edit'}
          </button>`}
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Player</th>
                ${headerCells}
                <th scope="col">Overall</th>
              </tr>
            </thead>
            <tbody>
              ${bodyRows}
            </tbody>
            <tfoot>
              <tr class="team-total-row">
                <th scope="row">${team.name} Total</th>
                ${totalRowCells}
                <td class="score ${scoreClass(totalOverall)}">${totalOverall}</td>
              </tr>
              <tr class="team-top3-row">
                <th scope="row">Top 3</th>
                ${top3RowCells}
                <td class="score ${scoreClass(top3Overall)}">${top3Overall}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        ${showPartialNote ? '<p class="footnote">* Partial total due to missing player score(s).</p>' : ''}
      </article>
    `;
  });

  return `<section class="teams-grid">${cards.join('')}</section>`;
}

function buildMajorScoreboardView(payload, majorKey) {
  const major = getMajorByKey(majorKey);
  if (!major) {
    return '<p class="status">Unable to load this major scoreboard.</p>';
  }

  const rows = (payload.teams || []).map((team) => {
    const state = ensureTeamState(team.name);
    const pickedIndexes = state.hasSavedSelection ? Array.from(state.selections[majorKey] || []) : [];
    const pickedPlayers = pickedIndexes
      .map((index) => ({
        index,
        player: team.players?.[index] || null
      }))
      .filter((entry) => entry.player)
      .slice(0, 4);

    const pickSlots = Array.from({ length: 4 }).map((_, slotIndex) => {
      const picked = pickedPlayers[slotIndex];
      if (!picked) {
        return {
          name: null,
          scoreText: null,
          scoreValue: null
        };
      }

      const scoreText = picked.player.majorScores?.[majorKey] || '-';
      return {
        name: picked.player.name,
        scoreText,
        scoreValue: parseScoreValue(scoreText)
      };
    });

    const pickedScoreValues = pickSlots
      .filter((slot) => slot.name)
      .map((slot) => slot.scoreValue);
    const selectedScoreValues = pickedScoreValues
      .filter((value) => typeof value === 'number');
    const missingScores = pickedScoreValues.length - selectedScoreValues.length;
    const scoredWithFallback = applyMissingScoreRule(selectedScoreValues, missingScores, majorKey);

    const selected4Sum = scoredWithFallback.length
      ? scoredWithFallback.reduce((sum, value) => sum + value, 0)
      : null;
    const selected4Partial = pickedPlayers.length < 4 || missingScores > 0;
    const selected4Display = selected4Sum === null
      ? '-'
      : formatScoreValue(selected4Sum, selected4Partial);

    const top3Values = [...scoredWithFallback].sort((a, b) => a - b).slice(0, 3);
    const top3Sum = top3Values.length ? top3Values.reduce((sum, value) => sum + value, 0) : null;
    const top3Partial = top3Values.length < 3;
    const top3Display = top3Sum === null
      ? '-'
      : formatScoreValue(top3Sum, top3Partial);

    return {
      team: team.name,
      pickSlots,
      selected4Display,
      selected4Value: selected4Sum,
      top3Display,
      top3Value: top3Sum
    };
  });

  rows.sort((a, b) => {
    const aValue = a.top3Value === null ? Number.POSITIVE_INFINITY : a.top3Value;
    const bValue = b.top3Value === null ? Number.POSITIVE_INFINITY : b.top3Value;

    if (aValue !== bValue) {
      return aValue - bValue;
    }

    return a.team.localeCompare(b.team);
  });

  let rankCounter = 1;
  const bodyRows = rows
    .map((row) => {
      const rank = row.top3Value === null ? '—' : rankCounter++;

      const pickCells = row.pickSlots
        .map((slot) => {
          if (!slot.name) {
            return '<td class="pick-cell"><span class="pick-empty">—</span></td>';
          }

          return `
            <td class="pick-cell">
              <div class="pick-card">
                <span class="pick-name">${slot.name}</span>
                <span class="pick-score score ${scoreClass(slot.scoreText)}">${slot.scoreText}</span>
              </div>
            </td>
          `;
        })
        .join('');

      return `
        <tr>
          <td>${rank}</td>
          <td>${row.team}</td>
          ${pickCells}
          <td class="score ${scoreClass(row.selected4Display)}">${row.selected4Display}</td>
          <td class="score ${scoreClass(row.top3Display)}">${row.top3Display}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <section class="major-board">
      <h3>${major.name} Scoreboard</h3>
      <p class="major-subtitle">Compares each user's saved 4-player picks for this major. Top 3 is the best three scores from the four picks.</p>
      <div class="table-wrap">
        <table class="major-scoreboard-table">
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">User</th>
              <th scope="col">Pick 1</th>
              <th scope="col">Pick 2</th>
              <th scope="col">Pick 3</th>
              <th scope="col">Pick 4</th>
              <th scope="col">Selected 4 Total</th>
              <th scope="col">Top 3 (of 4)</th>
            </tr>
          </thead>
          <tbody>
            ${bodyRows}
          </tbody>
        </table>
      </div>
      <p class="footnote">* Partial total due to missing player score(s) or fewer than the required picks.</p>
    </section>
  `;
}

function renderApp(payload) {
  ensureValidActiveTab(payload);

  const tabs = buildTabsMarkup(payload);
  const view = activeTab === 'season'
    ? buildSeasonView(payload)
    : buildMajorScoreboardView(payload, activeTab);

  teamsContainer.innerHTML = `${tabs}${view}`;
}

function setDefaultStatusForTab() {
  if (!currentPayload) {
    return;
  }

  if (activeTab === 'season') {
    statusNode.textContent = `Viewing ${selectedLeagueName} (${selectedSeasonYear}) data. Click Edit on any user table to choose up to 4 players per major.`;
    return;
  }

  statusNode.textContent = `Viewing ${selectedLeagueName} ${selectedSeasonYear} ${getMajorName(activeTab)} scoreboard with each user's saved picks.`;
}

function onContainerClick(event) {
  const tabButton = event.target.closest('.view-tab');
  if (tabButton && currentPayload) {
    activeTab = tabButton.dataset.tab || 'season';
    renderApp(currentPayload);
    setDefaultStatusForTab();
    return;
  }

  const button = event.target.closest('.team-edit-button');
  if (!button || !currentPayload) {
    return;
  }

  const teamName = button.dataset.team;
  const state = ensureTeamState(teamName);
  const team = getTeamByName(teamName);

  if (state.autoSelected || shouldAutoSelectTeam(team)) {
    statusNode.textContent = `${teamName} has 4 players, so all 4 are auto-selected for every major.`;
    return;
  }

  if (state.editing) {
    state.editing = false;
    state.hasSavedSelection = hasAnySelections(state.selections, currentPayload.majors || []);
    renderApp(currentPayload);

    statusNode.textContent = `Saving selections for ${teamName} in ${selectedLeagueName}...`;
    persistTeamSelections(teamName, state.selections)
      .then(() => {
        statusNode.textContent = `Saved selections for ${teamName} (${selectedLeagueName}, ${selectedSeasonYear}).`;
      })
      .catch((error) => {
        statusNode.textContent = `Saved locally for ${teamName}, but Supabase sync failed: ${error.message}`;
      });
    return;
  }

  activeTab = 'season';
  state.editing = true;
  if (!state.hasSavedSelection) {
    state.selections = makeEmptySelections(currentPayload.majors || []);
  }
  statusNode.textContent = `Editing ${teamName}: choose up to 4 players per major.`;

  renderApp(currentPayload);
}

function onSelectionChange(event) {
  const checkbox = event.target;
  if (!checkbox.classList.contains('pick-checkbox') || !currentPayload) {
    return;
  }

  const teamName = checkbox.dataset.team;
  const majorKey = checkbox.dataset.major;
  const playerIndex = Number.parseInt(checkbox.dataset.playerIndex || '-1', 10);

  if (!teamName || !majorKey || Number.isNaN(playerIndex) || playerIndex < 0) {
    return;
  }

  const state = ensureTeamState(teamName);
  const selectedSet = state.selections[majorKey] || new Set();

  if (checkbox.checked) {
    if (selectedSet.size >= 4) {
      checkbox.checked = false;
      statusNode.textContent = `You can select up to 4 players for ${getMajorName(majorKey)} in ${teamName}.`;
      return;
    }

    selectedSet.add(playerIndex);
  } else {
    selectedSet.delete(playerIndex);
  }

  state.selections[majorKey] = selectedSet;
  statusNode.textContent = `${teamName} ${getMajorName(majorKey)} picks: ${selectedSet.size}/4 selected.`;
  renderApp(currentPayload);
}

async function loadData(forceRefresh = false) {
  statusNode.textContent = `Loading ${selectedLeagueName} league data...`;

  try {
    const params = new URLSearchParams({
      year: String(selectedSeasonYear),
      league: selectedLeagueName
    });
    if (forceRefresh) {
      params.set('refresh', '1');
    }

    const response = await fetch(`/api/majors?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    currentPayload = await response.json();
    selectedSeasonYear = Number.parseInt(String(currentPayload?.seasonYear || selectedSeasonYear), 10);
    selectedLeagueName = String(currentPayload?.leagueName || selectedLeagueName);
    syncYearToggle(currentPayload);
    syncLeagueToggle();
    initializeTeamState(currentPayload);

    let selectionsStatusNote = '';
    try {
      const selectionsPayload = await fetchSavedSelectionsForSeason(selectedSeasonYear, selectedLeagueName);
      if (selectionsPayload.configured && selectionsPayload.storageReady) {
        hydrateSavedSelections(currentPayload, selectionsPayload.rows);
      } else if (!selectionsPayload.configured) {
        selectionsStatusNote = 'Supabase is not configured yet, so picks are not being persisted.';
      } else {
        selectionsStatusNote = 'Selections table is not set up yet. Run the latest Supabase SQL.';
      }
    } catch (error) {
      selectionsStatusNote = `Could not load saved picks: ${error.message}`;
    }

    renderApp(currentPayload);

    subtitleNode.textContent = '';
    updatedAtNode.textContent = `Updated ${toFriendlyDate(currentPayload.updatedAt)}`;
    setDefaultStatusForTab();
    if (selectionsStatusNote) {
      statusNode.textContent = `${statusNode.textContent} ${selectionsStatusNote}`;
    }
  } catch (error) {
    statusNode.textContent = `Error loading data: ${error.message}`;
    teamsContainer.innerHTML = '<p class="status">Unable to load data.</p>';
  }
}

async function initializeApp() {
  try {
    await loadLeagues(selectedLeagueName);
  } catch (error) {
    statusNode.textContent = `Could not load leagues: ${error.message}`;
    availableLeagues = [{ name: DEFAULT_LEAGUE_NAME }];
    selectedLeagueName = DEFAULT_LEAGUE_NAME;
    syncLeagueToggle();
  }

  try {
    await loadTopPlayers(false);
  } catch (error) {
    statusNode.textContent = `Could not load top players: ${error.message}`;
  }

  await loadData(false);
}

teamsContainer.addEventListener('click', onContainerClick);
teamsContainer.addEventListener('change', onSelectionChange);

refreshButton.addEventListener('click', () => {
  loadData(true);
});

if (yearToggleNode) {
  yearToggleNode.addEventListener('change', (event) => {
    const target = event.target;
    const parsedYear = Number.parseInt(String(target.value || ''), 10);
    if (!Number.isNaN(parsedYear)) {
      selectedSeasonYear = parsedYear;
      loadTopPlayers(false).catch((error) => {
        statusNode.textContent = `Could not refresh top players: ${error.message}`;
      });
      loadData(false);
    }
  });
}

if (leagueToggleNode) {
  leagueToggleNode.addEventListener('change', (event) => {
    const target = event.target;
    const leagueName = String(target.value || '').trim();
    if (leagueName) {
      selectedLeagueName = leagueName;
      loadData(false);
    }
  });
}

if (newLeagueButton) {
  newLeagueButton.addEventListener('click', () => {
    openLeagueModal();
  });
}

if (deleteLeagueButton) {
  deleteLeagueButton.addEventListener('click', () => {
    deleteCurrentLeague();
  });
}

if (closeLeagueModalButton) {
  closeLeagueModalButton.addEventListener('click', closeLeagueModal);
}

if (leagueModeSelect) {
  leagueModeSelect.addEventListener('change', (event) => {
    const raw = String(event.target?.value || 'selected').trim().toLowerCase();
    const mode = raw === 'draft' ? 'draft' : raw === 'async' ? 'async' : 'selected';

    updateLeagueSetupModeUi(mode);
    leagueFormStatus.textContent = '';

    if (mode === 'selected' && topPlayers.length === 0) {
      ensureTopPlayersLoaded().catch((error) => {
        leagueFormStatus.textContent = 'Could not load top players: ' + error.message;
      });
    }
  });
}

if (leagueModal) {
  leagueModal.addEventListener('click', (event) => {
    if (event.target === leagueModal) {
      closeLeagueModal();
    }
  });
}

if (addLeagueUserButton) {
  addLeagueUserButton.addEventListener('click', addLeagueUserRow);
}

if (leagueUsersList) {
  leagueUsersList.addEventListener('click', (event) => {
    const addPlayerButton = event.target.closest('.add-player-button');
    if (addPlayerButton) {
      if (currentLeagueSetupMode === 'draft') {
        return;
      }

      const userRow = addPlayerButton.closest('.league-user-row');
      if (!userRow) {
        return;
      }

      addPlayerRowToUser(userRow);
      validateLeaguePlayerAssignments(true);
      return;
    }

    const removePlayerButton = event.target.closest('.remove-player-button');
    if (removePlayerButton) {
      if (currentLeagueSetupMode === 'draft') {
        return;
      }

      const playerRow = removePlayerButton.closest('.league-player-row');
      const userRow = removePlayerButton.closest('.league-user-row');
      if (!playerRow || !userRow) {
        return;
      }

      const playerRows = getPlayerRowsForUser(userRow);
      if (playerRows.length <= leagueLimits.minPlayersPerUser) {
        leagueFormStatus.textContent = `Each user needs at least ${leagueLimits.minPlayersPerUser} golfers.`;
        return;
      }

      playerRow.remove();
      validateLeaguePlayerAssignments(true);
      return;
    }

    const removeButton = event.target.closest('.remove-league-user');
    if (!removeButton) {
      return;
    }

    const row = removeButton.closest('.league-user-row');
    if (!row) {
      return;
    }

    row.remove();
    if (!leagueUsersList.querySelector('.league-user-row')) {
      addLeagueUserRow();
    }
    validateLeaguePlayerAssignments(true);
  });

  leagueUsersList.addEventListener('change', (event) => {
    const playerInput = event.target.closest('.league-player-input');
    if (!playerInput) {
      return;
    }

    if (currentLeagueSetupMode === 'draft') {
      return;
    }

    const canonical = canonicalPlayerName(playerInput.value);
    if (canonical) {
      playerInput.value = canonical;
    }
    validateLeaguePlayerAssignments(true);
  });

  leagueUsersList.addEventListener('input', (event) => {
    const playerInput = event.target.closest('.league-player-input');
    if (!playerInput) {
      return;
    }

    if (currentLeagueSetupMode === 'draft') {
      return;
    }

    playerInput.setCustomValidity('');
  });
}

if (leagueForm) {
  leagueForm.addEventListener('submit', createLeagueFromForm);
}

initializeApp();
