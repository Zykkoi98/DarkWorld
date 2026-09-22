// ===== ГЛОБАЛЬНЫЕ КОНСТАНТЫ И БАЗЫ ДАННЫХ ИГРЫ (CONFIG) =====

// ⚙️ 1. Настройки аватаров и базовые конфиги
window.DEFAULT_AVATAR = "assets/avatars/hero1.png";

// 📊 2. Таблица порогов опыта (Суммарный опыт для уровня)
window.XP_TABLE = [
  0,      // 0 уровень (не используется)
  0,      // 1 уровень (стартовая точка, нужно 0 XP)
  20,     // Чтобы получить 2 лвл, нужно ВСЕГО набрать 20 XP
  70,     // Чтобы получить 3 лвл, нужно ВСЕГО набрать 70 XP  (20 с прошлого + 50 новых)
  170,    // Чтобы получить 4 лвл, нужно ВСЕГО набрать 170 XP (70 с прошлого + 100 новых)
  370,    // Чтобы получить 5 лвл, нужно ВСЕГО набрать 370 XP
  770,    // Чтобы получить 6 лвл, нужно ВСЕГО набрать 770 XP
  1570,   // Чтобы получить 7 лвл, нужно ВСЕГО набрать 1570 XP
  3070,   // Чтобы получить 8 лвл, нужно ВСЕГО набрать 3070 XP
  5570,   // Чтобы получить 9 лвл, нужно ВСЕГО набрать 5570 XP
  9570,   // Чтобы получить 10 лвл, нужно ВСЕГО набрать 9570 XP
];
// ⚔️ 3. База данных городов и их локаций
window.TOWNS = [
  {
    name: "Ашенваль",
    locations: [
      { name: "Таверна", icon: "🍺" },
      { name: "Магазин", icon: "💰" },
      { name: "Кузница", icon: "⚒️" },
      { name: "Арена PvP", icon: "🏆" }, 
      { name: "Выход на природу", icon: "🌲" }
    ]
  },
  {
    name: "Драгонхолд",
    locations: [
      { name: "Замковая площадь", icon: "🏰" },
      { name: "Рыночные ряды", icon: "⚖️" },
      { name: "Гильдия магов", icon: "🔮" },
      { name: "Казармы", icon: "🛡️" }
    ]
  }
];

// ============================================================================
// ===== 🗡️ БАЗА ДАННЫХ ОРУЖИЯ И ЩИТОВ (WEAPON_DATABASE) =====
// ============================================================================
window.WEAPON_DATABASE = {
  'rusty_sword': { name: 'Ржавый меч', icon: '🗡️', slotType: 'mainHand', price: 10, level: 1, desc: 'Старый клинок. Слегка помогает попасть.', bonus: { atk: 2, mf_antiinv: 10 } },
  'iron_sword': { name: 'Железный меч', icon: '⚔️', slotType: 'mainHand', price: 45, level: 2, desc: 'Хороший кованый меч. Повышает шанс критического удара.', bonus: { atk: 7, mf_crit: 20 } },
  'wooden_shield': { name: 'Щит новичка', icon: '🛡️', slotType: 'offHand', price: 15, level: 1, desc: 'Простой щит. Защищает от критических ударов.', bonus: { def: 3, mf_anticrit: 15 } },
  'steel_mace': { name: 'Стальная булава', icon: '🔨', slotType: 'mainHand', price: 90, level: 3, desc: 'Тяжелое оружие. Бойцы не могут от нее увернуться.', bonus: { atk: 12, mf_antiinv: 35 } },
  'heavy_halberd': { name: 'Тяжелая алебарда', icon: '🔱', slotType: 'twoHanded', price: 120, level: 5, desc: 'Огромное оружие. Гарантирует колоссальные криты.', bonus: { atk: 22, mf_crit: 50 } }
};

