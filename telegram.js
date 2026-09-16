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

/**
 * ☁️ ГЛОБАЛЬНАЯ ФУНКЦИЯ ЗАГРУЗКИ ПРОГРЕССА ПЕРСОНАЖА
 */
window.loadGame = function(callback) {
  const TG = window.Telegram?.WebApp;
  const tgUser = TG?.initDataUnsafe?.user;
  
  // 🔥 ЖЕЛЕЗНАЯ ЗАЩИТА ОТ БЕСКОНЕЧНЫХ ЦИКЛОВ:
  // Сразу создаем базовый слепок игрока в ОЗУ, чтобы циклы проверки уровня в main.js не зависали на 20 секунд
  if (typeof window.createPlayer === 'function') {
    window.player = window.createPlayer();
  } else {
    // Аварийный профиль-заглушка на случай, если main.js еще парсится браузером
    window.player = { 
      id: 0, name: "Игрок", level: 1, xp: 0, gold: 50, hp: 100,
      stats: { strength: 10, agility: 10, endurance: 10, intellect: 10, luck: 10 }, 
      inventory: { equipment: [], consumables: [], resources: [] }, 
      equipped: { head: null, body: null, legs: null, neck: null, gloves: null, mainHand: null, offHand: null, potion: null, scroll: null, rings: [null, null, null] } 
    };
  }

  // 1. 📱 СЦЕНАРИЙ: ЗАПУСК ВНУТРИ РЕАЛЬНОГО TELEGRAM MINI APP
  if (TG && tgUser) {
    const userId = tgUser.id;
    window.player.id = userId;
    window.player.name = tgUser.first_name || "Рыцарь";
    console.log(`⚡ Мгновенный вход через Telegram Mini App. ID: ${userId}, Имя: ${window.player.name}`);

    // Проверяем локальный быстрый кэш в памяти самого телефона (с прошлого захода)
    const localSave = localStorage.getItem('rpg_save');
    if (localSave) {
      try {
        const savedData = JSON.parse(localSave);
        if (savedData.player && savedData.player.id === userId) {
          window.player = savedData.player;
          console.log("收藏 Загружен кэш персонажа из локальной памяти смартфона.");
        }
      } catch(e) { console.error("Ошибка парсинга кэша:", e); }
    }

    // 🚀 МГНОВЕННЫЙ СТАРТ: Разрешаем игре мгновенно открыться, не дожидаясь ответов от серверов
    callback(null);

    // Уходим в фоновый ленивый запрос к Supabase через 500мс, вообще не тормозя загрузку экрана
    setTimeout(() => {
      initSupabaseLazy();
      if (!window.sb) return;
      
      console.log("☁️ Фоновый запрос профиля из Supabase...");
      window.sb.from('players').select('*').eq('id', Number(userId))
        .then(({ data, error }) => {
          if (error) {
            console.warn("⚠️ Облачная база временно недоступна в фоне:", error.message);
            return;
          }

          if (data && data.length > 0) {
            console.log("☁️ Данные с облака Supabase успешно синхронизированы в фоне!");
            const cloudPlayer = Array.isArray(data) ? data[0] : data;
            
            // Если на сервере уровень или опыт выше, обновляем локального персонажа
            if ((cloudPlayer.level || 1) >= (window.player.level || 1)) {
              window.player = cloudPlayer;
              if (typeof window.render === 'function') window.render(); // Перерисовываем город
            }
          } else {
            console.log("☁️ Профиль игрока отсутствует в облаке. Создаем запись...");
            window.saveGame();
          }
        })
        .catch(err => console.warn("⚠️ Фоновый сетевой запрос сброшен по таймауту:", err));
    }, 500);

  } else {
    // 2. 💻 СЦЕНАРИЙ: ЗАПУСК ПРОСТО В БРАУЗЕРЕ НА ПК (РЕЖИМ ТЕСТА)
    console.warn("⚠️ Контекст Telegram не найден. Активирован локальный режим разработки.");
    
    const localSave = localStorage.getItem('rpg_save');
    if (localSave) {
      try { 
        window.player = JSON.parse(localSave).player; 
        console.log("💾 Загружен локальный персонаж ПК из localStorage.");
      } catch(e) {}
    } else {
      window.player.id = 777777;
      window.player.name = "Браузерный_Тестер";
      console.log("🆕 Создан чистый профиль Браузерного_Тестера.");
    }
    
    // Мгновенно запускаем игру в браузере
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