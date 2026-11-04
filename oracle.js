import {
  BOARD,
  PROPERTY_GROUPS,
  RAILROAD_RENT,
  isTitleCell,
  getMortgageValue,
} from './board.js?v=k3';

// Нострадамус без интернета: читает позицию, берёт прогноз из симуляции
// и складывает пророчество из фраз. Каждая фраза — отдельная строка,
// чтобы её можно было показать и зачитать по очереди.

const GROUP_IDS = {};
BOARD.forEach((cell) => {
  if (cell.group) (GROUP_IDS[cell.group] ||= []).push(cell.id);
});

const INTROS = [
  'Звёзды сошлись над Москвой. Нострадамус говорит.',
  'Кубики замерли. Я вижу финал этой партии.',
  'Слушайте все. Нострадамус заглянул в будущее.',
];

const OUTROS = [
  'Так сказал Нострадамус. Кубики могут поспорить, но редко выигрывают.',
  'Будущее сказано. Бросайте кубики и проверяйте.',
  'Нострадамус умолкает. Остальное решит удача.',
];

const KIND_DEFAULTS = {
  mart: 'покупать всё, что блестит, и не думать',
  lokh: 'осторожно приглядываться и бояться каждой клетки',
  miron: 'считать вероятности и брать улицы с лучшей отдачей',
  ashot: 'скупать подешевле, чтобы потом продать подороже',
  mama: 'копить деньги и не тратить ни рубля без нужды',
  kiryusha: 'носиться по полю, отжимать улицы и грабить банк',
};

const KIND_TAILS = {
  mart: 'Надеется на кошачью удачу.',
  lokh: 'Если, конечно, не струсит.',
  miron: 'Холодный расчёт, ничего личного.',
  ashot: 'И каждому предложит сделку.',
  mama: 'И никому ничего не уступит.',
  kiryusha: 'Правила для слабых.',
};

function pick(list, seed) {
  return list[Math.abs(seed) % list.length];
}

function pct(value) {
  return `${Math.round(value * 100)}%`;
}

function money(value) {
  return `${Math.round(value).toLocaleString('ru-RU')} ₽`;
}

// «Зелёная» → зелёная / зелёной / зелёную, «Синяя» → синяя / синей / синюю.
const GROUP_ENDINGS = { 'ой': { 'ая': 'ой', 'яя': 'ей' }, 'ую': { 'ая': 'ую', 'яя': 'юю' } };

function groupName(group, ending = 'ая') {
  const label = PROPERTY_GROUPS[group].label.toLowerCase();
  const forms = GROUP_ENDINGS[ending];
  if (!forms) return label;
  return label.replace(/(ая|яя)$/, (tail) => forms[tail]);
}

function ownsGroup(titles, playerId, group) {
  return GROUP_IDS[group].every((id) => titles[id]?.ownerId === playerId && !titles[id]?.mortgaged);
}

function rentNow(titles, cell) {
  const title = titles[cell.id];
  if (!title || title.ownerId == null || title.mortgaged) return 0;
  if (cell.type === 'property') {
    if (title.houses > 0) return cell.rent[title.houses];
    return ownsGroup(titles, title.ownerId, cell.group) ? cell.rent[0] * 2 : cell.rent[0];
  }
  const count = BOARD.filter((item) => item.type === cell.type && titles[item.id]?.ownerId === title.ownerId).length;
  if (cell.type === 'railroad') return RAILROAD_RENT[Math.max(0, count - 1)];
  return 7 * (count >= 2 ? 10 : 4);
}

function liquidation(titles, player) {
  let total = player.money;
  BOARD.forEach((cell) => {
    const title = titles[cell.id];
    if (!isTitleCell(cell) || title?.ownerId !== player.id) return;
    if (!title.mortgaged) total += getMortgageValue(cell);
    if (title.houses) total += title.houses * PROPERTY_GROUPS[cell.group].houseCost / 2;
  });
  return total;
}

function ownedCells(titles, player) {
  return BOARD.filter((cell) => isTitleCell(cell) && titles[cell.id]?.ownerId === player.id);
}

function bestMonopoly(titles, player) {
  let best = null;
  Object.keys(GROUP_IDS).forEach((group) => {
    if (!ownsGroup(titles, player.id, group)) return;
    const top = Math.max(...GROUP_IDS[group].map((id) => rentNow(titles, BOARD[id])));
    const houses = GROUP_IDS[group].reduce((sum, id) => sum + (titles[id].houses || 0), 0);
    if (!best || top > best.top) best = { group, top, houses, size: GROUP_IDS[group].length };
  });
  return best;
}

