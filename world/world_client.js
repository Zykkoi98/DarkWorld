// ============================================================================
// ===== 🗺️ КЛИЕНТ КАРТЫ МИРА (WORLD_CLIENT.JS) — v4 =====
// ===== ФИКСЫ: таймер, сокет-миграция, переподписка, надёжность =====
// ============================================================================

let worldSocket = null;
let localPlayer = null;
let currentMapData = null;
let selectedTile = null;

let isMoving = false;
let moveTimerInterval = null;
let moveEndsAt = null;

const VIEW_RADIUS = 3;

// 🔥 Именованные обработчики
const handlers = {};

// --- ИНИЦИАЛИЗАЦИЯ ---
function initWorld() {
  console.log("🗺️ [МИР] Запуск клиента карты...");

  const localSave = localStorage.getItem('rpg_save');
  if (localSave) {
    try { localPlayer = JSON.parse(localSave).player; } catch(e) {}
  }

  if (!localPlayer) {
    alert("❌ Профиль не найден! Вернитесь в город.");
    window.location.replace('../index.html');
    return;
  }

  localStorage.setItem('world_active', 'true');

  const parentWin = window.parent;
  const tryBind = () => {
    if (parentWin && parentWin !== window && parentWin.socket && parentWin.socket.connected) {
      worldSocket = parentWin.socket;
      console.log("✅ [МИР] Привязан к сокету родителя (города)");
      return true;
    }
    return false;
  };

  if (tryBind()) {
    startWorldAfterSocket();
  } else {
    console.log("⏳ [МИР] Ждём родительский сокет...");
    let attempts = 0;
    const waitTimer = setInterval(() => {
      attempts++;
      if (tryBind()) {
        clearInterval(waitTimer);
        console.log("✅ [МИР] Родительский сокет найден");
        startWorldAfterSocket();
      }
      if (attempts > 100) {
        clearInterval(waitTimer);
        console.error("🚨 [МИР] Родительский сокет не найден за 10 сек");
        alert("❌ Ошибка соединения с городом. Вернитесь в город и попробуйте снова.");
      }
    }, 100);
  }
}

