// ============================================================================
// ===== ⏱️ ТАЙМЕР ХОДА (BATTLE_TIMER.JS) =====
// ===== Визуальный таймер сверху экрана =====
// ============================================================================

window.BTimer = {
  intervalId: null,

  start(durationMs, round, totalDurationMs = null) {
    this.stop();

    const total = totalDurationMs || durationMs;
    const startPercent = (durationMs / total) * 100;

    const container = document.createElement('div');
    container.id = 'turn-timer-bar';
    container.style.cssText = `
      position: fixed; top: 0; left: 50%;
      transform: translateX(-50%);
      width: 100%; max-width: 480px;
      height: 6px; background: rgba(0, 0, 0, 0.4);
      z-index: 9999;
      border-radius: 0 0 6px 6px;
      overflow: hidden;
    `;

    const fill = document.createElement('div');
    fill.id = 'turn-timer-fill';
    fill.style.cssText = `
      height: 100%;
      width: ${startPercent}%;
      background: linear-gradient(90deg, #2ecc71, #26de81);
      transition: width ${durationMs}ms linear, background 0.3s;
    `;

    container.appendChild(fill);
    document.body.appendChild(container);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => { fill.style.width = '0%'; });
    });

    if (durationMs > 15000) {
      setTimeout(() => {
        if (fill.parentNode) fill.style.background = 'linear-gradient(90deg, #f1c40f, #e67e22)';
      }, durationMs - 15000);
    }

    if (durationMs > 5000) {
      setTimeout(() => {
        if (fill.parentNode) {
          fill.style.background = 'linear-gradient(90deg, #e74c3c, #c0392b)';
          if (window.Telegram?.WebApp?.HapticFeedback) {
            try { window.Telegram.WebApp.HapticFeedback.impactOccurred('heavy'); } catch(e) {}
          }
        }
      }, durationMs - 5000);
    }

    console.log(`⏱️ [ТАЙМЕР] ${Math.round(durationMs / 1000)}с (раунд ${round})`);
  },

  stop() {
    const el = document.getElementById('turn-timer-bar');
    if (el) el.remove();
    if (this.intervalId) clearInterval(this.intervalId);
  }
};