// Группа, где игроку не хватает ровно одной улицы.
function nearGroup(titles, player, players) {
  let best = null;
  Object.keys(GROUP_IDS).forEach((group) => {
    const ids = GROUP_IDS[group];
    const mine = ids.filter((id) => titles[id]?.ownerId === player.id);
    if (mine.length !== ids.length - 1) return;
    const missingId = ids.find((id) => titles[id]?.ownerId !== player.id);
    const ownerId = titles[missingId]?.ownerId;
    const holder = ownerId == null ? null : players.find((item) => item.id === ownerId);
    if (holder?.bankrupt) return;
    const value = BOARD[missingId].price;
    if (!best || value > best.value) best = { group, cell: BOARD[missingId], holder, value };
  });
  return best;
}

function winnerReason(titles, player) {
  const mono = bestMonopoly(titles, player);
  if (mono && mono.houses) {
    return `Козырь — ${groupName(mono.group)} монополия с домами: аренда до ${money(mono.top)}.`;
  }
  if (mono) return `Козырь — ${groupName(mono.group)} монополия, и на дома скоро хватит денег.`;
  return `Козырь — запас прочности: ${money(liquidation(titles, player))} с учётом улиц.`;
}

function loserReason(titles, player, danger) {
  const cells = ownedCells(titles, player);
  const value = liquidation(titles, player);
  if (cells.length && cells.every((cell) => titles[cell.id].mortgaged)) {
    return `Всё заложено, на руках ${money(player.money)}.`;
  }
  if (danger && danger.rent > value) {
    return `Даже продав всё, наберёт ${money(value)} — меньше одной аренды на «${danger.cell.name}».`;
  }
  if (player.money < 150) return `На руках всего ${money(player.money)}.`;
  return 'Доходов мало, а аренды вокруг дорожают.';
}

function planFor(titles, player, players) {
  const name = player.name;
  const mono = bestMonopoly(titles, player);
  const tail = KIND_TAILS[player.botKind] ? ` ${KIND_TAILS[player.botKind]}` : '';
  if (mono && mono.houses < mono.size * 5) {
    const cost = PROPERTY_GROUPS[mono.group].houseCost;
    if (player.money >= cost * 2) {
      const next = mono.houses >= mono.size * 4 ? 'отели' : 'дома';
      return `${name}: дальше ${next} на ${groupName(mono.group, 'ой')} группе.${tail}`;
    }
  }
  const near = nearGroup(titles, player, players);
  if (near && near.cell.type === 'property') {
    if (near.holder) {
      return `${name}: не хватает «${near.cell.name}», чтобы собрать ${groupName(near.group, 'ую')} группу. Улица у игрока ${near.holder.name}.${tail}`;
    }
    return `${name}: охота за «${near.cell.name}» — последней улицей ${groupName(near.group, 'ой')} группы.${tail}`;
  }
  if (player.money < 150) return `${name}: режим выживания — закладывать улицы и продавать дома.${tail}`;
  if (mono) return `${name}: держать ${groupName(mono.group, 'ую')} монополию и ждать, кто на неё наступит.${tail}`;

  // Группа, которую ещё можно собрать: часть своя, остальное ничьё.
  let open = null;
  Object.keys(GROUP_IDS).forEach((group) => {
    const ids = GROUP_IDS[group];
    const mine = ids.filter((id) => titles[id]?.ownerId === player.id).length;
    const free = ids.filter((id) => titles[id]?.ownerId == null).length;
    if (!mine || mine + free !== ids.length) return;
    if (!open || mine / ids.length > open.share) open = { group, mine, size: ids.length, share: mine / ids.length };
  });
  if (open) return `${name}: собирает ${groupName(open.group, 'ую')} группу — уже ${open.mine} из ${open.size}.${tail}`;

  const rails = ownedCells(titles, player).filter((cell) => cell.type === 'railroad').length;
  if (rails >= 2) return `${name}: ставка на вокзалы — уже ${rails}, аренда ${money(RAILROAD_RENT[rails - 1])}.${tail}`;

  if (KIND_DEFAULTS[player.botKind]) return `${name}: ${KIND_DEFAULTS[player.botKind]}.`;
  return `${name}: копить деньги и ждать ошибки соперников.`;
}