// --- ОСНОВНАЯ ЛОГИКА ---
function startWorldAfterSocket() {
  window.worldSocket = worldSocket;
  worldSocket.userId = localPlayer.id;

  // --- РЕГИСТРАЦИЯ ОБРАБОТЧИКОВ (один раз) ---

  handlers.world_map_data = (data) => {
    console.log("🎉 [МИР] world_map_data пришёл от сервера!");
    onMapData(data);
  };

  handlers.world_move_started = (data) => {
    console.log("🚶 [МИР] Начат переход:", data);
    isMoving = true;
    moveEndsAt = data.endsAt;
    showMoveProgress(data.durationMs);
    blockControls(true);
  };

 handlers.world_move_completed = (data) => {
  console.log("✅ [МИР] Переход завершён");
  if (window.__moveSafetyTimeout) {
    clearTimeout(window.__moveSafetyTimeout);
    window.__moveSafetyTimeout = null;
  }
  
  isMoving = false;
  moveEndsAt = null;
  hideMoveProgress();
  blockControls(false);
  
  // 🔥 ФИКС: проверяем, не отправил ли уже safety timeout запрос
  if (!window.__moveSyncRequested) {
    // Нет — отправляем сами
    console.log("📤 [МИР] Запрашиваем карту (после world_move_completed)");
    if (worldSocket && worldSocket.connected) {
      worldSocket.emit('world_get_map', { userId: localPlayer.id });
    }
  } else {
    // Да — safety уже запросил
    console.log("⏭️ [МИР] Пропускаем запрос — safety timeout уже отправил");
  }
  
  window.__moveSyncRequested = false;
};

  handlers.world_move_cancelled = () => {
    console.log("🚫 [МИР] Переход отменён");
    isMoving = false;
    moveEndsAt = null;
    hideMoveProgress();
    blockControls(false);
  };

  handlers.world_move_blocked = (data) => {
    showToast(`🚫 ${data.reason}`, 'error');
    isMoving = false;
    hideMoveProgress();
    blockControls(false);
  };

  handlers.world_player_moved = () => {
    worldSocket.emit('world_get_map', { userId: localPlayer.id });
  };

  handlers.world_gathered = (data) => {
    showToast(`✅ Собрано: ${data.resourceIcon} ${data.resourceName}`, 'success');
    if (worldSocket && worldSocket.connected) {
      worldSocket.emit('world_get_map', { userId: localPlayer.id });
    }
  };

  handlers.world_teleported = (data) => {
    showToast(`🌀 Телепорт: ${data.mapName}`, 'info');
  };

  handlers.world_portal_found = () => {
    showToast(`🌀 Здесь портал!`, 'info');
  };

  handlers.world_monster_data = (data) => {
    console.log("⚔️ Данные моба:", data);
    alert(`⚔️ ${data.monster.name}\nУровень: ${data.monster.level}\n\nБой подключим позже.`);
  };

  handlers.error = (msg) => {
    showToast(`🚨 ${msg}`, 'error');
  };

  // --- ПОДПИСКА НА ВСЕ ОБРАБОТЧИКИ ---
  attachHandlers();

  // Первый запрос карты
  worldSocket.emit('world_get_map', { userId: localPlayer.id });

  // Скрываем лоадер
  setTimeout(() => {
    const loader = document.getElementById('world-loader');
    if (loader) loader.style.display = 'none';
  }, 1500);

 // 🔥 НАДЁЖНЫЙ ФИКС v2: каждые 10 сек проверяем, не сменился ли родительский сокет
  if (window.__worldSocketCheckInterval) {
    clearInterval(window.__worldSocketCheckInterval);
  }
  window.__worldSocketCheckInterval = setInterval(() => {
    if (!window.parent || window.parent === window) return;
    const parentSock = window.parent.socket;

    // 🔥 Сравниваем по объекту И по id — если оба разные, переподключаемся
    if (parentSock && parentSock.connected && parentSock !== worldSocket && parentSock.id !== worldSocket?.id) {
      console.warn(`⚠️ [МИР] Родительский сокет сменился: ${worldSocket?.id} → ${parentSock.id}`);
      worldSocket = parentSock;
      window.worldSocket = parentSock;
      rebindHandlersToNewSocket();
    }
  }, 10000); // 🔥 10 сек вместо 3
}

// --- ПОДПИСКА ВСЕХ ОБРАБОТЧИКОВ ---
function attachHandlers() {
  if (!worldSocket) return;
  Object.keys(handlers).forEach(eventName => {
    try {
      worldSocket.off(eventName, handlers[eventName]); // снять старые (если есть)
      worldSocket.on(eventName, handlers[eventName]);  // подписать заново
    } catch (e) {}
  });
}

// --- ПЕРЕПОДПИСКА НА НОВЫЙ СОКЕТ ---
function rebindHandlersToNewSocket() {
  if (!worldSocket) return;

  console.log("🔧 [МИР] Переподписка на новый сокет:", worldSocket.id);

  // Снимаем ВСЕ обработчики (на случай, если остались)
  Object.keys(handlers).forEach(eventName => {
    try {
      worldSocket.off(eventName, handlers[eventName]);
    } catch (e) {}
  });

  // Подписываемся заново
  attachHandlers();

  // Запрашиваем актуальную карту
  worldSocket.emit('world_get_map', { userId: localPlayer.id });
  console.log("✅ [МИР] Переподписка завершена");
}

// --- ОБРАБОТКА ДАННЫХ КАРТЫ ---
function onMapData(data) {
  console.log("🗺️ [МИР] Карта получена:", data);
  currentMapData = data;

  const loader = document.getElementById('world-loader');
  if (loader) loader.style.display = 'none';

  document.getElementById('pos-x').textContent = data.myX;
  document.getElementById('pos-y').textContent = data.myY;
  if (data.mapId === 'ashenvale_main') document.getElementById('map-name').textContent = 'Ашенваль';
  else if (data.mapId === 'dragonhold_main') document.getElementById('map-name').textContent = 'Драгонхолд';
  else if (data.mapId === 'mine_1') document.getElementById('map-name').textContent = 'Шахта';

  // 🔥 ФИКС Б1: сдвигаем фон карты в зависимости от позиции игрока
  updateMapBackground(data.myX, data.myY);
  // 🔥 ЭТАП 1: показываем кнопку «Войти в город» только на клетке замка
    updateCityButton(data.myX, data.myY);

  // Восстановление активного перехода (для F5)
  if (data.activeMove && data.activeMove.endsAt) {
    const remainingMs = Math.max(0, data.activeMove.endsAt - Date.now());
    if (remainingMs > 0) {
      isMoving = true;
      moveEndsAt = data.activeMove.endsAt;
      showMoveProgress(remainingMs);
      blockControls(true);
    }
  } else {
    isMoving = false;
    blockControls(false);
  }

  renderMap(data);
}

