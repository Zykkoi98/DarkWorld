// ============================================================================
// ===== 🛡️ ЗАЩИЩЕННЫЙ КЛИЕНТСКИЙ МОДУЛЬ (БЕЗ API КЛЮЧЕЙ СУПЕРБЕЙЗА) =====
// ============================================================================
const TG = window.Telegram?.WebApp;

/**
 * ГЛАВНАЯ ФУНКЦИЯ БЕЗОПАСНОЙ ЗАГРУЗКИ ПРОФИЛЯ
 * Вместо прямых запросов fetch к Supabase — отправляет сокет-сигнал на бэкенд!
 */
window.loadGame = function(callback) {
  const TG = window.Telegram?.WebApp;
  const tgUser = TG?.initDataUnsafe?.user;
  
  // Инициализируем базовое сокет-соединение города, если его еще нет
  if (!window.socket || typeof io === 'undefined') {
    console.log("📡 Подключаем глобальный сокет города к Render...");
    if (typeof io !== 'undefined') {
      window.socket = io('https://darkworld-server.onrender.com');
      setupSecureDataListeners(callback);
    } else {
      console.error("❌ Критическая ошибка: Библиотека Socket.io не подключена на странице index.html!");
      return callback("Socket.io missing");
    }
  } else {
    // Если сокет уже был создан ранее (например, при реконектах), просто вешаем слушатели данных
    setupSecureDataListeners(callback);
  }

  // 1. Извлекаем ID игрока (из Телеграма или Тестовый для ПК)
  let userId = 777777;
  let username = "Браузерный_Тестер";

  if (TG && tgUser) {
    userId = Number(tgUser.id);
    username = tgUser.first_name || "Рыцарь";
  }


  // 2. Отправляем защищенный сокет-запрос на бэкенд Render
  window.socket.emit('load_game_secure', { userId, username });
};

/**
 * ВНУТРЕННИЙ ПЕРЕХВАТЧИК СЕТЕВЫХ ОТВЕТОВ ОТ БЭКЕНДА
 */
function setupSecureDataListeners(callback) {
  if (!window.socket) return;

  // Сбрасываем старые дубликаты слушателей, чтобы не спамить память при перезаходах
  window.socket.off('load_game_success');
  window.socket.off('player_not_found');
  window.socket.off('load_game_failed');
  window.socket.off('stat_distribution_error');
  window.socket.on('stat_distribution_error', (msg) => {
    alert(`❌ Ошибка сохранения: ${msg}`);
    const btn = document.getElementById('stat-save-btn');
    if (btn) { btn.disabled = false; btn.textContent = '💾 Сохранить характеристики'; }
  });

  // Сценарий А: Сервер успешно сохранил, обновил или распределил характеристики профиля
  window.socket.on('load_game_success', ({ player }) => {
    console.log(`☁️ Данные игрока [ID: ${player.id}] синхронизированы с сервером.`);
    
    // 1. Записываем свежий эталонный профиль от сервера в глобальную память
    window.player = player;
    
    // 2. Перезаписываем локальный кэш телефона для сохранения прогресса при F5
    localStorage.setItem('rpg_save', JSON.stringify({ player: window.player }));
    
    // 3. 🔥 ФИКС: Принудительно очищаем буфер виртуальных кликов (плюсов/минусов),
    // чтобы сбросить предв. статы и спрятать зеленую кнопку сохранения!
    if (typeof window._tempStatDistribution !== 'undefined') {
      window._tempStatDistribution = { strength: 0, agility: 0, endurance: 0, intellect: 0, luck: 0 };
    }
    
    // Синхронизируем остаток свободных очков в буфере (с поддержкой любого регистра от бэкенда)
    window._tempStatPoints = Number(window.player.statPoints ?? window.player.statpoints ?? 0);
    
    // 4. Запускаем проверку уровней (убедитесь, что закомментировали блок сброса античита в game_core.js!)
    if (typeof window.checkLevelUp === 'function') {
      window.checkLevelUp(true); 
    }
    
    // 5. 🔥 ФИКС: Если окно профиля открыто прямо сейчас, мы намертво форсируем 
    // его перерисовку новыми статами без закрытия модалки!
    const modal = document.getElementById('profile-modal');
    if (modal && (modal.style.display === 'flex' || modal.classList.contains('active'))) {
      if (typeof window.openProfile === 'function') {
        window.openProfile();
      }
    }

    // 6. Перерисовываем основные показатели ХП и никнейма на площади города
    if (typeof window.render === 'function') {
      window.render();
    }
  });

  // Сценарий Б: Сервер ответил, что игрока в базе еще нет (новый пользователь)
  window.socket.on('player_not_found', ({ userId, username }) => {
    console.log("🆕 Приветствуем нового гладиатора! Генерируем дефолтный профиль...");
    
    if (typeof window.createPlayer === 'function') {
      window.player = window.createPlayer();
    } else {
      // Экстренный фоллбэк на случай сбоя загрузки конструктора
      window.player = { 
        id: Number(userId), name: username, level: 1, xp: 0, gold: 50, hp: 10, statPoints: 5, currentTownIndex: 0, 
        stats: { strength: 1, agility: 1, endurance: 1, intellect: 1, luck: 1 }, 
        inventory: { equipment: [], consumables: [], resources: [] }, 
        equipped: { rings: [null, null, null] } 
      };
    }
    
    window.player.id = Number(userId);
    window.player.name = username;

    // Сразу же принудительно просим сервер создать под него первую строчку в Supabase
    window.saveGame();
    
    if (typeof window.render === 'function') window.render();
    if (typeof callback === 'function') callback(null);
  });

  // Сценарий В: Ошибка базы данных или парсинга на бэкенде
  window.socket.on('load_game_failed', (data) => {
    console.error("❌ Не удалось безопасно загрузить игру через бэкенд:", data.message);
    if (typeof callback === 'function') callback(data.message);
  });
}

/**
 * ГЛАВНАЯ ФУНКЦИЯ БЕЗОПАСНОГО СОХРАНЕНИЯ ПРОФИЛЯ
 * Синхронизирует данные без раскрытия секретных токенов
 */
window.saveGame = function(customData, callback) {
  // Определяем, какой объект игрока сохранять (переданный или глобальный)
  const player = (customData && customData.player) ? customData.player : window.player;
  if (!player) return;

  // 1. Мгновенно обновляем локальный кэш устройства для плавности UI
  localStorage.setItem('rpg_save', JSON.stringify({ player: player }));

  // 2. Отправляем изменения плоского пакета на бэкенд Render
  if (window.socket && window.socket.connected) {
    window.socket.emit('save_game_secure', { player });
  } else {
    console.warn("⚠️ Сокет временно отключен, сейв синхронизируется при следующем стабильном коннекте.");
  }

  // Безопасно выполняем колбэки
  if (typeof customData === 'function') customData();
  if (typeof callback === 'function') callback();
};