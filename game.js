// ============================================================================
// ===== ЧАСТЬ 1: СОСТОЯНИЕ ИГРЫ, РАСЧЕТ ХАРАКТЕРИСТИК И СОЗДАНИЕ ГЕРОЯ =====
// ============================================================================

window.player = null; // Глобальный объект игрока для сквозного доступа из всех файлов
let currentTab = 'equipment'; // Текущая активная вкладка в инвентаре

// Утилита генерации случайных чисел
window.rand = function(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Жестко и явно объявляем функцию на объекте window
window.getCorrectLevelByXp = function(xp) {
  if (!window.XP_TABLE || !Array.isArray(window.XP_TABLE)) {
    console.error("❌ XP_TABLE не найден в window!");
    return 1;
  }
  // Идем с конца таблицы опыта к началу
  for (let lvl = window.XP_TABLE.length - 1; lvl >= 1; lvl--) {
    if (xp >= window.XP_TABLE[lvl]) {
      return lvl; 
    }
  }
  return 1;
};

// Расчет лимита опыта для следующего уровня
function xpToNext(level) {
  const nextLevel = level + 1;
  if (nextLevel < window.XP_TABLE.length) {
    return window.XP_TABLE[nextLevel];
  }
  return nextLevel * 1000; 
}

// Расчет характеристик от экипировки
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
// ===== 👤 СТАНДАРТНЫЙ КОНСТРУКТОР СТАРТОВОГО ПЕРСОНАЖА (БАЗА СТАТОВ = 1) =====
// ============================================================================
function createPlayer() {
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  const name = tgUser?.first_name || 'Новичок';
  const uniqueId = tgUser?.id || 0; 

  const newPlayer = {
    id: uniqueId,
    name: name,
    avatar: window.DEFAULT_AVATAR || 'assets/avatars/hero5.jpg',
    level: 1, 
    xp: 0, 
    gold: 50, 
    currentTownIndex: 0, 
    statPoints: 5, 
    stats: { 
      strength: 1, 
      agility: 1, 
      endurance: 1, 
      intellect: 1, 
      luck: 1 
    },
    inventory: { equipment: [], resources: [], consumables: [] },
    equipped: {
      head: null, body: null, legs: null, neck: null, gloves: null,
      mainHand: 'rusty_sword', offHand: null, potion: 'hp_potion_small', scroll: null,
      rings: [null, null, null] 
    }
  };

  newPlayer.hp = newPlayer.stats.endurance * 10;
  return newPlayer;
}

// 🔥 ФИНАЛЬНАЯ ИСПРАВЛЕННАЯ ФУНКЦИЯ ПРОВЕРКИ УРОВНЕЙ И СВОБОДНЫХ ОЧКОВ
window.checkLevelUp = function(isInitialLoad = false) {
  if (!window.player) return;

  // 1. Вычисляем правильный уровень на основе текущего опыта
  const correctLevel = window.getCorrectLevelByXp(window.player.xp);
  
// 👇 ПОЛНОСТЬЮ УДАЛИ ИЛИ ЗАКОММЕНТИРУЙ ЭТОТ КУСОК КОДА:
/*
const monitor = document.getElementById('tg-debug-monitor');
if (monitor) {
  const logRow = document.createElement('div');
  logRow.style.marginBottom = '3px';
  logRow.innerHTML = `[F5] Опыт: ${window.player.xp} | Ур. в памяти: <span style="color:#fff">${window.player.level}</span> | Должен быть: <span style="color:#f1c40f">${correctLevel}</span>`;
  monitor.appendChild(logRow);
  monitor.scrollTop = monitor.scrollHeight;
}
*/

  // ============================================================================
  // 🛡️ ГЛОБАЛЬНЫЙ УМНЫЙ СБРОС СТАРЫХ СЕЙВОВ И АНТИЧИТ
  // ============================================================================
 /* if (window.player.stats) {
    const p = window.player;
    const str = Number(p.stats.strength || 1);
    const agi = Number(p.stats.agility || 1);
    const end = Number(p.stats.endurance || 1);
    const int = Number(p.stats.intellect || 1);
    const lck = Number(p.stats.luck || 1);

    // Считаем сумму распределенных в характеристики очков (вычитаем 5 базовых единиц)
    const distributedPoints = (str + agi + end + int + lck) - 5;
    
    // Текущие свободные очки игрока в памяти
    const currentStatPoints = Number(p.statPoints || 0);
    
    // Вычисляем, какой максимум очков ВООБЩЕ легален для этого правильного уровня (correctLevel)
    const maxLegalTotalPoints = 5 + ((correctLevel - 1) * 5);

    // Если у игрока накрутка статов или старые десятки (str === 10), сбрасываем в лимит уровня
    if ((distributedPoints + currentStatPoints > maxLegalTotalPoints) || (str === 10)) {
      console.warn(`🚨 МИГРАЦИЯ: Обнаружены старые статы или превышение лимита. Сброс на базу 1.`);
      p.stats = { strength: 1, agility: 1, endurance: 1, intellect: 1, luck: 1 };
      p.statPoints = maxLegalTotalPoints; // Сбрасываем ровно до нормы (например, 30 очков для 6 лвл)
      p.hp = 10; 
      if (window.saveGame) window.saveGame({ player: p });
    }
  }*/
  // ============================================================================

  // 2. Логика изменения уровня персонажа (и при загрузке, и после боя)
  if (window.player.level !== correctLevel) {
    const oldLevel = window.player.level;
    const isLeveledDown = oldLevel > correctLevel;
    
    window.player.level = correctLevel;

    // 🔥 ФИКС БАГА РУЧНОЙ ПРАВКИ ОПЫТА:
    // Если уровень вырос (неважно, при загрузке F5 или после победы в бою), 
    // мы вычисляем разницу уровней и честно ДОНАЧИСЛЯЕМ по +5 очков за каждый новый левел!
    if (!isLeveledDown) {
      const levelsGained = correctLevel - oldLevel;
      window.player.statPoints = (window.player.statPoints || 0) + (levelsGained * 5);
      
      // Полностью восстанавливаем здоровье, так как уровень персонажа повысился
      window.player.hp = window.getMaxHp(window.player);
    } else {
      // На случай штрафного понижения уровня
      window.player.stats = { strength: 1, agility: 1, endurance: 1, intellect: 1, luck: 1 };
      window.player.statPoints = 5 + ((correctLevel - 1) * 5);
    }

    const maxHp = window.getMaxHp(window.player);
    if (window.player.hp > maxHp) window.player.hp = maxHp;

    // Мгновенно синхронизируем начисленные очки с локальным кэшем и Supabase
    if (window.saveGame) window.saveGame({ player: window.player });
  }

  // Отрисовка интерфейса
  if (typeof render === 'function') render();
  const modal = document.getElementById('profile-modal');
  if (modal && modal.classList.contains('active')) window.openProfile();
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
      avatarEl.src = window.DEFAULT_AVATAR || 'assets/avatars/hero5.jpg'; 
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
  // Защита А: Проверяем, жив ли персонаж
  if (!window.player || window.player.hp <= 0) {
    return alert("❌ Вы слишком слабы для боя! Восстановите здоровье в Таверне.");
  }

  // Защита Б: Если в памяти города висит флаг, что бой уже идет, не даем спамить кнопку
  if (window.player.in_battle) {
    console.warn("⚠️ Вы уже находитесь в активном бою! Перенаправляем на арену...");
    window.location.href = `battle/battle.html`;
    return;
  }

  // Если всё чисто, генерируем стандартный легальный запуск монстров
  let targetMonster = 'wild_wolf';
  let minCount = 1; let maxCount = 1;

  if (window.player.level >= 3 && window.player.level < 5) {
    targetMonster = 'goblin'; minCount = 1; maxCount = 2;
  } else if (window.player.level >= 5) {
    targetMonster = 'stone_golem'; minCount = 1; maxCount = 3;
  }

  const finalCount = Math.floor(Math.random() * (maxCount - minCount + 1)) + minCount;

  // Очищаем сокет города и таймеры перед уходом, чтобы избежать фонового спама
  if (window.socket) {
    try { window.socket.disconnect(); } catch(e) {}
  }
  for (let i = 1; i < 100; i++) { window.clearInterval(i); window.clearTimeout(i); }

  // Переходим во вкладку боя
  window.location.href = `battle/battle.html?monster=${targetMonster}&count=${finalCount}`;
} else if (loc.name === "Магазин") {
      if (typeof window.openShop === 'function') {
        window.openShop();
      } else {
        console.error("❌ Ошибка: Функция openShop не найдена!");
      }
      } else if (loc.name === "Арена PvP") {
      console.log("🔗 Разворачиваю тактический фрейм Арены...");
      
      const wrapper = document.getElementById('arena-iframe-wrapper');
      const frame = document.getElementById('arena-iframe-frame');
      
      if (wrapper && frame) {
        frame.src = 'arena.html'; // Загружаем страницу локально внутри родителя
        wrapper.style.display = 'block'; // Мгновенно показываем экран Арены
      }} else { 
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
  
  // Проверяем, что сокет активен
  if (window.socket && window.socket.connected) {
    console.log(`📡 Отправка серверного запроса на прокачку стата: ${statName}`);
    
    // Отправляем сигнал бэкенду. Он сам все проверит, прибавит и вернет нам
    // обновленный профиль через существующий слушатель 'load_game_success'
    window.socket.emit('upgrade_stat_secure', {
      userId: window.player.id,
      statName: statName
    });
  } else {
    alert("⚠️ Нет стабильного соединения с сервером! Попробуйте позже.");
  }
};

// Инициализируем глобальные буферы для временного хранения кликов
window._tempStatDistribution = { strength: 0, agility: 0, endurance: 0, intellect: 0, luck: 0 };
window._tempStatPoints = 0;

// Функции для локального клика ПЛЮС и МИНУС
window.stepTempStat = function(statName, operation) {
  if (operation === 'plus') {
    if (window._tempStatPoints <= 0) return;
    window._tempStatDistribution[statName]++;
    window._tempStatPoints--;
  } else if (operation === 'minus') {
    if (window._tempStatDistribution[statName] <= 0) return;
    window._tempStatDistribution[statName]--;
    window._tempStatPoints++;
  }
  
  // Мгновенно перерисовываем профиль локально без лагов
  window.openProfile();
};

window.submitStatDistribution = function() {
  if (window.socket && window.socket.connected) {
    const confirmBtn = document.getElementById('stat-save-btn');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = '⏳ Сохранение в облаке...';
    }
    console.log(`📡 Отправка статов:`, window._tempStatDistribution);
    window.socket.emit('confirm_stat_distribution_secure', {
      userId: window.player.id,
      distribution: window._tempStatDistribution
    });
  } else {
    alert("⚠️ Ошибка: Нет соединения с сервером!");
  }
};
// 🔥 СБРОСИТЬ БУФЕР ПРИ ЗАКРЫТИИ ИЛИ ОБНОВЛЕНИИ ОКНА
function resetStatBuffer() {
  window._tempStatDistribution = { strength: 0, agility: 0, endurance: 0, intellect: 0, luck: 0 };
  window._tempStatPoints = window.player ? window.player.statPoints : 0;
}

