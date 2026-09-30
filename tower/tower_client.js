// ============================================================================
// ===== 🏰 ИСПРАВЛЕННЫЙ КЛИЕНТСКИЙ МОДУЛЬ БАШНИ (TOWER_CLIENT.JS) =====
// ============================================================================

let towerSocket = null;
let localPlayer = null;
let currentActiveMode = 'floor'; // 'floor' или 'shop'
let activeCooldownEnd = null; // Храним время окончания КД
let isCooldownDataLoaded = false; // 🔥 Предохранитель загрузки данных КД

const FRONT_TOWER_SHOP_DATABASE = {
  'tower_elixir_big':  { price: 20,  icon: '🧪', name: "Эликсир Инквизитора", desc: "Концентрированный хил Башни. +50 HP." },
  'tower_sword_epic':  { price: 300, icon: '🗡️', name: "Оскверненный Клинок", desc: "Оружие Стражей. Требует: 14 Ловк. (Ур. 5)" },
  'tower_shield_epic': { price: 280, icon: '🛡️', name: "Эгида Покорителя", desc: "Выдерживает криты Стражей. Требует: 14 Вын. (Ур. 5)" }
};

function updateTowerLog(text, isError = false) {
  const logEl = document.getElementById('tower-status-log');
  if (!logEl) return;
  logEl.textContent = text;
  logEl.style.color = isError ? '#e74c3c' : '#2ecc71';
}

// 🔥 Обновление HP в шапке Башни через общий UI
function updateTowerHpDisplay() {
  const hpEl = document.getElementById('tower-hero-hp');
  if (!hpEl || !localPlayer) return;
  const currentHp = Number(localPlayer.hp || 0);
  const maxHp = (window.UI && window.UI.getMaxHp) ? window.UI.getMaxHp(localPlayer) : 10;
  hpEl.textContent = `❤️ ${currentHp} / ${maxHp}`;
}

function initTowerPage() {
  console.log("🎬 [СТАРТ] Инициализация страницы Башни...");

  // 🔥 Показываем заголовок только если НЕ в iframe
  const isInIframe = window.parent && window.parent !== window;
  const titleEl = document.getElementById('tower-page-title');
  if (titleEl && !isInIframe) {
    titleEl.style.display = 'block';
  }

  const localSave = localStorage.getItem('rpg_save');
  if (localSave) {
    try { localPlayer = JSON.parse(localSave).player; } catch(e) { console.error(e); }
  }

  if (!localPlayer) {
    alert("❌ Профиль не найден!");
    return;
  }

  console.log("📡 [БАШНЯ] Подключаемся к сокету...");
  
  // 🔥 ГИБРИДНЫЙ РЕЖИМ: сначала пробуем родителя, потом создаём свой сокет
  if (window.parent && window.parent !== window && window.parent.socket && window.parent.socket.connected) {
    towerSocket = window.parent.socket;
    console.log("✅ [БАШНЯ] Привязан к сокету родителя (города)");
  } else if (typeof io !== 'undefined') {
    // 🔥 Родителя нет — создаём свой сокет (для прямого захода или fallback)
    let handshakeUserId = localPlayer?.id || null;
    console.log(`⚠️ [БАШНЯ] Родителя нет — создаём свой сокет (userId: ${handshakeUserId})`);
    
    towerSocket = io('https://darkworld-server.onrender.com', {
      transports: ['websocket'],
      forceNew: false,
      auth: { userId: handshakeUserId }
    });
    
    towerSocket.on('connect', () => {
      console.log(`✅ [БАШНЯ] Свой сокет подключен: ${towerSocket.id}`);
      towerSocket.emit('load_tower_game_secure', { userId: localPlayer.id, username: localPlayer.name });
      towerSocket.emit('check_tower_cooldown_request', { userId: localPlayer.id });
    });
    
    towerSocket.on('connect_error', (err) => {
      console.error("🚨 [БАШНЯ] Ошибка подключения:", err.message);
    });
  } else {
    setTimeout(initTowerPage, 200);
    return;
  }
  
  window.towerSocket = towerSocket;
  towerSocket.userId = localPlayer.id;

  // 🔥 ФИКС: сразу показываем HP из кэша
  updateTowerHpDisplay();

  // 🔥 Слушатели Башни
  towerSocket.off('tower_load_game_success');
  towerSocket.on('tower_load_game_success', (data) => {
    if (data && data.player) {
      localPlayer = data.player;
      window.player = data.player;   // 🔥 синхронизация с общим UI
      localStorage.setItem('rpg_save', JSON.stringify({ player: localPlayer }));

      updateTowerHpDisplay();
      renderTowerInterface();
    }
  });

  towerSocket.off('tower_cooldown_status');
  towerSocket.on('tower_cooldown_status', (data) => {
    isCooldownDataLoaded = true;
    if (data && data.active && data.ends_at) {
      activeCooldownEnd = data.ends_at;
    } else {
      activeCooldownEnd = null;
    }
    renderTowerInterface();
    runCooldownTimer();
  });

  towerSocket.off('tower_shop_success');
  towerSocket.on('tower_shop_success', (data) => {
    updateTowerLog(data.message || "🎉 Успешно!");
    towerSocket.emit('load_tower_game_secure', { userId: localPlayer.id, username: localPlayer.name });
  });

  towerSocket.off('tower_shop_error');
  towerSocket.on('tower_shop_error', (data) => {
    updateTowerLog(data.message || "🚨 Ошибка", true);
  });

  // ❌ [УДАЛЕНО] Блок arena_redirect_to_battle — редирект в бой обрабатывает
  // только global_battle_watch.js с абсолютным путём от корня проекта

  // 🔥 HP регенерирует — обновляем визуально
  towerSocket.off('town_hp_regen_update');
  towerSocket.on('town_hp_regen_update', (data) => {
    if (!localPlayer) return;
    localPlayer.hp = data.currentHp;
    
    // 🔥 Используем единую функцию обновления
    updateTowerHpDisplay();
    
    localStorage.setItem('rpg_save', JSON.stringify({ player: localPlayer }));
  });

  // 🔥 Авторизуемся на сервере Башни
  towerSocket.emit('load_tower_game_secure', { userId: localPlayer.id, username: localPlayer.name });
  towerSocket.emit('check_tower_cooldown_request', { userId: localPlayer.id });
}

