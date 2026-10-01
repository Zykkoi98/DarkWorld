// ============================================================================
// ===== 🔌 SOCKET-СЛОЙ КЛИЕНТА (BATTLE_SOCKET.JS) =====
// ===== Все socket.on / socket.emit =====
// ============================================================================

window.BSocket = {
  // ==========================================================================
  // ИНИЦИАЛИЗАЦИЯ СОКЕТА
  // ==========================================================================
    init(userId) {
    if (typeof io === 'undefined') {
        console.error('❌ Socket.io не подключён');
        return;
    }

    BState.socket = io('https://darkworld-server.onrender.com', {
        transports: ['websocket'],
        forceNew: true,
        upgrade: false,
        auth: { userId: userId || null }
    });

    // 🔥 ВАЖНО: делаем сокет видимым для shared/ui.js
    window.socket = BState.socket;
    window.battleSocket = BState.socket;

    this.setupListeners();

    BState.socket.on('connect', () => {
      console.log(`✅ [BATTLE SOCKET] Подключён: ${BState.socket.id}`);
      this.onConnect();
    });

    BState.socket.on('connect_error', (err) => {
      console.error('🚨 [BATTLE SOCKET] Ошибка подключения:', err.message);
    });

    BState.socket.on('error', (msg) => {
    console.error('🚨 [BATTLE ERROR]', msg);

    // 🔥 Если ошибка — «Бой уже завершился» — возвращаемся назад
    if (msg && (msg.includes('завершился') || msg.includes('не найден'))) {
        console.log('🏁 [BATTLE] Бой завершён — возврат назад');

        // Очищаем localStorage
        try {
        localStorage.removeItem('battle_room_id');
        localStorage.removeItem('battle_battle_type');
        localStorage.removeItem('battle_saved_at');
        } catch(e) {}

        // Определяем, куда возвращаться
        const urlParams = new URLSearchParams(window.location.search);
        const battleType = urlParams.get('battleType') || BState.battleType;

        // Если это был редирект из башни — в башню
        if (battleType === 'tower') {
        window.location.replace('../tower/tower.html');
        return;
        }

        // Если это был мир — на карту
        if (battleType === 'world') {
        window.location.replace('../world/world.html');
        return;
        }

        // Иначе — в город
        window.location.replace('../index.html');
        return;
    }

    // Другие ошибки — просто тост
    BToasts.showConnectionToast(`❌ ${msg}`, 'warning');
    });
  },

  // ==========================================================================
  // ДЕЙСТВИЯ ПРИ ПОДКЛЮЧЕНИИ — в зависимости от роли
  // ==========================================================================
onConnect() {
  const urlParams = new URLSearchParams(window.location.search);
  const spectateRoom = urlParams.get('spectate');
  const urlRoomId = urlParams.get('roomId');
  const userId = urlParams.get('userId');
  const battleType = urlParams.get('battleType');
  const monsters = urlParams.get('monsters');
  const count = urlParams.get('count');
  const floor = urlParams.get('floor');

  // === РОЛЬ 1: ЗРИТЕЛЬ ===
  if (spectateRoom) {
    BState.isSpectator = true;
    BState.roomId = spectateRoom;
    BState.socket.emit('battle_spectate', { roomId: spectateRoom });
    return;
  }

  // === РОЛЬ 2: RECONNECT (приоритет!) ===
  let roomIdToReconnect = urlRoomId;

  // 🔥 Если URL без roomId — ищем сохранённый (после F5)
  if (!roomIdToReconnect) {
    try {
      const savedRoomId = localStorage.getItem('battle_room_id');
      const savedAt = Number(localStorage.getItem('battle_saved_at') || 0);
      const isFresh = (Date.now() - savedAt) < 5 * 60 * 1000;   // 5 минут

      if (savedRoomId && isFresh) {
        console.log(`♻️ [F5] Найден сохранённый roomId: ${savedRoomId}`);
        roomIdToReconnect = savedRoomId;
      }
    } catch(e) {}
  }

  if (roomIdToReconnect) {
    let reconnectUserId = userId;
    if (!reconnectUserId) {
      try {
        const tg = window.Telegram?.WebApp?.initDataUnsafe?.user;
        if (tg?.id) reconnectUserId = tg.id;
      } catch(e) {}
      if (!reconnectUserId) {
        try {
          const ls = localStorage.getItem('rpg_save');
          if (ls) reconnectUserId = JSON.parse(ls)?.player?.id;
        } catch(e) {}
      }
    }

    if (reconnectUserId) {
      console.log(`♻️ [RECONNECT] Комната: ${roomIdToReconnect}, userId: ${reconnectUserId}`);
      BState.roomId = roomIdToReconnect;
      BState.socket.emit('battle_reconnect', { roomId: roomIdToReconnect, userId: reconnectUserId });
      return;
    }
  }

  // === РОЛЬ 3: НОВЫЙ БОЙ ===
  if (battleType) {
    const localSave = localStorage.getItem('rpg_save');
    let localPlayer = null;
    try { localPlayer = JSON.parse(localSave)?.player; } catch(e) {}

    if (!localPlayer) {
      BToasts.showConnectionToast('❌ Профиль не найден', 'warning');
      return;
    }

    const params = {};
    if (battleType === 'world') {
      params.monsterIds = monsters ? monsters.split(',').map(s => s.trim()).filter(Boolean) : [];
      params.count = Number(count || params.monsterIds.length || 1);
    }
    if (battleType === 'tower') {
      params.currentFloor = Number(floor || 1);
    }

    BState.socket.emit('battle_start', {
      battleType,
      playerData: localPlayer,
      params
    });
    return;
  }

  // === НЕТ ПАРАМЕТРОВ ===
  BToasts.showConnectionToast('❌ Неверный URL боя', 'warning');
},

  // ==========================================================================
  // СЛУШАТЕЛИ СОБЫТИЙ
  // ==========================================================================
  setupListeners() {
    // --- INIT DATA ---
    BState.socket.on('battle_init_data', (data) => {
    console.log('📥 [BATTLE INIT]', data);

    // 🔥 Сброс флага реконнекта
    if (BState.reconnectAttempt) BState.reconnectAttempt = false;

    BState.roomId = data.roomId;
    BState.myUuid = data.myUuid;
    BState.battleType = data.battleType;
    BState.isSpectator = !!data.isSpectator;
    BState.teamA = data.teamA || [];
    BState.teamB = data.teamB || [];
    BState.allLogs = data.allLogs || [];
    BState.spectatorCount = data.spectatorCount || 0;

    // 🔥 Проверяем — есть ли уже победитель?
    // Если бой уже завершён (все враги мертвы или все союзники мертвы) — НЕ сохраняем
    const allEnemiesDead = BState.teamB.length > 0 && BState.teamB.every(f => f.currentHp <= 0);
    const allAlliesDead = BState.teamA.length > 0 && BState.teamA.every(f => f.currentHp <= 0);
    const battleIsOver = allEnemiesDead || allAlliesDead;

    if (battleIsOver) {
        console.log('🏁 [BATTLE INIT] Бой уже завершён — НЕ сохраняем в localStorage');
        try {
        localStorage.removeItem('battle_room_id');
        localStorage.removeItem('battle_battle_type');
        localStorage.removeItem('battle_saved_at');
        } catch(e) {}

        // 🔥 Если это "полу-финальный" реконнект — сделаем фейковый финал
        BState.isBattleOver = true;
        // НЕ вызываем handleBattleOver полностью — пусть игрок сам увидит лог
    } else {
        // Только для АКТИВНОГО боя — сохраняем
        try {
        localStorage.setItem('battle_room_id', data.roomId);
        localStorage.setItem('battle_battle_type', data.battleType || '');
        localStorage.setItem('battle_saved_at', Date.now());
        } catch(e) {}
    }

    // Авто-выбор цели
    if (!BState.isSpectator) {
        const me = BState.getMyFighter();
        if (me) {
        const opp = BState.getOpposingTeam();
        const firstAlive = opp.find(e => e.currentHp > 0);
        BState.selectedTargetUuid = firstAlive ? firstAlive.uuid : null;
        }
    } else {
        const firstAliveB = BState.teamB.find(e => e.currentHp > 0);
        BState.selectedTargetUuid = firstAliveB ? firstAliveB.uuid : null;
    }

      // Обновляем заголовок
      const header = document.getElementById('battle-round-indicator');
      if (header && !BState.isSpectator) {
        header.textContent = `⚔️ Раунд ${data.turnCount}`;
      }

     
    // UI
        if (window.BUI) BUI.init();

        // 🔥 ФИКС: сразу обновляем состояние кнопки банки (иначе она появляется только после 1-го хода)
        if (window.BUI && !BState.isSpectator && typeof BUI.updatePotionButton === 'function') {
          BUI.updatePotionButton();
        }

        // Если зритель — рисуем архив логов
        if (BState.isSpectator && BState.allLogs.length > 0) {
          BRenderer.renderAllLogs(BState.allLogs);
        }

        // Рендер
        BRenderer.render();

      // Скрываем лоадер
      const overlay = document.getElementById('battle-loading-overlay');
      if (overlay) overlay.style.display = 'none';
    });

    // --- РЕЗУЛЬТАТ РАУНДА ---
    BState.socket.on('battle_round_result', (data) => {
      BTimer.stop();
      BStats.closeAll();

      BState.teamA = data.teamA || [];
      BState.teamB = data.teamB || [];

      const header = document.getElementById('battle-round-indicator');
      if (header && !BState.isSpectator) {
        header.textContent = `⚔️ Раунд ${data.turnCount + 1}`;
      }

      // Сброс выбора
      if (!BState.isSpectator) {
        BUI.resetSelection();

        // Перевести фокус на живую цель
        const me = BState.getMyFighter();
        if (me) {
          const opp = BState.getOpposingTeam();
          const current = opp.find(e => e.uuid === BState.selectedTargetUuid);
          if (!current || current.currentHp <= 0) {
            const next = opp.find(e => e.currentHp > 0);
            BState.selectedTargetUuid = next ? next.uuid : null;
          }
        }
      }

      // Логи
      if (data.logs && data.logs.length > 0) {
        BRenderer.appendRoundLogs(data.turnCount, data.logs);
      }

      // Проверка АФК (для участника)
      if (!BState.isSpectator) {
        const me = BState.getMyFighter();
        if (me && me.afkTurns > 0) {
          const missed = data.logs?.some(l => l && l.includes(me.name) && l.includes('пропустил ход'));
          if (missed) BToasts.showAfkWarning(me.afkTurns);
        }
      }

      BRenderer.render();
      if (!BState.isSpectator) BUI.updatePotionButton();

      // Финал
      if (data.isOver) {
        BState.isBattleOver = true;
        this.handleBattleOver(data);
      } else {
        // Возобновляем кнопки
        const strikeBtn = document.getElementById('strike-action-btn');
        const randBtn = document.getElementById('random-strike-btn');
        if (strikeBtn && !BState.isSpectator) {
          strikeBtn.textContent = 'АТАКОВАТЬ';
          strikeBtn.disabled = true;
        }
        if (randBtn && !BState.isSpectator) {
          randBtn.disabled = false;
          randBtn.style.opacity = '1';
          randBtn.style.pointerEvents = 'auto';
        }
      }
    });

    // --- ФИНАЛЬНЫЕ ЛОГИ ---
    BState.socket.on('battle_final_logs', (data) => {
      if (data.logs && data.logs.length > 0) {
        BRenderer.appendRoundLogs('финал', data.logs);
      }
    });

    // --- ЭФФЕКТ БАНКИ ---
    BState.socket.on('battle_effect_potion', (data) => {
      const f = BState.findFighter(data.uuid);
      if (f) {
        f.currentHp = data.currentHp;
        if (data.equipped) f.equipped = data.equipped;
      }

      // 🔥 Если бой завершён — обновляем только HP и логи, не трогаем кнопки
      if (BState.isBattleOver) {
        BRenderer.renderMainCards();
        if (!BState.isSpectator) BUI.updatePotionButton();
        if (data.logMsg) BRenderer.appendSingleLog(data.logMsg);
        return;
      }

      BRenderer.render();
      if (!BState.isSpectator) BUI.updatePotionButton();

      if (data.logMsg) {
        BRenderer.appendSingleLog(data.logMsg);
      }
    });

    // --- ТАЙМЕР ---
    BState.socket.on('turn_timer_started', (data) => {
      if (data && data.durationMs) {
        BTimer.start(data.durationMs, data.round, data.totalDurationMs || data.durationMs);
      }
    });

    // --- ОТКЛЮЧЕНИЕ СОПЕРНИКА ---
    BState.socket.on('opponent_disconnected', (data) => {
      BToasts.showConnectionToast(`⚠️ ${data.name} отключился. Ждём ${data.graceSeconds} сек...`, 'warning');
    });

    // --- РЕКОННЕКТ СОПЕРНИКА ---
    BState.socket.on('opponent_reconnected', (data) => {
      BToasts.showConnectionToast(`✅ ${data.name} вернулся в бой!`, 'success');
    });

    // --- REDIRECT (для PvP) ---
    BState.socket.on('arena_redirect_to_battle', (data) => {
      if (data.roomId && data.roomId !== BState.roomId) {
        window.location.href = `battle.html?roomId=${data.roomId}&userId=${BState.myUuid?.split('_')[1] || ''}`;
      }
    });
  },

  // ==========================================================================
  // ФИНАЛ БОЯ
  // ==========================================================================
  handleBattleOver(data) {
      // 🔥 Очищаем сохранённый roomId — бой завершён
  try {
    localStorage.removeItem('battle_room_id');
    localStorage.removeItem('battle_battle_type');
    localStorage.removeItem('battle_saved_at');
  } catch(e) {}
  const strikeBtn = document.getElementById('strike-action-btn');
  const randBtn = document.getElementById('random-strike-btn');
  if (randBtn) randBtn.style.display = 'none';

  if (!strikeBtn) return;

  // Для зрителя — только закрытие
  if (BState.isSpectator) {
    strikeBtn.style.display = 'none';
    return;
  }

  // 🔥 БАШНЯ
  if (BState.battleType === 'tower') {
    // Победа — следующий этаж
    if (data.resultType === 'win') {
      strikeBtn.textContent = '⚔️ СЛЕДУЮЩИЙ ЭТАЖ';
      strikeBtn.disabled = false;
      strikeBtn.style.background = '#6c5ce7';
      strikeBtn.style.boxShadow = '0 4px 12px rgba(108, 92, 231, 0.4)';

      strikeBtn.onclick = () => {
        // Сброс кэша банок (чтобы обновились)
        const localSave = localStorage.getItem('rpg_save');
        if (localSave) {
          try {
            const saveObj = JSON.parse(localSave);
            if (saveObj?.player?.equipped) {
              saveObj.player.equipped.potion = null;
              localStorage.setItem('rpg_save', JSON.stringify(saveObj));
            }
          } catch(e) {}
        }

        // 🔥 Редирект в Башню (для выбора этажа)
        if (BState.socket) BState.socket.disconnect();
        window.location.replace('../tower/tower.html');
      };
      return;
    }

    // Поражение — вернуться в Башню (КД 3 часа)
    strikeBtn.textContent = '🏰 ВЕРНУТЬСЯ В БАШНЮ';
    strikeBtn.disabled = false;
    strikeBtn.style.background = '#e74c3c';
    strikeBtn.style.boxShadow = '0 4px 12px rgba(231, 76, 60, 0.3)';

    strikeBtn.onclick = () => {
      if (BState.socket) BState.socket.disconnect();
      window.location.replace('../tower/tower.html');
    };
    return;
  }

  // 🔥 ОСТАЛЬНЫЕ РЕЖИМЫ — стандартный финал
  strikeBtn.textContent = 'ВЕРНУТЬСЯ В ГОРОД';
  strikeBtn.disabled = false;
  strikeBtn.style.background = '#2ecc71';
  strikeBtn.style.boxShadow = '0 4px 12px rgba(46, 204, 113, 0.3)';

  strikeBtn.onclick = () => {
    if (BState.socket) BState.socket.disconnect();
    window.location.replace('../index.html');
  };
}
};