// ============================================================================
// ===== 🛡️ БАЗА ДАННЫХ ДОСПЕХОВ И БРОНИ (ARMOR_DATABASE) =====
// ============================================================================
window.ARMOR_DATABASE = {
  'leather_cap': { name: 'Кожаная шапка', icon: '🪖', slotType: 'head', price: 20, level: 1, desc: 'Легкая защита для головы. Повышает увертливость.', bonus: { def: 1, stats: { agility: 1 }, mf_inv: 15 } },
  'leather_armor': { name: 'Кожаная куртка', icon: '👕', slotType: 'body', price: 30, level: 2, desc: 'Плотная кожа. Защищает от критических ударов.', bonus: { def: 4, stats: { endurance: 1 }, mf_anticrit: 20 } },
  'leather_boots': { name: 'Кожаные сапоги', icon: '🥾', slotType: 'legs', price: 18, level: 1, desc: 'Удобная обувь, позволяющая легко уходить от чужих атак.', bonus: { def: 1, stats: { agility: 2 }, mf_inv: 25 } },
  'leather_gloves': { name: 'Кожаные перчатки', icon: '🧤', slotType: 'gloves', price: 15, level: 2, desc: 'Улучшают хват оружия, мешая врагам уворачиваться.', bonus: { def: 1, stats: { strength: 1 }, mf_antiinv: 15 } }
};
// ============================================================================
// ===== 💍 БАЗА ДАННЫХ БИЖУТЕРИИ (JEWELRY_DATABASE) =====
// ============================================================================
window.JEWELRY_DATABASE = {
  'copper_ring': { name: 'Медное кольцо', icon: '💍', slotType: 'ring', price: 25, level: 1, desc: 'Простенькое кольцо, оберегающее от случайных критов.', bonus: { stats: { endurance: 1 }, mf_anticrit: 10 } },
  'wolf_amulet': { name: 'Амулет Волка', icon: '📿', slotType: 'neck', price: 60, level: 3, desc: 'Клык дикого волка. Разжигает боевую ярость.', bonus: { stats: { strength: 2, luck: 1 }, mf_crit: 15 } },
  'lucky_ring': { name: 'Кольцо Фортуны', icon: '🪙', slotType: 'ring', price: 75, level: 3, desc: 'Значительно увеличивает шанс критического удара.', bonus: { stats: { luck: 3 }, mf_crit: 30 } },
  'ruby_ring': { name: 'Рубиновое кольцо', icon: '💎', slotType: 'ring', price: 80, level: 5, desc: 'Массивный рубин. Помогает пробивать уворотчиков.', bonus: { stats: { strength: 3 }, mf_antiinv: 25 } }
};
/**
 * Глобальная утилита для поиска характеристик предмета по его ID во всех базах данных.
 * @param {string} itemId - Уникальный идентификатор предмета (например, 'iron_sword')
 * @returns {Object|null} Объект с данными предмета или null, если предмет не найден
 */
window.getItemData = function(itemId) {
  if (!itemId) return null;

  // Поочередно проверяем каждую из пяти специализированных баз данных
  if (window.WEAPON_DATABASE && window.WEAPON_DATABASE[itemId]) {
    return window.WEAPON_DATABASE[itemId];
  }
  
  if (window.ARMOR_DATABASE && window.ARMOR_DATABASE[itemId]) {
    return window.ARMOR_DATABASE[itemId];
  }
  
  if (window.JEWELRY_DATABASE && window.JEWELRY_DATABASE[itemId]) {
    return window.JEWELRY_DATABASE[itemId];
  }
  
  if (window.CONSUMABLE_DATABASE && window.CONSUMABLE_DATABASE[itemId]) {
    return window.CONSUMABLE_DATABASE[itemId];
  }
  
  if (window.RESOURCE_DATABASE && window.RESOURCE_DATABASE[itemId]) {
    return window.RESOURCE_DATABASE[itemId];
  }

  // Если прошлись по всем базам и ничего не нашли, выводим предупреждение и возвращаем null
  console.warn(`⚠️ Предмет с ID "${itemId}" не найден ни в одной базе данных.`);
  return null;
};