// 🔥 Функция: сдвиг фона карты в зависимости от позиции игрока
function updateMapBackground(myX, myY) {
  const container = document.getElementById('world-map-container');
  if (!container) return;

  const mapSize = 50;
  const xPercent = (myX / (mapSize - 1)) * 100;
  const yPercent = (myY / (mapSize - 1)) * 100;

  container.style.backgroundPosition = `${xPercent}% ${yPercent}%`;

  console.log(`🎨 [МИР] Фон сдвинут: ${xPercent.toFixed(1)}% ${yPercent.toFixed(1)}% (игрок на ${myX},${myY})`);
}
// 🔥 Показ/скрытие кнопки «Войти в город» (только на клетке замка 37,14)
function updateCityButton(myX, myY) {
  const btn = document.getElementById('enter-city-btn');
  if (!btn) return;

  const CITY_X = 37;
  const CITY_Y = 14;

  if (myX === CITY_X && myY === CITY_Y) {
    btn.style.display = 'block';
    console.log("🏰 [МИР] Игрок на клетке замка — кнопка «Войти в город» показана");
  } else {
    btn.style.display = 'none';
  }
}

// --- РЕНДЕР СЕТКИ ---
function renderMap(data) {
  const grid = document.getElementById('world-map-grid');
  if (!grid) return;

  grid.innerHTML = '';

  const { myX, myY, tiles, resources, monsters, players, resourcesDB, regionsDB, buildingsDB } = data;

  const tileMap = {};
  tiles.forEach(t => { tileMap[`${t.x}_${t.y}`] = t; });

  const resourceMap = {};
  resources.forEach(r => { resourceMap[`${r.x}_${r.y}`] = r; });

  const monsterMap = {};
  monsters.forEach(m => { monsterMap[`${m.x}_${m.y}`] = m; });

  const playerMap = {};
  players.forEach(p => { playerMap[`${p.x}_${p.y}`] = p; });

  window.currentTileMap = tileMap;
  window.currentResourceMap = resourceMap;
  window.currentMonsterMap = monsterMap;

  for (let dy = -VIEW_RADIUS; dy <= VIEW_RADIUS; dy++) {
    for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
      const x = myX + dx;
      const y = myY + dy;

      const tile = tileMap[`${x}_${y}`];
      const resource = resourceMap[`${x}_${y}`];
      const monster = monsterMap[`${x}_${y}`];
      const otherPlayer = playerMap[`${x}_${y}`];

      const cell = document.createElement('div');
      cell.className = 'tile';
      cell.dataset.x = x;
      cell.dataset.y = y;

      const isAdjacent = Math.abs(dx) + Math.abs(dy) === 1;
      if (isAdjacent) {
        cell.classList.add('adjacent');
      }

      if (dx === 0 && dy === 0) {
        cell.classList.add('center-tile');
        cell.innerHTML = '<span class="player-icon">👤</span>';
      }
      else if (otherPlayer) {
        cell.innerHTML = `<span class="other-player">🟢</span>`;
        cell.title = otherPlayer.name;
      }
      else if (monster && monster.monster_id) {
        cell.innerHTML = `<span class="monster-icon">👹</span>`;
        cell.title = `Моб ${monster.level} ур.`;
      }
      else if (resource && resource.resource_id) {
        const rData = resourcesDB[resource.resource_id];
        cell.innerHTML = `<span class="resource-icon">${rData ? rData.icon : '🌿'}</span>`;
      }
      else if (tile && tile.building) {
        const bData = buildingsDB[tile.building];
        cell.innerHTML = `<span class="building-icon">${bData ? bData.icon : '🏛️'}</span>`;
      }
      else if (tile && tile.region) {
        const rData = regionsDB[tile.region];
        cell.innerHTML = `<span style="opacity: 0.4; font-size: 18px;">${rData ? rData.icon : ''}</span>`;
      }

      cell.onclick = () => onTileClick(x, y, tile, resource, monster, otherPlayer, dx, dy);

      grid.appendChild(cell);
    }
  }

  const myTile = tileMap[`${myX}_${myY}`];
  const myResource = resourceMap[`${myX}_${myY}`];
  const myMonster = monsterMap[`${myX}_${myY}`];
  showMyCellInfo(myTile, myResource, myMonster);

  const selectedPanel = document.getElementById('selected-cell-panel');
  if (selectedPanel) selectedPanel.classList.add('hidden');
}

