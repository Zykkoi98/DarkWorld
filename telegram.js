// ============================================================================
// ===== ☁️ ИСПРАВЛЕННЫЙ МОДУЛЬ INTEGRATION TELEGRAM & SUPABASE (ФИКС) =====
// ============================================================================
const TG = window.Telegram?.WebApp;

// Ключи авторизации облачной базы Supabase
const SUPABASE_URL = "https://ylslpgujwgxtsabkzgbd.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsc2xwZ3Vqd2d4dHNhYmt6Z2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMDM3ODksImV4cCI6MjEwNDg3OTc4OX0.GKocc3hnVQVSYaOnm1QhHca54sBn8AsiN8mHo6J0ENY"; 

window.sb = null;

function initSupabaseLazy() {
  if (window.sb) return;
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    try {
      window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      console.log("🔌 Инициализация Supabase успешна.");
    } catch(e) {
      console.warn("⚠️ Сбой создания клиента базы:", e);
    }
  }
}

window.loadGame = function(callback) {
  const TG = window.Telegram?.WebApp;
  const tgUser = TG?.initDataUnsafe?.user;
  
  // Инициализируем базовый слепок игрока в ОЗУ, чтобы main.js не падал в бесконечный цикл
  if (typeof window.createPlayer === 'function') {
    window.player = window.createPlayer();
  } else {
    window.player = { 
      id: 0, name: "Игрок", level: 1, xp: 0, gold: 50, hp: 100, statPoints: 5, currentTownIndex: 0, 
      stats: { strength: 10, agility: 10, endurance: 10, intellect: 10, luck: 10 }, 
      inventory: { equipment: [], consumables: [], resources: [] }, 
      equipped: { head: null, body: null, legs: null, neck: null, gloves: null, mainHand: null, offHand: null, potion: null, scroll: null, rings: [null, null, null] } 
    };
  }

  // 1. 📱 СЦЕНАРИЙ: ЗАПУСК ВНУТРИ REAL TELEGRAM MINI APP
  if (TG && tgUser) {
    const userId = tgUser.id;
    window.player.id = userId;
    window.player.name = tgUser.first_name || "Рыцарь";

    // Шаг А: Сразу подтягиваем локальный кэш смартфона с прошлого захода
    const localSave = localStorage.getItem('rpg_save');
    if (localSave) {
      try {
        const savedData = JSON.parse(localSave);
        if (savedData.player && savedData.player.id === userId) {
          window.player = savedData.player;
          console.log("💾 Загружен локальный прогресс из кэша смартфона.");
        }
      } catch(e) { console.error("Ошибка чтения кэша:", e); }
    }

    // 🚀 МГНОВЕННЫЙ СТАРТ: Разрешаем игре мгновенно открыться
    callback(null);

    // Шаг Б: Фоновая синхронизация с облаком Supabase (ждём 1.5 секунды, пока процессор отрисует город)
    setTimeout(() => {
      const runBackgroundSync = () => {
        if (typeof initSupabaseLazy === 'function') initSupabaseLazy();
        if (!window.sb) return;
        
        console.log("☁️ Фоновый запрос профиля из Supabase...");
        window.sb.from('players').select('*').eq('id', Number(userId))
          .then(({ data, error }) => {
            if (error) {
              console.warn("⚠️ Фоновая проверка базы не удалась:", error.message);
              return;
            }
            
            if (data && data.length > 0) {
              const cloudPlayer = data[0] || data; // Берём первую запись из ответа
              console.log("☁️ Прогресс найден в облаке, синхронизируем...");
              
              // 🔥 ЖЕСТКИЙ ФИКС СИНХРОНИЗАЦИИ: 
              // Берем уровень, опыт и статы напрямую из базы данных, запрещая их ломать клиенту
              window.player.level = Number(cloudPlayer.level || 1);
              window.player.gold = Number(cloudPlayer.gold || 0);
              window.player.xp = Number(cloudPlayer.xp || 0);
              window.player.hp = Number(cloudPlayer.hp || 100);
              window.player.stats = cloudPlayer.stats || window.player.stats;
              window.player.inventory = cloudPlayer.inventory || window.player.inventory;
              window.player.equipped = cloudPlayer.equipped || window.player.equipped;

              // Восстанавливаем camelCase переменные очков статов и городов строго из БД
              window.player.currentTownIndex = Number(cloudPlayer.currenttownindex !== undefined ? cloudPlayer.currenttownindex : (cloudPlayer.currentTownIndex || 0));
              window.player.statPoints = Number(cloudPlayer.statpoints !== undefined ? cloudPlayer.statpoints : (cloudPlayer.statPoints || 0));
              
              if (typeof window.render === 'function') window.render();
            } else {
              // 🔥 ПРИНУДИТЕЛЬНЫЙ ТОЛЧЕК: Если в БД пусто, мгновенно создаем запись новичка при старте!
              console.log("🆕 Регистрация нового аккаунта в Supabase...");
              window.saveGame();
            }
          }).catch(err => console.warn("Фоновый таймаут:", err));
      };

      // Запускаем синхронизацию безопасно, чтобы игра не фризила при рендере
      if (window.requestIdleCallback) {
        window.requestIdleCallback(runBackgroundSync);
      } else {
        runBackgroundSync();
      }
    }, 1500);

  } else {
    // 2. 💻 СЦЕНАРИЙ: ЗАПУСК ПРОСТО В БРАУЗЕРЕ НА ПК
    console.warn("⚠️ Запущено вне Telegram. Локальный тестовый режим.");
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

window.saveGame = function(customData, callback) {
  const player = (customData && customData.player) ? customData.player : window.player;
  if (!player) return;

  localStorage.setItem('rpg_save', JSON.stringify({ player }));
  
  initSupabaseLazy();
  if (!window.sb) {
    if (typeof customData === 'function') customData();
    if (typeof callback === 'function') callback();
    return;
  }

  // 🎯 ЧИСТЫЙ PAYLOAD СТРОГО ПО НАЗВАНИЯМ КОЛОНОК ТВОЕЙ БД
  // Отправляем строго маленькими буквами, полностью исключив любые другие варианты
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
    
    // Передаем строго под имена колонок в PostgreSQL
    currenttownindex: Number(player.currentTownIndex !== undefined ? player.currentTownIndex : 0),
    statpoints: Number(player.statPoints !== undefined ? player.statPoints : 0)
  };

  window.sb.from('players')
    .upsert(payload)
    .then(({ error }) => {
      if (error) {
        console.error("❌ Ошибка Supabase:", error.message);
        alert(`Ошибка базы данных: ${error.message}\nКод: ${error.code}`);
      } else {
        console.log("☁️ Прогресс Яна успешно записан в Supabase!");
      }
      if (typeof customData === 'function') customData();
      if (typeof callback === 'function') callback();
    })
    .catch(e => {
      if (typeof customData === 'function') customData();
      if (typeof callback === 'function') callback();
    });
};