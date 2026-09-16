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
  
  if (typeof window.createPlayer === 'function') {
    window.player = window.createPlayer();
  } else {
    window.player = { id: 0, name: "Игрок", level: 1, xp: 0, gold: 50, hp: 100, statPoints: 5, currentTownIndex: 0, stats: { strength: 10, agility: 10, endurance: 10, intellect: 10, luck: 10 }, inventory: { equipment: [], consumables: [], resources: [] }, equipped: { rings: [null, null, null] } };
  }

  if (TG && tgUser) {
    const userId = tgUser.id;
    window.player.id = userId;
    window.player.name = tgUser.first_name || "Рыцарь";

    const localSave = localStorage.getItem('rpg_save');
    if (localSave) {
      try {
        const savedData = JSON.parse(localSave);
        if (savedData.player && savedData.player.id === userId) {
          window.player = savedData.player;
        }
      } catch(e) {}
    }

    callback(null);

    setTimeout(() => {
      initSupabaseLazy();
      if (!window.sb) return;
      
      window.sb.from('players').select('*').eq('id', Number(userId))
        .then(({ data, error }) => {
          if (error) return;
          if (data && data.length > 0) {
            const cloudPlayer = data[0] || data;
            
            // Восстанавливаем camelCase переменные в ОЗУ для main.js из любого формата БД
            if (cloudPlayer.currentTownIndex !== undefined) window.player.currentTownIndex = cloudPlayer.currentTownIndex;
            if (cloudPlayer.current_town_index !== undefined) window.player.currentTownIndex = cloudPlayer.current_town_index;
            
            if (cloudPlayer.statPoints !== undefined) window.player.statPoints = cloudPlayer.statPoints;
            if (cloudPlayer.stat_points !== undefined) window.player.statPoints = cloudPlayer.stat_points;
            
            if ((cloudPlayer.level || 1) > (window.player.level || 1)) {
              window.player.level = cloudPlayer.level;
              window.player.gold = cloudPlayer.gold;
              window.player.xp = cloudPlayer.xp;
              window.player.hp = cloudPlayer.hp;
              window.player.stats = cloudPlayer.stats;
              window.player.inventory = cloudPlayer.inventory;
              window.player.equipped = cloudPlayer.equipped;
            }
            if (typeof window.render === 'function') window.render();
          } else {
            window.saveGame();
          }
        }).catch(err => console.warn("Фоновый таймаут:", err));
    }, 600);

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

window.saveGame = function(customData, callback) {
  const player = (customData && customData.player) ? customData.player : window.player;
  if (!player) return;

  // Локальный бэкап в телефон (благодаря этому статы не сбрасываются!)
  localStorage.setItem('rpg_save', JSON.stringify({ player }));
  
  if (typeof initSupabaseLazy === 'function') initSupabaseLazy();
  if (!window.sb) {
    if (typeof customData === 'function') customData();
    if (typeof callback === 'function') callback();
    return;
  }

  // Собираем чистый гибридный пакет для отправки
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
    
    // Передаем оба варианта колонок, чтобы база точно схавала
    currentTownIndex: Number(player.currentTownIndex !== undefined ? player.currentTownIndex : 0),
    statPoints: Number(player.statPoints !== undefined ? player.statPoints : 0),
    current_town_index: Number(player.currentTownIndex !== undefined ? player.currentTownIndex : 0),
    stat_points: Number(player.statPoints !== undefined ? player.statPoints : 0)
  };

  window.sb.from('players')
    .upsert(payload)
    .then(({ error }) => {
      if (error) {
        console.error("❌ Ошибка Supabase в фоне:", error.message);
        // 🔥 ВЫВОДИМ ОШИБКУ НА ЭКРАН: Мы наконец-то увидим, почему запись не создается!
        alert(`Фоновое сохранение не удалось!\nОшибка: ${error.message}\nКод: ${error.code}`);
      } else {
        console.log("☁️ Данные Яна успешно продублированы в облако Supabase!");
      }
      if (typeof customData === 'function') customData();
      if (typeof callback === 'function') callback();
    })
    .catch(e => {
      if (typeof customData === 'function') customData();
      if (typeof callback === 'function') callback();
    });
};