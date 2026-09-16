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
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  
  // ЗАЩИТА: Если запустили в обычном браузере на ПК без Телеграма
  if (!tgUser) {
    console.warn("⚠️ Игра запущена вне Telegram. Доступ к Supabase заблокирован.");
    alert("Пожалуйста, запустите игру через Telegram-бота, чтобы загрузить своего персонажа!");
    return callback(new Error("Запущено вне Telegram"));
  }

  const userId = tgUser.id;
  console.log(`☁️ Запрос профиля из Supabase для реального Telegram ID: ${userId}`);

  if (!window.sb) {
    console.error("❌ База данных Supabase не инициализирована!");
    return callback(new Error("Supabase missing"));
  }

  window.sb.from('players')
    .select('*')
    .eq('id', Number(userId))
    .single()
    .then(({ data, error }) => {
      // Если профиль в базе данных еще не создан (новый игрок)
      if (error && error.code === 'PGRST116') {
        console.log("🆕 Игрок зашел впервые. Генерируем стартовый профиль новичка...");
        
        if (typeof window.createPlayer === 'function') {
          window.player = window.createPlayer(); 
          window.player.id = userId; // Записываем в профиль НАСТОЯЩИЙ ID из Телеграма
          
          window.saveGame(() => {
            return callback(null);
          });
        } else {
          console.error("❌ Ошибка: Функция createPlayer не найдена в main.js!");
          return callback(new Error("createPlayer missing"));
        }
      } 
      else if (error) {
        console.error("❌ Ошибка Supabase при загрузке прогресса:", error.message);
        return callback(error);
      } 
      else {
        console.log(`✅ Прогресс успешно скачан из Supabase для игрока: ${data.name}`);
        window.player = data; 
        return callback(null);
      }
    })
    .catch(err => {
      console.error("❌ Непредвиденный сбой цепочки Promise в loadGame:", err);
      return callback(err);
    });
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