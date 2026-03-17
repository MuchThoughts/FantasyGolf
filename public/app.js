const teamsContainer = document.getElementById('teams-container');
const statusNode = document.getElementById('status');
const subtitleNode = document.getElementById('subtitle');
const updatedAtNode = document.getElementById('updated-at');
const refreshButton = document.getElementById('refresh');
const yearToggleNode = document.getElementById('year-toggle');
const leagueToggleNode = document.getElementById('league-toggle');
const newLeagueButton = document.getElementById('new-league');
const leagueModal = document.getElementById('league-modal');
const closeLeagueModalButton = document.getElementById('close-league-modal');
const leagueForm = document.getElementById('league-form');
const leagueNameInput = document.getElementById('league-name-input');
const addLeagueUserButton = document.getElementById('add-league-user');
const leagueUsersList = document.getElementById('league-users-list');
const leagueFormStatus = document.getElementById('league-form-status');

const DEFAULT_LEAGUE_NAME = 'Davidson';

let currentPayload = null;
let teamUiState = {};
let activeTab = 'season';
let selectedSeasonYear = 2025;
let selectedLeagueName = DEFAULT_LEAGUE_NAME;
let availableLeagues = [];
let leagueLimits = {
  maxUsers: 20,
  minPlayersPerUser: 4,
  maxPlayersPerUser: 8
};

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
  if (score === null || score === undefined || score === 'N/A') {
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
  if (!value || value === 'N/A') {
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

function formatScoreValue(scoreValue, partial = false) {
  if (scoreValue === null || scoreValue === undefined || Number.isNaN(scoreValue)) {
    return 'N/A';
  }

  const base = scoreValue === 0 ? 'E' : scoreValue > 0 ? `+${scoreValue}` : `${scoreValue}`;
  return partial ? `${base}*` : base;
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
}

function makeEmptySelections(majors) {
  const selections = {};
  for (const major of majors) {
    selections[major.key] = new Set();
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
    teamUiState[team.name] = {
      editing: false,
      hasSavedSelection: false,
      selections: makeEmptySelections(payload.majors || [])
    };
  }
}

function ensureTeamState(teamName) {
  if (!teamUiState[teamName]) {
    teamUiState[teamName] = {
      editing: false,
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

function createLeagueUserRow(initialUser = null) {
  const row = document.createElement('div');
  row.className = 'league-user-row';

  const userName = initialUser?.name || '';
  const playerLines = Array.isArray(initialUser?.players) ? initialUser.players.join('\n') : '';

  row.innerHTML = `
    <div class="league-user-row-top">
      <input
        type="text"
        class="league-user-name"
        maxlength="80"
        placeholder="User name"
        value="${userName}"
      />
      <button type="button" class="ghost-button remove-league-user">Remove</button>
    </div>
    <textarea
      class="league-user-players"
      rows="4"
      placeholder="One golfer per line"
    >${playerLines}</textarea>
  `;

  return row;
}

function resetLeagueForm() {
  leagueNameInput.value = '';
  leagueFormStatus.textContent = '';
  leagueUsersList.innerHTML = '';
  leagueUsersList.appendChild(createLeagueUserRow());
  leagueUsersList.appendChild(createLeagueUserRow());
}

function openLeagueModal() {
  if (!leagueModal) {
    return;
  }
  resetLeagueForm();
  leagueModal.classList.remove('hidden');
}

function closeLeagueModal() {
  if (!leagueModal) {
    return;
  }
  leagueModal.classList.add('hidden');
}

function addLeagueUserRow() {
  const currentCount = leagueUsersList.querySelectorAll('.league-user-row').length;
  if (currentCount >= leagueLimits.maxUsers) {
    leagueFormStatus.textContent = `You can add up to ${leagueLimits.maxUsers} users per league.`;
    return;
  }

  leagueUsersList.appendChild(createLeagueUserRow());
  leagueFormStatus.textContent = '';
}

function collectLeagueUsersFromForm() {
  const rows = Array.from(leagueUsersList.querySelectorAll('.league-user-row'));
  if (!rows.length) {
    throw new Error('Add at least one user.');
  }

  if (rows.length > leagueLimits.maxUsers) {
    throw new Error(`You can add up to ${leagueLimits.maxUsers} users per league.`);
  }

  const users = [];
  const seenUserNames = new Set();

  for (const [index, row] of rows.entries()) {
    const userNameInput = row.querySelector('.league-user-name');
    const playersInput = row.querySelector('.league-user-players');
    const userName = String(userNameInput?.value || '').trim();

    if (!userName) {
      throw new Error(`User ${index + 1} is missing a name.`);
    }

    const normalizedUserName = normalizePlayerName(userName);
    if (seenUserNames.has(normalizedUserName)) {
      throw new Error(`Duplicate user name: ${userName}`);
    }
    seenUserNames.add(normalizedUserName);

    const players = String(playersInput?.value || '')
      .split('\n')
      .map((name) => name.trim())
      .filter(Boolean);

    const uniquePlayers = [];
    const seenPlayers = new Set();
    for (const player of players) {
      const normalizedPlayer = normalizePlayerName(player);
      if (seenPlayers.has(normalizedPlayer)) {
        continue;
      }
      seenPlayers.add(normalizedPlayer);
      uniquePlayers.push(player);
    }

    if (uniquePlayers.length < leagueLimits.minPlayersPerUser || uniquePlayers.length > leagueLimits.maxPlayersPerUser) {
      throw new Error(
        `${userName} must have ${leagueLimits.minPlayersPerUser}-${leagueLimits.maxPlayersPerUser} golfers.`
      );
    }

    users.push({
      name: userName,
      players: uniquePlayers
    });
  }

  return users;
}

async function createLeagueFromForm(event) {
  event.preventDefault();
  leagueFormStatus.textContent = '';

  const leagueName = String(leagueNameInput.value || '').trim();
  if (!leagueName) {
    leagueFormStatus.textContent = 'League name is required.';
    return;
  }

  let users = [];
  try {
    users = collectLeagueUsersFromForm();
  } catch (error) {
    leagueFormStatus.textContent = error.message;
    return;
  }

  leagueFormStatus.textContent = 'Saving league...';

  try {
    const response = await fetch('/api/leagues', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: leagueName,
        users
      })
    });

    const responseBody = await response.json();
    if (!response.ok) {
      throw new Error(responseBody?.detail || responseBody?.error || `Request failed with status ${response.status}`);
    }

    const savedLeagueName = responseBody?.league?.name || leagueName;
    await loadLeagues(savedLeagueName);
    selectedLeagueName = savedLeagueName;
    closeLeagueModal();
    await loadData(false);
    statusNode.textContent = `Created league ${savedLeagueName}.`;
  } catch (error) {
    leagueFormStatus.textContent = error.message;
  }
}

function computeTop3FromSelections(team, majors, selections) {
  const majorTotals = {};
  let overallSum = 0;
  let hasOverallValues = false;
  let overallPartial = false;

  for (const major of majors) {
    const selectedIndexes = Array.from(selections[major.key] || []);
    const selectedScores = selectedIndexes
      .map((index) => parseScoreValue(team.players?.[index]?.majorScores?.[major.key]))
      .filter((value) => typeof value === 'number')
      .sort((a, b) => a - b);

    const bestThree = selectedScores.slice(0, 3);

    if (bestThree.length === 0) {
      majorTotals[major.key] = {
        display: 'N/A',
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
    overallDisplay: hasOverallValues ? formatScoreValue(overallSum, overallPartial) : 'N/A'
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

    const headerCells = majors
      .map((major) => `<th scope="col">${major.name}</th>`)
      .join('');

    const top3DisplayData = state.hasSavedSelection
      ? computeTop3FromSelections(team, majors, state.selections)
      : {
          majorTotals: team.totals?.top3?.majorTotals || {},
          overallDisplay: team.totals?.top3?.overall?.display || 'N/A'
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

            const score = player.majorScores?.[major.key] || 'N/A';
            const muted = state.hasSavedSelection && !state.selections[major.key]?.has(playerIndex);
            return `<td class="score ${scoreClass(score)}${muted ? ' muted-score' : ''}">${score}</td>`;
          })
          .join('');

        const overallScore = state.editing ? '—' : (player.overall || 'N/A');
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
          const display = team.totals?.majorTotals?.[major.key]?.display || 'N/A';
          return `<td class="score ${scoreClass(display)}">${display}</td>`;
        })
        .join('');
      totalOverall = team.totals?.overall?.display || 'N/A';

      top3RowCells = majors
        .map((major) => {
          const display = top3DisplayData.majorTotals?.[major.key]?.display || 'N/A';
          return `<td class="score ${scoreClass(display)}">${display}</td>`;
        })
        .join('');
      top3Overall = top3DisplayData.overallDisplay || 'N/A';
    } else {
      totalRowCells = majors.map(() => '<td class="score na">—</td>').join('');
      top3RowCells = majors.map(() => '<td class="score na">—</td>').join('');
    }

    const showPartialNote = !state.editing && (String(totalOverall).includes('*') || String(top3Overall).includes('*'));

    return `
      <article class="team-card">
        <div class="team-card-head">
          <h2>${team.name}</h2>
          <button type="button" class="team-edit-button" data-team="${team.name}">
            ${state.editing ? 'Save' : 'Edit'}
          </button>
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

      const scoreText = picked.player.majorScores?.[majorKey] || 'N/A';
      return {
        name: picked.player.name,
        scoreText,
        scoreValue: parseScoreValue(scoreText)
      };
    });

    const selectedScoreValues = pickSlots
      .map((slot) => slot.scoreValue)
      .filter((value) => typeof value === 'number');

    const selected4Sum = selectedScoreValues.length
      ? selectedScoreValues.reduce((sum, value) => sum + value, 0)
      : null;
    const selected4Partial = pickedPlayers.length < 4 || selectedScoreValues.length < pickedPlayers.length;
    const selected4Display = selected4Sum === null
      ? 'N/A'
      : formatScoreValue(selected4Sum, selected4Partial);

    const top3Values = [...selectedScoreValues].sort((a, b) => a - b).slice(0, 3);
    const top3Sum = top3Values.length ? top3Values.reduce((sum, value) => sum + value, 0) : null;
    const top3Partial = top3Values.length < 3;
    const top3Display = top3Sum === null
      ? 'N/A'
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
    activeTab = 'season';
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

    subtitleNode.textContent = `${getSeasonTabLabel()} for ${selectedLeagueName} (${selectedSeasonYear}) with tabbed major scoreboards.`;
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
  newLeagueButton.addEventListener('click', openLeagueModal);
}

if (closeLeagueModalButton) {
  closeLeagueModalButton.addEventListener('click', closeLeagueModal);
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
  });
}

if (leagueForm) {
  leagueForm.addEventListener('submit', createLeagueFromForm);
}

initializeApp();
