// ============================================================================
// ===== 🗺️ КЛИЕНТ КАРТЫ МИРА (WORLD_CLIENT.JS) =====
// ============================================================================

let worldSocket = null;
let localPlayer = null;
let currentMapData = null;
let selectedTile = null;

const VIEW_RADIUS = 3;
const GRID_SIZE = 7;

// --- 1. ИНИЦИАЛИЗАЦИЯ ---
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

  // Сокет города (родителя) или свой
  if (window.parent && window.parent !== window && window.parent.socket && window.parent.socket.connected) {
    worldSocket = window.parent.socket;
    console.log("✅ [МИР] Привязан к сокету родителя (города)");
  } else if (typeof io !== 'undefined') {
    worldSocket = io('https://darkworld-server.onrender.com', {
      transports: ['websocket'],
      forceNew: false,
      auth: { userId: localPlayer.id }
    });
    console.log("⚠️ [МИР] Создан свой сокет");
  } else {
    alert("Ошибка: Socket.io не загружен!");
    return;
  }

  window.worldSocket = worldSocket;
  worldSocket.userId = localPlayer.id;

  // Слушатели
  worldSocket.off('world_map_data');
  worldSocket.on('world_map_data', onMapData);

  worldSocket.off('world_move_blocked');
  worldSocket.on('world_move_blocked', (data) => {
    console.log("🚫 [МИР] Движение заблокировано:", data.reason);
  });

  worldSocket.off('world_player_moved');
  worldSocket.on('world_player_moved', () => {
    // Просто обновляем карту — другой игрок сдвинулся
    worldSocket.emit('world_get_map', { userId: localPlayer.id });
  });

  worldSocket.off('world_gathered');
  worldSocket.on('world_gathered', (data) => {
    showToast(`✅ Собрано: ${data.resourceIcon} ${data.resourceName}`, 'success');
  });

  worldSocket.off('world_teleported');
  worldSocket.on('world_teleported', (data) => {
    showToast(`🌀 Телепорт: ${data.mapName}`, 'info');
  });

  worldSocket.off('world_portal_found');
  worldSocket.on('world_portal_found', (data) => {
    showToast(`🌀 Здесь портал! Нажми «Войти»`, 'info');
  });

  worldSocket.off('world_monster_data');
  worldSocket.on('world_monster_data', (data) => {
    console.log("⚔️ Данные моба:", data);
    alert(`⚔️ ${data.monster.name}\nHP: неизвестно\nУровень: ${data.monster.level}\n\nБой подключим позже.`);
  });

  worldSocket.off('error');
  worldSocket.on('error', (msg) => {
    showToast(`🚨 ${msg}`, 'error');
  });

  // Запрашиваем карту
  worldSocket.emit('world_get_map', { userId: localPlayer.id });

  // Скрываем лоадер через 1 сек (на случай медленной загрузки)
  setTimeout(() => {
    const loader = document.getElementById('world-loader');
    if (loader) loader.style.display = 'none';
  }, 1500);
}

// --- 2. ОБРАБОТКА ДАННЫХ КАРТЫ ---
function onMapData(data) {
  console.log("🗺️ [МИР] Карта получена:", data);
  currentMapData = data;

  // Скрываем лоадер
  const loader = document.getElementById('world-loader');
  if (loader) loader.style.display = 'none';

  // Обновляем шапку
  document.getElementById('pos-x').textContent = data.myX;
  document.getElementById('pos-y').textContent = data.myY;
  if (data.mapId === 'ashenvale_main') document.getElementById('map-name').textContent = 'Ашенваль';
  else if (data.mapId === 'dragonhold_main') document.getElementById('map-name').textContent = 'Драгонхолд';
  else if (data.mapId === 'mine_1') document.getElementById('map-name').textContent = 'Шахта';

  renderMap(data);
}

