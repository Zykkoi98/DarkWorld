// ============================================================================
// ===== 🗺️ КЛИЕНТ КАРТЫ МИРА (WORLD_CLIENT.JS) — v10 =====
// ===== Навигатор event-based, тёмные координаты, линия пути, блокировка =====
// ============================================================================

let worldSocket = null;
let localPlayer = null;
let currentMapData = null;
let selectedTile = null;

let isMoving = false;
let moveTimerInterval = null;
let moveEndsAt = null;

const VIEW_RADIUS = 3;
const handlers = {};

// 🔥 Автонавигатор
let navTarget = null;
let navPath = [];
let isNavigating = false;

// 🔥 Drag
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

  console.log("📡 [МИР] Создаём свой сокет...");

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
    alert("❌ Не удалось подключиться к серверу.");
  });
}

// --- ОСНОВНАЯ ЛОГИКА ---
function startWorldAfterSocket() {
  window.worldSocket = worldSocket;
  worldSocket.userId = localPlayer.id;

  window.tileCache = window.tileCache || {};
  window.resourceCache = window.resourceCache || {};
  window.monsterCache = window.monsterCache || {};

  handlers.world_map_data = (data) => {
    console.log("🎉 [МИР] world_map_data пришёл!");
    onMapData(data);
  };

  handlers.world_move_started = (data) => {
    console.log("🚶 [МИР] Начат переход:", data);
    isMoving = true;
    moveEndsAt = data.endsAt;
    showMoveProgress(data.durationMs);
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

    if (!window.__moveSyncRequested) {
      if (worldSocket && worldSocket.connected) {
        worldSocket.emit('world_get_map', { userId: localPlayer.id });
      }
    }

    window.__moveSyncRequested = false;

    // 🔥 Автонавигатор
    if (isNavigating) {
      setTimeout(() => {
        navigateNextStep();
      }, 500);
    }
  };

  handlers.world_move_cancelled = () => {
    console.log("🚫 [МИР] Переход отменён");
    isMoving = false;
    moveEndsAt = null;
    hideMoveProgress();
  };

  handlers.world_move_blocked = (data) => {
    showToast(`🚫 ${data.reason}`, 'error');
    isMoving = false;
    hideMoveProgress();
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

  // 🔥 НОВЫЙ handler — ответ от A* (event-based)
  handlers.world_find_path_result = (response) => {
    console.log("📡 [НАВ] Получен ответ:", response);

    if (!response) return;

    // Сброс кнопки
    const goBtn = document.querySelector('#selected-cell-actions .action-btn.move');
    if (goBtn) {
      goBtn.textContent = '🚶 Идти';
      goBtn.disabled = false;
    }

    if (!response.success) {
      showToast(`🚫 ${response.error || 'Путь не найден'}`, 'error');
      return;
    }

    if (response.targetUserId !== Number(localPlayer.id)) return;

    console.log(`✅ [НАВ] Путь: ${response.pathLength} шагов`);
    navPath = response.steps;
    isNavigating = true;

    drawPath(navPath);

    if (navTarget) {
      showSelectedCellInfo(
        window.currentTileMap[`${navTarget.x}_${navTarget.y}`],
        window.currentResourceMap[`${navTarget.x}_${navTarget.y}`],
        window.currentMonsterMap[`${navTarget.x}_${navTarget.y}`],
        null,
        navTarget.x - currentMapData.myX,
        navTarget.y - currentMapData.myY,
        navTarget.x, navTarget.y
      );
    }
    navigateNextStep();
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
}

// --- ПОДПИСКА ---
function attachHandlers() {
  if (!worldSocket) return;
  Object.keys(handlers).forEach(eventName => {
    try {
      worldSocket.off(eventName, handlers[eventName]);
      worldSocket.on(eventName, handlers[eventName]);
    } catch (e) {}
  });
}

// --- ОБРАБОТКА КАРТЫ ---
function onMapData(data) {
  console.log("🗺️ [МИР] Карта получена:", data);
  currentMapData = data;

  if (data.tiles) {
    data.tiles.forEach(t => {
      window.tileCache[`${t.x}_${t.y}`] = t;
    });
  }
  if (data.resources) {
    data.resources.forEach(r => {
      window.resourceCache[`${r.x}_${r.y}`] = r;
    });
  }
  if (data.monsters) {
    data.monsters.forEach(m => {
      window.monsterCache[`${m.x}_${m.y}`] = m;
    });
  }

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
    }
  } else {
    isMoving = false;
  }

  renderMap(data);
}

