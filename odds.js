import {
  BOARD,
  PROPERTY_GROUPS,
  RAILROAD_RENT,
  GO_SALARY,
  JAIL_FINE,
  JAIL_POSITION,
  GO_TO_JAIL_POSITION,
  isTitleCell,
  getMortgageValue,
} from './board.js?v=k3';

// Шансы на победу как в покерной трансляции: из текущей позиции разыгрываем
// много коротких упрощённых партий и считаем, кто сколько раз выиграл.
// Карточки «Шанс»/«Казна», торговля и аукционы не моделируются.

const ROLLOUTS = 1000;
const ROUNDS = 45;
const BUY_RESERVE = 150;
const BUILD_RESERVE = 250;

const TITLE_IDS = BOARD.filter(isTitleCell).map((cell) => cell.id);
const GROUP_IDS = {};
BOARD.forEach((cell) => {
  if (cell.group) (GROUP_IDS[cell.group] ||= []).push(cell.id);
});

function makeRng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ownsGroup(sim, ownerId, group) {
  return GROUP_IDS[group].every((id) => sim.owner[id] === ownerId && !sim.mortgaged[id]);
}

function rentFor(sim, cellId, dice) {
  const cell = BOARD[cellId];
  const ownerId = sim.owner[cellId];
  if (cell.type === 'property') {
    const houses = sim.houses[cellId];
    if (houses > 0) return cell.rent[houses];
    return ownsGroup(sim, ownerId, cell.group) ? cell.rent[0] * 2 : cell.rent[0];
  }
  let count = 0;
  TITLE_IDS.forEach((id) => {
    if (sim.owner[id] === ownerId && BOARD[id].type === cell.type) count += 1;
  });
  if (cell.type === 'railroad') return RAILROAD_RENT[Math.max(0, count - 1)];
  return dice * (count >= 2 ? 10 : 4);
}

function worth(sim, playerIndex) {
  let total = sim.money[playerIndex];
  TITLE_IDS.forEach((id) => {
    if (sim.owner[id] !== playerIndex) return;
    const cell = BOARD[id];
    total += sim.mortgaged[id] ? 0 : getMortgageValue(cell);
    if (sim.houses[id]) total += sim.houses[id] * PROPERTY_GROUPS[cell.group].houseCost / 2;
  });
  return total;
}

// Продаём дома и закладываем, пока не хватит денег. Не хватило — банкрот.
function raiseCash(sim, playerIndex, creditor) {
  const mine = TITLE_IDS.filter((id) => sim.owner[id] === playerIndex);
  for (const id of mine) {
    while (sim.money[playerIndex] < 0 && sim.houses[id] > 0) {
      sim.houses[id] -= 1;
      sim.money[playerIndex] += PROPERTY_GROUPS[BOARD[id].group].houseCost / 2;
    }
  }
  for (const id of mine) {
    if (sim.money[playerIndex] >= 0) return;
    if (!sim.mortgaged[id] && !GROUP_IDS[BOARD[id].group]?.some((other) => sim.houses[other] > 0)) {
      sim.mortgaged[id] = true;
      sim.money[playerIndex] += getMortgageValue(BOARD[id]);
    }
  }
  if (sim.money[playerIndex] >= 0) return;

  sim.alive[playerIndex] = false;
  sim.aliveCount -= 1;
  sim.out.push(playerIndex);
  mine.forEach((id) => {
    sim.houses[id] = 0;
    if (creditor != null) {
      sim.owner[id] = creditor;
    } else {
      sim.owner[id] = null;
      sim.mortgaged[id] = false;
    }
  });
  // Кредитор уже получил всю сумму в pay(), снимаем недостачу банкрота.
  if (creditor != null) sim.money[creditor] += sim.money[playerIndex];
  sim.money[playerIndex] = 0;
}

function pay(sim, playerIndex, amount, creditor = null) {
  sim.money[playerIndex] -= amount;
  if (creditor != null) sim.money[creditor] += amount;
  if (sim.money[playerIndex] < 0) raiseCash(sim, playerIndex, creditor);
}

