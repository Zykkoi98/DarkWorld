// ============================================================================
// ===== 🎮 UI-ЛОГИКА БОЯ (BATTLE_UI.JS) =====
// ===== Кнопки, зоны, отправка хода =====
// ============================================================================

window.BUI = {
  ZONES: ['head', 'breast', 'torso', 'belt', 'legs'],

  // ==========================================================================
  // ИНИЦИАЛИЗАЦИЯ — привязка событий
  // ==========================================================================
  init() {
    if (BState.isSpectator) {
      this.hideFighterUI();
      return;
    }
    this.bindAttackZones();
    this.bindDefendZones();
    this.bindStrikeButton();
    this.bindRandomButton();
    this.bindPotionButton();
  },

  // ==========================================================================
  // СКРЫТЬ UI ДЛЯ ЗРИТЕЛЯ
  // ==========================================================================
  hideFighterUI() {
    const tacticalPanel = document.querySelector('.tactical-center-controls');
    if (tacticalPanel) tacticalPanel.style.display = 'none';

    const quickSlots = document.querySelectorAll('.quick-slots-row');
    quickSlots.forEach(el => el.style.display = 'none');

    // Показать кнопку закрытия просмотра
    this.showSpectatorCloseBtn();

    // Заголовок режима зрителя
    const header = document.getElementById('battle-round-indicator');
    if (header) header.textContent = '👁️ Режим зрителя';

    console.log('👁️ [UI] Режим зрителя — кнопки скрыты');
  },

  showSpectatorCloseBtn() {
    const bottom = document.querySelector('.battle-bottom');
    if (!bottom) return;

    if (document.getElementById('spectator-close-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'spectator-close-btn';
    btn.textContent = '❌ ЗАКРЫТЬ ПРОСМОТР';
    btn.style.cssText = `
      width: 100%; margin-top: 12px;
      padding: 14px;
      background: #e74c3c; border: none;
      color: #fff; font-weight: bold;
      border-radius: 10px; cursor: pointer;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(231, 76, 60, 0.3);
    `;
    btn.onclick = () => {
      if (BState.socket) {
        BState.socket.emit('battle_spectator_leave', { roomId: BState.roomId });
      }
      window.history.back();
    };

    bottom.appendChild(btn);
  },

  // ==========================================================================
  // ЗОНЫ АТАКИ
  // ==========================================================================
  bindAttackZones() {
    document.querySelectorAll('.btn-atk').forEach(btn => {
      btn.onclick = () => {
        const zone = btn.getAttribute('data-zone');
        const { maxAttacks } = this.getLimits();

        if (maxAttacks === 2) {
          // Массив из 2 зон
          if (!Array.isArray(BState.selectedAttackZone)) BState.selectedAttackZone = [];
          const idx = BState.selectedAttackZone.indexOf(zone);
          if (idx !== -1) {
            BState.selectedAttackZone.splice(idx, 1);
            btn.classList.remove('attack-selected');
          } else {
            if (BState.selectedAttackZone.length >= 2) {
              const removed = BState.selectedAttackZone.shift();
              document.querySelector(`.btn-atk[data-zone="${removed}"]`)?.classList.remove('attack-selected');
            }
            BState.selectedAttackZone.push(zone);
            btn.classList.add('attack-selected');
          }
        } else {
          // Одна зона
          document.querySelectorAll('.btn-atk').forEach(b => b.classList.remove('attack-selected'));
          BState.selectedAttackZone = zone;
          btn.classList.add('attack-selected');
        }

        this.updateStrikeButtonState();
      };
    });
  },

  // ==========================================================================
  // ЗОНЫ БЛОКА
  // ==========================================================================
  bindDefendZones() {
    document.querySelectorAll('.btn-def').forEach(btn => {
      btn.onclick = () => {
        const zone = btn.getAttribute('data-zone');
        const { maxDefends } = this.getLimits();

        const idx = BState.selectedDefendZones.indexOf(zone);
        if (idx !== -1) {
          BState.selectedDefendZones.splice(idx, 1);
          btn.classList.remove('defend-selected');
        } else {
          if (BState.selectedDefendZones.length >= maxDefends) {
            const removed = BState.selectedDefendZones.shift();
            document.querySelector(`.btn-def[data-zone="${removed}"]`)?.classList.remove('defend-selected');
          }
          BState.selectedDefendZones.push(zone);
          btn.classList.add('defend-selected');
        }

        this.updateStrikeButtonState();
      };
    });
  },

  // ==========================================================================
  // ЛИМИТЫ АТАК/БЛОКОВ (на клиенте — для UI)
  // ==========================================================================
  getLimits() {
    const me = BState.getMyFighter();
    if (!me || !me.equipped) {
      return { maxAttacks: 1, maxDefends: (me && Number(me.level) <= 1) ? 2 : 1 };
    }

    const mh = me.equipped.mainHand;
    const oh = me.equipped.offHand;

    const isShield = (id) => {
      if (!id) return false;
      const d = window.getItemData ? window.getItemData(id) : null;
      if (d) {
        const name = (d.name || '').toLowerCase();
        if (name.includes('щит') || name.includes('баклер') || name.includes('эгида') ||
            name.includes('оберег') || name.includes('бастион') || name.includes('скутум')) return true;
      }
      const i = String(id).toLowerCase();
      return i.includes('shield') || i.includes('buckler') || i.includes('aegis') ||
             i.includes('scutum') || i.includes('bastion') || i.includes('parry');
    };

    const isTwo = mh && (mh === 'heavy_halberd' || String(mh).includes('twoHanded') ||
      (window.getItemData?.(mh)?.slotType === 'twoHanded'));

    let maxAttacks = 1;
    let maxDefends = 1;

    if (isTwo) maxAttacks = 1;
    else if (oh && !isShield(oh)) maxAttacks = 2;
    else maxAttacks = 1;

    if (isShield(oh)) maxDefends = 3;
    else if (Number(me.level || 1) <= 1) maxDefends = 2;
    else maxDefends = 1;

    return { maxAttacks, maxDefends };
  },

  // ==========================================================================
  // КНОПКА «АТАКОВАТЬ» — состояние
  // ==========================================================================
  updateStrikeButtonState() {
      const btn = document.getElementById('strike-action-btn');
      if (!btn) return;

      // 🔥 ФИКС: если бой завершён — НЕ трогаем кнопку.
      // handleBattleOver() уже настроил её на "ВЕРНУТЬСЯ В БАШНЮ/ГОРОД" с нужным onclick.
      if (BState.isBattleOver) return;

      const { maxAttacks, maxDefends } = this.getLimits();

      const hasAttack = (maxAttacks === 2)
        ? (Array.isArray(BState.selectedAttackZone) && BState.selectedAttackZone.length === 2)
        : !!BState.selectedAttackZone;

      const hasDefend = BState.selectedDefendZones.length === maxDefends;
      const hasTarget = !!BState.selectedTargetUuid;

      btn.disabled = !(hasAttack && hasDefend && hasTarget);
    },

  // ==========================================================================
  // ОТПРАВКА ХОДА
  // ==========================================================================
  bindStrikeButton() {
    const btn = document.getElementById('strike-action-btn');
    if (!btn) return;

    btn.onclick = () => {
      if (BState.isBattleOver) {
        if (BState.socket) BState.socket.disconnect();
        window.location.replace('../index.html');
        return;
      }

      if (btn.disabled) return;

      btn.disabled = true;
      btn.textContent = 'Расчет...';

      BState.socket.emit('battle_submit_turn', {
        roomId: BState.roomId,
        targetUuid: String(BState.selectedTargetUuid),
        attack: BState.selectedAttackZone,
        defends: BState.selectedDefendZones
      });
    };
  },

  // ==========================================================================
  // СЛУЧАЙНЫЙ ХОД
  // ==========================================================================
  bindRandomButton() {
    const btn = document.getElementById('random-strike-btn');
    if (!btn) return;

    btn.onclick = () => {
      // Восстанавливаем цель
      if (!BState.selectedTargetUuid) {
        const target = BState.getOpposingTeam().find(f => f.currentHp > 0);
        if (target) BState.selectedTargetUuid = target.uuid;
      }
      if (!BState.selectedTargetUuid) return alert('❌ Нет цели');

      const zones = this.ZONES;
      const { maxAttacks, maxDefends } = this.getLimits();

      document.querySelectorAll('.btn-atk').forEach(b => b.classList.remove('attack-selected'));
      document.querySelectorAll('.btn-def').forEach(b => b.classList.remove('defend-selected'));

      // Атака
      if (maxAttacks === 2) {
        BState.selectedAttackZone = [];
        while (BState.selectedAttackZone.length < 2) {
          const z = zones[Math.floor(Math.random() * zones.length)];
          if (!BState.selectedAttackZone.includes(z)) BState.selectedAttackZone.push(z);
        }
        BState.selectedAttackZone.forEach(z => {
          document.querySelector(`.btn-atk[data-zone="${z}"]`)?.classList.add('attack-selected');
        });
      } else {
        BState.selectedAttackZone = zones[Math.floor(Math.random() * zones.length)];
        document.querySelector(`.btn-atk[data-zone="${BState.selectedAttackZone}"]`)?.classList.add('attack-selected');
      }

      // Блоки
      BState.selectedDefendZones = [];
      while (BState.selectedDefendZones.length < maxDefends) {
        const z = zones[Math.floor(Math.random() * zones.length)];
        if (!BState.selectedDefendZones.includes(z)) BState.selectedDefendZones.push(z);
      }
      BState.selectedDefendZones.forEach(z => {
        document.querySelector(`.btn-def[data-zone="${z}"]`)?.classList.add('defend-selected');
      });

      this.updateStrikeButtonState();
      if (!document.getElementById('strike-action-btn')?.disabled) {
        document.getElementById('strike-action-btn')?.click();
      }
    };
  },
    // ==========================================================================
  // 🔥 МОДАЛКА ФИНАЛЬНЫХ НАГРАД (PvP)
  // ==========================================================================
  showFinalRewardsModal(rewards) {
    if (!rewards) return;

    console.log('🏆 [BUI] Показ модалки наград:', rewards);

    const isWinner = rewards.isWinner;
    const headerColor = isWinner ? '#2ecc71' : '#e74c3c';
    const headerBg = isWinner ? 'rgba(46,204,113,0.12)' : 'rgba(231,76,60,0.12)';
    const headerText = isWinner ? '🏆 ПОБЕДА!' : '💀 ПОРАЖЕНИЕ';
    const headerBorder = isWinner ? '2px solid #2ecc71' : '2px solid #e74c3c';

    // Формируем breakdown
    let breakdownHtml = '';
    if (rewards.breakdown && rewards.breakdown.length > 0) {
      breakdownHtml = '<div style="margin-top:14px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);">';
      breakdownHtml += '<div style="font-size:11px;color:#9aa0b5;letter-spacing:0.5px;margin-bottom:8px;text-transform:uppercase;">Разбор по врагам</div>';

      rewards.breakdown.forEach(b => {
        breakdownHtml += `
          <div style="background:rgba(255,255,255,0.03);border-radius:8px;padding:10px;margin-bottom:8px;font-size:12px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
              <strong style="color:#fff;">⚔️ ${b.enemyName} (Lv ${b.enemyLevel})</strong>
              <span style="color:#a29bfe;font-weight:bold;">${b.contribution * 100}%</span>
            </div>
            <div style="color:#9aa0b5;line-height:1.5;">
              Урон: <strong style="color:#fff;">${b.myDamage}</strong> / ${b.enemyMaxHp} HP<br>
              База: ${b.baseXp} XP × CP множ. ${b.cpMultiplier}<br>
              <span style="color:#f1c40f;">→ ${b.xpEarned} XP</span>
            </div>
          </div>
        `;
      });

      breakdownHtml += '</div>';
    }

    // Награды
    let rewardsHtml = '';
    if (rewards.goldGained > 0 || rewards.xpGained > 0) {
      rewardsHtml = '<div style="display:flex;flex-direction:column;gap:8px;margin-top:14px;">';
      if (rewards.goldGained > 0) {
        rewardsHtml += `<div style="display:flex;justify-content:space-between;font-size:14px;">
          <span>💰 Золото</span>
          <strong style="color:#f1c40f;">+${rewards.goldGained}</strong>
        </div>`;
      }
      if (rewards.xpGained > 0) {
        rewardsHtml += `<div style="display:flex;justify-content:space-between;font-size:14px;">
          <span>✨ Опыт</span>
          <strong style="color:#a29bfe;">+${rewards.xpGained}</strong>
        </div>`;
      }
      rewardsHtml += '</div>';
    } else {
      rewardsHtml = '<div style="text-align:center;color:#9aa0b5;font-size:13px;margin-top:14px;">Без наград</div>';
    }

    // Level-up
    let levelUpHtml = '';
    if (rewards.levelUp) {
      levelUpHtml = `
        <div style="margin-top:14px;padding:10px;background:rgba(241,196,15,0.1);border:1px solid rgba(241,196,15,0.3);border-radius:8px;text-align:center;">
          <div style="color:#f1c40f;font-weight:bold;font-size:13px;">🎉 УРОВЕНЬ ПОВЫШЕН!</div>
          <div style="color:#fff;font-size:16px;font-weight:bold;margin-top:4px;">Lv ${rewards.newLevel}</div>
        </div>
      `;
    }

    // HTML модалки
    const modal = document.createElement('div');
    modal.id = 'final-rewards-modal';
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.85); backdrop-filter: blur(5px);
      z-index: 10000; display: flex; align-items: center; justify-content: center;
      padding: 16px; opacity: 0; transition: opacity 0.25s ease;
    `;

    modal.innerHTML = `
      <div style="background: #13141f; border-radius: 20px; padding: 20px; width: 100%; max-width: 400px; border-top: 3px solid ${headerColor}; max-height: 90vh; overflow-y: auto;">
        
        <!-- Заголовок -->
        <div style="text-align:center;padding:14px;background:${headerBg};border-radius:14px;margin-bottom:16px;border:${headerBorder};">
          <div style="font-size:22px;font-weight:bold;color:${headerColor};letter-spacing:1px;">${headerText}</div>
        </div>

        <!-- Основные награды -->
        ${rewardsHtml}

        <!-- Level Up -->
        ${levelUpHtml}

        <!-- Breakdown -->
        ${breakdownHtml}

        <!-- Кнопка -->
        <button id="final-rewards-btn" style="
          margin-top:20px;width:100%;padding:14px;border:none;border-radius:12px;
          background:linear-gradient(135deg, #6c5ce7, #a29bfe);color:#fff;
          font-weight:bold;font-size:15px;cursor:pointer;
          box-shadow:0 4px 12px rgba(108,92,231,0.4);
        ">🏆 ВЕРНУТЬСЯ НА АРЕНУ</button>

      </div>
    `;

    document.body.appendChild(modal);

    // Анимация появления
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        modal.style.opacity = '1';
      });
    });

    // Кнопка «Вернуться на Арену»
    document.getElementById('final-rewards-btn').onclick = () => {
      try { localStorage.setItem('arena_active', 'true'); } catch(e) {}
      if (BState.socket) BState.socket.disconnect();
      window.location.replace('../index.html');
    };

    // Для зрителя — просто закрыть
    if (BState.isSpectator) {
      const btn = document.getElementById('final-rewards-btn');
      if (btn) {
        btn.textContent = '❌ ЗАКРЫТЬ';
        btn.onclick = () => {
          modal.remove();
          window.history.back();
        };
      }
    }
  },
  // ==========================================================================
  // БАНКА
  // ==========================================================================
  bindPotionButton() {
    const btn = document.getElementById('quick-potion-btn');
    if (!btn) return;

    btn.onclick = () => {
      if (btn.disabled) return;
      // 🔥 Банку нельзя пить после победы/поражения
      if (BState.isBattleOver) return;
      btn.disabled = true;
      BState.socket.emit('battle_use_potion', { roomId: BState.roomId });
    };
  },

  // Обновить состояние кнопки банки
  updatePotionButton() {
      const btn = document.getElementById('quick-potion-btn');
      if (!btn) return;

      const me = BState.getMyFighter();
      const potion = me?.equipped?.potion;

      // 🔥 Если бой завершён — блокируем кнопку, но показываем остаток
      if (BState.isBattleOver) {
        btn.disabled = true;
        if (potion && typeof potion === 'object' && potion.id && potion.count > 0) {
          const d = window.getItemData ? window.getItemData(potion.id) : null;
          btn.innerHTML = `${d?.icon || '🧪'} <span style="color:#7f8c8d; font-size:11px; font-weight:bold;">x${potion.count}</span>`;
        } else {
          btn.innerHTML = '🧪';
        }
        btn.style.border = '1px solid rgba(255,255,255,0.08)';
        btn.style.boxShadow = 'none';
        btn.style.opacity = '0.4';
        return;
      }

      // Обычное состояние — бой активен
      btn.style.opacity = '1';

      if (potion && typeof potion === 'object' && potion.id && potion.count > 0) {
        const d = window.getItemData ? window.getItemData(potion.id) : null;
        btn.disabled = false;
        btn.innerHTML = `${d?.icon || '🧪'} <span style="color:#2ecc71; font-size:11px; font-weight:bold;">x${potion.count}</span>`;
        btn.style.border = '1px solid #2ecc71';
        btn.style.boxShadow = '0 0 8px rgba(46, 204, 113, 0.4)';
      } else {
        btn.disabled = true;
        btn.innerHTML = '🧪';
        btn.style.border = '1px solid rgba(255,255,255,0.08)';
        btn.style.boxShadow = 'none';
      }
    },

  // ==========================================================================
  // ПОСЛЕ РАУНДА — сброс выбора
  // ==========================================================================
  resetSelection() {
    BState.selectedAttackZone = null;
    BState.selectedDefendZones = [];
    document.querySelectorAll('.btn-atk').forEach(b => b.classList.remove('attack-selected'));
    document.querySelectorAll('.btn-def').forEach(b => b.classList.remove('defend-selected'));
    this.updateStrikeButtonState();
  }
};