// --- OFFSET ---
function applyMapOffset(offsetX, offsetY, animate = true) {
  const inner = document.getElementById('world-map-inner');
  if (!inner) return;
  currentOffsetX = offsetX;
  currentOffsetY = offsetY;
  inner.style.transition = animate ? 'transform 0.4s ease' : 'none';
  inner.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
}

function updateMapBackground(myX, myY) {
  const container = document.getElementById('world-map-container');
  if (!container) return;

  if (isNavigating || (selectedTile && (selectedTile.dx !== 0 || selectedTile.dy !== 0))) {
    console.log("🎯 [МИР] Центрирование пропущено");
    return;
  }

  const mapSize = 50;
  const containerSize = container.offsetWidth;
  const fullMapSize = containerSize * 7.14;
  const cellSize = fullMapSize / mapSize;

  const playerCenterX = myX * cellSize + cellSize / 2;
  const playerCenterY = myY * cellSize + cellSize / 2;

  const offsetX = containerSize / 2 - playerCenterX;
  const offsetY = containerSize / 2 - playerCenterY;

  const minOffsetX = containerSize - fullMapSize;
  const minOffsetY = containerSize - fullMapSize;

  const clampedX = Math.max(minOffsetX, Math.min(0, offsetX));
  const clampedY = Math.max(minOffsetY, Math.min(0, offsetY));

  if (!isDragging) {
    applyMapOffset(clampedX, clampedY, true);
  }
}

function centerMapOnPlayer() {
  if (!currentMapData) return;
  selectedTile = null;
  const selectedPanel = document.getElementById('selected-cell-panel');
  if (selectedPanel) selectedPanel.classList.add('hidden');

  const container = document.getElementById('world-map-container');
  if (!container) return;
  const containerSize = container.offsetWidth;
  const fullMapSize = containerSize * 7.14;
  const cellSize = fullMapSize / 50;

  const playerCenterX = currentMapData.myX * cellSize + cellSize / 2;
  const playerCenterY = currentMapData.myY * cellSize + cellSize / 2;

  const offsetX = containerSize / 2 - playerCenterX;
  const offsetY = containerSize / 2 - playerCenterY;

  const minOffsetX = containerSize - fullMapSize;
  const minOffsetY = containerSize - fullMapSize;

  const clampedX = Math.max(minOffsetX, Math.min(0, offsetX));
  const clampedY = Math.max(minOffsetY, Math.min(0, offsetY));

  applyMapOffset(clampedX, clampedY, true);
}

// --- DRAG ---
function initMapDrag() {
  if (window.__mapDragInited) return;
  window.__mapDragInited = true;

  const container = document.getElementById('world-map-container');
  if (!container) return;

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

    const now = Date.now();
    if (now - (window.__lastDragUpdate || 0) < 16) return;
    window.__lastDragUpdate = now;

    const dx = e.touches[0].clientX - dragStartX;
    const dy = e.touches[0].clientY - dragStartY;

    const newOffsetX = dragOffsetStartX + dx;
    const newOffsetY = dragOffsetStartY + dy;

    const containerSize = container.offsetWidth;
    const fullMapSize = containerSize * 7.14;
    const minOffset = containerSize - fullMapSize;

    const clampedX = Math.max(minOffset, Math.min(0, newOffsetX));
    const clampedY = Math.max(minOffset, Math.min(0, newOffsetY));

    applyMapOffset(clampedX, clampedY, false);
  }, { passive: false });

  container.addEventListener('touchend', () => {
    isDragging = false;
    container.classList.remove('dragging');
  });

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
    const clampedX = Math.max(minOffset, Math.min(0, newOffsetX));
    const clampedY = Math.max(minOffset, Math.min(0, newOffsetY));
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

// --- КНОПКА «ВОЙТИ В ГОРОД» ---
function updateCityButton(myX, myY) {
  const btn = document.getElementById('enter-city-btn');
  if (!btn) return;
  if (myX === 37 && myY === 14) {
    btn.style.display = 'block';
  } else {
    btn.style.display = 'none';
  }
}

// --- РЕНДЕР ---
function renderMap(data) {
  const grid = document.getElementById('world-map-grid');
  if (!grid) return;
  if (grid.children.length === 0) {
    buildFullGrid();
  }
  updateGridContent(data);
}

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
  console.log("🎨 [МИР] Сетка 50×50 построена");
}

