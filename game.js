// ============================================================================
// ===== 🧱 КЛИЕНТСКОЕ ЯДРО ИГРЫ И МАТЕМАТИКА ХАРАКТЕРИСТИК (GAME_CORE.JS) =====
// ===== ЧАСТЬ 1 ИЗ 3: ЧИСТЫЕ СТАТЫ, НОВАЯ СТОЙКОСТЬ И ХАРДКОРНЫЙ ТАНК =====
// ============================================================================

window.player = null; // Глобальный объект игрока для сквозного доступа из всех файлов
let currentProfileTab = 'main'
let currentTab = 'equipment'; // Текущая активная вкладка в инвентаре

// Утилита генерации случайных чисел для кубиков
window.rand = function(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Функция проверки уровня по накопленному опыту гладиатора
window.getCorrectLevelByXp = function(xp) {
  if (!window.XP_TABLE || !Array.isArray(window.XP_TABLE)) {
    console.error("❌ XP_TABLE не найден в window!");
    return 1;
  }
  for (let lvl = window.XP_TABLE.length - 1; lvl >= 1; lvl--) {
    if (xp >= window.XP_TABLE[lvl]) return lvl; 
  }
  return 1;
};

// Расчет лимита опыта для следующего уровня
function xpToNext(level) {
  const nextLevel = level + 1;
  if (nextLevel < window.XP_TABLE.length) return window.XP_TABLE[nextLevel];
  return nextLevel * 1000; 
}

// Универсальный сборщик бонусов параметров от надетой экипировки куклы
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


window.getMaxHp = function(playerData) {
  const totalEndurance = playerData.stats.endurance + getEquipmentBonus(playerData, 'endurance');
  return (totalEndurance * 10) + getEquipmentBonus(playerData, 'hp');
};


window.getDef = function(playerData) {
  const totalEndurance = playerData.stats.endurance + getEquipmentBonus(playerData, 'endurance');
  return Math.floor(totalEndurance * 0.5) + getEquipmentBonus(playerData, 'def');
}

// Конструктор стартового персонажа для новичков (Ключ intellect полностью заменен на toughness)
function createPlayer() {
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  const name = tgUser?.first_name || 'Новичок';
  const uniqueId = tgUser?.id || 0; 

  const newPlayer = {
    id: uniqueId, name: name, avatar: window.DEFAULT_AVATAR || 'assets/avatars/hero5.jpg',
    level: 1, xp: 0, gold: 200, currentTownIndex: 0, statPoints: 5, 
    stats: { strength: 1, agility: 1, endurance: 1, luck: 1 },
    inventory: { equipment: [], resources: [], consumables: [] },
    equipped: {
      head: null, body: null, legs: null, neck: null, gloves: null,
      mainHand: null, offHand: null, potion: null, scroll: null,
      rings: [null, null, null] 
    }
  };

 if (newPlayer.hp === undefined || newPlayer.hp === null) {
    newPlayer.hp = (newPlayer.stats.endurance || 1) * 10;
  }
  return newPlayer;
}
// --- ЛОГИКА ПРОВЕРКИ УРОВНЕЙ И СВОБОДНЫХ ОЧКОВ ---
window.checkLevelUp = function(isInitialLoad = false) {
  if (!window.player) return;

  const correctLevel = window.getCorrectLevelByXp(window.player.xp);
  
  if (window.player.level !== correctLevel) {
    const oldLevel = window.player.level;
    const isLeveledDown = oldLevel > correctLevel;
    
    window.player.level = correctLevel;

    if (!isLeveledDown) {
      const levelsGained = correctLevel - oldLevel;
      // 🔥 НАЧИСЛЯЕМ ПО 5 СВОБОДНЫХ ОЧКОВ ЗА КАЖДЫЙ НОВЫЙ УРОВЕНЬ!
      window.player.statPoints = (window.player.statPoints || 0) + (levelsGained * 5);
      window.player.hp = window.getMaxHp(window.player);
    } else {
      // Экстренный античит-сброс под прогрессию по 5 очков
      window.player.stats = { strength: 1, agility: 1, endurance: 1, luck: 1 };
      window.player.statPoints = 5 + ((correctLevel - 1) * 5);
    }

    const maxHp = window.getMaxHp(window.player);
    if (window.player.hp > maxHp) window.player.hp = maxHp;
    if (window.saveGame) window.saveGame({ player: window.player });
  }

  if (typeof render === 'function') render();
  const modal = document.getElementById('profile-modal');
  if (modal && modal.classList.contains('active')) window.openProfile();
};

// --- ОТРИСОВКА ГЛАВНОГО ЭКРАНОМ ГОРОДА ---
function render() {
  if (!window.player) return;

  const avatarEl = document.getElementById('player-avatar');
  if (avatarEl) {
    const avatarValue = window.player.avatar || '👤';
    if (avatarValue.includes('.') || avatarValue.includes('/')) {
      avatarEl.src = avatarValue;
    } else {
      avatarEl.src = window.DEFAULT_AVATAR || 'assets/avatars/hero5.jpg'; 
    }
  }

  if (document.getElementById('player-name')) document.getElementById('player-name').textContent = window.player.name;
  if (document.getElementById('player-lvl-badge')) document.getElementById('player-lvl-badge').textContent = `Lv. ${window.player.level}`;
  
  const mainHpText = document.getElementById('player-hp-text') || document.getElementById('player-hp');
  if (mainHpText) {
    mainHpText.textContent = `❤️ ${window.player.hp} / ${window.getMaxHp(window.player)}`;
  }

  // 🔥 ДОПОЛНИТЕЛЬНО: Если на главном экране города у вас есть плашки Атаки и Защиты,
  // этот код мгновенно запишет туда новые измененные шмотками параметры!
  const townAtkEl = document.getElementById('town-player-atk');
  const townDefEl = document.getElementById('town-player-def');
  if (townAtkEl) townAtkEl.textContent = `⚔️ Атака: ${window.getAtk(window.player)}`;
  if (townDefEl) townDefEl.textContent = `🛡️ Защита: ${window.getDef(window.player)} ед.`;

  renderTown(); 
}

// --- ОТРИСОВКА ГЛАВНОГО ЭКРАНОМ ГОРОДА (ПОЛНОСТЬЮ ВОССТАНОВЛЕННЫЙ ИСПРАВЛЕННЫЙ ВАРИАНТ) ---
function renderTown() {
  if (!window.player || !window.TOWNS) return; // Подстраховка от пустых данных
  
  const town = window.TOWNS[window.player.currentTownIndex];
  if (document.getElementById('current-town-name')) {
    document.getElementById('current-town-name').textContent = town.name;
  }
  
  const grid = document.getElementById('town-locations'); 
  if (!grid) return;
  grid.innerHTML = '';
  
  // Безопасно пробегаемся по локациям города
  town.locations.forEach(loc => {
    if (!loc) return;

    // 🏰 Динамически прокачиваем имя Башни, если эта локация сейчас отрисовывается
    let displayLocationName = loc.name;
    
    const btn = document.createElement('button'); 
    btn.className = 'loc-btn';
    
      if (loc.name === "Тёмная Башня" || loc.name === "Башня") {
        btn.innerHTML = `<span>${loc.icon}</span><span>Тёмная Башня</span>`;
        btn.style.borderLeft = "4px solid #6c5ce7"; // Фирменный фиолетовый бадж оставляем для стиля
        btn.style.background = "rgba(108, 92, 231, 0.05)";
      } else {
        btn.innerHTML = `<span>${loc.icon}</span><span>${loc.name}</span>`; 
      }

    btn.addEventListener('click', function() {
      // 🌲 ТВОЙ РОДНОЙ КЛИК: ВЫХОД НА ПРИРОДУ (ЛЕС)
      if (loc.name === "Выход на природу") {
        if (!window.player || window.player.hp <= 0) {
          return alert("❌ Вы слишком слабы для боя! Восстановите здоровье в Таверне.");
        }
        if (window.player.in_battle) {
          window.location.href = `battle/battle.html`;
          return;
        }

        let targetMonster = 'wild_wolf';
        let minCount = 1; let maxCount = 1;

        if (window.player.level >= 3 && window.player.level < 5) {
          targetMonster = 'goblin'; minCount = 1; maxCount = 2;
        } else if (window.player.level >= 5) {
          targetMonster = 'stone_golem'; minCount = 1; maxCount = 3;
        }

        const finalCount = Math.floor(Math.random() * (maxCount - minCount + 1)) + minCount;

        if (window.socket) {
          try { window.socket.disconnect(); } catch(e) {}
        }
        for (let i = 1; i < 100; i++) { window.clearInterval(i); window.clearTimeout(i); }
        window.location.href = `battle/battle.html?monster=${targetMonster}&count=${finalCount}`;
      } 
      // 🏪 ТВОЙ РОДНОЙ КЛИК: ПЕРЕХОД В МАГАЗИН
      else if (loc.name === "Магазин") {
        console.log("🏪 Игрок заходит в изолированную Торговую Лавку...");
        window.location.href = 'shop/shop.html';
      } 
      // ⚔️ ТВОЙ РОДНОЙ КЛИК: АРЕНА PvP
      else if (loc.name === "Арена PvP") {
        const wrapper = document.getElementById('arena-iframe-wrapper');
        const frame = document.getElementById('arena-iframe-frame');
        if (wrapper && frame) {
          frame.src = 'arena.html'; 
          wrapper.style.display = 'flex'; 
        }
      } 
      // 🏰 [НОВОЕ ИЗОЛИРОВАННОЕ УСЛОВИЕ] КЛИК ДЛЯ ТЁМНОЙ БАШНИ
      else if (loc.name === "Тёмная Башня" || loc.name === "Башня") {
        if (!window.player) return;
        if (Number(window.player.hp) <= 0) {
          return alert("❌ Вы слишком слабы для штурма! Восстановите здоровье в Таверне.");
        }
        console.log("🏰 Игрок выдвигается на штурм этажей Башни...");
        window.location.href = 'tower/tower.html';
      } 
      // ДЕФОЛТНЫЙ ТВОЙ ВЫВОД
      else { 
        alert(`Вы зашли в здание: ${loc.name}`); 
      }
    });

    grid.appendChild(btn);
  });

  // Твой родной код кнопки путешествия между городами
  const travelBtn = document.createElement('button'); 
  travelBtn.className = 'loc-btn';
  const nextIdx = window.player.currentTownIndex === 0 ? 1 : 0;
  travelBtn.innerHTML = `<span>🛒</span><span>В ${window.TOWNS[nextIdx].name}</span>`;
  travelBtn.addEventListener('click', function() {
    window.player.currentTownIndex = nextIdx; 
    if (window.saveGame) window.saveGame({ player: window.player }); 
    render();
  });
  grid.appendChild(travelBtn);
}

// --- УПРАВЛЕНИЕ ХАРАКТЕРИСТИКАМИ И ИНТЕРАКТИВНЫМ БУФЕРОМ ---
// 🔥 ФИКС: intellect заменен на toughness во временном буфере распределения
window._tempStatDistribution = { strength: 0, agility: 0, endurance: 0, luck: 0 };
window._tempStatPoints = 0;

function resetStatBuffer() {
  window._tempStatDistribution = { strength: 0, agility: 0, endurance: 0, luck: 0 };
  window._tempStatPoints = window.player ? window.player.statPoints : 0;
}

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
  window.openProfile();
};

