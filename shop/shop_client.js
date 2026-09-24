// ============================================================================
// ===== 🛒 ИЗОЛИРОВАННЫЙ АВТОНОМНЫЙ СКРИПТ ТОРГОВЛИ (SHOP_CLIENT.JS) =====
// ===== ЧАСТЬ 1 ИЗ 2: СЕТЕВОЕ СОЕДИНЕНИЕ И ЛОГИРОВАНИЕ В КОШЕЛЕК =====
// ============================================================================

let shopSocket = null;
let localPlayer = null;

// Состояние двухуровневого интерфейса (управляет вкладками Mini App)
let activeMainMode = 'ammo';       // 'ammo' (Амуниция), 'consumables' (Расходники), 'sell' (Продажа)
let activeAmmoClass = 'dodger';     // 'dodger' (Плут), 'critter' (Варвар), 'tank' (Танк)

// 🔥 Функция вывода лога последней операции прямо в шапку кошелька
function updateWalletStatusLog(text, isError = false) {
  const logEl = document.getElementById('wallet-status-log');
  if (!logEl) return;
  
  logEl.textContent = text;
  logEl.style.color = isError ? '#e74c3c' : '#2ecc71'; // Красный текст при ошибке, зеленый при успехе
}

function initShopPage() {
  const localSave = localStorage.getItem('rpg_save');
  if (localSave) {
    try { localPlayer = JSON.parse(localSave).player; } catch(e) { console.error(e); }
  }

  if (!localPlayer) {
    alert("❌ Ошибка: Профиль персонажа не найден! Вернитесь на главную площадь.");
    window.exitShop();
    return;
  }

  console.log("📡 [АВТОНОМНЫЙ МАГАЗИН] Поднимаем сокет лавки...");
  
  if (typeof io !== 'undefined') {
    shopSocket = io('https://darkworld-server.onrender.com', {
      transports: ['websocket'],
      forceNew: true,
      upgrade: false
    });
  } else {
    alert("Ошибка сети: Библиотека Socket.io отсутствует в разметке.");
    return;
  }

  shopSocket.on('connect', () => {
    console.log("✅ [МАГАЗИН] Подключено к серверу, сокет ID:", shopSocket.id);
    shopSocket.emit('load_game_secure', { userId: localPlayer.id, username: localPlayer.name });
  });

  shopSocket.off('load_game_success');
  shopSocket.on('load_game_success', (data) => {
    if (data && data.player) {
      localPlayer = data.player;
      localStorage.setItem('rpg_save', JSON.stringify({ player: localPlayer }));
      window.updateShopUi();
    }
  });

  // 🔥 Ловим успешную покупку/продажу и сразу пишем статус в кошелек без алертов
  shopSocket.off('shop_buy_success');
  shopSocket.on('shop_buy_success', (data) => {
    updateWalletStatusLog(data.message || "🎉 Успешно!");
    window.updateShopUi();
  });

  // Ловим ошибки (недостаточно золота, мало статов) и красим лог в красный
  shopSocket.off('shop_buy_error');
  shopSocket.on('shop_buy_error', (data) => {
    updateWalletStatusLog(data.message || "🚨 Ошибка", true);
    window.updateShopUi(); 
  });

  shopSocket.off('error');
  shopSocket.on('error', (msg) => { 
    updateWalletStatusLog(`❌ Ошибка сети`, true);
    window.updateShopUi();
  });

  window.updateShopUi();
}

window.switchShopMode = function(mode) {
  if (activeMainMode === mode) return;
  activeMainMode = mode;
  window.updateShopUi();
};

window.setShopClass = function(className) {
  if (activeAmmoClass === className) return;
  activeAmmoClass = className;
  window.updateShopUi();
};
window.exitShop = function() {
  if (shopSocket) {
    try { shopSocket.disconnect(); } catch(e) { console.error(e); }
  }
  window.location.replace('../index.html');
};
// ============================================================================
// ===== 🛒 SHOP_CLIENT.JS | ЧАСТЬ 2 | КУСОК 1 ИЗ 2: СЕТКА ВИТРИНЫ =====
// ============================================================================

