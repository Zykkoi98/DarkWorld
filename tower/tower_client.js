// ============================================================================
// ===== 🏰 КЛИЕНТСКИЙ СЕТЕВОЙ МОДУЛЬ БАШНИ И ЛАВКИ (TOWER_CLIENT.JS) =====
// ============================================================================

let towerSocket = null;
let localPlayer = null;
let currentActiveMode = 'floor'; // 'floor' или 'shop'

// База данных товаров башни на фронтенде (синхронизировано с tower_config.js бэкенда)
const FRONT_TOWER_SHOP_DATABASE = {
  'tower_elixir_big':  { price: 20,  icon: '🧪', name: "Эликсир Инквизитора", desc: "Концентрированный хил Башни. Восстанавливает +50 HP прямо в бою." },
  'tower_sword_epic':  { price: 300, icon: '🗡️', name: "Оскверненный Клинок", desc: "Оружие, впитавшее кровь Стражей. Требует: 14 Ловк. (Ур. 5)" },
  'tower_shield_epic': { price: 280, icon: '🛡️', name: "Эгида Покорителя Башни", desc: "Выдерживает тяжелые критические удары. Требует: 14 Вын. (Ур. 5)" }
};

function updateTowerLog(text, isError = false) {
  const logEl = document.getElementById('tower-status-log');
  if (!logEl) return;
  logEl.textContent = text;
  logEl.style.color = isError ? '#e74c3c' : '#2ecc71';
}

function initTowerPage() {
  // 1. Извлекаем локальный профиль города
  const localSave = localStorage.getItem('rpg_save');
  if (localSave) {
    try { localPlayer = JSON.parse(localSave).player; } catch(e) { console.error(e); }
  }

  if (!localPlayer) {
    alert("❌ Профиль гладиатора не найден! Вернитесь на главную площадь.");
    window.location.replace('../index.html');
    return;
  }

  console.log("📡 Поднимаем сокет-мост штурма Башни...");
  towerSocket = io('https://darkworld-server.onrender.com', {
    transports: ['websocket'],
    forceNew: true
  });

  towerSocket.on('connect', () => {
    // Безопасно авторизуем сессию на сервере
    towerSocket.emit('load_game_secure', { userId: localPlayer.id, username: localPlayer.name });
  });

  towerSocket.on('load_game_success', (data) => {
    if (data && data.player) {
      localPlayer = data.player;
      localStorage.setItem('rpg_save', JSON.stringify({ player: localPlayer }));
      renderTowerInterface();
    }
  });

  // Ловим сигналы лавки Башни
  towerSocket.on('tower_shop_success', (data) => {
    updateTowerLog(data.message || "🎉 Успешная покупка!");
    towerSocket.emit('load_game_secure', { userId: localPlayer.id, username: localPlayer.name });
  });

  towerSocket.on('tower_shop_error', (data) => {
    updateTowerLog(data.message || "🚨 Ошибка покупки", true);
  });

  // Перенаправление на экран боя, если сервер запустил комнату
  towerSocket.on('arena_redirect_to_battle', (data) => {
    if (data && data.roomId) {
      towerSocket.disconnect();
      window.location.replace(`../battle/battle.html?roomId=${data.roomId}`);
    }
  });

  towerSocket.on('error', (msg) => { updateTowerLog(`❌ ${msg}`, true); });

  renderTowerInterface();
}

