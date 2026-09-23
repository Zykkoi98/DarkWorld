// ============================================================================
// ===== 🛒 ИЗОЛИРОВАННЫЙ КЛИЕНТСКИЙ СКРИПТ ТОРГОВЛИ (SHOP_CLIENT.JS) =====
// ============================================================================

let shopSocket = null;
let localPlayer = null;
let currentTabClass = 'dodger'; // По умолчанию открыт прилавок уворотчиков

function initShopPage() {
  // 1. Извлекаем локальный профиль игрока для проверки золота/уровня на экране
  const localSave = localStorage.getItem('rpg_save');
  if (localSave) {
    try { localPlayer = JSON.parse(localSave).player; } catch(e) {}
  }

  if (!localPlayer) {
    alert("❌ Ошибка: Профиль персонажа не найден! Вернитесь на главную.");
    window.exitShop();
    return;
  }

  const parentWindow = window.parent;

  // Функция привязки к готовому сокету города
  const bindToParentSocket = () => {
    if (parentWindow && parentWindow.socket && parentWindow.socket.connected) {
      shopSocket = parentWindow.socket;
      
      // Навешиваем слушатели магазина на единый сокет
      shopSocket.on('load_game_success', (data) => {
        if (data && data.player) {
          localPlayer = data.player;
          localStorage.setItem('rpg_save', JSON.stringify({ player: localPlayer }));
          window.updateShopUi();
        }
      });

      shopSocket.on('shop_buy_success', (data) => {
        alert(data.message);
        if (data && data.player) {
          localPlayer = data.player;
          localStorage.setItem('rpg_save', JSON.stringify({ player: localPlayer }));
          window.updateShopUi();
        }
      });

      shopSocket.on('shop_buy_error', (data) => {
        alert(data.message);
        if (typeof window.updateShopUi === 'function') {
          window.updateShopUi();
        }
      });

      return true;
    }
    return false;
  };

  // 🔥 ФИКС ТРЕТЬЕГО СОКЕТА: Не плодим параллельные соединения при автозагрузке Telegram!
  if (!bindToParentSocket()) {
    console.log("⏳ Магазин ожидает инициализацию сокета города...");
    const waitForMasterSocket = setInterval(() => {
      if (bindToParentSocket()) {
        clearInterval(waitForMasterSocket);
        console.log("✅ Магазин успешно подключился к единому каналу города!");
        // Запрашиваем синхронизацию
        shopSocket.emit('load_game_secure', { userId: localPlayer.id, username: localPlayer.name });
      }
    }, 300);
  } else {
    // Если сокет уже был готов сразу
    shopSocket.emit('load_game_secure', { userId: localPlayer.id, username: localPlayer.name });
  }

  shopSocket.on('error', (msg) => { alert(`❌ Ошибка сети магазина: ${msg}`); });

  window.updateShopUi();
}

window.setShopClass = function(className) {
  currentTabClass = className;
  window.updateShopUi();
};

window.exitShop = function() {
  if (shopSocket) shopSocket.disconnect();
  window.location.replace('../index.html'); // Возврат на главную площадь города
};

