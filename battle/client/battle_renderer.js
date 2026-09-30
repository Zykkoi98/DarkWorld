// ============================================================================
// ===== 🎨 РЕНДЕР БОЯ (BATTLE_RENDERER.JS) =====
// ===== Карточки, HP-бары, массовка, логи =====
// ============================================================================

window.BRenderer = {
  DEFAULT_HERO_IMG: '../assets/avatars/hero5.jpg',
  DEFAULT_MONSTER_IMG: '../assets/monsters/monster1.jpg',

  // ==========================================================================
  // ГЛАВНЫЙ РЕНДЕР
  // ==========================================================================
  render() {
    this.renderMainCards();
    this.renderReserveLists();
    if (window.BUI) window.BUI.updateStrikeButtonState();
  },

  // ==========================================================================
  // БОЛЬШИЕ КАРТОЧКИ
  // ==========================================================================
  renderMainCards() {
    const me = BState.getMyFighter();

    // Для зрителя — берём первого из teamA
    const primaryA = me || BState.teamA[0] || null;
    const primaryB = BState.getTargetFighter() || BState.getOpposingTeam().find(f => f.currentHp > 0) || null;

    this._renderCard('hero', primaryA);
    this._renderCard('target', primaryB);
  },

  _renderCard(prefix, fighter) {
    const elLvl = document.getElementById(`${prefix}-lvl-text`);
    const elName = document.getElementById(`${prefix}-name-text`);
    const elHpFill = document.getElementById(`${prefix}-hp-fill`);
    const elHpText = document.getElementById(`${prefix}-hp-text`);
    const elImg = document.getElementById(`${prefix}-card-bg-img`);
    const card = document.getElementById(`main-${prefix === 'hero' ? 'hero' : 'target'}-card`);

    if (!fighter) {
      if (elName) elName.textContent = 'Нет цели';
      if (elLvl) elLvl.textContent = 'Lv. --';
      if (elHpFill) elHpFill.style.width = '0%';
      if (elHpText) elHpText.textContent = '0 / 0';
      if (card) card.classList.add('dead');
      return;
    }

    if (card) card.classList.remove('dead');

    if (elName) elName.textContent = fighter.name;
    if (elLvl) elLvl.textContent = `Lv. ${fighter.level || 1}`;

    const hp = Math.max(0, fighter.currentHp || 0);
    const maxHp = fighter.maxHp || 1;
    if (elHpFill) elHpFill.style.width = `${(hp / maxHp) * 100}%`;
    if (elHpText) elHpText.textContent = `${hp} / ${maxHp}`;

    if (elImg) {
      const avatar = fighter.avatar;
      elImg.src = (avatar && avatar.includes('.')) ? avatar
                 : (prefix === 'hero' ? this.DEFAULT_HERO_IMG : this.DEFAULT_MONSTER_IMG);
    }

    // Клик по имени → поповер (только если не spectator ИЛИ spectator, но не боец)
    if (elName) {
      elName.style.cursor = 'pointer';
      elName.onclick = () => {
        if (prefix === 'hero' && fighter.isBot !== true && !BState.isSpectator) {
          window.BStats.openPlayerStats();
        } else if (prefix === 'target') {
          BState.selectedTargetUuid = fighter.uuid;
          window.BStats.openEnemyStats(fighter.uuid);
        }
      };
    }
  },

  // ==========================================================================
  // МАССОВКА
  // ==========================================================================
  renderReserveLists() {
    const alliesEl = document.getElementById('allies-reserve-list');
    const enemiesEl = document.getElementById('enemies-reserve-list');
    if (!alliesEl || !enemiesEl) return;

    alliesEl.innerHTML = '';
    enemiesEl.innerHTML = '';

    // Для зрителя — без выделения фокуса
    const myTeam = BState.isSpectator ? BState.teamA : BState.getMyTeam();
    const oppTeam = BState.isSpectator ? BState.teamB : BState.getOpposingTeam();

    // ============ СОЮЗНИКИ ============
    myTeam.forEach(ally => {
      const card = document.createElement('div');
      card.className = `mini-fighter-card ${ally.currentHp <= 0 ? 'dead' : ''}`;
      card.innerHTML = `<div class="mini-fighter-info">${ally.name}</div>
                       <span style="font-size:9px; color:#2ecc71;">❤️ ${Math.max(0, ally.currentHp)}</span>`;

      // Клик по союзнику — открыть статы (кроме себя и зрителя)
      if (!BState.isSpectator && ally.uuid !== BState.myUuid) {
        card.style.cursor = 'pointer';
        card.onclick = () => window.BStats.openEnemyStats(ally.uuid);
      }

      alliesEl.appendChild(card);
    });

    // ============ ВРАГИ ============
    oppTeam.forEach(enemy => {
      const isDead = enemy.currentHp <= 0;
      const isFocused = !BState.isSpectator && BState.selectedTargetUuid === enemy.uuid;

      const card = document.createElement('div');
      card.className = `mini-fighter-card ${isDead ? 'dead' : ''} ${isFocused ? 'active-target' : ''}`;
      card.innerHTML = `<div class="mini-fighter-info">${enemy.name}</div>
                       <span style="font-size:9px; color:${isFocused ? '#e74c3c' : '#9aa0b5'};">HP: ${Math.max(0, enemy.currentHp)}</span>`;

      if (!isDead) {
        card.style.cursor = 'pointer';
        card.onclick = () => {
          if (BState.isSpectator) {
            // Зритель — только статы
            window.BStats.openEnemyStats(enemy.uuid);
          } else {
            // Участник — смена цели
            BState.selectedTargetUuid = enemy.uuid;
            window.BRenderer.render();
          }
        };
      }

      enemiesEl.appendChild(card);
    });
  },

  // ==========================================================================
  // ЛОГИ
  // ==========================================================================
  appendRoundLogs(roundNumber, logs) {
    const logBox = document.getElementById('battle-log-viewport');
    if (!logBox || !logs) return;

    const divBreak = document.createElement('div');
    divBreak.className = 'log-round-break';
    divBreak.innerHTML = `<span>--- Итоги раунда ${roundNumber} ---</span>`;
    logBox.appendChild(divBreak);

    logs.forEach(msg => {
      if (!msg) return;
      const strMsg = String(msg);
      const d = document.createElement('div');
      d.innerHTML = strMsg;

      if (strMsg.includes('нанес') || strMsg.includes('повержен') || strMsg.includes('убил')) d.className = 'log-damage';
      if (strMsg.includes('заблокировал') || strMsg.includes('🛡️')) d.className = 'log-miss';
      if (strMsg.includes('🎉') || strMsg.includes('🏁') || strMsg.includes('🛑')) d.className = 'log-system';
      if (strMsg.includes('💤')) { d.style.color = '#f39c12'; d.style.fontWeight = 'bold'; }

      logBox.appendChild(d);
    });

    logBox.scrollTop = logBox.scrollHeight;
  },

  appendSingleLog(msg) {
    const logBox = document.getElementById('battle-log-viewport');
    if (!logBox || !msg) return;
    const d = document.createElement('div');
    d.innerHTML = msg;
    logBox.appendChild(d);
    logBox.scrollTop = logBox.scrollHeight;
  },

  // Полная замена логов (для зрителя при подключении)
  renderAllLogs(allLogs) {
    const logBox = document.getElementById('battle-log-viewport');
    if (!logBox) return;

    logBox.innerHTML = '';

    allLogs.forEach(entry => {
      const divBreak = document.createElement('div');
      divBreak.className = 'log-round-break';
      divBreak.innerHTML = `<span>--- Раунд ${entry.round} ---</span>`;
      logBox.appendChild(divBreak);

      (entry.logs || []).forEach(msg => {
        if (!msg) return;
        const strMsg = String(msg);
        const d = document.createElement('div');
        d.innerHTML = strMsg;
        if (strMsg.includes('нанес')) d.className = 'log-damage';
        if (strMsg.includes('заблокировал')) d.className = 'log-miss';
        if (strMsg.includes('🎉') || strMsg.includes('🏁')) d.className = 'log-system';
        logBox.appendChild(d);
      });
    });

    logBox.scrollTop = logBox.scrollHeight;
  }
};