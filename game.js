// ============================================================================
// ===== 🧱 КЛИЕНТСКОЕ ЯДРО ИГРЫ И МАТЕМАТИКА ХАРАКТЕРИСТИК (GAME_CORE.JS) =====
// ===== ЧАСТЬ 1 ИЗ 3: ЧИСТЫЕ СТАТЫ, НОВАЯ СТОЙКОСТЬ И ХАРДКОРНЫЙ ТАНК =====
// ============================================================================

window.player = null; // Глобальный объект игрока для сквозного доступа из всех файлов
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
    level: 1, xp: 0, gold: 50, currentTownIndex: 0, statPoints: 5, 
    stats: { strength: 1, agility: 1, endurance: 1, luck: 1 },
    inventory: { equipment: [], resources: [], consumables: [] },
    equipped: {
      head: null, body: null, legs: null, neck: null, gloves: null,
      mainHand: 'rusty_sword', offHand: null, potion: 'hp_potion_small', scroll: null,
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
      window.player.statPoints = (window.player.statPoints || 0) + (levelsGained * 5);
      window.player.hp = window.getMaxHp(window.player);
    } else {
      // Экстренный античит-сброс
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

  renderTown(); 
}

function renderTown() {
  const town = window.TOWNS[window.player.currentTownIndex];
  document.getElementById('current-town-name').textContent = town.name;
  const grid = document.getElementById('town-locations'); 
  if (!grid) return;
  grid.innerHTML = '';
  
  town.locations.forEach(loc => {
    const btn = document.createElement('button'); 
    btn.className = 'loc-btn';
    btn.innerHTML = `<span>${loc.icon}</span><span>${loc.name}</span>`;
    btn.addEventListener('click', function() {
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
      } else if (loc.name === "Магазин") {
        if (typeof window.openShop === 'function') window.openShop();
      } else if (loc.name === "Арена PvP") {
        const wrapper = document.getElementById('arena-iframe-wrapper');
        const frame = document.getElementById('arena-iframe-frame');
        if (wrapper && frame) {
          frame.src = 'arena.html'; 
          wrapper.style.display = 'flex'; // Жесткий фикс высоты iframe
        }
      } else { 
        alert(`Вы зашли в здание: ${loc.name}`); 
      }
    });
    grid.appendChild(btn);
  });

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

  const labels = { 
    strength: '💪 Сила', agility: '🏹 Ловкость', endurance: '🛡️ Выносливость', luck: '🍀 Удача' 
  };
  
  statsBody.textContent = '';
  const nextXp = xpToNext(window.player.level);
  const currentXp = (window.player.xp !== undefined) ? window.player.xp : 0;

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

  const pointsDiv = document.createElement('div');
  pointsDiv.style.cssText = 'margin:15px 0 5px 0; font-weight:bold; font-size:16px; color:#f1c40f; text-align:center;';
  pointsDiv.textContent = 'Доступно очков: ' + window._tempStatPoints;
  statsBody.appendChild(pointsDiv);

  const hr = document.createElement('hr');
  hr.style.cssText = 'border:0; border-top:1px solid rgba(255,255,255,0.1); margin:12px 0;';
  statsBody.appendChild(hr);

  const fixedOrderKeys = ['strength', 'agility', 'endurance', 'luck'];
  fixedOrderKeys.forEach(key => {
    const row = document.createElement('div'); 
    row.className = 'profile-row';
    
    const lSpan = document.createElement('span'); 
    lSpan.textContent = labels[key];
    
    const vSpan = document.createElement('span'); 
    vSpan.style.display = 'flex'; vSpan.style.alignItems = 'center'; 
    
    // 🔥 БРОНИРОВАННЫЙ ФИКС ЧТЕНИЯ: Никаких intellect и ??, только прямое чтение ключей Стойкости
    const baseVal = Number(window.player.stats[key] ?? 1);
    const gearBonus = typeof getEquipmentBonus === 'function' ? Number(getEquipmentBonus(window.player, key) || 0) : 0;
    const tempAdded = Number(window._tempStatDistribution[key] || 0);
    
    // Гарантируем математическое сложение чисел
    const totalVal = baseVal + gearBonus + tempAdded;

    const textContainer = document.createElement('span');
    textContainer.style.marginRight = '8px';
    
    let htmlContent = `<strong style="color: #ffffff; font-size: 15px;">${totalVal}</strong> `;
    if (tempAdded > 0) htmlContent += `<span style="color: #a29bfe; font-size: 12px; font-weight: bold;">(+${tempAdded} предв.)</span> `;
    htmlContent += `<span style="color: var(--hint); font-size: 12px;">(</span><span style="color: #f1c40f; font-size: 12px; font-weight: bold;">${baseVal}</span><span style="color: var(--hint); font-size: 12px;">)</span>`;
    if (gearBonus > 0) htmlContent += ` <span style="color: #2ecc71; font-size: 12px; font-weight: bold;">(+${gearBonus})</span>`;
    
    textContainer.innerHTML = htmlContent;
    vSpan.appendChild(textContainer);

    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display: flex; gap: 4px;';

    if (tempAdded > 0) {
      const minusBtn = document.createElement('button'); minusBtn.textContent = '-';
      minusBtn.style.cssText = 'background:#e74c3c; border:none; color:#fff; border-radius:6px; padding:3px 9px; font-weight:bold; cursor:pointer;';
      minusBtn.addEventListener('click', () => window.stepTempStat(key, 'minus'));
      btnContainer.appendChild(minusBtn);
    }
    if (window._tempStatPoints > 0) {
      const plusBtn = document.createElement('button'); plusBtn.textContent = '+';
      plusBtn.style.cssText = 'background:var(--btn); border:none; color:#fff; border-radius:6px; padding:3px 9px; font-weight:bold; cursor:pointer;';
      plusBtn.addEventListener('click', () => window.stepTempStat(key, 'plus'));
      btnContainer.appendChild(plusBtn);
    }

    vSpan.appendChild(btnContainer); row.appendChild(lSpan); row.appendChild(vSpan); statsBody.appendChild(row);
  });

  const anyChanges = Object.values(window._tempStatDistribution).some(v => v > 0);
  if (anyChanges) {
    const confirmBtn = document.createElement('button');
    confirmBtn.id = 'stat-save-btn';
    confirmBtn.className = 'battle-btn-finish';
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

// --- 🔥 ИНТЕРАКТИВНОЕ ОКНО ИНФОРМАЦИИ О ПРЕДМЕТЕ ---
window.showItemInfo = function(itemId, isEquipped, slotKey = null, ringIndex = null) {
  const itemData = window.getItemData(itemId);
  if (!itemData) return;

  const popover = document.getElementById('item-info-popover');
  const pName = document.getElementById('popover-item-name');
  const pIcon = document.getElementById('popover-item-icon');
  const pDesc = document.getElementById('popover-item-desc');
  const pBtn = document.getElementById('popover-item-action-btn');

  if (!popover || !pName || !pIcon || !pDesc || !pBtn) return;

  pName.textContent = itemData.name;
  pIcon.textContent = itemData.icon;

  let statsText = itemData.desc || '';
  if (itemData.bonus) {
    if (itemData.bonus.atk) statsText += `\n⚔️ Атака: +${itemData.bonus.atk}`;
    if (itemData.bonus.def) statsText += `\n🛡️ Защита: +${itemData.bonus.def}`;
    
    // Выводим БК-модификаторы на экран Mini App
    if (itemData.bonus.mf_crit) statsText += `\n💥 Мф. Критического удара: +${itemData.bonus.mf_crit}`;
    if (itemData.bonus.mf_anticrit) statsText += `\n🛡️ Мф. Против крита (Антикрит): +${itemData.bonus.mf_anticrit}`;
    if (itemData.bonus.mf_inv) statsText += `\n🏹 Мф. Увертывания: +${itemData.bonus.mf_inv}`;
    if (itemData.bonus.mf_antiinv) statsText += `\n🎯 Мф. Против увертывания: +${itemData.bonus.mf_antiinv}`;
    
    if (itemData.bonus.stats) {
      const b = itemData.bonus.stats;
      if (b.strength) statsText += `\n💪 Сила: +${b.strength}`;
      if (b.agility) statsText += `\n🏹 Ловкость: +${b.agility}`;
      if (b.endurance) statsText += `\n🛡️ Выносливость: +${b.endurance}`;
      if (b.luck) statsText += `\n🍀 Удача: +${b.luck}`;
    }
  }
  if (itemData.level) statsText += `\n🔒 Требуемый уровень: ${itemData.level}`;
  pDesc.innerText = statsText;

  if (isEquipped) {
    pBtn.textContent = '❌ Снять в рюкзак';
    pBtn.style.background = '#e74c3c';
    pBtn.onclick = function() {
      popover.style.display = 'none';
      window.unequipItem(slotKey, ringIndex);
    };
  } else {
    let isConsumable = itemData.heal || itemId.includes('potion') || itemId.includes('soup') || itemData.duration || itemId.includes('scroll');
    pBtn.textContent = isConsumable ? '🧪 Взять в бой' : '🛡️ Экипировать';
    pBtn.style.background = '#6c5ce7';
    pBtn.onclick = function() {
      popover.style.display = 'none';
      window.equipItem(itemId);
    };
  }
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

  // 1. Отрисовка 8 основных слотов экипировки куклы
  Object.keys(standardSlots).forEach(slotKey => {
    const slotEl = document.getElementById(`eslot-${slotKey}`);
    if (!slotEl) return;

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
    const slot = document.createElement('div'); 
    slot.className = 'inv-slot'; 
    slot.textContent = item.icon;
    slot.style.cssText = 'width: 70px; height: 60px; position: relative; font-size: 22px; cursor: pointer; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px;';
    
    if (item.count && item.count > 1) {
      const countEl = document.createElement('span'); 
      countEl.className = 'inv-count'; 
      countEl.textContent = item.count; 
      slot.appendChild(countEl);
    }
    
    slot.addEventListener('click', function() {
      window.showItemInfo(item.id, false); 
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