window.submitStatDistribution = function() {
  if (window.socket && window.socket.connected) {
    const confirmBtn = document.getElementById('stat-save-btn');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = '⏳ Сохранение в облаке...';
    }
    window.socket.emit('confirm_stat_distribution_secure', {
      userId: window.player.id,
      distribution: window._tempStatDistribution
    });
  } else {
    alert("⚠️ Ошибка: Нет соединения с сервером!");
  }
};
// --- ОТРИСОВКА ОКНА ПРОФИЛЯ ПЕРСОНАЖА (ОДНОВРЕМЕННЫЙ РАСЧЕТ И СТОЙКОСТЬ) ---
window.openProfile = function() {
  const modal = document.getElementById('profile-modal'); 
  if (!modal) return;
  
  if (modal.style.display !== 'flex') resetStatBuffer();

  modal.classList.add('active'); 
  modal.style.display = 'flex';
  let statsBody = modal.querySelector('.modal-body-stats'); 
  if (!statsBody) return;

  statsBody.textContent = '';
  const nextXp = xpToNext(window.player.level);
  const currentXp = (window.player.xp !== undefined) ? window.player.xp : 0;

  // 1. Верхний блок общих параметров персонажа
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

  const hr1 = document.createElement('hr');
  hr1.style.cssText = 'border:0; border-top:1px solid rgba(255,255,255,0.1); margin:12px 0;';
  statsBody.appendChild(hr1);

  // 2. 🔥 ДОБАВЛЕНИЕ КНОПОК-ВКЛАДОК ПРОФИЛЯ (Основные / Модификаторы)
  const tabsContainer = document.createElement('div');
  tabsContainer.style.cssText = 'display: flex; gap: 8px; margin-bottom: 15px; justify-content: center;';

  const btnMain = document.createElement('button');
  btnMain.textContent = '📊 Основные';
  btnMain.style.cssText = `flex: 1; padding: 8px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; transition: 0.2s; ${currentProfileTab === 'main' ? 'background: var(--btn); color: #fff;' : 'background: rgba(255,255,255,0.05); color: var(--hint);'}`;
  btnMain.onclick = () => { currentProfileTab = 'main'; window.openProfile(); };

  const btnMods = document.createElement('button');
  btnMods.textContent = '💥 Модификаторы';
  btnMods.style.cssText = `flex: 1; padding: 8px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; transition: 0.2s; ${currentProfileTab === 'modifiers' ? 'background: var(--btn); color: #fff;' : 'background: rgba(255,255,255,0.05); color: var(--hint);'}`;
  btnMods.onclick = () => { currentProfileTab = 'modifiers'; window.openProfile(); };

  tabsContainer.appendChild(btnMain);
  tabsContainer.appendChild(btnMods);
  statsBody.appendChild(tabsContainer);

  // ============================================================================
  // ВЕТВЬ А: ОТРИСОВКА ОСНОВНЫХ ХАРАКТЕРИСТИК (СИЛА, ЛОВКОСТЬ И Т.Д.)
  // ============================================================================
  if (currentProfileTab === 'main') {
    const pointsDiv = document.createElement('div');
    pointsDiv.style.cssText = 'margin:5px 0 10px 0; font-weight:bold; font-size:16px; color:#f1c40f; text-align:center;';
    pointsDiv.textContent = 'Доступно очков: ' + window._tempStatPoints;
    statsBody.appendChild(pointsDiv);

    const labels = { strength: '💪 Сила', agility: '🏹 Ловкость', endurance: '🛡️ Выносливость', luck: '🍀 Удача' };
    const fixedOrderKeys = ['strength', 'agility', 'endurance', 'luck'];

    fixedOrderKeys.forEach(key => {
      const row = document.createElement('div'); 
      row.className = 'profile-row';
      const lSpan = document.createElement('span'); lSpan.textContent = labels[key];
      const vSpan = document.createElement('span'); vSpan.style.display = 'flex'; vSpan.style.alignItems = 'center'; 
      
      const baseVal = Number(window.player.stats[key] ?? 1);
      const gearBonus = typeof getEquipmentBonus === 'function' ? Number(getEquipmentBonus(window.player, key) || 0) : 0;
      const tempAdded = Number(window._tempStatDistribution[key] || 0);
      const totalVal = baseVal + gearBonus + tempAdded;

      const textContainer = document.createElement('span');
      textContainer.style.marginRight = '8px';
      
      let htmlContent = `<strong style="color: #ffffff; font-size: 15px;">${totalVal}</strong> `;
      if (tempAdded > 0) htmlContent += `<span style="color: #a29bfe; font-size: 12px; font-weight: bold;">(+${tempAdded})</span> `;
      htmlContent += `<span style="color: var(--hint); font-size: 12px;">(${baseVal})</span>`;
      if (gearBonus > 0) htmlContent += ` <span style="color: #2ecc71; font-size: 12px; font-weight: bold;">(+${gearBonus})</span>`;
      
      textContainer.innerHTML = htmlContent; vSpan.appendChild(textContainer);
      const btnContainer = document.createElement('div'); btnContainer.style.cssText = 'display: flex; gap: 4px;';

      if (tempAdded > 0) {
      const minusBtn = document.createElement('button'); minusBtn.textContent = '-';
      // 🔥 ФИКС КНОПКИ МИНУС: Сделали квадратной (28х28px), увеличили шрифт до 14px и добавили pointer-events
      minusBtn.style.cssText = 'background:#e74c3c; border:none; color:#fff; border-radius:6px; width:28px; height:28px; font-size:14px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; transition: transform 0.1s;';
      
      // Добавляем эффект уменьшения при тапе пальцем
      minusBtn.ontouchstart = function() { this.style.transform = 'scale(0.9)'; };
      minusBtn.ontouchend = function() { this.style.transform = 'scale(1)'; };
      
      minusBtn.addEventListener('click', () => window.stepTempStat(key, 'minus'));
      btnContainer.appendChild(minusBtn);
    }

    if (window._tempStatPoints > 0) {
      const plusBtn = document.createElement('button'); plusBtn.textContent = '+';
      // 🔥 ФИКС КНОПКИ ПЛЮС: Сделали квадратной (28х28px), увеличили шрифт до 14px для удобного мобильного тапа
      plusBtn.style.cssText = 'background:var(--btn); border:none; color:#fff; border-radius:6px; width:28px; height:28px; font-size:14px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; transition: transform 0.1s;';
      
      // Добавляем эффект уменьшения при тапе пальцем
      plusBtn.ontouchstart = function() { this.style.transform = 'scale(0.9)'; };
      plusBtn.ontouchend = function() { this.style.transform = 'scale(1)'; };
      
      plusBtn.addEventListener('click', () => window.stepTempStat(key, 'plus'));
      btnContainer.appendChild(plusBtn);
    }

      vSpan.appendChild(btnContainer); row.appendChild(lSpan); row.appendChild(vSpan); statsBody.appendChild(row);
    });

    const anyChanges = Object.values(window._tempStatDistribution).some(v => v > 0);
    if (anyChanges) {
      const confirmBtn = document.createElement('button');
      confirmBtn.id = 'stat-save-btn'; confirmBtn.className = 'battle-btn-finish';
      confirmBtn.style.cssText = 'margin-top: 15px; width: 100%; background: #2ecc71; border: none; color: #fff; padding: 10px; font-weight: bold; border-radius: 10px; cursor: pointer;';
      confirmBtn.textContent = '💾 Сохранить характеристики';
      confirmBtn.addEventListener('click', window.submitStatDistribution);
      statsBody.appendChild(confirmBtn);
    }
    // ============================================================================
    // 🔥 [ДОБАВЛЕНО] КНОПКА СБРОСА ХАРАКТЕРИСТИК ДЛЯ ПРОФИЛЯ ГЕРОЯ
    // ============================================================================
    const resetsCount = window.player.stat_resets !== undefined ? window.player.stat_resets : 3;
    
    const resetBtn = document.createElement('button');
    resetBtn.style.cssText = 'margin-top: 8px; width: 100%; background: #e67e22; border: none; color: #fff; padding: 10px; font-weight: bold; border-radius: 10px; cursor: pointer; font-size: 12px; box-shadow: 0 4px 10px rgba(230, 126, 34, 0.2); transition: 0.1s;';
    resetBtn.innerHTML = `🧹 Сбросить характеристики (Осталось: ${resetsCount})`;
    
    // Блокируем кнопку, если попыток больше нет
    if (resetsCount <= 0) {
      resetBtn.style.background = '#333';
      resetBtn.style.color = '#666';
      resetBtn.style.boxShadow = 'none';
      resetBtn.disabled = true;
    }

    resetBtn.onclick = function() {
      const confirmReset = confirm(`⚠️ Вы уверены, что хотите сбросить все характеристики до 1? Это потратит 1 попытку сброса (Осталось: ${resetsCount}). Надетые вещи могут слететь!`);
      if (confirmReset) {
        resetBtn.disabled = true;
        resetBtn.textContent = '⏳ Сброс...';
        console.log("📤 [ОТПРАВКА] Запрос request_stat_reset_secure улетает на бэкенд...");
        window.socket.emit('request_stat_reset_secure', { userId: window.player.id });
      }
    };
    
    statsBody.appendChild(resetBtn);
  } 
  // ============================================================================
  // ВЕТВЬ Б: 🔥 ОТРИСОВКА ВТОРОСТЕПЕННЫХ МОДИФИКАТОРОВ БК (МФ. КРИТА, УВОР ОТА...)
  // ============================================================================
else if (currentProfileTab === 'modifiers') {
    // 1. Подсчитываем полные статы (база + бонусы со всей куклы экипировки)
    const totalAgi = window.player.stats.agility + getEquipmentBonus(window.player, 'agility');
    const totalLuck = window.player.stats.luck + getEquipmentBonus(window.player, 'luck');

    // 2. Стандартные каноничные модификаторы Бойцовского Клуба
    const mfInv = (totalAgi * 10) + getEquipmentBonus(window.player, 'mf_inv');
    const mfAntiInv = (totalAgi * 4) + getEquipmentBonus(window.player, 'mf_antiinv');
    const mfCrit = (totalLuck * 10) + getEquipmentBonus(window.player, 'mf_crit');
    const mfAntiCrit = (totalLuck * 4) + getEquipmentBonus(window.player, 'mf_anticrit');

    // 3. 🔥 ВЫЧИСЛЯЕМ ЭФФЕКТИВНЫЕ БОЕВЫЕ КАПЫ (Шансы против равного по силе соперника)
    // Базовый шанс 5% + по 1% за каждую единицу боевого стата
    const finalEvadeDisplay = Math.min(70, 5 + (totalAgi * 1)); // Жесткий кап уворота 70%
    const finalCritDisplay = Math.min(65, 5 + (totalLuck * 1)); // Жесткий кап крита 65%

    // Собираем массив данных для красивого вывода на экран смартфона
    const modifiersData = [
      { 
        label: '🏹 Мф. Увертывания', 
        value: `${mfInv}%`, 
        subValue: `Реальный шанс боя: макс. ${finalEvadeDisplay}%`,
        desc: 'Шанс полностью уклониться от физических атак врага' 
      },
      { 
        label: '🎯 Мф. Против увертывания', 
        value: `${mfAntiInv}%`, 
        subValue: null,
        desc: 'Снижает показатель уклонения вашего соперника' 
      },
      { 
        label: '💥 Мф. Критического удара', 
        value: `${mfCrit}%`, 
        subValue: `Реальный шанс боя: макс. ${finalCritDisplay}%`,
        desc: 'Шанс нанести сокрушительный двойной урон (2.0x)' 
      },
      { 
        label: '🛡️ Мф. Против крита (Антикрит)', 
        value: `${mfAntiCrit}%`, 
        subValue: null,
        desc: 'Снижает вероятность критического удара по вам' 
      }
    ];

    // Отрисовываем карточки модификаторов в DOM-дерево поп-апа
    modifiersData.forEach(mod => {
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; flex-direction: column; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05);';
      
      // 🔥 БЕЗОПАСНАЯ СКЛЕЙКА: Убрали косые слэши и знаки $, собираем строку через обычные плюсы
      let innerHtml = '';
      innerHtml += '<div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold;">';
      innerHtml += '  <span>' + mod.label + '</span>';
      innerHtml += '  <span style="color: #6c5ce7; font-size: 16px;">+' + mod.value + '</span>';
      innerHtml += '</div>';
      
      // Если у модификатора есть расчет капа (уворот или крит) — приклеиваем золотую строчку
      if (mod.subValue) {
        innerHtml += '<div style="color: #f1c40f; font-size: 11px; font-weight: 600; margin-top: 2px;">⚡ ' + mod.subValue + '</div>';
      }
      
      innerHtml += '<div style="color: var(--hint); font-size: 11px; margin-top: 3px; line-height: 1.2;">' + mod.desc + '</div>';
      
      row.innerHTML = innerHtml;
      statsBody.appendChild(row);
    });
  }
};

