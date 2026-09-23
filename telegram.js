// ============================================================================
// ===== 🛡️ ЗАЩИЩЕННЫЙ КЛИЕНТСКИЙ СЕТЕВОЙ МОСТ (TELEGRAM_SUPABASE.JS) =====
// ===== ЧАСТЬ 1 ИЗ 2: ПОДКЛЮЧЕНИЕ СОКЕТОВ И АВТОРИЗАЦИЯ ИГРОКА =====
// ============================================================================

const TG = window.Telegram?.WebApp;

/**
 * ГЛАВНАЯ ФУНКЦИЯ БЕЗОПАСНОЙ ЗАГРУЗКИ ПРОФИЛЯ
 * Устанавливает соединение с сервером и запрашивает синхронизацию аккаунта
 */
window.loadGame = function(callback) {
  const TG = window.Telegram?.WebApp;
  const tgUser = TG?.initDataUnsafe?.user;
  
  // 🔥 ЗАЩИТА ОТ ДВОЙНОГО СТАРТА: Если сокет уже существует, не создаем его заново!
  if (window.socket) {
    console.log("⚠️ Сокет города уже инициализирован, пропускаем повторный вызов.");
    if (window.socket.connected && typeof callback === 'function') {
      callback(null);
    } else {
      setupSecureDataListeners(callback);
    }
    return;
  }

  console.log("📡 Подключаем сокет города к боевому серверу Render...");
  if (typeof io !== 'undefined') {
    // Создаем ОДНО единственное соединение
    window.socket = io('https://darkworld-server.onrender.com', {
       transports: ['websocket'], // Отключаем polling, работаем ТОЛЬКО через чистые, быстрые веб-сокеты
      forceNew: false,
      rememberUpgrade: true
    });
    setupSecureDataListeners(callback);
  } else {
    console.error("❌ Критическая ошибка: Библиотека Socket.io не подключена в index.html!");
    if (typeof callback === 'function') callback("Socket.io missing");
    return;
  }

  let userId = 777777;
  let username = "Браузерный_Тестер";

  if (TG && tgUser) {
    userId = Number(tgUser.id);
    username = tgUser.first_name || "Рыцарь";
  }

  window.socket.emit('load_game_secure', { userId, username });
};

/**
 * ВНУТРЕННИЙ ПЕРЕХВАТЧИК СЕТЕВЫХ ОТВЕТОВ ОТ СЕРВЕРА
 */
