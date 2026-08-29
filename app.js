import {
  BOARD,
  PLAYERS,
  PLAYER_CATALOG,
  PROPERTY_GROUPS,
  RAILROAD_RENT,
  HOUSE_SUPPLY,
  HOTEL_SUPPLY,
  GO_SALARY,
  JAIL_FINE,
  JAIL_POSITION,
  GO_TO_JAIL_POSITION,
  BANK_MONEY,
  CHANCE_CARDS,
  CHEST_CARDS,
  formatMoney,
  getCellByPosition,
  isTitleCell,
  getMortgageValue,
  getUnmortgageCost,
  getHouseCost,
  getGroupCells,
  nextCellOfType,
  shuffle,
} from './board.js';

function createPlayers(roster = PLAYERS) {
  return roster.map((player, index) => ({
    ...structuredClone(player),
    id: index,
    money: player.money ?? 1500,
    position: player.position ?? 0,
    inJail: false,
    jailTurns: 0,
    jailFreeCards: [],
    bankrupt: false,
  }));
}

function createTitles() {
  const titles = {};
  BOARD.forEach((cell) => {
    if (isTitleCell(cell)) {
      titles[cell.id] = { ownerId: null, houses: 0, mortgaged: false };
    }
  });
  return titles;
}

let gameGen = 0;
let botRunning = false;
let matchActive = false;
const logHistory = [];
const commentHistory = [];
const COMMENT_LIMIT = 40;
const BOT_PACE = 2;
const recentHumanReactions = [];
let skipNextHumanComment = false;
let chatSpeakerId = 0;
const state = freshState();

const boardEl = document.getElementById('board');
const tokensLayerEl = document.getElementById('tokens-layer');
const playerCardsEl = document.getElementById('player-cards');
const propertyPreviewEl = document.getElementById('property-preview');
const activePlayerNameEl = document.getElementById('active-player-name');
const gameLogEl = document.getElementById('game-log');
const rollBtn = document.getElementById('roll-btn');
const rollBtnLabel = document.getElementById('roll-btn-label');
const manageBtn = document.getElementById('manage-btn');
const tradeBtn = document.getElementById('trade-btn');
const endTurnBtn = document.getElementById('end-turn-btn');
const diceEls = [document.getElementById('dice-1'), document.getElementById('dice-2')];
const dieValueEls = [document.getElementById('die-value-1'), document.getElementById('die-value-2')];
const diceTotalEl = document.getElementById('dice-total');
const diceReadoutEl = document.getElementById('dice-readout');
const bankTotalEl = document.getElementById('bank-total');
const bankHousesEl = document.getElementById('bank-houses');
const bankHotelsEl = document.getElementById('bank-hotels');
const modalOverlayEl = document.getElementById('modal-overlay');
const modalEl = document.getElementById('modal');
const saveBtn = document.getElementById('save-btn');
const newGameBtn = document.getElementById('new-game-btn');
const saveStatusEl = document.getElementById('save-status');
const playersHintEl = document.getElementById('players-hint');
const lobbyOverlayEl = document.getElementById('lobby-overlay');
const lobbySeatsEl = document.getElementById('lobby-seats') || document.getElementById('lobby-players');
const lobbyErrorEl = document.getElementById('lobby-error');
const continueBtn = document.getElementById('continue-btn');
const startGameBtn = document.getElementById('start-game-btn');
const commentaryFeedEl = document.getElementById('commentary-feed');
const commentaryFormEl = document.getElementById('commentary-form');
const commentaryInputEl = document.getElementById('commentary-input');
const commentarySendEl = document.getElementById('commentary-send');
const commentarySpeakerRowEl = document.getElementById('commentary-speaker-row');

const SAVE_KEY = 'moscow-monopoly-save';
const SAVE_VERSION = 1;

function cardCatalog(deckName) {
  return deckName === 'chance' ? CHANCE_CARDS : CHEST_CARDS;
}

function serializeDeck(cards) {
  return (cards || []).map((card) => card.id);
}

function hydrateDeck(deckName, ids) {
  const catalog = cardCatalog(deckName);
  return (ids || [])
    .map((id) => catalog.find((card) => card.id === id))
    .filter(Boolean);
}

function freshState(roster) {
  gameGen += 1;
  return {
    players: createPlayers(roster),
    titles: createTitles(),
    activePlayerIndex: 0,
    bank: { money: BANK_MONEY, houses: HOUSE_SUPPLY, hotels: HOTEL_SUPPLY },
    decks: {
      chance: shuffle(CHANCE_CARDS),
      chest: shuffle(CHEST_CARDS),
    },
    discards: { chance: [], chest: [] },
    consecutiveDoubles: 0,
    extraRoll: false,
    lastDice: [0, 0],
    lastDiceTotal: 0,
    turnPhase: 'pre-roll',
    busy: false,
    winnerId: null,
    rolledOutOfJail: false,
  };
}

function applyState(next) {
  Object.assign(state, next, { busy: false });
}

function formatSavedAt(timestamp) {
  return new Date(timestamp).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function updateSaveStatus(timestamp, message) {
  if (message) {
    saveStatusEl.textContent = message;
    return;
  }
  saveStatusEl.textContent = timestamp
    ? `Сохранено ${formatSavedAt(timestamp)}`
    : 'Пока нет сохранения';
}

function persistGame(message) {
  if (!matchActive) return false;
  try {
    const snapshot = {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      log: gameLogEl.textContent,
      comments: commentHistory.slice(),
      lastDice: state.lastDice,
      lastDiceTotal: state.lastDiceTotal,
      game: {
        players: structuredClone(state.players),
        titles: structuredClone(state.titles),
        activePlayerIndex: state.activePlayerIndex,
        bank: structuredClone(state.bank),
        decks: {
          chance: serializeDeck(state.decks.chance),
          chest: serializeDeck(state.decks.chest),
        },
        discards: {
          chance: serializeDeck(state.discards.chance),
          chest: serializeDeck(state.discards.chest),
        },
        consecutiveDoubles: state.consecutiveDoubles,
        extraRoll: state.extraRoll,
        lastDice: state.lastDice,
        lastDiceTotal: state.lastDiceTotal,
        turnPhase: state.turnPhase,
        winnerId: state.winnerId,
        rolledOutOfJail: state.rolledOutOfJail,
      },
    };

    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    updateSaveStatus(snapshot.savedAt, message || `Сохранено ${formatSavedAt(snapshot.savedAt)}`);
    return true;
  } catch (error) {
    console.error(error);
    updateSaveStatus(null, 'Не удалось сохранить');
    return false;
  }
}

function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const snapshot = JSON.parse(raw);
    if (!snapshot || snapshot.version !== SAVE_VERSION || !snapshot.game) return null;
    return snapshot;
  } catch (error) {
    return null;
  }
}

function restoreFromSnapshot(snapshot) {
  const game = snapshot.game;
  applyState({
    players: game.players,
    titles: game.titles,
    activePlayerIndex: game.activePlayerIndex ?? 0,
    bank: game.bank,
    decks: {
      chance: hydrateDeck('chance', game.decks?.chance),
      chest: hydrateDeck('chest', game.decks?.chest),
    },
    discards: {
      chance: hydrateDeck('chance', game.discards?.chance),
      chest: hydrateDeck('chest', game.discards?.chest),
    },
    consecutiveDoubles: game.consecutiveDoubles || 0,
    extraRoll: Boolean(game.extraRoll),
    lastDice: game.lastDice || [0, 0],
    lastDiceTotal: game.lastDiceTotal || 0,
    turnPhase: game.turnPhase || 'pre-roll',
    winnerId: game.winnerId ?? null,
    rolledOutOfJail: Boolean(game.rolledOutOfJail),
  });

  migrateHumanNames(state.players);
  restoreComments(snapshot.comments || game.comments);
  ensureMironInRoster(snapshot);

  if (state.decks.chance.length + state.discards.chance.length < 8) {
    state.decks.chance = shuffle(CHANCE_CARDS);
    state.discards.chance = [];
  }
  if (state.decks.chest.length + state.discards.chest.length < 8) {
    state.decks.chest = shuffle(CHEST_CARDS);
    state.discards.chest = [];
  }
}

async function resumeInterruptedLanding() {
  if (state.turnPhase !== 'resolve-land' || state.winnerId != null) return;
  const player = getActivePlayer();
  const cell = getCellByPosition(player.position);
  state.busy = true;
  updateActionButtons();

  if (isTitleCell(cell) && state.titles[cell.id].ownerId == null) {
    await offerPurchase(player, cell);
  }

  const isDoubles = state.lastDice[0] === state.lastDice[1] && state.lastDice[0] > 0;
  state.extraRoll = isDoubles && !player.inJail && !state.rolledOutOfJail && state.winnerId == null;
  state.rolledOutOfJail = false;
  state.turnPhase = 'post-land';
  state.busy = false;
  refreshUI();
  persistGame();
  if (isBot(player) && state.winnerId == null) {
    await runBotTurn();
  }
}

function handleSave() {
  setLog('Партия сохранена на этом компьютере.');
  persistGame('Игра сохранена. Можно закрыть вкладку и продолжить завтра.');
}

function handleNewGame() {
  if (matchActive && !window.confirm('Начать новую игру? Текущая партия будет сброшена.')) {
    return;
  }
  matchActive = false;
  gameGen += 1;
  botRunning = false;
  closeModal();
  showLobby();
  updateChatCompose();
}

function seatsRoot() {
  return lobbySeatsEl || document.getElementById('lobby-seats') || document.getElementById('lobby-players');
}

function renderLobbySeats() {
  const root = seatsRoot();
  if (!root) return;
  root.innerHTML = PLAYER_CATALOG.map((seat) => {
    const checked = seat.defaultOn !== false;
    return `
      <label class="lobby-seat">
        <span class="lobby-seat__token" style="--seat-color:${seat.color}">${seat.token}</span>
        <span class="lobby-seat__body">
          <span class="lobby-seat__name">${seat.name}</span>
          <span class="lobby-seat__blurb">${seat.blurb}</span>
        </span>
        <input type="checkbox" data-seat-key="${seat.key}" ${checked ? 'checked' : ''}>
      </label>
    `;
  }).join('');
}

function collectLobbyRoster() {
  const root = seatsRoot();
  return PLAYER_CATALOG.filter((seat) => {
    const input = root?.querySelector(`[data-seat-key="${seat.key}"]`);
    return Boolean(input?.checked);
  }).map((seat, id) => ({
    id,
    name: seat.name,
    token: seat.token,
    color: seat.color,
    money: 1500,
    position: 0,
    isBot: Boolean(seat.isBot),
    botId: seat.botId,
    botKind: seat.botKind,
  }));
}

function showLobby() {
  renderLobbySeats();
  const snapshot = readSave();
  if (continueBtn) continueBtn.hidden = !snapshot;
  if (lobbyErrorEl) lobbyErrorEl.hidden = true;
  if (lobbyOverlayEl) lobbyOverlayEl.hidden = false;
  if (snapshot) updateSaveStatus(snapshot.savedAt);
}

function hideLobby() {
  if (lobbyOverlayEl) lobbyOverlayEl.hidden = true;
}

renderLobbySeats();

function beginMatch(roster) {
  hideLobby();
  matchActive = true;
  botRunning = false;
  applyState(freshState(roster));
  setDieRotation(0, 1, false);
  setDieRotation(1, 1, false);
  setDiceReadout(null, null);
  clearComments();
  clearLog(tableWelcome(roster.map((player) => player.name)));
  skipNextHumanComment = false;
  chatSpeakerId = humanPlayers()[0]?.id ?? 0;
  refreshUI();
  persistGame('Новая игра сохранена');
}

function showLobbyError(message) {
  if (!lobbyErrorEl) return;
  lobbyErrorEl.textContent = message;
  lobbyErrorEl.hidden = false;
}

function handleStartGame() {
  const roster = collectLobbyRoster();
  if (!roster.some((player) => !player.isBot)) {
    showLobbyError('Нужен хотя бы один человек: Кирилл или Артём.');
    return;
  }
  if (roster.length < 2) {
    showLobbyError('Нужно хотя бы двое игроков. Добавьте бота или второго человека.');
    return;
  }
  try {
    beginMatch(roster);
  } catch (error) {
    console.error(error);
    hideLobby();
    if (lobbyErrorEl) {
      lobbyErrorEl.hidden = false;
      lobbyErrorEl.textContent = 'Не удалось начать партию. Обновите страницу.';
    }
  }
}

function handleContinueGame() {
  const snapshot = readSave();
  if (!snapshot) return;
  matchActive = true;
  botRunning = false;
  gameGen += 1;
  restoreFromSnapshot(snapshot);
  hideLobby();
  refreshUI();
  applySavedDice(snapshot.game.lastDice || snapshot.lastDice, snapshot.game.lastDiceTotal || snapshot.lastDiceTotal);
  setLog(snapshot.log || 'Партия восстановлена с этого компьютера.');
  updateSaveStatus(snapshot.savedAt, `Продолжаем с ${formatSavedAt(snapshot.savedAt)}`);
  resumeBotOrLanding();
}

function getCellPlacement(index) {
  if (index === 0) return { row: 11, col: 11, side: 'bottom' };
  if (index >= 1 && index <= 9) return { row: 11, col: 11 - index, side: 'bottom' };
  if (index === 10) return { row: 11, col: 1, side: 'bottom' };
  if (index >= 11 && index <= 19) return { row: 11 - (index - 10), col: 1, side: 'left' };
  if (index === 20) return { row: 1, col: 1, side: 'top' };
  if (index >= 21 && index <= 29) return { row: 1, col: 1 + (index - 20), side: 'top' };
  if (index === 30) return { row: 1, col: 11, side: 'top' };
  if (index >= 31 && index <= 39) return { row: 1 + (index - 30), col: 11, side: 'right' };
  return { row: 1, col: 1, side: 'bottom' };
}

function getCellClassName(cell) {
  const classes = ['cell', `cell--${getCellPlacement(cell.id).side}`];

  if (cell.type === 'corner') classes.push('cell--corner');
  if (cell.type === 'chance') classes.push('cell--chance');
  if (cell.type === 'chest') classes.push('cell--chest');
  if (cell.type === 'tax') classes.push('cell--tax');
  if (cell.type === 'railroad') classes.push('cell--railroad');
  if (cell.type === 'utility') classes.push('cell--utility');

  return classes.join(' ');
}

function renderBoard() {
  boardEl.innerHTML = '';

  BOARD.forEach((cell) => {
    const placement = getCellPlacement(cell.id);
    const cellEl = document.createElement('article');
    cellEl.className = getCellClassName(cell);
    cellEl.style.gridRow = placement.row;
    cellEl.style.gridColumn = placement.col;
    cellEl.dataset.cellId = String(cell.id);

    const groupColor = cell.group ? PROPERTY_GROUPS[cell.group].color : 'transparent';

    cellEl.innerHTML = `
      <div class="cell__color-bar" style="--group-color: ${groupColor}">
        <div class="cell__buildings" data-buildings></div>
      </div>
      <div class="cell__body">
        ${cell.icon ? `<span class="cell__icon">${cell.icon}</span>` : ''}
        <span class="cell__name">${cell.name}</span>
        ${cell.subtitle ? `<span class="cell__meta">${cell.subtitle}</span>` : ''}
        ${cell.price ? `<span class="cell__price">₽ ${cell.price}</span>` : ''}
      </div>
      <div class="cell__owner" data-owner hidden></div>
    `;

    cellEl.addEventListener('mouseenter', () => showPropertyPreview(cell));
    cellEl.addEventListener('mouseleave', () => showPropertyPreview(getCellByPosition(getActivePlayer().position)));
    cellEl.addEventListener('click', () => showPropertyPreview(cell));

    boardEl.appendChild(cellEl);
  });

  updateBoardOverlays();
  renderTokens();
}

function updateBoardOverlays() {
  BOARD.forEach((cell) => {
    const cellEl = boardEl.querySelector(`[data-cell-id="${cell.id}"]`);
    if (!cellEl) return;

    const title = state.titles[cell.id];
    const buildingsEl = cellEl.querySelector('[data-buildings]');
    const ownerEl = cellEl.querySelector('[data-owner]');

    cellEl.classList.toggle('cell--mortgaged', Boolean(title?.mortgaged));

    if (buildingsEl) {
      const houses = title?.houses ?? 0;
      buildingsEl.innerHTML = buildingMarkersHtml(houses);
      buildingsEl.title = houses ? buildingsLabel(houses) : '';
    }

    if (ownerEl) {
      if (title?.ownerId != null) {
        const owner = state.players.find((player) => player.id === title.ownerId);
        ownerEl.hidden = false;
        ownerEl.style.background = owner.color;
        ownerEl.title = owner.name;
      } else {
        ownerEl.hidden = true;
      }
    }
  });
}

function getTokenOffsets(count) {
  if (count <= 1) return [{ x: 0, y: 0 }];
  if (count === 2) return [{ x: -16, y: 6 }, { x: 16, y: -6 }];
  if (count === 3) return [{ x: -18, y: 8 }, { x: 0, y: -10 }, { x: 18, y: 6 }];
  if (count === 4) return [{ x: -16, y: 10 }, { x: 16, y: 10 }, { x: -16, y: -10 }, { x: 16, y: -10 }];
  return [
    { x: -18, y: 12 },
    { x: 18, y: 12 },
    { x: 0, y: -2 },
    { x: -18, y: -10 },
    { x: 18, y: -10 },
  ];
}