window.closeProfile = function() {
  const modal = document.getElementById('profile-modal');
  if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
};

// --- 🔥 ЕДИНЫЙ УЛЬТИМАТИВНЫЙ ПОП-АП ХАРАКТЕРИСТИК ДЛЯ РЮКЗАКА ГОРОДА ---
window.showItemInfo = function(itemUuidOrId, isEquipped, slotKey = null, ringIndex = null) {
  if (!itemUuidOrId) return;

  // Шаг 1: Извлекаем чистый ID предмета из UUID шмотки (с защитой от обрезки банок и дефолтных вещей)
  let cleanId = itemUuidOrId;
  if (itemUuidOrId.includes('_')) {
    if (!window.GAME_ITEMS_DATABASE[itemUuidOrId]) {
      const parts = itemUuidOrId.split('_'); 
      if (parts.length > 2) {
        cleanId = parts.slice(0, -2).join('_');
      }
    }
  }

  // Шаг 2: Ищем характеристики строго по чистому базовому ID в базе контента
  const itemData = window.getItemData(cleanId);
  if (!itemData) {
    console.error('🚨 [ГОРОД] Предмет с ID "' + cleanId + '" отсутствует в базе контента!');
    return;
  }

  const popover = document.getElementById('item-info-popover');
  const pName = document.getElementById('popover-item-name');
  const pIcon = document.getElementById('popover-item-icon');
  const pDesc = document.getElementById('popover-item-desc');
  const pBtn = document.getElementById('popover-item-action-btn');

  if (!popover || !pName || !pIcon || !pDesc || !pBtn) return;

  pName.textContent = itemData.name;
  pIcon.textContent = itemData.icon || '📦';

  // Шаг 3: Собираем текст по новой идеальной иерархии: Описание -> Требования -> Бонусы
  let statsText = itemData.desc || '';
  if (statsText) statsText += '\n';

  // А. РАЗДЕЛ ДИНАМИЧЕСКИХ ТРЕБОВАНИЙ (✅ / 🔒)
  let reqsText = '';
  
  if (itemData.level) {
    // В городе уровень игрока берется из объекта window.player
    const pLevel = window.player && window.player.level ? Number(window.player.level) : 1;
    const levelIcon = (pLevel >= Number(itemData.level)) ? '✅' : '🔒';
    reqsText += '\n' + levelIcon + ' Требуется уровень: ' + itemData.level;
  }
  
  if (itemData.req) {
    const pStr = window.player && window.player.stats && window.player.stats.strength ? Number(window.player.stats.strength) : 1;
    const pAgi = window.player && window.player.stats && window.player.stats.agility ? Number(window.player.stats.agility) : 1;
    const pEnd = window.player && window.player.stats && window.player.stats.endurance ? Number(window.player.stats.endurance) : 1;
    const pLuck = window.player && window.player.stats && window.player.stats.luck ? Number(window.player.stats.luck) : 1;

    if (itemData.req.strength) {
      const strIcon = (pStr >= Number(itemData.req.strength)) ? '✅' : '🔒';
      reqsText += '\n' + strIcon + ' Требуется Сила: ' + itemData.req.strength;
    }
    if (itemData.req.agility) {
      const agiIcon = (pAgi >= Number(itemData.req.agility)) ? '✅' : '🔒';
      reqsText += '\n' + agiIcon + ' Требуется Ловкость: ' + itemData.req.agility;
    }
    if (itemData.req.endurance) {
      const endIcon = (pEnd >= Number(itemData.req.endurance)) ? '✅' : '🔒';
      reqsText += '\n' + endIcon + ' Требуется Выносливость: ' + itemData.req.endurance;
    }
    if (itemData.req.luck) {
      const luckIcon = (pLuck >= Number(itemData.req.luck)) ? '✅' : '🔒';
      reqsText += '\n' + luckIcon + ' Требуется Удача: ' + itemData.req.luck;
    }
  }
  
  if (reqsText) statsText += reqsText + '\n';

  // Б. РАЗДЕЛ БОНУСОВ И МОДИФИКАТОРОВ ВЕЩИ
  let bonusesText = '';
  if (itemData.bonus) {
    if (itemData.bonus.atk) bonusesText += '\n⚔️ Бонус Атаки: +' + itemData.bonus.atk;
    if (itemData.bonus.def) bonusesText += '\n🛡️ Бонус Защиты: +' + itemData.bonus.def;
    if (itemData.bonus.mf_crit) bonusesText += '\n💥 Мф. Критического удара: +' + itemData.bonus.mf_crit + '%';
    if (itemData.bonus.mf_inv) bonusesText += '\n🏹 Мф. Увертывания: +' + itemData.bonus.mf_inv + '%';
    if (itemData.bonus.mf_antiinv) bonusesText += '\n🎯 Мф. Против увертывания: +' + itemData.bonus.mf_antiinv + '%';
    if (itemData.bonus.mf_anticrit) bonusesText += '\n🛡️ Мф. Против крита: +' + itemData.bonus.mf_anticrit + '%';
    
    if (itemData.bonus.stats) {
      const b = itemData.bonus.stats;
      if (b.strength) bonusesText += '\n💪 Добавляет Силу: +' + b.strength;
      if (b.agility) bonusesText += '\n🏹 Добавляет Ловкость: +' + b.agility;
      if (b.endurance) bonusesText += '\n🛡️ Добавляет Выносливость: +' + b.endurance;
      if (b.luck) bonusesText += '\n🍀 Добавляет Удачу: +' + b.luck;
    }
  }

  if (bonusesText) statsText += '\n⭐ Бонусы предмета:' + bonusesText;
  
  pDesc.innerText = statsText;

  // Шаг 4: Управление кнопкой действия инвентаря (Надеть / Снять) без изменений логики сокетов
  let btnContainer = pBtn.parentElement;
  if (btnContainer) {
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '10px';
    btnContainer.style.width = '100%';
  }

  // 2. Сужаем кнопку экипировки, чтобы она делила место с кнопкой удаления
  pBtn.style.flex = '2'; // Займет ~65-70% ширины
  pBtn.style.width = 'auto';

  // 3. Ищем или динамически создаем кнопку "Выбросить"
  let deleteBtn = document.getElementById('popover-item-delete-btn');
  if (!deleteBtn && btnContainer) {
    deleteBtn = document.createElement('button');
    deleteBtn.id = 'popover-item-delete-btn';
    deleteBtn.style.cssText = 'flex: 1; background: #e74c3c; border: none; color: #fff; padding: 12px; font-weight: bold; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px;';
    btnContainer.appendChild(deleteBtn);
  }

  // 4. Логика распределения кнопок (Снятие / Экипировка / Уничтожение)
  if (isEquipped) {
    // Если вещь надета на куклу — меняем кнопку на «Снять»
    pBtn.textContent = '❌ Снять в рюкзак';
    pBtn.style.background = '#e74c3c';
    pBtn.onclick = function() {
      popover.style.display = 'none';
      window.unequipItem(slotKey, ringIndex);
    };
    
    // Скрываем кнопку удаления, так как надетые из рук вещи выбрасывать нельзя!
    if (deleteBtn) deleteBtn.style.display = 'none';
    
  } else {
    // Если вещь лежит в рюкзаке — настраиваем кнопку «Экипировать» или «Взять в бой»
    let isConsumable = itemData.heal || cleanId.includes('potion') || cleanId.includes('soup') || itemData.duration || cleanId.includes('scroll');
    pBtn.textContent = isConsumable ? '🧪 Взять в бой' : '🛡️ Экипировать';
    pBtn.style.background = '#6c5ce7';
    
    pBtn.onclick = function() {
      popover.style.display = 'none';
      window.equipItem(itemUuidOrId);
    };

    // Включаем и настраиваем кнопку «Выбросить» с жестким Confirm-подтверждением
if (deleteBtn) {
      deleteBtn.style.display = 'flex';
      deleteBtn.textContent = '🗑️ Выбросить';
      
      deleteBtn.onclick = function() {
        const confirmDelete = confirm('⚠️ Вы уверены, что хотите навсегда выбросить и удалить предмет "' + itemData.name + '"?');
        if (confirmDelete) {
          popover.style.display = 'none';
          
          // 🔥 [ИСПРАВЛЕНО] Определяем, является ли предмет банкой или свитком
          let isConsumable = itemData.heal || cleanId.includes('potion') || cleanId.includes('soup') || itemData.duration || cleanId.includes('scroll');
          
          // 🔥 [ЖЕЛЕЗНЫЙ ФИКС ИДЕНТИФИКАТОРА]
          // Если это банка/расходник — шлем на сервер чистый базовый ID ('hp_potion_small').
          // Если это шмотка экипировки — шлем уникальный UUID шмотки со всей её заточкой!
          let finalTargetId = isConsumable ? cleanId : itemUuidOrId;
          
          console.log('📡 [КЛИЕНТ] Отправка запроса на уничтожение предмета: ' + finalTargetId + ' (Расходник: ' + isConsumable + ')');
          
          // Отправляем сигнал удаления на бэкенд по сокету
          window.socket.emit('destroy_item_secure', { 
            userId: window.player.id, 
            itemUuidOrId: finalTargetId, // Передаем исправленный ID/UUID
            isConsumable: !!isConsumable
          });
        }
      };
    }
  }
  
  // Выводим заполненный поп-ап на экран смартфона
  popover.style.display = 'flex';
};
// --- ОТРИСОВКА ИНВЕНТАРЯ И КУКЛЫ ПЕРСОНАЖА ---
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

