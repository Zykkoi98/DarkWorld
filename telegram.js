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
  const TG = window.Telegram?.WebApp;
  
  if (TG) {
    TG.ready();
    TG.expand();
  }

  const tgUser = TG?.initDataUnsafe?.user;
  
  // 1. ЕСЛИ МЫ ВНУТРИ РЕАЛЬНОГО TELEGRAM MINI APP
  if (TG && tgUser) {
    const userId = tgUser.id;
    console.log(`☁️ Запрос профиля из Supabase для Telegram ID: ${userId}`);

    if (!window.sb) {
      console.error("❌ База данных Supabase не инициализирована!");
      return callback(new Error("Supabase missing"));
    }

    // 🔥 ИСПРАВЛЕНИЕ: Вместо .single() используем обычный select, чтобы избежать краша скрипта
    window.sb.from('players')
      .select('*')
      .eq('id', Number(userId))
      .then(({ data, error }) => {
        if (error) {
          console.error("❌ Ошибка Supabase при загрузке:", error.message);
          return callback(error);
        }

        // Если массив данных пустой, значит игрока еще нет в базе данных
        if (!data || data.length === 0) {
          console.log("🆕 Игрок зашел впервые. Генерируем стартовый профиль...");
          
          if (typeof window.createPlayer === 'function') {
            window.player = window.createPlayer(); 
            window.player.id = userId; // Записываем реальный ID
            window.player.name = tgUser.first_name || "Герой"; // Записываем реальное имя из ТГ
            
            // Сохраняем в Supabase
            window.saveGame(() => {
              return callback(null);
            });
          } else {
            console.error("❌ Ошибка: Функция createPlayer не найдена в main.js!");
            return callback(new Error("createPlayer missing"));
          }
        } else {
          // Игрок найден, загружаем его сохраненный профиль
          console.log(`✅ Прогресс успешно скачан для: ${data[0].name}`);
          window.player = data[0]; 
          return callback(null);
        }
      })
      .catch(err => {
        console.error("❌ Непредвиденный сбой в loadGame:", err);
        return callback(err);
      });
      
  } else {
    // 2. ЗАПАСНОЙ ЛОКАЛЬНЫЙ РЕЖИМ (Если открыли просто в браузере на ПК)
    console.warn("⚠️ Telegram WebApp контекст не найден. Активирован локальный режим разработки.");
    
    const localSave = localStorage.getItem('rpg_save');
    if (localSave) {
      const savedData = JSON.parse(localSave);
      window.player = savedData.player;
      console.log("💾 Загружен локальный персонаж из памяти браузера.");
    } else {
      console.log("🆕 Создаем чистый профиль ПК-тестера.");
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