export const PROPERTY_GROUPS = {
  brown: { color: '#8B4513', label: 'Коричневая', houseCost: 50 },
  lightblue: { color: '#87CEEB', label: 'Голубая', houseCost: 50 },
  pink: { color: '#FF69B4', label: 'Розовая', houseCost: 100 },
  orange: { color: '#FF8C00', label: 'Оранжевая', houseCost: 100 },
  red: { color: '#DC143C', label: 'Красная', houseCost: 150 },
  yellow: { color: '#FFD700', label: 'Жёлтая', houseCost: 150 },
  green: { color: '#228B22', label: 'Зелёная', houseCost: 200 },
  darkblue: { color: '#000080', label: 'Синяя', houseCost: 200 },
};

export const RAILROAD_RENT = [25, 50, 100, 200];
export const HOUSE_SUPPLY = 32;
export const HOTEL_SUPPLY = 12;
export const GO_SALARY = 200;
export const JAIL_FINE = 50;
export const JAIL_POSITION = 10;
export const GO_TO_JAIL_POSITION = 30;
export const STARTING_MONEY = 1500;
export const BANK_MONEY = 20000;

export const BOARD = [
  {
    id: 0,
    name: 'Вперёд',
    type: 'corner',
    subtitle: 'Зарплата ₽ 200',
    icon: '→',
  },
  {
    id: 1,
    name: 'Житная ул.',
    type: 'property',
    group: 'brown',
    price: 60,
    rent: [2, 10, 30, 90, 160, 250],
  },
  {
    id: 2,
    name: 'Общественная казна',
    type: 'chest',
    subtitle: 'Казна',
    icon: '📦',
  },
  {
    id: 3,
    name: 'Нагатинская ул.',
    type: 'property',
    group: 'brown',
    price: 60,
    rent: [4, 20, 60, 180, 320, 450],
  },
  {
    id: 4,
    name: 'Подоходный налог',
    type: 'tax',
    subtitle: 'Заплатите ₽ 200',
    amount: 200,
    icon: '₽',
  },
  {
    id: 5,
    name: 'Рижская ж. д.',
    type: 'railroad',
    price: 200,
    icon: '🚂',
    subtitle: 'Рижская железная дорога',
  },
  {
    id: 6,
    name: 'Варшавское шоссе',
    type: 'property',
    group: 'lightblue',
    price: 100,
    rent: [6, 30, 90, 270, 400, 550],
  },
  {
    id: 7,
    name: 'Шанс',
    type: 'chance',
    subtitle: 'Шанс',
    icon: '?',
  },
  {
    id: 8,
    name: 'Ул. Огарева',
    type: 'property',
    group: 'lightblue',
    price: 100,
    rent: [6, 30, 90, 270, 400, 550],
  },
  {
    id: 9,
    name: 'Первая Парковая ул.',
    type: 'property',
    group: 'lightblue',
    price: 120,
    rent: [8, 40, 100, 300, 450, 600],
  },
  {
    id: 10,
    name: 'Тюрьма',
    type: 'corner',
    subtitle: 'Просто посетили',
    icon: '⛓',
  },
  {
    id: 11,
    name: 'Ул. Полянка',
    type: 'property',
    group: 'pink',
    price: 140,
    rent: [10, 50, 150, 450, 625, 750],
  },
  {
    id: 12,
    name: 'Электростанция',
    type: 'utility',
    price: 150,
    icon: '⚡',
  },
  {
    id: 13,
    name: 'Ул. Сретенка',
    type: 'property',
    group: 'pink',
    price: 140,
    rent: [10, 50, 150, 450, 625, 750],
  },
  {
    id: 14,
    name: 'Ростовская наб.',
    type: 'property',
    group: 'pink',
    price: 160,
    rent: [12, 60, 180, 500, 700, 900],
  },
  {
    id: 15,
    name: 'Курская ж. д.',
    type: 'railroad',
    price: 200,
    icon: '🚂',
    subtitle: 'Курская железная дорога',
  },
  {
    id: 16,
    name: 'Рязанский проспект',
    type: 'property',
    group: 'orange',
    price: 180,
    rent: [14, 70, 200, 550, 750, 950],
  },
  {
    id: 17,
    name: 'Общественная казна',
    type: 'chest',
    subtitle: 'Казна',
    icon: '📦',
  },
  {
    id: 18,
    name: 'Ул. Вавилова',
    type: 'property',
    group: 'orange',
    price: 180,
    rent: [14, 70, 200, 550, 750, 950],
  },
  {
    id: 19,
    name: 'Рублевское шоссе',
    type: 'property',
    group: 'orange',
    price: 200,
    rent: [16, 80, 220, 600, 800, 1000],
  },
  {
    id: 20,
    name: 'Бесплатная стоянка',
    type: 'corner',
    subtitle: 'Отдых',
    icon: '🅿',
  },
  {
    id: 21,
    name: 'Ул. Тверская',
    type: 'property',
    group: 'red',
    price: 220,
    rent: [18, 90, 250, 700, 875, 1050],
  },
  {
    id: 22,
    name: 'Шанс',
    type: 'chance',
    subtitle: 'Шанс',
    icon: '?',
  },
  {
    id: 23,
    name: 'Пушкинская ул.',
    type: 'property',
    group: 'red',
    price: 220,
    rent: [18, 90, 250, 700, 875, 1050],
  },
  {
    id: 24,
    name: 'Площадь Маяковского',
    type: 'property',
    group: 'red',
    price: 240,
    rent: [20, 100, 300, 750, 925, 1100],
  },
  {
    id: 25,
    name: 'Казанская ж. д.',
    type: 'railroad',
    price: 200,
    icon: '🚂',
    subtitle: 'Казанская железная дорога',
  },
  {
    id: 26,
    name: 'Ул. Грузинский Вал',
    type: 'property',
    group: 'yellow',
    price: 260,
    rent: [22, 110, 330, 800, 975, 1150],
  },
  {
    id: 27,
    name: 'Новинский бульвар',
    type: 'property',
    group: 'yellow',
    price: 260,
    rent: [22, 110, 330, 800, 975, 1150],
  },
  {
    id: 28,
    name: 'Водопровод',
    type: 'utility',
    price: 150,
    icon: '💧',
  },
  {
    id: 29,
    name: 'Смоленская площадь',
    type: 'property',
    group: 'yellow',
    price: 280,
    rent: [24, 120, 360, 850, 1025, 1200],
  },
  {
    id: 30,
    name: 'В тюрьму',
    type: 'corner',
    subtitle: 'Отправляйтесь в тюрьму',
    icon: '🚔',
  },
  {
    id: 31,
    name: 'Ул. Щусева',
    type: 'property',
    group: 'green',
    price: 300,
    rent: [26, 130, 390, 900, 1100, 1275],
  },
  {
    id: 32,
    name: 'Гоголевский бульвар',
    type: 'property',
    group: 'green',
    price: 300,
    rent: [26, 130, 390, 900, 1100, 1275],
  },
  {
    id: 33,
    name: 'Общественная казна',
    type: 'chest',
    subtitle: 'Казна',
    icon: '📦',
  },
  {
    id: 34,
    name: 'Кутузовский проспект',
    type: 'property',
    group: 'green',
    price: 320,
    rent: [28, 140, 450, 1000, 1200, 1400],
  },
  {
    id: 35,
    name: 'Ленинградская ж. д.',
    type: 'railroad',
    price: 200,
    icon: '🚂',
    subtitle: 'Ленинградская железная дорога',
  },
  {
    id: 36,
    name: 'Шанс',
    type: 'chance',
    subtitle: 'Шанс',
    icon: '?',
  },
  {
    id: 37,
    name: 'Ул. Малая Бронная',
    type: 'property',
    group: 'darkblue',
    price: 350,
    rent: [35, 175, 500, 1100, 1300, 1500],
  },
  {
    id: 38,
    name: 'Сверхналог',
    type: 'tax',
    subtitle: 'Заплатите ₽ 100',
    amount: 100,
    icon: '₽',
  },
  {
    id: 39,
    name: 'Ул. Арбат',
    type: 'property',
    group: 'darkblue',
    price: 400,
    rent: [50, 200, 600, 1400, 1700, 2000],
  },
];