window.hasInventorySpace = function(tabName, itemId) {
  if (!window.player || !window.player.inventory) return false;
  const items = window.player.inventory[tabName] || [];
  const exists = items.some(item => item.id === itemId);
  if (exists) return true;
  return items.length < 30;
};

function renderInventory() {
  if (!window.player) return;

  const standardSlots = {
    head: '🪖', neck: '📿', gloves: '🧤', mainHand: '⚔️',
    body: '👕', legs: '🥾', extra: '✨', offHand: '🛡️'
  };

  // 1. Отрисовка 8 основных слотов экипировки куклы (С фиксом двуручного оружия)
  
  // Сначала проверяем, надето ли в правой руке двуручное оружие
  let isTwoHandedEquipped = false;
  const currentMainHandId = window.player.equipped?.mainHand;
  if (currentMainHandId) {
    const mainHandData = window.getItemData(currentMainHandId);
    // Двуручник определяется либо по слоту twoHanded, либо по ключевым словам в ID
    if (mainHandData && (mainHandData.slotType === 'twoHanded' || currentMainHandId.includes('halberd') || currentMainHandId.includes('claymore') || currentMainHandId.includes('broadsword') || currentMainHandId.includes('splitter'))) {
      isTwoHandedEquipped = true;
    }
  }

  Object.keys(standardSlots).forEach(slotKey => {
    const slotEl = document.getElementById(`eslot-${slotKey}`);
    if (!slotEl) return;

    // 🔥 ОСОБАЯ КЛИЕНТСКАЯ ЛОГИКА ДЛЯ ЛЕВОЙ РУКИ ПРИ ДВУРУЧНИКЕ
    if (slotKey === 'offHand' && isTwoHandedEquipped) {
      slotEl.textContent = '❌'; // Показываем замок или крестик
      slotEl.style.background = 'rgba(231, 76, 60, 0.15)'; // Окрашиваем ячейку в мягкий красный цвет
      slotEl.style.border = '1px solid var(--danger)';
      slotEl.style.fontSize = '18px';
      slotEl.style.boxShadow = 'none';
      slotEl.title = "Слот заблокирован двуручным оружием";
      return; // Уходим на следующую итерацию, пропускаем стандартный рендер щита
    }

    const equippedItemId = window.player.equipped[slotKey];
    if (equippedItemId) {
      const itemData = window.getItemData(equippedItemId);
      if (itemData) {
        slotEl.textContent = itemData.icon;
        slotEl.style.background = '#222f3e';
        slotEl.style.border = '2px solid var(--btn)';
        slotEl.style.borderRadius = '10px';
        slotEl.style.fontSize = '26px';
        slotEl.style.boxShadow = '0 4px 8px rgba(0,0,0,0.4), inset 0 0 10px rgba(108, 92, 231, 0.4)';
        slotEl.title = `${itemData.name}`;
      }
    } else {
      slotEl.textContent = standardSlots[slotKey];
      slotEl.style.background = 'rgba(255, 255, 255, 0.03)';
      slotEl.style.border = '1px dashed rgba(255, 255, 255, 0.25)';
      slotEl.style.fontSize = '20px';
      slotEl.style.boxShadow = 'none';
    }
  });

  // 2. Отрисовка 3 слотов колец
  for (let i = 0; i < 3; i++) {
    const ringSlotEl = document.getElementById(`eslot-ring-${i}`);
    if (!ringSlotEl) continue;
    const ringId = window.player.equipped.rings[i];

    if (ringId) {
      const itemData = window.getItemData(ringId);
      if (itemData) {
        ringSlotEl.textContent = itemData.icon;
        ringSlotEl.style.background = '#222f3e';
        ringSlotEl.style.border = '2px solid var(--btn)';
        ringSlotEl.style.borderRadius = '10px';
        ringSlotEl.style.fontSize = '26px';
        ringSlotEl.style.boxShadow = '0 4px 8px rgba(0,0,0,0.4), inset 0 0 10px rgba(108, 92, 231, 0.4)';
      }
    } else {
      ringSlotEl.textContent = '💍';
      ringSlotEl.style.background = 'rgba(255, 255, 255, 0.03)';
      ringSlotEl.style.border = '1px dashed rgba(255, 255, 255, 0.25)';
      ringSlotEl.style.fontSize = '20px';
      ringSlotEl.style.boxShadow = 'none';
    }
  }

  // 3. Отрисовка расходников боя (зелье / свиток) с выводом цифры стака
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
        slotEl.style.fontSize = '22px';
        slotEl.style.position = 'relative';
      }
    } else {
      slotEl.innerHTML = consumableSlots[slotKey];
      slotEl.style.background = 'rgba(255, 255, 255, 0.03)';
      slotEl.style.border = '1px dashed rgba(255, 255, 255, 0.25)';
      slotEl.style.fontSize = '20px';
    }
  });

  const invAvatar = document.getElementById('inv-hero-avatar');
  if (invAvatar) invAvatar.src = window.player.avatar || window.DEFAULT_AVATAR;

  // 4. Отрисовка нижнего рюкзака (сетка предметов) с лимитом 30 слотов
  const container = document.getElementById('inventory-content'); 
  if (!container) return;
  container.innerHTML = ''; 
  
  const items = window.player.inventory[currentTab] || [];
  
  const counterEl = document.createElement('div');
  counterEl.style.cssText = 'width: 100%; grid-column: 1 / -1; padding: 4px 8px; margin-bottom: 6px; font-size: 12px; font-weight: bold; color: var(--hint); display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05);';
  
  let tabTitle = currentTab === 'equipment' ? '⚔️ Снаряжение' : (currentTab === 'resources' ? '💎 Материалы' : '🧪 Расходники');
  counterEl.innerHTML = `<span>${tabTitle}</span><span>Занято: ${items.length} / 30</span>`;
  container.appendChild(counterEl);

  if (items.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'inv-empty';
    emptyMsg.style.gridColumn = '1 / -1';
    emptyMsg.textContent = 'Здесь пока пусто...';
    container.appendChild(emptyMsg);
    return;
  }

 items.forEach(item => {
    // 🔥 Достаем полные данные шмотки (иконку, имя, бонусы, требования) из единой базы
    const fullItemData = window.getItemData(item.id || item);
    if (!fullItemData) return; // Если вещь не найдена в конфигах, пропускаем ячейку

    const slot = document.createElement('div'); 
    slot.className = 'inv-slot'; 
    
    // 1. Отрисовка иконки (эмодзи или картинки)
    if (fullItemData.icon && (fullItemData.icon.includes('.') || fullItemData.icon.includes('/'))) {
      slot.innerHTML = '<img src="' + fullItemData.icon + '" style="width:100%; height:100%; object-fit:contain; pointer-events:none;">';
    } else {
      slot.textContent = fullItemData.icon || '📦';
    }

    // Восстанавливаем твои базовые стили ячеек, но убираем конфликты размеров
    slot.style.cssText = 'position: relative; font-size: 22px; cursor: pointer; display: flex; align-items: center; justify-content: center;';

    // 2. 🔥 ХИРУРГИЧЕСКАЯ ПРОВЕРКА ТРЕБОВАНИЙ И УРОВНЯ ДЛЯ ПОДСВЕТКИ
    const myAgi = Number(window.player.stats?.agility || 1);
    const myLuck = Number(window.player.stats?.luck || 1);
    const myEnd = Number(window.player.stats?.endurance || 1);
    const myStr = Number(window.player.stats?.strength || 1);

    let hasEnoughStats = true;
    if (fullItemData.req?.strength && myStr < fullItemData.req.strength) hasEnoughStats = false;
    if (fullItemData.req?.agility && myAgi < fullItemData.req.agility) hasEnoughStats = false;
    if (fullItemData.req?.endurance && myEnd < fullItemData.req.endurance) hasEnoughStats = false;
    if (fullItemData.req?.luck && myLuck < fullItemData.req.luck) hasEnoughStats = false;

    const isLevelOk = fullItemData.level ? (window.player.level >= fullItemData.level) : true;

    // Если гладиатор не соответствует требованиям — ячейка рюкзака аккуратно окрасится в красный цвет
    if (!hasEnoughStats || !isLevelOk) {
      slot.style.backgroundColor = 'rgba(231, 76, 60, 0.18)'; 
      slot.style.border = '1px solid rgba(231, 76, 60, 0.4)';
    } else {
      slot.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
      slot.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    }

    // 3. 🔥 ВЫВОД УРОВНЯ ПРЕДМЕТА В ЛЕВЫЙ ВЕРХНИЙ УГОЛ ЯЧЕЙКИ
    if (fullItemData.level) {
      const lvlIndicator = document.createElement('span');
      lvlIndicator.style.cssText = 'position: absolute; top: 2px; left: 4px; font-size: 9px; font-weight: bold; color: #f1c40f; text-shadow: 1px 1px 2px #000; pointer-events: none;';
      lvlIndicator.textContent = 'L.' + fullItemData.level;
      slot.appendChild(lvlIndicator);
    }

    // 4. 🔥 ВЫВОД ЗНАЧКА ГЛАВНОГО ТРЕБОВАНИЯ В ПРАВЫЙ ВЕРХНИЙ УГОЛ
    let reqStatBadge = '';
    if (fullItemData.req?.strength) reqStatBadge = '💪';
    else if (fullItemData.req?.agility) reqStatBadge = '🏹';
    else if (fullItemData.req?.endurance) reqStatBadge = '🛡️';
    else if (fullItemData.req?.luck) reqStatBadge = '🍀';

    if (reqStatBadge) {
      const statIndicator = document.createElement('span');
      statIndicator.style.cssText = 'position: absolute; top: 2px; right: 4px; font-size: 10px; pointer-events: none;';
      statIndicator.textContent = reqStatBadge;
      slot.appendChild(statIndicator);
    }

    // 5. Вывод стака расходников (количество банок) в правый нижний угол
    const countValue = item.count || fullItemData.count || 1;
    if (countValue > 1) {
      const countEl = document.createElement('span'); 
      countEl.className = 'inv-count'; 
      countEl.textContent = countValue; 
      slot.appendChild(countEl);
    }
    
    // При клике на шмотку в рюкзаке открываем поп-ап информации
    slot.addEventListener('click', function() {
      window.showItemInfo(item.uuid || item.id || item, false); 
    });
    
    container.appendChild(slot);
  });
}

