// ============================================================================
// ===== 🗺️ КЛИЕНТ КАРТЫ МИРА (WORLD_CLIENT.JS) — v12 =====
// ===== Самостоятельная страница со своим сокетом =====
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
let navPathOriginal = [];
let navStartX = null;
let navStartY = null;
let isNavigating = false;
let __mapSynced = true;

// 🔥 Drag
let currentOffsetX = 0;
let currentOffsetY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragOffsetStartX = 0;
let dragOffsetStartY = 0;

// 🔥 Сохранение состояния навигатора (F5)
const NAV_STORAGE_KEY = 'world_nav_state';
const NAV_STORAGE_TTL = 5 * 60 * 1000;

function saveNavState() {
  if (!isNavigating || !navTarget) {
    localStorage.removeItem(NAV_STORAGE_KEY);
    return;
  }
  try {
    localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify({
      navTarget,
      navPath,
      navPathOriginal,
      navStartX,
      navStartY,
      isNavigating: true,
      savedAt: Date.now()
    }));
  } catch (e) { console.warn("⚠️ Не удалось сохранить навигацию:", e.message); }
}

function loadNavState() {
  try {
    const raw = localStorage.getItem(NAV_STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (!state || !state.isNavigating || !state.navTarget) return null;
    if (Date.now() - (state.savedAt || 0) > NAV_STORAGE_TTL) {
      console.log("🕒 [НАВ] Сохранённая навигация устарела");
      localStorage.removeItem(NAV_STORAGE_KEY);
      return null;
    }
    return state;
  } catch (e) { return null; }
}

function clearNavState() {
  try { localStorage.removeItem(NAV_STORAGE_KEY); } catch (e) {}
}

// --- ИНИЦИАЛИЗАЦИЯ ---
function initWorld() {
  console.log("🗺️ [МИР] Запуск клиента карты...");

  // 🔥 Берём профиль из localStorage (быстрый кэш)
  const localSave = localStorage.getItem('rpg_save');
  if (localSave) {
    try {
      localPlayer = JSON.parse(localSave).player;
      window.player = localPlayer;
    } catch(e) {}
  }

  if (!localPlayer) {
    alert("❌ Профиль не найден! Вернитесь в город.");
    window.location.replace('../index.html');
    return;
  }

  localStorage.setItem('world_active', 'true');

  console.log("📡 [МИР] Создаём свой сокет для карты...");

  if (typeof io === 'undefined') {
    console.error("❌ [МИР] Socket.io не подключён!");
    return;
  }

  // 🔥 СВОЙ сокет для карты — не конфликтует с game.js/telegram.js
  worldSocket = io('https://darkworld-server.onrender.com', {
    transports: ['websocket'],
    forceNew: true,
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
  });
}

// --- ОСНОВНАЯ ЛОГИКА ---
function startWorldAfterSocket() {
  if (!worldSocket) {
    console.error("❌ [МИР] worldSocket не инициализирован!");
    return;
  }

  window.worldSocket = worldSocket;
  worldSocket.userId = localPlayer.id;

  // ============================================================================
  // 🔥 ЗАГРУЖАЕМ СВЕЖИЙ ПРОФИЛЬ С СЕРВЕРА
  // ============================================================================
  worldSocket.on('load_game_success', (data) => {
    if (data && data.player) {
      console.log("☁️ [МИР] Профиль получен с сервера:", data.player.name);
      localPlayer = data.player;
      window.player = data.player;
      updateWorldHeader();
      try { localStorage.setItem('rpg_save', JSON.stringify({ player: data.player })); } catch(e) {}
    }
  });

  worldSocket.on('stat_distribution_error', (msg) => {
    alert(`❌ Ошибка сохранения: ${msg}`);
  });

  worldSocket.emit('load_game_secure', {
    userId: localPlayer.id,
    username: localPlayer.name || 'Герой'
  });

  // ============================================================================
  // КЭШИ
  // ============================================================================
  window.tileCache = window.tileCache || {};
  window.resourceCache = window.resourceCache || {};
  window.monsterCache = window.monsterCache || {};

  // ============================================================================
  // ОБРАБОТЧИКИ СОБЫТИЙ
  // ============================================================================
  handlers.world_map_data = (data) => {
    console.log("🎉 [МИР] world_map_data пришёл!");
    __mapSynced = true;
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

    if (!isNavigating) {
      hideMoveProgress();
    }

    if (worldSocket && worldSocket.connected) {
      __mapSynced = false;
      worldSocket.emit('world_get_map', { userId: localPlayer.id });
    } else {
      __mapSynced = true;
    }

    window.__moveSyncRequested = false;

    if (isNavigating) {
      const waitForSync = setInterval(() => {
        if (__mapSynced) {
          clearInterval(waitForSync);
          setTimeout(() => navigateNextStep(), 150);
        }
      }, 80);

      setTimeout(() => {
        clearInterval(waitForSync);
        if (!__mapSynced) {
          console.warn("⚠️ [НАВ] Карта не синхронизировалась за 3с — форсируем шаг");
          __mapSynced = true;
          if (isNavigating) navigateNextStep();
        }
      }, 3000);
    }
  };

  handlers.world_move_cancelled = () => {
    console.log("🚫 [МИР] Переход отменён");
    isMoving = false;
    moveEndsAt = null;
    isNavigating = false;
    navPath = [];
    navPathOriginal = [];
    navStartX = null;
    navStartY = null;
    clearNavState();
    hideMoveProgress();
    if (currentMapData) updateGridContent(currentMapData);
  };

  handlers.world_move_blocked = (data) => {
    showToast(`🚫 ${data.reason}`, 'error');
    isMoving = false;
    isNavigating = false;
    navPath = [];
    navPathOriginal = [];
    navStartX = null;
    navStartY = null;
    clearNavState();
    hideMoveProgress();
    if (currentMapData) updateGridContent(currentMapData);
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

  handlers.world_find_path_result = (response) => {
    console.log("📡 [НАВ] Получен ответ:", response);
    if (!response) return;

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

    navStartX = currentMapData.myX;
    navStartY = currentMapData.myY;
    navPathOriginal = [...response.steps];
    navPath = response.steps;
    window.__navRestoreAttempted = false;
    isNavigating = true;

    updateGridContent(currentMapData);

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

  handlers.town_hp_regen_update = (data) => {
    if (!localPlayer) return;
    localPlayer.hp = data.currentHp;
    updateWorldHeader();
  };

  handlers.error = (msg) => {
    showToast(`🚨 ${msg}`, 'error');
  };

  attachHandlers();

  worldSocket.emit('world_get_map', { userId: localPlayer.id });
  initMapDrag();

  // 🔥 Кнопка инвентаря — вызывает window.openInventory() из world_ui.js
  const invBtn = document.getElementById('world-inventory-btn');
  if (invBtn) {
    invBtn.addEventListener('click', () => {
      console.log("🎒 [МИР] Открыть инвентарь");
      if (typeof window.openInventory === 'function') {
        window.openInventory();
      } else {
        console.error("❌ window.openInventory не найдена! Проверь world_ui.js");
      }
    });
  }

  // 🔥 Аватарка — вызывает window.openProfile() из world_ui.js
  const avatarSlot = document.getElementById('world-avatar-slot');
  if (avatarSlot) {
    avatarSlot.addEventListener('click', () => {
      console.log("👤 [МИР] Открыть профиль");
      if (typeof window.openProfile === 'function') {
        window.openProfile();
      } else {
        console.error("❌ window.openProfile не найдена! Проверь world_ui.js");
      }
    });
  }

  updateWorldHeader();

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

// --- ОБНОВЛЕНИЕ ШАПКИ ИГРОКА ---
function updateWorldHeader() {
  if (!localPlayer) return;

  const avatarImg = document.getElementById('world-player-avatar');
  if (avatarImg) {
    const avatarValue = localPlayer.avatar || '../assets/avatars/hero1.png';
    avatarImg.src = (avatarValue.includes('.') || avatarValue.includes('/'))
      ? avatarValue
      : '../assets/avatars/hero1.png';
  }

  const nameEl = document.getElementById('world-player-name');
  if (nameEl) nameEl.textContent = localPlayer.name || 'Герой';

  const levelEl = document.getElementById('world-player-level');
  if (levelEl) levelEl.textContent = `Lv. ${localPlayer.level || 1}`;

  const hpBadge = document.getElementById('world-hp-badge');
  const hpFill = document.getElementById('world-hp-fill');
  const currentHp = Number(localPlayer.hp || 0);
  const maxHp = getPlayerMaxHp();

  if (hpBadge) hpBadge.textContent = `${currentHp} / ${maxHp}`;
  if (hpFill) {
    const percent = maxHp > 0 ? (currentHp / maxHp) * 100 : 0;
    hpFill.style.width = `${percent}%`;
    if (percent > 60) hpFill.style.background = 'linear-gradient(90deg, #2ecc71, #26de81)';
    else if (percent > 30) hpFill.style.background = 'linear-gradient(90deg, #f1c40f, #e67e22)';
    else hpFill.style.background = 'linear-gradient(90deg, #e74c3c, #c0392b)';
  }

  const titleEl = document.getElementById('world-map-title');
  if (titleEl && currentMapData) {
    const mapName = currentMapData.mapId === 'ashenvale_main' ? 'Ашенваль'
                  : currentMapData.mapId === 'dragonhold_main' ? 'Драгонхолд'
                  : currentMapData.mapId === 'mine_1' ? 'Шахта'
                  : 'Мир';
    titleEl.textContent = `🗺️ ${mapName} · Клетка (${currentMapData.myX}, ${currentMapData.myY})`;
  }
}

function getPlayerMaxHp() {
  if (!localPlayer) return 10;
  const baseEnd = Number(localPlayer.stats?.endurance || localPlayer.endurance || 1);
  let gearEnd = 0, flatHp = 0;

  if (localPlayer.equipped) {
    const slots = ['head', 'body', 'legs', 'gloves', 'neck', 'mainHand', 'offHand', 'extra'];
    const proc = (id) => {
      if (!id || !window.getItemData) return;
      const d = window.getItemData(id);
      if (d?.bonus) {
        if (d.bonus.endurance) gearEnd += d.bonus.endurance;
        if (d.bonus.stats?.endurance) gearEnd += d.bonus.stats.endurance;
        if (d.bonus.hp) flatHp += d.bonus.hp;
      }
    };
    slots.forEach(s => proc(localPlayer.equipped[s]));
    if (Array.isArray(localPlayer.equipped.rings)) localPlayer.equipped.rings.forEach(proc);
  }
  return ((baseEnd + gearEnd) * 10) + flatHp;
}

// --- ОБРАБОТКА КАРТЫ ---
function onMapData(data) {
  console.log("🗺️ [МИР] Карта получена:", data);
  currentMapData = data;

  if (data.tiles) data.tiles.forEach(t => { window.tileCache[`${t.x}_${t.y}`] = t; });
  if (data.resources) data.resources.forEach(r => { window.resourceCache[`${r.x}_${r.y}`] = r; });
  if (data.monsters) data.monsters.forEach(m => { window.monsterCache[`${m.x}_${m.y}`] = m; });

  const loader = document.getElementById('world-loader');
  if (loader) loader.style.display = 'none';

  updateWorldHeader();
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

  // 🔥 Восстановление навигатора после F5
  if (!isNavigating && !window.__navRestoreAttempted) {
    window.__navRestoreAttempted = true;
    const saved = loadNavState();
    if (saved) {
      console.log("♻️ [НАВ F5] Восстанавливаем прерванный маршрут:", saved.navTarget);

      navTarget = saved.navTarget;
      navPathOriginal = saved.navPathOriginal || [];
      navStartX = saved.navStartX;
      navStartY = saved.navStartY;

      const stepsToRemove = Math.max(0,
        Math.abs(data.myX - navStartX) + Math.abs(data.myY - navStartY)
      );
      navPath = navPathOriginal.slice(stepsToRemove);
      navStartX = data.myX;
      navStartY = data.myY;
      navPathOriginal = [...navPath];
      isNavigating = true;

      console.log(`✅ [НАВ F5] Осталось шагов: ${navPath.length} (срезано ${stepsToRemove})`);

      updateGridContent(data);
      showSelectedCellInfo(
        window.currentTileMap[`${navTarget.x}_${navTarget.y}`],
        window.currentResourceMap[`${navTarget.x}_${navTarget.y}`],
        window.currentMonsterMap[`${navTarget.x}_${navTarget.y}`],
        null, navTarget.x - data.myX, navTarget.y - data.myY, navTarget.x, navTarget.y
      );

      const tryResume = () => {
        if (!isMoving) {
          console.log("🚀 [НАВ F5] Продолжаем маршрут...");
          navigateNextStep();
        } else {
          setTimeout(tryResume, 500);
        }
      };
      setTimeout(tryResume, 800);
    }
  }
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
    return;
  }

  const containerSize = container.offsetWidth;
  const fullMapSize = containerSize * 7.14;
  const cellSize = fullMapSize / 50;

  const playerCenterX = myX * cellSize + cellSize / 2;
  const playerCenterY = myY * cellSize + cellSize / 2;

  const offsetX = containerSize / 2 - playerCenterX;
  const offsetY = containerSize / 2 - playerCenterY;

  const minOffsetX = containerSize - fullMapSize;
  const minOffsetY = containerSize - fullMapSize;

  const clampedX = Math.max(minOffsetX, Math.min(0, offsetX));
  const clampedY = Math.max(minOffsetY, Math.min(0, offsetY));

  if (!isDragging) applyMapOffset(clampedX, clampedY, true);
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

  applyMapOffset(
    Math.max(minOffsetX, Math.min(0, offsetX)),
    Math.max(minOffsetY, Math.min(0, offsetY)),
    true
  );
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

    const containerSize = container.offsetWidth;
    const fullMapSize = containerSize * 7.14;
    const minOffset = containerSize - fullMapSize;

    applyMapOffset(
      Math.max(minOffset, Math.min(0, dragOffsetStartX + dx)),
      Math.max(minOffset, Math.min(0, dragOffsetStartY + dy)),
      false
    );
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
    const containerSize = container.offsetWidth;
    const fullMapSize = containerSize * 7.14;
    const minOffset = containerSize - fullMapSize;
    applyMapOffset(
      Math.max(minOffset, Math.min(0, dragOffsetStartX + dx)),
      Math.max(minOffset, Math.min(0, dragOffsetStartY + dy)),
      false
    );
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

// --- КНОПКИ ВХОДА В ЛОКАЦИИ ---
function updateCityButton(myX, myY) {
  const enterActions = document.getElementById('my-cell-enter-actions');
  if (!enterActions) return;

  enterActions.innerHTML = '';

  const ENTER_POINTS = [
    { x: 37, y: 14, label: '🏰 Войти в город', action: () => window.enterCity() }
  ];

  ENTER_POINTS.forEach(point => {
    if (myX === point.x && myY === point.y) {
      const btn = document.createElement('button');
      btn.className = 'action-btn enter-city';
      btn.textContent = point.label;
      btn.onclick = point.action;
      enterActions.appendChild(btn);
    }
  });
}

// --- РЕНДЕР ---
function renderMap(data) {
  const grid = document.getElementById('world-map-grid');
  if (!grid) return;
  if (grid.children.length === 0) buildFullGrid();
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
}

function updateGridContent(data) {
  const grid = document.getElementById('world-map-grid');
  if (!grid) return;

  const { myX, myY, resourcesDB, regionsDB, buildingsDB } = data;
  const tileMap = window.tileCache || {};
  const resourceMap = window.resourceCache || {};
  const monsterMap = window.monsterCache || {};

  const playerMap = {};
  if (data.players) data.players.forEach(p => { playerMap[`${p.x}_${p.y}`] = p; });

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
      if (Math.abs(dx) + Math.abs(dy) === 1) cell.classList.add('adjacent');

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

    if (isNavigating && navTarget) {
      const isPathCell = isCellInPath(x, y);
      const isTargetCell = (x === navTarget.x && y === navTarget.y);
      if (isTargetCell) cell.classList.add('target-tile');
      else if (isPathCell) cell.classList.add('path-tile');
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

function isCellInPath(x, y) {
  if (!isNavigating || !navPathOriginal || navPathOriginal.length === 0) return false;
  if (navStartX === null || navStartY === null) return false;

  const passedCount = navPathOriginal.length - navPath.length;
  let curX = navStartX;
  let curY = navStartY;

  for (let i = 0; i < navPathOriginal.length; i++) {
    curX += navPathOriginal[i].dx;
    curY += navPathOriginal[i].dy;
    if (i < passedCount) continue;
    if (curX === x && curY === y) return true;
  }
  return false;
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

  if (isNavigating && navTarget && (navTarget.x !== x || navTarget.y !== y)) return;
  if (dx === 0 && dy === 0) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  selActions.innerHTML = '';
  if (coordsEl) coordsEl.textContent = `(${x}, ${y})`;

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
      navPathOriginal = [];
      navStartX = null;
      navStartY = null;
      navTarget = null;
      clearNavState();
      updateGridContent(currentMapData);
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

// --- НАВИГАЦИЯ ---
function navigateNextStep() {
  if (!isNavigating || navPath.length === 0) {
    isNavigating = false;
    navPath = [];
    navPathOriginal = [];
    navStartX = null;
    navStartY = null;
    navTarget = null;
    clearNavState();
    hideMoveProgress();
    updateGridContent(currentMapData);

    selectedTile = null;
    const selectedPanel = document.getElementById('selected-cell-panel');
    if (selectedPanel) selectedPanel.classList.add('hidden');

    setTimeout(() => {
      if (currentMapData) updateMapBackground(currentMapData.myX, currentMapData.myY);
    }, 200);
    return;
  }

  if (isMoving) return;

  const step = navPath.shift();
  saveNavState();
  updateGridContent(currentMapData);

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

  const nextX = currentMapData.myX + step.dx;
  const nextY = currentMapData.myY + step.dy;
  const nextTile = window.tileCache?.[`${nextX}_${nextY}`];

  if (nextTile && nextTile.is_blocked) {
    showToast('🚫 Путь заблокирован', 'error');
    isNavigating = false;
    navPath = [];
    navPathOriginal = [];
    navStartX = null;
    navStartY = null;
    navTarget = null;
    clearNavState();
    hideMoveProgress();
    updateGridContent(currentMapData);
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
  navPathOriginal = [];
  navStartX = null;
  navStartY = null;
  navTarget = null;
  clearNavState();

  updateGridContent(currentMapData);
  hideMoveProgress();
  worldSocket.emit('world_move_cancel', { userId: localPlayer.id });

  if (selectedTile) {
    showSelectedCellInfo(
      selectedTile.tile, selectedTile.resource, selectedTile.monster,
      selectedTile.otherPlayer, selectedTile.dx, selectedTile.dy,
      selectedTile.x, selectedTile.y
    );
  }
};

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

  if (old) {
    console.log("♻️ [МИР] Модалка перехода уже открыта — обновляем таймер");

    if (moveTimerInterval) clearInterval(moveTimerInterval);

    const fill = document.getElementById('move-progress-fill');
    const timeEl = document.getElementById('move-progress-time');
    const startTime = Date.now();
    const totalDuration = durationMs;

    if (fill) {
      fill.style.transition = 'none';
      fill.style.width = '0%';
      void fill.offsetWidth;
      fill.style.transition = `width ${totalDuration}ms linear`;
      fill.style.width = '100%';
    }

    if (timeEl) {
      timeEl.textContent = `${(totalDuration / 1000).toFixed(1)}с`;
      timeEl.style.color = '#f1c40f';
      timeEl.style.fontSize = '18px';
    }

    moveTimerInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, (totalDuration - elapsed) / 1000);
      if (remaining > 0) {
        if (timeEl) timeEl.textContent = `${remaining.toFixed(1)}с`;
      } else {
        if (timeEl) {
          timeEl.textContent = 'Синхронизация...';
          timeEl.style.color = '#3498db';
          timeEl.style.fontSize = '14px';
        }
      }
    }, 100);

    if (window.__moveSafetyTimeout) clearTimeout(window.__moveSafetyTimeout);
    window.__moveSafetyTimeout = setTimeout(() => {
      const modal = document.getElementById('move-progress');
      if (modal && !isNavigating) {
        hideMoveProgress();
        isMoving = false;
      }
    }, totalDuration + 5000);
    return;
  }

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
      <div id="move-progress-fill" style="height: 100%; width: 0%; background: linear-gradient(90deg, #6c5ce7, #a29bfe); transition: width ${durationMs}ms linear;"></div>
    </div>
    <div id="move-progress-time" style="font-size: 18px; font-weight: bold; color: #f1c40f; font-family: monospace;">${(durationMs / 1000).toFixed(1)}с</div>
    <button onclick="window.cancelMove()" style="margin-top: 12px; background: #e74c3c; border: none; color: #fff; padding: 8px 16px; border-radius: 8px; font-weight: bold; cursor: pointer;">Отменить</button>
  `;

  document.body.appendChild(container);

  const fill = document.getElementById('move-progress-fill');
  const timeEl = document.getElementById('move-progress-time');
  const startTime = Date.now();
  const totalDuration = durationMs;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => { if (fill) fill.style.width = '100%'; });
  });

  if (moveTimerInterval) clearInterval(moveTimerInterval);
  moveTimerInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, (totalDuration - elapsed) / 1000);
    if (remaining > 0) {
      if (timeEl) timeEl.textContent = `${remaining.toFixed(1)}с`;
    } else {
      if (timeEl) {
        timeEl.textContent = 'Синхронизация...';
        timeEl.style.color = '#3498db';
        timeEl.style.fontSize = '14px';
      }
    }
  }, 100);

  if (window.__moveSafetyTimeout) clearTimeout(window.__moveSafetyTimeout);
  window.__moveSafetyTimeout = setTimeout(() => {
    const modal = document.getElementById('move-progress');
    if (modal && !isNavigating) {
      hideMoveProgress();
      isMoving = false;
    }
  }, totalDuration + 5000);
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

// --- СОХРАНЕНИЕ ПЕРЕД ВЫХОДОМ ---
window.addEventListener('beforeunload', () => {
  saveNavState();
  if (worldSocket) {
    try { worldSocket.disconnect(); } catch(e) {}
  }
});

document.addEventListener('DOMContentLoaded', initWorld);