// --- ИНФО-ПАНЕЛЬ СВОЕЙ КЛЕТКИ (левая колонка) ---
function showMyCellInfo(tile, resource, monster) {
  const myInfo = document.getElementById('my-cell-info');
  const myActions = document.getElementById('my-cell-actions');
  if (!myInfo || !myActions) return;

  myActions.innerHTML = '';

  let html = '';
  if (tile && tile.region) {
    const rData = currentMapData.regionsDB[tile.region];
    html += `<div>${rData ? rData.icon + ' ' + rData.name : tile.region}</div>`;
  }
  if (resource && resource.resource_id) {
    const rData = currentMapData.resourcesDB[resource.resource_id];
    if (rData) html += `<div style="color: #2ecc71;">${rData.icon} ${rData.name}</div>`;
  }
  if (monster && monster.monster_id) {
    html += `<div style="color: #e74c3c;">👹 Моб ${monster.level} ур.</div>`;
  }
  if (!html) html = '<div style="color: #9aa0b5;">Пусто</div>';

  myInfo.innerHTML = html;

  if (resource && resource.resource_id) {
    const rData = currentMapData.resourcesDB[resource.resource_id];
    if (rData) {
      const btn = document.createElement('button');
      btn.className = 'action-btn gather';
      btn.textContent = '🌿 Собрать';
      btn.onclick = () => {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.textContent = '⏳...';
        worldSocket.emit('world_gather', { userId: localPlayer.id });
        setTimeout(() => { btn.disabled = false; btn.textContent = '🌿 Собрать'; }, 2000);
      };
      myActions.appendChild(btn);
    }
  }

  if (monster && monster.monster_id) {
    const btn = document.createElement('button');
    btn.className = 'action-btn attack';
    btn.textContent = '⚔️ Напасть';
    btn.onclick = () => {
      if (btn.disabled) return;
      btn.disabled = true;
      btn.textContent = '⏳...';
      worldSocket.emit('world_attack', { userId: localPlayer.id, monsterId: monster.id });
      setTimeout(() => { btn.disabled = false; btn.textContent = '⚔️ Напасть'; }, 2000);
    };
    myActions.appendChild(btn);
  }
}

// --- ИНФО-ПАНЕЛЬ ВЫБРАННОЙ КЛЕТКИ (правая колонка) ---
function showSelectedCellInfo(tile, resource, monster, otherPlayer, dx, dy) {
  const panel = document.getElementById('selected-cell-panel');
  const selInfo = document.getElementById('selected-cell-info');
  const selActions = document.getElementById('selected-cell-actions');
  if (!panel || !selInfo || !selActions) return;

  if (dx === 0 && dy === 0) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  selActions.innerHTML = '';

  let html = '';
  if (tile && tile.region) {
    const rData = currentMapData.regionsDB[tile.region];
    html += `<div style="font-weight: bold;">${rData ? rData.icon + ' ' + rData.name : tile.region}</div>`;
  }
  if (monster) {
    html += `<div style="color: #e74c3c;">👹 Моб ${monster.level} ур.</div>`;
  }
  if (resource && resource.resource_id) {
    const rData = currentMapData.resourcesDB[resource.resource_id];
    html += `<div style="color: #2ecc71;">${rData ? rData.icon + ' ' + rData.name : 'Ресурс'}</div>`;
  }
  if (otherPlayer) {
    html += `<div style="color: #2ecc71;">🟢 ${otherPlayer.name}</div>`;
  }
  if (tile && tile.building) {
    const bData = currentMapData.buildingsDB[tile.building];
    html += `<div style="color: #f1c40f;">${bData ? bData.icon + ' ' + bData.name : tile.building}</div>`;
  }
  if (!html) html = '<div style="color: #9aa0b5;">Пустая клетка</div>';

  selInfo.innerHTML = html;

  const isAdjacent = Math.abs(dx) + Math.abs(dy) === 1;
  if (isAdjacent) {
    const moveBtn = document.createElement('button');
    moveBtn.className = 'action-btn move';
    moveBtn.textContent = '🚶 Перейти (15с)';
    moveBtn.onclick = () => moveWorld(dx, dy);
    selActions.appendChild(moveBtn);
  }
}

