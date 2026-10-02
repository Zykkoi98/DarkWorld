// ============================================================================
// ===== 🛡️ ЗАЩИЩЕННЫЙ КЛИЕНТСКИЙ СЕТЕВОЙ МОСТ (TELEGRAM.JS) =====
// ===== С ЗАЩИТОЙ ОТ ДУБЛЕЙ СОКЕТОВ =====
// ============================================================================

const TG = window.Telegram?.WebApp;

/**
 * ГЛАВНАЯ ФУНКЦИЯ БЕЗОПАСНОЙ ЗАГРУЗКИ ПРОФИЛЯ
 */
window.loadGame = function(callback) {
  const TG = window.Telegram?.WebApp;
  const tgUser = TG?.initDataUnsafe?.user;

  // 🔥 ЖЁСТКАЯ ЗАЩИТА ОТ ДУБЛЕЙ СОКЕТА
  if (window.socket) {
    console.log("⚠️ [СОКЕТ] Уже существует, переиспользуем");
    
    if (!window.socket.connected) {
      console.log("🔄 [СОКЕТ] Отключён, пересоздаём...");
      try { window.socket.disconnect(); } catch(e) {}
      window.socket = null;
    } else {
      // 🔥 ФИКС: даже если сокет жив — переустанавливаем слушатели!
      console.log("♻️ [СОКЕТ] Переустанавливаем слушатели");
      setupSecureDataListeners(callback);

      // 🔥 Запрашиваем свежий профиль
      let userId = 777777;
      let username = "Браузерный_Тестер";
      if (TG && tgUser) {
        userId = Number(tgUser.id);
        username = tgUser.first_name || "Рыцарь";
      }

      window.socket.emit('load_game_secure', { userId, username });
      return;
    }
  }

  console.log("📡 [СОКЕТ] Создаём единственный сокет города...");

  if (typeof io === 'undefined') {
    console.error("❌ Socket.io не подключён в index.html!");
    if (typeof callback === 'function') callback("Socket.io missing");
    return;
  }

  // Достаём userId из Telegram или localStorage
  let handshakeUserId = null;
  if (tgUser?.id) {
    handshakeUserId = tgUser.id;
  } else {
    const localSave = localStorage.getItem('rpg_save');
    if (localSave) {
      try { handshakeUserId = JSON.parse(localSave).player?.id; } catch(e) {}
    }
  }

  console.log(`🔑 [HANDSHAKE] userId: ${handshakeUserId}`);

  // 🔥 ЕДИНСТВЕННЫЙ СОКЕТ
  window.socket = io('https://darkworld-server.onrender.com', {
    transports: ['websocket'],
    forceNew: false,
    upgrade: false,
    auth: { userId: handshakeUserId }
  });

  // Слушатели
  setupSecureDataListeners(callback);

  // Отправляем запрос на загрузку профиля
  let userId = 777777;
  let username = "Браузерный_Тестер";

  if (TG && tgUser) {
    userId = Number(tgUser.id);
    username = tgUser.first_name || "Рыцарь";
  }

  window.socket.emit('load_game_secure', { userId, username });
};

/**
 * ВНУТРЕННИЙ ПЕРЕХВАТЧИК СЕТЕВЫХ ОТВЕТОВ
 */