function build(sim, playerIndex) {
  Object.keys(GROUP_IDS).forEach((group) => {
    const ids = GROUP_IDS[group];
    if (BOARD[ids[0]].type !== 'property') return;
    if (!ownsGroup(sim, playerIndex, group)) return;
    const cost = PROPERTY_GROUPS[group].houseCost;
    while (sim.money[playerIndex] - cost >= BUILD_RESERVE) {
      const next = ids.reduce((low, id) => (sim.houses[id] < sim.houses[low] ? id : low), ids[0]);
      if (sim.houses[next] >= 5) break;
      sim.houses[next] += 1;
      sim.money[playerIndex] -= cost;
    }
  });
}

function takeTitle(sim, cellId, toIndex) {
  const group = BOARD[cellId].group;
  if (group && BOARD[cellId].type === 'property') GROUP_IDS[group].forEach((id) => { sim.houses[id] = 0; });
  sim.owner[cellId] = toIndex;
}

// Кирюша: случайная клетка, отжим/выкуп улиц, деньги из банка, подарки.
function playChaosTurn(sim, playerIndex, rng) {
  const position = Math.floor(rng() * BOARD.length);
  if (position < sim.position[playerIndex]) sim.money[playerIndex] += GO_SALARY;
  sim.position[playerIndex] = position;
  const cell = BOARD[position];
  if (cell.type === 'tax') {
    pay(sim, playerIndex, cell.amount || 0);
  } else if (isTitleCell(cell)) {
    const ownerId = sim.owner[position];
    if (ownerId == null) {
      if (sim.money[playerIndex] - cell.price >= BUY_RESERVE) {
        sim.owner[position] = playerIndex;
        sim.money[playerIndex] -= cell.price;
      }
    } else if (ownerId !== playerIndex && sim.alive[ownerId]) {
      const roll = rng();
      if (roll < 0.45) {
        takeTitle(sim, position, playerIndex);
      } else if (roll < 0.7) {
        sim.money[ownerId] += Math.max(0, sim.money[playerIndex]);
        sim.money[playerIndex] = 0;
        takeTitle(sim, position, playerIndex);
      } else if (!sim.mortgaged[position]) {
        pay(sim, playerIndex, rentFor(sim, position, 12), ownerId);
      }
    }
  }
  if (!sim.alive[playerIndex]) return;
  if (rng() < 0.7) sim.money[playerIndex] += 10 * (1 + Math.floor(rng() * 100));
  if (rng() < 0.3) {
    const mine = TITLE_IDS.filter((id) => sim.owner[id] === playerIndex);
    const others = sim.alive.map((alive, index) => (alive && index !== playerIndex ? index : -1)).filter((index) => index >= 0);
    if (mine.length && others.length) {
      takeTitle(sim, mine[Math.floor(rng() * mine.length)], others[Math.floor(rng() * others.length)]);
    }
  }
  build(sim, playerIndex);
}

function playTurn(sim, playerIndex, rng) {
  if (sim.chaos[playerIndex]) {
    playChaosTurn(sim, playerIndex, rng);
    return;
  }
  if (sim.jail[playerIndex]) {
    sim.jail[playerIndex] = false;
    pay(sim, playerIndex, JAIL_FINE);
    if (!sim.alive[playerIndex]) return;
  }

  const d1 = 1 + Math.floor(rng() * 6);
  const d2 = 1 + Math.floor(rng() * 6);
  const dice = d1 + d2;
  let position = sim.position[playerIndex] + dice;
  if (position >= BOARD.length) {
    position -= BOARD.length;
    sim.money[playerIndex] += GO_SALARY;
  }
  sim.position[playerIndex] = position;

  if (position === GO_TO_JAIL_POSITION) {
    sim.position[playerIndex] = JAIL_POSITION;
    sim.jail[playerIndex] = true;
    return;
  }

  const cell = BOARD[position];
  if (cell.type === 'tax') {
    pay(sim, playerIndex, cell.amount || 0);
  } else if (isTitleCell(cell)) {
    const ownerId = sim.owner[position];
    if (ownerId == null) {
      if (sim.money[playerIndex] - cell.price >= BUY_RESERVE) {
        sim.owner[position] = playerIndex;
        sim.money[playerIndex] -= cell.price;
      }
    } else if (ownerId !== playerIndex && !sim.mortgaged[position] && sim.alive[ownerId]) {
      pay(sim, playerIndex, rentFor(sim, position, dice), ownerId);
    }
  }

  if (sim.alive[playerIndex]) build(sim, playerIndex);
}