function updateGridContent(data) {
  const grid = document.getElementById('world-map-grid');
  if (!grid) return;

  const { myX, myY, resourcesDB, regionsDB, buildingsDB } = data;

  const tileMap = window.tileCache || {};
  const resourceMap = window.resourceCache || {};
  const monsterMap = window.monsterCache || {};

  const playerMap = {};
  if (data.players) {
    data.players.forEach(p => { playerMap[`${p.x}_${p.y}`] = p; });
  }

  window.currentTileMap = tileMap;
  window.currentResourceMap = resourceMap;
  window.currentMonsterMap = monsterMap;

  const cells = grid.children;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const x = Number(cell.dataset.x);
    const y = Number(cell.dataset.y);

    const tile = tileMap[`${x}_${y}`];
    const resource = resourceMap[`${x}_${y}`];
    const monster = monsterMap[`${x}_${y}`];
    const otherPlayer = playerMap[`${x}_${y}`];

    cell.className = 'tile';
    cell.innerHTML = '';
    cell.onclick = null;

    if (tile && tile.region) {
      const rData = regionsDB[tile.region];
      if (rData && rData.icon) {
        const biomeIcon = document.createElement('span');
        biomeIcon.className = 'biome-icon';
        biomeIcon.textContent = rData.icon;
        cell.appendChild(biomeIcon);
      }
    }

    const dx = x - myX;
    const dy = y - myY;

    if (dx === 0 && dy === 0) {
      cell.classList.add('center-tile');
      const centerSpan = document.createElement('span');
      centerSpan.className = 'center-content';
      centerSpan.innerHTML = '<span class="player-icon">👤</span>';
      cell.appendChild(centerSpan);
    } else {
      if (Math.abs(dx) + Math.abs(dy) === 1) {
        cell.classList.add('adjacent');
      }

      let centerHtml = '';
      if (otherPlayer) {
        centerHtml = `<span class="other-player">🟢</span>`;
        cell.title = otherPlayer.name;
      } else if (monster && monster.monster_id) {
        centerHtml = `<span class="monster-icon">👹</span>`;
        cell.title = `Моб ${monster.level} ур.`;
      } else if (resource && resource.resource_id) {
        const rData = resourcesDB[resource.resource_id];
        centerHtml = `<span class="resource-icon-center">${rData ? rData.icon : '🌿'}</span>`;
      } else if (tile && tile.building) {
        const bData = buildingsDB[tile.building];
        centerHtml = `<span class="building-icon">${bData ? bData.icon : '🏛️'}</span>`;
      }

      if (centerHtml) {
        const centerSpan = document.createElement('span');
        centerSpan.className = 'center-content';
        centerSpan.innerHTML = centerHtml;
        cell.appendChild(centerSpan);
      }
    }

    const coordsEl = document.createElement('span');
    coordsEl.className = 'tile-coords';
    coordsEl.textContent = `${x},${y}`;
    cell.appendChild(coordsEl);

    if (selectedTile && selectedTile.x === x && selectedTile.y === y && (dx !== 0 || dy !== 0)) {
      cell.classList.add('selected-tile');
    }

    cell.onclick = () => onTileClick(x, y, tile, resource, monster, otherPlayer, dx, dy);
  }

  const myTile = tileMap[`${myX}_${myY}`];
  const myResource = resourceMap[`${myX}_${myY}`];
  const myMonster = monsterMap[`${myX}_${myY}`];
  showMyCellInfo(myTile, myResource, myMonster);

  if (!selectedTile || (selectedTile.dx === 0 && selectedTile.dy === 0)) {
    const selectedPanel = document.getElementById('selected-cell-panel');
    if (selectedPanel) selectedPanel.classList.add('hidden');
  }
}