export const PLAYER_CATALOG = [
  {
    key: 'human1',
    name: 'Кирилл',
    token: '🚗',
    color: '#E53935',
    isBot: false,
    defaultOn: true,
    blurb: 'человек · можно снять',
  },
  {
    key: 'human2',
    name: 'Артём',
    token: '🎩',
    color: '#1E88E5',
    isBot: false,
    defaultOn: true,
    blurb: 'человек · можно одному, без Кирилла',
  },
  {
    key: 'mart',
    name: 'Март',
    token: '🐈‍⬛',
    color: '#8E24AA',
    isBot: true,
    botId: 'mart',
    botKind: 'mart',
    defaultOn: true,
    blurb: 'кот · везучий и глупый',
  },
  {
    key: 'lokh',
    name: 'Лох',
    token: '🦆',
    color: '#00897B',
    isBot: true,
    botId: 'lokh',
    botKind: 'lokh',
    defaultOn: true,
    blurb: 'утка · умный, очень невезучий',
  },
  {
    key: 'miron',
    name: 'Мирон',
    token: '🦉',
    color: '#EF6C00',
    isBot: true,
    botId: 'miron',
    botKind: 'miron',
    defaultOn: true,
    blurb: 'сова · чемпион мира, считает вероятности',
  },
  {
    key: 'ashot',
    name: 'Ашот',
    token: '🍇',
    color: '#A31545',
    isBot: true,
    botId: 'ashot',
    botKind: 'ashot',
    defaultOn: true,
    blurb: 'опытный продавец фруктов из Сочи',
  },
];

