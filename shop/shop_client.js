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
// ===== 🛒 ИЗОЛИРОВАННЫЙ АВТОНОМНЫЙ СКРИПТ ТОРГОВЛИ (SHOP_CLIENT.JS) =====
// ===== ЧАСТЬ 2 ИЗ 2: ОТРЕНДЕР ИНТЕРФЕЙСА И СОКЕТ-ТРАНЗАКЦИИ =====
// ============================================================================

window.updateShopUi = function() {
  if (!localPlayer) return;

  // Чистый вывод золота в левую часть кошелька (без упоминания уровня)
  const goldValEl = document.getElementById('wallet-gold-value');
  if (goldValEl) {
    goldValEl.textContent = `💰 Золото: ${localPlayer.gold} монет`;
  }

  // Подсвечиваем активные вкладки верхнего уровня (Амуниция / Расходники / Продажа)
  ['ammo', 'consumables', 'sell'].forEach(mode => {
    const btn = document.getElementById(`main-nav-${mode}`);
    if (btn) {
      if (mode === activeMainMode) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });

  // Управление видимостью подменю выбора комплектов (Уровень 2)
  const subMenu = document.getElementById('shop-sub-categories');
  if (subMenu) {
    if (activeMainMode === 'ammo') {
      subMenu.style.display = 'flex';
      
      // Подсвечиваем активный класс внутри подменю
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

  // ============================================================================
  // ВКЛАДКА ПРОДАЖИ: СКУПКА ЛЮБЫХ ПРЕДМЕТОВ ИЗ РЮКЗАКА ИГРОКА ЗА 50% МОНЕТ
  // ============================================================================
  if (activeMainMode === 'sell') {
    const eqItems = localPlayer.inventory?.equipment || [];
    const conItems = localPlayer.inventory?.consumables || [];

    if (eqItems.length === 0 && conItems.length === 0) {
      container.innerHTML = `<div class="shop-empty-msg">🎒 Ваш рюкзак совершенно пуст. Продавать торговцу нечего!</div>`;
      return;
    }

    const block = document.createElement('div');
    block.className = 'lvl-group';
    block.innerHTML = `<div class="lvl-header">🎒 Ваше снаряжение (Скупка за 50% цены)</div>`;

    // Выводим снаряжение
    eqItems.forEach(item => {
      const dbData = window.GAME_ITEMS_DATABASE[item.id];
      if (!dbData) return;
      renderSellRow(block, item.uuid, dbData, false);
    });

    // Выводим накопленные эликсиры/расходники
    conItems.forEach(item => {
      const dbData = window.GAME_ITEMS_DATABASE[item.id];
      if (!dbData) return;
      renderSellRow(block, item.id, dbData, true, item.count);
    });

    container.appendChild(block);
    return;
  }

  // ============================================================================
  // ВКЛАДКИ ПОКУПКИ: ФИЛЬТРАЦИЯ И ВЫВОД КАТАЛОГА АМУНИЦИИ ИЛИ ЭЛИКСИРОВ
  // ============================================================================
  const filteredIds = Object.keys(window.GAME_ITEMS_DATABASE).filter(id => {
    if (activeMainMode === 'consumables') return id.includes('potion') || id === 'fish_soup';
    
    if (activeMainMode === 'ammo') {
      if (activeAmmoClass === 'dodger') return id.startsWith('rogue_') || id.startsWith('bandit_') || id.startsWith('thief_') || id.startsWith('mercenary_') || id.startsWith('assassin_') || id.startsWith('stalker_') || id.startsWith('shadow_') || id.startsWith('phantom_') || id.startsWith('gale_') || id.startsWith('grandmaster_');
      if (activeAmmoClass === 'critter') return id.startsWith('scratched_') || id.startsWith('savage_') || id.startsWith('barbarian_') || id.startsWith('fury_') || id.startsWith('seeker_') || id.startsWith('heavy_halberd') || id.startsWith('highland_') || id.startsWith('slasher_') || id.startsWith('ravager_') || id.startsWith('berserk_') || id.startsWith('blood_') || id.startsWith('bloodlust_') || id.startsWith('reaper_') || id.startsWith('hellfire_') || id.startsWith('inferno_') || id.startsWith('executioner_') || id.startsWith('warlord_');
      if (activeAmmoClass === 'tank') return id.startsWith('wooden_') || id.startsWith('recruit_') || id.startsWith('militia_') || id.startsWith('iron_') || id.startsWith('guard_') || id.startsWith('knight_') || id.startsWith('order_') || id.startsWith('guardian_') || id.startsWith('heavy_boots') || id.startsWith('centurion_') || id.startsWith('ancient_') || id.startsWith('bastion_') || id.startsWith('gothic_') || id.startsWith('titan_') || id.startsWith('paladin_') || id.startsWith('immortal_') || id.startsWith('aegis_');
    }
    return false;
  });

  const itemsByLvl = {};
  filteredIds.forEach(id => {
    const item = window.GAME_ITEMS_DATABASE[id];
    if (!itemsByLvl[item.level]) itemsByLvl[item.level] = [];
    itemsByLvl[item.level].push({ id, ...item });
  });

  Object.keys(itemsByLvl).sort((a,b) => a - b).forEach(lvl => {
    const block = document.createElement('div');
    block.className = 'lvl-group';
    
    let titleText = (activeMainMode === 'consumables') ? '🧪 Эликсиры и боевой провиант' : `📋 Комплекты вещей ${lvl} уровня`;
    block.innerHTML = `<div class="lvl-header">${titleText}</div>`;

    itemsByLvl[lvl].forEach(item => {
      const row = document.createElement('div');
      row.className = 'item-row';

      const myAgi = Number(localPlayer.stats?.agility || 1);
      const myLuck = Number(localPlayer.stats?.luck || 1);
      const myEnd = Number(localPlayer.stats?.endurance || 1);

      let reqText = ''; let hasEnoughStats = true;
      if (item.req?.agility) { reqText = ` 🏹Ловк:${item.req.agility}`; if (myAgi < item.req.agility) hasEnoughStats = false; }
      if (item.req?.luck) { reqText = ` 🍀Уд:${item.req.luck}`; if (myLuck < item.req.luck) hasEnoughStats = false; }
      if (item.req?.endurance) { reqText = ` 🛡️Вын:${item.req.endurance}`; if (myEnd < item.req.endurance) hasEnoughStats = false; }

      const isLevelOk = localPlayer.level >= item.level;
      const isGoldOk = localPlayer.gold >= item.price;
      const canBuy = isLevelOk && isGoldOk && hasEnoughStats;

      const statColor = hasEnoughStats ? '#2ecc71' : '#e74c3c';
      const lvlColor = isLevelOk ? '#2ecc71' : '#e74c3c';

      row.innerHTML = `
        <div class="item-icon">${item.icon || '📦'}</div>
        <div class="item-info">
          <div class="item-name">${item.name}</div>
          <div class="item-desc">${item.desc}</div>
          <div style="font-size:11px; font-weight:bold; margin-top:2px;">
            <span style="color: ${statColor}">Требует: ${reqText || 'Нет'}</span> 
            <span style="color: ${lvlColor}">(Lv. ${item.level})</span>
          </div>
        </div>
        <button onclick="window.triggerServerBuy('${item.id}', event)" class="btn-buy" ${canBuy ? '' : 'disabled'}>
          💰 ${item.price}
        </button>
      `;
      block.appendChild(row);
    });
    container.appendChild(block);
  });
};

function renderSellRow(block, itemUuidOrId, dbData, isConsumable, count = 1) {
  const halfPrice = Math.floor(dbData.price * 0.5) || 1;
  const row = document.createElement('div');
  row.className = 'item-row';

  row.innerHTML = `
    <div class="item-icon">${dbData.icon || '📦'}</div>
    <div class="item-info">
      <div class="item-name">${dbData.name} ${isConsumable ? `<span style="color:#2ecc71">x\${count}</span>` : ''}</div>
      <div class="item-desc">${dbData.desc}</div>
    </div>
    <button onclick="window.triggerServerSell('${itemUuidOrId}', ${isConsumable}, event)" class="btn-sell-action">
      💸 +${halfPrice}
    </button>
  `;
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