// ============================================================================
// ===== 🧪 БАЗА ДАННЫХ РАСХОДНИКОВ И РЕСУРСОВ (ITEMS_DATABASE) =====
// ============================================================================
// Сюда вынесем то, что нельзя надеть, но можно съесть или использовать в крафте
window.CONSUMABLE_DATABASE = {
  'hp_potion_small': { name: 'Малое зелье HP', icon: '🧪', heal: 25, price: 8, desc: 'Восстанавливает 25 единиц здоровья.' },
  'hp_potion_big':   { name: 'Большое зелье HP', icon: '🍯', heal: 60, price: 20, desc: 'Восстанавливает 60 единиц здоровья.' },
  'fish_soup':       { name: 'Уха из таверны', icon: '🥣', heal: 40, price: 15, desc: 'Ароматный суп. Восстанавливает 40 HP.' },
  'blessing_scroll': { name: 'Свиток Удачи', icon: '📜', duration: 3, price: 50, desc: 'Древний свиток. Увеличивает шанс редкого лута.' }
};

window.RESOURCE_DATABASE = {
  'iron_ore':      { name: 'Железная руда', icon: '🪨', price: 3, desc: 'Необработанный кусок руды. Нужен для ковки.' },
  'coal':          { name: 'Уголь', icon: '🪵', price: 2, desc: 'Горючий камень. Используется как топливо в кузнице.' },
  'wood':          { name: 'Древесина', icon: '🌲', price: 2, desc: 'Крепкие поленья для крафта щитов и рукоятей.' },
  'raw_fish':      { name: 'Сырая рыба', icon: '🐟', price: 4, desc: 'Свежевыловленная рыба. Можно выгодно продать.' },
  'magic_crystal': { name: 'Магический кристалл', icon: '💎', price: 25, desc: 'Редкий светящийся осколок, полный энергии.' }
};

// 👹 5. База данных монстров и противников
window.MONSTER_DATABASE = {
  'wild_wolf': { name: 'Дикий волк', icon: '🐺', level: 1, stats: { strength: 8, agility: 12, endurance: 8, luck: 8 }, rewardXp: 15, rewardGold: 10 },
  'goblin': { name: 'Гоблин-грабитель', icon: '👺', level: 3, stats: { strength: 12, agility: 15, endurance: 10, luck: 15 }, rewardXp: 40, rewardGold: 35 },
  'stone_golem': { name: 'Каменный голем', icon: '🪨', level: 5, stats: { strength: 25, agility: 5, endurance: 25, luck: 5 }, rewardXp: 100, rewardGold: 50 }
};
// ============================================================================
// ===== 🛒 БАЗА ДАННЫХ АССОРТИМЕНТА МАГАЗИНА (SHOP_DATABASE) =====
// ============================================================================
// Этот объект определяет, какие именно предметы из общих баз данных будут
// выставлены на продажу в лавке торговца, и задает их розничную цену.

window.SHOP_DATABASE = {
  // ⚔️ Разделы оружия, брони и бижутерии считываются магазином из массива 'equipment'
  equipment: [
    // --- Витрина оружия и щитов ---
    { id: 'rusty_sword',    price: 10 },
    { id: 'iron_sword',     price: 45 },
    { id: 'steel_mace',     price: 90 },
    { id: 'heavy_halberd',  price: 120 },
    { id: 'wooden_shield',  price: 15 },

    // --- Витрина доспехов и брони ---
    { id: 'leather_cap',    price: 20 },
    { id: 'leather_armor',  price: 30 },
    { id: 'leather_boots',  price: 18 },
    { id: 'leather_gloves', price: 15 },

    // --- Витрина бижутерии и колец ---
    { id: 'wolf_amulet',    price: 60 },
    { id: 'copper_ring',    price: 25 },
    { id: 'ruby_ring',      price: 80 },
    { id: 'lucky_ring',     price: 75 }
  ],

  // 🧪 Зелья, еда и свитки считываются магазином из массива 'consumables'
  consumables: [
    { id: 'hp_potion_small', price: 8 },
    { id: 'hp_potion_big',   price: 20 },
    { id: 'fish_soup',       price: 15 }
  ],

  // 💎 Ресурсы, которые торговец продает искателям приключений (для будущих систем крафта)
  resources: [
    { id: 'coal', price: 5 },
    { id: 'wood', price: 4 }
  ]
};