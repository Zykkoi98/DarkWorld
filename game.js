// ============================================================================
// ===== ЧАСТЬ 1: СОСТОЯНИЕ ИГРЫ, РАСЧЕТ ХАРАКТЕРИСТИК И СОЗДАНИЕ ГЕРОЯ =====
// ============================================================================

window.player = null; // Глобальный объект игрока для сквозного доступа из всех файлов
let currentTab = 'equipment'; // Текущая активная вкладка в инвентаре

// Утилита генерации случайных чисел
window.rand = function(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Расчет лимита опыта для следующего уровня
function xpToNext(level) {
  const nextLevel = level + 1;
  if (nextLevel < window.XP_TABLE.length) {
    return window.XP_TABLE[nextLevel];
  }
  return nextLevel * 1000; 
}
// Расчет характеристик
function getEquipmentBonus(playerData, bonusKey) {
  if (!playerData.equipped) return 0;
  let totalBonus = 0;

  const slots = ['head', 'body', 'legs', 'gloves', 'neck', 'mainHand', 'offHand', 'extra'];
  slots.forEach(slot => {
    const itemId = playerData.equipped[slot];
    if (itemId) {
      const itemData = window.getItemData(itemId);
      if (itemData && itemData.bonus) {
        if (itemData.bonus[bonusKey] !== undefined) totalBonus += itemData.bonus[bonusKey];
        if (itemData.bonus.stats && itemData.bonus.stats[bonusKey] !== undefined) {
          totalBonus += itemData.bonus.stats[bonusKey];
        }
      }
    }
  });

  if (playerData.equipped.rings && Array.isArray(playerData.equipped.rings)) {
    playerData.equipped.rings.forEach(itemId => {
      if (itemId) {
        const itemData = window.getItemData(itemId);
        if (itemData && itemData.bonus) {
          if (itemData.bonus[bonusKey] !== undefined) totalBonus += itemData.bonus[bonusKey];
          if (itemData.bonus.stats && itemData.bonus.stats[bonusKey] !== undefined) {
            totalBonus += itemData.bonus.stats[bonusKey];
          }
        }
      }
    });
  }
  return totalBonus;
}

window.getAtk = function(playerData) {
  const totalStrength = playerData.stats.strength + getEquipmentBonus(playerData, 'strength');
  const baseAtk = Math.floor(2 + (totalStrength * 1.5));
  const weaponAtk = getEquipmentBonus(playerData, 'atk');
  return baseAtk + weaponAtk;
};

window.getDef = function(playerData) {
  const totalEndurance = playerData.stats.endurance + getEquipmentBonus(playerData, 'endurance');
  const baseDef = Math.floor(totalEndurance * 0.5); 
  const armorDef = getEquipmentBonus(playerData, 'def');
  return baseDef + armorDef;
};

window.getMaxHp = function(playerData) {
  const totalEndurance = playerData.stats.endurance + getEquipmentBonus(playerData, 'endurance');
  const armorHp = getEquipmentBonus(playerData, 'hp');
  return (totalEndurance * 10) + armorHp;
};

// ============================================================================
// ===== 👤 СТАНДАРТНЫЙ КОНСТРУКТОР СТАРТОВОГО ПЕРСОНАЖА (НОВИЧОК) =====
// ============================================================================
function createPlayer() {
  // Пытаемся вытянуть реальные данные пользователя из WebApp Telegram
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  
  const name = tgUser?.first_name || 'Новичок';
  const uniqueId = tgUser?.id || 0; // Настоящий ID запишется при первой синхронизации в loadGame

  // Генерируем чистый профиль 1-го уровня для записи в Supabase
  const newPlayer = {
    id: uniqueId,
    name: name,
    avatar: window.DEFAULT_AVATAR || 'assets/default_hero.png',
    level: 1, 
    xp: 0, 
    gold: 50, // Стартовые монеты новичка
    currentTownIndex: 0, 
    statPoints: 5, // Свободные очки для распределения характеристик
    stats: { 
      strength: 10, 
      agility: 10, 
      endurance: 10, 
      intellect: 10, 
      luck: 10 
    },
    inventory: { equipment: [], resources: [], consumables: [] },
    equipped: {
      head: null, body: null, legs: null, neck: null, gloves: null,
      mainHand: 'rusty_sword', offHand: null, potion: 'hp_potion_small', scroll: null,
      rings: [null, null, null] 
    }
  };

  // Стартовое здоровье: базовая выносливость умноженная на 10 (10 * 10 = 100 HP)
  newPlayer.hp = newPlayer.stats.endurance * 10;

  // Если функция расчета максимального здоровья еще не объявлена, создаем резервную
  if (!window.getMaxHp) {
    window.getMaxHp = function(p) { return (p?.stats?.endurance || 10) * 10; };
  }

  return newPlayer;
}

// Функция пересчета и проверки изменения уровня (БЕЗ сброса HP при загрузке)
window.checkLevelUp = function(isInitialLoad = false) {
  let changed = false; 
  let leveledDown = false;
  
  // Проверяем повышение уровня
  while (window.player.xp >= xpToNext(window.player.level)) {
    window.player.level++; 
    window.player.statPoints += 5;
    // Восстанавливаем HP только если это реальный левелап в игре, а не загрузка страницы
    if (!isInitialLoad) {
      window.player.hp = window.getMaxHp(window.player);
    }
    changed = true;
  }

  // Проверяем понижение уровня (если применимо)
  while (window.player.level > 1 && window.player.xp < window.XP_TABLE[window.player.level]) {
    window.player.level--; 
    leveledDown = true; 
    changed = true;
  }

  if (leveledDown) {
    window.player.stats = { strength: 10, agility: 10, endurance: 10, intellect: 10, luck: 10 };
    window.player.statPoints = 5 + ((window.player.level - 1) * 5);
    const maxHp = window.getMaxHp(window.player);
    if (window.player.hp > maxHp) window.player.hp = maxHp;
  }

  if (changed && !isInitialLoad) {
    saveGame({ player: window.player }); 
    render();
    const modal = document.getElementById('profile-modal');
    if (modal && modal.classList.contains('active')) window.openProfile();
  }
};
// ============================================================================
// ===== ЧАСТЬ 2: ЛОГИКА ГОРОДОВ, ИНВЕНТАРЯ И БЕЗОПАСНЫЕ СЛУШАТЕЛИ КЛИКОВ =====
// ============================================================================

// 🔥 ИСПРАВЛЕННАЯ ФУНКЦИЯ ОТРИСОВКИ ГЛАВНОГО ЭКРАНА
function render() {
  if (!window.player) return;

  // Безопасно обновляем аватар игрока
  const avatarEl = document.getElementById('player-avatar');
  if (avatarEl) {
    const avatarValue = window.player.avatar || '👤';

    // ЕСЛИ это ссылка на картинку (содержит расширение или слеш)
    if (avatarValue.includes('.') || avatarValue.includes('/')) {
      avatarEl.src = avatarValue;
    } else {
      // 🔥 ФИКС БАГА: Если в базе лежит текстовый эмодзи (например 👤), 
      // мы НЕ пихаем его в src картинки, а подставляем стандартную иконку-заглушку,
      // которую ты использовал по умолчанию в проекте (window.DEFAULT_AVATAR)
      avatarEl.src = window.DEFAULT_AVATAR || 'assets/default_hero.png'; 
    }
  }

  // Обновляем имя и уровень персонажа на экране
  if (document.getElementById('player-name')) document.getElementById('player-name').textContent = window.player.name;
  if (document.getElementById('player-lvl-badge')) document.getElementById('player-lvl-badge').textContent = `Lv. ${window.player.level}`;
  
  // Расчет и вывод здоровья
  const mainHpText = document.getElementById('player-hp-text') || document.getElementById('player-hp');
  if (mainHpText) {
    mainHpText.textContent = `❤️ ${window.player.hp} / ${window.getMaxHp(window.player)}`;
  }

  renderTown(); // Перерисовываем локации города
}

function renderTown() {
  const town = window.TOWNS[window.player.currentTownIndex];
  document.getElementById('current-town-name').textContent = town.name;
  const grid = document.getElementById('town-locations'); grid.innerHTML = '';
  
  town.locations.forEach(loc => {
  const btn = document.createElement('button'); btn.className = 'loc-btn';
  btn.innerHTML = `<span>${loc.icon}</span><span>${loc.name}</span>`;
  btn.addEventListener('click', function() {
      if (loc.name === "Выход на природу") {
      let target = 'wild_wolf';
      if (window.player.level >= 3 && window.player.level < 5) target = 'goblin';
      else if (window.player.level >= 5) target = 'stone_golem';
      if (typeof window.openServerPve === 'function') {
      window.openServerPve(target); // Вызов PvE через сервер Node.js
      } else {
      console.error("Сетевой модуль не подключен!");
      }
      } else if (loc.name === "Магазин") {
      if (typeof window.openShop === 'function') {
        window.openShop();
      } else {
        console.error("❌ Ошибка: Функция openShop не найдена!");
      }
      } else if (loc.name === "Арена PvP") {
      // <-- ДОБАВИЛИ ЭТОТ БЛОК ДЛЯ СВЯЗИ С СЕРВЕРОМ
      if (typeof window.openServerPvp === 'function') {
        window.openServerPvp(); 
      } else {
        console.error("❌ Ошибка: Модуль client_pvp.js не подключен к index.html!");
      }
      } else { 
        alert(`Вы зашли в здание: ${loc.name}`); 
      }
    });
    grid.appendChild(btn);
  });

  const travelBtn = document.createElement('button'); travelBtn.className = 'loc-btn';
  const nextIdx = window.player.currentTownIndex === 0 ? 1 : 0;
  travelBtn.innerHTML = `<span>🛒</span><span>В ${window.TOWNS[nextIdx].name}</span>`;
  travelBtn.addEventListener('click', function() {
    window.player.currentTownIndex = nextIdx; saveGame({ player: window.player }); render();
  });

  grid.appendChild(travelBtn);
}

window.upgradeStat = function(statName) {
  if (!window.player || window.player.statPoints <= 0) return;
  if (window.player.stats[statName] !== undefined) {
    window.player.stats[statName]++; window.player.statPoints--;
    if (statName === 'endurance') window.player.hp += 10;
    saveGame({ player: window.player }); render(); window.openProfile();
  }
};

window.openProfile = function() {
const modal = document.getElementById('profile-modal'); 
  if (!modal) return;
  modal.classList.add('active'); 
  modal.style.display = 'flex';
  let statsBody = modal.querySelector('.modal-body-stats'); 
  if (!statsBody) return;

  const labels = { strength: '💪 Сила', agility: '🏹 Ловкость', endurance: '🛡️ Выносливость', intellect: '🔮 Интеллект', luck: '🍀 Удача' };
  
  // Очищаем контейнер абсолютно безопасно
  statsBody.textContent = '';
  
  const nextXp = xpToNext(window.player.level);
  const currentXp = (window.player.xp !== undefined) ? window.player.xp : 0;

  // 🔥 ИСПРАВЛЕНИЕ: Гарантируем, что ХП в строке профиля всегда рассчитывается на лету
  const rowsData = [
    { label: '💰 Золото', value: `${window.player.gold} монет` },
    { label: '❤️ Здоровье', value: `${window.player.hp} / ${window.getMaxHp(window.player)}` }, // Пересчитывается честно со шмотом!
    { label: '✨ Опыт', value: `${currentXp}/${nextXp}` },
    { label: '⚔️ Атака', value: `${window.getAtk(window.player)}` },
    { label: '🛡️ Защита', value: `${window.getDef ? window.getDef(window.player) : 0} ед.` }
  ];

  // Генерируем строки общей информации
  rowsData.forEach(data => {
    const row = document.createElement('div'); row.className = 'profile-row';
    const lSpan = document.createElement('span'); lSpan.textContent = data.label;
    const vSpan = document.createElement('span'); vSpan.textContent = data.value;
    row.appendChild(lSpan); row.appendChild(vSpan); statsBody.appendChild(row);
  });

  // Заголовок доступных очков навыков
  const pointsDiv = document.createElement('div');
  pointsDiv.style.cssText = 'margin:15px 0 5px 0; font-weight:bold; font-size:16px; color:#f1c40f; text-align:center;';
  pointsDiv.textContent = `Доступно очков: ${window.player.statPoints}`;
  statsBody.appendChild(pointsDiv);

  // Разделительная линия
  const hr = document.createElement('hr');
  hr.style.cssText = 'border:0; border-top:1px solid rgba(255,255,255,0.1); margin:12px 0;';
  statsBody.appendChild(hr);

  // Генерируем строки базовых характеристик с безопасными кнопками «+»
  Object.keys(window.player.stats).forEach(key => {
    const row = document.createElement('div'); row.className = 'profile-row';
    const lSpan = document.createElement('span'); lSpan.textContent = labels[key];
    const vSpan = document.createElement('span'); vSpan.style.display = 'flex'; vSpan.style.alignItems = 'center'; vSpan.textContent = window.player.stats[key] + ' ';

    if (window.player.statPoints > 0) {
      const plusBtn = document.createElement('button'); plusBtn.textContent = '+';
      plusBtn.style.cssText = 'margin-left:12px; background:var(--btn); border:none; color:#fff; border-radius:6px; padding:3px 9px; font-weight:bold; cursor:pointer;';
      
      // Напрямую привязываем клик, обходя строковые вызовы
      plusBtn.addEventListener('click', function() { window.upgradeStat(key); });
      vSpan.appendChild(plusBtn);
    }
    row.appendChild(lSpan); row.appendChild(vSpan); statsBody.appendChild(row);
  });
};

window.closeProfile = function() {
  const modal = document.getElementById('profile-modal');
  if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
};

window.openInventory = function() {
  const modal = document.getElementById('inventory-modal');
  if (modal) { modal.classList.add('active'); modal.style.display = 'flex'; }
  renderInventory();
};

window.closeInventory = function() {
  const modal = document.getElementById('inventory-modal');
  if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
};

window.switchTab = function(tabName) {
  currentTab = tabName;
  document.querySelectorAll('.inv-tab').forEach(t => t.classList.remove('active'));
  const btn = document.getElementById(`tab-btn-${tabName}`); if (btn) btn.classList.add('active');
  renderInventory();
};

// ============================================================================
// ===== УЛУЧШЕННАЯ ОТРИСОВКА ИНВЕНТАРЯ С ДИНАМИЧЕСКИМИ СЛОТАМИ И ЛИМИТОМ =====
// ============================================================================

/**
 * Проверяет, есть ли свободное место в конкретной вкладке инвентаря.
 * Лимит по Варианту Б — максимум 30 уникальных слотов на вкладку.
 * @param {string} tabName - Название вкладки ('equipment', 'resources', 'consumables')
 * @param {string} itemId - ID добавляемого предмета
 * @returns {boolean} true, если место есть или предмет уже есть в рюкзаке и стакается
 */
window.hasInventorySpace = function(tabName, itemId) {
  if (!window.player || !window.player.inventory) return false;
  const items = window.player.inventory[tabName] || [];
  
  // Если предмет уже есть в рюкзаке, он займет тот же слот (увеличится count), место не тратится
  const exists = items.some(item => item.id === itemId || item.key === itemId);
  if (exists) return true;
  
  // Если предмета нет, проверяем, не достигнут ли лимит в 30 уникальных слотов
  return items.length < 30;
};

function renderInventory() {
  if (!window.player) return;

  // ============================================================================
  // ===== 🛡️ ЭТАП 1: ОБНОВЛЕНИЕ КУКЛЫ ПЕРСОНАЖА (11 ВЕРХНИХ СЛОТОВ) =====
  // ============================================================================
  
  // Словарь дефолтных эмодзи-подсказок для пустых ячеек
  const standardSlots = {
    head: '🪖', neck: '📿', gloves: '🧤', mainHand: '⚔️',
    body: '👕', legs: '🥾', extra: '✨', offHand: '🛡️'
  };

  // 1. Отрисовываем основные 8 одиночных слотов куклы
  Object.keys(standardSlots).forEach(slotKey => {
    const slotEl = document.getElementById(`eslot-${slotKey}`);
    if (!slotEl) return;

    const equippedItemId = window.player.equipped[slotKey];

    if (equippedItemId) {
      const itemData = window.getItemData(equippedItemId);
      if (itemData) {
        // 🔥 ВЕЩЬ НАДЕТА: Полностью перекрываем слот ярким сплошным кубом
        slotEl.textContent = itemData.icon;
        slotEl.style.background = '#222f3e'; // Плотный темный фон вместо прозрачного
        slotEl.style.border = '2px solid var(--btn)'; // Солидная фиолетовая рамка
        slotEl.style.borderRadius = '10px';
        slotEl.style.fontSize = '26px'; // Укрупняем эмодзи на всю ячейку
        slotEl.style.opacity = '1';
        slotEl.style.display = 'flex';
        slotEl.style.alignItems = 'center';
        slotEl.style.justifyContent = 'center';
        // Красивое внутреннее фиолетовое неоновое свечение (игровой эффект)
        slotEl.style.boxShadow = '0 4px 8px rgba(0,0,0,0.4), inset 0 0 10px rgba(108, 92, 231, 0.4)';
        slotEl.title = `${itemData.name}\n${itemData.desc || ''}`;
      }
    } else {
      // 💨 СЛОТ ПУСТОЙ: Возвращаем блеклый пунктирный стиль и фоновую подсказку
      slotEl.textContent = standardSlots[slotKey];
      slotEl.style.background = 'rgba(255, 255, 255, 0.03)';
      slotEl.style.border = '1px dashed rgba(255, 255, 255, 0.25)';
      slotEl.style.fontSize = '20px';
      slotEl.style.boxShadow = 'none';
      slotEl.title = 'Пустой слот';
    }
  });

  // 2. Отрисовываем 3 слота для колец (точно такая же логика замещения кубом)
  for (let i = 0; i < 3; i++) {
    const ringSlotEl = document.getElementById(`eslot-ring-${i}`);
    if (!ringSlotEl) continue;
    // 🧪 3. Отрисовываем боевые слоты: Банка (слева) и Свиток (справа) около колец
  const consumableSlots = { potion: '🧪', scroll: '📜' };
  
  Object.keys(consumableSlots).forEach(slotKey => {
    const slotEl = document.getElementById(`eslot-${slotKey}`);
    if (!slotEl) return;

    const equippedItemId = window.player.equipped[slotKey];

    if (equippedItemId) {
      const itemData = window.getItemData(equippedItemId);
      if (itemData) {
        // 🔥 ПРЕДМЕТ НАДЕТ: Полностью перекрываем слот ярким сплошным кубом
        slotEl.textContent = itemData.icon;
        slotEl.style.background = '#222f3e';
        slotEl.style.border = '2px solid #2ecc71'; // Подсветим зеленым для отличия от брони
        slotEl.style.borderRadius = '10px';
        slotEl.style.fontSize = '26px';
        slotEl.style.display = 'flex';
        slotEl.style.alignItems = 'center';
        slotEl.style.justifyContent = 'center';
        slotEl.style.boxShadow = '0 4px 8px rgba(0,0,0,0.4), inset 0 0 10px rgba(46, 204, 113, 0.3)';
        slotEl.title = `${itemData.name}\n${itemData.desc || ''}`;
      }
    } else {
      // 💨 СЛОТ ПУСТОЙ: Возвращаем фоновую подсказку
      slotEl.textContent = consumableSlots[slotKey];
      slotEl.style.background = 'rgba(255, 255, 255, 0.03)';
      slotEl.style.border = '1px dashed rgba(255, 255, 255, 0.25)';
      slotEl.style.fontSize = '20px';
      slotEl.style.boxShadow = 'none';
      slotEl.title = slotKey === 'potion' ? 'Слот под зелье' : 'Слот под свиток';
    }
  });
    const ringId = window.player.equipped.rings[i];

    if (ringId) {
      const itemData = window.getItemData(ringId);
      if (itemData) {
        // 🔥 КОЛЬЦО НАДЕТО: Заменяем слот сплошным ярким блоком
        ringSlotEl.textContent = itemData.icon;
        ringSlotEl.style.background = '#222f3e';
        ringSlotEl.style.border = '2px solid var(--btn)';
        ringSlotEl.style.borderRadius = '10px';
        ringSlotEl.style.fontSize = '26px';
        ringSlotEl.style.opacity = '1';
        ringSlotEl.style.display = 'flex';
        ringSlotEl.style.alignItems = 'center';
        ringSlotEl.style.justifyContent = 'center';
        ringSlotEl.style.boxShadow = '0 4px 8px rgba(0,0,0,0.4), inset 0 0 10px rgba(108, 92, 231, 0.4)';
        ringSlotEl.title = `${itemData.name}\n${itemData.desc || ''}`;
      }
    } else {
      // 💨 ПУСТОЙ СЛОТ ПОД КОЛЬЦО
      ringSlotEl.textContent = '💍';
      ringSlotEl.style.background = 'rgba(255, 255, 255, 0.03)';
      ringSlotEl.style.border = '1px dashed rgba(255, 255, 255, 0.25)';
      ringSlotEl.style.fontSize = '20px';
      ringSlotEl.style.boxShadow = 'none';
      ringSlotEl.title = 'Слот под кольцо';
    }
  }

  // Обновляем аватар внутри куклы инвентаря
  const invAvatar = document.getElementById('inv-hero-avatar');
  if (invAvatar) invAvatar.src = window.player.avatar || window.DEFAULT_AVATAR;


  // ============================================================================
  // ===== 🎒 ЭТАП 2: ДИНАМИЧЕСКАЯ ОТРИСОВКА СОДЕРЖИМОГО РЮКЗАКА (НИЗ) =====
  // ============================================================================
  const container = document.getElementById('inventory-content'); 
  if (!container) return;
  
  // Очищаем только нижнюю сетку рюкзака перед выводом вещей
  container.innerHTML = ''; 
  
  // Достаем массив предметов игрока для текущей активной вкладки
  const items = window.player.inventory[currentTab] || [];
  
  // 📊 Генерируем и выводим счетчик места для текущей вкладки (Лимит 30)
  const counterEl = document.createElement('div');
  counterEl.style.cssText = 'width: 100%; grid-column: 1 / -1; padding: 4px 8px; margin-bottom: 6px; font-size: 12px; font-weight: bold; color: var(--hint); display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05);';
  
  let tabTitle = 'Предметы';
  if (currentTab === 'equipment') tabTitle = '⚔️ Снаряжение';
  if (currentTab === 'resources') tabTitle = '💎 Материалы';
  if (currentTab === 'consumables') tabTitle = '🧪 Расходники';
  
  counterEl.innerHTML = `<span>${tabTitle}</span><span>Занято: ${items.length} / 30</span>`;
  container.appendChild(counterEl);

  // Если вещей в этой категории нет — пишем заглушку и выходим из функции
  if (items.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'inv-empty';
    emptyMsg.style.gridColumn = '1 / -1';
    emptyMsg.style.textAlign = 'center';
    emptyMsg.style.padding = '16px 0';
    emptyMsg.style.color = 'var(--hint)';
    emptyMsg.textContent = 'Здесь пока пусто...';
    container.appendChild(emptyMsg);
    return;
  }

  // Отрисовываем существующие предметы в рюкзаке один за другим
  items.forEach(item => {
    const slot = document.createElement('div'); 
    slot.className = 'inv-slot'; 
    slot.title = item.name; 
    slot.textContent = item.icon;
    slot.style.cssText = 'width: 70px; height: 60px; margin: 0; position: relative; font-size: 22px; cursor: pointer; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px;';
    
    // Если у предмета есть количество и оно больше 1, рисуем счетчик-цифру в углу
    if (item.count && item.count > 1) {
      const countEl = document.createElement('span'); 
      countEl.className = 'inv-count'; 
      countEl.textContent = item.count; 
      slot.appendChild(countEl);
    }
    
    // Навешиваем клик на предмет в рюкзаке для автоматического НАДЕВАНИЯ (из equipment.js)
    slot.addEventListener('click', function() {
      if (typeof window.equipItem === 'function') {
        window.equipItem(item.id);
      } else {
        console.error("❌ Ошибка: Функция equipItem не найдена в системе!");
      }
    });
    
    container.appendChild(slot);
  });
}

// ============================================================================
// ===== ЧАСТЬ 3.1: БЕЗОПАСНЫЕ КЛИКИ И ИНИЦИАЛИЗАЦИЯ ИНТЕРФЕЙСА =====
// ============================================================================

function initCSPEvents() {
  document.getElementById('player-avatar-slot')?.addEventListener('click', window.openProfile);
  document.getElementById('profile-close-btn')?.addEventListener('click', window.closeProfile);
  document.getElementById('profile-modal')?.addEventListener('click', function(e) { if (e.target.id === 'profile-modal') window.closeProfile(); });
  document.getElementById('inventory-toggle-btn')?.addEventListener('click', window.openInventory);
  document.getElementById('inventory-close-btn')?.addEventListener('click', window.closeInventory);
  document.getElementById('inventory-modal')?.addEventListener('click', function(e) { if (e.target.id === 'inventory-modal') window.closeInventory(); });
  
  ['equipment', 'resources', 'consumables'].forEach(tab => {
    document.getElementById(`tab-btn-${tab}`)?.addEventListener('click', function() { window.switchTab(tab); });
  });

  // Привязываем клики к 8 стандартным слотам куклы брони
  const equSlots = ['head', 'neck', 'gloves', 'mainHand', 'body', 'legs', 'extra', 'offHand'];
  equSlots.forEach(slotKey => {
    document.getElementById(`eslot-${slotKey}`)?.addEventListener('click', function() {
      if (window.player && window.player.equipped && window.player.equipped[slotKey]) {
        window.unequipItem(slotKey);
      }
    });
  });

  // Привязываем клики к 3 слотам под кольца
  for (let i = 0; i < 3; i++) {
    document.getElementById(`eslot-ring-${i}`)?.addEventListener('click', function() {
      if (window.player && window.player.equipped && window.player.equipped.rings && window.player.equipped.rings[i]) {
        window.unequipItem('ring', i);
      }
    });
  }

  // Привязываем клики к боевым расходникам (зелья/свитки)
  ['potion', 'scroll'].forEach(slotKey => {
    document.getElementById(`eslot-${slotKey}`)?.addEventListener('click', function() {
      if (window.player && window.player.equipped && window.player.equipped[slotKey]) {
        window.unequipItem(slotKey);
      }
    });
  });
}

// ============================================================================
// ===== 🏁 ГЛАВНОЕ ЯДРО: ПОЛНАЯ ФУНКЦИЯ ЗАПУСКА ИГРЫ С АВТО-ВОССТАНОВЛЕНИЕМ =====
// ============================================================================

// ============================================================================
// ===== ЧАСТЬ 3.2: ГЛАВНОЕ ЯДРО С ВЫЗОВОМ ЗАГРУЗКИ И АВТО-ВОССТАНОВЛЕНИЕМ =====
// ============================================================================

/// ============================================================================
// ===== 🏁 ГЛАВНОЕ ЯДРО: ЧИСТЫЙ ЗАПУСК ИГРЫ И ПОДКЛЮЧЕНИЕ СЕТИ =====
// ============================================================================

/**
 * Основная точка входа в игру.
 * Запускает загрузку данных из Supabase, рендерит город и поднимает сокеты Арены.
 */
function startGame() {
  console.log("🚀 Инициализация ядра игры...");

  // Инициализируем безопасные CSP-слушатели кликов по кнопкам и вкладкам
  if (typeof initCSPEvents === 'function') initCSPEvents();

  // Делаем честный вызов загрузки из базы данных
  if (typeof window.loadGame === 'function') {
    window.loadGame((error) => {
      if (error) {
        console.error("❌ Критическая ошибка при загрузке прогресса персонажа:", error);
        return;
      }

      // Страховка: если объект игрока почему-то пуст, вызываем базовый конструктор
      if (!window.player) {
        console.log("⚠️ Профиль игрока пуст в памяти. Вызываем createPlayer()...");
        window.player = createPlayer();
      }

      // Сверяем опыт и уровень на случай левелапа при загрузке
      if (typeof window.checkLevelUp === 'function') {
        window.checkLevelUp(true);
      }

      // Отрисовываем главный мирный экран города и полоску здоровья
      if (typeof render === 'function') {
        render();
      }

      console.log(`✅ ИГРА ГОТОВА. Персонаж: ${window.player.name}, Настоящий ID: ${window.player.id}`);

      // 🔥 ПОДКЛЮЧАЕМ ВЕБ-СОКЕТЫ ДЛЯ АРЕНЫ И PvE ПОЕДИНКОВ
      if (typeof initSocketConnection === 'function') {
        initSocketConnection();
        console.log("📡 Сетевой модуль Socket.io успешно запущен.");
      } else {
        console.error("❌ Критическая ошибка: Функция initSocketConnection не найдена в client_pvp.js!");
      }

      // 🔥 ХЕНДЛЕР F5: Опрашиваем бэкенд на наличие активной комнаты боя
      setTimeout(() => {
        if (socket && window.player && window.player.id) {
          console.log(`🔍 Проверка ОЗУ сервера: ищем активные бои для игрока ID ${window.player.id}...`);
          socket.emit('check_active_battle', { userId: window.player.id });
        }
      }, 50);

    });
  } else {
    console.error("❌ Критическая ошибка: Функция loadGame не объявлена в telegram_supabase.js!");
  }
}

// 🔥 ЖЕСТКИЙ ФИКС ЗАПУСКА: Запускаем игру только после полной прогрузки всех файлов и окон в Telegram
window.addEventListener('DOMContentLoaded', () => {
  // Даем микро-паузу в 50мс для железобетонной инициализации объектов Supabase и Telegram
  setTimeout(() => {
    startGame();
  }, 50);
});
// ============================================================================
// ===== ⏰ АВТО-БУДИЛЬНИК ДЛЯ БЕСПЛАТНОГО СЕРВЕРА RENDER =====
// ============================================================================
function wakeUpServer() {
  // 🔥 ОБЯЗАТЕЛЬНО замени эту заглушку на реальную ссылку, которую выдаст Render!
  const SERVER_URL = "https://darkworld-server.onrender.com";
  
  // Просто «стучимся» к серверу, чтобы он не спал
  fetch(SERVER_URL)
    .then(() => console.log("⏰ Будильник: Боевой сервер успешно разбужен!"))
    .catch((e) => console.warn("Сервер просыпается или ответил на пинг"));
}

// Главный триггер старта игры (совмещаем запуск RPG и пробуждение сервера)
window.addEventListener('DOMContentLoaded', () => {
  // 1. Сразу будим сервер в фоне, пока игрок смотрит на экран города
  wakeUpServer();
  
  // 2. Твой стандартный запуск ядра игры
  if (typeof startGame === 'function') {
    startGame();
  }
});