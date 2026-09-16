// ============================================================================
// ===== ☁️ ИСПРАВЛЕННЫЙ МОДУЛЬ INTEGRATION TELEGRAM & SUPABASE (ФИКС) =====
// ============================================================================
const TG = window.Telegram?.WebApp;

// Ключи авторизации облачной базы Supabase
const SUPABASE_URL = "https://ylslpgujwgxtsabkzgbd.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsc2xwZ3Vqd2d4dHNhYmt6Z2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMDM3ODksImV4cCI6MjEwNDg3OTc4OX0.GKocc3hnVQVSYaOnm1QhHca54sBn8AsiN8mHo6J0ENY"; 

// 🔥 ЖЕСТКИЙ ФИКС: Привязываем переменную базы строго к window, чтобы убрать ошибку Cannot read properties of null
window.sb = null;

/**
 * Инициализация WebApp и подключение к Supabase
 */
function initTelegram() {
  if (TG) {
    TG.ready();
    TG.expand();
  } else {
    console.warn('Telegram WebApp недоступен — режим локального бэкапа.');
  }

  if (window.supabase) {
    try {
      window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      console.log('🔌 Подключение к Supabase успешно инициализировано!');
    } catch (e) {
      console.error('Ошибка инициализации клиента базы данных:', e);
    }
  } else {
    console.error('Ошибка: Библиотека Supabase-js не обнаружена в index.html!');
  }
}

// Запускаем инициализацию немедленно
initTelegram();

/**
 * Глобальная функция загрузки прогресса персонажа.
 * Берет данные СТРОГО из реальной таблицы Supabase по настоящему Telegram ID.
 */
window.loadGame = function(callback) {
  // Читаем объект строго в момент вызова функции
  const TG = window.Telegram?.WebApp;
  
  if (TG) {
    TG.ready();
    TG.expand(); // Разворачиваем игру во весь экран
  }

  const tgUser = TG?.initDataUnsafe?.user;
  
  // 1. ЕСЛИ МЫ ВНУТРИ РЕАЛЬНОГО TELEGRAM MINI APP — СТАРТУЕМ МГНОВЕННО БЕЗ ОЖИДАНИЯ
  if (TG && tgUser) {
    const userId = tgUser.id;
    console.log(`⚡ Мгновенный вход через Telegram. ID: ${userId}, Имя: ${tgUser.first_name}`);

    // Шаг А: Сразу создаем локального персонажа в памяти устройства, чтобы убрать надпись "Загрузка..."
    if (typeof window.createPlayer === 'function') {
      window.player = window.createPlayer(); 
      window.player.id = userId; 
      window.player.name = tgUser.first_name || "Рыцарь";
    }

    // Проверяем, есть ли кэш с прошлого захода в памяти телефона
    const localSave = localStorage.getItem('rpg_save');
    if (localSave) {
      try {
        const savedData = JSON.parse(localSave);
        if (savedData.player && savedData.player.id === userId) {
          window.player = savedData.player; // Подгружаем локальный прогресс
          console.log("💾 Загружен кэш персонажа из памяти телефона.");
        }
      } catch(e) { console.error("Ошибка чтения локального кэша", e); }
    }

    // 🔥 САМЫЙ ВАЖНЫЙ МОМЕНТ: Мгновенно разрешаем игре запуститься!
    // Имя игрока сразу появится на экране, 20 секунд ждать больше не нужно.
    callback(null);

    // Шаг Б: Уходим в фоновый запрос к Supabase, не заставляя игрока ждать экран загрузки
    if (window.sb) {
      console.log("☁️ Фоновое подключение к Supabase...");
      window.sb.from('players')
        .select('*')
        .eq('id', Number(userId))
        .then(({ data, error }) => {
          if (error) {
            console.warn("⚠️ Supabase недоступен в фоне:", error.message);
            return;
          }

          if (data && data.length > 0) {
            console.log("☁️ Данные с облака успешно скачаны в фоне!");
            // Синхронизируем: берем данные из облака, только если там уровень или золото выше
            const cloudPlayer = data[0] || data;
            if ((cloudPlayer.level || 1) >= (window.player.level || 1)) {
              window.player = cloudPlayer;
              if (typeof window.render === 'function') window.render(); // Перерисовываем экран с новыми данными
            }
          } else {
            // Если в облаке пусто, сохраняем нашего текущего персонажа туда
            console.log("☁️ Создаем запись для нового игрока в облаке...");
            window.saveGame();
          }
        })
        .catch(err => console.warn("⚠️ Сетевой сбой фонового запроса к базе:", err));
    }
      
  } else {
    // 2. ЗАПАСНОЙ ЛОКАЛЬНЫЙ РЕЖИМ ДЛЯ ПК БРАУЗЕРА
    console.warn("⚠️ Запущено вне Telegram. Включен тестовый режим.");
    
    const localSave = localStorage.getItem('rpg_save');
    if (localSave) {
      window.player = JSON.parse(localSave).player;
    } else {
      window.player = window.createPlayer();
      window.player.id = 777777; 
      window.player.name = "Браузерный_Тестер";
    }
    return callback(null);
  }
};

/**
 * 🔥 УНИВЕРСАЛЬНОЕ СИНХРОННОЕ СОХРАНЕНИЕ ПРОГРЕССА С ЗАЩИТОЙ АРГУМЕНТОВ
 */
window.saveGame = function(customData, callback) {
  // Автоматически определяем, передан ли объект плеера внутри или берем глобальный window.player
  const player = (customData && customData.player) ? customData.player : window.player;
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;

  if (!player) return;

  // Локальный бэкап в ОЗУ браузера
  localStorage.setItem('rpg_save', JSON.stringify({ player }));
  if (!window.sb) return;

  const userId = tgUser?.id || player.id || 111222;

  window.sb.from('players')
    .upsert({
      id: Number(userId),
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
    })
    .then(({ error }) => {
      if (error) {
        console.error("❌ Ошибка отправки данных на внешний сервер:", error.message);
      } else {
        console.log("☁️ Прогресс игрока успешно синхронизирован с Supabase!");
        if (typeof customData === 'function') customData();
        if (typeof callback === 'function') callback();
      }
    });
};