window.updateShopUi = function() {
  // Обновляем золото в шапке страницы
  const goldText = document.getElementById('shop-user-gold');
  if (goldText && localPlayer) {
    goldText.textContent = `💰 Ваше Золото: ${localPlayer.gold} монет | Ваш уровень: ${localPlayer.level}`;
  }

  // Светим активную вкладку
  ['dodger', 'critter', 'tank'].forEach(c => {
    const btn = document.getElementById(`tab-${c}`);
    if (!btn) return;
    if (c === currentTabClass) {
      btn.style.background = 'var(--btn, #3498db)';
      btn.style.color = '#fff';
    } else {
      btn.style.background = 'rgba(255,255,255,0.05)';
      btn.style.color = '#8a94a6';
    }
  });

  const container = document.getElementById('shop-scroll-area');
  if (!container || !window.GAME_ITEMS_DATABASE) return;
  container.innerHTML = '';

  // Сортируем предметы по префиксам классов из config.js
  const filteredIds = Object.keys(window.GAME_ITEMS_DATABASE).filter(id => {
    if (currentTabClass === 'dodger') return id.startsWith('rogue_') || id.startsWith('bandit_') || id.startsWith('thief_') || id.startsWith('mercenary_') || id.startsWith('assassin_') || id.startsWith('stalker_') || id.startsWith('shadow_') || id.startsWith('phantom_') || id.startsWith('gale_') || id.startsWith('grandmaster_');
    if (currentTabClass === 'critter') return id.startsWith('scratched_') || id.startsWith('savage_') || id.startsWith('barbarian_') || id.startsWith('fury_') || id.startsWith('seeker_') || id.startsWith('heavy_halberd') || id.startsWith('highland_') || id.startsWith('slasher_') || id.startsWith('ravager_') || id.startsWith('berserk_') || id.startsWith('blood_') || id.startsWith('bloodlust_') || id.startsWith('reaper_') || id.startsWith('hellfire_') || id.startsWith('inferno_') || id.startsWith('executioner_') || id.startsWith('warlord_');
    if (currentTabClass === 'tank') return id.startsWith('wooden_') || id.startsWith('recruit_') || id.startsWith('militia_') || id.startsWith('iron_') || id.startsWith('guard_') || id.startsWith('knight_') || id.startsWith('order_') || id.startsWith('guardian_') || id.startsWith('heavy_boots') || id.startsWith('centurion_') || id.startsWith('ancient_') || id.startsWith('bastion_') || id.startsWith('gothic_') || id.startsWith('titan_') || id.startsWith('paladin_') || id.startsWith('immortal_') || id.startsWith('aegis_');
    return false;
  });

  // Группируем отфильтрованные вещи по уровням
  const itemsByLvl = {};
  filteredIds.forEach(id => {
    const item = window.GAME_ITEMS_DATABASE[id];
    if (!itemsByLvl[item.level]) itemsByLvl[item.level] = [];
    itemsByLvl[item.level].push({ id, ...item });
  });

  // Рендерим аккордеоны уровней
  Object.keys(itemsByLvl).sort((a,b) => a - b).forEach(lvl => {
    const block = document.createElement('div');
    block.className = 'lvl-group';

    const header = document.createElement('div');
    header.className = 'lvl-header';
    header.textContent = `📋 Комплекты вещей ${lvl} уровня`;
    block.appendChild(header);

    itemsByLvl[lvl].forEach(item => {
      const row = document.createElement('div');
      row.className = 'item-row';

      // 1. Извлекаем чистые статы игрока из локального сейва для проверки цвета
      const myAgility = localPlayer && localPlayer.stats ? Number(localPlayer.stats.agility || 1) : 1;
      const myLuck = localPlayer && localPlayer.stats ? Number(localPlayer.stats.luck || 1) : 1;
      const myEndurance = localPlayer && localPlayer.stats ? Number(localPlayer.stats.endurance || 1) : 1;

      let reqText = '';
      let hasEnoughStats = true; // Флаг для отслеживания пригодности шмотки

      // Динамически проверяем Ловкость
      if (item.req && item.req.agility) {
        reqText = ` 🏹Ловк:${item.req.agility}`;
        if (myAgility < item.req.agility) hasEnoughStats = false;
      }
      // Динамически проверяем Удачу
      if (item.req && item.req.luck) {
        reqText = ` 🍀Уд:${item.req.luck}`;
        if (myLuck < item.req.luck) hasEnoughStats = false;
      }
      // Динамически проверяем Выносливость
      if (item.req && item.req.endurance) {
        reqText = ` 🛡️Вын:${item.req.endurance}`;
        if (myEndurance < item.req.endurance) hasEnoughStats = false;
      }

      // Сверяем баланс и уровень для кнопки покупки
      const isLevelOk = localPlayer && localPlayer.level >= item.level;
      const isGoldOk = localPlayer && localPlayer.gold >= item.price;
      const canRenderBuy = isLevelOk && isGoldOk && hasEnoughStats; // Игрок может купить только если и статы в норме!

      // 2. 🔥 КРАСИМ ЦВЕТ СТАТОВ: зелёный (#2ecc71) или красный (#e74c3c)
      const statColor = hasEnoughStats ? '#2ecc71' : '#e74c3c';
      const lvlColor = isLevelOk ? '#2ecc71' : '#e74c3c';

      row.innerHTML = `
        <div class="item-icon">${item.icon}</div>
        <div class="item-info">
          <div class="item-name">${item.name}</div>
          <div class="item-desc">${item.desc}</div>
          <div style="font-size: 11px; font-weight: bold; margin-top: 2px;">
            <span style="color: ${statColor}">Требует: ${reqText}</span> 
            <span style="color: ${lvlColor}">(Lv. ${item.level})</span>
          </div>
        </div>
        <button onclick="window.triggerServerBuy('${item.id}')" class="btn-buy" style="background: ${canRenderBuy ? '#2ecc71' : 'rgba(255,255,255,0.04)'}; color: ${canRenderBuy ? '#fff' : '#656d78'}; pointer-events: ${canRenderBuy ? 'auto' : 'none'};">
          💰 ${item.price}
        </button>
      `;
      block.appendChild(row);
    });

    container.appendChild(block);
  });
};

window.triggerServerBuy = function(itemId) {
  if (!shopSocket || !localPlayer) return;
  
  // Ищем конкретную кнопку, на которую нажал игрок
  const btn = event.currentTarget || document.activeElement;
  if (btn && btn.tagName === 'BUTTON') {
    if (btn.disabled) return; // Защита от дублирующих вызовов
    btn.disabled = true;      // Блокируем кнопку на клиенте
    btn.textContent = '⏳...'; // Меняем текст, чтобы игрок видел загрузку
  }

  console.log(`📡 [ПОКУПКА] Отправляем ID товара на сервер: ${itemId}`);
  shopSocket.emit('buy_item_secure', {
    userId: localPlayer.id,
    itemId: itemId
  });
};

document.addEventListener('DOMContentLoaded', initShopPage);