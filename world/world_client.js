// ============================================================================
// ===== 🗺️ КЛИЕНТ КАРТЫ МИРА (WORLD_CLIENT.JS) — v5 =====
// ===== ФИКСЫ: drag, кнопка центр, точная формула =====
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

// 🔥 Глобальные переменные для drag
let currentOffsetX = 0;
let currentOffsetY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragOffsetStartX = 0;
let dragOffsetStartY = 0;

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

  console.log("📡 [МИР] Создаём свой сокет (отдельная страница)...");

  if (typeof io === 'undefined') {
    console.error("❌ [МИР] Socket.io не подключён!");
    return;
  }

  if (window.socket && window.socket.connected) {
    console.log("♻️ [МИР] Сокет уже есть, переиспользуем");
    worldSocket = window.socket;
    startWorldAfterSocket();
    return;
  }

  worldSocket = io('https://darkworld-server.onrender.com', {
    transports: ['websocket'],
    forceNew: false,
    upgrade: false,
    auth: { userId: localPlayer.id }
  });

  window.socket = worldSocket;
  window.worldSocket = worldSocket;

  worldSocket.on('connect', () => {
    console.log(`✅ [МИР] Сокет подключён: ${worldSocket.id}`);
    startWorldAfterSocket();
  });

  worldSocket.on('connect_error', (err) => {
    console.error("🚨 [МИР] Ошибка подключения:", err.message);
    alert("❌ Не удалось подключиться к серверу. Попробуйте позже.");
  });
}