// Переписываем функцию открытия профиля
window.openProfile = function() {
  const modal = document.getElementById('profile-modal'); 
  if (!modal) return;
  
  // Если окно открывается впервые (а не обновляется от клика), синхронизируем буфер очков
  if (modal.style.display !== 'flex') {
    resetStatBuffer();
  }

  modal.classList.add('active'); 
  modal.style.display = 'flex';
  let statsBody = modal.querySelector('.modal-body-stats'); 
  if (!statsBody) return;

  const labels = { 
    strength: '💪 Сила', 
    agility: '🏹 Ловкость', 
    endurance: '🛡️ Выносливость', 
    intellect: '🔮 Интеллект', 
    luck: '🍀 Удача' 
  };
  
  statsBody.textContent = '';
  
  const nextXp = xpToNext(window.player.level);
  const currentXp = (window.player.xp !== undefined) ? window.player.xp : 0;

  // Блок общей информации
  const rowsData = [
    { label: '💰 Золото', value: window.player.gold + ' монет' },
    { label: '❤️ Здоровье', value: window.player.hp + ' / ' + window.getMaxHp(window.player) }, 
    { label: '✨ Опыт', value: currentXp + '/' + nextXp },
    { label: '⚔️ Атака', value: window.getAtk(window.player) + '' },
    { label: '🛡️ Защита', value: (window.getDef ? window.getDef(window.player) : 0) + ' ед.' }
  ];

  rowsData.forEach(data => {
    const row = document.createElement('div'); 
    row.className = 'profile-row';
    row.innerHTML = `<span>${data.label}</span><span>${data.value}</span>`;
    statsBody.appendChild(row);
  });

  // Строка со свободными очками характеристик (показываем виртуальный остаток)
  const pointsDiv = document.createElement('div');
  pointsDiv.style.cssText = 'margin:15px 0 5px 0; font-weight:bold; font-size:16px; color:#f1c40f; text-align:center;';
  pointsDiv.textContent = 'Доступно очков: ' + window._tempStatPoints;
  statsBody.appendChild(pointsDiv);

  const hr = document.createElement('hr');
  hr.style.cssText = 'border:0; border-top:1px solid rgba(255,255,255,0.1); margin:12px 0;';
  statsBody.appendChild(hr);

  // Отрисовка интерактивных строк характеристик
  const fixedOrderKeys = ['strength', 'agility', 'endurance', 'intellect', 'luck'];

  fixedOrderKeys.forEach(key => {
    const row = document.createElement('div'); 
    row.className = 'profile-row';
    
    const lSpan = document.createElement('span'); 
    lSpan.textContent = labels[key];
    
    const vSpan = document.createElement('span'); 
    vSpan.style.display = 'flex'; 
    vSpan.style.alignItems = 'center'; 
    
    const baseVal = Number(window.player.stats[key] || 1);
    const gearBonus = typeof getEquipmentBonus === 'function' ? getEquipmentBonus(window.player, key) : 0;
    
    // 🔥 Добавляем к итоговому значению то, что игрок временно накликал
    const tempAdded = window._tempStatDistribution[key];
    const totalVal = baseVal + gearBonus + tempAdded;

    const textContainer = document.createElement('span');
    textContainer.style.marginRight = '8px';
    
    let htmlContent = `<strong style="color: #ffffff; font-size: 15px;">${totalVal}</strong> `;
    
    // Если есть временный плюс, подсвечиваем его синим/фиолетовым
    if (tempAdded > 0) {
      htmlContent += `<span style="color: #a29bfe; font-size: 12px; font-weight: bold;">(+${tempAdded} предв.)</span> `;
    }

    htmlContent += `<span style="color: var(--hint); font-size: 12px;">(</span><span style="color: #f1c40f; font-size: 12px; font-weight: bold;">${baseVal}</span><span style="color: var(--hint); font-size: 12px;">)</span>`;
    
    if (gearBonus > 0) {
      htmlContent += ` <span style="color: #2ecc71; font-size: 12px; font-weight: bold;">(+${gearBonus})</span>`;
    }
    
    textContainer.innerHTML = htmlContent;
    vSpan.appendChild(textContainer);

    // БЛОК УПРАВЛЕНИЯ: Кнопки «-» и «+»
    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display: flex; gap: 4px;';

    // Кнопка МИНУС (активна, если в этой строке есть временные очки)
    if (tempAdded > 0) {
      const minusBtn = document.createElement('button');
      minusBtn.textContent = '-';
      minusBtn.style.cssText = 'background:#e74c3c; border:none; color:#fff; border-radius:6px; padding:3px 9px; font-weight:bold; cursor:pointer;';
      minusBtn.addEventListener('click', () => window.stepTempStat(key, 'minus'));
      btnContainer.appendChild(minusBtn);
    }

    // Кнопка ПЛЮС (активна, если вообще остались свободные очки в буфере)
    if (window._tempStatPoints > 0) {
      const plusBtn = document.createElement('button'); 
      plusBtn.textContent = '+';
      plusBtn.style.cssText = 'background:var(--btn); border:none; color:#fff; border-radius:6px; padding:3px 9px; font-weight:bold; cursor:pointer;';
      plusBtn.addEventListener('click', () => window.stepTempStat(key, 'plus'));
      btnContainer.appendChild(plusBtn);
    }

    vSpan.appendChild(btnContainer);
    row.appendChild(lSpan); 
    row.appendChild(vSpan); 
    statsBody.appendChild(row);
  });

  // 🔥 Добавляем большую кнопку «ПРИНЯТЬ ИЗМЕНЕНИЯ», если игрок хоть что-то перераспределил
  const anyChanges = Object.values(window._tempStatDistribution).some(v => v > 0);
  if (anyChanges) {
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'battle-btn-finish'; // Используем готовый класс широкой кнопки из CSS
    confirmBtn.style.cssText = 'margin-top: 15px; width: 100%; background: #2ecc71; border: none; color: #fff; padding: 10px; font-weight: bold; border-radius: 10px; cursor: pointer;';
    confirmBtn.textContent = '💾 Сохранить характеристики';
    confirmBtn.addEventListener('click', window.submitStatDistribution);
    statsBody.appendChild(confirmBtn);
  }
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
// 🧪 Отрисовка боевых слотов с выводом цифры стака до 5 штук
  const consumableSlots = { potion: '🧪', scroll: '📜' };
  
  Object.keys(consumableSlots).forEach(slotKey => {
    const slotEl = document.getElementById(`eslot-${slotKey}`);
    if (!slotEl) return;

    const equippedData = window.player.equipped[slotKey];

    if (equippedData && typeof equippedData === 'object' && equippedData.id) {
      const itemData = window.getItemData(equippedData.id);
      if (itemData) {
        slotEl.innerHTML = `${itemData.icon}<span style="position:absolute; bottom:2px; right:4px; font-size:10px; font-weight:bold; background:rgba(0,0,0,0.7); padding:1px 3px; border-radius:4px; color:#2ecc71;">x${equippedData.count}</span>`;
        slotEl.style.background = '#222f3e';
        slotEl.style.border = '2px solid #2ecc71'; 
        slotEl.style.borderRadius = '10px';
        slotEl.style.fontSize = '22px';
        slotEl.style.position = 'relative';
        slotEl.style.display = 'flex';
        slotEl.style.alignItems = 'center';
        slotEl.style.justifyContent = 'center';
        slotEl.style.boxShadow = '0 4px 8px rgba(0,0,0,0.4), inset 0 0 10px rgba(46, 204, 113, 0.3)';
        slotEl.title = `${itemData.name} (Взято в бой: ${equippedData.count} шт.)\n${itemData.desc || ''}`;
      }
    } else {
      slotEl.innerHTML = consumableSlots[slotKey];
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

  const equSlots = ['head', 'neck', 'gloves', 'mainHand', 'body', 'legs', 'extra', 'offHand'];
  equSlots.forEach(slotKey => {
    document.getElementById(`eslot-${slotKey}`)?.addEventListener('click', function() {
      if (window.player && window.player.equipped && window.player.equipped[slotKey]) {
        window.unequipItem(slotKey);
      }
    });
  });

  for (let i = 0; i < 3; i++) {
    document.getElementById(`eslot-ring-${i}`)?.addEventListener('click', function() {
      if (window.player && window.player.equipped && window.player.equipped.rings && window.player.equipped.rings[i]) {
        window.unequipItem('ring', i);
      }
    });
  }

  ['potion', 'scroll'].forEach(slotKey => {
    document.getElementById(`eslot-${slotKey}`)?.addEventListener('click', function() {
      if (window.player && window.player.equipped && window.player.equipped[slotKey]) {
        window.unequipItem(slotKey);
      }
    });
  });
}

function startGame() {
  console.log("🚀 Инициализация ядра игры...");

  // 🔥 Слушатель сигналов от страницы Арены (CSP-безопасный мост)
  window.addEventListener('message', function(event) {
    if (!event.data) return;

    // Сигнал А: Принятие вызова на Арене (В БОЙ!)
    if (event.data.type === 'EXECUTE_ARENA_CHALLENGE') {
      console.log(`📡 Главное окно поймало команду запуска боя от Арены!`);
      const mainSocket = typeof socket !== 'undefined' && socket ? socket : window.socket;
      if (mainSocket) {
        mainSocket.emit('accept_arena_challenge', {
          myId: String(event.data.myId),
          opponentId: String(event.data.opponentId),
          myMaxHp: Number(event.data.myMaxHp),
          oppMaxHp: Number(event.data.oppMaxHp)
        });
      } else {
        console.error("❌ Критическая ошибка: На главной странице не найден active Web-сокет!");
      }
    }

    // Сигнал Б: Редирект в PvP бой
    if (event.data.type === 'START_ARENA_BATTLE') {
      console.log(`📡 Ядро города поймало сигнал Арены! Закрываю оверлей и пингую сервер...`);
      const iframeWrapper = document.getElementById('arena-iframe-wrapper');
      if (iframeWrapper) iframeWrapper.style.display = 'none';
      
      const mainSocket = typeof socket !== 'undefined' && socket ? socket : window.socket;
      if (mainSocket) {
        mainSocket.emit('check_active_battle', { userId: event.data.userId });
      }
    }
  });

  // Инициализируем безопасные CSP-слушатели кликов по кнопкам и вкладкам инвентаря
  if (typeof initCSPEvents === 'function') initCSPEvents();

  // Делаем асинхронный вызов загрузки профиля из базы данных Supabase
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

      // Отрисовываем главный мирный экран города, обновляем ник, уровень и ХП на площади
      if (typeof render === 'function') {
        render();
      }

      // Выводим отладочный лог: теперь данные игрока ГАРАНТИРОВАННО лежат в ОЗУ смартфона
      console.log(`✅ ИГРА ГОТОВА. Персонаж: ${window.player.name}, Настоящий ID: ${window.player.id}`);

      // ============================================================================
      // 🔄 🔥 УЛЬТИМАТИВНЫЙ АВТО-ПЕРЕХВАТ СЕССИИ (ЖЕСТКАЯ ПРОВЕРКА БОЯ ПРИ СТАРТЕ) =====
      // ============================================================================
      if (window.socket && window.player && window.player.id) {
        console.log(`🔍 Проверка ОЗУ сервера: Отправляем запрос для игрока ID ${window.player.id}...`);
        
        
      }

    }); // Конец анонимного коллбэка функции loadGame
  } else {
    console.error("❌ Критическая ошибка: Функция loadGame не объявлена в telegram_supabase.js!");
  }
}

// ============================================================================
// ===== ⏰ АСИНХРОННЫЙ АВТО-БУДИЛЬНИК ДЛЯ СЕРВЕРА RENDER (БЕЗОПАСНЫЙ) =====
// ============================================================================
function wakeUpServer() {
  const SERVER_URL = "https://darkworld-server.onrender.com";
  setTimeout(() => {
    console.log("📡 Отправка фонового пинга на Render...");
    fetch(SERVER_URL, { mode: 'no-cors' })
      .then(() => console.log("⏰ Будильник: Сигнал на боевой сервер отправлен!"))
      .catch((e) => console.warn("Сервер просыпается..."));
  }, 300);
}

// 🔥 ЕДИНСТВЕННАЯ ТОЧКА СТАРТА: Запускаем приложение строго один раз
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    startGame();
    wakeUpServer();
  }, 50);
});