// --- 3. РЕНДЕР СЕТКИ 7×7 ---
function renderMap(data) {
  const grid = document.getElementById('world-map-grid');
  if (!grid) return;

  grid.innerHTML = '';

  const { myX, myY, tiles, resources, monsters, players, resourcesDB, regionsDB, buildingsDB } = data;

  // Индексация по координатам
  const tileMap = {};
  tiles.forEach(t => { tileMap[`${t.x}_${t.y}`] = t; });

  const resourceMap = {};
  resources.forEach(r => { resourceMap[`${r.x}_${r.y}`] = r; });

  const monsterMap = {};
  monsters.forEach(m => { monsterMap[`${m.x}_${m.y}`] = m; });

  const playerMap = {};
  players.forEach(p => { playerMap[`${p.x}_${p.y}`] = p; });

  // Отрисовка сетки
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

      // Регион (фон)
      if (tile && tile.region) {
        cell.classList.add(`region-${tile.region}`);
      }

      // Центральная клетка — игрок
      if (dx === 0 && dy === 0) {
        cell.classList.add('center-tile');
        cell.innerHTML = '<span class="player-icon">👤</span>';
      }
      // Другой игрок
      else if (otherPlayer) {
        cell.innerHTML = `<span class="other-player">🟢</span>`;
        cell.title = otherPlayer.name;
      }
      // Моб
      else if (monster && monster.monster_id) {
        cell.innerHTML = `<span class="monster-icon">👹</span>`;
        cell.title = `Моб ${monster.level} ур.`;
      }
      // Ресурс
      else if (resource && resource.resource_id) {
        const rData = resourcesDB[resource.resource_id];
        cell.innerHTML = `<span class="resource-icon">${rData ? rData.icon : '🌿'}</span>`;
      }
      // Строение
      else if (tile && tile.building) {
        const bData = buildingsDB[tile.building];
        cell.innerHTML = `<span class="building-icon">${bData ? bData.icon : '🏛️'}</span>`;
      }
      // Регион (эмодзи региона)
      else if (tile && tile.region) {
        const rData = regionsDB[tile.region];
        cell.innerHTML = `<span style="opacity: 0.4; font-size: 18px;">${rData ? rData.icon : ''}</span>`;
      }

      // Клик по клетке
      cell.onclick = () => onTileClick(x, y, tile, resource, monster, otherPlayer, dx, dy);

      grid.appendChild(cell);
    }
  }
}

// --- 4. КЛИК ПО КЛЕТКЕ ---
function onTileClick(x, y, tile, resource, monster, otherPlayer, dx, dy) {
  selectedTile = { x, y, tile, resource, monster, otherPlayer, dx, dy };

  const infoDiv = document.getElementById('tile-info');
  const actionsDiv = document.getElementById('tile-actions');
  actionsDiv.innerHTML = '';

  if (dx === 0 && dy === 0) {
    infoDiv.innerHTML = '<div style="color: #f1c40f; font-weight: bold;">📍 Вы здесь</div>';
    return;
  }

  // Формируем описание клетки
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

  // Кнопки действий
  // Атака моба
  if (monster) {
    const btn = document.createElement('button');
    btn.className = 'action-btn attack';
    btn.textContent = '⚔️ Напасть';
    btn.onclick = () => {
      worldSocket.emit('world_attack', { userId: localPlayer.id, monsterId: monster.id });
    };
    actionsDiv.appendChild(btn);
  }

  // Если соседняя — движение
  const isAdjacent = Math.abs(dx) + Math.abs(dy) === 1;
  if (isAdjacent) {
    const moveBtn = document.createElement('button');
    moveBtn.className = 'action-btn move';
    moveBtn.textContent = '🚶 Перейти';
    moveBtn.onclick = () => moveWorld(dx, dy);
    actionsDiv.appendChild(moveBtn);
  }

  // Сбор ресурса (только на своей клетке — но её уже обработали выше)
  // Порталы и строения — на клетке, где игрок
}

// --- 5. ДВИЖЕНИЕ ---
window.moveWorld = function(dx, dy) {
  if (!worldSocket || !localPlayer) return;
  worldSocket.emit('world_move', { userId: localPlayer.id, dx, dy });
};

// --- 6. ВЫХОД ---
window.exitWorld = function() {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'CLOSE_WORLD_OVERLAY' }, '*');
  } else {
    window.location.replace('../index.html');
  }
};

// --- 7. ТОСТ УВЕДОМЛЕНИЯ ---
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
    animation: toastFade 0.3s ease;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3000);
}

// --- 8. СТАРТ ---
document.addEventListener('DOMContentLoaded', initWorld);