// --- БЕЗОПАСНАЯ ИНИЦИАЛИЗАЦИЯ СЛУШАТЕЛЕЙ КЛИКОВ КУКЛЫ ---
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
      const equippedItemId = window.player && window.player.equipped ? window.player.equipped[slotKey] : null;
      if (equippedItemId) window.showItemInfo(equippedItemId, true, slotKey);
    });
  });

  for (let i = 0; i < 3; i++) {
    document.getElementById(`eslot-ring-${i}`)?.addEventListener('click', function() {
      if (window.player && window.player.equipped && window.player.equipped.rings) {
        const ringId = window.player.equipped.rings[i];
        if (ringId) window.showItemInfo(ringId, true, 'ring', i);
      }
    });
  }

  ['potion', 'scroll'].forEach(slotKey => {
    const slotEl = document.getElementById(`eslot-${slotKey}`);
    if (slotEl) {
      slotEl.addEventListener('click', function() {
        if (window.player && window.player.equipped) {
          const equippedData = window.player.equipped[slotKey];
          const itemId = equippedData && typeof equippedData === 'object' ? equippedData.id : equippedData;
          if (itemId) window.showItemInfo(itemId, true, slotKey);
        }
      });
    }
  });
}

function startGame() {
  console.log("🚀 Инициализация ядра игры...");
  
  window.addEventListener('message', function(event) {
    if (!event.data) return;
    if (event.data.type === 'CLOSE_ARENA_OVERLAY') {
      const wrapper = document.getElementById('arena-iframe-wrapper');
      const frame = document.getElementById('arena-iframe-frame');
      if (wrapper) wrapper.style.display = 'none';
      if (frame) frame.src = 'about:blank'; 
      if (typeof window.render === 'function') window.render();
    }
  });

  // 🔥 ГЛОБАЛЬНЫЙ ПЕРЕХВАТЧИК PvP (ГЛАВНОЕ ОКНО ИГРЫ):
  // Этот сокет всегда активен. Он поймает вызов, даже если Арена полностью скрыта!
  setTimeout(() => {
    if (window.socket && window.socket.connected) {
    }
  }, 1200);

  if (typeof initCSPEvents === 'function') initCSPEvents();

  if (typeof window.loadGame === 'function') {
    window.loadGame((error) => {
      if (error) return console.error("❌ Критическая ошибка загрузки:", error);
      if (!window.player) window.player = createPlayer();
      if (typeof render === 'function') render();
      console.log(`✅ ИГРА ГОТОВА. Персонаж: ${window.player.name}`);
    }); 
  }
}

function wakeUpServer() {
  const SERVER_URL = "https://darkworld-server.onrender.com";
  setTimeout(() => {
    fetch(SERVER_URL, { mode: 'no-cors' })
      .then(() => console.log("⏰ Будильник: Сигнал отправлен!"))
      .catch(() => console.warn("Сервер просыпается..."));
  }, 300);
}

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    startGame();
    wakeUpServer();
  }, 50);
});