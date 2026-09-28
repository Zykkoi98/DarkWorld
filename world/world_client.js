// ============================================================================
// ===== 🗺️ КЛИЕНТ КАРТЫ МИРА (WORLD_CLIENT.JS) — v2 =====
// ===== ФИКСЫ P0: обновление карты + чистка при закрытии =====
// ============================================================================

let worldSocket = null;
let localPlayer = null;
let currentMapData = null;
let selectedTile = null;

let isMoving = false;
let moveTimerInterval = null;
let moveEndsAt = null;

const VIEW_RADIUS = 3;

// 🔥 Именованные обработчики — чтобы можно было точечно снимать
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

  // 🔥 ФИКС: ждём родительский сокет, НЕ создаём свой
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

// --- ОСНОВНАЯ ЛОГИКА ПОСЛЕ ПРИВЯЗКИ К СОКЕТУ ---
function startWorldAfterSocket() {
  window.worldSocket = worldSocket;
  worldSocket.userId = localPlayer.id;

  // --- СЛУШАТЕЛИ (именованные, чтобы можно было снять) ---

  handlers.world_map_data = (data) => {
    console.log("🎉 [МИР] world_map_data пришёл от сервера!");
    onMapData(data);
  };
  worldSocket.off('world_map_data', handlers.world_map_data);
  worldSocket.on('world_map_data', handlers.world_map_data);

  handlers.world_move_started = (data) => {
    console.log("🚶 [МИР] Начат переход:", data);
    isMoving = true;
    moveEndsAt = data.endsAt;
    showMoveProgress(data.durationMs);
    blockControls(true);
  };
  worldSocket.off('world_move_started', handlers.world_move_started);
  worldSocket.on('world_move_started', handlers.world_move_started);

  handlers.world_move_completed = (data) => {
    console.log("✅ [МИР] Переход завершён, запрашиваем свежую карту");
    isMoving = false;
    moveEndsAt = null;
    hideMoveProgress();
    blockControls(false);
    // 🔥 ФИКС P0-1: явно запрашиваем свежую карту
    if (worldSocket && worldSocket.connected) {
      worldSocket.emit('world_get_map', { userId: localPlayer.id });
    }
  };
  worldSocket.off('world_move_completed', handlers.world_move_completed);
  worldSocket.on('world_move_completed', handlers.world_move_completed);

  handlers.world_move_cancelled = () => {
    console.log("🚫 [МИР] Переход отменён");
    isMoving = false;
    moveEndsAt = null;
    hideMoveProgress();
    blockControls(false);
  };
  worldSocket.off('world_move_cancelled', handlers.world_move_cancelled);
  worldSocket.on('world_move_cancelled', handlers.world_move_cancelled);

  handlers.world_move_blocked = (data) => {
    showToast(`🚫 ${data.reason}`, 'error');
    isMoving = false;
    hideMoveProgress();
    blockControls(false);
  };
  worldSocket.off('world_move_blocked', handlers.world_move_blocked);
  worldSocket.on('world_move_blocked', handlers.world_move_blocked);

  handlers.world_player_moved = () => {
    worldSocket.emit('world_get_map', { userId: localPlayer.id });
  };
  worldSocket.off('world_player_moved', handlers.world_player_moved);
  worldSocket.on('world_player_moved', handlers.world_player_moved);

  handlers.world_gathered = (data) => {
    showToast(`✅ Собрано: ${data.resourceIcon} ${data.resourceName}`, 'success');
  };
  worldSocket.off('world_gathered', handlers.world_gathered);
  worldSocket.on('world_gathered', handlers.world_gathered);

  handlers.world_teleported = (data) => {
    showToast(`🌀 Телепорт: ${data.mapName}`, 'info');
  };
  worldSocket.off('world_teleported', handlers.world_teleported);
  worldSocket.on('world_teleported', handlers.world_teleported);

  handlers.world_portal_found = () => {
    showToast(`🌀 Здесь портал!`, 'info');
  };
  worldSocket.off('world_portal_found', handlers.world_portal_found);
  worldSocket.on('world_portal_found', handlers.world_portal_found);

  handlers.world_monster_data = (data) => {
    console.log("⚔️ Данные моба:", data);
    alert(`⚔️ ${data.monster.name}\nУровень: ${data.monster.level}\n\nБой подключим позже.`);
  };
  worldSocket.off('world_monster_data', handlers.world_monster_data);
  worldSocket.on('world_monster_data', handlers.world_monster_data);

  handlers.error = (msg) => {
    showToast(`🚨 ${msg}`, 'error');
  };
  worldSocket.off('error', handlers.error);
  worldSocket.on('error', handlers.error);

  // Первый запрос карты
  worldSocket.emit('world_get_map', { userId: localPlayer.id });

  // Скрываем лоадер
  setTimeout(() => {
    const loader = document.getElementById('world-loader');
    if (loader) loader.style.display = 'none';
  }, 1500);
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

  // Восстановление активного перехода (для F5)
  if (data.activeMove && data.activeMove.endsAt) {
    const remainingMs = Math.max(0, data.activeMove.endsAt - Date.now());
    if (remainingMs > 0) {
      isMoving = true;
      moveEndsAt = data.activeMove.endsAt;
      showMoveProgress(remainingMs);
      blockControls(true);
    }
  }

  renderMap(data);
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

      if (tile && tile.region) {
        cell.classList.add(`region-${tile.region}`);
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
}

// --- КЛИК ПО КЛЕТКЕ ---
function onTileClick(x, y, tile, resource, monster, otherPlayer, dx, dy) {
  selectedTile = { x, y, tile, resource, monster, otherPlayer, dx, dy };

  const infoDiv = document.getElementById('tile-info');
  const actionsDiv = document.getElementById('tile-actions');
  actionsDiv.innerHTML = '';

  if (dx === 0 && dy === 0) {
    infoDiv.innerHTML = '<div style="color: #f1c40f; font-weight: bold;">📍 Вы здесь</div>';

    if (resource && resource.resource_id) {
      const rData = currentMapData.resourcesDB[resource.resource_id];
      infoDiv.innerHTML += `<div style="color: #2ecc71; font-size: 12px; margin-top: 4px;">${rData.icon} ${rData.name}</div>`;
      const btn = document.createElement('button');
      btn.className = 'action-btn gather';
      btn.textContent = '🌿 Собрать';
      btn.onclick = () => {
        worldSocket.emit('world_gather', { userId: localPlayer.id });
      };
      actionsDiv.appendChild(btn);
    }
    return;
  }

  let infoHtml = '';
  if (tile && tile.region) {
    const rData = currentMapData.regionsDB[tile.region];
    infoHtml += `<div style="font-weight: bold; font-size: 14px;">${rData ? rData.icon : ''} ${rData ? rData.name : tile.region}</div>`;
  }
  if (monster) {
    infoHtml += `<div style="color: #e74c3c; font-size: 12px;">👹 Моб ${monster.level} ур.</div>`;
  }
  if (resource && resource.resource_id) {
    const rData = currentMapData.resourcesDB[resource.resource_id];
    infoHtml += `<div style="color: #2ecc71; font-size: 12px;">${rData ? rData.icon : ''} ${rData ? rData.name : 'Ресурс'}</div>`;
  }
  if (otherPlayer) {
    infoHtml += `<div style="color: #2ecc71; font-size: 12px;">🟢 ${otherPlayer.name}</div>`;
  }
  if (tile && tile.building) {
    const bData = currentMapData.buildingsDB[tile.building];
    infoHtml += `<div style="color: #f1c40f; font-size: 12px;">${bData ? bData.icon : '🏛️'} ${bData ? bData.name : tile.building}</div>`;
  }
  infoDiv.innerHTML = infoHtml || '<div style="color: #9aa0b5; font-size: 12px;">Пустая клетка</div>';

  if (monster) {
    const btn = document.createElement('button');
    btn.className = 'action-btn attack';
    btn.textContent = '⚔️ Напасть';
    btn.onclick = () => {
      worldSocket.emit('world_attack', { userId: localPlayer.id, monsterId: monster.id });
    };
    actionsDiv.appendChild(btn);
  }

  const isAdjacent = Math.abs(dx) + Math.abs(dy) === 1;
  if (isAdjacent) {
    const moveBtn = document.createElement('button');
    moveBtn.className = 'action-btn move';
    moveBtn.textContent = '🚶 Перейти (15с)';
    moveBtn.onclick = () => moveWorld(dx, dy);
    actionsDiv.appendChild(moveBtn);
  }
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
  showMoveProgress(15000);

  worldSocket.emit('world_move_start', { userId: localPlayer.id, dx, dy });
};

window.cancelMove = function() {
  if (!worldSocket || !localPlayer) return;
  worldSocket.emit('world_move_cancel', { userId: localPlayer.id });
};

// --- ВЫХОД ---
window.exitWorld = function() {
  localStorage.removeItem('world_active');

  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'CLOSE_WORLD_OVERLAY' }, '*');
  } else {
    window.location.replace('../index.html');
  }
};