// --- ОСНОВНАЯ ЛОГИКА ---
function startWorldAfterSocket() {
  window.worldSocket = worldSocket;
  worldSocket.userId = localPlayer.id;

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

    if (!window.__moveSyncRequested) {
      console.log("📤 [МИР] Запрашиваем карту (после world_move_completed)");
      if (worldSocket && worldSocket.connected) {
        worldSocket.emit('world_get_map', { userId: localPlayer.id });
      }
    } else {
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

  attachHandlers();

  worldSocket.emit('world_get_map', { userId: localPlayer.id });
  initMapDrag();

  setTimeout(() => {
    const loader = document.getElementById('world-loader');
    if (loader) loader.style.display = 'none';
  }, 1500);

  if (window.__worldSocketCheckInterval) {
    clearInterval(window.__worldSocketCheckInterval);
  }
  window.__worldSocketCheckInterval = setInterval(() => {
    if (!window.parent || window.parent === window) return;
    const parentSock = window.parent.socket;

    if (parentSock && parentSock.connected && parentSock !== worldSocket && parentSock.id !== worldSocket?.id) {
      console.warn(`⚠️ [МИР] Родительский сокет сменился: ${worldSocket?.id} → ${parentSock.id}`);
      worldSocket = parentSock;
      window.worldSocket = parentSock;
      rebindHandlersToNewSocket();
    }
  }, 10000);
}

// --- ПОДПИСКА ВСЕХ ОБРАБОТЧИКОВ ---
function attachHandlers() {
  if (!worldSocket) return;
  Object.keys(handlers).forEach(eventName => {
    try {
      worldSocket.off(eventName, handlers[eventName]);
      worldSocket.on(eventName, handlers[eventName]);
    } catch (e) {}
  });
}

// --- ПЕРЕПОДПИСКА ---
function rebindHandlersToNewSocket() {
  if (!worldSocket) return;
  console.log("🔧 [МИР] Переподписка на новый сокет:", worldSocket.id);

  Object.keys(handlers).forEach(eventName => {
    try { worldSocket.off(eventName, handlers[eventName]); } catch (e) {}
  });

  attachHandlers();
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

  updateMapBackground(data.myX, data.myY);
  updateCityButton(data.myX, data.myY);

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

// 🔥 Применить offset
function applyMapOffset(offsetX, offsetY, animate = true) {
  const inner = document.getElementById('world-map-inner');
  if (!inner) return;

  currentOffsetX = offsetX;
  currentOffsetY = offsetY;

  if (!animate) {
    inner.style.transition = 'none';
  } else {
    inner.style.transition = 'transform 0.4s ease';
  }

  inner.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
}

// 🔥 Сдвиг фона карты
function updateMapBackground(myX, myY) {
  const container = document.getElementById('world-map-container');
  if (!container) return;

  const mapSize = 50;
  const containerSize = container.offsetWidth;

  const fullMapSize = containerSize * 7.14;
  const cellSize = fullMapSize / mapSize;

  const playerCenterX = myX * cellSize + cellSize / 2;
  const playerCenterY = myY * cellSize + cellSize / 2;

  const offsetX = containerSize / 2 - playerCenterX;
  const offsetY = containerSize / 2 - playerCenterY;

  const maxOffsetX = 0;
  const minOffsetX = containerSize - fullMapSize;
  const maxOffsetY = 0;
  const minOffsetY = containerSize - fullMapSize;

  const clampedX = Math.max(minOffsetX, Math.min(maxOffsetX, offsetX));
  const clampedY = Math.max(minOffsetY, Math.min(maxOffsetY, offsetY));

  if (!isDragging) {
    applyMapOffset(clampedX, clampedY, true);
  }

  console.log(`🎨 [МИР] Фон сдвинут: (${clampedX.toFixed(1)}, ${clampedY.toFixed(1)}) для (${myX}, ${myY})`);
}

// 🔥 Центрировать на игроке
function centerMapOnPlayer() {
  if (!currentMapData) return;
  updateMapBackground(currentMapData.myX, currentMapData.myY);
}

// 🔥 Инициализация drag
function initMapDrag() {
  if (window.__mapDragInited) {
    console.log("⏭️ [МИР] Drag уже инициализирован");
    return;
  }
  window.__mapDragInited = true;

  const container = document.getElementById('world-map-container');
  if (!container) return;

  // Touch
  container.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    isDragging = true;
    container.classList.add('dragging');
    dragStartX = e.touches[0].clientX;
    dragStartY = e.touches[0].clientY;
    dragOffsetStartX = currentOffsetX;
    dragOffsetStartY = currentOffsetY;
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    e.preventDefault();

    const dx = e.touches[0].clientX - dragStartX;
    const dy = e.touches[0].clientY - dragStartY;

    const newOffsetX = dragOffsetStartX + dx;
    const newOffsetY = dragOffsetStartY + dy;

    const containerSize = container.offsetWidth;
    const fullMapSize = containerSize * 7.14;
    const minOffset = containerSize - fullMapSize;
    const maxOffset = 0;

    const clampedX = Math.max(minOffset, Math.min(maxOffset, newOffsetX));
    const clampedY = Math.max(minOffset, Math.min(maxOffset, newOffsetY));

    applyMapOffset(clampedX, clampedY, false);
  }, { passive: false });

  container.addEventListener('touchend', () => {
    isDragging = false;
    container.classList.remove('dragging');
  });

  // Mouse
  container.addEventListener('mousedown', (e) => {
    isDragging = true;
    container.classList.add('dragging');
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragOffsetStartX = currentOffsetX;
    dragOffsetStartY = currentOffsetY;
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    const newOffsetX = dragOffsetStartX + dx;
    const newOffsetY = dragOffsetStartY + dy;

    const containerSize = container.offsetWidth;
    const fullMapSize = containerSize * 7.14;
    const minOffset = containerSize - fullMapSize;
    const maxOffset = 0;

    const clampedX = Math.max(minOffset, Math.min(maxOffset, newOffsetX));
    const clampedY = Math.max(minOffset, Math.min(maxOffset, newOffsetY));

    applyMapOffset(clampedX, clampedY, false);
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    container.classList.remove('dragging');
  });

  const centerBtn = document.getElementById('center-map-btn');
  if (centerBtn) {
    centerBtn.addEventListener('click', () => {
      console.log("🎯 [МИР] Возврат к игроку");
      centerMapOnPlayer();
    });
  }
}

// 🔥 Кнопка «Войти в город»
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

// --- РЕНДЕР СЕТКИ 50×50 ---
function renderMap(data) {
  const grid = document.getElementById('world-map-grid');
  if (!grid) return;

  // 🔥 Перерисовываем редко (для производительности)
  if (grid.children.length === 0) {
    buildFullGrid();
  }

  updateGridContent(data);
}

