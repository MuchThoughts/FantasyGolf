const DRAFT_SETUP_STORAGE_KEY = "fantasyGolfDraftSetup";
const DEFAULT_DRAFT_SEASON_YEAR = 2025;

const subtitleNode = document.getElementById("draft-subtitle");
const metaNode = document.getElementById("draft-meta");
const statusNode = document.getElementById("draft-status");
const onClockNode = document.getElementById("on-clock");
const pickCounterNode = document.getElementById("pick-counter");
const teamBoardNode = document.getElementById("team-board");
const availableBodyNode = document.getElementById("available-body");
const draftOrderNode = document.getElementById("draft-order");
const searchInput = document.getElementById("player-search");
const saveDraftButton = document.getElementById("save-draft");

let draftSetup = null;
let draftPool = null;
let teams = [];
let availablePlayers = [];
let snakeOrder = [];
let currentPickIndex = 0;
let searchQuery = "";
let isSaving = false;

function normalizeName(name) {
  if (!name) {
    return "";
  }

  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreClass(score) {
  if (score === null || score === undefined || score === "-") {
    return "na";
  }

  const clean = String(score).replace("*", "");
  if (clean === "E") {
    return "even";
  }
  if (clean.startsWith("-")) {
    return "negative";
  }
  if (clean.startsWith("+")) {
    return "positive";
  }

  return "na";
}

function clampRounds(roundsValue) {
  const parsed = Number.parseInt(String(roundsValue || ""), 10);
  if (Number.isNaN(parsed)) {
    return 4;
  }

  return Math.max(4, Math.min(8, parsed));
}

function sanitizeDraftSetup(rawSetup) {
  const leagueName = String(rawSetup && rawSetup.leagueName || "").trim();
  const users = Array.isArray(rawSetup && rawSetup.users) ? rawSetup.users : [];
  const seasonYear = Number.parseInt(String(rawSetup && rawSetup.seasonYear || DEFAULT_DRAFT_SEASON_YEAR), 10);
  const rounds = clampRounds(rawSetup && rawSetup.rounds);

  if (!leagueName) {
    throw new Error("Draft setup is missing a league name.");
  }

  if (!users.length) {
    throw new Error("Draft setup is missing users.");
  }

  if (users.length > 20) {
    throw new Error("A league can have up to 20 users.");
  }

  const seenUsers = new Set();
  const cleanUsers = users.map((user, index) => {
    const name = String(user && user.name || "").trim();
    if (!name) {
      throw new Error("User " + (index + 1) + " is missing a name.");
    }

    const normalized = normalizeName(name);
    if (seenUsers.has(normalized)) {
      throw new Error("Duplicate user name: " + name);
    }
    seenUsers.add(normalized);

    const rawPlayers = Array.isArray(user && user.players) ? user.players : [];
    const seenPlayers = new Set();
    const players = [];
    for (const rawPlayer of rawPlayers) {
      const playerName = String(rawPlayer || "").trim();
      if (!playerName) {
        continue;
      }

      const normalizedPlayer = normalizeName(playerName);
      if (seenPlayers.has(normalizedPlayer)) {
        continue;
      }
      seenPlayers.add(normalizedPlayer);
      players.push(playerName);
    }

    return {
      name,
      players: players.slice(0, rounds)
    };
  });

  return {
    leagueName,
    seasonYear: Number.isNaN(seasonYear) ? DEFAULT_DRAFT_SEASON_YEAR : seasonYear,
    rounds,
    users: cleanUsers,
    createdAt: rawSetup && rawSetup.createdAt || null
  };
}

function getStoredSetup() {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_SETUP_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return sanitizeDraftSetup(parsed);
  } catch (error) {
    return null;
  }
}

function saveStoredSetup() {
  if (!draftSetup) {
    return;
  }

  const users = teams.map((team) => ({
    name: team.name,
    players: team.players.map((player) => player.name)
  }));

  const payload = {
    leagueName: draftSetup.leagueName,
    seasonYear: draftSetup.seasonYear,
    rounds: draftSetup.rounds,
    users,
    createdAt: draftSetup.createdAt || null
  };

  try {
    window.sessionStorage.setItem(DRAFT_SETUP_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    // Ignore browser storage errors.
  }
}

function buildSnakeOrder(users, rounds) {
  const order = [];
  let pickNumber = 1;

  for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
    const currentRoundUsers = roundIndex % 2 === 0 ? users.slice() : users.slice().reverse();

    for (const user of currentRoundUsers) {
      order.push({
        pickNumber,
        round: roundIndex + 1,
        userName: user.name
      });
      pickNumber += 1;
    }
  }

  return order;
}

function getMajorKeys() {
  const keys = Array.isArray(draftPool && draftPool.majors)
    ? draftPool.majors.map((major) => major.key)
    : [];

  return keys.length ? keys : ["masters", "pga", "us_open", "the_open"];
}

function getCurrentTurn() {
  return snakeOrder[currentPickIndex] || null;
}