// --- ПРОГРЕСС ПЕРЕХОДА ---
function showMoveProgress(durationMs) {
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
    if (timeEl) timeEl.textContent = `${remaining.toFixed(1)}с`;

    if (remaining <= 0) {
      clearInterval(moveTimerInterval);
      moveTimerInterval = null;
      // ❌ УБРАНО: принудительное скрытие через 1.5 сек
      // Теперь модалка закроется сама, когда придёт world_move_completed
    }
  }, 100);
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
  ['btn-up', 'btn-down', 'btn-left', 'btn-right'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.disabled = blocked;
      btn.style.opacity = blocked ? '0.3' : '1';
      btn.style.pointerEvents = blocked ? 'none' : 'auto';
    }
  });
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

// ============================================================================
// 🔥 ФИКС P0-2: очистка подписок при закрытии iframe
// ============================================================================
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'WORLD_WILL_UNLOAD') {
    console.log("🧹 [МИР] Получен сигнал выгрузки, чистим подписки");
    if (worldSocket) {
      // Снимаем ВСЕ именованные обработчики
      Object.keys(handlers).forEach(eventName => {
        try {
          worldSocket.off(eventName, handlers[eventName]);
        } catch (e) {}
      });
      // НЕ отключаем сам сокет — он родительский!
      console.log("✅ [МИР] Все подписки сняты, сокет родителя сохранён");
    }
    // Очищаем таймеры
    if (moveTimerInterval) {
      clearInterval(moveTimerInterval);
      moveTimerInterval = null;
    }
    localStorage.removeItem('world_active');
  }
});

document.addEventListener('DOMContentLoaded', initWorld);