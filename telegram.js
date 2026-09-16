// ============================================================================
// ===== ☁️ ИСПРАВЛЕННЫЙ МОДУЛЬ INTEGRATION TELEGRAM & SUPABASE (ФИКС) =====
// ============================================================================
const TG = window.Telegram?.WebApp;

// Ключи авторизации облачной базы Supabase
const SUPABASE_URL = "https://ylslpgujwgxtsabkzgbd.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsc2xwZ3Vqd2d4dHNhYmt6Z2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMDM3ODksImV4cCI6MjEwNDg3OTc4OX0.GKocc3hnVQVSYaOnm1QhHca54sBn8AsiN8mHo6J0ENY"; 

// Глобальная переменная базы данных
window.sb = null;

/**
 * 🔌 БЕЗОПАСНОЕ ЛЕНИВОЕ ПОДКЛЮЧЕНИЕ К СУПАБЕЙС
 * Срабатывает только после того, как игра успешно отрисовала интерфейс
 */
function initSupabaseLazy() {
  if (window.sb) return; // Если уже подключены, ничего не делаем
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    try {
      window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      console.log("🔌 Ленивое подключение к Supabase успешно создано!");
    } catch(e) {
      console.warn("⚠️ Не удалось инициализировать клиент Supabase в фоне:", e);
    }
  }
}

window.loadGame = function(callback) {
  const TG = window.Telegram?.WebApp;
  
  // 🔥 ЖЕСТКИЙ ТЕСТ: Выводим сырые данные на экран до любых проверок
  setTimeout(() => {
    // Пробуем найти элемент или создаем свой плавающий блок поверх всей игры
    let debugBox = document.getElementById('tg-debug-bar');
    if (!debugBox) {
      debugBox = document.createElement('div');
      debugBox.id = 'tg-debug-bar';
      debugBox.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; 
        background: #000000e6; color: #00ff00; font-family: monospace; 
        font-size: 11px; padding: 10px; z-index: 999999; 
        border-bottom: 2px solid #6c5ce7; word-break: break-all;
      `;
      document.body.appendChild(debugBox);
    }

    const hasSDK = window.Telegram ? "✅ ДОСТУПЕН" : "❌ ОТСУТСТВУЕТ";
    const rawInitData = TG?.initData || "ПУСТО";
    const userObject = TG?.initDataUnsafe?.user ? JSON.stringify(TG.initDataUnsafe.user) : "НЕТ ОБЪЕКТА USER";

    debugBox.innerHTML = `
      <strong>[TG SDK]:</strong> ${hasSDK}<br>
      <strong>[initDataUnsafe.user]:</strong> ${userObject}<br>
      <strong>[Сырой initData]:</strong> ${rawInitData.substring(0, 100)}${rawInitData.length > 100 ? '...' : ''}
    `;
  }, 300);

  // Стандартная быстрая инициализация игрока для работы main.js
  if (typeof window.createPlayer === 'function') {
    window.player = window.createPlayer();
  } else {
    window.player = { id: 0, name: "Игрок", level: 1, xp: 0, gold: 50, stats: { strength: 10, endurance: 10 }, inventory: { equipment: [], consumables: [], resources: [] }, equipped: { rings: [null, null, null] } };
  }

  const tgUser = TG?.initDataUnsafe?.user;

  // Логика распределения (В ТГ или на ПК)
  if (TG && tgUser) {
    window.player.id = tgUser.id;
    window.player.name = tgUser.first_name || "Рыцарь";
    callback(null);
  } else {
    const localSave = localStorage.getItem('rpg_save');
    if (localSave) {
      try { window.player = JSON.parse(localSave).player; } catch(e) {}
    } else {
      window.player.id = 777777;
      window.player.name = "Браузерный_Тестер";
    }
    return callback(null);
  }
};

/**
 * 💾 УНИВЕРСАЛЬНАЯ ФУНКЦИЯ СОХРАНЕНИЯ ПРОГРЕССА
 */
window.saveGame = function(customData, callback) {
  const player = (customData && customData.player) ? customData.player : window.player;
  if (!player) return;

  // 1. Мгновенно сохраняем в память устройства (локальный бэкап)
  localStorage.setItem('rpg_save', JSON.stringify({ player }));
  
  // 2. Лениво подключаемся к базе данных и отправляем данные на сервер в фоне
  initSupabaseLazy();
  if (!window.sb) {
    if (typeof customData === 'function') customData();
    if (typeof callback === 'function') callback();
    return;
  }

  window.sb.from('players').upsert({
    id: Number(player.id),
    name: player.name,
    avatar: player.avatar || "assets/avatars/hero1.png",
    level: Number(player.level || 1),
    gold: Number(player.gold || 0),
    current_town_index: Number(player.currentTownIndex || 0),
    hp: Number(player.hp || 0),
    xp: Number(player.xp || 0),
    statPoints: Number(player.statPoints || 0),
    stats: player.stats,
    inventory: player.inventory,
    equipped: player.equipped 
  }).then(({ error }) => {
    if (error) {
      console.warn("⚠️ Ошибка фонового сохранения в Supabase:", error.message);
    } else {
      console.log("☁️ Прогресс игрока успешно синхронизирован с Supabase в фоне!");
    }
    if (typeof customData === 'function') customData();
    if (typeof callback === 'function') callback();
  }).catch(e => {
    console.warn("⚠️ Сетевой сбой при сохранении в облако:", e);
    if (typeof customData === 'function') customData();
    if (typeof callback === 'function') callback();
  });
};