function setupSecureDataListeners(callback) {
  if (!window.socket) return;

  // Сбрасываем старые слушатели
  window.socket.off('load_game_success');
  window.socket.off('player_not_found');
  window.socket.off('load_game_failed');
  window.socket.off('stat_distribution_error');
  window.socket.off('arena_redirect_to_battle');
  /*
  // 🔥 ГЛОБАЛЬНЫЙ РЕДИРЕКТ В БОЙ
  window.socket.on('arena_redirect_to_battle', (data) => {
    console.log("⚔️ [ГЛОБАЛЬНЫЙ ПЕРЕХВАТ] Оппонент принял вызов!");

    const wrapper = document.getElementById('arena-iframe-wrapper');
    const frame = document.getElementById('arena-iframe-frame');
    if (wrapper) wrapper.style.display = 'none';
    if (frame) frame.src = 'about:blank';

    const currentPath = window.location.pathname;
    let projectRoot = currentPath.replace(/\/[^/]*$/, '');
    if (currentPath.includes('/shop/')) projectRoot = currentPath.split('/shop/')[0];
    else if (currentPath.includes('/tower/')) projectRoot = currentPath.split('/tower/')[0];
    else if (currentPath.includes('/battle/')) projectRoot = currentPath.split('/battle/')[0];

    window.location.href = `${projectRoot}/battle/battle.html?roomId=${data.roomId}`;
  });*/

  // Ошибки распределения статов
  window.socket.on('stat_distribution_error', (msg) => {
    alert(`❌ Ошибка сохранения: ${msg}`);
    const btn = document.getElementById('stat-save-btn');
    if (btn) {
      btn.disabled = false;
      btn.textContent = '💾 Сохранить характеристики';
    }
  });

  // 🔥 УСПЕШНАЯ ЗАГРУЗКА ПРОФИЛЯ
  window.socket.on('load_game_success', (data) => {
    try {
      if (!data || !data.player) {
        console.error("🚨 Получены пустые данные игрока!");
        if (typeof hideMainGameLoader === 'function') hideMainGameLoader();
        return;
      }

      console.log("☁️ [СИНХРОНИЗАЦИЯ] Свежий профиль получен");
      window.player = data.player;

      // Обновляем плашку Башни (если есть)
      const towerBadge = document.getElementById('town-tower-floor-badge');
      if (towerBadge) {
        const currentSavedFloor = window.player.tower_floor || 1;
        towerBadge.textContent = `Этаж ${currentSavedFloor}`;
      }

      // 🔥 Проверка активного боя
      console.log(`📡 [БОЙ] Проверка активного боя для ID: ${window.player.id}`);

      socket.emit('battle_check_active', { userId: String(window.player.id) }, (response) => {
        try {
          if (response && response.activeRoomId) {
            console.log(`⚔️ [ПЕРЕХВАТ] Найден бой ${response.activeRoomId}. Уходим!`);
            if (window.Telegram && window.Telegram.WebApp) {
              try { window.Telegram.WebApp.ready(); } catch(e) {}
            }
            window.location.replace(`battle/battle.html?roomId=${response.activeRoomId}`);
            return;
          }

          console.log("🟢 [БОЙ] Игрок свободен");
          if (typeof hideMainGameLoader === 'function') {
            hideMainGameLoader();
          } else {
            const rawLoader = document.getElementById('game-loader-screen');
            if (rawLoader) rawLoader.style.display = 'none';
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
           if (window.UI && typeof window.UI.renderInventory === 'function') window.UI.renderInventory();
          } catch (heavyRenderErr) {
            console.error("⚠️ Ошибка рендеринга:", heavyRenderErr.message);
          }
        }, 50);
      });

    } catch (globalFrontErr) {
      console.error("❌ Фатальная ошибка load_game_success:", globalFrontErr.message);
      if (typeof hideMainGameLoader === 'function') hideMainGameLoader();
    }
  });

  // Ошибка соединения
  window.socket.on('connect_error', () => {
    console.warn("⚠️ Сервер Render недоступен");
    if (typeof hideMainGameLoader === 'function') hideMainGameLoader();
  });

  // 🔥 НОВЫЙ ИГРОК
  window.socket.on('player_not_found', ({ userId, username }) => {
    console.log("🆕 Приветствуем нового героя!");

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

    window.saveGame();

    if (typeof window.render === 'function') window.render();

    if (typeof window.hideMainGameLoader === 'function') {
      window.hideMainGameLoader();
    } else {
      const rawLoader = document.getElementById('game-loader-screen');
      if (rawLoader) rawLoader.style.display = 'none';
    }

    if (typeof callback === 'function') callback(null);
  });
  window.socket.off('town_hp_regen_update');
  // 🔥 РЕГЕНЕРАЦИЯ HP
  window.socket.on('town_hp_regen_update', (data) => {
    if (!window.player) return;
    window.player.hp = data.currentHp;

    const mainHpText = document.getElementById('player-hp-text') || document.getElementById('player-hp');
    if (mainHpText) {
      mainHpText.textContent = `❤️ ${data.currentHp} / ${data.maxHp}`;
    }

    const townHpFill = document.getElementById('town-player-hp-fill') || document.getElementById('hero-hp-fill');
    if (townHpFill) {
      townHpFill.style.width = ((data.currentHp / data.maxHp) * 100) + '%';
    }

    // 🔥 HP-бейдж на аватарке
    const hpBadge = document.getElementById('player-hp-badge');
    const hpFill = document.getElementById('player-hp-fill');

    if (hpBadge) {
      hpBadge.textContent = `${data.currentHp} / ${data.maxHp}`;
    }
    if (hpFill) {
      const percent = data.maxHp > 0 ? (data.currentHp / data.maxHp) * 100 : 0;
      hpFill.style.width = `${percent}%`;

      if (percent > 60) {
        hpFill.style.background = 'linear-gradient(90deg, #2ecc71, #26de81)';
      } else if (percent > 30) {
        hpFill.style.background = 'linear-gradient(90deg, #f1c40f, #e67e22)';
      } else {
        hpFill.style.background = 'linear-gradient(90deg, #e74c3c, #c0392b)';
      }
    }
  });

  // Ошибка загрузки
  window.socket.on('load_game_failed', (data) => {
    console.error("❌ Ошибка загрузки:", data.message);
    if (typeof callback === 'function') callback(data.message);
  });
}

/**
 * 📡 НАДЕТЬ ПРЕДМЕТ
 */
window.equipItem = function(itemId) {
  if (!window.player) return;

  if (window.socket && window.socket.connected) {
    console.log(`📡 Экипировка: ${itemId}`);
    window.socket.emit('equip_item_secure', {
      userId: window.player.id,
      itemId: itemId
    });
  } else {
    alert("⚠️ Нет соединения с сервером!");
  }
};

/**
 * 📡 СНЯТЬ ПРЕДМЕТ
 */
window.unequipItem = function(slotKey, ringIndex = null) {
  if (!window.player) return;

  if (window.socket && window.socket.connected) {
    console.log(`📡 Снятие из слота: ${slotKey}`);
    window.socket.emit('unequip_item_secure', {
      userId: window.player.id,
      slotKey: slotKey,
      ringIndex: ringIndex
    });
  } else {
    alert("⚠️ Нет соединения с сервером!");
  }
};

/**
 * 📦 СОХРАНЕНИЕ ПРОФИЛЯ
 */
window.saveGame = function(customData, callback) {
  const player = (customData && customData.player) ? customData.player : window.player;
  if (!player) return;

  localStorage.setItem('rpg_save', JSON.stringify({ player: player }));

  if (window.socket && window.socket.connected) {
    window.socket.emit('save_game_secure', { player });
  } else {
    console.warn("⚠️ Сокет оффлайн. save_game_secure не отправлен");
  }

  if (typeof customData === 'function') customData();
  if (typeof callback === 'function') callback();
};

/**
 * 🔥 ЗАКРЫТИЕ СОКЕТА ПРИ ВЫХОДЕ
 */
window.addEventListener('beforeunload', () => {
  if (window.socket) {
    console.log("🧹 [СОКЕТ] Закрываем при выходе...");
    try { window.socket.disconnect(); } catch(e) {}
    window.socket = null;
  }
});