export const PLAYERS = PLAYER_CATALOG
  .filter((seat) => seat.required || seat.defaultOn)
  .map((seat, id) => ({
    id,
    name: seat.name,
    token: seat.token,
    color: seat.color,
    money: 1500,
    position: 0,
    isBot: seat.isBot,
    botId: seat.botId,
    botKind: seat.botKind,
  }));

export const CHANCE_CARDS = [
  {
    id: 'ch-go',
    text: 'Отправляйтесь на поле «Вперёд». Получите ₽ 200.',
    type: 'advance',
    position: 0,
  },
  {
    id: 'ch-mayakovsky',
    text: 'Отправляйтесь на площадь Маяковского. Если вы проходите «Вперёд», получите ₽ 200.',
    type: 'advance',
    position: 24,
  },
  {
    id: 'ch-polyanka',
    text: 'Отправляйтесь на ул. Полянка. Если вы проходите «Вперёд», получите ₽ 200.',
    type: 'advance',
    position: 11,
  },
  {
    id: 'ch-utility',
    text: 'Отправляйтесь на ближайшую коммунальную службу. Если она свободна — можете купить. Если занята — бросьте кубики и заплатите владельцу в 10 раз больше суммы очков.',
    type: 'nearest-utility',
  },
  {
    id: 'ch-rail-1',
    text: 'Отправляйтесь на ближайшую железную дорогу. Если она принадлежит другому игроку, заплатите двойную аренду.',
    type: 'nearest-railroad',
  },
  {
    id: 'ch-rail-2',
    text: 'Отправляйтесь на ближайшую железную дорогу. Если она принадлежит другому игроку, заплатите двойную аренду.',
    type: 'nearest-railroad',
  },
  {
    id: 'ch-dividend',
    text: 'Банк выплачивает вам дивиденд в размере ₽ 50.',
    type: 'collect',
    amount: 50,
  },
  {
    id: 'ch-jail-free',
    text: 'Бесплатное освобождение из тюрьмы. Сохраните карту до нужного момента.',
    type: 'jail-free',
    deck: 'chance',
  },
  {
    id: 'ch-back-3',
    text: 'Вернитесь на три клетки назад.',
    type: 'move',
    steps: -3,
  },
  {
    id: 'ch-jail',
    text: 'Отправляйтесь в тюрьму. Идите прямо в тюрьму, не проходите «Вперёд», не получайте ₽ 200.',
    type: 'jail',
  },
  {
    id: 'ch-repairs',
    text: 'Капитальный ремонт всей вашей собственности: ₽ 25 за каждый дом, ₽ 100 за каждый отель.',
    type: 'repairs',
    house: 25,
    hotel: 100,
  },
  {
    id: 'ch-speeding',
    text: 'Штраф за превышение скорости: ₽ 15.',
    type: 'pay',
    amount: 15,
  },
  {
    id: 'ch-riga',
    text: 'Совершите поездку на Рижскую железную дорогу. Если вы проходите «Вперёд», получите ₽ 200.',
    type: 'advance',
    position: 5,
  },
  {
    id: 'ch-arbat',
    text: 'Прогуляйтесь по Арбату.',
    type: 'advance',
    position: 39,
  },
  {
    id: 'ch-chairman',
    text: 'Вас избрали председателем совета директоров. Выплатите каждому игроку ₽ 50.',
    type: 'pay-each',
    amount: 50,
  },
  {
    id: 'ch-loan',
    text: 'Ссуда на строительство. Получите ₽ 150.',
    type: 'collect',
    amount: 150,
  },
];