function blockedGroups(titles, players) {
  const lines = [];
  Object.keys(GROUP_IDS).forEach((group) => {
    const ids = GROUP_IDS[group];
    if (BOARD[ids[0]].type !== 'property') return;
    const owners = [...new Set(ids.map((id) => titles[id]?.ownerId).filter((id) => id != null))];
    if (owners.length < 2 || ids.some((id) => titles[id]?.ownerId == null)) return;
    const names = owners
      .map((id) => players.find((item) => item.id === id))
      .filter((item) => item && !item.bankrupt)
      .map((item) => item.name);
    if (names.length < 2) return;
    const value = ids.reduce((sum, id) => sum + BOARD[id].price, 0);
    lines.push({ value, text: `${PROPERTY_GROUPS[group].label} группа поделена между ${names.join(' и ')} — никто не построит дома, пока не договорятся.` });
  });
  return lines.sort((a, b) => b.value - a.value).slice(0, 2).map((item) => item.text);
}

// state: { players, titles }, outlook: результат simulateOutlook.
// Возвращает массив фраз пророчества.
export function buildProphecy(state, outlook, seed = Date.now()) {
  const { players, titles } = state;
  const alive = players.filter((player) => !player.bankrupt);
  const lines = [pick(INTROS, seed)];

  if (alive.length <= 1) {
    lines.push(alive.length ? `Партия уже решена: победил ${alive[0].name}.` : 'Победителей нет. Банк забрал всех.');
    lines.push(pick(OUTROS, seed + 1));
    return lines;
  }

  const ranked = alive
    .map((player) => ({ player, win: outlook.wins[players.indexOf(player)], place: outlook.place[players.indexOf(player)] }))
    .sort((a, b) => b.win - a.win || a.place - b.place);
  const leader = ranked[0];

  if (leader.win >= 0.6) {
    lines.push(`Победитель — ${leader.player.name}: так выходит в ${pct(leader.win)} симуляций. ${winnerReason(titles, leader.player)}`);
  } else if (leader.win >= 0.35) {
    lines.push(`Фаворит — ${leader.player.name}, ${pct(leader.win)}. Но ${ranked[1].player.name} с ${pct(ranked[1].win)} ещё может перевернуть партию. ${winnerReason(titles, leader.player)}`);
  } else {
    const top = ranked.slice(0, 3).map((item) => `${item.player.name} ${pct(item.win)}`).join(', ');
    lines.push(`Явного фаворита нет: ${top}. Всё решат ближайшие круги.`);
  }

  let danger = null;
  BOARD.forEach((cell) => {
    if (!isTitleCell(cell)) return;
    const rent = rentNow(titles, cell);
    if (rent && (!danger || rent > danger.rent)) danger = { cell, rent, owner: players.find((item) => item.id === titles[cell.id].ownerId) };
  });
  if (danger && danger.rent >= 150) {
    lines.push(`Самое опасное место на поле — «${danger.cell.name}»: аренда ${money(danger.rent)}, получает ${danger.owner.name}.`);
  }

  const loser = alive
    .map((player) => ({ player, chance: outlook.firstOut[players.indexOf(player)] }))
    .sort((a, b) => b.chance - a.chance)[0];
  if (loser && loser.chance >= 0.2) {
    lines.push(`Первый на вылет — ${loser.player.name}, ${pct(loser.chance)} вариантов. ${loserReason(titles, loser.player, danger)}`);
  }

  if (alive.length >= 3) {
    const order = alive
      .map((player) => ({ player, place: outlook.place[players.indexOf(player)] }))
      .sort((a, b) => a.place - b.place)
      .map((item, index) => `${index + 1} — ${item.player.name}`);
    lines.push(`Места в финале: ${order.join(', ')}.`);
  }

  if (outlook.finishedShare >= 0.5 && outlook.rounds) {
    lines.push(`Партия закончится примерно через ${outlook.rounds} кругов.`);
  } else {
    lines.push('Партия будет долгой: до банкротства всех соперников ещё далеко.');
  }

  ranked.forEach((item) => lines.push(planFor(titles, item.player, players)));
  blockedGroups(titles, players).forEach((line) => lines.push(line));
  lines.push(pick(OUTROS, seed + 2));
  return lines;
}