// ============================================================================
// 🎨 ФУНКЦИЯ ДИНАМИЧЕСКОЙ ОТРИСОВКИ ЭКРАНОВ
// ============================================================================
function renderTowerInterface() {
  if (!localPlayer) return;

  // Обновляем золото в шапке
  const goldEl = document.getElementById('tower-wallet-gold');
  if (goldEl) goldEl.textContent = `💰 Золото: ${localPlayer.gold} монет`;

  // Считываем текущий рекорд этажа игрока (из нашей новой колонки!)
  // Если колонка в профиле еще не прилетела, ставим по дефолту 1 этаж
  const currentFloor = Number(localPlayer.tower_floor || 1);

  // 1. РЕНДЕРИНГ ЛИФТА ЭТАЖЕЙ БАШНИ
  const floorsContainer = document.getElementById('area-tower-floors');
  if (floorsContainer) {
    floorsContainer.innerHTML = '';

    // Генерируем 3 карточки этажей: Пройденный, Текущий актуальный и Заблокированный (Будущий)
    const startFloor = Math.max(1, currentFloor - 1);
    for (let f = startFloor; f <= currentFloor + 1; f++) {
      const card = document.createElement('div');
      card.style.display = 'flex';
      card.style.justify = 'space-between';
      card.style.alignItems = 'center';
      card.style.padding = '14px';
      card.style.borderRadius = '10px';
      card.style.border = '1px solid #2f3640';

      let innerHtml = `<div><div style="font-weight:bold; font-size:15px;">🏰 Этаж ${f}</div>`;
      
      if (f < currentFloor) {
        // ЭТАЖ УЖЕ ПРОЙДЕН
        card.style.background = 'rgba(46, 204, 113, 0.05)';
        card.style.border = '1px solid rgba(46, 204, 113, 0.3)';
        innerHtml += `<span style="color:#2ecc71; font-size:12px;">✅ Зачищен</span></div>`;
        innerHtml += `<button disabled style="padding:8px 16px; background:#222; color:#555; border:none; border-radius:6px; font-weight:bold;">Пройден</button>`;
      } 
      else if (f === currentFloor) {
        // АКТУАЛЬНЫЙ ТЕКУЩИЙ ЭТАЖ ТРЕНУЕМОГО ТИРА
        card.style.background = 'rgba(108, 92, 231, 0.1)';
        card.style.border = '1px solid rgba(108, 92, 231, 0.5)';
        innerHtml += `<span style="color:#a29bfe; font-size:12px;">⚔️ Текущий вызов</span></div>`;
        innerHtml += `<button onclick="triggerTowerFight(${f})" style="padding:8px 16px; background:#6c5ce7; color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer; box-shadow:0 0 10px rgba(108,92,231,0.4);">В БОЙ</button>`;
      } 
      else {
        // ЭТАЖ ЕЩЕ ЗАБЛОКИРОВАН АНТИЧИТОМ
        card.style.background = '#111';
        card.style.opacity = '0.4';
        innerHtml += `<span style="color:#718093; font-size:12px;">🔒 Заблокирован</span></div>`;
        innerHtml += `<button disabled style="padding:8px 16px; background:#222; color:#555; border:none; border-radius:6px; font-weight:bold;">🔒</button>`;
      }

      card.innerHTML = innerHtml;
      floorsContainer.appendChild(card);
    }
  }

  // 2. РЕНДЕРИНГ МАГАЗИНА БАШНИ
  const shopContainer = document.getElementById('tower-shop-scroll-area');
  if (shopContainer) {
    shopContainer.innerHTML = '';
    Object.keys(FRONT_TOWER_SHOP_DATABASE).forEach(itemId => {
      const item = FRONT_TOWER_SHOP_DATABASE[itemId];
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justify = 'space-between';
      row.style.alignItems = 'center';
      row.style.padding = '12px';
      row.style.background = '#111';
      row.style.border = '1px solid #222';
      row.style.borderRadius = '8px';
      row.style.marginBottom = '8px';

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
// ============================================================================
  // 🔥 [ВСТАВЛЯЙ СТРОГО СЮДА!] ОБСЧЕТ ТАЙМЕРА КД НА ФРОНТЕНДЕ ДЛЯ ТАБЛИЦЫ ТАЙМЕРОВ
  // ============================================================================
  const banner = document.getElementById('tower-cooldown-banner');
  const timerText = document.getElementById('cooldown-timer-text');

  if (localPlayer.tower_cooldown_until && banner && timerText) {
    const cooldownDate = new Date(localPlayer.tower_cooldown_until);
    const now = new Date();

    if (cooldownDate > now) {
      banner.style.display = 'block';
      // Насильно блокируем кнопку «В БОЙ» на текущем этаже, пока тикает бан
      document.querySelectorAll('button[onclick*="triggerTowerFight"]').forEach(b => b.disabled = true);

      // Запускаем тикающий счетчик секунд
      clearInterval(window.towerTimerInterval);
      window.towerTimerInterval = setInterval(() => {
        const diff = new Date(localPlayer.tower_cooldown_until) - new Date();
        
        if (diff <= 0) {
          clearInterval(window.towerTimerInterval);
          banner.style.display = 'none';
          // КД прошло! Мгновенно перезапрашиваем сокет, чтобы разблокировать вход
          if (towerSocket) towerSocket.emit('load_game_secure', { userId: localPlayer.id, username: localPlayer.name });
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
  }
}

// ============================================================================
// 🎮 СЕТЕВЫЕ КЛИК-ОБРАБОТЧИКИ ДЛЯ КНОПОК
// ============================================================================
window.triggerTowerFight = function(floorNumber) {
  updateTowerLog("⏳ Отправка отряда на этаж...");
  // Запускаем безопасный процедурный спавн Башни на бэкенде!
  towerSocket.emit('start_tower_battle_secure', { 
    userId: localPlayer.id, 
    currentFloor: floorNumber 
  });
};

window.triggerTowerBuy = function(itemId) {
  towerSocket.emit('buy_tower_shop_item_secure', { 
    userId: localPlayer.id, 
    itemId: itemId 
  });
};

window.switchTowerMode = function(mode) {
  currentActiveMode = mode;
  document.getElementById('area-tower-floors').style.display = mode === 'floor' ? 'flex' : 'none';
  document.getElementById('area-tower-shop').style.display = mode === 'shop' ? 'flex' : 'none';

  // Меняем подсветку кнопок навигации
  document.getElementById('nav-tab-floor').style.background = mode === 'floor' ? '#1f2833' : '#111';
  document.getElementById('nav-tab-floor').style.borderColor = mode === 'floor' ? '#6c5ce7' : '#333';
  document.getElementById('nav-tab-shop').style.background = mode === 'shop' ? '#1f2833' : '#111';
  document.getElementById('nav-tab-shop').style.borderColor = mode === 'shop' ? '#6c5ce7' : '#333';
};

document.addEventListener('DOMContentLoaded', initTowerPage);