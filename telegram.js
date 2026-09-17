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
  
  // Создаем базовый пустой шаблон персонажа, если конструктор не подтянулся
  if (typeof window.createPlayer === 'function') {
    window.player = window.createPlayer();
  } else {
    window.player = { 
      id: 0, name: "Игрок", level: 1, xp: 0, gold: 50, hp: 10, statPoints: 5, currentTownIndex: 0, 
      stats: { strength: 1, agility: 1, endurance: 1, intellect: 1, luck: 1 }, 
      inventory: { equipment: [], consumables: [], resources: [] }, 
      equipped: { rings: [null, null, null] } 
    };
  }

  const hideLoader = () => {
    const loader = document.getElementById('game-loader-screen');
    if (loader) {
      loader.style.transition = "opacity 0.2s ease";
      loader.style.opacity = "0";
      setTimeout(() => loader.remove(), 200);
    }
  };

  // ЕСЛИ СТАРТУЕМ ВНУТРИ ТЕЛЕГРАМА (ЖИВОЙ ИГРОК)
  if (TG && tgUser) {
    const userId = tgUser.id;
    window.player.id = Number(userId);
    window.player.name = tgUser.first_name || "Рыцарь";

    // Пытаемся быстро прочитать кэш телефона для мгновенного старта интерфейса
    const localSave = localStorage.getItem('rpg_save');
    if (localSave) {
      try {
        const savedData = JSON.parse(localSave);
        if (savedData.player && Number(savedData.player.id) === Number(userId)) {
          window.player = savedData.player;
        }
      } catch(e) {}
    }

    // Подключаем базу данных Supabase
    initSupabaseLazy();
    if (!window.sb) {
      hideLoader();
      return callback(null);
    }
    
    // Стучимся в облако за актуальным сохранением
    window.sb.from('players').select('*').eq('id', Number(userId))
      .then(({ data, error }) => {
        if (error) {
          hideLoader();
          return callback(null);
        }
        
        if (data && data.length > 0) {
          const cloudPlayer = data[0]; 
          
          window.player.level = Number(cloudPlayer.level || 1);
          window.player.gold = Number(cloudPlayer.gold || 0);
          window.player.xp = Number(cloudPlayer.xp || 0);
          window.player.hp = Number(cloudPlayer.hp || 10);
          
          // 🔥 ИСПРАВЛЕНИЕ: Парсим статы напрямую из независимых колонок БД
          window.player.stats = {
            strength: Number(cloudPlayer.strength !== undefined ? cloudPlayer.strength : 1),
            agility: Number(cloudPlayer.agility !== undefined ? cloudPlayer.agility : 1),
            endurance: Number(cloudPlayer.endurance !== undefined ? cloudPlayer.endurance : 1),
            intellect: Number(cloudPlayer.intellect !== undefined ? cloudPlayer.intellect : 1),
            luck: Number(cloudPlayer.luck !== undefined ? cloudPlayer.luck : 1)
          };
          
          window.player.inventory = cloudPlayer.inventory || window.player.inventory;
          window.player.equipped = cloudPlayer.equipped || window.player.equipped;
          
          // Восстанавливаем регистр полей бэкенда
          window.player.currentTownIndex = Number(cloudPlayer.currenttownindex !== undefined ? cloudPlayer.currenttownindex : 0);
          window.player.statPoints = Number(cloudPlayer.statpoints !== undefined ? cloudPlayer.statpoints : 0);
          
          // 🔥 Запуск аудита уровней и очков строго ПОСЛЕ полной сборки профиля
          if (typeof window.checkLevelUp === 'function') {
            console.log("🎯 Вызываю аудит checkLevelUp из loadGame...");
            window.checkLevelUp(true); // true означает initial load (первый запуск)
          }
          
        } else {
          // Если игрока в базе еще нет — создаем для него первую строчку
          window.saveGame();
        }
        
        hideLoader();
        callback(null);
        if (typeof window.render === 'function') window.render();
      })
      .catch(err => {
  
        hideLoader();
        callback(null);
      });

  } else {
    // РЕЖИМ ДЛЯ ПК БРАУЗЕРА (ЛОКАЛЬНЫЙ ТЕСТЕР ВНЕ ТЕЛЕГРАМА)
    const localSave = localStorage.getItem('rpg_save');
    if (localSave) {
      try { window.player = JSON.parse(localSave).player; } catch(e) {}
    } else {
      window.player.id = 777777;
      window.player.name = "Браузерный_Тестер";
    }
    if (typeof window.checkLevelUp === 'function') window.checkLevelUp(true);
    hideLoader();
    return callback(null);
  }
};
window.saveGame = function(customData, callback) {
  // Определяем, какой объект игрока сохранять (переданный или глобальный)
  const player = (customData && customData.player) ? customData.player : window.player;
  if (!player) return;

  // 1. Мгновенно обновляем локальный кэш устройства для быстрой работы интерфейса
  localStorage.setItem('rpg_save', JSON.stringify({ player: player }));
  
  // Проверяем, подключена ли база данных Supabase
  initSupabaseLazy();
  if (!window.sb) {
    if (typeof customData === 'function') customData();
    if (typeof callback === 'function') callback();
    return;
  }

  // 2. 🔥 СУПЕР-БЫСТРЫЙ ПАКЕТ ДЛЯ ОТПРАВКИ: РАЗБИВАЕМ ОБЪЕКТ НА ЧИСЛОВЫЕ КОЛОНКИ
  const payload = {
    id: Number(player.id),
    name: player.name,
    avatar: player.avatar || "assets/avatars/hero1.png",
    level: Number(player.level || 1),
    gold: Number(player.gold || 0),
    hp: Number(player.hp || 10),
    xp: Number(player.xp || 0),
    
    // Пишем характеристики персонажа напрямую в плоские ячейки таблицы PostgreSQL
    strength: Number(player.stats?.strength !== undefined ? player.stats.strength : 1),
    agility: Number(player.stats?.agility !== undefined ? player.stats.agility : 1),
    endurance: Number(player.stats?.endurance !== undefined ? player.stats.endurance : 1),
    intellect: Number(player.stats?.intellect !== undefined ? player.stats.intellect : 1),
    luck: Number(player.stats?.luck !== undefined ? player.stats.luck : 1),

    // jsonb-колонки инвентаря и надетых вещей остаются изолированными и в безопасности
    inventory: player.inventory,
    equipped: player.equipped,
    
    // Системные переменные пишем строго в нижнем регистре, как требует структура БД
    currenttownindex: Number(player.currentTownIndex !== undefined ? player.currentTownIndex : 0),
    statpoints: Number(player.statPoints !== undefined ? player.statPoints : 0)
  };

  // 3. Отправляем атомарный запрос upsert в облако
  window.sb.from('players')
    .upsert(payload)
    .then(({ error }) => {
      if (error) {
        console.error("❌ Ошибка сохранения в Supabase:", error.message);
      } else {
        console.log("☁️ Производительный плоский сейв успешно синхронизирован с Supabase.");
      }
      // Безопасно вызываем колбэки, если они были переданы
      if (typeof customData === 'function') customData();
      if (typeof callback === 'function') callback();
    })
    .catch(e => {
      console.error("❌ Критический сбой сети при сохранении:", e);
      if (typeof customData === 'function') customData();
      if (typeof callback === 'function') callback();
    });
};