// --- КЛИК ПО КЛЕТКЕ ---
function onTileClick(x, y, tile, resource, monster, otherPlayer, dx, dy) {
  selectedTile = { x, y, tile, resource, monster, otherPlayer, dx, dy };

  if (window.currentTileMap) {
    const myTile = window.currentTileMap[`${currentMapData.myX}_${currentMapData.myY}`];
    const myResource = window.currentResourceMap[`${currentMapData.myX}_${currentMapData.myY}`];
    const myMonster = window.currentMonsterMap[`${currentMapData.myX}_${currentMapData.myY}`];
    showMyCellInfo(myTile, myResource, myMonster);
  }

  showSelectedCellInfo(tile, resource, monster, otherPlayer, dx, dy);
}

// --- ДВИЖЕНИЕ ---
window.moveWorld = function(dx, dy) {
  if (!worldSocket || !localPlayer) return;

  if (isMoving) {
    showToast('🚫 Вы уже в пути!', 'error');
    return;
  }

  isMoving = true;
  blockControls(true);

  worldSocket.emit('world_move_start', { userId: localPlayer.id, dx, dy });
};

window.cancelMove = function() {
  if (!worldSocket || !localPlayer) return;
  worldSocket.emit('world_move_cancel', { userId: localPlayer.id });
};

// --- ВХОД В ГОРОД (только с клетки замка) ---
window.enterCity = function() {
  console.log("🏰 [МИР] Игрок входит в город");
  localStorage.removeItem('world_active');
  window.location.href = '../index.html';
};

// --- СТАРЫЙ ВЫХОД (оставляем для совместимости, но не используется) ---
window.exitWorld = function() {
  console.log("⚠️ [МИР] exitWorld устарел — используй enterCity");
  window.enterCity();
};