window.exitTower = function() {
  // 🔥 НЕ отключаем сокет — он принадлежит родителю!
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'CLOSE_TOWER_OVERLAY' }, '*');
  } else {
    window.location.replace('../index.html');
  }
};

// ============================================================================
// 🎨 ФУНКЦИЯ ОТРИСОВКИ ЭТАЖЕЙ И ЛАВКИ
// ============================================================================
function renderTowerInterface() {
  if (!localPlayer) return;

  // 🔥 ПОКАЗЫВАЕМ МОНЕТЫ БАШНИ
  const goldEl = document.getElementById('tower-wallet-gold');
  if (goldEl) {
    const coins = Number(localPlayer.tower_coins ?? 0);
    goldEl.textContent = `🪙 ${coins} монет Башни`;
    goldEl.style.color = '#f1c40f';
  }

  // 🔥 ФИКС: всегда обновляем HP при рендере
  updateTowerHpDisplay();

  const currentFloor = Number(localPlayer.tower_floor || 1);

  // 1. Отрисовка лифта этажей
  const floorsContainer = document.getElementById('area-tower-floors');
  if (floorsContainer) {
    floorsContainer.innerHTML = '';

    const startFloor = Math.max(1, currentFloor - 1);
    for (let f = startFloor; f <= currentFloor + 1; f++) {
      const card = document.createElement('div');
      card.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:14px; border-radius:10px; border:1px solid #2f3640; margin-bottom:8px;';

      let innerHtml = `<div><div style="font-weight:bold; font-size:15px;">🏰 Этаж ${f}</div>`;
      
      if (f < currentFloor) {
        card.style.background = 'rgba(46, 204, 113, 0.05)';
        card.style.borderColor = 'rgba(46, 204, 113, 0.3)';
        innerHtml += `<span style="color:#2ecc71; font-size:12px;">✅ Зачищен</span></div>`;
        innerHtml += `<button disabled style="padding:8px 16px; background:#222; color:#555; border:none; border-radius:6px; font-weight:bold;">Пройден</button>`;
      } 
      else if (f === currentFloor) {
        card.style.background = 'rgba(108, 92, 231, 0.1)';
        card.style.borderColor = 'rgba(108, 92, 231, 0.5)';
        innerHtml += `<span style="color:#a29bfe; font-size:12px;">⚔️ Текущий вызов</span></div>`;
        
        const isBanned = !isCooldownDataLoaded || (activeCooldownEnd && (new Date(activeCooldownEnd) > new Date()));
        innerHtml += `<button onclick="triggerTowerFight(this, ${f})" ${isBanned ? 'disabled' : ''} style="padding:8px 16px; background:${isBanned ? '#222' : '#6c5ce7'}; color:${isBanned ? '#555' : '#fff'}; border:none; border-radius:6px; font-weight:bold; cursor:${isBanned ? 'default' : 'pointer'}; box-shadow:${isBanned ? 'none' : '0 0 10px rgba(108,92,231,0.4)'};">В БОЙ</button>`;
      } 
      else {
        card.style.background = '#111';
        card.style.opacity = '0.4';
        innerHtml += `<span style="color:#718093; font-size:12px;">🔒 Заблокирован</span></div>`;
        innerHtml += `<button disabled style="padding:8px 16px; background:#222; color:#555; border:none; border-radius:6px; font-weight:bold;">🔒</button>`;
      }

      card.innerHTML = innerHtml;
      floorsContainer.appendChild(card);
    }
  }

  // 2. Отрисовка магазина
  const shopContainer = document.getElementById('tower-shop-scroll-area');
  if (shopContainer) {
    shopContainer.innerHTML = '';
    Object.keys(FRONT_TOWER_SHOP_DATABASE).forEach(itemId => {
      const item = FRONT_TOWER_SHOP_DATABASE[itemId];
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:12px; background:#111; border:1px solid #222; border-radius:8px; margin-bottom:8px;';

      const currentCoins = Number(localPlayer.tower_coins ?? 0);
      const canAfford = currentCoins >= item.price;

      let html = `<div style="display:flex; align-items:center; gap:12px;">`;
      html += `  <div style="font-size:24px; background:#1f2833; padding:8px; border-radius:6px;">${item.icon}</div>`;
      html += `  <div>`;
      html += `    <div style="font-weight:bold; color:#a29bfe; font-size:14px;">${item.name}</div>`;
      html += `    <div style="font-size:11px; color:#9aa0b5; margin-top:2px;">${item.desc}</div>`;
      html += `  </div>`;
      html += `</div>`;
      html += `<button onclick="triggerTowerBuy('${itemId}')" ${canAfford ? '' : 'disabled'} style="padding:8px 14px; background:${canAfford ? '#2ecc71' : 'rgba(255,255,255,0.05)'}; color:${canAfford ? '#fff' : '#666'}; border:none; border-radius:6px; font-weight:bold; cursor:${canAfford ? 'pointer' : 'not-allowed'};">🪙 ${item.price}</button>`;

      row.innerHTML = html;
      shopContainer.appendChild(row);
    });
  }
}

