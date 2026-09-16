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
 * Инициализация ленивого подключения к Supabase
 */
function initSupabaseLazy() {
  if (window.sb) return;
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    try {
      window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      console.log("🔌 Подключение к Supabase успешно инициализировано в фоне.");
    } catch(e) {
      console.warn("⚠️ Не удалось инициализировать клиент базы данных:", e);
    }
  }
}

/**
 * ☁️ ЗАГРУЗКА ПРОГРЕССА ПЕРСОНАЖА
 */
window.loadGame = function(callback) {
  const TG = window.Telegram?.WebApp;
  const tgUser = TG?.initDataUnsafe?.user;
  
  // Создаем базовый слепок игрока, чтобы main.js не уходил в бесконечный цикл
  if (typeof window.createPlayer === 'function') {
    window.player = window.createPlayer();
  } else {
    window.player = { 
      id: 0, name: "Игрок", level: 1, xp: 0, gold: 50, hp: 100,
      stats: { strength: 10, agility: 10, endurance: 10, intellect: 10, luck: 10 }, 
      inventory: { equipment: [], consumables: [], resources: [] }, 
      equipped: { head: null, body: null, legs: null, neck: null, gloves: null, mainHand: null, offHand: null, potion: null, scroll: null, rings: [null, null, null] } 
    };
  }

  // 1. ЕСЛИ МЫ ВНУТРИ REAL TELEGRAM MINI APP
  if (TG && tgUser) {
    const userId = tgUser.id;
    window.player.id = userId;
    window.player.name = tgUser.first_name || "Рыцарь";

    // Подтягиваем локальный кэш смартфона с прошлого захода
    const localSave = localStorage.getItem('rpg_save');
    if (localSave) {
      try {
        const savedData = JSON.parse(localSave);
        if (savedData.player && savedData.player.id === userId) {
          window.player = savedData.player;
        }
      } catch(e) {}
    }

    // Мгновенно запускаем интерфейс игры
    callback(null);

    // Фоновая синхронизация с облаком
    setTimeout(() => {
      initSupabaseLazy();
      if (!window.sb) return;
      
      window.sb.from('players').select('*').eq('id', Number(userId))
        .then(({ data, error }) => {
          if (error) return;

          if (data && data.length > 0) {
            const cloudPlayer = data[0] || data;
            
            // Восстанавливаем camelCase переменные в ОЗУ для main.js из snake_case базы данных
            if (cloudPlayer.current_town_index !== undefined) cloudPlayer.currentTownIndex = cloudPlayer.current_town_index;
            if (cloudPlayer.stat_points !== undefined) cloudPlayer.statPoints = cloudPlayer.stat_points;
            
            if ((cloudPlayer.level || 1) >= (window.player.level || 1)) {
              window.player = cloudPlayer;
              if (typeof window.render === 'function') window.render();
            }
          } else {
            // Если в БД нет игрока — вызываем сохранение для автоматической регистрации новичка
            window.saveGame();
          }
        }).catch(err => console.warn("Фоновый таймаут:", err));
    }, 600);

  } else {
    // 2. ЕСЛИ ОТКРЫЛИ ПРОСТО В БРАУЗЕРЕ НА ПК
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
 * 💾 БЕЗОПАСНАЯ ФУНКЦИЯ СОХРАНЕНИЯ ПРОГРЕССА БЕЗ CAMELCASE КОЛОНОК
 */
window.saveGame = function(customData, callback) {
  const player = (customData && customData.player) ? customData.player : window.player;
  if (!player) return;

  // Локальный мгновенный бэкап на устройстве
  localStorage.setItem('rpg_save', JSON.stringify({ player }));
  
  initSupabaseLazy();
  if (!window.sb) {
    if (typeof customData === 'function') customData();
    if (typeof callback === 'function') callback();
    return;
  }

  // 🔥 ПОЛНЫЙ СБРОС CAMELCASE: Формируем пакет данных строго под структуру таблиц PostgreSQL
  const payload = {
    id: Number(player.id),
    name: player.name,
    avatar: player.avatar || "assets/avatars/hero1.png",
    level: Number(player.level || 1),
    gold: Number(player.gold || 0),
    hp: Number(player.hp || 100),
    xp: Number(player.xp || 0),
    stats: player.stats,
    inventory: player.inventory,
    equipped: player.equipped,
    
    // Записываем данные строго в snake_case колонки (без currentTownIndex и statPoints!)
    current_town_index: Number(player.currentTownIndex !== undefined ? player.currentTownIndex : (player.current_town_index || 0)),
    stat_points: Number(player.statPoints !== undefined ? player.statPoints : (player.stat_points || 0))
  };

  window.sb.from('players')
    .upsert(payload)
    .then(({ error }) => {
      if (error) {
        console.error("❌ Ошибка отправки данных в Supabase:", error.message);
        alert(`Ошибка базы данных: ${error.message}\nКод: ${error.code}`);
      } else {
        console.log("☁️ Прогресс персонажа успешно синхронизирован с Supabase!");
      }
      if (typeof customData === 'function') customData();
      if (typeof callback === 'function') callback();
    })
    .catch(e => {
      console.warn("⚠️ Ошибка отправки:", e);
      if (typeof customData === 'function') customData();
      if (typeof callback === 'function') callback();
    });
};