function rollout(base, startIndex, rng) {
  const sim = {
    money: base.money.slice(),
    position: base.position.slice(),
    jail: base.jail.slice(),
    alive: base.alive.slice(),
    aliveCount: base.aliveCount,
    owner: base.owner.slice(),
    houses: base.houses.slice(),
    mortgaged: base.mortgaged.slice(),
    chaos: base.chaos,
    out: [],
  };
  const count = sim.money.length;
  let round = 0;
  for (; round < ROUNDS && sim.aliveCount > 1; round += 1) {
    for (let step = 0; step < count && sim.aliveCount > 1; step += 1) {
      const index = (startIndex + step) % count;
      if (sim.alive[index]) playTurn(sim, index, rng);
    }
  }
  if (sim.aliveCount === 1) {
    return { winner: sim.alive.indexOf(true), out: sim.out, rounds: round, finished: true };
  }

  // Партия не доиграна за горизонт — места оставшихся по капиталу.
  const standing = [];
  for (let index = 0; index < count; index += 1) {
    if (sim.alive[index]) standing.push({ index, value: worth(sim, index) + rng() });
  }
  standing.sort((a, b) => a.value - b.value);
  return {
    winner: standing.length ? standing[standing.length - 1].index : -1,
    out: sim.out.concat(standing.slice(0, -1).map((item) => item.index)),
    rounds: round,
    finished: false,
  };
}

// players: [{ money, position, inJail, bankrupt }], titles: { [cellId]: { ownerId, houses, mortgaged } }
// Возвращает массив долей (0..1) по индексам players.
export function estimateWinOdds(players, titles, activeIndex = 0, seed = 1) {
  return simulateOutlook(players, titles, activeIndex, seed).wins;
}

// Полный прогноз: доли побед, шанс вылететь первым, среднее место
// (1 — победа) и через сколько кругов партия обычно заканчивается.
export function simulateOutlook(players, titles, activeIndex = 0, seed = 1) {
  const size = BOARD.length;
  const base = {
    money: players.map((player) => player.money),
    position: players.map((player) => player.position || 0),
    jail: players.map((player) => Boolean(player.inJail)),
    alive: players.map((player) => !player.bankrupt),
    chaos: players.map((player) => player.botKind === 'kiryusha'),
    aliveCount: players.filter((player) => !player.bankrupt).length,
    owner: new Array(size).fill(null),
    houses: new Array(size).fill(0),
    mortgaged: new Array(size).fill(false),
  };
  TITLE_IDS.forEach((id) => {
    const title = titles[id];
    if (!title || title.ownerId == null) return;
    base.owner[id] = title.ownerId;
    base.houses[id] = title.houses || 0;
    base.mortgaged[id] = Boolean(title.mortgaged);
  });

  const count = players.length;
  const wins = new Array(count).fill(0);
  const firstOut = new Array(count).fill(0);
  const placeSum = new Array(count).fill(0);
  if (base.aliveCount <= 1) {
    const winner = base.alive.indexOf(true);
    if (winner >= 0) wins[winner] = 1;
    return { wins, firstOut, place: wins.map((value) => (value ? 1 : count)), rounds: 0, finishedShare: 1 };
  }

  const rng = makeRng(seed);
  const finishedRounds = [];
  for (let run = 0; run < ROLLOUTS; run += 1) {
    const result = rollout(base, activeIndex, rng);
    if (result.winner >= 0) {
      wins[result.winner] += 1;
      placeSum[result.winner] += 1;
    }
    const fresh = result.out.filter((index) => base.alive[index]);
    if (fresh.length) firstOut[fresh[0]] += 1;
    // Последний вылетевший занимает 2-е место, первый — последнее среди живых.
    fresh.forEach((index, order) => {
      placeSum[index] += base.aliveCount - order;
    });
    if (result.finished) finishedRounds.push(result.rounds);
  }
  finishedRounds.sort((a, b) => a - b);
  return {
    wins: wins.map((value) => value / ROLLOUTS),
    firstOut: firstOut.map((value) => value / ROLLOUTS),
    place: placeSum.map((value, index) => (base.alive[index] ? value / ROLLOUTS : count)),
    rounds: finishedRounds.length ? finishedRounds[Math.floor(finishedRounds.length / 2)] : null,
    finishedShare: finishedRounds.length / ROLLOUTS,
  };
}
