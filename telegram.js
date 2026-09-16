// ===== Интеграция Telegram WebApp и Внешней Базы Данных (Supabase) =====
const TG = window.Telegram?.WebApp;

// 🔑 НАСТРОЙКА ПОДКЛЮЧЕНИЯ К ВАШЕЙ БАЗЕ ДАННЫХ
const SUPABASE_URL = "https://ylslpgujwgxtsabkzgbd.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsc2xwZ3Vqd2d4dHNhYmt6Z2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMDM3ODksImV4cCI6MjEwNDg3OTc4OX0.GKocc3hnVQVSYaOnm1QhHca54sBn8AsiN8mHo6J0ENY"; 

// Уникальное имя переменной, чтобы исключить конфликты с глобальной библиотекой window.supabase
let sb = null;

/**
 * Инициализация WebApp и подключение к Supabase
 */
function initTelegram() {
  if (TG) {
    TG.ready();
    TG.expand();
  } else {
    console.warn('Telegram WebApp недоступен — включен режим локального бэкапа (в браузере)');
  }

  // Запрашиваем оригинальный window.supabase из подключенной библиотеки в index.html
  if (window.supabase) {
    try {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      console.log('🔌 Подключение к внешней базе данных Supabase успешно инициализировано!');
    } catch (e) {
      console.error('Ошибка初始化 clients базы данных:', e);
    }
  } else {
    console.error('Ошибка: Библиотека Supabase-js не обнаружена в index.html!');
  }
}

// Запускаем инициализацию сразу
initTelegram();

/**
 * Проверка версии API Telegram WebApp
 */
function isVersionAtLeast(requiredVersion) {
  if (!TG || !TG.version) return false;
  const current = TG.version.split('.').map(Number);
  const req = requiredVersion.split('.').map(Number);
  for (let i = 0; i < Math.max(current.length, req.length); i++) {
    const c = current[i] || 0;
    const r = req[i] || 0;
    if (c > r) return true;
    if (c < r) return false;
  }
  return true;
}

// ============================================================================
// ===== ☁️ ИСПРАВЛЕННЫЙ МОДУЛЬ СУПАБЕЙС: ПОЛНАЯ ЗАГРУЗКА ИГРЫ (БЕЗ ТЕСТОВ) =====
// ============================================================================

/**
 * Глобальная функция загрузки прогресса персонажа.
 * Берет данные СТРОГО из реальной таблицы Supabase по настоящему Telegram ID.
 */
window.loadGame = function(callback) {
  // Получаем данные текущего пользователя из WebApp Telegram
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  
  // 🔥 ЗАЩИТА: Если запустили в обычном браузере на ПК без Телеграма
  if (!tgUser) {
    console.warn("⚠️ Игра запущена вне Telegram. Доступ к Supabase заблокирован.");
    alert("Пожалуйста, запустите игру через Telegram-бота, чтобы загрузить своего персонажа!");
    return callback(new Error("Запущено вне Telegram"));
  }

  // Берем настоящий ID пользователя Telegram (для твоей записи это будет 111222)
  const userId = tgUser.id;
  console.log(`☁️ Запрос профиля из Supabase для реального Telegram ID: ${userId}`);

  // Делаем честный запрос в таблицу players
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
          
          // Сохраняем свежую запись в облако
          window.saveGame(() => {
            return callback(null);
          });
        } else {
          console.error("❌ Ошибка: Функция createPlayer не найдена в main.js!");
          return callback(new Error("createPlayer missing"));
        }
      } 
      // Если произошла сетевая ошибка чтения базы данных
      else if (error) {
        console.error("❌ Ошибка Supabase при загрузке прогресса:", error.message);
        return callback(error);
      } 
      // ✅ УСПЕХ: Если профиль найден — загружаем его в память игры
      else {
        console.log(`✅ Прогресс успешно скачан из Supabase для игрока: ${data.name}`);
        window.player = data; // Намертво присваиваем данные из твоей админки Supabase!
        return callback(null);
      }
    })
    .catch(err => {
      console.error("❌ Непредвиденный сбой цепочки Promise в loadGame:", err);
      return callback(err);
    });
};
/**
 * ☁️ СОХРАНЕНИЕ: Отправка прогресса игрока во внешнюю БД Supabase
 */
window.saveGame = function(data) {
  const player = data.player;
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;

  if (!player) return;

  localStorage.setItem('rpg_save', JSON.stringify(data));
  if (!sb) return;

  const userId = tgUser?.id || 111222;

 sb
    .from('players')
    .upsert({
      id: userId,
      name: player.name,
      avatar: player.avatar,
      level: player.level,
      gold: player.gold,
      current_town_index: player.currentTownIndex,
      hp: player.hp,
      xp: player.xp,
      
      // 🔥 Передаем строго одно красивое поле, которое теперь прописано в SQL кавычками
      statPoints: player.statPoints,
      
      stats: player.stats,
      inventory: player.inventory,
      equipped: player.equipped 
    })
    .then(({ error }) => {
      if (error) {
        console.error("❌ Ошибка отправки данных на внешний сервер:", error.message);
      } else {
        console.log("☁️ Прогресс игрока успешно синхронизирован с Supabase!");
      }
    });
}
/**
 * 🔥 ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ ГЕНЕРАЦИИ РАЗНЫХ СТАТОВ ПРИ ТЕСТИРОВАНИИ
 */
function createCustomTestPlayer(customId, customName, str, agi, end) {
  const testPlayer = {
    id: customId,
    name: customName,
    avatar: "👤",
    level: 2, 
    xp: 10, 
    gold: 150, 
    currentTownIndex: 0, 
    statPoints: 0,
    stats: { 
      strength: str,     // Задаем переданную Силу
      agility: agi,       // Задаем Ловкость
      endurance: end,     // Задаем Выносливость
      intellect: 10, 
      luck: 10 
    },
    inventory: { equipment: [], resources: [], consumables: [] },
    equipped: {
      head: null, body: null, legs: null, neck: null, gloves: null,
      mainHand: 'rusty_sword', offHand: null, potion: 'hp_potion_small', scroll: null,
      rings: [null, null, null] 
    }
  };

  // Высчитываем максимальное ХП на основе переданной выносливости
  const maxHpCalculated = end * 10;
  testPlayer.hp = maxHpCalculated;
  
  // Принудительно создаем функцию getMaxHp в window, если ее еще нет
  if (!window.getMaxHp) {
    window.getMaxHp = function(p) { return p.stats.endurance * 10; };
  }

  return testPlayer;
}