// --- ИНФО-ПАНЕЛЬ «ВЫ ЗДЕСЬ» ---
function showMyCellInfo(tile, resource, monster) {
  const myInfo = document.getElementById('my-cell-info');
  const myActions = document.getElementById('my-cell-actions');
  const coordsEl = document.getElementById('my-cell-coords');
  if (!myInfo || !myActions) return;

  if (coordsEl && currentMapData) {
    coordsEl.textContent = `(${currentMapData.myX}, ${currentMapData.myY})`;
  }

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

// --- ИНФО-ПАНЕЛЬ «ВЫБРАНО» ---
function showSelectedCellInfo(tile, resource, monster, otherPlayer, dx, dy, x, y) {
  const panel = document.getElementById('selected-cell-panel');
  const selInfo = document.getElementById('selected-cell-info');
  const selActions = document.getElementById('selected-cell-actions');
  const coordsEl = document.getElementById('selected-cell-coords');
  if (!panel || !selInfo || !selActions) return;

  if (isNavigating && navTarget && (navTarget.x !== x || navTarget.y !== y)) {
    return;
  }

  if (dx === 0 && dy === 0) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  selActions.innerHTML = '';

  if (coordsEl) {
    coordsEl.textContent = `(${x}, ${y})`;
  }

  // Прогресс навигации
  if (isNavigating && navTarget && navTarget.x === x && navTarget.y === y) {
    const stepsLeft = navPath.length;
    const totalSec = stepsLeft * 15;
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    const timeText = mins > 0 ? `~${mins} мин ${secs} сек` : `~${secs} сек`;

    selInfo.innerHTML = `
      <div style="color: #6c5ce7; font-weight: bold;">🧭 Идём к цели</div>
      <div style="color: #f1c40f; font-size: 14px; font-weight: bold; margin-top: 4px;">${stepsLeft} шагов</div>
      <div style="color: #9aa0b5; font-size: 11px; margin-top: 2px;">${timeText}</div>
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'action-btn';
    cancelBtn.style.background = '#e74c3c';
    cancelBtn.textContent = '❌ Отмена';
    cancelBtn.onclick = () => {
      isNavigating = false;
      navPath = [];
      navTarget = null;
      clearPath();
      if (isMoving) window.cancelMove();
      showSelectedCellInfo(tile, resource, monster, otherPlayer, dx, dy, x, y);
    };
    selActions.appendChild(cancelBtn);
    return;
  }

  let html = '';
  if (tile && tile.region) {
    const rData = currentMapData.regionsDB[tile.region];
    html += `<div style="font-weight: bold;">${rData ? rData.icon + ' ' + rData.name : tile.region}</div>`;
  }
  if (monster) html += `<div style="color: #e74c3c;">👹 Моб ${monster.level} ур.</div>`;
  if (resource && resource.resource_id) {
    const rData = currentMapData.resourcesDB[resource.resource_id];
    html += `<div style="color: #2ecc71;">${rData ? rData.icon + ' ' + rData.name : 'Ресурс'}</div>`;
  }
  if (otherPlayer) html += `<div style="color: #2ecc71;">🟢 ${otherPlayer.name}</div>`;
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
  } else {
    const goBtn = document.createElement('button');
    goBtn.className = 'action-btn move';
    goBtn.textContent = '🚶 Идти';
    goBtn.onclick = () => {
      if (!currentMapData) return;
      console.log(`🧭 [НАВ] Запрос пути: (${currentMapData.myX}, ${currentMapData.myY}) → (${x}, ${y})`);

      goBtn.textContent = '⏳ Поиск...';
      goBtn.disabled = true;

      navTarget = { x, y };

      worldSocket.emit('world_find_path', {
        userId: localPlayer.id,
        fromX: currentMapData.myX,
        fromY: currentMapData.myY,
        toX: x,
        toY: y
      });

      setTimeout(() => {
        if (goBtn.disabled && goBtn.textContent === '⏳ Поиск...') {
          goBtn.textContent = '🚶 Идти';
          goBtn.disabled = false;
          showToast('⏱️ Сервер не отвечает', 'error');
        }
      }, 5000);
    };
    selActions.appendChild(goBtn);
  }
}

// --- КЛИК ---
function onTileClick(x, y, tile, resource, monster, otherPlayer, dx, dy) {
  if (isNavigating) {
    showToast('🚫 Идёт навигация. Сначала отмените', 'error');
    return;
  }

  selectedTile = { x, y, tile, resource, monster, otherPlayer, dx, dy };

  if (window.currentTileMap) {
    const myTile = window.currentTileMap[`${currentMapData.myX}_${currentMapData.myY}`];
    const myResource = window.currentResourceMap[`${currentMapData.myX}_${currentMapData.myY}`];
    const myMonster = window.currentMonsterMap[`${currentMapData.myX}_${currentMapData.myY}`];
    showMyCellInfo(myTile, myResource, myMonster);
  }

  updateGridContent(currentMapData);
  showSelectedCellInfo(tile, resource, monster, otherPlayer, dx, dy, x, y);
}

// --- SVG ПУТЬ ---
function drawPath(path) {
  const svg = document.getElementById('world-path-svg');
  if (!svg) return;
  svg.innerHTML = '';
  if (!path || path.length === 0) return;

  const grid = document.getElementById('world-map-grid');
  if (!grid) return;

  const cellSize = grid.offsetWidth / 50;

  const gridRect = grid.getBoundingClientRect();
  const svgRect = svg.getBoundingClientRect();
  const gridOffsetX = gridRect.left - svgRect.left;
  const gridOffsetY = gridRect.top - svgRect.top;

  const startX = currentMapData.myX;
  const startY = currentMapData.myY;

  const points = [];
  points.push({
    x: gridOffsetX + startX * cellSize + cellSize / 2,
    y: gridOffsetY + startY * cellSize + cellSize / 2
  });

  let curX = startX;
  let curY = startY;
  for (const step of path) {
    curX += step.dx;
    curY += step.dy;
    points.push({
      x: gridOffsetX + curX * cellSize + cellSize / 2,
      y: gridOffsetY + curY * cellSize + cellSize / 2
    });
  }

  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', points.map(p => `${p.x},${p.y}`).join(' '));
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', '#f1c40f');
  polyline.setAttribute('stroke-width', '3');
  polyline.setAttribute('stroke-opacity', '0.85');
  polyline.setAttribute('stroke-linecap', 'round');
  polyline.setAttribute('stroke-linejoin', 'round');
  polyline.setAttribute('stroke-dasharray', '6,4');
  svg.appendChild(polyline);
}

function clearPath() {
  const svg = document.getElementById('world-path-svg');
  if (svg) svg.innerHTML = '';
}

// --- НАВИГАЦИЯ ---
function navigateNextStep() {
  if (!isNavigating || navPath.length === 0) {
    isNavigating = false;
    navPath = [];
    navTarget = null;
    clearPath();

    if (selectedTile) {
      showSelectedCellInfo(
        selectedTile.tile,
        selectedTile.resource,
        selectedTile.monster,
        selectedTile.otherPlayer,
        selectedTile.dx,
        selectedTile.dy,
        selectedTile.x,
        selectedTile.y
      );
    }
    return;
  }

  if (isMoving) return;

  const step = navPath.shift();

  if (navTarget) {
    showSelectedCellInfo(
      window.currentTileMap[`${navTarget.x}_${navTarget.y}`],
      window.currentResourceMap[`${navTarget.x}_${navTarget.y}`],
      window.currentMonsterMap[`${navTarget.x}_${navTarget.y}`],
      null,
      navTarget.x - currentMapData.myX,
      navTarget.y - currentMapData.myY,
      navTarget.x,
      navTarget.y
    );
  }

  const nextX = currentMapData.myX + step.dx;
  const nextY = currentMapData.myY + step.dy;
  const nextTile = window.tileCache?.[`${nextX}_${nextY}`];

  if (nextTile && nextTile.is_blocked) {
    showToast('🚫 Путь заблокирован', 'error');
    isNavigating = false;
    navPath = [];
    clearPath();
    return;
  }

  moveWorld(step.dx, step.dy);
}

// --- ДВИЖЕНИЕ ---
window.moveWorld = function(dx, dy) {
  if (!worldSocket || !localPlayer) return;
  if (isMoving) {
    showToast('🚫 Вы уже в пути!', 'error');
    return;
  }
  isMoving = true;
  worldSocket.emit('world_move_start', { userId: localPlayer.id, dx, dy });
};

window.cancelMove = function() {
  if (!worldSocket || !localPlayer) return;

  isNavigating = false;
  navPath = [];
  navTarget = null;
  clearPath();

  worldSocket.emit('world_move_cancel', { userId: localPlayer.id });

  if (selectedTile) {
    showSelectedCellInfo(
      selectedTile.tile,
      selectedTile.resource,
      selectedTile.monster,
      selectedTile.otherPlayer,
      selectedTile.dx,
      selectedTile.dy,
      selectedTile.x,
      selectedTile.y
    );
  }
};

// --- ВХОД В ГОРОД ---
window.enterCity = function() {
  localStorage.removeItem('world_active');
  window.location.href = '../index.html';
};

window.exitWorld = function() {
  window.enterCity();
};

// --- ПРОГРЕСС ---
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
        if (worldSocket && worldSocket.connected) {
          worldSocket.emit('world_get_map', { userId: localPlayer.id });
        }
      }
    }
  }, 100);

  const safetyTimeout = setTimeout(() => {
    const modal = document.getElementById('move-progress');
    if (modal) {
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

// --- ОЧИСТКА ---
window.addEventListener('beforeunload', () => {
  if (worldSocket) {
    try { worldSocket.disconnect(); } catch(e) {}
  }
});

document.addEventListener('DOMContentLoaded', initWorld);