function isDraftComplete() {
  return currentPickIndex >= snakeOrder.length;
}

function getTeamByName(teamName) {
  return teams.find((team) => team.name === teamName) || null;
}

function filterAvailablePlayers() {
  if (!searchQuery) {
    return availablePlayers;
  }

  const normalizedQuery = normalizeName(searchQuery);
  return availablePlayers.filter((player) => normalizeName(player.name).includes(normalizedQuery));
}

function buildTeamCard(team, currentTurn) {
  let picksMarkup = "";
  for (let index = 0; index < draftSetup.rounds; index += 1) {
    const player = team.players[index] || null;
    if (!player) {
      picksMarkup += "<li class=\"team-pick empty\">Pick " + (index + 1) + ": <span>Open</span></li>";
      continue;
    }

    picksMarkup += "<li class=\"team-pick\">Pick " + (index + 1) + ": <strong>" + player.name + "</strong> <span class=\"score " + scoreClass(player.overall) + "\">" + (player.overall || "-") + "</span></li>";
  }

  const isOnClock = currentTurn && currentTurn.userName === team.name;
  return "<article class=\"draft-team-card" + (isOnClock ? " is-on-clock" : "") + "\"><div class=\"draft-team-card-head\"><h3>" + team.name + "</h3><p>" + team.players.length + "/" + draftSetup.rounds + " picks</p></div><ul class=\"team-picks\">" + picksMarkup + "</ul></article>";
}

function renderTeamBoard() {
  const currentTurn = getCurrentTurn();
  const cards = teams.map((team) => buildTeamCard(team, currentTurn)).join("");
  teamBoardNode.innerHTML = cards || "<p class=\"status\">No teams found.</p>";
}

function renderAvailablePlayers() {
  const majorKeys = getMajorKeys();
  const rows = filterAvailablePlayers();

  if (!rows.length) {
    availableBodyNode.innerHTML = "<tr><td colspan=\"8\" class=\"status\">No available players match this filter.</td></tr>";
    return;
  }

  const disabled = isDraftComplete();
  availableBodyNode.innerHTML = rows.map((player) => {
    const majorCells = majorKeys.map((majorKey) => {
      const score = player.majorScores && player.majorScores[majorKey] || "-";
      return "<td class=\"score " + scoreClass(score) + "\">" + score + "</td>";
    }).join("");

    return "<tr><td>" + (player.rank || "-") + "</td><td>" + player.name + "</td>" + majorCells + "<td class=\"score " + scoreClass(player.overall) + "\">" + (player.overall || "-") + "</td><td><button type=\"button\" class=\"secondary-button draft-pick-button\" data-player=\"" + player.name + "\" " + (disabled ? "disabled" : "") + ">Draft</button></td></tr>";
  }).join("");
}

function renderDraftOrder() {
  if (!snakeOrder.length) {
    draftOrderNode.innerHTML = "<p class=\"status\">Draft order is not available.</p>";
    return;
  }

  draftOrderNode.innerHTML = snakeOrder.map((pick, index) => {
    const stateClass = index < currentPickIndex
      ? "is-complete"
      : index === currentPickIndex
        ? "is-current"
        : "is-upcoming";

    return "<span class=\"order-pill " + stateClass + "\">#" + pick.pickNumber + " R" + pick.round + " " + pick.userName + "</span>";
  }).join("");
}

function renderStatus() {
  const currentTurn = getCurrentTurn();

  if (isDraftComplete()) {
    onClockNode.textContent = "Draft complete";
    pickCounterNode.textContent = "All " + snakeOrder.length + " picks are in.";
    statusNode.textContent = "Draft complete. Save this league to continue.";
    saveDraftButton.disabled = isSaving;
    return;
  }

  onClockNode.textContent = "On the clock: " + currentTurn.userName;
  pickCounterNode.textContent = "Pick " + (currentPickIndex + 1) + " of " + snakeOrder.length + " (Round " + currentTurn.round + ")";
  statusNode.textContent = currentTurn.userName + " is drafting now.";
  saveDraftButton.disabled = true;
}

function renderAll() {
  renderStatus();
  renderTeamBoard();
  renderAvailablePlayers();
  renderDraftOrder();
}

function draftPlayer(playerName) {
  if (isDraftComplete()) {
    return;
  }

  const currentTurn = getCurrentTurn();
  if (!currentTurn) {
    return;
  }

  const playerIndex = availablePlayers.findIndex((player) => player.name === playerName);
  if (playerIndex < 0) {
    return;
  }

  const pickedPlayer = availablePlayers.splice(playerIndex, 1)[0];
  const team = getTeamByName(currentTurn.userName);
  if (!team) {
    return;
  }

  team.players.push(pickedPlayer);
  currentPickIndex += 1;
  saveStoredSetup();
  renderAll();
}

