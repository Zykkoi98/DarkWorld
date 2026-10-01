// ============================================================================
// ===== 🧱 КЛИЕНТСКОЕ ЯДРО ИГРЫ (GAME.JS) — v2 =====
// ===== Чистая логика города + рендер + уровни. UI вынесен в shared/ui.js =====
// ============================================================================

window.player = null;
// Утилита рандома
window.rand = function(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Проверка уровня по опыту
window.getCorrectLevelByXp = function(xp) {
  if (!window.XP_TABLE || !Array.isArray(window.XP_TABLE)) {
    console.error("❌ XP_TABLE не найден!");
    return 1;
  }
  for (let lvl = window.XP_TABLE.length - 1; lvl >= 1; lvl--) {
    if (xp >= window.XP_TABLE[lvl]) return lvl;
  }
  return 1;
};

// Конструктор стартового персонажа
function createPlayer() {
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  const name = tgUser?.first_name || 'Новичок';
  const uniqueId = tgUser?.id || 0;

  const newPlayer = {
    id: uniqueId,
    name: name,
    avatar: window.DEFAULT_AVATAR || 'assets/avatars/hero5.jpg',
    level: 1,
    xp: 0,
    gold: 200,
    currentTownIndex: 0,
    statPoints: 5,
    stats: { strength: 1, agility: 1, endurance: 1, luck: 1 },
    inventory: { equipment: [], resources: [], consumables: [] },
    equipped: {
      head: null, body: null, legs: null, neck: null, gloves: null,
      mainHand: null, offHand: null, potion: null, scroll: null,
      rings: [null, null, null]
    }
  };

  newPlayer.hp = (newPlayer.stats.endurance || 1) * 10;
  return newPlayer;
}

// --- ПРОВЕРКА УРОВНЯ И СВОБОДНЫХ ОЧКОВ ---
window.checkLevelUp = function(isInitialLoad = false) {
  if (!window.player) return;

  const correctLevel = window.getCorrectLevelByXp(window.player.xp);

  if (window.player.level !== correctLevel) {
    const oldLevel = window.player.level;
    const isLeveledDown = oldLevel > correctLevel;

    window.player.level = correctLevel;

    if (!isLeveledDown) {
      const levelsGained = correctLevel - oldLevel;
      window.player.statPoints = (window.player.statPoints || 0) + (levelsGained * 5);
      window.player.hp = window.UI.getMaxHp(window.player);
    } else {
      window.player.stats = { strength: 1, agility: 1, endurance: 1, luck: 1 };
      window.player.statPoints = 5 + ((correctLevel - 1) * 5);
    }

    const maxHp = window.UI.getMaxHp(window.player);
    if (window.player.hp > maxHp) window.player.hp = maxHp;
    if (window.saveGame) window.saveGame({ player: window.player });
  }

  if (typeof render === 'function') render();

  // Обновляем открытый профиль
  const modal = document.getElementById('profile-modal');
  if (modal && modal.classList.contains('active')) window.UI.openProfile();
};

// --- РЕНДЕР ГЛАВНОГО ЭКРАНА ГОРОДА ---
function render() {
  if (!window.player) return;

const avatarEl = document.getElementById('player-avatar');
if (avatarEl) {
  avatarEl.src = window.getAssetPath(window.player.avatar || 'assets/avatars/hero1.png');
}

  if (document.getElementById('player-name')) {
    document.getElementById('player-name').textContent = window.player.name;
  }
  if (document.getElementById('player-lvl-text')) {
    document.getElementById('player-lvl-text').textContent = `Lv. ${window.player.level}`;
  }

  const mainHpText = document.getElementById('player-hp-text') || document.getElementById('player-hp');
  if (mainHpText) {
    mainHpText.textContent = `❤️ ${window.player.hp} / ${window.UI.getMaxHp(window.player)}`;
  }

  // HP-бейдж поверх аватарки
  const hpBadge = document.getElementById('player-hp-badge');
  const hpFill = document.getElementById('player-hp-fill');
  const currentMaxHp = window.UI.getMaxHp(window.player);
  const currentHp = Number(window.player.hp || 0);

  if (hpBadge) hpBadge.textContent = `${currentHp} / ${currentMaxHp}`;
  if (hpFill) {
    const percent = currentMaxHp > 0 ? (currentHp / currentMaxHp) * 100 : 0;
    hpFill.style.width = `${percent}%`;

    if (percent > 60) {
      hpFill.style.background = 'linear-gradient(90deg, #2ecc71, #26de81)';
    } else if (percent > 30) {
      hpFill.style.background = 'linear-gradient(90deg, #f1c40f, #e67e22)';
    } else {
      hpFill.style.background = 'linear-gradient(90deg, #e74c3c, #c0392b)';
    }
  }

  // Плашки атаки/защиты (если есть)
  const townAtkEl = document.getElementById('town-player-atk');
  const townDefEl = document.getElementById('town-player-def');
  if (townAtkEl) townAtkEl.textContent = `⚔️ Атака: ${window.UI.getAtk(window.player)}`;
  if (townDefEl) townDefEl.textContent = `🛡️ Защита: ${window.UI.getDef(window.player)} ед.`;

  renderTown();
}

// --- РЕНДЕР ГОРОДА (ЛОКАЦИИ) ---
function renderTown() {
  if (!window.player || !window.TOWNS) return;

  const town = window.TOWNS[window.player.currentTownIndex];
  if (document.getElementById('current-town-name')) {
    document.getElementById('current-town-name').textContent = town.name;
  }

  const grid = document.getElementById('town-locations');
  if (!grid) return;
  grid.innerHTML = '';

  town.locations.forEach(loc => {
    if (!loc) return;

    const btn = document.createElement('button');
    btn.className = 'loc-btn';

    if (loc.name === "Тёмная Башня" || loc.name === "Башня") {
      btn.innerHTML = `<span>${loc.icon}</span><span>Тёмная Башня</span>`;
      btn.style.borderLeft = "4px solid #6c5ce7";
      btn.style.background = "rgba(108, 92, 231, 0.05)";
    } else {
      btn.innerHTML = `<span>${loc.icon}</span><span>${loc.name}</span>`;
    }

    btn.addEventListener('click', function() {
      // КАРТА МИРА
      if (loc.name === "Карта мира") {
        if (!window.player || window.player.hp <= 0) {
          return alert("❌ Вы слишком слабы для путешествия! Восстановите здоровье в Таверне.");
        }
        console.log("🗺️ Переходим на карту мира...");
        window.location.href = 'world/world.html';
      }
      // МАГАЗИН
      else if (loc.name === "Магазин") {
        console.log("🏪 Открываем магазин в iframe...");
        const wrapper = document.getElementById('shop-iframe-wrapper');
        const frame = document.getElementById('shop-iframe-frame');
        if (wrapper && frame) {
          frame.src = 'shop/shop.html';
          wrapper.style.display = 'flex';
        }
      }
      // АРЕНА
      else if (loc.name === "Арена PvP") {
        const wrapper = document.getElementById('arena-iframe-wrapper');
        const frame = document.getElementById('arena-iframe-frame');
        if (wrapper && frame) {
          frame.src = 'arena/arena.html';      // ← теперь в папке
          wrapper.style.display = 'flex';
        }
}
      // БАШНЯ
      else if (loc.name === "Тёмная Башня" || loc.name === "Башня") {
        if (!window.player) return;
        if (Number(window.player.hp) <= 0) {
          return alert("❌ Вы слишком слабы для штурма! Восстановите здоровье в Таверне.");
        }
        console.log("🏰 Открываем Башню в iframe...");
        const wrapper = document.getElementById('tower-iframe-wrapper');
        const frame = document.getElementById('tower-iframe-frame');
        if (wrapper && frame) {
          frame.src = 'tower/tower.html';
          wrapper.style.display = 'flex';
        }
      }
      else {
        alert(`Вы зашли в здание: ${loc.name}`);
      }
    });

    grid.appendChild(btn);
  });

  // Кнопка путешествия между городами
  const travelBtn = document.createElement('button');
  travelBtn.className = 'loc-btn';
  const nextIdx = window.player.currentTownIndex === 0 ? 1 : 0;
  travelBtn.innerHTML = `<span>🛒</span><span>В ${window.TOWNS[nextIdx].name}</span>`;
  travelBtn.addEventListener('click', function() {
    window.player.currentTownIndex = nextIdx;
    if (window.saveGame) window.saveGame({ player: window.player });
    render();
  });
  grid.appendChild(travelBtn);
}

// --- СТАРТ ИГРЫ ---
function startGame() {
  console.log("🚀 Инициализация ядра игры...");

  // Обработка postMessage от iframe (закрытие оверлеев)
  window.addEventListener('message', function(event) {
    if (!event.data) return;

    if (event.data.type === 'CLOSE_ARENA_OVERLAY') {
      // 🔥 Проверка: если игрок в заявке — не закрываем
      const arenaFrame = document.getElementById('arena-iframe-frame');
      if (arenaFrame && arenaFrame.contentWindow && arenaFrame.contentWindow.myActiveRequest) {
        console.warn('🚫 [ARENA] Игрок в заявке — не закрываем iframe');
        return;
      }

      const wrapper = document.getElementById('arena-iframe-wrapper');
      const frame = document.getElementById('arena-iframe-frame');
      if (wrapper) wrapper.style.display = 'none';
      if (frame) frame.src = 'about:blank';
      if (typeof window.render === 'function') window.render();
    }

    if (event.data.type === 'CLOSE_SHOP_OVERLAY') {
      const wrapper = document.getElementById('shop-iframe-wrapper');
      const frame = document.getElementById('shop-iframe-frame');
      if (wrapper) wrapper.style.display = 'none';
      if (frame) frame.src = 'about:blank';
      if (typeof window.render === 'function') window.render();
    }

    if (event.data.type === 'CLOSE_TOWER_OVERLAY') {
      const wrapper = document.getElementById('tower-iframe-wrapper');
      const frame = document.getElementById('tower-iframe-frame');
      if (wrapper) wrapper.style.display = 'none';
      if (frame) frame.src = 'about:blank';
      if (typeof window.render === 'function') window.render();
    }

    if (event.data.type === 'CLOSE_WORLD_OVERLAY') {
      console.log("ℹ️ [ГОРОД] CLOSE_WORLD_OVERLAY получен (карта — отдельная страница)");
    }
  });

  // Загрузка профиля
  if (typeof window.loadGame === 'function') {
    window.loadGame((error) => {
      if (error) return console.error("❌ Критическая ошибка загрузки:", error);
      if (!window.player) window.player = createPlayer();
      if (typeof render === 'function') render();
      console.log(`✅ ИГРА ГОТОВА. Персонаж: ${window.player.name}`);
    });
  }
}

// --- БУДИЛЬНИК СЕРВЕРА ---
function wakeUpServer() {
  const SERVER_URL = "https://darkworld-server.onrender.com";
  setTimeout(() => {
    fetch(SERVER_URL, { mode: 'no-cors' })
      .then(() => console.log("⏰ Будильник: Сигнал отправлен!"))
      .catch(() => console.warn("Сервер просыпается..."));
  }, 300);
}

// --- ТОЧКА ВХОДА ---
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    startGame();
    wakeUpServer();
  }, 50);
});

// Экспорт для других модулей
window.render = render;
window.renderTown = renderTown;
window.createPlayer = createPlayer;