window.updateShopUi = function() {
  if (!localPlayer) return;

  const goldValEl = document.getElementById('wallet-gold-value');
  if (goldValEl) goldValEl.textContent = `💰 Золото: ${localPlayer.gold} монет`;

  ['ammo', 'consumables', 'sell'].forEach(mode => {
    const btn = document.getElementById(`main-nav-${mode}`);
    if (btn) {
      if (mode === activeMainMode) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });

  const subMenu = document.getElementById('shop-sub-categories');
  if (subMenu) {
    if (activeMainMode === 'ammo') {
      subMenu.style.display = 'flex';
      ['dodger', 'critter', 'tank'].forEach(cls => {
        const subBtn = document.getElementById(`sub-tab-${cls}`);
        if (subBtn) {
          if (cls === activeAmmoClass) subBtn.classList.add('active');
          else subBtn.classList.remove('active');
        }
      });
    } else {
      subMenu.style.display = 'none';
    }
  }

  const container = document.getElementById('shop-scroll-area');
  if (!container) return;
  container.innerHTML = '';

  if (activeMainMode === 'sell') {
    const eqItems = localPlayer.inventory?.equipment || [];
    const conItems = localPlayer.inventory?.consumables || [];
    if (eqItems.length === 0 && conItems.length === 0) {
      container.innerHTML = `<div class="shop-empty-msg">🎒 Ваш рюкзак пуст.</div>`;
      return;
    }
    const block = document.createElement('div');
    block.className = 'lvl-group';
    block.innerHTML = `<div class="lvl-header">🎒 Ваше снаряжение (Скупка за 50% цены)</div>`;

    eqItems.forEach(item => {
      const dbData = window.GAME_ITEMS_DATABASE[item.id];
      if (dbData) renderSellRow(block, item.uuid, dbData, false);
    });
    conItems.forEach(item => {
      const dbData = window.GAME_ITEMS_DATABASE[item.id];
      if (dbData) renderSellRow(block, item.id, dbData, true, item.count);
    });
    container.appendChild(block);
    return;
  }

  if (activeMainMode === 'consumables') {
    const allItems = window.GAME_ITEMS_DATABASE;
    const potions = Object.keys(allItems).filter(id => id.includes('potion') || id === 'fish_soup');
    const scrolls = Object.keys(allItems).filter(id => id.includes('scroll'));

    if (potions.length > 0) {
      const block = document.createElement('div');
      block.className = 'lvl-group';
      block.innerHTML = `<div class="lvl-header">🧪 Целебные эликсиры и еда</div>`;
      potions.forEach(id => renderShopRow(block, id, allItems[id]));
      container.appendChild(block);
    }
    if (scrolls.length > 0) {
      const block = document.createElement('div');
      block.className = 'lvl-group';
      block.innerHTML = `<div class="lvl-header">📜 Магические свитки</div>`;
      scrolls.forEach(id => renderShopRow(block, id, allItems[id]));
      container.appendChild(block);
    }
    return;
  }

  const filteredIds = Object.keys(window.GAME_ITEMS_DATABASE).filter(id => {
    if (activeAmmoClass === 'dodger') return id.startsWith('rogue_') || id.startsWith('bandit_') || id.startsWith('thief_') || id.startsWith('mercenary_') || id.startsWith('assassin_') || id.startsWith('stalker_') || id.startsWith('shadow_') || id.startsWith('phantom_') || id.startsWith('gale_') || id.startsWith('grandmaster_');
    if (activeAmmoClass === 'critter') return id.startsWith('scratched_') || id.startsWith('savage_') || id.startsWith('barbarian_') || id.startsWith('fury_') || id.startsWith('seeker_') || id.startsWith('heavy_halberd') || id.startsWith('highland_') || id.startsWith('slasher_') || id.startsWith('ravager_') || id.startsWith('berserk_') || id.startsWith('blood_') || id.startsWith('bloodlust_') || id.startsWith('reaper_') || id.startsWith('hellfire_') || id.startsWith('inferno_') || id.startsWith('executioner_') || id.startsWith('warlord_');
    if (activeAmmoClass === 'tank') return id.startsWith('wooden_') || id.startsWith('recruit_') || id.startsWith('militia_') || id.startsWith('iron_') || id.startsWith('guard_') || id.startsWith('knight_') || id.startsWith('order_') || id.startsWith('guardian_') || id.startsWith('heavy_boots') || id.startsWith('centurion_') || id.startsWith('ancient_') || id.startsWith('bastion_') || id.startsWith('gothic_') || id.startsWith('titan_') || id.startsWith('paladin_') || id.startsWith('immortal_') || id.startsWith('aegis_');
    return false;
  });

  const itemsByLvl = {};
  filteredIds.forEach(id => {
    const item = window.GAME_ITEMS_DATABASE[id];
    const itemLvl = item.level || 1;
    if (!itemsByLvl[itemLvl]) itemsByLvl[itemLvl] = [];
    itemsByLvl[itemLvl].push({ id, ...item });
  });

  Object.keys(itemsByLvl).sort((a,b) => a - b).forEach(lvl => {
    const block = document.createElement('div');
    block.className = 'lvl-group';
    block.innerHTML = `<div class="lvl-header">📋 Комплекты вещей ${lvl} уровня</div>`;
    itemsByLvl[lvl].forEach(item => renderShopRow(block, item.id, item));
    container.appendChild(block);
  });
};
// ============================================================================
// ===== 🛒 SHOP_CLIENT.JS | ЧАСТЬ 2 | КУСОК 2 ИЗ 2: БРОНИРОВАННЫЙ РЕНДЕР =====
// ============================================================================

function renderShopRow(block, itemId, item) {
  const row = document.createElement('div');
  row.className = 'item-row';

  const myAgi = Number(localPlayer.stats?.agility || 1);
  const myLuck = Number(localPlayer.stats?.luck || 1);
  const myEnd = Number(localPlayer.stats?.endurance || 1);

  let reqText = ''; let hasEnoughStats = true;
  if (item.req?.agility) { reqText = ' 🏹Ловк:' + item.req.agility; if (myAgi < item.req.agility) hasEnoughStats = false; }
  if (item.req?.luck) { reqText = ' 🍀Уд:' + item.req.luck; if (myLuck < item.req.luck) hasEnoughStats = false; }
  if (item.req?.endurance) { reqText = ' 🛡️Вын:' + item.req.endurance; if (myEnd < item.req.endurance) hasEnoughStats = false; }

  const isLevelOk = item.level ? (localPlayer.level >= item.level) : true;
  const isGoldOk = localPlayer.gold >= item.price;
  const canBuy = isLevelOk && isGoldOk && hasEnoughStats;

  const statColor = hasEnoughStats ? '#2ecc71' : '#e74c3c';
  const lvlColor = isLevelOk ? '#2ecc71' : '#e74c3c';

  // 🔥 БРОНИРОВАННАЯ СБОРКА СТРОКИ: Убрали шаблонные кавычки, чтобы полностью исключить баги с {item.level}
  let innerHtml = '';
  innerHtml += '<div onclick="if(window.parent && window.parent.showItemInfo) { window.parent.showItemInfo(\'' + itemId + '\', false); } else if(typeof window.showItemInfo === \'function\') { window.showItemInfo(\'' + itemId + '\', false); }" style="display: flex; align-items: center; gap: 12px; flex: 1; cursor: pointer;">';
  innerHtml += '  <div class="item-icon">' + (item.icon || '📦') + '</div>';
  innerHtml += '  <div class="item-info">';
  innerHtml += '    <div class="item-name" style="text-decoration: underline; color: #a29bfe;">' + item.name + '</div>';
  innerHtml += '    <div class="item-desc">' + item.desc + '</div>';
  innerHtml += '    <div style="font-size:11px; font-weight:bold; margin-top:2px;">';
  innerHtml += '      <span style="color: ' + statColor + ';">Требует: ' + (reqText || 'Нет') + '</span> ';
  if (item.level) {
    innerHtml += '    <span style="color: ' + lvlColor + ';">(Lv. ' + item.level + ')</span>';
  }
  innerHtml += '    </div>';
  innerHtml += '  </div>';
  innerHtml += '</div>';
  innerHtml += '<button onclick="window.triggerServerBuy(\'' + itemId + '\', event)" class="btn-buy" ' + (canBuy ? '' : 'disabled') + '>';
  innerHtml += '  💰 ' + item.price;
  innerHtml += '</button>';

  row.innerHTML = innerHtml;
  block.appendChild(row);
}

function renderSellRow(block, itemUuidOrId, dbData, isConsumable, count = 1) {
  const halfPrice = Math.floor(dbData.price * 0.5) || 1;
  const row = document.createElement('div');
  row.className = 'item-row';

  let innerHtml = '';
  innerHtml += '<div onclick="if(window.parent && window.parent.showItemInfo) { window.parent.showItemInfo(\'' + itemUuidOrId + '\', false); } else if(typeof window.showItemInfo === \'function\') { window.showItemInfo(\'' + itemUuidOrId + '\', false); }" style="display: flex; align-items: center; gap: 12px; flex: 1; cursor: pointer;">';
  innerHtml += '  <div class="item-icon">' + (dbData.icon || '📦') + '</div>';
  innerHtml += '  <div class="item-info">';
  
  let displayName = dbData.name;
  if (isConsumable) displayName += ' <span style="color:#2ecc71">x' + count + '</span>';
  
  innerHtml += '    <div class="item-name" style="text-decoration: underline; color: #e67e22;">' + displayName + '</div>';
  innerHtml += '    <div class="item-desc">' + dbData.desc + '</div>';
  innerHtml += '  </div>';
  innerHtml += '</div>';
  innerHtml += '<button onclick="window.triggerServerSell(\'' + itemUuidOrId + '\', ' + !!isConsumable + ', event)" class="btn-sell-action">';
  innerHtml += '  💸 +' + halfPrice;
  innerHtml += '</button>';

  row.innerHTML = innerHtml;
  block.appendChild(row);
}

window.triggerServerBuy = function(itemId, event) {
  const btn = event.currentTarget;
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
  shopSocket.emit('buy_item_secure', { userId: localPlayer.id, itemId: itemId });
};

window.triggerServerSell = function(itemUuidOrId, isConsumable, event) {
  const btn = event.currentTarget;
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
  shopSocket.emit('sell_item_secure', { 
    userId: localPlayer.id, 
    itemUuidOrId: itemUuidOrId, 
    isConsumable: !!isConsumable 
  });
};

document.addEventListener('DOMContentLoaded', initShopPage);


// 🔥 ЛОКАЛЬНЫЙ ОБРАБОТЧИК ХАРАКТЕРИСТИК С ДИНАМИЧЕСКИМИ ИКОНКАМИ ✅ / 🔒 ДЛЯ ВСЕХ ТРЕБОВАНИЙ
window.showItemInfo = function(itemUuidOrId) {
  if (!itemUuidOrId) return;

  // 1. Сначала проверяем, не лежит ли этот конкретный уникальный предмет в рюкзаке у игрока
  let uniqueItemInInv = null;
  if (localPlayer && localPlayer.inventory && localPlayer.inventory.equipment) {
    uniqueItemInInv = localPlayer.inventory.equipment.find(i => i.uuid === itemUuidOrId);
  }

  let itemData = null;

  // 2. Если вещь найдена в рюкзаке и у нее есть измененные бонуса (заточка/руны) — берем их!
  if (uniqueItemInInv && uniqueItemInInv.bonus) {
    itemData = uniqueItemInInv; 
  } else {
    // Если вещи в рюкзаке нет (витрина покупки) или у нее нет модификаций — берем чистую базу
    let cleanId = itemUuidOrId;
    if (itemUuidOrId.includes('_') && !window.GAME_ITEMS_DATABASE[itemUuidOrId]) {
      const parts = itemUuidOrId.split('_'); 
      if (parts.length > 2) cleanId = parts.slice(0, -2).join('_');
    }
    itemData = window.GAME_ITEMS_DATABASE[cleanId];
  }

  if (!itemData) {
    console.error('🚨 [ЛАВКА] Предмет с ID "' + itemUuidOrId + '" не найден в базах данных');
    return;
  }

  const popover = document.getElementById('item-info-popover');
  const pName = document.getElementById('popover-item-name');
  const pIcon = document.getElementById('popover-item-icon');
  const pDesc = document.getElementById('popover-item-desc');

  if (!popover || !pName || !pIcon || !pDesc) return;

  // Запасной вывод уровня заточки прямо в название, если в будущем добавишь поле itemData.sharpen
  const sharpenSuffix = itemData.sharpen ? ' (+' + itemData.sharpen + ')' : '';
  pName.textContent = itemData.name + sharpenSuffix;
  pIcon.textContent = itemData.icon || '📦';

  // Собираем текст по строгой структуре: Описание -> Требования -> Бонусы
  let statsText = itemData.desc || '';
  if (statsText) statsText += '\n';

  // 3. 🔒 РАЗДЕЛ ТРЕБОВАНИЙ (Выводится в первую очередь с проверкой на ✅ или 🔒)
  let reqsText = '';
  
  // А. Динамическая проверка уровня
  if (itemData.level) {
    const pLevel = localPlayer && localPlayer.level ? Number(localPlayer.level) : 1;
    const levelIcon = (pLevel >= Number(itemData.level)) ? '✅' : '🔒';
    reqsText += '\n' + levelIcon + ' Требуется уровень: ' + itemData.level;
  }
  
  // Б. Динамическая проверка базовых характеристик игрока
  if (itemData.req) {
    const pStr = localPlayer && localPlayer.stats && localPlayer.stats.strength ? Number(localPlayer.stats.strength) : 1;
    const pAgi = localPlayer && localPlayer.stats && localPlayer.stats.agility ? Number(localPlayer.stats.agility) : 1;
    const pEnd = localPlayer && localPlayer.stats && localPlayer.stats.endurance ? Number(localPlayer.stats.endurance) : 1;
    const pLuck = localPlayer && localPlayer.stats && localPlayer.stats.luck ? Number(localPlayer.stats.luck) : 1;

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
  
  if (reqsText) {
    statsText += reqsText + '\n';
  }

  // 4. ✨ РАЗДЕЛ БОНУСОВ И СТАТОВ ВЕЩИ (Выводится во вторую очередь)
  let bonusesText = '';
  if (itemData.bonus) {
    if (itemData.bonus.atk) bonusesText += '\n⚔️ Бонус Атаки: +' + itemData.bonus.atk;
    if (itemData.bonus.def) bonusesText += '\n🛡️ Бонус Защиты: +' + itemData.bonus.def;
    if (itemData.bonus.mf_crit) bonusesText += '\n💥 Мф. Критического удара: +' + itemData.bonus.mf_crit + '%';
    if (itemData.bonus.mf_inv) bonusesText += '\n🏹 Мф. Увертывания: +' + itemData.bonus.mf_inv + '%';
    if (itemData.bonus.mf_antiinv) bonusesText += '\n🎯 Мф. Против увертывания: +' + itemData.bonus.mf_antiinv + '%';
    if (itemData.bonus.mf_anticrit) bonusesText += '\n🛡️ Мф. Против крита: +' + itemData.bonus.mf_anticrit + '%';
    
    // Бонусы к статам
    if (itemData.bonus.stats) {
      const b = itemData.bonus.stats;
      if (b.strength) bonusesText += '\n💪 Добавляет Силу: +' + b.strength;
      if (b.agility) bonusesText += '\n🏹 Добавляет Ловкость: +' + b.agility;
      if (b.endurance) bonusesText += '\n🛡️ Добавляет Выносливость: +' + b.endurance;
      if (b.luck) bonusesText += '\n🍀 Добавляет Удачу: +' + b.luck;
    }
  }

  if (bonusesText) {
    statsText += '\n⭐ Бонусы предмета:' + bonusesText;
  }
  
  pDesc.innerText = statsText;
  popover.style.display = 'flex'; 
};