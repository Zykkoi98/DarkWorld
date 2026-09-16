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
  
  // 🔥 ЭТАП ОТЛАДКИ: Выводим на экран, что именно видит игра
  console.log("Проверка окружения:", TG);
  if (TG) {
    // Если объект есть, но initData пустой — выведем предупреждение прямо в интерфейс
    if (!TG.initDataUnsafe || !TG.initDataUnsafe.user) {
      document.body.insertAdjacentHTML('afterbegin', 
        `<div style="background:red; color:white; padding:10px; position:fixed; top:0; z-index:999999; width:100%; font-size:12px;">
           Telegram найден, но данные пользователя пустые! initData: "${TG.initData}"
         </div>`
      );
    }
  }

  const tgUser = TG?.initDataUnsafe?.user;
  
  // 2. Если мы внутри реального Telegram Mini App
  if (TG && tgUser) {
    const userId = tgUser.id;
    console.log(`☁️ Успешный вход через Telegram! Имя: ${tgUser.first_name}, ID: ${userId}`);

    if (!window.sb) {
      console.error("❌ База данных Supabase не инициализирована!");
      return callback(new Error("Supabase missing"));
    }

    window.sb.from('players')
      .select('*')
      .eq('id', Number(userId))
      .single()
      .then(({ data, error }) => {
        if (error && error.code === 'PGRST116') {
          console.log("🆕 Новый игрок в Telegram. Создаем профиль в Supabase...");
          if (typeof window.createPlayer === 'function') {
            window.player = window.createPlayer(); 
            window.player.id = userId;
            window.player.name = tgUser.first_name || "Игрок";
            window.saveGame(() => { callback(null); });
          } else {
            return callback(new Error("createPlayer missing"));
          }
        } 
        else if (error) {
          console.error("❌ Ошибка Supabase:", error.message);
          return callback(error);
        } 
        else {
          console.log(`✅ Прогресс успешно скачан для: ${data.name}`);
          window.player = data; 
          return callback(null);
        }
      })
      .catch(err => callback(err));
      
  } else {
    // 3. Запасной сценарий (если открыли просто в браузере или через обычную ссылку)
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