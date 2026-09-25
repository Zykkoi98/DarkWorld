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
    
    // 🔥 ФИКС: Явно создаем и СРАЗУ записываем сокет в глобальный объект window.socket
    window.socket = io('https://darkworld-server.onrender.com', {
      transports: ['websocket'],
      forceNew: false,
      upgrade: false
    });

    // Инициализируем слушатели данных
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
  try {
    if (!data || !data.player) {
      console.error("🚨 Получены пустые данные игрока от сервера!");
      if (typeof hideMainGameLoader === 'function') hideMainGameLoader();
      return;
    }

    console.log("☁️ [СИНХРОНИЗАЦИЯ] Свежий профиль получен от сервера...");
    window.player = data.player;

    // ============================================================================
    // 🏰 🔥 [ДОБАВЛЕНО] ДИНАМИЧЕСКИЙ ОБНОВЛЯТОР БАДЖА ЭТАЖА БАШНИ НА ПЛОЩАДИ
    // ============================================================================
    const towerBadge = document.getElementById('town-tower-floor-badge');
    if (towerBadge) {
      // Считываем новую колонку из Supabase. Если ее еще нет — выводим 1 этаж
      const currentSavedFloor = window.player.tower_floor || 1;
      towerBadge.textContent = `Этаж ${currentSavedFloor}`;
    }
    // ============================================================================

    // 🔥 ВОЗВРАЩАЕМ СТАРУЮ ЛОГИКУ: Запускаем экспресс-проверку боевого статуса СРАЗУ.
    console.log(`📡 Отправляем экспресс-проверку боевого статуса для ID: ${window.player.id}`);
    
    socket.emit('check_active_battle_directly', { userId: String(window.player.id) }, (response) => {
      try {
        if (response && response.activeRoomId) {
          console.log(`⚔️ [ПЕРЕХВАТ] Обнаружен активный бой ${response.activeRoomId}. Уходим на arena!`);
          
          if (window.Telegram && window.Telegram.WebApp) {
            try { window.Telegram.WebApp.ready(); } catch(e) {}
          }
          window.location.replace(`battle/battle.html?roomId=${response.activeRoomId}`);
          return; // Выходим, отрисовка города не нужна
        } else {
          console.log("🟢 Игрок свободен от сражений.");
          
           // 🔥 ЖЕСТКИЙ ФИКС: Наконец-то физически вызываем функцию скрытия шторы!
          if (typeof hideMainGameLoader === 'function') {
            hideMainGameLoader();
          } else {
            const rawLoader = document.getElementById('game-loader-screen');
            if (rawLoader) rawLoader.style.display = 'none';
          }
        }
      } catch (err) {
        console.error("Ошибка в колбэке проверки боя:", err);
        if (typeof hideMainGameLoader === 'function') hideMainGameLoader();
      }

      setTimeout(() => {
        try {
          localStorage.setItem('rpg_save', JSON.stringify({ player: window.player }));
          if (typeof resetStatBuffer === 'function') resetStatBuffer();
          if (typeof window.checkLevelUp === 'function') window.checkLevelUp(true);
          if (typeof render === 'function') render();
          if (typeof window.renderInventory === 'function') window.renderInventory();
        } catch (heavyRenderErr) {
          console.error("⚠️ Ошибка фонового рендеринга интерфейса города:", heavyRenderErr.message);
        }
      }, 50);
    });

  } catch (globalFrontErr) {
    console.error("❌ Фатальная ошибка обработки load_game_success на клиенте:", globalFrontErr.message);
    if (typeof hideMainGameLoader === 'function') hideMainGameLoader();
  }
});

// Если соединение оборвалось или выдало ошибку, город все равно должен открыться
socket.on('connect_error', () => {
  console.warn("⚠️ Сервер Render недоступен. Открываем город по умолчанию.");
  if (typeof hideMainGameLoader === 'function') {
    hideMainGameLoader();
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
    
    // 🔥 ЖЕСТКИЙ ФИКС ДЛЯ НОВИЧКОВ: Принудительно гасим песочные часы, чтобы Evil сразу увидел город!
    if (typeof window.hideMainGameLoader === 'function') {
      window.hideMainGameLoader();
    } else {
      const rawLoader = document.getElementById('game-loader-screen');
      if (rawLoader) rawLoader.style.display = 'none';
    }

    if (typeof callback === 'function') callback(null);
  });
  // 🔥 [ДОБАВЛЕНО] СЛУШАТЕЛЬ ЕЖЕСЕКУНДНОЙ АВТОРЕГЕНЕРАЦИИ ХП В ГОРОДЕ
  window.socket.on('town_hp_regen_update', (data) => {
    if (!window.player) return;

    // Мгновенно обновляем ХП в оперативной памяти клиента
    window.player.hp = data.currentHp;

    // Находим текстовое поле ХП в городе и обновляем цифры на экране
    const mainHpText = document.getElementById('player-hp-text') || document.getElementById('player-hp');
    if (mainHpText) {
      mainHpText.textContent = `❤️ ${data.currentHp} / ${data.maxHp}`;
    }

    // Дополнительно: если на верстке города есть плашка-заливка бара ХП ( progress fill )
    const townHpFill = document.getElementById('town-player-hp-fill') || document.getElementById('hero-hp-fill');
    if (townHpFill) {
      townHpFill.style.width = ((data.currentHp / data.maxHp) * 100) + '%';
    }
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