async function saveLeagueFromDraft() {
  if (isSaving || !isDraftComplete()) {
    return;
  }

  isSaving = true;
  saveDraftButton.disabled = true;
  statusNode.textContent = "Saving league...";

  try {
    const users = teams.map((team) => ({
      name: team.name,
      players: team.players.map((player) => player.name)
    }));

    const response = await fetch("/api/leagues", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: draftSetup.leagueName,
        users
      })
    });

    const responseBody = await response.json();
    if (!response.ok) {
      throw new Error(responseBody && (responseBody.detail || responseBody.error) || "Request failed with status " + response.status);
    }

    const savedLeagueName = responseBody && responseBody.league && responseBody.league.name || draftSetup.leagueName;
    window.sessionStorage.removeItem(DRAFT_SETUP_STORAGE_KEY);
    window.location.href = "/?league=" + encodeURIComponent(savedLeagueName) + "&year=" + encodeURIComponent(String(draftSetup.seasonYear));
  } catch (error) {
    isSaving = false;
    renderAll();
    statusNode.textContent = "Could not save league: " + error.message;
  }
}

async function loadDraftPool(seasonYear) {
  const params = new URLSearchParams({
    year: String(seasonYear)
  });

  const response = await fetch("/api/draft-pool?" + params.toString());
  let responseBody = null;
  try {
    responseBody = await response.json();
  } catch (error) {
    responseBody = null;
  }

  if (!response.ok) {
    const message = responseBody && (responseBody.detail || responseBody.error) || "Request failed with status " + response.status;
    throw new Error(message);
  }

  return {
    seasonYear: Number.parseInt(String(responseBody && responseBody.seasonYear || seasonYear), 10),
    majors: Array.isArray(responseBody && responseBody.majors) ? responseBody.majors : [],
    players: Array.isArray(responseBody && responseBody.players) ? responseBody.players : []
  };
}

function initializeDraftFromSetup() {
  draftSetup = getStoredSetup();
  if (!draftSetup) {
    subtitleNode.textContent = "Draft setup not found";
    statusNode.textContent = "Start a new league draft from the Summary page.";
    onClockNode.textContent = "No draft in progress";
    pickCounterNode.textContent = "";
    saveDraftButton.disabled = true;
    return false;
  }

  subtitleNode.textContent = draftSetup.leagueName + " draft with " + draftSetup.users.length + " users and " + draftSetup.rounds + " rounds.";
  metaNode.textContent = "Season " + draftSetup.seasonYear;

  teams = draftSetup.users.map((user) => ({
    name: user.name,
    players: []
  }));
  snakeOrder = buildSnakeOrder(teams, draftSetup.rounds);
  return true;
}

function applyStoredPicks() {
  if (!draftSetup) {
    return;
  }

  const storedByName = new Map();
  for (const user of draftSetup.users) {
    const picks = Array.isArray(user && user.players) ? user.players : [];
    storedByName.set(user.name, picks);
  }

  if (!storedByName.size) {
    return;
  }

  const availableByName = new Map(availablePlayers.map((player) => [player.name, player]));
  let picksApplied = 0;

  for (const pick of snakeOrder) {
    const team = getTeamByName(pick.userName);
    const queuedPicks = storedByName.get(pick.userName) || [];
    if (!team || team.players.length >= queuedPicks.length) {
      continue;
    }

    const targetPlayerName = queuedPicks[team.players.length];
    const player = availableByName.get(targetPlayerName);
    if (!player) {
      continue;
    }

    team.players.push(player);
    availableByName.delete(targetPlayerName);
    picksApplied += 1;
  }

  availablePlayers = Array.from(availableByName.values());
  currentPickIndex = Math.min(picksApplied, snakeOrder.length);
}

async function initializeDraftPage() {
  if (!initializeDraftFromSetup()) {
    return;
  }

  statusNode.textContent = "Loading top 200 players and major scores...";

  try {
    draftPool = await loadDraftPool(draftSetup.seasonYear);
    availablePlayers = (draftPool.players || []).slice();
    applyStoredPicks();

    metaNode.textContent = "Season " + draftPool.seasonYear + " data";
    renderAll();
  } catch (error) {
    subtitleNode.textContent = "Draft data could not be loaded";
    statusNode.textContent = "Could not load draft data: " + error.message;
    saveDraftButton.disabled = true;
  }
}

if (availableBodyNode) {
  availableBodyNode.addEventListener("click", (event) => {
    const button = event.target.closest(".draft-pick-button");
    if (!button) {
      return;
    }

    const playerName = String(button.dataset && button.dataset.player || "").trim();
    if (!playerName) {
      return;
    }

    draftPlayer(playerName);
  });
}

if (searchInput) {
  searchInput.addEventListener("input", (event) => {
    searchQuery = String(event.target && event.target.value || "").trim();
    renderAvailablePlayers();
  });
}

if (saveDraftButton) {
  saveDraftButton.addEventListener("click", () => {
    saveLeagueFromDraft();
  });
}

initializeDraftPage();