// 🔥 ИЗОЛИРОВАННЫЙ КЛИЕНТСКИЙ ТАЙМЕР
function runCooldownTimer() {
  const banner = document.getElementById('tower-cooldown-banner');
  const timerText = document.getElementById('cooldown-timer-text');
  if (!banner || !timerText) return;

  if (activeCooldownEnd) {
    const cooldownDate = new Date(activeCooldownEnd);
    const now = new Date();

    if (cooldownDate > now) {
      banner.style.display = 'block';

      clearInterval(window.towerTimerInterval);
      window.towerTimerInterval = setInterval(() => {
        const diff = new Date(activeCooldownEnd) - new Date();
        if (diff <= 0) {
          clearInterval(window.towerTimerInterval);
          banner.style.display = 'none';
          activeCooldownEnd = null;
          if (towerSocket) towerSocket.emit('check_tower_cooldown_request', { userId: localPlayer.id });
          return;
        }
        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);
        timerText.textContent = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
      }, 1000);
    } else {
      banner.style.display = 'none';
    }
  } else {
    banner.style.display = 'none';
  }
}

window.triggerTowerFight = function(btnElement, floorNumber) {
  console.log(`==================================================`);
  console.log(`🎯 [КЛИК] Игрок инициировал штурм. Этаж: ${floorNumber}`);

  // 1. АНТИ-СПАМ
  if (!btnElement || btnElement.disabled || btnElement.textContent === "⏳...") {
    console.log("🚫 [АНТИ-СПАМ] Повторный клик заблокирован");
    return;
  }

  // Блокируем кнопку
  btnElement.disabled = true;
  btnElement.textContent = "⏳...";
  btnElement.style.background = "#222";
  btnElement.style.boxShadow = "none";
  btnElement.style.pointerEvents = "none";

  // 2. Проверка КД
  if (activeCooldownEnd && new Date(activeCooldownEnd) > new Date()) {
    updateTowerLog("❌ Башня ещё заблокирована!", true);
    btnElement.disabled = false;
    btnElement.textContent = "В БОЙ";
    btnElement.style.background = "#6c5ce7";
    btnElement.style.pointerEvents = "auto";
    return;
  }

  // 3. РЕДИРЕКТ В БОЙ
  updateTowerLog("⚔️ Переход на этаж...");

  const projectRoot = window.location.pathname.includes('/tower/')
    ? window.location.pathname.split('/tower/')[0]
    : '';

  const battleUrl = `${projectRoot}/battle/battle.html?battleType=tower&floor=${floorNumber}`;

  console.log(`🚀 [РЕДИРЕКТ] Уходим в бой: ${battleUrl}`);

  setTimeout(() => {
    window.location.href = battleUrl;
  }, 200);
};

window.triggerTowerBuy = function(itemId) {
  towerSocket.emit('buy_tower_shop_item_secure', { userId: localPlayer.id, itemId: itemId });
};

window.switchTowerMode = function(mode) {
  currentActiveMode = mode;
  document.getElementById('area-tower-floors').style.display = mode === 'floor' ? 'flex' : 'none';
  document.getElementById('area-tower-shop').style.display = mode === 'shop' ? 'flex' : 'none';

  document.getElementById('nav-tab-floor').style.background = mode === 'floor' ? '#1f2833' : '#111';
  document.getElementById('nav-tab-floor').style.borderColor = mode === 'floor' ? '#6c5ce7' : '#333';
  document.getElementById('nav-tab-shop').style.background = mode === 'shop' ? '#1f2833' : '#111';
  document.getElementById('nav-tab-shop').style.borderColor = mode === 'shop' ? '#6c5ce7' : '#333';
};

document.addEventListener('DOMContentLoaded', initTowerPage);