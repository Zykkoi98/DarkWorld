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
        transports: ['websocket', 'polling'],
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
      BToasts.showConnectionToast(`❌ ${msg}`, 'warning');
    });
  },

  // ==========================================================================
  // ДЕЙСТВИЯ ПРИ ПОДКЛЮЧЕНИИ — в зависимости от роли
  // ==========================================================================
    onConnect() {
    const urlParams = new URLSearchParams(window.location.search);
    const spectateRoom = urlParams.get('spectate');
    const roomId = urlParams.get('roomId');
    const userId = urlParams.get('userId');
    const battleType = urlParams.get('battleType');
    const monsters = urlParams.get('monsters');
    const count = urlParams.get('count');
    const floor = urlParams.get('floor');   // 🔥 для башни

    // === РОЛЬ 1: ЗРИТЕЛЬ ===
    if (spectateRoom) {
        BState.isSpectator = true;
        BState.roomId = spectateRoom;
        BState.socket.emit('battle_spectate', { roomId: spectateRoom });
        return;
    }

    // === РОЛЬ 2: РЕКОННЕКТ ===
    if (roomId) {
    // 🔥 Если userId не в URL — берём из localStorage
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
        BState.roomId = roomId;
        BState.socket.emit('battle_reconnect', { roomId, userId: reconnectUserId });
        return;
    } else {
        BToasts.showConnectionToast('❌ Профиль не найден для реконнекта', 'warning');
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

        // Для мира: список мобов
        if (battleType === 'world') {
        params.monsterIds = monsters ? monsters.split(',').map(s => s.trim()).filter(Boolean) : [];
        params.count = Number(count || params.monsterIds.length || 1);
        }

        // 🔥 Для башни: этаж
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
      BState.roomId = data.roomId;
      BState.myUuid = data.myUuid;
      BState.battleType = data.battleType;
      BState.isSpectator = !!data.isSpectator;
      BState.teamA = data.teamA || [];
      BState.teamB = data.teamB || [];
      BState.allLogs = data.allLogs || [];
      BState.spectatorCount = data.spectatorCount || 0;

        // Авто-выбор цели (для участника)
        if (!BState.isSpectator) {
        const me = BState.getMyFighter();
        if (me) {
            const opp = BState.getOpposingTeam();
            const firstAlive = opp.find(e => e.currentHp > 0);
            BState.selectedTargetUuid = firstAlive ? firstAlive.uuid : null;
        }
        } else {
        // 🔥 Зритель — авто-выбор первой живой цели из teamB
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