// ============================================================================
// ===== 🏰 ИСПРАВЛЕННЫЙ КЛИЕНТСКИЙ МОДУЛЬ БАШНИ (TOWER_CLIENT.JS) =====
// ============================================================================

let towerSocket = null;
let localPlayer = null;
let currentActiveMode = 'floor'; // 'floor' или 'shop'
let activeCooldownEnd = null; // Храним время окончания КД

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

function initTowerPage() {
  console.log("🎬 [СТАРТ ЗАГРУЗКИ] Инициализация страницы Башни...");

  // 🔥 [ЖЕЛЕЗНЫЙ БАРЬЕР] Если библиотека Socket.io еще не прогрузилась в браузер, 
  // мягко ждем 50мс и пробуем запуститься снова, предотвращая падение в Uncaught ReferenceError
  if (typeof io === 'undefined') {
    console.warn("⏳ [Socket.io ОЖИДАНИЕ] Библиотека io еще не готова, перезапуск через 50мс...");
    setTimeout(initTowerPage, 50);
    return;
  }

  const localSave = localStorage.getItem('rpg_save');
  if (localSave) {
    try { 
      localPlayer = JSON.parse(localSave).player; 
      console.log("💾 [ПРОФИЛЬ КЭШ] Успешно прочитан игрок из localStorage:", localPlayer.name);
    } catch(e) {
      console.error("🚨 [КЭШ ОШИБКА] Не удалось распарсить rpg_save:", e.message);
    }
  }

  if (!localPlayer) {
    alert("❌ Профиль гладиатора не найден! Вернитесь на площадь.");
    window.location.replace('../index.html');
    return;
  }

  console.log("📡 [СОКЕТ СВЯЗЬ] Поднимаем выделенный сокет-мост штурма Башни...");
  towerSocket = io('https://darkworld-server.onrender.com', {
    transports: ['websocket'],
    forceNew: true
  });

  // 1. СОБЫТИЕ CONNECT: Авторизация через наш изолированный эвент Башни
  towerSocket.on('connect', () => {
    console.log(`🔌 [СОКЕТ ПОДКЛЮЧЕН] Успешный коннект! Мой сокет-ID: ${towerSocket.id}`);
    console.log("📤 [ОТПРАВКА] Улетает запрос load_tower_game_secure и проверка КД...");
    
    // Передаем данные на наш новый серверный обработчик Башни
    towerSocket.emit('load_tower_game_secure', { userId: localPlayer.id, username: localPlayer.name });
    towerSocket.emit('check_tower_cooldown_request', { userId: localPlayer.id });
  });

  // 2. СОБЫТИЕ УСПЕШНОЙ АВТОР ИЗАЦИИ ОТ ЯДРА БАШНИ
    towerSocket.on('tower_load_game_success', (data) => {
    console.log("📥 [СОКЕТ БАШНИ] Легальный свежий профиль получен от сервера Башни!", data);
    if (data && data.player) {
      // Записываем актуальный профиль из Supabase в оперативную память фронтенда
      localPlayer = data.player;
      
      // Насильно затираем старый закешированный localStorage новой записью со 2-м этажом!
      localStorage.setItem('rpg_save', JSON.stringify({ player: localPlayer }));
      
      console.log(`🏰 УСПЕХ: Кэш ТГ сброшен! Локальный этаж теперь равен: ${localPlayer.tower_floor}`);
      
      // Перерисовываем монеты и лифт этажей под новые цифры
      renderTowerInterface();
    }
  });

  // 3. СОБЫТИЕ СТАТУСА КУЛДАУНА БАШНИ (ОБНОВЛЕНИЕ ТАЙМЕРА)
  towerSocket.on('tower_cooldown_status', (data) => {
    console.log("📥 [СОКЕТ БАШНИ] Получен статус кулдауна от сервера:", data);
    if (data && data.active && data.ends_at) {
      activeCooldownEnd = data.ends_at;
      console.log(`⏳ Башня на КД до: ${activeCooldownEnd}`);
    } else {
      activeCooldownEnd = null;
      console.log("🟢 Кулдаун отсутствует, вход в Башню открыт.");
    }
    renderTowerInterface();
    runCooldownTimer();
  });

  // 4. СОБЫТИЯ ЛАВКИ ИНКВИЗИТОРА
  towerSocket.on('tower_shop_success', (data) => {
    console.log("🛒 [ЛАВКА УСПЕХ] Товар куплен:", data.message);
    updateTowerLog(data.message || "🎉 Успешная покупка!");
    towerSocket.emit('load_tower_game_secure', { userId: localPlayer.id, username: localPlayer.name });
  });

  towerSocket.on('tower_shop_error', (data) => {
    console.error("🚨 [ЛАВКА ОШИБКА] Сервер отклонил покупку:", data.message);
    updateTowerLog(data.message || "🚨 Ошибка покупки", true);
  });

  // 5. КРИТИЧЕСКИЙ ПЕРЕХВАТ: РЕДИРЕКТ НА ЭКРАН СРАЖЕНИЯ
  towerSocket.on('arena_redirect_to_battle', (data) => {
    console.log("📥 [РЕДИРЕКТ СОКЕТ] Получена команда перехода на боевой экран!", data);
    if (data && data.roomId) {
      console.log(`🏃‍♂️ [ПЕРЕХОД] Уходим в комнату боя: ${data.roomId}. Отключаем сокет Башни...`);
      towerSocket.disconnect();
      window.location.replace(`../battle/battle.html?roomId=${data.roomId}`);
    } else {
      console.error("🚨 [РЕДИРЕКТ КРИТ] Команда пришла, но roomId пустой!", data);
    }
  });

  towerSocket.on('error', (msg) => { 
    console.error("🚨 [СЕТЕВАЯ ОШИБКА]:", msg);
    updateTowerLog(`❌ ${msg}`, true); 
  });
}