export const CHEST_CARDS = [
  {
    id: 'cc-go',
    text: 'Отправляйтесь на поле «Вперёд». Получите ₽ 200.',
    type: 'advance',
    position: 0,
  },
  {
    id: 'cc-bank-error',
    text: 'Ошибка банка в вашу пользу. Получите ₽ 200.',
    type: 'collect',
    amount: 200,
  },
  {
    id: 'cc-doctor',
    text: 'Оплата услуг врача. Заплатите ₽ 50.',
    type: 'pay',
    amount: 50,
  },
  {
    id: 'cc-stock',
    text: 'Продажа акций. Получите ₽ 50.',
    type: 'collect',
    amount: 50,
  },
  {
    id: 'cc-jail-free',
    text: 'Бесплатное освобождение из тюрьмы. Сохраните карту до нужного момента.',
    type: 'jail-free',
    deck: 'chest',
  },
  {
    id: 'cc-jail',
    text: 'Отправляйтесь в тюрьму. Идите прямо в тюрьму, не проходите «Вперёд», не получайте ₽ 200.',
    type: 'jail',
  },
  {
    id: 'cc-holiday',
    text: 'Фонд отдыха. Получите ₽ 100.',
    type: 'collect',
    amount: 100,
  },
  {
    id: 'cc-tax-refund',
    text: 'Возврат подоходного налога. Получите ₽ 20.',
    type: 'collect',
    amount: 20,
  },
  {
    id: 'cc-birthday',
    text: 'У вас день рождения. Получите ₽ 10 от каждого игрока.',
    type: 'collect-each',
    amount: 10,
  },
  {
    id: 'cc-insurance',
    text: 'Страховка истекла. Получите ₽ 100.',
    type: 'collect',
    amount: 100,
  },
  {
    id: 'cc-hospital',
    text: 'Оплата больницы. Заплатите ₽ 100.',
    type: 'pay',
    amount: 100,
  },
  {
    id: 'cc-school',
    text: 'Оплата школы. Заплатите ₽ 50.',
    type: 'pay',
    amount: 50,
  },
  {
    id: 'cc-consult',
    text: 'Получите ₽ 25 за консультацию.',
    type: 'collect',
    amount: 25,
  },
  {
    id: 'cc-repairs',
    text: 'Ремонт улиц: ₽ 40 за каждый дом, ₽ 115 за каждый отель.',
    type: 'repairs',
    house: 40,
    hotel: 115,
  },
  {
    id: 'cc-beauty',
    text: 'Второе место на конкурсе красоты. Получите ₽ 10.',
    type: 'collect',
    amount: 10,
  },
  {
    id: 'cc-inherit',
    text: 'Наследство. Получите ₽ 100.',
    type: 'collect',
    amount: 100,
  },
];

export function formatMoney(amount) {
  return Number(amount).toLocaleString('ru-RU');
}

export function getCellByPosition(position) {
  return BOARD[position];
}

export function isTitleCell(cell) {
  return cell.type === 'property' || cell.type === 'railroad' || cell.type === 'utility';
}

export function getMortgageValue(cell) {
  return Math.floor(cell.price / 2);
}

export function getUnmortgageCost(cell) {
  return Math.ceil(getMortgageValue(cell) * 1.1);
}

export function getHouseCost(cell) {
  if (!cell.group) return 0;
  return PROPERTY_GROUPS[cell.group].houseCost;
}

export function getGroupCells(group) {
  return BOARD.filter((cell) => cell.group === group);
}

export function nextCellOfType(fromPosition, type) {
  for (let step = 1; step <= BOARD.length; step += 1) {
    const position = (fromPosition + step) % BOARD.length;
    if (BOARD[position].type === type) return position;
  }
  return fromPosition;
}

export function shuffle(list) {
  const items = [...list];
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [items[index], items[swap]] = [items[swap], items[index]];
  }
  return items;
}