// --- ПРОГРЕСС ПЕРЕХОДА ---
function showMoveProgress(durationMs) {
    window.__moveSyncRequested = false;
  const old = document.getElementById('move-progress');
  if (old) old.remove();

  const container = document.createElement('div');
  container.id = 'move-progress';
  container.style.cssText = `
    position: fixed; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0,0,0,0.85);
    border: 2px solid #6c5ce7;
    border-radius: 16px;
    padding: 20px 30px;
    z-index: 9999;
    text-align: center;
    min-width: 220px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  `;

  container.innerHTML = `
    <div style="font-size: 32px; margin-bottom: 8px;">🚶‍♂️</div>
    <div style="font-weight: bold; color: #fff; margin-bottom: 12px;">Переход в пути...</div>
    <div style="background: rgba(255,255,255,0.1); border-radius: 6px; height: 8px; overflow: hidden; margin-bottom: 8px;">
      <div id="move-progress-fill" style="height: 100%; width: 0%; background: linear-gradient(90deg, #6c5ce7, #a29bfe); transition: width 0.1s linear;"></div>
    </div>
    <div id="move-progress-time" style="font-size: 18px; font-weight: bold; color: #f1c40f; font-family: monospace;">15.0с</div>
    <button onclick="window.cancelMove()" style="margin-top: 12px; background: #e74c3c; border: none; color: #fff; padding: 8px 16px; border-radius: 8px; font-weight: bold; cursor: pointer;">Отменить</button>
  `;

  document.body.appendChild(container);

  const fill = document.getElementById('move-progress-fill');
  const timeEl = document.getElementById('move-progress-time');
  const startTime = Date.now();
  const totalDuration = durationMs;

  if (moveTimerInterval) clearInterval(moveTimerInterval);
  moveTimerInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const percent = Math.min(100, (elapsed / totalDuration) * 100);
    const remaining = Math.max(0, (totalDuration - elapsed) / 1000);

    if (fill) fill.style.width = `${percent}%`;

    if (remaining > 0) {
      if (timeEl) timeEl.textContent = `${remaining.toFixed(1)}с`;
    } else {
      if (timeEl) {
        timeEl.textContent = 'Синхронизация...';
        timeEl.style.color = '#3498db';
        timeEl.style.fontSize = '14px';
      }

      // 🔥 НАДЁЖНЫЙ ФИКС: клиент САМ запрашивает карту через АКТУАЛЬНЫЙ сокет
      if (!window.__moveSyncRequested) {
        window.__moveSyncRequested = true;
        console.log("🔄 [МИР] Клиент сам запрашивает карту через актуальный сокет");

        const activeSocket = (window.parent && window.parent.socket && window.parent.socket.connected)
          ? window.parent.socket
          : worldSocket;

        if (activeSocket && activeSocket.connected) {
          activeSocket.emit('world_get_map', { userId: localPlayer.id });
          if (activeSocket !== worldSocket) {
            console.warn("⚠️ [МИР] Сокет сменился! Переподписываемся на новый");
            worldSocket = activeSocket;
            window.worldSocket = activeSocket;
            rebindHandlersToNewSocket();
          }
        }
      }
    }
  }, 100);

  // 🔥 Защитный таймаут — если сервер не ответил через 5 сек после конца
  const safetyTimeout = setTimeout(() => {
    const modal = document.getElementById('move-progress');
    if (modal) {
      console.warn("🔥 [МИР] Принудительное закрытие модалки (сервер не ответил)");
      hideMoveProgress();
      isMoving = false;
      window.__moveSyncRequested = false;  // 🔥 сброс
      if (worldSocket && worldSocket.connected) {
        worldSocket.emit('world_get_map', { userId: localPlayer.id });
      }
    }
  }, totalDuration + 5000);

  window.__moveSafetyTimeout = safetyTimeout;
}

function hideMoveProgress() {
  if (moveTimerInterval) {
    clearInterval(moveTimerInterval);
    moveTimerInterval = null;
  }
  const el = document.getElementById('move-progress');
  if (el) el.remove();
}

function blockControls(blocked) {
  // Кнопки стрелок убраны
}

// --- ТОСТ ---
function showToast(message, type = 'info') {
  const old = document.getElementById('world-toast');
  if (old) old.remove();

  const colors = {
    success: 'linear-gradient(135deg, #2ecc71, #27ae60)',
    error:   'linear-gradient(135deg, #e74c3c, #c0392b)',
    info:    'linear-gradient(135deg, #3498db, #2980b9)'
  };

  const toast = document.createElement('div');
  toast.id = 'world-toast';
  toast.style.cssText = `
    position: fixed; top: 80px; left: 50%;
    transform: translateX(-50%);
    background: ${colors[type] || colors.info};
    color: #fff; padding: 12px 20px; border-radius: 12px;
    font-weight: bold; font-size: 13px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    z-index: 99999; text-align: center;
    max-width: 320px; font-family: sans-serif;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3000);
}

// --- ОЧИСТКА ПРИ ЗАКРЫТИИ ---
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'WORLD_WILL_UNLOAD') {
    console.log("🧹 [МИР] Получен сигнал выгрузки, чистим подписки");

    if (worldSocket) {
      Object.keys(handlers).forEach(eventName => {
        try {
          worldSocket.off(eventName, handlers[eventName]);
        } catch (e) {}
      });
      console.log("✅ [МИР] Все подписки сняты, сокет родителя сохранён");
    }

    if (moveTimerInterval) {
      clearInterval(moveTimerInterval);
      moveTimerInterval = null;
    }

    if (window.__worldSocketCheckInterval) {
      clearInterval(window.__worldSocketCheckInterval);
      window.__worldSocketCheckInterval = null;
    }

    if (window.__moveSafetyTimeout) {
      clearTimeout(window.__moveSafetyTimeout);
      window.__moveSafetyTimeout = null;
    }

    localStorage.removeItem('world_active');
  }
});

document.addEventListener('DOMContentLoaded', initWorld);