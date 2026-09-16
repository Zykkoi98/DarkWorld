@off
echo 🚀 Начинаем автоматическое обновление игры на GitHub Pages...

:: Собираем все измененные файлы
git add .

:: Создаем отметку о сохранении с текущей датой и временем
git commit -m "Auto-update: %date% %time%"

:: Отправляем файлы в облако GitHub
git push origin main

echo ✅ Игра успешно обновлена! Через минуту изменения появятся в Telegram WebApp.
pause