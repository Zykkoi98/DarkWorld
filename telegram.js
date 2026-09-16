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
            
            // 🔥 Защита при чтении: восстанавливаем camelCase в ОЗУ из любого формата в БД
            if (cloudPlayer.current_town_index !== undefined) cloudPlayer.currentTownIndex = cloudPlayer.current_town_index;
            if (cloudPlayer.currentTownIndex !== undefined) cloudPlayer.currentTownIndex = cloudPlayer.currentTownIndex;
            
            if (cloudPlayer.stat_points !== undefined) cloudPlayer.statPoints = cloudPlayer.stat_points;
            if (cloudPlayer.statPoints !== undefined) cloudPlayer.statPoints = cloudPlayer.statPoints;
            
            if ((cloudPlayer.level || 1) >= (window.player.level || 1)) {
              window.player = cloudPlayer;
              if (typeof window.render === 'function') window.render();
            }
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

  localStorage.setItem('rpg_save', JSON.stringify({ player }));
  
  initSupabaseLazy();
  if (!window.sb) {
    if (typeof customData === 'function') customData();
    if (typeof callback === 'function') callback();
    return;
  }

  // 🔥 ГИБРИДНЫЙ ПАКЕТ ДАННЫХ:
  // Собираем объект, содержащий ОБА варианта написания спорных колонок.
  // Это гарантирует работу при любом состоянии кэша схемы Supabase!
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
    
    // Вариант 1: camelCase (для новой структуры)
    currentTownIndex: Number(player.currentTownIndex !== undefined ? player.currentTownIndex : 0),
    statPoints: Number(player.statPoints !== undefined ? player.statPoints : 0),
    
    // Вариант 2: snake_case (для старой структуры, если кэш застрял)
    current_town_index: Number(player.currentTownIndex !== undefined ? player.currentTownIndex : 0),
    stat_points: Number(player.statPoints !== undefined ? player.statPoints : 0)
  };

  window.sb.from('players')
    .upsert(payload)
    .then(({ error }) => {
      if (error) {
        console.error("❌ Ошибка Supabase:", error.message);
        // Если ошибка произошла из-за конкретной колонки, мы просто удалим её из пакета прямо на лету
        if (error.code === 'PGRST204') {
          const match = error.message.match(/'([^']+)' column/);
          if (match && match[1]) {
            const badCol = match[1];
            console.warn(`🧹 Кэш базы просит удалить поле: ${badCol}`);
            delete payload[badCol];
            // Повторяем чистую отправку без сбойного поля
            window.sb.from('players').upsert(payload);
            return;
          }
        }
        alert(`Ошибка базы данных: ${error.message}\nКод: ${error.code}`);
      } else {
        console.log("☁️ Прогресс успешно синхронизирован с Supabase!");
      }
      if (typeof customData === 'function') customData();
      if (typeof callback === 'function') callback();
    })
    .catch(e => {
      if (typeof customData === 'function') customData();
      if (typeof callback === 'function') callback();
    });
};