function ensureTokenElements() {
  const livingIds = new Set(state.players.map((player) => String(player.id)));
  tokensLayerEl.querySelectorAll('[data-player-id]').forEach((tokenEl) => {
    if (!livingIds.has(tokenEl.dataset.playerId)) tokenEl.remove();
  });

  state.players.forEach((player) => {
    let tokenEl = tokensLayerEl.querySelector(`[data-player-id="${player.id}"]`);
    if (tokenEl) return;

    tokenEl = document.createElement('div');
    tokenEl.className = 'token';
    tokenEl.dataset.playerId = String(player.id);
    tokenEl.style.setProperty('--token-color', player.color);
    tokenEl.innerHTML = `
      <div class="token__pawn"><span class="token__icon">${player.token}</span></div>
      <div class="token__base"></div>
      <div class="token__label">${player.name}</div>
    `;
    tokensLayerEl.appendChild(tokenEl);
  });
}

function renderTokens(animatedPlayerId = null) {
  ensureTokenElements();

  const wrapperRect = tokensLayerEl.getBoundingClientRect();
  const playersByCell = new Map();

  state.players.forEach((player) => {
    if (!playersByCell.has(player.position)) {
      playersByCell.set(player.position, []);
    }
    playersByCell.get(player.position).push(player);
  });

  state.players.forEach((player) => {
    const tokenEl = tokensLayerEl.querySelector(`[data-player-id="${player.id}"]`);
    const cellEl = boardEl.querySelector(`[data-cell-id="${player.position}"]`);
    if (!tokenEl || !cellEl) return;

    const cellmates = playersByCell.get(player.position);
    const indexOnCell = cellmates.findIndex((item) => item.id === player.id);
    const offset = getTokenOffsets(cellmates.length)[indexOnCell];
    const cellRect = cellEl.getBoundingClientRect();

    tokenEl.classList.toggle('token--active', player.id === getActivePlayer().id);
    tokenEl.classList.toggle('token--moving', animatedPlayerId === player.id);
    tokenEl.style.left = `${cellRect.left - wrapperRect.left + cellRect.width / 2 + offset.x}px`;
    tokenEl.style.top = `${cellRect.top - wrapperRect.top + cellRect.height * 0.58 + offset.y}px`;
    tokenEl.title = player.name;
  });
}

function ownedCells(playerId) {
  return BOARD.filter((cell) => state.titles[cell.id]?.ownerId === playerId);
}

function renderPlayerCards() {
  playerCardsEl.innerHTML = '';

  state.players.forEach((player, index) => {
    const cell = getCellByPosition(player.position);
    const card = document.createElement('article');
    card.className = 'player-card';
    if (isMiron(player)) card.classList.add('player-card--miron');
    else if (player.isBot) card.classList.add('player-card--bot');
    if (player.botKind === 'lokh') card.classList.add('player-card--lokh');
    if (index === state.activePlayerIndex) card.classList.add('player-card--active');
    if (player.bankrupt) card.style.opacity = '0.45';

    const owned = ownedCells(player.id);
    const chips = owned.length
      ? owned
          .map((item) => {
            const title = state.titles[item.id];
            const color = item.group ? PROPERTY_GROUPS[item.group].color : item.type === 'railroad' ? '#555' : '#2e7d32';
            const extra = buildingMarkersHtml(title.houses);
            return `<span class="prop-chip${title.mortgaged ? ' prop-chip--mortgaged' : ''}" style="--g:${color}"><i></i>${item.name}${extra ? `<span class="prop-chip__houses">${extra}</span>` : ''}</span>`;
          })
          .join('')
      : '<p class="player-card__none">Нет участков</p>';

    const role = isMiron(player)
      ? 'Сова · спокойный, ходит сам'
      : isUnluckySmart(player)
        ? 'Утка · умный, очень невезучий'
        : isLuckyFool(player)
          ? 'Кот · везучий, глупый'
          : player.isBot
            ? 'Бот'
            : 'Человек';

    const flags = [];
    if (player.inJail) flags.push('<span class="player-card__flag player-card__flag--jail">В тюрьме</span>');
    if (player.jailFreeCards.length) {
      flags.push(`<span class="player-card__flag player-card__flag--card">Выход из тюрьмы × ${player.jailFreeCards.length}</span>`);
    }
    if (player.bankrupt) flags.push('<span class="player-card__flag player-card__flag--jail">Банкрот</span>');

    card.innerHTML = `
      <div class="player-card__head">
        <div class="player-card__identity">
          <span class="player-card__token" style="background: ${player.color}22; border: 2px solid ${player.color}">${player.token}</span>
          <span class="player-card__name">${player.name}<span class="player-card__role">${role}</span></span>
        </div>
        ${index === state.activePlayerIndex && !player.bankrupt ? '<span class="player-card__badge">Ход</span>' : ''}
      </div>
      ${flags.length ? `<div class="player-card__flags">${flags.join('')}</div>` : ''}
      <div class="player-card__money">
        <span class="player-card__money-label">Капитал</span>
        <span class="player-card__money-value">₽ ${formatMoney(player.money)}</span>
      </div>
      <p class="player-card__position">Позиция: <strong>${cell.name}</strong></p>
      <div class="player-card__props">${chips}</div>
    `;

    playerCardsEl.appendChild(card);
  });

  const activePlayer = getActivePlayer();
  activePlayerNameEl.textContent = activePlayer.inJail ? `${activePlayer.name} · тюрьма` : activePlayer.name;
  activePlayerNameEl.style.color = activePlayer.color;
}

function titleOwnerName(cell) {
  const title = state.titles[cell.id];
  if (!title || title.ownerId == null) return 'Банк';
  return state.players.find((player) => player.id === title.ownerId)?.name ?? 'Банк';
}

function showPropertyPreview(cell) {
  if (!cell) {
    propertyPreviewEl.innerHTML = '<div class="property-preview__empty">Наведите на клетку или сделайте ход</div>';
    return;
  }

  const title = state.titles[cell.id];

  if (cell.type === 'property') {
    const group = PROPERTY_GROUPS[cell.group];
    const houseCost = group.houseCost;
    const houses = title?.houses ?? 0;
    const isMonopoly = title?.ownerId != null && ownsFullGroup(title.ownerId, cell.group);
    const rentRow = (key, label, value) => {
      const current = key === 'base' && houses === 0 && !isMonopoly
        || key === 'mono' && houses === 0 && isMonopoly
        || key === houses;
      return `<div class="property-card__row${current ? ' property-card__row--current' : ''}"><span>${label}</span><span>₽ ${value}</span></div>`;
    };

    propertyPreviewEl.innerHTML = `
      <div class="property-card">
        <div class="property-card__stripe" style="--group-color: ${group.color}">
          <div class="property-card__houses">${buildingMarkersHtml(houses, { slots: true })}</div>
        </div>
        <div class="property-card__header">
          <div class="property-card__title">${cell.name}</div>
          <div class="property-card__group">${group.label} группа · ${title?.mortgaged ? 'залог' : buildingsLabel(houses)}</div>
        </div>
        <div class="property-card__row"><span>Владелец</span><span>${titleOwnerName(cell)}${title?.mortgaged ? ' · залог' : ''}</span></div>
        <div class="property-card__row"><span>Стоимость</span><span>₽ ${formatMoney(cell.price)}</span></div>
        <div class="property-card__row"><span>Залог / выкуп</span><span>₽ ${getMortgageValue(cell)} / ${getUnmortgageCost(cell)}</span></div>
        <div class="property-card__row"><span>Дом / отель</span><span>₽ ${houseCost}</span></div>
        ${rentRow('base', 'Аренда', cell.rent[0])}
        ${rentRow('mono', 'Монополия', cell.rent[0] * 2)}
        ${[1, 2, 3, 4].map((count) => rentRow(count, `${count} ${count === 1 ? 'дом' : 'дома'}`, cell.rent[count])).join('')}
        ${rentRow(5, 'Отель', cell.rent[5])}
      </div>
    `;
    return;
  }

  if (cell.type === 'railroad') {
    propertyPreviewEl.innerHTML = `
      <div class="property-card">
        <div class="property-card__header">
          <div class="property-card__title">${cell.name}</div>
          <div class="property-card__group">${cell.subtitle || 'Железная дорога'}</div>
        </div>
        <div class="property-card__row"><span>Владелец</span><span>${titleOwnerName(cell)}${title?.mortgaged ? ' · залог' : ''}</span></div>
        <div class="property-card__row"><span>Стоимость</span><span>₽ ${formatMoney(cell.price)}</span></div>
        <div class="property-card__row"><span>1 / 2 / 3 / 4 дороги</span><span>₽ ${RAILROAD_RENT.join(' / ')}</span></div>
      </div>
    `;
    return;
  }

  if (cell.type === 'utility') {
    propertyPreviewEl.innerHTML = `
      <div class="property-card">
        <div class="property-card__header">
          <div class="property-card__title">${cell.name}</div>
          <div class="property-card__group">Коммунальная служба</div>
        </div>
        <div class="property-card__row"><span>Владелец</span><span>${titleOwnerName(cell)}${title?.mortgaged ? ' · залог' : ''}</span></div>
        <div class="property-card__row"><span>Стоимость</span><span>₽ ${formatMoney(cell.price)}</span></div>
        <div class="property-card__row"><span>Одна служба</span><span>кубики × 4</span></div>
        <div class="property-card__row"><span>Обе службы</span><span>кубики × 10</span></div>
      </div>
    `;
    return;
  }

  propertyPreviewEl.innerHTML = `
    <div class="property-card">
      <div class="property-card__header">
        <div class="property-card__title">${cell.name}</div>
        <div class="property-card__group">${cell.subtitle || cell.type}</div>
      </div>
      ${cell.price ? `<div class="property-card__row"><span>Стоимость</span><span>₽ ${formatMoney(cell.price)}</span></div>` : ''}
      ${cell.amount ? `<div class="property-card__row"><span>Платёж</span><span>₽ ${formatMoney(cell.amount)}</span></div>` : ''}
      ${cell.icon ? `<div class="property-card__row"><span>Тип</span><span>${cell.icon}</span></div>` : ''}
    </div>
  `;
}

function getActivePlayer() {
  return state.players[state.activePlayerIndex];
}

function updateBank() {
  if (bankTotalEl) bankTotalEl.textContent = formatMoney(state.bank.money);
  if (bankHousesEl) bankHousesEl.textContent = String(state.bank.houses);
  if (bankHotelsEl) bankHotelsEl.textContent = String(state.bank.hotels);
}

function updateActionButtons() {
  const gameOver = state.winnerId != null;
  const player = getActivePlayer();
  const humanTurn = !isBot(player);
  const canRoll = !gameOver && !state.busy && humanTurn && (state.turnPhase === 'pre-roll' || state.extraRoll) && !player.inJail;
  const canEnd = !gameOver && !state.busy && humanTurn && state.turnPhase === 'post-land' && !state.extraRoll;

  rollBtn.disabled = !canRoll;
  manageBtn.disabled = gameOver || state.busy || !humanTurn;
  if (tradeBtn) tradeBtn.disabled = gameOver || state.busy || !humanTurn;
  endTurnBtn.hidden = !canEnd;
  if (!humanTurn && !gameOver) {
    rollBtnLabel.textContent = `${player.name} ходит…`;
  } else {
    rollBtnLabel.textContent = state.extraRoll ? 'Бросить ещё раз' : 'Бросить кубики';
  }
}

function refreshUI() {
  renderPlayerCards();
  updatePlayersHint();
  updateBoardOverlays();
  updateBank();
  updateActionButtons();
  renderTokens();
  showPropertyPreview(getCellByPosition(getActivePlayer().position));
  updateChatCompose();
}

const DICE_PATTERNS = {
  1: ['000', '010', '000'],
  2: ['100', '000', '001'],
  3: ['100', '010', '001'],
  4: ['101', '000', '101'],
  5: ['101', '010', '101'],
  6: ['101', '101', '101'],
};

const DICE_ROTATIONS = {
  1: { x: 0, y: 0 },
  2: { x: 0, y: -90 },
  3: { x: -90, y: 0 },
  4: { x: 90, y: 0 },
  5: { x: 0, y: 90 },
  6: { x: 180, y: 0 },
};

const diceSpinCount = [0, 0];

function rollDie() {
  return Math.floor(Math.random() * 6) + 1;
}

function buildDiceFace(value) {
  const pattern = DICE_PATTERNS[value];
  return pattern
    .map((row) => {
      const dots = row
        .split('')
        .map((cell) => `<span class="dice-dot${cell === '1' ? ' dice-dot--on' : ''}"></span>`)
        .join('');
      return `<div class="dice-row">${dots}</div>`;
    })
    .join('');
}

function buildDice() {
  diceEls.forEach((dieEl) => {
    dieEl.innerHTML = `
      <div class="die-cube">
        ${[1, 2, 3, 4, 5, 6]
          .map((value) => `<div class="die-face die-face--${value}">${buildDiceFace(value)}</div>`)
          .join('')}
      </div>
    `;
  });
}

const DICE_TILT = { x: -18, y: 22 };

function setDieRotation(index, value, withSpin) {
  const cube = diceEls[index]?.querySelector('.die-cube');
  if (!cube) return;
  const target = DICE_ROTATIONS[value] || DICE_ROTATIONS[1];
  if (withSpin) {
    diceSpinCount[index] += 2 + Math.floor(Math.random() * 2);
  }
  const spin = diceSpinCount[index] * 360;
  cube.style.transform = `rotateX(${target.x + DICE_TILT.x + spin}deg) rotateY(${target.y + DICE_TILT.y + spin}deg)`;
}

function setDiceReadout(values, total) {
  dieValueEls[0].textContent = values ? String(values[0]) : '—';
  dieValueEls[1].textContent = values ? String(values[1]) : '—';
  diceTotalEl.textContent = total == null ? '—' : String(total);
}

function initDice() {
  buildDice();
  setDieRotation(0, 1, false);
  setDieRotation(1, 1, false);
  setDiceReadout(null, null);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function botSleep(ms) {
  return sleep(ms * BOT_PACE);
}

async function animateDiceRoll(finalValues) {
  rollBtn.disabled = true;
  setDiceReadout(['?', '?'], '?');
  diceReadoutEl.classList.remove('dice-readout--pop');

  diceEls.forEach((_, index) => {
    setDieRotation(index, rollDie(), true);
  });

  await sleep(160);

  finalValues.forEach((value, index) => {
    setDieRotation(index, value, true);
  });

  await sleep(1200);

  setDiceReadout(finalValues, finalValues[0] + finalValues[1]);
  diceReadoutEl.classList.add('dice-readout--pop');
}

function openModal(html, options = {}) {
  modalEl.innerHTML = html;
  modalEl.classList.toggle('modal--wide', Boolean(options.wide));
  modalOverlayEl.hidden = false;
}

function closeModal() {
  modalOverlayEl.hidden = true;
  modalEl.innerHTML = '';
  modalEl.classList.remove('modal--wide');
}

function waitModalAction() {
  return new Promise((resolve) => {
    const onClick = (event) => {
      const button = event.target.closest('[data-modal-action]');
      if (!button || !modalEl.contains(button)) return;
      modalEl.removeEventListener('click', onClick);
      resolve({
        action: button.dataset.modalAction,
        cellId: button.dataset.cellId ? Number(button.dataset.cellId) : null,
      });
    };
    modalEl.addEventListener('click', onClick);
  });
}

function nextAuctionBid(currentBid) {
  return currentBid > 0 ? currentBid + 1 : 10;
}

function parseBidAmount(raw) {
  const normalized = String(raw || '').replace(/\s/g, '').replace(',', '.');
  const amount = Math.floor(Number(normalized));
  return Number.isFinite(amount) ? amount : NaN;
}

function waitAuctionBid(minBid, maxMoney) {
  return new Promise((resolve) => {
    const input = modalEl.querySelector('#auction-bid-input');
    const errorEl = modalEl.querySelector('#auction-bid-error');
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      modalEl.removeEventListener('click', onClick);
      modalEl.removeEventListener('submit', onSubmit);
      resolve(result);
    };

    const showError = (message) => {
      if (errorEl) errorEl.textContent = message;
      input?.focus();
      input?.select();
    };

    const tryRaise = () => {
      const amount = parseBidAmount(input?.value);
      if (!Number.isFinite(amount) || amount < minBid) {
        showError(`Нужно поставить минимум ₽ ${formatMoney(minBid)}.`);
        return;
      }
      if (amount > maxMoney) {
        showError(`У вас только ₽ ${formatMoney(maxMoney)}.`);
        return;
      }
      finish({ action: 'raise', amount });
    };

    const onClick = (event) => {
      const button = event.target.closest('[data-modal-action]');
      if (!button || !modalEl.contains(button)) return;
      if (button.dataset.modalAction === 'raise') {
        event.preventDefault();
        tryRaise();
        return;
      }
      if (button.dataset.modalAction === 'pass') finish({ action: 'pass' });
    };

    const onSubmit = (event) => {
      event.preventDefault();
      tryRaise();
    };

    modalEl.addEventListener('click', onClick);
    modalEl.addEventListener('submit', onSubmit);
    input?.focus();
    input?.select();
  });
}

function addMoney(player, amount) {
  player.money += amount;
  state.bank.money -= amount;
}

function takeMoney(player, amount) {
  player.money -= amount;
  state.bank.money += amount;
}

