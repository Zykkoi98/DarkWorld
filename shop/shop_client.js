// ============================================================================
// ===== 🛒 ИЗОЛИРОВАННЫЙ АВТОНОМНЫЙ СКРИПТ ТОРГОВЛИ (SHOP_CLIENT.JS) =====
// ===== ЧАСТЬ 1 ИЗ 2: СЕТЕВОЕ СОЕДИНЕНИЕ И ЛОГИРОВАНИЕ В КОШЕЛЕК =====
// ============================================================================

let shopSocket = null;
let localPlayer = null;

// Состояние двухуровневого интерфейса (управляет вкладками Mini App)
let activeMainMode = 'ammo';       // 'ammo' (Амуниция), 'consumables' (Расходники), 'sell' (Продажа)
let activeAmmoClass = 'dodger';     // 'dodger' (Плут), 'critter' (Варвар), 'tank' (Танк)


// 🔥 Функция обновления статуса в кошельке магазина
function updateWalletStatusLog(text, isError = false) {
  const logEl = document.getElementById('wallet-status-log');
  if (!logEl) return;

  logEl.textContent = text;
  logEl.style.color = isError ? '#e74c3c' : '#2ecc71';
  logEl.style.background = isError ? 'rgba(231, 76, 60, 0.15)' : 'rgba(46, 204, 113, 0.15)';

  // 🔥 Автосброс через 3 секунды
  clearTimeout(window.__shopStatusTimeout);
  window.__shopStatusTimeout = setTimeout(() => {
    logEl.textContent = '🟢 Готов к торговле';
    logEl.style.color = '#2ecc71';
    logEl.style.background = 'rgba(0,0,0,0.2)';
  }, 3000);
}
// ============================================================================
// 🔥 ФИКС: универсальное обновление HP в шапке Магазина
// ============================================================================


function updateShopHpDisplay() {
  const hpEl = document.getElementById('shop-hero-hp');
  if (!hpEl || !localPlayer) return;
  
  const currentHp = Number(localPlayer.hp || 0);
  const baseEndurance = Number(localPlayer.stats?.endurance || localPlayer.endurance || 1);
  
  let gearEndurance = 0;
  let flatHpBonus = 0;
  
  if (localPlayer.equipped) {
    const slots = ['head', 'body', 'legs', 'gloves', 'neck', 'mainHand', 'offHand', 'extra'];
    
    const processItem = (itemId) => {
      if (!itemId || !window.getItemData) return;
      const itemData = window.getItemData(itemId);
      if (itemData?.bonus) {
        if (itemData.bonus.endurance) gearEndurance += itemData.bonus.endurance;
        if (itemData.bonus.stats?.endurance) gearEndurance += itemData.bonus.stats.endurance;
        if (itemData.bonus.hp) flatHpBonus += itemData.bonus.hp;
      }
    };
    
    slots.forEach(slot => processItem(localPlayer.equipped[slot]));
    if (Array.isArray(localPlayer.equipped.rings)) {
      localPlayer.equipped.rings.forEach(itemId => processItem(itemId));
    }
  }
  
  const maxHp = ((baseEndurance + gearEndurance) * 10) + flatHpBonus;
  hpEl.textContent = `❤️ ${currentHp} / ${maxHp}`;
}

function initShopPage() {
  const localSave = localStorage.getItem('rpg_save');
  if (localSave) {
    try { localPlayer = JSON.parse(localSave).player; } catch(e) { console.error(e); }
  }

  if (!localPlayer) {
    alert("❌ Ошибка: Профиль персонажа не найден!");
    return;
  }

  console.log("📡 [МАГАЗИН] Подключаемся к сокету родителя...");
  
  // 🔥 Всегда берём сокет у родителя (iframe города)
  if (window.parent && window.parent !== window && window.parent.socket) {
    shopSocket = window.parent.socket;
    console.log("✅ [МАГАЗИН] Привязан к сокету родителя (города)");
  } else {
    console.error("🚨 [МАГАЗИН] Родительский сокет не найден!");
    alert("Ошибка соединения. Вернитесь в город.");
    return;
  }
  
  window.shopSocket = shopSocket;

  // 🔥 ФИКС: сразу показываем HP из кэша
  updateShopHpDisplay();

  // 🔥 Слушатели
  shopSocket.off('shop_buy_success');
  shopSocket.on('shop_buy_success', (data) => {
    updateWalletStatusLog(data.message || "🎉 Успешно!");
    window.updateShopUi();
  });

  shopSocket.off('shop_buy_error');
  shopSocket.on('shop_buy_error', (data) => {
    updateWalletStatusLog(data.message || "🚨 Ошибка", true);
    window.updateShopUi();
  });

  // 🔥 HP регенерирует — обновляем визуально
  shopSocket.on('town_hp_regen_update', (data) => {
    if (!localPlayer) return;
    localPlayer.hp = data.currentHp;
    updateShopHpDisplay();
    localStorage.setItem('rpg_save', JSON.stringify({ player: localPlayer }));
  });

  // 🔥 СЛУШАЕМ ОБНОВЛЕНИЕ ПРОФИЛЯ — обновляем золото и UI после покупки/продажи
  if (window.__shopLoadGameHandler) {
    shopSocket.off('load_game_success', window.__shopLoadGameHandler);
  }

  window.__shopLoadGameHandler = (data) => {
    if (data && data.player) {
      console.log("☁️ [МАГАЗИН] Профиль обновлён. Золото:", data.player.gold);
      localPlayer = data.player;
      window.player = data.player;
      try { localStorage.setItem('rpg_save', JSON.stringify({ player: data.player })); } catch(e) {}
      window.updateShopUi();
    }
  };

  shopSocket.on('load_game_success', window.__shopLoadGameHandler);

  // 🔥 НЕ отправляем load_game_secure — сокет уже зарегистрирован городом
  // Но запрашиваем свежий профиль для магазина
  shopSocket.emit('load_game_secure', { userId: localPlayer.id, username: localPlayer.name });

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
  // 🔥 НЕ отключаем сокет — он принадлежит родителю!
  // Просто отправляем сообщение городу закрыть iframe
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'CLOSE_SHOP_OVERLAY' }, '*');
  } else {
    // Fallback — если открыт напрямую
    window.location.replace('../index.html');
  }
};
// ============================================================================
// ===== 🛒 SHOP_CLIENT.JS | ЧАСТЬ 2 | КУСОК 1 ИЗ 2: СЕТКА ВИТРИНЫ =====
// ============================================================================

window.updateShopUi = function() {
  if (!localPlayer) return;

  const goldValEl = document.getElementById('wallet-gold-value');
  if (goldValEl) goldValEl.textContent = `💰 Золото: ${localPlayer.gold} монет`;

  // 🔥 ФИКС: всегда обновляем HP при рендере
  updateShopHpDisplay();

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
  innerHtml += '<div onclick="window.UI.showItemInfo(\'' + itemId + '\', { context: \'shop\' });" style="display: flex; align-items: center; gap: 12px; flex: 1; cursor: pointer;">';
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
  innerHtml += '<div onclick="window.UI.showItemInfo(\'' + itemUuidOrId + '\', { context: \'shop\' });" style="display: flex; align-items: center; gap: 12px; flex: 1; cursor: pointer;">';
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