function setupSecureDataListeners(callback) {
  if (!window.socket) return;

  // Сбрасываем старые дубликаты слушателей
  window.socket.off('load_game_success');
  window.socket.off('player_not_found');
  window.socket.off('load_game_failed');
  window.socket.off('stat_distribution_error');
  // 🔥 НАДЕЖНЫЙ ФИКС: Гарантированно сбрасываем старый боевой редирект
  window.socket.off('arena_redirect_to_battle');

  // 🔥 ГЛОБАЛЬНЫЙ ПЕРЕХВАТЧИК PvP (В КОРНЕ ГОРОДА):
  // Сокет гарантированно создан и активен. Поймает вызов из любой точки Mini App!
  window.socket.on('arena_redirect_to_battle', (data) => {
    console.log("⚔️ [ГЛОБАЛЬНЫЙ ПЕРЕХВАТ] Оппонент принял вызов! Мгновенный переход в бой...");
    
    // Очищаем iframe Арены на верхнем уровне, чтобы он не мешал
    const wrapper = document.getElementById('arena-iframe-wrapper');
    const frame = document.getElementById('arena-iframe-frame');
    if (wrapper) wrapper.style.display = 'none';
    if (frame) frame.src = 'about:blank';

    // Совершаем чистый переход на боевой экран прямо из корня города
    window.location.href = `battle/battle.html?roomId=${data.roomId}`;
  });
  // Перехват ошибок распределения характеристик
  window.socket.on('stat_distribution_error', (msg) => {
    alert(`❌ Ошибка сохранения: ${msg}`);
    const btn = document.getElementById('stat-save-btn');
    if (btn) { 
      btn.disabled = false; 
      btn.textContent = '💾 Сохранить характеристики'; 
    }
  });

  // УСПЕШНЫЙ СЦЕНАРИЙ: Сервер прислал чистые и проверенные данные профиля
socket.on('load_game_success', (data) => {
  if (!data || !data.player) return;

  console.log("☁️ [СИНХРОНИЗАЦИЯ] Свежий профиль получен от сервера...");
  window.player = data.player;

  if (typeof resetStatBuffer === 'function') resetStatBuffer();

  localStorage.setItem('rpg_save', JSON.stringify({ player: window.player }));

  if (typeof window.checkLevelUp === 'function') {
    window.checkLevelUp(true); 
  }

  // Мгновенно пересчитываем урон, защиту и полосу HP на главном экране города
  if (typeof render === 'function') {
    render();
  }

  // Обновляем слоты куклы и рюкзака
  if (typeof window.renderInventory === 'function') {
    window.renderInventory();
  }

  // 🔥 МГНОВЕННЫЙ ПЕРЕРАСЧЕТ ОКНА ПРОФИЛЯ: если открыто окно статов персонажа,
  // цифры Атаки и Защиты перепишутся прямо на глазах под новую вещь!
  const modal = document.getElementById('profile-modal');
  if (modal && (modal.classList.contains('active') || modal.style.display === 'flex')) {
    if (typeof window.openProfile === 'function') window.openProfile();
  }
});
   // СЦЕНАРИЙ ДЛЯ НОВИЧКА: Игрока еще нет в базе, генерируем стартовый профиль
  window.socket.on('player_not_found', ({ userId, username }) => {
    console.log("🆕 Приветствуем нового героя! Генерируем стартовый профиль...");
    
    if (typeof window.createPlayer === 'function') {
      window.player = window.createPlayer();
    } else {
      window.player = { 
        id: Number(userId), name: username, level: 1, xp: 0, gold: 50, hp: 10, statPoints: 5, currentTownIndex: 0, 
        stats: { strength: 1, agility: 1, endurance: 1, luck: 1 }, 
        inventory: { equipment: [], consumables: [], resources: [] }, 
        equipped: { rings: [null, null, null] } 
      };
    }
    
    window.player.id = Number(userId);
    window.player.name = username;

    // Сразу просим бэкенд создать запись о персонаже в Supabase
    window.saveGame();
    
    if (typeof window.render === 'function') window.render();
    if (typeof callback === 'function') callback(null);
  });

  // Ошибка на стороне бэкенда
  window.socket.on('load_game_failed', (data) => {
    console.error("❌ Ошибка загрузки игры через бэкенд:", data.message);
    if (typeof callback === 'function') callback(data.message);
  });
}

/**
 * 📡 НАДЕТЬ ПРЕДМЕТ ЧЕРЕЗ СЕРВЕР
 * Отправляет запрос бэкенду на перенос вещи из рюкзака на куклу
 */
window.equipItem = function(itemId) {
  if (!window.player) return;

  if (window.socket && window.socket.connected) {
    console.log(`📡 Отправка запроса на экипировку: ${itemId}`);
    window.socket.emit('equip_item_secure', {
      userId: window.player.id,
      itemId: itemId
    });
  } else {
    alert("⚠️ Нет стабильного соединения с сервером!");
  }
};

/**
 * 📡 СНЯТЬ ПРЕДМЕТ ЧЕРЕЗ СЕРВЕР
 * Отправляет запрос бэкенду на возвращение вещи с куклы в рюкзак
 */
window.unequipItem = function(slotKey, ringIndex = null) {
  if (!window.player) return;

  if (window.socket && window.socket.connected) {
    console.log(`📡 Отправка запроса на снятие из слота: ${slotKey}`);
    window.socket.emit('unequip_item_secure', {
      userId: window.player.id,
      slotKey: slotKey,
      ringIndex: ringIndex
    });
  } else {
    alert("⚠️ Нет стабильного соединения с сервером!");
  }
};

/**
 * 📦 РЕЗЕРВНАЯ ФУНКЦИЯ СОХРАНЕНИЯ ПРОФИЛЯ
 * Используется для быстрой синхронизации мирных кэш-данных интерфейса
 */
window.saveGame = function(customData, callback) {
  const player = (customData && customData.player) ? customData.player : window.player;
  if (!player) return;

  // Обновляем локальный кэш смартфона
  localStorage.setItem('rpg_save', JSON.stringify({ player: player }));

  // Отправляем пакет бэкенду для физического создания строки
  if (window.socket && window.socket.connected) {
    window.socket.emit('save_game_secure', { player });
  } else {
    console.warn("⚠️ Сессия сокета оффлайн. Не удалось отправить save_game_secure");
  }

  if (typeof customData === 'function') customData();
  if (typeof callback === 'function') callback();
};