// ============================================================================
// 🎨 ФУНКЦИЯ ОТРИСОВКИ ЭТАЖЕЙ И ЛАВКИ
// ============================================================================
function renderTowerInterface() {
  if (!localPlayer) return;

  const goldEl = document.getElementById('tower-wallet-gold');
  if (goldEl) goldEl.textContent = `💰 ${localPlayer.gold} монет`;

  // Считываем этаж. Если колонки еще нет — ставим 1 этаж
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
        
        // Если тикает КД — кнопка штурма блокируется
        const isBanned = activeCooldownEnd && (new Date(activeCooldownEnd) > new Date());
        innerHtml += `<button onclick="triggerTowerFight(${f})" ${isBanned ? 'disabled' : ''} style="padding:8px 16px; background:${isBanned ? '#222' : '#6c5ce7'}; color:${isBanned ? '#555' : '#fff'}; border:none; border-radius:6px; font-weight:bold; cursor:${isBanned ? 'default' : 'pointer'}; box-shadow:${isBanned ? 'none' : '0 0 10px rgba(108,92,231,0.4)'};">В БОЙ</button>`;
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

      const canAfford = localPlayer.gold >= item.price;

      let html = `<div style="display:flex; align-items:center; gap:12px;">`;
      html += `  <div style="font-size:24px; background:#1f2833; padding:8px; border-radius:6px;">${item.icon}</div>`;
      html += `  <div>`;
      html += `    <div style="font-weight:bold; color:#a29bfe; font-size:14px;">${item.name}</div>`;
      html += `    <div style="font-size:11px; color:#9aa0b5; margin-top:2px;">${item.desc}</div>`;
      html += `  </div>`;
      html += `</div>`;
      html += `<button onclick="triggerTowerBuy('${itemId}')" ${canAfford ? '' : 'disabled'} style="padding:8px 12px; background:${canAfford ? '#2ecc71' : '#222'}; color:${canAfford ? '#fff' : '#555'}; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">💰 ${item.price}</button>`;

      row.innerHTML = html;
      shopContainer.appendChild(row);
    });
  }
}

// 🔥 [НОВОЕ] ИЗОЛИРОВАННЫЙ КЛИЕНТСКИЙ ТАЙМЕР
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

// Находим функцию клика по кнопке штурма и переписываем её:
window.triggerTowerFight = function(floorNumber) {
  console.log(`==================================================`);
  console.log(`🎯 [КЛИК] Игрок инициировал штурм. Этаж: ${floorNumber}`);
  console.log(`👤 Профиль игрока в localStorage: ID=${localPlayer?.id}, Name=${localPlayer?.name}`);
  
  if (!towerSocket || !towerSocket.connected) {
    console.error("🚨 [КЛИК ОШИБКА] Нет активного сокет-соединения с сервером Башни!");
    updateTowerLog("❌ Нет соединения с сервером!", true);
    return;
  }

  updateTowerLog("⏳ Отправка отряда на этаж...");
  
  console.log("📤 [ОТПРАВКА] Улетает эвент start_tower_battle_secure на бэкенд...");
  towerSocket.emit('start_tower_battle_secure', { 
    userId: localPlayer.id, 
    currentFloor: floorNumber 
  });
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