function payBetween(fromPlayer, toPlayer, amount) {
  fromPlayer.money -= amount;
  toPlayer.money += amount;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function setLog(message) {
  logHistory.push(message);
  if (logHistory.length > 6) logHistory.shift();
  gameLogEl.innerHTML = logHistory.map((line) => `<div>${escapeHtml(line)}</div>`).join('');
}

function clearLog(message) {
  logHistory.length = 0;
  setLog(message);
}

function talksInCharacter(player) {
  return player?.botKind === 'mart' || player?.botKind === 'lokh' || isMiron(player);
}

function renderCommentary() {
  if (!commentaryFeedEl) return;
  if (!commentHistory.length) {
    commentaryFeedEl.innerHTML = '';
    return;
  }
  commentaryFeedEl.innerHTML = commentHistory.map((entry) => `
    <div class="commentary-line commentary-line--${escapeHtml(entry.kind || 'bot')}" style="--line-color:${entry.color || '#a8b4cc'}">
      <span class="commentary-line__name" style="color:${entry.color}">${escapeHtml(entry.name)}</span>
      <span class="commentary-line__text">${escapeHtml(entry.text)}</span>
    </div>
  `).join('');
  commentaryFeedEl.scrollTop = commentaryFeedEl.scrollHeight;
}

function pushComment(player, text, options = {}) {
  if (!player || !text) return;
  commentHistory.push({
    name: player.name,
    color: player.color,
    text,
    kind: player.botKind || (player.isBot ? 'bot' : 'human'),
  });
  if (commentHistory.length > COMMENT_LIMIT) commentHistory.shift();
  renderCommentary();
  if (options.echoLog && talksInCharacter(player)) {
    setLog(`${player.name}: «${text}»`);
  }
  if (options.flavor && talksInCharacter(player)) {
    maybeMartGross(player);
    maybeLokhStory(player);
  }
}

function addComment(player, text) {
  if (!player || !text || !talksInCharacter(player)) return;
  pushComment(player, text, { echoLog: true, flavor: true });
}

function martGrossLine() {
  const lines = [
    'Ой. Я пукнул.',
    'Пукнул. Извините. Или нет.',
    'Кажется, пукнул. Пахнет победой.',
    'Блеванул чуть-чуть. Нормально же?',
    'Меня стошнило. Но кубики мои.',
    'Пук. Продолжаем.',
    'Блевать охота. Беру ещё улицу потом.',
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

function maybeMartGross(player) {
  if (!isLuckyFool(player) || Math.random() > 0.22) return;
  if (commentHistory[commentHistory.length - 1]?.text?.includes('пук')
    || commentHistory[commentHistory.length - 1]?.text?.includes('Блев')
    || commentHistory[commentHistory.length - 1]?.text?.includes('стошн')) {
    return;
  }
  const line = martGrossLine();
  commentHistory.push({
    name: player.name,
    color: player.color,
    text: line,
    kind: player.botKind || 'bot',
  });
  if (commentHistory.length > COMMENT_LIMIT) commentHistory.shift();
  renderCommentary();
  setLog(`${player.name}: «${line}»`);
}

function lokhLifeStory() {
  const lines = [
    'Вчера кошелёк выпал в лужу. Купюры ещё плывут, я уже нет.',
    'На работе премию перепутали: отдали соседу по фамилии. Я посчитал таблицу — всё равно мне ноль.',
    'Купил акции «наверняка». Через час они стоили как трамвайный билет.',
    'Таксист объехал пробку через весь город. Счётчик честный. Я — нет.',
    'Банкомат съел карту, потом выдал чек: «спасибо за пожертвование».',
    'Страховка не покрыла потоп: «утка не является страховым случаем».',
    'Выиграл в лотерею десять рублей. Билет стоил триста.',
    'Долг вернули — чужими деньгами, фальшивыми. Я это сразу посчитал. Поздно.',
    'В детстве копилка упала в канализацию. С тех пор так и живём.',
    'Три раза подряд выбирал короткую очередь. Все три кассы закрылись передо мной.',
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

function maybeLokhStory(player) {
  if (!isUnluckySmart(player) || Math.random() > 0.2) return;
  const last = commentHistory[commentHistory.length - 1]?.text || '';
  if (last.includes('кошел') || last.includes('преми') || last.includes('акци') || last.includes('Банкомат') || last.includes('копилк')) {
    return;
  }
  const line = lokhLifeStory();
  commentHistory.push({
    name: player.name,
    color: player.color,
    text: line,
    kind: player.botKind || 'bot',
  });
  if (commentHistory.length > COMMENT_LIMIT) commentHistory.shift();
  renderCommentary();
  setLog(`${player.name}: «${line}»`);
}

function clearComments() {
  commentHistory.length = 0;
  renderCommentary();
}

function restoreComments(entries) {
  commentHistory.length = 0;
  (entries || []).forEach((entry) => {
    if (entry?.name && entry?.text) commentHistory.push(entry);
  });
  if (commentHistory.length > COMMENT_LIMIT) {
    commentHistory.splice(0, commentHistory.length - COMMENT_LIMIT);
  }
  renderCommentary();
}

function formatNameList(names) {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} и ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} и ${names[names.length - 1]}`;
}

function migrateHumanNames(players) {
  (players || []).forEach((player) => {
    if (player.name === 'Игрок 1') player.name = 'Кирилл';
    if (player.name === 'Игрок 2') player.name = 'Артём';
  });
}

function tableWelcome(names) {
  return `За столом ${formatNameList(names)}. Март, Лох и Мирон ходят сами.`;
}

function isMiron(player) {
  return player?.botKind === 'miron' || player?.botId === 'miron' || player?.name === 'Мирон';
}

function isBot(player) {
  return Boolean(player?.isBot);
}

function usesLuckBias(player) {
  return player?.botKind === 'mart' || player?.botKind === 'lokh';
}

function isLuckyFool(player) {
  return player?.botKind === 'mart';
}

function isUnluckySmart(player) {
  return player?.botKind === 'lokh';
}

function createMironPlayer() {
  const template = PLAYERS.find((player) => player.botKind === 'miron') || {
    id: 4,
    name: 'Мирон',
    token: '🦉',
    color: '#EF6C00',
    money: 1500,
    position: 0,
    isBot: true,
    botId: 'miron',
    botKind: 'miron',
  };
  return {
    ...structuredClone(template),
    inJail: false,
    jailTurns: 0,
    jailFreeCards: [],
    bankrupt: false,
  };
}

function ensureMironInRoster(snapshot) {
  if (state.players.some((player) => isMiron(player))) return;
  if (snapshot && !snapshot.game?.players?.some((player) => player.botKind === 'miron' || player.name === 'Мирон')) return;
  const insertAt = Math.min(2, state.players.length);
  state.players.splice(insertAt, 0, createMironPlayer());
  if (state.activePlayerIndex >= insertAt) {
    state.activePlayerIndex += 1;
  }
}

function updatePlayersHint() {
  if (!playersHintEl) return;
  const names = formatNameList(state.players.map((player) => player.name));
  const talkers = state.players.filter((player) => talksInCharacter(player)).map((player) => player.name);
  const commentHint = talkers.length
    ? ` Реплики ${formatNameList(talkers)} — справа и в журнале на поле.`
    : '';
  playersHintEl.textContent = `За столом ${names}.${commentHint}`;
}

function botTurnAlive(gen, player) {
  return gameGen === gen && getActivePlayer() === player && !player.bankrupt && state.winnerId == null;
}

function groupPriority(group) {
  return {
    orange: 8,
    red: 7,
    pink: 6,
    lightblue: 6,
    yellow: 5,
    green: 3,
    darkblue: 3,
    brown: 2,
  }[group] || 1;
}

function countOwnedInGroup(playerId, group) {
  return getGroupCells(group).filter((cell) => state.titles[cell.id].ownerId === playerId).length;
}

function completesSet(player, cell) {
  if (cell.type !== 'property' || !cell.group) return false;
  return getGroupCells(cell.group).every((item) => (
    item.id === cell.id || state.titles[item.id].ownerId === player.id
  ));
}

function ownedMonopolyGroups(playerId) {
  return Object.keys(PROPERTY_GROUPS).filter((group) => ownsFullGroup(playerId, group));
}

function pickBuildCell(player, group) {
  const cells = [...getGroupCells(group)].sort((a, b) => (
    state.titles[a.id].houses - state.titles[b.id].houses
  ));
  return cells.find((cell) => houseActionState(player, cell).canBuy) || null;
}

function martCashReserve(player) {
  const othersDangerous = state.players.some((item) => (
    item.id !== player.id && !item.bankrupt && countBuildings(item.id).hotels > 0
  ));
  const monopolies = ownedMonopolyGroups(player.id).length;
  let reserve = monopolies === 0 ? 220 : 180;
  if (othersDangerous) reserve += 120;
  return reserve;
}

function martWantsOutOfJail(player) {
  const needsBuild = ownedMonopolyGroups(player.id).some((group) => (
    getGroupCells(group).some((cell) => state.titles[cell.id].houses < 3)
  ));
  if (needsBuild) return true;
  return Object.keys(PROPERTY_GROUPS).some((group) => {
    const cells = getGroupCells(group);
    const owned = countOwnedInGroup(player.id, group);
    const free = cells.some((cell) => state.titles[cell.id].ownerId == null);
    return owned === cells.length - 1 && free;
  });
}

async function botThink(player, message) {
  if (message) addComment(player, message);
  if (isLuckyFool(player)) {
    if (Math.random() < 0.28) addComment(player, martGrossLine());
    await botSleep(2000);
    return;
  }
  if (isUnluckySmart(player) && Math.random() < 0.3) {
    addComment(player, lokhLifeStory());
  }
  await botSleep(isMiron(player) ? 520 : 600);
}

function talkingBots() {
  return state.players.filter((player) => talksInCharacter(player) && !player.bankrupt);
}

function humanPlayers() {
  return state.players.filter((player) => !isBot(player) && !player.bankrupt);
}

function getChatSpeaker() {
  const humans = humanPlayers();
  if (!humans.length) return null;
  return humans.find((player) => player.id === chatSpeakerId)
    || humans.find((player) => player === getActivePlayer())
    || humans[0];
}

function updateChatCompose() {
  const speaker = getChatSpeaker();
  const on = matchActive && Boolean(speaker);
  if (commentaryInputEl) commentaryInputEl.disabled = !on;
  if (commentarySendEl) commentarySendEl.disabled = !on;
  if (!commentarySpeakerRowEl) return;

  const humans = humanPlayers();
  if (!on || humans.length < 2) {
    commentarySpeakerRowEl.hidden = true;
    commentarySpeakerRowEl.innerHTML = '';
    if (speaker) chatSpeakerId = speaker.id;
    return;
  }

  if (!humans.some((player) => player.id === chatSpeakerId)) {
    chatSpeakerId = speaker.id;
  }
  commentarySpeakerRowEl.hidden = false;
  commentarySpeakerRowEl.innerHTML = humans.map((player) => `
    <button type="button" class="commentary-speaker${player.id === chatSpeakerId ? ' is-active' : ''}" data-speaker-id="${player.id}" style="--seat-color:${player.color}">
      ${player.token} ${escapeHtml(player.name)}
    </button>
  `).join('');
}

function handleSpeakerClick(event) {
  const button = event.target.closest('[data-speaker-id]');
  if (!button) return;
  chatSpeakerId = Number(button.dataset.speakerId);
  updateChatCompose();
  commentaryInputEl?.focus();
}

function messageMentions(text, bot) {
  const haystack = String(text || '').toLowerCase();
  if (isLuckyFool(bot)) return /март|кот|кошак/.test(haystack);
  if (isUnluckySmart(bot)) return /лох|утк/.test(haystack);
  if (isMiron(bot)) return /мирон|сов/.test(haystack);
  return false;
}

function chatReplyLine(bot, speaker, text) {
  const who = speaker?.name || 'человек';
  const haystack = String(text || '').toLowerCase();
  const asked = /\?/.test(text) || /почему|зачем|как тебе|что дума|соглас/.test(haystack);
  const aboutMoney = /денег|рубл|банк|купи|улиц|аренд|дорог|дешев|дорог/.test(haystack);
  const aboutJail = /тюрьм|сидишь|решёт|решет/.test(haystack);
  const greeting = /привет|здраст|хай|добр|ку\b/.test(haystack);
  const roast = /дурак|туп|глуп|идиот|слабый|нытик/.test(haystack);
  const pick = (...lines) => pickFreshLine(lines);

  if (isLuckyFool(bot)) {
    if (greeting) return pick('Привет. Ты пахнешь не рыбой, но ладно.', `Привет, ${who}. Можно просто кидать кубики?`);
    if (aboutJail) return pick('Клетка это круто, если там миска.', 'Тюрьма. Я бы там подремал.');
    if (aboutMoney) return pick('Деньги? Я думал, это еда в бумажках.', 'Покупай блестящее. Я так живу.');
    if (roast) return pick('Меня обзвали. Пукну в ответ.', 'Обзываться можно. Я всё равно везучий.');
    if (asked) return pick('Я не понял вопрос. Можно рыбу?', 'Да. Или нет. Я отвлёкся на пылинку.');
    return pick(
      `${who} пишет. Я умею читать, но лениво.`,
      'Ок. Я тут. Иногда пукаю, иногда побеждаю.',
      'Написано красиво. Как колбаса, только буквы.',
      'Я согласен, если это про еду. Если нет — тоже ладно.',
    );
  }

  if (isUnluckySmart(bot)) {
    if (greeting) return pick(`Привет, ${who}. Надеюсь, день лучше моего. Планка низкая.`, 'Здорово. Я как раз вспоминал фальшивый долг.');
    if (aboutJail) return pick('Тюрьма без процентов. Редкая честность.', 'Сидел бы сам, но кубики и так меня туда возят.');
    if (aboutMoney) return pick('Считай дважды. Я считал — всё равно ноль.', 'Умная покупка меня обычно обходит стороной.');
    if (roast) return pick('Справедливо. Вселенная со мной согласна давно.', 'Оскорблять неудачника — стрельба по открытой цели.');
    if (asked) return pick('Короткий ответ: не бери, если после покупки останешься нищим.', `Если честно, ${who}, я бы пасовал. Мне так спокойнее.`);
    return pick(
      `${who} пишет в чат. Хоть кто-то меня слышит, кроме кассира.`,
      'Прочитал. Завидовать не буду — уже устал.',
      'Имей в виду: если план хороший, кубики его испортят. Мой опыт.',
      'Я бы ответил остроумнее, но банкомат снова съел настроение.',
    );
  }

  if (greeting) return pick(`Добрый вечер, ${who}. Совы не спят — они ведут протокол.`, 'Приветствую. Пишите короче, судьба и так многословна.');
  if (aboutJail) return pick('Решётка — единственный адрес без капремонта.', 'Тюрьма лечит импульсы. Рекомендую курсом.');
  if (aboutMoney) return pick('Деньги любят тишину. Улицы — нет.', 'Покупай смысл, не блеск. Блеск потом сам придёт — или нет.');
  if (roast) return pick('Остро. Почти как налог. Почти.', 'Я занёс реплику в журнал. Аплодисменты не прилагаются.');
  if (asked) return pick(`Вопрос принят, ${who}. Ответ: реже геройствуй, чаще считай.`, 'Если сомневаешься — пас. Героизм хорошо смотрится в чужих руках.');
  return pick(
    `${who} вышел на связь. Стол стал шумнее, смысл — посмотрим.`,
    'Услышал. Комментирую сдержанно: жизнь и так даёт рецензии.',
    'Пишите ещё. Молчание тоже ход, но скучный.',
    'Заметил. Даже кивнул. Для совы это почти объятие.',
  );
}

async function replyToChat(speaker, text, gen) {
  const mentioned = talkingBots().filter((bot) => messageMentions(text, bot));
  const pool = (mentioned.length ? mentioned : talkingBots()).slice().sort(() => Math.random() - 0.5);
  const count = mentioned.length >= 2 ? Math.min(2, pool.length) : Math.min(1, pool.length);

  for (const bot of pool.slice(0, count)) {
    await botSleep(isLuckyFool(bot) ? 420 : 280);
    if (gameGen !== gen || !matchActive) return;
    const line = chatReplyLine(bot, speaker, text);
    if (line) pushComment(bot, line, { echoLog: false, flavor: false });
  }
  persistGame();
}

function handleChatSubmit(event) {
  event.preventDefault();
  if (!matchActive) return;
  const text = commentaryInputEl?.value.trim().slice(0, 160);
  const speaker = getChatSpeaker();
  if (!text || !speaker) return;
  commentaryInputEl.value = '';
  chatSpeakerId = speaker.id;
  pushComment(speaker, text, { echoLog: false, flavor: false });
  persistGame();
  replyToChat(speaker, text, gameGen);
}

function pickFreshLine(lines) {
  const unused = lines.filter((line) => !recentHumanReactions.includes(line));
  const pool = unused.length ? unused : lines;
  const line = pool[Math.floor(Math.random() * pool.length)];
  recentHumanReactions.push(line);
  if (recentHumanReactions.length > 18) recentHumanReactions.shift();
  return line;
}

function reactionLine(bot, event) {
  const who = event.actor?.name || 'он';
  const place = event.cell?.name || '';
  const sum = event.total;
  const rent = event.rent;
  const owner = event.owner?.name || 'хозяину';
  const pick = (...lines) => pickFreshLine(lines);

  if (isLuckyFool(bot)) {
    if (event.type === 'roll') {
      if (event.dice?.[0] === event.dice?.[1]) {
        return pick(
          `Дубль у ${who}! Я тоже кот, мне можно завидовать.`,
          `${who} два одинаковых. Это как дважды покормить меня.`,
          `Ого, ${who} дубль. Я бы кинул ещё раз просто так.`,
        );
      }
      if (sum >= 10) {
        return pick(
          `${who} аж ${sum}. Почти как я, только я красивее.`,
          `Большие цифры у ${who}. Я люблю большие. И еду.`,
          `${sum}! Если бы это была колбаса, я бы уже ел.`,
        );
      }
      if (sum <= 4) {
        return pick(
          `${who} почти не ушёл. Я бы заснул на клетке.`,
          `Мало. Скучно. Можно я пукну вместо комментария?`,
        );
      }
      return pick(
        `${who} кинул средне. Как погода.`,
        `Я отвлёкся. ${who} уже ходит? Ну ок.`,
        `Цифры. Не еда. Ладно.`,
      );
    }
    if (event.type === 'buy') {
      return pick(
        `${who} купил «${place}». Блестит. Хочу.`,
        `Улица. Я думал, это еда. Нет?`,
        `${who} потратился. Я бы купил рыбу.`,
        `«${place}» теперь чья-то. Не моя. Жалко, наверное.`,
      );
    }
    if (event.type === 'pass') {
      return pick(
        `${who} не взял. А вдруг там мыши?`,
        `Пас. Я тоже пас, когда сложно.`,
        `Не купил. Значит, можно украсть? Нельзя? Жаль.`,
      );
    }
    if (event.type === 'rent') {
      return pick(
        `${who} отдаёт деньги. Я бы спрятал под лапу.`,
        `Платит ${owner}. Грустно или смешно, я не понял.`,
        `Деньги ушли. Как мой обед вчера.`,
      );
    }
    if (event.type === 'jail') {
      return pick(
        `${who} в клетке. Я тоже люблю коробки, но другие.`,
        `Тюрьма. Там хоть кормят?`,
        `${who} сел. Я бы вылизался и забыл.`,
      );
    }
    if (event.type === 'tax' || event.type === 'own' || event.type === 'rest' || event.type === 'card') {
      return pick(
        'Мне скучно. Можно историю про мусорку?',
        'Я тут. Пукнул чуть-чуть мысленно.',
        `${who} что-то сделал. Я моргнул и пропустил.`,
        'Если это не еда и не дубль, мне всё равно.',
      );
    }
    return null;
  }

  if (isUnluckySmart(bot)) {
    if (event.type === 'roll') {
      if (event.dice?.[0] === event.dice?.[1]) {
        return pick(
          `Дубль ${who}. У меня такие бывают только в чеках на штраф.`,
          `${who} снова везёт парами. Я в этом мире статист.`,
          `Два одинаковых. Вселенная выбрала не утку.`,
        );
      }
      if (sum >= 10) {
        return pick(
          `${sum} у ${who}. Я бы на этом броске уже был должен банку.`,
          `Далеко ушёл. Мне такое кидали ровно один раз — в сон.`,
          `${who} летит. Я в это время обычно плачу налог.`,
        );
      }
      return pick(
        `${who} на ${sum}. Скромно. Завидую даже скромному.`,
        `Обычный бросок. Для меня уже роскошь.`,
        `${sum}. Не катастрофа. Катастрофа — это когда хожу я.`,
      );
    }
    if (event.type === 'buy') {
      return pick(
        `«${place}» у ${who}. Если группа закроется — я это заранее оплакал.`,
        `${who} вкладывается. У меня вклады обычно испаряются.`,
        `Покупка осмысленная. Значит, мне она не светит.`,
        `Смотрю на «${place}» и вспоминаю свой первый кошелёк. Тоже утонул.`,
      );
    }
    if (event.type === 'pass') {
      return pick(
        `${who} пасует. Иногда пас умнее покупки. Иногда — как моя жизнь.`,
        `Отказ. Если улица хорошая, через три круга пожалеет. Как я.`,
        `Не взял. Банк подождёт другого неудачника. Меня, например.`,
      );
    }
    if (event.type === 'rent') {
      return pick(
        `${who} платит ${owner}. Я такие суммы обычно теряю без аренды, просто так.`,
        `Аренда. Честная. В отличие от моего банкомата.`,
        `Счёт списан. Хоть не у меня. Сегодня.`,
      );
    }
    if (event.type === 'jail') {
      return pick(
        `${who} сел. Три хода тишины — я бы на его месте отдохнул от счетов.`,
        `Решётка. Зато крыша есть. У моей копилки не было и этого.`,
        `Тюрьма без процентов. Редкая удача, которой у меня нет.`,
      );
    }
    if (event.type === 'tax') {
      return pick(
        `Налог с ${who}. Государство честнее лотереи, в которой я участвовал.`,
        `Казна забрала долю. Знакомое чувство.`,
      );
    }
    if (event.type === 'card') {
      return pick(
        `${who} тянет карту. Пусть хотя бы ему выпадет не «заплатите всем».`,
        `Колода. Бумага не помнит, сколько раз она меня грабила.`,
      );
    }
    if (event.type === 'own' || event.type === 'rest') {
      return pick(
        `${who} никому не должен. Завидую спокойно, без истерики.`,
        `Пауза. Я в такие минуты обычно вспоминаю фальшивый долг.`,
      );
    }
    return null;
  }

  if (event.type === 'roll') {
    if (event.dice?.[0] === event.dice?.[1]) {
      return pick(
        `Дубль ${who}. Фортуна моргнула. Я занёс в протокол без аплодисментов.`,
        `${who} получил пару. Редкость, которой не стоит гордиться слишком громко.`,
        `Два ${event.dice[0]}. Симметрия радует глаз, кошелёк — посмотрим.`,
      );
    }
    if (sum >= 10) {
      return pick(
        `${who} на ${sum}. Либо талант, либо кубики флиртуют. Ставлю на флирт.`,
        `Дальний бросок. География расширяется, характер — нет.`,
        `${sum} клеток амбиций. Посмотрим, чем сердце успокоится.`,
      );
    }
    if (sum <= 4) {
      return pick(
        `${who} почти медитирует на клетке. Буддизм бесплатный, аренда нет.`,
        `Короткий шаг. Иногда так спасают состояние. Иногда — только самолюбие.`,
      );
    }
    return pick(
      `${who} бросил как взрослый: без драмы и без поэзии.`,
      `Средний бросок. Самый честный жанр литературы.`,
      `${sum}. Не шедевр, но и не банкротство. Пока.`,
    );
  }
  if (event.type === 'buy') {
    return pick(
      `${who} купил «${place}». Смелость приходит до чека, мудрость — после.`,
      `Сделка закрыта. Земля не обижается, кошелёк — иногда.`,
      `«${place}» сменила хозяина. История Москвы продолжается без consents жителей.`,
      `${who} инвестирует. Я аплодирую тихо, чтобы не спугнуть удачу.`,
    );
  }
  if (event.type === 'pass') {
    return pick(
      `${who} оставил «${place}» рынку. Редкое проявление вкуса.`,
      `Пас. Не каждый день видишь человека, который умеет сказать «нет».`,
      `Аукцион любит слабонервных. Посмотрим, кто моргнёт первым.`,
    );
  }
  if (event.type === 'rent') {
    return pick(
      `${who} содержит ${owner}. Роман без поцелуев, зато с квитанцией.`,
      `Аренда за «${place}». Любовь к чужой недвижимости всегда платная.`,
      `${owner} улыбается внутренне. Я это вижу. Совы видят лишнее.`,
    );
  }
  if (event.type === 'jail') {
    return pick(
      `${who} в тюрьме. Единственный адрес, где не просят за капитальный ремонт.`,
      `Решётка. В этой игре это почти санаторий, только без компота.`,
      `${who} арестован кубиками. Суд присяжных не предусмотрен.`,
    );
  }
  if (event.type === 'tax') {
    return pick(
      `Налог. Банк не шутит, в отличие от Марта.`,
      `${who} профинансировал казну. Патриотизм по тарифу.`,
    );
  }
  if (event.type === 'own') {
    return pick(
      `${who} в гостях у собственной таблички. Сюжет отказал.`,
      `Своя клетка. Можно выдохнуть и притвориться, что это стратегия.`,
    );
  }
  if (event.type === 'rest') {
    return pick(
      `Стоянка. Единственное место, где честность ничего не стоит.`,
      `${who} отдыхает. Рекомендую: редко кто умеет ничего не делать бесплатно.`,
    );
  }
  if (event.type === 'card') {
    return pick(
      `${who} доверяет бумаге больше, чем людям. Разумно.`,
      `Карта. Судьба в конверте. Без обратного адреса.`,
    );
  }
  return null;
}

function reactionWorthCommenting(event) {
  if (event.type === 'jail' || event.type === 'buy' || event.type === 'pass') return true;
  if (event.type === 'rent' && (event.rent || 0) >= 80) return true;
  if (event.type === 'roll' && (event.dice?.[0] === event.dice?.[1] || event.total >= 10 || event.total <= 3)) {
    return true;
  }
  if (event.type === 'own' || event.type === 'rest') return Math.random() < 0.22;
  if (event.type === 'tax' || event.type === 'card') return Math.random() < 0.45;
  if (event.type === 'roll') return Math.random() < 0.35;
  return Math.random() < 0.4;
}

async function botsReact(event) {
  if (!event?.actor || isBot(event.actor)) return;
  if (!reactionWorthCommenting(event)) return;
  skipNextHumanComment = !skipNextHumanComment;
  if (skipNextHumanComment) return;

  const bots = talkingBots().sort(() => Math.random() - 0.5);
  const bot = bots[0];
  if (!bot) return;
  const line = reactionLine(bot, event);
  if (!line) return;
  await botSleep(isLuckyFool(bot) ? 380 : 240);
  addComment(bot, line);
}

function rollDiceFor(player) {
  let first = rollDie();
  let second = rollDie();
  if (isUnluckySmart(player) && first + second >= 8 && Math.random() < 0.5) {
    first = rollDie();
    second = rollDie();
  }
  if (isLuckyFool(player) && first + second <= 5 && Math.random() < 0.5) {
    first = rollDie();
    second = rollDie();
  }
  return [first, second];
}

function scoreCardForLuck(card, player) {
  switch (card.type) {
    case 'collect':
      return card.amount;
    case 'pay':
      return -card.amount * 1.2;
    case 'pay-each':
      return -card.amount * state.players.filter((item) => item.id !== player.id && !item.bankrupt).length;
    case 'collect-each':
      return card.amount * state.players.filter((item) => item.id !== player.id && !item.bankrupt).length;
    case 'jail':
      return -350;
    case 'jail-free':
      return 160;
    case 'repairs': {
      const { houses, hotels } = countBuildings(player.id);
      return -(houses * card.house + hotels * card.hotel);
    }
    case 'advance':
      return scoreLandingLuck(player, card.position, true);
    case 'move': {
      const dest = (player.position + card.steps + BOARD.length) % BOARD.length;
      return scoreLandingLuck(player, dest, false);
    }
    case 'nearest-utility':
      return scoreLandingLuck(player, nextCellOfType(player.position, 'utility'), true);
    case 'nearest-railroad':
      return scoreLandingLuck(player, nextCellOfType(player.position, 'railroad'), true);
    default:
      return 0;
  }
}

function scoreLandingLuck(player, position, collectGo) {
  let score = 0;
  if (collectGo && position <= player.position) score += 200;
  if (position === 0) score += 80;
  if (position === GO_TO_JAIL_POSITION) score -= 300;
  const cell = BOARD[position];
  if (cell.type === 'tax') score -= cell.amount;
  if (isTitleCell(cell)) {
    const title = state.titles[cell.id];
    if (title.ownerId == null) score += 40;
    else if (title.ownerId === player.id) score += 20;
    else if (!title.mortgaged) score -= getRent(cell, 7) + 30;
  }
  return score;
}

function mironCashReserve(player) {
  const monopolies = ownedMonopolyGroups(player.id).length;
  let reserve = monopolies === 0 ? 240 : 200;
  const othersDangerous = state.players.some((item) => (
    item.id !== player.id && !item.bankrupt && countBuildings(item.id).hotels > 0
  ));
  if (othersDangerous) reserve += 80;
  return reserve;
}

function mironShouldBuy(player, cell) {
  if (player.money < cell.price) return false;
  const reserve = mironCashReserve(player);
  const after = player.money - cell.price;
  if (completesSet(player, cell)) return after >= 80;
  if (cell.type === 'railroad') {
    const rails = countOwnedOfType(player.id, 'railroad');
    if (rails >= 2) return after >= reserve - 40;
    if (rails >= 1) return after >= reserve;
    return after >= reserve + 80;
  }
  if (cell.type === 'utility') {
    return countOwnedOfType(player.id, 'utility') >= 1 && after >= reserve + 150;
  }
  if (cell.type === 'property') {
    if (countOwnedInGroup(player.id, cell.group) >= 1) return after >= Math.min(reserve, 160);
    if (['brown', 'darkblue', 'green'].includes(cell.group)) return after >= reserve + 220;
    if (groupPriority(cell.group) >= 6) return after >= reserve + 40;
    return after >= reserve + 160;
  }
  return false;
}

function mironMaxBid(player, cell) {
  const budget = Math.max(0, player.money - Math.min(mironCashReserve(player), 140));
  if (completesSet(player, cell)) return Math.min(budget, Math.floor(cell.price * 1.3));
  if (cell.type === 'railroad' && countOwnedOfType(player.id, 'railroad') >= 1) {
    return Math.min(budget, Math.floor(cell.price * 1.12));
  }
  if (cell.type === 'property' && countOwnedInGroup(player.id, cell.group) >= 1) {
    return Math.min(budget, Math.floor(cell.price * 1.1));
  }
  if (cell.type === 'property' && groupPriority(cell.group) >= 6) {
    return Math.min(budget, Math.floor(cell.price * 0.85));
  }
  if (cell.type === 'railroad') return Math.min(budget, Math.floor(cell.price * 0.7));
  return Math.min(budget, Math.floor(cell.price * 0.28));
}

function martShouldBuy(player, cell) {
  if (player.money < cell.price) return false;
  const reserve = martCashReserve(player);
  if (completesSet(player, cell)) return true;
  if (cell.type === 'railroad' && countOwnedOfType(player.id, 'railroad') >= 3) return true;
  if (player.money - cell.price < reserve) return false;
  if (cell.type === 'property') {
    if (countOwnedInGroup(player.id, cell.group) >= 1) return true;
    return player.money - cell.price >= reserve + (groupPriority(cell.group) >= 6 ? 40 : 140);
  }
  if (cell.type === 'railroad') {
    return countOwnedOfType(player.id, 'railroad') >= 1 || player.money > 850;
  }
  if (cell.type === 'utility') {
    return countOwnedOfType(player.id, 'utility') >= 1 && player.money > 650;
  }
  return false;
}

function lokhShouldBuy(player, cell) {
  if (player.money < cell.price) return false;
  if (completesSet(player, cell) && cell.price <= 220 && Math.random() < 0.45) return false;
  if (cell.type === 'property' && groupPriority(cell.group) >= 6 && Math.random() < 0.4) return false;
  if (cell.type === 'utility') return true;
  if (cell.type === 'property' && ['darkblue', 'green', 'brown'].includes(cell.group)) {
    return Math.random() < 0.72;
  }
  if (cell.type === 'railroad') return Math.random() < 0.55;
  return Math.random() < 0.35;
}

function botShouldBuy(player, cell) {
  if (isUnluckySmart(player)) return martShouldBuy(player, cell);
  if (isLuckyFool(player)) return lokhShouldBuy(player, cell);
  return mironShouldBuy(player, cell);
}

function botMaxBid(player, cell) {
  if (isUnluckySmart(player)) return martMaxBid(player, cell);
  if (isLuckyFool(player)) return lokhMaxBid(player, cell);
  return mironMaxBid(player, cell);
}

function martMaxBid(player, cell) {
  const budget = Math.max(0, player.money - Math.min(martCashReserve(player), 120));
  if (completesSet(player, cell)) return Math.min(budget, Math.floor(cell.price * 1.45));
  if (cell.type === 'property' && countOwnedInGroup(player.id, cell.group) >= 1) {
    return Math.min(budget, Math.floor(cell.price * 1.15));
  }
  if (cell.type === 'railroad' && countOwnedOfType(player.id, 'railroad') >= 1) {
    return Math.min(budget, Math.floor(cell.price * 1.05));
  }
  if (cell.type === 'property' && groupPriority(cell.group) >= 6) {
    return Math.min(budget, Math.floor(cell.price * 0.9));
  }
  if (cell.type === 'utility' && countOwnedOfType(player.id, 'utility') >= 1) {
    return Math.min(budget, Math.floor(cell.price * 0.75));
  }
  return Math.min(budget, Math.floor(cell.price * 0.35));
}

function lokhMaxBid(player, cell) {
  if (completesSet(player, cell) && cell.price <= 220 && Math.random() < 0.4) return 0;
  if (cell.type === 'utility' || (cell.group && ['brown', 'green', 'darkblue'].includes(cell.group))) {
    return Math.min(player.money, Math.floor(cell.price * (1.05 + Math.random() * 0.5)));
  }
  if (cell.type === 'property' && groupPriority(cell.group) >= 6 && Math.random() < 0.45) return 0;
  if (Math.random() < 0.4) return Math.min(player.money, 10 + Math.floor(Math.random() * 90));
  return Math.min(player.money, Math.floor(cell.price * 0.55));
}

function purchaseThought(player, cell, want) {
  const group = cell.group ? PROPERTY_GROUPS[cell.group].label.toLowerCase() : '';
  if (isUnluckySmart(player)) {
    if (want && completesSet(player, cell)) return `Закрываю ${group} группу. Хоть что-то в этой партии по плану.`;
    if (want) return `Беру «${cell.name}». Вписывается, и не переплачу.`;
    return `«${cell.name}» дорого и одиноко. Пусть торгуются.`;
  }
  if (isMiron(player)) {
    if (want && completesSet(player, cell)) return `Закрываю «${cell.name}». Теперь соседи будут платить мне за воздух.`;
    if (want && cell.type === 'railroad') return 'Ещё вокзал. Поезда не спрашивают, везучий ты или утка.';
    if (want) return `«${cell.name}» за свои деньги. Романтика минимальная, профит — потом.`;
    return `«${cell.name}» подождёт. Я сова, не филантроп.`;
  }
  if (want) return 'О, красивая клетка, беру.';
  if (completesSet(player, cell)) return 'Дома? Потом как-нибудь.';
  return 'Сложно как-то. Не надо.';
}

function auctionThought(player, cell, raise) {
  if (isUnluckySmart(player)) {
    return raise ? 'Ставлю. Цена ещё не дурная.' : 'Дороже пользы. Пас.';
  }
  if (isMiron(player)) {
    return raise
      ? 'Ставлю. Жадность — двигатель аукциона, но у меня лимит.'
      : 'Дальше не иду. Дорогое геройство плохо греет.';
  }
  return raise ? 'Повышаю. Вдруг повезёт.' : 'Ладно, не буду.';
}

function diceThought(player, dice, total) {
  if (isUnluckySmart(player)) {
    if (total >= 10) return `Снова ${total}. Как назло, далеко.`;
    if (total >= 8) return 'Снова восемь. Перебросил — ещё хуже.';
    if (dice[0] === dice[1]) return 'Дубль. Ну хоть это, раз уж везения нет.';
    return `${dice[0]} и ${dice[1]}. Типично.`;
  }
  if (isMiron(player)) {
    if (dice[0] === dice[1]) return `Дубль ${dice[0]}. Вселенная подмигнула. Я не подмигиваю в ответ.`;
    if (total >= 10) return `${total}. Далеко, зато не в чужой карман с разбега.`;
    if (total <= 4) return `${total}. Почти медитация: никуда не ушёл и никому не должен.`;
    return `${dice[0]} и ${dice[1]}. Скучный бросок — мой любимый жанр.`;
  }
  if (total >= 10) return 'Вот это бросок! Я же говорил, везёт.';
  if (dice[0] === dice[1]) return 'Дубль! Мне всегда везёт.';
  return 'Нормально. Мне и так везёт.';
}

function jailThought(player, action, mustLeave) {
  if (isUnluckySmart(player)) {
    if (action === 'card') return 'Карта выхода. На улице ещё есть смысл ходить.';
    if (action === 'pay') return mustLeave ? 'Третий ход. Плачу, выбора нет.' : 'Выхожу. Сидеть сейчас невыгодно.';
    return 'Посижу. На улице сейчас только чужие отели.';
  }
  if (isMiron(player)) {
    if (action === 'card') return 'Трачу «выход». Свобода дешевле, чем слушать, как Март пукает за стенкой.';
    if (action === 'pay') return 'Полтинник за свободу. В Москве и не такое берут за воздух.';
    return 'Сижу. Иногда лучший ход — не делать вид, что ты везучий.';
  }
  if (action === 'card') return 'О, карточка. Повезло опять.';
  if (action === 'pay') return mustLeave ? 'Ну всё, плачу. Надоело.' : 'Скучно тут, плачу.';
  return 'Кину на удачу. Мне везёт.';
}

function buildThought(player, cell, built) {
  if (isLuckyFool(player)) {
    return built ? 'Поставлю домик. Красиво будет.' : 'Дома? Потом как-нибудь.';
  }
  if (isMiron(player)) {
    return built
      ? 'Ставлю дом. Пусть платят за вид из окна, которого нет.'
      : 'Дома подождут. Наличные любят, когда их не разбрасывают.';
  }
  return built ? 'Ровно ставлю. Три дома — аренда уже кусается.' : 'Пока коплю. Кубики и так против.';
}

function mortgageThought(player) {
  if (isLuckyFool(player)) return 'Заложу что покрасивее. Наверное.';
  if (isMiron(player)) return 'Заложу лишнее. Монополию не трогаю — это уже почти искусство.';
  return 'Закладываю лишнее. Монополию не трогаю.';
}

function sellEvenHouse(player, groupsInOrder) {
  for (const group of groupsInOrder) {
    const cells = getGroupCells(group).filter((cell) => state.titles[cell.id].ownerId === player.id);
    const candidate = [...cells].sort((a, b) => state.titles[b.id].houses - state.titles[a.id].houses)
      .find((cell) => houseActionState(player, cell).canSell);
    if (candidate) {
      sellHouse(player, candidate.id);
      return true;
    }
  }
  return false;
}

function mortgageByScore(player, scoreFn) {
  const owned = ownedCells(player.id)
    .filter((cell) => {
      const title = state.titles[cell.id];
      return title && !title.mortgaged && (cell.type !== 'property' || !groupHasBuildings(cell.group));
    })
    .sort((a, b) => scoreFn(b) - scoreFn(a));
  if (!owned.length) return false;
  mortgageProperty(player, owned[0].id);
  return true;
}

function martRaiseOnce(player) {
  const keepFirst = Object.keys(PROPERTY_GROUPS).sort((a, b) => groupPriority(b) - groupPriority(a));
  if (sellEvenHouse(player, [...keepFirst].reverse())) return true;
  return mortgageByScore(player, (cell) => {
    if (cell.type === 'utility') return 90;
    if (cell.type === 'railroad') return countOwnedOfType(player.id, 'railroad') <= 1 ? 70 : 25;
    if (ownsFullGroup(player.id, cell.group)) return 5;
    return 50 - groupPriority(cell.group);
  });
}

function lokhRaiseOnce(player) {
  const bestFirst = Object.keys(PROPERTY_GROUPS).sort((a, b) => groupPriority(b) - groupPriority(a));
  if (mortgageByScore(player, (cell) => {
    if (cell.type === 'property' && ownsFullGroup(player.id, cell.group)) return 100 + groupPriority(cell.group);
    if (cell.type === 'railroad') return 40;
    return 10;
  })) return true;
  return sellEvenHouse(player, bestFirst);
}

async function botRaiseCash(player, amount) {
  addComment(player, mortgageThought(player));
  let guard = 0;
  while (player.money < amount && liquidValue(player) >= amount && guard < 24) {
    const raised = isLuckyFool(player) ? lokhRaiseOnce(player) : martRaiseOnce(player);
    if (!raised) break;
    refreshUI();
    guard += 1;
  }
}

async function botBuildIfWanted(player) {
  const groups = ownedMonopolyGroups(player.id);
  if (!groups.length) return;

  if (isLuckyFool(player)) {
    if (Math.random() < 0.7) {
      addComment(player, buildThought(player, null, false));
      return;
    }
    const worst = groups.sort((a, b) => groupPriority(a) - groupPriority(b))[0];
    const cell = pickBuildCell(player, worst);
    if (cell && player.money >= getHouseCost(cell)) {
      buyHouse(player, cell.id);
      addComment(player, buildThought(player, cell, true));
      refreshUI();
    }
    return;
  }

  const ordered = groups.sort((a, b) => groupPriority(b) - groupPriority(a));
  const reserve = isMiron(player) ? mironCashReserve(player) : martCashReserve(player);
  let guard = 0;
  let builtCell = null;
  while (guard < 8) {
    let built = false;
    for (const group of ordered) {
      const cell = pickBuildCell(player, group);
      if (!cell || player.money - getHouseCost(cell) < reserve) continue;
      buyHouse(player, cell.id);
      builtCell = cell;
      refreshUI();
      built = true;
      break;
    }
    if (!built) break;
    guard += 1;
  }
  if (builtCell) addComment(player, buildThought(player, builtCell, true));
}

async function handleBotJailTurn(player) {
  const attempt = player.jailTurns + 1;
  const mustLeave = attempt >= 3;
  await botThink(player);

  let action = 'roll';
  if (isUnluckySmart(player) || isMiron(player)) {
    const wantOut = mustLeave || martWantsOutOfJail(player);
    if (wantOut && player.jailFreeCards.length) action = 'card';
    else if (wantOut && (player.money >= JAIL_FINE + 80 || mustLeave)) action = 'pay';
    else action = 'roll';
  } else {
    if (attempt === 1 && player.money >= JAIL_FINE && Math.random() < 0.62) action = 'pay';
    else if (player.jailFreeCards.length && Math.random() < 0.28) action = 'card';
    else if (mustLeave) action = player.jailFreeCards.length && Math.random() < 0.35 ? 'card' : 'pay';
    else action = 'roll';
  }

  addComment(player, jailThought(player, action, mustLeave));

  if (action === 'card' && player.jailFreeCards.length) {
    const deck = player.jailFreeCards.pop();
    returnJailFreeCard(deck);
    player.inJail = false;
    player.jailTurns = 0;
    setLog(`${player.name} использует карту освобождения из тюрьмы.`);
    refreshUI();
    return 'roll-free';
  }

  if (action === 'pay') {
    const paid = await forcePay(player, JAIL_FINE, null, 'Выход из тюрьмы');
    if (!paid) return 'done';
    player.inJail = false;
    player.jailTurns = 0;
    setLog(`${player.name} платит ₽ ${JAIL_FINE} и выходит из тюрьмы.`);
    refreshUI();
    return 'roll-free';
  }

  const dice = rollDiceFor(player);
  const total = dice[0] + dice[1];
  const isDoubles = dice[0] === dice[1];
  await animateDiceRoll(dice);
  state.lastDice = dice;
  state.lastDiceTotal = total;

  if (isDoubles) {
    player.inJail = false;
    player.jailTurns = 0;
    state.rolledOutOfJail = true;
    setLog(`${player.name} выбрасывает дубль ${dice[0]}:${dice[1]} и выходит. Дополнительного хода нет.`);
    await movePlayer(player, total);
    state.turnPhase = 'resolve-land';
    persistGame();
    await resolveLanding(player);
    return 'landed-no-extra';
  }

  if (mustLeave) {
    const paid = await forcePay(player, JAIL_FINE, null, 'Выход из тюрьмы');
    if (!paid) return 'done';
    player.inJail = false;
    player.jailTurns = 0;
    setLog(`${player.name} не выбил дубль на третьем ходу, платит ₽ ${JAIL_FINE} и выходит.`);
    await movePlayer(player, total);
    state.turnPhase = 'resolve-land';
    persistGame();
    await resolveLanding(player);
    return 'landed-no-extra';
  }

  player.jailTurns += 1;
  setLog(`${player.name} не выбил дубль и остаётся в тюрьме (${player.jailTurns} из 3).`);
  return 'stay';
}

function botShouldFinishTurn(player) {
  if (!player || player.bankrupt) return true;
  if (player.inJail && state.turnPhase !== 'pre-roll') return true;
  return state.turnPhase === 'post-land' && !state.extraRoll;
}

function resumeBotOrLanding() {
  if (state.winnerId != null) return;
  if (state.turnPhase === 'resolve-land') {
    resumeInterruptedLanding();
    return;
  }
  const player = getActivePlayer();
  if (!isBot(player)) return;
  if (botShouldFinishTurn(player)) {
    endTurn();
    return;
  }
  runBotTurn();
}

async function runBotTurn() {
  const player = getActivePlayer();
  const gen = gameGen;
  if (!isBot(player) || player.bankrupt || state.winnerId != null || botRunning) return;

  botRunning = true;
  updateActionButtons();

  try {
    if (player.inJail && state.turnPhase === 'pre-roll') {
      state.busy = true;
      await runJailTurn();
      state.busy = false;
    }

    if (botTurnAlive(gen, player) && !player.inJail) {
      while (
        botTurnAlive(gen, player)
        && isBot(player)
        && !player.inJail
        && (state.turnPhase === 'pre-roll' || state.extraRoll)
      ) {
        await botThink(player, isLuckyFool(player)
          ? 'Сейчас кину. Секунду.'
          : isMiron(player)
            ? 'Кубики не умеют врать. Люди — сколько угодно.'
            : 'Считаю бросок.');
        if (!botTurnAlive(gen, player) || !isBot(player)) break;
        await handleRoll();
        await botSleep(500);
      }

      if (botTurnAlive(gen, player) && isBot(player) && state.turnPhase === 'post-land' && !player.inJail) {
        await botBuildIfWanted(player);
      }
    }
  } finally {
    botRunning = false;
    state.busy = false;
    refreshUI();
  }

  if (gameGen !== gen || state.winnerId != null) return;
  if (getActivePlayer() !== player) return;
  if (!isBot(player)) return;
  if (botShouldFinishTurn(player)) {
    endTurn();
  }
}

function countOwnedOfType(playerId, type) {
  return BOARD.filter((cell) => cell.type === type && state.titles[cell.id]?.ownerId === playerId).length;
}

function ownsAllInGroup(playerId, group) {
  return getGroupCells(group).every((cell) => state.titles[cell.id].ownerId === playerId);
}

function groupHasMortgage(group) {
  return getGroupCells(group).some((cell) => state.titles[cell.id].mortgaged);
}

function groupHasBuildings(group) {
  return getGroupCells(group).some((cell) => state.titles[cell.id].houses > 0);
}

function ownsFullGroup(playerId, group) {
  return ownsAllInGroup(playerId, group) && !groupHasMortgage(group);
}

function getRent(cell, diceTotal, modifiers = {}) {
  const title = state.titles[cell.id];
  if (!title || title.ownerId == null || title.mortgaged) return 0;

  if (cell.type === 'property') {
    if (title.houses > 0) return cell.rent[title.houses];
    return ownsFullGroup(title.ownerId, cell.group) ? cell.rent[0] * 2 : cell.rent[0];
  }

  if (cell.type === 'railroad') {
    const count = countOwnedOfType(title.ownerId, 'railroad');
    const rent = RAILROAD_RENT[Math.max(0, count - 1)];
    return modifiers.doubleRailroad ? rent * 2 : rent;
  }

  if (cell.type === 'utility') {
    const count = countOwnedOfType(title.ownerId, 'utility');
    const multiplier = modifiers.utilityTenX ? 10 : count >= 2 ? 10 : 4;
    return diceTotal * multiplier;
  }

  return 0;
}

function countBuildings(playerId) {
  let houses = 0;
  let hotels = 0;
  BOARD.forEach((cell) => {
    const title = state.titles[cell.id];
    if (title?.ownerId !== playerId) return;
    if (title.houses === 5) hotels += 1;
    else houses += title.houses;
  });
  return { houses, hotels };
}

function buildingsLabel(houses) {
  if (houses === 5) return 'отель';
  if (houses === 1) return '1 дом';
  if (houses > 1) return `${houses} дома`;
  return 'нет домов';
}

function buildingMarkersHtml(houses, { slots = false } = {}) {
  if (houses === 5) {
    return '<span class="hotel-marker" title="Отель"></span>';
  }
  const count = slots ? 4 : houses;
  if (count <= 0) return '';
  return Array.from({ length: count }, (_, index) => {
    const empty = slots && index >= houses;
    return `<span class="house-marker${empty ? ' house-marker--empty' : ''}" title="${empty ? '' : 'Дом'}"></span>`;
  }).join('');
}

function liquidValue(player) {
  let total = player.money;
  BOARD.forEach((cell) => {
    const title = state.titles[cell.id];
    if (title?.ownerId !== player.id) return;
    if (title.houses > 0) {
      total += title.houses * Math.floor(getHouseCost(cell) / 2);
    }
    if (!title.mortgaged) {
      total += getMortgageValue(cell);
    }
  });
  return total;
}

function houseActionState(player, cell) {
  const title = state.titles[cell.id];
  const cost = getHouseCost(cell);
  const empty = { canBuy: false, canSell: false, buyTitle: '', sellTitle: '', cost };

  if (!title || cell.type !== 'property' || title.ownerId !== player.id) return empty;

  const group = getGroupCells(cell.group);
  const houses = group.map((item) => state.titles[item.id].houses);
  const minHouses = Math.min(...houses);
  const maxHouses = Math.max(...houses);

  let canBuy = true;
  let buyTitle = `Купить ${title.houses === 4 ? 'отель' : 'дом'} · ₽ ${cost}`;

  if (!ownsAllInGroup(player.id, cell.group)) {
    canBuy = false;
    buyTitle = 'Нужна вся цветовая группа';
  } else if (groupHasMortgage(cell.group)) {
    canBuy = false;
    buyTitle = 'Сначала выкупите залог в группе';
  } else if (title.houses >= 5) {
    canBuy = false;
    buyTitle = 'Уже есть отель';
  } else if (title.houses > minHouses) {
    canBuy = false;
    buyTitle = 'Стройте равномерно';
  } else if (player.money < cost) {
    canBuy = false;
    buyTitle = 'Не хватает денег';
  } else if (title.houses === 4 && state.bank.hotels < 1) {
    canBuy = false;
    buyTitle = 'В банке нет отелей';
  } else if (title.houses < 4 && state.bank.houses < 1) {
    canBuy = false;
    buyTitle = 'В банке нет домов';
  }

  let canSell = title.houses > 0 && title.houses >= maxHouses;
  let sellTitle = `Продать · ₽ ${Math.floor(cost / 2)}`;

  if (title.houses <= 0) {
    canSell = false;
    sellTitle = 'Нечего продавать';
  } else if (title.houses < maxHouses) {
    canSell = false;
    sellTitle = 'Продавайте равномерно';
  } else if (title.houses === 5 && state.bank.houses < 4) {
    canSell = true;
    sellTitle = `Продать отель целиком · ₽ ${Math.floor((cost * 5) / 2)}`;
  }

  return { canBuy, canSell, buyTitle, sellTitle, cost };
}

function buyHouse(player, cellId) {
  const cell = BOARD[cellId];
  const { canBuy, cost } = houseActionState(player, cell);
  if (!canBuy) return;
  const title = state.titles[cellId];
  takeMoney(player, cost);
  if (title.houses === 4) {
    state.bank.houses += 4;
    state.bank.hotels -= 1;
    title.houses = 5;
    setLog(`${player.name} строит отель на «${cell.name}».`);
  } else {
    state.bank.houses -= 1;
    title.houses += 1;
    setLog(`${player.name} строит дом на «${cell.name}».`);
  }
}

function sellHouse(player, cellId) {
  const cell = BOARD[cellId];
  const title = state.titles[cellId];
  const { canSell, cost } = houseActionState(player, cell);
  if (!canSell) return;

  if (title.houses === 5) {
    if (state.bank.houses >= 4) {
      state.bank.hotels += 1;
      state.bank.houses -= 4;
      title.houses = 4;
      addMoney(player, Math.floor(cost / 2));
    } else {
      state.bank.hotels += 1;
      title.houses = 0;
      addMoney(player, Math.floor((cost * 5) / 2));
    }
    setLog(`${player.name} продаёт отель на «${cell.name}».`);
    return;
  }

  state.bank.houses += 1;
  title.houses -= 1;
  addMoney(player, Math.floor(cost / 2));
  setLog(`${player.name} продаёт дом на «${cell.name}».`);
}

function mortgageProperty(player, cellId) {
  const cell = BOARD[cellId];
  const title = state.titles[cellId];
  if (!title || title.ownerId !== player.id || title.mortgaged) return;
  if (cell.type === 'property' && groupHasBuildings(cell.group)) return;
  title.mortgaged = true;
  addMoney(player, getMortgageValue(cell));
  setLog(`${player.name} закладывает «${cell.name}» за ₽ ${formatMoney(getMortgageValue(cell))}.`);
}

function unmortgageProperty(player, cellId) {
  const cell = BOARD[cellId];
  const title = state.titles[cellId];
  const cost = getUnmortgageCost(cell);
  if (!title || title.ownerId !== player.id || !title.mortgaged || player.money < cost) return;
  takeMoney(player, cost);
  title.mortgaged = false;
  setLog(`${player.name} выкупает «${cell.name}» за ₽ ${formatMoney(cost)}.`);
}

function returnJailFreeCard(deckName) {
  const source = deckName === 'chance' ? CHANCE_CARDS : CHEST_CARDS;
  const card = source.find((item) => item.type === 'jail-free');
  state.discards[deckName].push({ ...card });
}

function drawCard(deckName, actor) {
  if (state.decks[deckName].length === 0) {
    state.decks[deckName] = shuffle(state.discards[deckName]);
    state.discards[deckName] = [];
  }

  const deck = state.decks[deckName];
  if (!usesLuckBias(actor) || deck.length <= 1) {
    return deck.pop();
  }

  const peekCount = Math.min(3, deck.length);
  const start = deck.length - peekCount;
  const scored = deck.slice(start).map((card, offset) => ({
    card,
    index: start + offset,
    score: scoreCardForLuck(card, actor),
  }));
  scored.sort((a, b) => (isUnluckySmart(actor) ? a.score - b.score : b.score - a.score));
  const pick = Math.random() < 0.72 ? scored[0] : scored.find((item) => item.index === deck.length - 1);
  const [chosen] = deck.splice(pick.index, 1);
  if (isUnluckySmart(actor) && pick.score < scored[scored.length - 1].score) {
    setLog('Карты тоже против Лоха: выпало самое неудачное.');
  }
  if (isLuckyFool(actor) && pick.score > scored[scored.length - 1].score) {
    setLog('Марту снова везёт с картами, хоть он этого и не заслужил.');
  }
  return chosen;
}

function sellAllBuildingsToBank(player) {
  BOARD.forEach((cell) => {
    const title = state.titles[cell.id];
    if (title?.ownerId !== player.id || title.houses === 0) return;
    const refund = title.houses * Math.floor(getHouseCost(cell) / 2);
    if (title.houses === 5) state.bank.hotels += 1;
    else state.bank.houses += title.houses;
    title.houses = 0;
    addMoney(player, refund);
  });
}

async function declareBankruptcy(player, creditor) {
  sellAllBuildingsToBank(player);

  if (creditor) {
    payBetween(player, creditor, player.money);
    creditor.jailFreeCards.push(...player.jailFreeCards);
    player.jailFreeCards = [];
    BOARD.forEach((cell) => {
      const title = state.titles[cell.id];
      if (title?.ownerId === player.id) title.ownerId = creditor.id;
    });
  } else {
    takeMoney(player, player.money);
    player.jailFreeCards.forEach((deck) => returnJailFreeCard(deck));
    player.jailFreeCards = [];
    BOARD.forEach((cell) => {
      const title = state.titles[cell.id];
      if (title?.ownerId === player.id) {
        title.ownerId = null;
        title.mortgaged = false;
        title.houses = 0;
      }
    });
  }

  player.bankrupt = true;
  const remaining = state.players.filter((item) => !item.bankrupt);
  if (remaining.length > 1) {
    setLog(`${player.name} банкрот и выбывает. Игра продолжается.`);
    refreshUI();
    return;
  }

  const winner = remaining[0];
  state.winnerId = winner.id;
  state.turnPhase = 'game-over';
  state.extraRoll = false;
  setLog(`${player.name} банкрот. Побеждает ${winner.name}!`);
  refreshUI();

  openModal(`
    <div class="modal-card">
      <div class="modal-card__kicker">Игра окончена</div>
      <h3 class="modal-card__title">${winner.token} ${winner.name} побеждает</h3>
      <p class="modal-card__text">${player.name} не смог расплатиться и выбывает. Капитал победителя — ₽ ${formatMoney(winner.money)}.</p>
      <div class="modal-actions">
        <button class="btn-roll" data-modal-action="ok" type="button">Отлично</button>
      </div>
    </div>
  `);
  await waitModalAction();
  closeModal();
}

async function forcePay(player, amount, creditor, reason) {
  if (amount <= 0 || player.bankrupt) return false;

  if (player.money >= amount) {
    if (creditor) payBetween(player, creditor, amount);
    else takeMoney(player, amount);
    refreshUI();
    return true;
  }

  if (liquidValue(player) < amount) {
    await declareBankruptcy(player, creditor);
    return false;
  }

  if (isBot(player)) {
    await botRaiseCash(player, amount);
    if (player.money >= amount) {
      if (creditor) payBetween(player, creditor, amount);
      else takeMoney(player, amount);
      refreshUI();
      return true;
    }
    await declareBankruptcy(player, creditor);
    return false;
  }

  while (player.money < amount && !player.bankrupt && state.winnerId == null) {
    openModal(`
      <div class="modal-card">
        <div class="modal-card__kicker">Не хватает денег</div>
        <h3 class="modal-card__title">${player.name}</h3>
        <p class="modal-card__text">${reason || 'Нужно заплатить'} — ₽ ${formatMoney(amount)}. Сейчас есть ₽ ${formatMoney(player.money)}.</p>
        <div class="modal-card__banner modal-card__banner--danger">Продайте дома (за половину) или заложите участки. Если этого мало — банкротство.</div>
        <div class="modal-actions">
          <button class="btn-roll" data-modal-action="manage" type="button">Дома и залог</button>
          <button class="btn-danger" data-modal-action="bankrupt" type="button">Объявить банкротство</button>
        </div>
      </div>
    `);
    const { action } = await waitModalAction();
    closeModal();
    if (action === 'bankrupt') {
      await declareBankruptcy(player, creditor);
      return false;
    }
    await showManageModal(player, { debtAmount: amount });
    if (player.money < amount && liquidValue(player) < amount) {
      await declareBankruptcy(player, creditor);
      return false;
    }
  }

  if (player.bankrupt || state.winnerId != null) return false;
  if (player.money >= amount) {
    if (creditor) payBetween(player, creditor, amount);
    else takeMoney(player, amount);
    refreshUI();
    return true;
  }

  await declareBankruptcy(player, creditor);
  return false;
}

function renderManageModal(player, debtAmount) {
  const owned = ownedCells(player.id);
  const groups = Object.entries(PROPERTY_GROUPS)
    .map(([key, group]) => ({
      key,
      group,
      cells: getGroupCells(key).filter((cell) => state.titles[cell.id].ownerId === player.id),
    }))
    .filter((item) => item.cells.length);

  const railroads = owned.filter((cell) => cell.type === 'railroad');
  const utilities = owned.filter((cell) => cell.type === 'utility');

  const rowHtml = (cell) => {
    const title = state.titles[cell.id];
    const isProperty = cell.type === 'property';
    const actions = houseActionState(player, cell);
    const canMortgage = !title.mortgaged && (!isProperty || !groupHasBuildings(cell.group));
    const canUnmortgage = title.mortgaged && player.money >= getUnmortgageCost(cell);
    const buildings = title.mortgaged ? 'залог' : buildingsLabel(title.houses);

    return `
      <div class="manage-row">
        <div class="manage-row__name">
          ${cell.name}
          ${isProperty ? `<div class="manage-row__houses">${buildingMarkersHtml(title.houses, { slots: true })}</div>` : ''}
        </div>
        <div class="manage-row__meta">${buildings}</div>
        <div class="manage-row__actions">
          ${isProperty ? `
            <button class="mini-btn mini-btn--gold" type="button" data-modal-action="buy-house" data-cell-id="${cell.id}" ${actions.canBuy ? '' : 'disabled'} title="${actions.buyTitle}">${title.houses === 4 ? '+ отель' : '+ дом'}</button>
            <button class="mini-btn" type="button" data-modal-action="sell-house" data-cell-id="${cell.id}" ${actions.canSell ? '' : 'disabled'} title="${actions.sellTitle}">${title.houses === 5 ? '− отель' : '− дом'}</button>
          ` : ''}
          ${title.mortgaged
            ? `<button class="mini-btn mini-btn--gold" type="button" data-modal-action="unmortgage" data-cell-id="${cell.id}" ${canUnmortgage ? '' : 'disabled'} title="Выкупить за ₽ ${getUnmortgageCost(cell)}">Выкуп ₽ ${getUnmortgageCost(cell)}</button>`
            : `<button class="mini-btn" type="button" data-modal-action="mortgage" data-cell-id="${cell.id}" ${canMortgage ? '' : 'disabled'} title="${canMortgage ? `Залог ₽ ${getMortgageValue(cell)}` : 'Сначала продайте дома в группе'}">Залог ₽ ${getMortgageValue(cell)}</button>`}
        </div>
      </div>
    `;
  };

  const sections = [];

  groups.forEach(({ group, cells, key }) => {
    const monopoly = ownsAllInGroup(player.id, key);
    sections.push(`
      <div class="manage-group">
        <div class="manage-group__head">
          <span><span class="manage-group__swatch" style="background:${group.color}"></span>${group.label}${monopoly ? ' · монополия' : ''}</span>
          <span>дом ₽ ${group.houseCost}</span>
        </div>
        ${cells.map(rowHtml).join('')}
      </div>
    `);
  });

  if (railroads.length) {
    sections.push(`<div class="manage-group"><div class="manage-group__head">Железные дороги</div>${railroads.map(rowHtml).join('')}</div>`);
  }
  if (utilities.length) {
    sections.push(`<div class="manage-group"><div class="manage-group__head">Коммунальные службы</div>${utilities.map(rowHtml).join('')}</div>`);
  }

  openModal(`
    <div class="modal-card">
      <div class="modal-card__kicker">Имущество</div>
      <h3 class="modal-card__title">${player.name} · ₽ ${formatMoney(player.money)}</h3>
      ${debtAmount
        ? `<div class="modal-card__banner modal-card__banner--danger">Нужно набрать ₽ ${formatMoney(debtAmount)}. Продайте дома или заложите участки.</div>`
        : '<p class="modal-card__text">Строить дома можно только на полной цветовой группе, равномерно. 4 дома → отель. Меняться улицами — кнопка «Торговля».</p>'}
      <div class="manage-list">
        ${sections.length ? sections.join('') : '<p class="modal-card__text">Пока нет купленных участков.</p>'}
      </div>
      <div class="modal-actions">
        <button class="btn-roll" data-modal-action="close" type="button">Готово</button>
      </div>
    </div>
  `);
}

async function showManageModal(player, options = {}) {
  while (true) {
    renderManageModal(player, options.debtAmount);
    const { action, cellId } = await waitModalAction();
    if (action === 'close') break;
    if (action === 'buy-house') buyHouse(player, cellId);
    if (action === 'sell-house') sellHouse(player, cellId);
    if (action === 'mortgage') mortgageProperty(player, cellId);
    if (action === 'unmortgage') unmortgageProperty(player, cellId);
    refreshUI();
  }
  closeModal();
}

function tradePartners(player) {
  return state.players.filter((item) => item.id !== player.id && !item.bankrupt);
}

function canTradeTitle(cell) {
  if (!isTitleCell(cell)) return false;
  if (cell.type === 'property' && cell.group && groupHasBuildings(cell.group)) return false;
  return true;
}

function mortgageTransferFee(cell) {
  return Math.ceil(getMortgageValue(cell) / 10);
}

function tradeItemColor(cell) {
  if (cell.group) return PROPERTY_GROUPS[cell.group].color;
  if (cell.type === 'railroad') return '#555';
  return '#2e7d32';
}

function tradeableCells(player) {
  return ownedCells(player.id);
}

function renderTradeItems(player, side, selectedIds) {
  const cells = tradeableCells(player);
  if (!cells.length) return '<p class="trade-empty">Нет участков.</p>';
  return cells.map((cell) => {
    const title = state.titles[cell.id];
    const locked = !canTradeTitle(cell);
    const checked = selectedIds.includes(cell.id);
    const mark = title.mortgaged ? ' · залог' : '';
    const lock = locked ? ' · сначала продайте дома' : '';
    return `
      <label class="trade-item${locked ? ' is-locked' : ''}" title="${locked ? 'В группе стоят дома — продайте их перед обменом' : ''}">
        <input type="checkbox" data-trade-side="${side}" data-cell-id="${cell.id}" ${locked ? 'disabled' : ''} ${checked && !locked ? 'checked' : ''}>
        <span class="trade-item__swatch" style="background:${tradeItemColor(cell)}"></span>
        <span class="trade-item__name">${escapeHtml(cell.name)}${mark}${lock}</span>
        <span class="trade-item__price">₽ ${formatMoney(cell.price || 0)}</span>
      </label>
    `;
  }).join('');
}

function waitTradeAction() {
  return new Promise((resolve) => {
    const onClick = (event) => {
      const button = event.target.closest('[data-modal-action]');
      if (!button || !modalEl.contains(button)) return;
      modalEl.removeEventListener('click', onClick);
      resolve({
        action: button.dataset.modalAction,
        partnerId: button.dataset.partnerId != null ? Number(button.dataset.partnerId) : null,
      });
    };
    modalEl.addEventListener('click', onClick);
  });
}

function readTradeDeal(fromPlayer, toPlayer) {
  const ids = (side) => [...modalEl.querySelectorAll(`[data-trade-side="${side}"]:checked`)]
    .map((input) => Number(input.dataset.cellId));
  const money = (id) => Math.max(0, parseBidAmount(modalEl.querySelector(id)?.value) || 0);
  const cards = (id, max) => Math.min(max, Math.max(0, parseBidAmount(modalEl.querySelector(id)?.value) || 0));
  const cellById = (id) => getCellByPosition(id) || BOARD.find((cell) => cell.id === id);
  return {
    from: fromPlayer,
    to: toPlayer,
    giveCells: ids('give').map(cellById).filter(Boolean),
    getCells: ids('get').map(cellById).filter(Boolean),
    giveMoney: money('#trade-give-money'),
    getMoney: money('#trade-get-money'),
    giveCards: cards('#trade-give-cards', fromPlayer.jailFreeCards.length),
    getCards: cards('#trade-get-cards', toPlayer.jailFreeCards.length),
  };
}

function dealHasContent(deal) {
  return deal.giveCells.length || deal.getCells.length || deal.giveMoney || deal.getMoney || deal.giveCards || deal.getCards;
}

function incomingMortgageFees(cells) {
  return cells.reduce((sum, cell) => (
    state.titles[cell.id]?.mortgaged ? sum + mortgageTransferFee(cell) : sum
  ), 0);
}

function validateTrade(deal) {
  if (!dealHasContent(deal)) return 'Выберите улицы, деньги или карту — иначе менять нечего.';
  if (deal.giveMoney > deal.from.money) return `${deal.from.name} не может отдать ₽ ${formatMoney(deal.giveMoney)}.`;
  if (deal.getMoney > deal.to.money) return `${deal.to.name} не может отдать ₽ ${formatMoney(deal.getMoney)}.`;
  if (deal.giveCards > deal.from.jailFreeCards.length || deal.getCards > deal.to.jailFreeCards.length) {
    return 'Карт выхода столько нет.';
  }
  const badGive = deal.giveCells.find((cell) => state.titles[cell.id]?.ownerId !== deal.from.id || !canTradeTitle(cell));
  const badGet = deal.getCells.find((cell) => state.titles[cell.id]?.ownerId !== deal.to.id || !canTradeTitle(cell));
  if (badGive || badGet) return 'Нельзя менять участок с домами. Сначала продайте дома в группе.';

  const fromAfter = deal.from.money - deal.giveMoney + deal.getMoney - incomingMortgageFees(deal.getCells);
  const toAfter = deal.to.money - deal.getMoney + deal.giveMoney - incomingMortgageFees(deal.giveCells);
  if (fromAfter < 0) return `${deal.from.name} не хватит на 10% за заложенные участки.`;
  if (toAfter < 0) return `${deal.to.name} не хватит на 10% за заложенные участки.`;
  return '';
}

function formatDealSide(player, cells, money, cards, verb) {
  const parts = cells.map((cell) => `«${cell.name}»${state.titles[cell.id]?.mortgaged ? ' (залог)' : ''}`);
  if (money) parts.push(`₽ ${formatMoney(money)}`);
  if (cards) parts.push(`карту выхода × ${cards}`);
  return parts.length ? `${player.name} ${verb} ${parts.join(', ')}` : `${player.name} ${verb} ничего`;
}

function renderTradeModal(player, partner, draft, error) {
  const partners = tradePartners(player);
  openModal(`
    <div class="modal-card">
      <div class="modal-card__kicker">Торговля</div>
      <h3 class="modal-card__title">${escapeHtml(player.name)} предлагает сделку</h3>
      <p class="modal-card__text">Выберите, с кем меняться. Участки с домами сначала нужно освободить через «Дома и залог».</p>
      <div class="trade-partners">
        ${partners.map((item) => `
          <button type="button" class="trade-partner${item.id === partner.id ? ' is-active' : ''}" data-modal-action="partner" data-partner-id="${item.id}" style="--seat-color:${item.color}">
            ${item.token} ${escapeHtml(item.name)}
          </button>
        `).join('')}
      </div>
      <div class="trade-grid">
        <div class="trade-col">
          <div class="trade-col__title">Отдаёте · ${escapeHtml(player.name)}</div>
          <div class="trade-list">${renderTradeItems(player, 'give', draft.giveIds)}</div>
          <label class="trade-field">Деньги, ₽
            <input id="trade-give-money" type="number" inputmode="numeric" min="0" max="${player.money}" step="1" value="${draft.giveMoney}">
          </label>
          ${player.jailFreeCards.length ? `<label class="trade-field">Карты выхода
            <input id="trade-give-cards" type="number" inputmode="numeric" min="0" max="${player.jailFreeCards.length}" step="1" value="${draft.giveCards}">
          </label>` : '<input id="trade-give-cards" type="hidden" value="0">'}
        </div>
        <div class="trade-col">
          <div class="trade-col__title">Получаете · ${escapeHtml(partner.name)}</div>
          <div class="trade-list">${renderTradeItems(partner, 'get', draft.getIds)}</div>
          <label class="trade-field">Деньги, ₽
            <input id="trade-get-money" type="number" inputmode="numeric" min="0" max="${partner.money}" step="1" value="${draft.getMoney}">
          </label>
          ${partner.jailFreeCards.length ? `<label class="trade-field">Карты выхода
            <input id="trade-get-cards" type="number" inputmode="numeric" min="0" max="${partner.jailFreeCards.length}" step="1" value="${draft.getCards}">
          </label>` : '<input id="trade-get-cards" type="hidden" value="0">'}
        </div>
      </div>
      <p class="trade-error" id="trade-error">${escapeHtml(error || '')}</p>
      <div class="modal-actions">
        <button class="btn-roll" data-modal-action="propose" type="button">Предложить</button>
        <button class="btn-ghost" data-modal-action="cancel" type="button">Закрыть</button>
      </div>
    </div>
  `, { wide: true });
}

function snapshotTradeDraft(fromPlayer, toPlayer) {
  const deal = readTradeDeal(fromPlayer, toPlayer);
  return {
    giveIds: deal.giveCells.map((cell) => cell.id),
    getIds: deal.getCells.map((cell) => cell.id),
    giveMoney: deal.giveMoney,
    getMoney: deal.getMoney,
    giveCards: deal.giveCards,
    getCards: deal.getCards,
  };
}

function propertyDealValue(player, cell, receiving) {
  let value = cell.price || 100;
  if (cell.type === 'railroad') {
    const have = countOwnedOfType(player.id, 'railroad');
    value += (receiving ? have + 1 : Math.max(0, have - 1)) * 50;
  }
  if (cell.type === 'utility') {
    const have = countOwnedOfType(player.id, 'utility');
    if (receiving && have >= 1) value += 90;
  }
  if (cell.group) {
    const owned = countOwnedInGroup(player.id, cell.group);
    const size = getGroupCells(cell.group).length;
    if (receiving && owned === size - 1) value += 240;
    else if (receiving && owned >= 1) value += 80;
    else if (!receiving && ownsFullGroup(player.id, cell.group)) value += 280;
  }
  if (state.titles[cell.id]?.mortgaged) value = Math.floor(value * 0.5);
  return value;
}

function scoreTradeForBot(bot, deal) {
  const receives = deal.giveCells;
  const gives = deal.getCells;
  const receiveValue = receives.reduce((sum, cell) => sum + propertyDealValue(bot, cell, true), 0);
  const giveValue = gives.reduce((sum, cell) => sum + propertyDealValue(bot, cell, false), 0);
  const net = receiveValue - giveValue + deal.giveMoney - deal.getMoney + deal.giveCards * 140 - deal.getCards * 140;
  return {
    receives,
    gives,
    receiveValue,
    giveValue,
    net,
    completes: receives.some((cell) => cell.group && completesSet(bot, cell)),
    givesMonopoly: gives.some((cell) => cell.group && ownsFullGroup(bot.id, cell.group)),
    cashAfter: bot.money - deal.getMoney + deal.giveMoney - incomingMortgageFees(receives),
  };
}

function botAcceptsTrade(bot, deal) {
  const score = scoreTradeForBot(bot, deal);

  if (score.cashAfter < 0) return false;
  if (score.givesMonopoly && !score.completes) return false;
  if (score.giveValue >= 80 && score.receiveValue + deal.giveMoney + deal.giveCards * 140 < score.giveValue * 0.75) {
    return isLuckyFool(bot) && score.net >= -40 && Math.random() < 0.15;
  }
  if (score.gives.length && !score.receives.length && deal.giveMoney < score.giveValue * 0.85) return false;

  if (isLuckyFool(bot)) {
    if (score.completes) return true;
    if (score.receives.length && score.net >= -40) return true;
    if (score.receives.length) return score.net >= -90 && Math.random() < 0.28;
    return score.net >= 100;
  }

  if (isUnluckySmart(bot)) {
    if (score.cashAfter < 80 && deal.getMoney > deal.giveMoney) return false;
    if (score.completes && score.net >= -40) return true;
    return score.net >= 40;
  }

  if (score.cashAfter < 100 && deal.getMoney > deal.giveMoney) return false;
  if (score.completes && score.net >= -20) return true;
  return score.net >= 70;
}

function tradeThought(player, deal, accepted) {
  const score = scoreTradeForBot(player, deal);
  const got = deal.giveCells[0]?.name || (deal.giveMoney ? `${deal.giveMoney} рублей` : 'это');
  if (isLuckyFool(player)) {
    return accepted
      ? `Беру. «${got}» блестит, мне нравится.`
      : score.giveValue > score.receiveValue
        ? 'Не-а. Вы просите красивое, а даёте скучное.'
        : 'Не хочу. Мне и так нормально.';
  }
  if (isUnluckySmart(player)) {
    return accepted
      ? `Беру. По счёту плюс ₽ ${formatMoney(score.net)}, даже если кубики потом всё испортят.`
      : `Пас. Мне это в минус примерно ₽ ${formatMoney(Math.abs(score.net))}. Криво.`;
  }
  return accepted
    ? `Согласен. Плюс ₽ ${formatMoney(score.net)} — арифметика не оскорбляет.`
    : score.givesMonopoly
      ? 'Нет. Монополию за комплименты не меняю.'
      : `Нет. Сделка слабая, мне примерно минус ₽ ${formatMoney(Math.abs(score.net))}.`;
}

function transferJailCards(fromPlayer, toPlayer, count) {
  for (let index = 0; index < count; index += 1) {
    if (!fromPlayer.jailFreeCards.length) break;
    toPlayer.jailFreeCards.push(fromPlayer.jailFreeCards.pop());
  }
}

function collectMortgageFees(player, cells) {
  cells.forEach((cell) => {
    if (!state.titles[cell.id]?.mortgaged) return;
    const fee = mortgageTransferFee(cell);
    if (fee > 0) takeMoney(player, fee);
  });
}

function executeTrade(deal) {
  if (deal.giveMoney) payBetween(deal.from, deal.to, deal.giveMoney);
  if (deal.getMoney) payBetween(deal.to, deal.from, deal.getMoney);
  deal.giveCells.forEach((cell) => { state.titles[cell.id].ownerId = deal.to.id; });
  deal.getCells.forEach((cell) => { state.titles[cell.id].ownerId = deal.from.id; });
  collectMortgageFees(deal.to, deal.giveCells);
  collectMortgageFees(deal.from, deal.getCells);
  transferJailCards(deal.from, deal.to, deal.giveCards);
  transferJailCards(deal.to, deal.from, deal.getCards);
  setLog(`${deal.from.name} и ${deal.to.name} меняются. ${formatDealSide(deal.from, deal.giveCells, deal.giveMoney, deal.giveCards, 'отдаёт')}; ${formatDealSide(deal.to, deal.getCells, deal.getMoney, deal.getCards, 'отдаёт')}.`);
}

async function confirmHumanTrade(deal) {
  openModal(`
    <div class="modal-card">
      <div class="modal-card__kicker">Предложение</div>
      <h3 class="modal-card__title">${escapeHtml(deal.to.name)}, принять сделку?</h3>
      <div class="trade-review">
        <div class="trade-review__side">${escapeHtml(formatDealSide(deal.from, deal.giveCells, deal.giveMoney, deal.giveCards, 'отдаёт'))}</div>
        <div class="trade-review__side">${escapeHtml(formatDealSide(deal.to, deal.getCells, deal.getMoney, deal.getCards, 'отдаёт'))}</div>
      </div>
      <div class="modal-actions">
        <button class="btn-roll" data-modal-action="accept" type="button">Принять</button>
        <button class="btn-ghost" data-modal-action="reject" type="button">Отклонить</button>
      </div>
    </div>
  `);
  const { action } = await waitModalAction();
  closeModal();
  return action === 'accept';
}

async function resolveTrade(deal) {
  if (isBot(deal.to)) {
    await botThink(deal.to, isLuckyFool(deal.to) ? 'Смотрю, блестит или нет.' : isMiron(deal.to) ? 'Считаю, не торгуюсь голосом.' : 'Считаю выгоду. Обычно её нет.');
    const accepted = botAcceptsTrade(deal.to, deal);
    addComment(deal.to, tradeThought(deal.to, deal, accepted));
    if (accepted) {
      executeTrade(deal);
    } else {
      setLog(`${deal.to.name} отклоняет сделку с ${deal.from.name}.`);
    }
    return;
  }

  const accepted = await confirmHumanTrade(deal);
  if (accepted) {
    executeTrade(deal);
    await botsReact({ type: 'buy', actor: deal.from, cell: deal.getCells[0] || deal.giveCells[0] });
  } else {
    setLog(`${deal.to.name} отклоняет сделку с ${deal.from.name}.`);
  }
}

async function showTradeModal(player) {
  const partners = tradePartners(player);
  if (!partners.length) {
    setLog('Кроме вас за столом никого — торговать не с кем.');
    return;
  }

  let partner = partners[0];
  let draft = { giveIds: [], getIds: [], giveMoney: 0, getMoney: 0, giveCards: 0, getCards: 0 };
  let error = '';

  while (true) {
    renderTradeModal(player, partner, draft, error);
    const { action, partnerId } = await waitTradeAction();
    if (action === 'cancel') break;
    if (action === 'partner') {
      draft = snapshotTradeDraft(player, partner);
      draft.getIds = [];
      draft.getMoney = 0;
      draft.getCards = 0;
      partner = partners.find((item) => item.id === partnerId) || partner;
      error = '';
      continue;
    }
    if (action === 'propose') {
      const deal = readTradeDeal(player, partner);
      error = validateTrade(deal);
      if (error) continue;
      closeModal();
      await resolveTrade(deal);
      break;
    }
  }
  closeModal();
}

async function handleTrade() {
  if (state.busy || state.winnerId != null) return;
  const player = getActivePlayer();
  if (isBot(player)) return;
  state.busy = true;
  updateActionButtons();
  await showTradeModal(player);
  state.busy = false;
  refreshUI();
  persistGame();
}

async function offerPurchase(player, cell) {
  if (isBot(player)) {
    let want = isUnluckySmart(player)
      ? martShouldBuy(player, cell)
      : isMiron(player)
        ? mironShouldBuy(player, cell)
        : lokhShouldBuy(player, cell);
    if (want && player.money < cell.price && (isUnluckySmart(player) || isMiron(player)) && completesSet(player, cell)) {
      await botRaiseCash(player, cell.price);
    }
    want = want && player.money >= cell.price;
    addComment(player, purchaseThought(player, cell, want));
    await botSleep(isLuckyFool(player) ? 700 : 400);
    if (want) {
      takeMoney(player, cell.price);
      state.titles[cell.id].ownerId = player.id;
      setLog(`${player.name} покупает «${cell.name}» за ₽ ${formatMoney(cell.price)}.`);
      refreshUI();
      return;
    }
    await runAuction(cell);
    return;
  }

  const group = cell.group ? PROPERTY_GROUPS[cell.group] : null;
  const canAfford = player.money >= cell.price;

  openModal(`
    <div class="modal-card">
      <div class="modal-card__kicker">Свободный участок</div>
      <h3 class="modal-card__title">${cell.name}</h3>
      ${group ? `<div class="modal-card__banner" style="border-color:${group.color}">${group.label} группа</div>` : ''}
      <p class="modal-card__text">${player.name} может купить «${cell.name}» за ₽ ${formatMoney(cell.price)}. Сейчас есть ₽ ${formatMoney(player.money)}.</p>
      <div class="property-card">
        ${cell.type === 'property' ? `<div class="property-card__row"><span>Аренда / отель</span><span>₽ ${cell.rent[0]} / ${cell.rent[5]}</span></div>` : ''}
        ${cell.type === 'railroad' ? `<div class="property-card__row"><span>Аренда за дороги</span><span>₽ ${RAILROAD_RENT.join(' / ')}</span></div>` : ''}
        ${cell.type === 'utility' ? `<div class="property-card__row"><span>Аренда</span><span>×4 или ×10 от кубиков</span></div>` : ''}
      </div>
      <div class="modal-actions">
        <button class="btn-roll" data-modal-action="buy" type="button" ${canAfford ? '' : 'disabled'}>Купить за ₽ ${formatMoney(cell.price)}</button>
        <button class="btn-ghost" data-modal-action="manage" type="button">Сначала заложить</button>
        <button class="btn-action" data-modal-action="pass" type="button">Отказаться · аукцион</button>
      </div>
    </div>
  `);

  const { action } = await waitModalAction();
  closeModal();

  if (action === 'buy' && player.money >= cell.price) {
    takeMoney(player, cell.price);
    state.titles[cell.id].ownerId = player.id;
    setLog(`${player.name} покупает «${cell.name}» за ₽ ${formatMoney(cell.price)}.`);
    refreshUI();
    await botsReact({ type: 'buy', actor: player, cell });
    return;
  }

  if (action === 'manage') {
    await showManageModal(player);
    if (state.titles[cell.id].ownerId == null) await offerPurchase(player, cell);
    return;
  }

  await botsReact({ type: 'pass', actor: player, cell });
  await runAuction(cell);
}

async function runAuction(cell) {
  const bidders = state.players.filter((player) => !player.bankrupt);
  let currentBid = 0;
  let leaderId = null;
  const passed = new Set();
  const starterId = getActivePlayer().id;
  let turnIndex = bidders.findIndex((player) => player.id === starterId);
  turnIndex = (Math.max(turnIndex, 0) + 1) % bidders.length;

  while (true) {
    if (passed.size === bidders.length) break;
    if (leaderId != null && bidders.every((player) => player.id === leaderId || passed.has(player.id))) break;

    const player = bidders[turnIndex];
    if (passed.has(player.id)) {
      turnIndex = (turnIndex + 1) % bidders.length;
      continue;
    }

    const minBid = nextAuctionBid(currentBid);
    if (player.money < minBid) {
      passed.add(player.id);
      turnIndex = (turnIndex + 1) % bidders.length;
      continue;
    }

    if (isBot(player)) {
      const maxBid = isUnluckySmart(player)
        ? martMaxBid(player, cell)
        : isMiron(player)
          ? mironMaxBid(player, cell)
          : lokhMaxBid(player, cell);
      const raise = minBid <= maxBid && player.money >= minBid;
      addComment(player, auctionThought(player, cell, raise));
      await botSleep(isLuckyFool(player) ? 800 : 350);
      if (raise) {
        currentBid = minBid;
        leaderId = player.id;
      } else {
        passed.add(player.id);
      }
      turnIndex = (turnIndex + 1) % bidders.length;
      continue;
    }

    const leader = state.players.find((item) => item.id === leaderId);
    openModal(`
      <div class="modal-card">
        <div class="modal-card__kicker">Аукцион</div>
        <h3 class="modal-card__title">${escapeHtml(cell.name)}</h3>
        <p class="auction-bid">${currentBid ? `₽ ${formatMoney(currentBid)}` : 'Ставок нет'}</p>
        <p class="modal-card__text">${currentBid ? `Лидер: ${escapeHtml(leader.name)}` : 'Можно открыть любой суммой от ₽ 10'}. Сейчас ставит <strong>${escapeHtml(player.name)}</strong> (₽ ${formatMoney(player.money)}).</p>
        <form class="auction-form" id="auction-form">
          <label class="auction-bid-field">
            <span>Ваша ставка</span>
            <input id="auction-bid-input" type="number" inputmode="numeric" min="${minBid}" max="${player.money}" step="1" value="${minBid}" required>
          </label>
          <p class="auction-bid-hint">От ₽ ${formatMoney(minBid)} до ₽ ${formatMoney(player.money)}</p>
          <p class="auction-bid-error" id="auction-bid-error"></p>
          <div class="modal-actions">
            <button class="btn-roll" data-modal-action="raise" type="submit">Поставить</button>
            <button class="btn-ghost" data-modal-action="pass" type="button">Пас</button>
          </div>
        </form>
      </div>
    `);
    const { action, amount } = await waitAuctionBid(minBid, player.money);
    closeModal();

    if (action === 'raise') {
      currentBid = amount;
      leaderId = player.id;
    } else {
      passed.add(player.id);
    }

    turnIndex = (turnIndex + 1) % bidders.length;
  }

  if (leaderId != null && currentBid > 0) {
    const winner = state.players.find((player) => player.id === leaderId);
    takeMoney(winner, currentBid);
    state.titles[cell.id].ownerId = winner.id;
    setLog(`${winner.name} берёт «${cell.name}» с аукциона за ₽ ${formatMoney(currentBid)}.`);
  } else {
    setLog(`«${cell.name}» остаётся у банка.`);
  }
  refreshUI();
}

async function movePlayer(player, steps) {
  for (let step = 0; step < steps; step += 1) {
    player.position = (player.position + 1) % BOARD.length;
    if (player.position === 0) {
      addMoney(player, GO_SALARY);
      setLog(`${player.name} проходит «Вперёд» и получает ₽ ${GO_SALARY}`);
    }
    renderTokens(player.id);
    renderPlayerCards();
    showPropertyPreview(getCellByPosition(player.position));
    await sleep(isBot(player) ? 440 : 220);
  }
}

async function movePlayerTo(player, destination, { collectGo = true } = {}) {
  if (player.position === destination) return;
  while (player.position !== destination) {
    player.position = (player.position + 1) % BOARD.length;
    if (player.position === 0 && collectGo) {
      addMoney(player, GO_SALARY);
      setLog(`${player.name} проходит «Вперёд» и получает ₽ ${GO_SALARY}`);
    }
    renderTokens(player.id);
    renderPlayerCards();
    showPropertyPreview(getCellByPosition(player.position));
    await sleep(180);
  }
}

async function movePlayerSteps(player, steps) {
  const direction = Math.sign(steps);
  const count = Math.abs(steps);
  for (let index = 0; index < count; index += 1) {
    if (direction > 0) {
      player.position = (player.position + 1) % BOARD.length;
      if (player.position === 0) {
        addMoney(player, GO_SALARY);
        setLog(`${player.name} проходит «Вперёд» и получает ₽ ${GO_SALARY}`);
      }
    } else {
      player.position = (player.position + BOARD.length - 1) % BOARD.length;
    }
    renderTokens(player.id);
    renderPlayerCards();
    showPropertyPreview(getCellByPosition(player.position));
    await sleep(180);
  }
}

async function sendToJail(player) {
  player.position = JAIL_POSITION;
  player.inJail = true;
  player.jailTurns = 0;
  state.consecutiveDoubles = 0;
  state.extraRoll = false;
  state.rolledOutOfJail = false;
  setLog(`${player.name} отправляется в тюрьму. Зарплату за «Вперёд» не получает.`);
  refreshUI();
  renderTokens(player.id);
  await sleep(350);
}

async function showCardModal(kind, card) {
  const label = kind === 'chance' ? 'Шанс' : 'Общественная казна';
  const icon = kind === 'chance' ? '?' : '📦';
  openModal(`
    <div class="sheet-card sheet-card--${kind}">
      <div class="sheet-card__label">${label}</div>
      <div class="sheet-card__icon">${icon}</div>
      <p class="sheet-card__text">${card.text}</p>
      <div class="modal-actions">
        <button class="btn-roll" data-modal-action="ok" type="button">Понятно</button>
      </div>
    </div>
  `);
  if (isBot(getActivePlayer())) {
    await sleep(900);
    closeModal();
    return;
  }
  await waitModalAction();
  closeModal();
}

async function resolveCard(player, kind) {
  const card = drawCard(kind, player);
  await showCardModal(kind, card);

  switch (card.type) {
    case 'collect':
      addMoney(player, card.amount);
      setLog(`${player.name} получает ₽ ${formatMoney(card.amount)}.`);
      break;
    case 'pay':
      await forcePay(player, card.amount, null, card.text);
      break;
    case 'pay-each':
      for (const other of state.players.filter((item) => item.id !== player.id && !item.bankrupt)) {
        await forcePay(player, card.amount, other, 'Выплата игрокам');
        if (player.bankrupt) break;
      }
      break;
    case 'collect-each':
      for (const other of state.players.filter((item) => item.id !== player.id && !item.bankrupt)) {
        await forcePay(other, card.amount, player, 'День рождения');
      }
      break;
    case 'advance':
      await movePlayerTo(player, card.position, { collectGo: true });
      await resolveLanding(player);
      break;
    case 'move':
      await movePlayerSteps(player, card.steps);
      await resolveLanding(player);
      break;
    case 'jail':
      await sendToJail(player);
      break;
    case 'jail-free':
      player.jailFreeCards.push(card.deck);
      setLog(`${player.name} получает карту «Бесплатное освобождение из тюрьмы».`);
      break;
    case 'repairs': {
      const { houses, hotels } = countBuildings(player.id);
      const amount = houses * card.house + hotels * card.hotel;
      setLog(`Ремонт: ${houses} дом. и ${hotels} отел. — ₽ ${formatMoney(amount)}.`);
      if (amount > 0) await forcePay(player, amount, null, 'Ремонт собственности');
      break;
    }
    case 'nearest-utility': {
      const destination = nextCellOfType(player.position, 'utility');
      await movePlayerTo(player, destination, { collectGo: true });
      await resolveLanding(player, { utilityTenX: true });
      break;
    }
    case 'nearest-railroad': {
      const destination = nextCellOfType(player.position, 'railroad');
      await movePlayerTo(player, destination, { collectGo: true });
      await resolveLanding(player, { doubleRailroad: true });
      break;
    }
    default:
      break;
  }

  if (card.type !== 'jail-free') {
    state.discards[kind].push(card);
  }

  refreshUI();
}

async function resolveLanding(player, modifiers = {}) {
  if (player.bankrupt || player.inJail) return;

  const cell = getCellByPosition(player.position);
  showPropertyPreview(cell);

  if (cell.id === GO_TO_JAIL_POSITION) {
    await sendToJail(player);
    await botsReact({ type: 'jail', actor: player, cell });
    return;
  }

  if (cell.type === 'tax') {
    setLog(`${player.name} платит ${cell.name.toLowerCase()}: ₽ ${formatMoney(cell.amount)}.`);
    await forcePay(player, cell.amount, null, cell.name);
    await botsReact({ type: 'tax', actor: player, cell, amount: cell.amount });
    return;
  }

  if (cell.type === 'chance') {
    await botsReact({ type: 'card', actor: player, cell });
    await resolveCard(player, 'chance');
    return;
  }

  if (cell.type === 'chest') {
    await botsReact({ type: 'card', actor: player, cell });
    await resolveCard(player, 'chest');
    return;
  }

  if (!isTitleCell(cell)) {
    if (cell.id === 0) setLog(`${player.name} на клетке «Вперёд».`);
    else if (cell.id === 20) setLog(`${player.name} отдыхает на бесплатной стоянке.`);
    else if (cell.id === JAIL_POSITION) setLog(`${player.name} просто посещает тюрьму.`);
    else setLog(`${player.name} останавливается на «${cell.name}».`);
    await botsReact({ type: cell.id === 20 ? 'rest' : 'own', actor: player, cell });
    return;
  }

  const title = state.titles[cell.id];

  if (title.ownerId == null) {
    await offerPurchase(player, cell);
    return;
  }

  if (title.ownerId === player.id) {
    setLog(`${player.name} на своей клетке «${cell.name}».`);
    await botsReact({ type: 'own', actor: player, cell });
    return;
  }

  if (title.mortgaged) {
    setLog(`«${cell.name}» в залоге — аренда не взимается.`);
    return;
  }

  const owner = state.players.find((item) => item.id === title.ownerId);
  let diceTotal = state.lastDiceTotal;

  if (cell.type === 'utility' && modifiers.utilityTenX) {
    const dice = rollDiceFor(player);
    await animateDiceRoll(dice);
    diceTotal = dice[0] + dice[1];
    setLog(`Бросок для коммунальной службы: ${dice[0]} + ${dice[1]} = ${diceTotal}.`);
  }

  const rent = getRent(cell, diceTotal, modifiers);
  if (rent <= 0) return;

  setLog(`${player.name} платит ${owner.name} ₽ ${formatMoney(rent)} за «${cell.name}».`);
  await forcePay(player, rent, owner, `Аренда: ${cell.name}`);
  await botsReact({ type: 'rent', actor: player, owner, cell, rent });
}

async function handleJailTurn(player) {
  if (isBot(player)) return handleBotJailTurn(player);

  while (!player.bankrupt && player.inJail) {
    const attempt = player.jailTurns + 1;
    const mustLeave = attempt >= 3;
    const canPay = player.money >= JAIL_FINE || liquidValue(player) >= JAIL_FINE;

    openModal(`
      <div class="modal-card">
        <div class="modal-card__kicker">Тюрьма · ход ${attempt} из 3</div>
        <h3 class="modal-card__title">${player.name} за решёткой</h3>
        <p class="modal-card__text">${mustLeave
          ? 'Это третий ход. Если не выпадет дубль, придётся заплатить ₽ 50 и выйти на выпавшие очки.'
          : 'Можно заплатить ₽ 50, использовать карту или попытаться выбросить дубль.'}</p>
        <div class="modal-actions">
          <button class="btn-roll" data-modal-action="pay" type="button" ${canPay ? '' : 'disabled'}>Заплатить ₽ ${JAIL_FINE} и выйти</button>
          ${player.jailFreeCards.length ? '<button class="btn-action" data-modal-action="card" type="button">Карта освобождения</button>' : ''}
          <button class="btn-ghost" data-modal-action="roll" type="button">Бросить на дубль</button>
          <button class="btn-action" data-modal-action="manage" type="button">Дома и залог</button>
        </div>
      </div>
    `);

    const { action } = await waitModalAction();
    closeModal();

    if (action === 'manage') {
      await showManageModal(player);
      continue;
    }

    if (action === 'card' && player.jailFreeCards.length) {
      const deck = player.jailFreeCards.pop();
      returnJailFreeCard(deck);
      player.inJail = false;
      player.jailTurns = 0;
      setLog(`${player.name} использует карту освобождения из тюрьмы.`);
      refreshUI();
      return 'roll-free';
    }

    if (action === 'pay') {
      const paid = await forcePay(player, JAIL_FINE, null, 'Выход из тюрьмы');
      if (!paid) return 'done';
      player.inJail = false;
      player.jailTurns = 0;
      setLog(`${player.name} платит ₽ ${JAIL_FINE} и выходит из тюрьмы.`);
      refreshUI();
      return 'roll-free';
    }

    const dice = [rollDie(), rollDie()];
    const total = dice[0] + dice[1];
    const isDoubles = dice[0] === dice[1];
    await animateDiceRoll(dice);
    state.lastDice = dice;
    state.lastDiceTotal = total;

    if (isDoubles) {
      player.inJail = false;
      player.jailTurns = 0;
      state.rolledOutOfJail = true;
      setLog(`${player.name} выбрасывает дубль ${dice[0]}:${dice[1]} и выходит. Дополнительного хода нет.`);
      await movePlayer(player, total);
      state.turnPhase = 'resolve-land';
      persistGame();
      await resolveLanding(player);
      return 'landed-no-extra';
    }

    if (mustLeave) {
      const paid = await forcePay(player, JAIL_FINE, null, 'Выход из тюрьмы');
      if (!paid) return 'done';
      player.inJail = false;
      player.jailTurns = 0;
      setLog(`${player.name} не выбил дубль на третьем ходу, платит ₽ ${JAIL_FINE} и выходит.`);
      await movePlayer(player, total);
      state.turnPhase = 'resolve-land';
      persistGame();
      await resolveLanding(player);
      return 'landed-no-extra';
    }

    player.jailTurns += 1;
    setLog(`${player.name} не выбил дубль и остаётся в тюрьме (${player.jailTurns} из 3).`);
    return 'stay';
  }

  return 'done';
}

async function runJailTurn() {
  const player = getActivePlayer();
  const result = await handleJailTurn(player);

  if (result === 'roll-free') {
    state.turnPhase = 'pre-roll';
    setLog(`${player.name} на свободе. Можно строить дома или бросать кубики.`);
    refreshUI();
    persistGame();
    return;
  }

  if (result === 'stay' || player.inJail) {
    state.turnPhase = 'post-land';
    state.extraRoll = false;
    refreshUI();
    persistGame();
    return;
  }

  state.turnPhase = 'post-land';
  state.extraRoll = false;
  refreshUI();
  persistGame();
}

async function startTurn() {
  const player = getActivePlayer();
  if (player.bankrupt) {
    endTurn();
    return;
  }

  state.consecutiveDoubles = 0;
  state.extraRoll = false;
  state.rolledOutOfJail = false;
  state.turnPhase = 'pre-roll';
  refreshUI();
  setLog(`Ход ${player.name}. Можно купить дома или бросать кубики.`);
  persistGame();

  if (isBot(player)) {
    await runBotTurn();
    return;
  }

  if (player.inJail) {
    state.busy = true;
    updateActionButtons();
    await runJailTurn();
    state.busy = false;
    updateActionButtons();
  }
}

function endTurn() {
  if (state.busy || state.winnerId != null) return;
  do {
    state.activePlayerIndex = (state.activePlayerIndex + 1) % state.players.length;
  } while (getActivePlayer().bankrupt && state.winnerId == null);

  startTurn();
}

async function handleRoll() {
  if (state.busy || state.winnerId != null) return;
  const player = getActivePlayer();
  if (player.bankrupt || player.inJail) return;
  if (state.turnPhase === 'post-land' && !state.extraRoll) return;

  state.busy = true;
  updateActionButtons();

  const dice = rollDiceFor(player);
  const total = dice[0] + dice[1];
  const isDoubles = dice[0] === dice[1];

  await animateDiceRoll(dice);
  state.lastDice = dice;
  state.lastDiceTotal = total;

  if (isDoubles && !state.rolledOutOfJail) state.consecutiveDoubles += 1;
  else state.consecutiveDoubles = 0;

  if (state.consecutiveDoubles === 3) {
    setLog(`${player.name} выбрасывает третий дубль подряд и идёт в тюрьму.`);
    addComment(player, isUnluckySmart(player) ? 'Третий дубль. Ну конечно, в тюрьму.' : diceThought(player, dice, total));
    await sendToJail(player);
    state.turnPhase = 'post-land';
    state.extraRoll = false;
    state.busy = false;
    refreshUI();
    persistGame();
    return;
  }

  setLog(`${player.name} бросает кубики: ${dice[0]} и ${dice[1]}, сумма ${total}.`);
  addComment(player, diceThought(player, dice, total));
  await sleep(isBot(player) ? 560 : 280);
  await botsReact({ type: 'roll', actor: player, dice, total });
  await movePlayer(player, total);
  state.turnPhase = 'resolve-land';
  persistGame();
  await resolveLanding(player);

  state.extraRoll = isDoubles && !player.inJail && !state.rolledOutOfJail && state.winnerId == null;
  state.rolledOutOfJail = false;
  state.turnPhase = 'post-land';
  state.busy = false;
  refreshUI();

  if (state.winnerId != null) {
    persistGame();
    return;
  }
  if (state.extraRoll) {
    setLog(`${player.name} выбил дубль и ходит ещё раз. Можно строить дома или бросать.`);
  } else {
    setLog(`${player.name} может строить дома, торговаться, закладывать участки или закончить ход.`);
  }
  persistGame();
}

async function handleManage() {
  if (state.busy || state.winnerId != null) return;
  state.busy = true;
  updateActionButtons();
  await showManageModal(getActivePlayer());
  state.busy = false;
  refreshUI();
  persistGame();
}

function applySavedDice(dice, total) {
  if (!dice?.[0] || !dice?.[1]) return;
  setDieRotation(0, dice[0], false);
  setDieRotation(1, dice[1], false);
  setDiceReadout(dice, total);
}

function init() {
  initDice();
  renderBoard();
  showLobby();
  try {
    refreshUI();
    renderCommentary();
  } catch (error) {
    console.error(error);
  }

  rollBtn.addEventListener('click', handleRoll);
  manageBtn.addEventListener('click', handleManage);
  tradeBtn?.addEventListener('click', handleTrade);
  endTurnBtn.addEventListener('click', endTurn);
  saveBtn.addEventListener('click', handleSave);
  newGameBtn.addEventListener('click', handleNewGame);
  startGameBtn?.addEventListener('click', handleStartGame);
  continueBtn?.addEventListener('click', handleContinueGame);
  commentaryFormEl?.addEventListener('submit', handleChatSubmit);
  commentarySpeakerRowEl?.addEventListener('click', handleSpeakerClick);
  lobbySeatsEl?.addEventListener('change', () => {
    if (lobbyErrorEl) lobbyErrorEl.hidden = true;
  });
  window.addEventListener('resize', () => renderTokens());
  window.addEventListener('beforeunload', () => persistGame());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistGame();
  });
}

init();
