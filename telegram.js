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
  
  // Инициализируем базовое сокет-соединение с сервером Render, если его еще нет
  if (!window.socket) {
    console.log("📡 Подключаем сокет города к боевому серверу Render...");
    if (typeof io !== 'undefined') {
      window.socket = io('https://darkworld-server.onrender.com');
      setupSecureDataListeners(callback);
    } else {
      console.error("❌ Критическая ошибка: Библиотека Socket.io не подключена в index.html!");
      if (typeof callback === 'function') callback("Socket.io missing");
      return;
    }
  } else {
    setupSecureDataListeners(callback);
  }

  // Извлекаем реальный ID из Телеграма (или даем тестовый для отладки на ПК)
  let userId = 777777;
  let username = "Браузерный_Тестер";

  if (TG && tgUser) {
    userId = Number(tgUser.id);
    username = tgUser.first_name || "Рыцарь";
  }

  // Отправляем защищенный сокет-запрос на авторизацию бэкенду
  window.socket.emit('load_game_secure', { userId, username });
};

/**
 * ВНУТРЕННИЙ ПЕРЕХВАТЧИК СЕТЕВЫХ ОТВЕТОВ ОТ СЕРВЕРА
 */
function setupSecureDataListeners(callback) {
  if (!window.socket) return;

  // Сбрасываем старые дубликаты слушателей, чтобы не плодить их в памяти телефона
  window.socket.off('load_game_success');
  window.socket.off('player_not_found');
  window.socket.off('load_game_failed');
  window.socket.off('stat_distribution_error');

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
  window.socket.on('load_game_success', ({ player }) => {
    console.log(`☁️ Данные персонажа [ID: ${player.id}] успешно синхронизированы.`);
    
    // Записываем эталонный профиль в память и локальный кэш смартфона
    window.player = player;
    localStorage.setItem('rpg_save', JSON.stringify({ player: window.player }));
    
    // Очищаем буфер виртуальных кликов в окне характеристик
    if (typeof window._tempStatDistribution !== 'undefined') {
      window._tempStatDistribution = { strength: 0, agility: 0, endurance: 0, intellect: 0, luck: 0 };
    }
    
    window._tempStatPoints = Number(window.player.statPoints ?? 0);
    
    // Запускаем перерасчет уровней на клиенте
    if (typeof window.checkLevelUp === 'function') {
      window.checkLevelUp(true); 
    }
    
    // Если окно характеристик открыто прямо сейчас — мгновенно обновляем цифры
    const modal = document.getElementById('profile-modal');
    if (modal && (modal.style.display === 'flex' || modal.classList.contains('active'))) {
      if (typeof window.openProfile === 'function') window.openProfile();
    }

    // Если открыт инвентарь — перерисовываем вещи с учетом обновлений от сервера
    const invModal = document.getElementById('inventory-modal');
    if (invModal && (invModal.style.display === 'flex' || invModal.classList.contains('active'))) {
      if (typeof window.renderInventory === 'function') window.renderInventory();
    }

    // Перерисовываем никнейм и полоску здоровья на площади города
    if (typeof window.render === 'function') window.render();
    
    if (typeof callback === 'function') callback(null);
  });
   // СЦЕНАРИЙ ДЛЯ НОВИЧКА: Игрока еще нет в базе, генерируем стартовый профиль
  window.socket.on('player_not_found', ({ userId, username }) => {
    console.log("🆕 Приветствуем нового героя! Генерируем стартовый профиль...");
    
    if (typeof window.createPlayer === 'function') {
      window.player = window.createPlayer();
    } else {
      window.player = { 
        id: Number(userId), name: username, level: 1, xp: 0, gold: 50, hp: 10, statPoints: 5, currentTownIndex: 0, 
        stats: { strength: 1, agility: 1, endurance: 1, intellect: 1, luck: 1 }, 
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

  // Отправляем пакет мирных данных бэкенду для обновления рюкзака/аватара
  if (window.socket && window.socket.connected) {
    window.socket.emit('save_game_secure', { player });
  } else {
    console.warn("⚠️ Сессия сокета оффлайн. Изменения сохранятся при стабильном коннекте.");
  }

  if (typeof customData === 'function') customData();
  if (typeof callback === 'function') callback();
};