// 🔥 Построить 50×50 сетку (один раз)
function buildFullGrid() {
  const grid = document.getElementById('world-map-grid');
  if (!grid) return;
  
  grid.innerHTML = '';
  
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const cell = document.createElement('div');
      cell.className = 'tile';
      cell.dataset.x = x;
      cell.dataset.y = y;
      grid.appendChild(cell);
    }
  }
  
  console.log("🎨 [МИР] Полная сетка 50×50 построена");
}

// 🔥 Обновить содержимое клеток
function updateGridContent(data) {
  const grid = document.getElementById('world-map-grid');
  if (!grid) return;

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

  // 🔥 Обновляем каждую клетку
  const cells = grid.children;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const x = Number(cell.dataset.x);
    const y = Number(cell.dataset.y);

    const tile = tileMap[`${x}_${y}`];
    const resource = resourceMap[`${x}_${y}`];
    const monster = monsterMap[`${x}_${y}`];
    const otherPlayer = playerMap[`${x}_${y}`];

    // Сброс
    cell.className = 'tile';
    cell.innerHTML = '';

    // Своя клетка
    if (x === myX && y === myY) {
      cell.classList.add('center-tile');
      cell.innerHTML = '<span class="player-icon">👤</span>';
      continue;
    }

    // Соседняя
    const dx = x - myX;
    const dy = y - myY;
    if (Math.abs(dx) + Math.abs(dy) === 1) {
      cell.classList.add('adjacent');
    }

    // Дальше приоритет: игрок > моб > ресурс > строение > регион
    if (otherPlayer) {
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

    // 🔥 Клик
    cell.onclick = () => onTileClick(x, y, tile, resource, monster, otherPlayer, dx, dy);
  }

  // Инфо-панель
  const myTile = tileMap[`${myX}_${myY}`];
  const myResource = resourceMap[`${myX}_${myY}`];
  const myMonster = monsterMap[`${myX}_${myY}`];
  showMyCellInfo(myTile, myResource, myMonster);

  const selectedPanel = document.getElementById('selected-cell-panel');
  if (selectedPanel) selectedPanel.classList.add('hidden');
}

// --- ИНФО-ПАНЕЛЬ СВОЕЙ КЛЕТКИ ---
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

// --- ИНФО-ПАНЕЛЬ ВЫБРАННОЙ КЛЕТКИ ---
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

// --- ВХОД В ГОРОД ---
window.enterCity = function() {
  console.log("🏰 [МИР] Игрок входит в город");
  localStorage.removeItem('world_active');
  window.location.href = '../index.html';
};

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

      if (!window.__moveSyncRequested) {
        window.__moveSyncRequested = true;
        console.log("🔄 [МИР] Клиент сам запрашивает карту через актуальный сокет");

        const activeSocket = (window.parent && window.parent.socket && window.parent.socket.connected)
          ? window.parent.socket
          : worldSocket;

        if (activeSocket && activeSocket.connected) {
          activeSocket.emit('world_get_map', { userId: localPlayer.id });
          if (activeSocket !== worldSocket) {
            worldSocket = activeSocket;
            window.worldSocket = activeSocket;
            rebindHandlersToNewSocket();
          }
        }
      }
    }
  }, 100);

  const safetyTimeout = setTimeout(() => {
    const modal = document.getElementById('move-progress');
    if (modal) {
      console.warn("🔥 [МИР] Принудительное закрытие модалки (сервер не ответил)");
      hideMoveProgress();
      isMoving = false;
      window.__moveSyncRequested = false;
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

function blockControls(blocked) {}

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
        try { worldSocket.off(eventName, handlers[eventName]); } catch (e) {}
      });
      console.log("✅ [МИР] Все подписки сняты");
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

window.addEventListener('beforeunload', () => {
  if (worldSocket) {
    console.log("🧹 [МИР] Закрываем сокет при выходе");
    try { worldSocket.disconnect(); } catch(e) {}
  }
});

document.addEventListener('DOMContentLoaded', initWorld);