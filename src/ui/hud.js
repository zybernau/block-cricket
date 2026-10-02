const $ = (id) => document.getElementById(id);

let els = {};
let bigMsgTimer = null;
let timingTimer = null;

export function initHUD() {
  els = {
    score: $('score'),
    overs: $('overs'),
    inningsState: $('innings-state'),
    difficultyBadge: $('difficulty-badge'),
    reelsBalls: $('balls-reel'),
    stepBadge: $('step-badge'),
    stepText: $('step-text'),
    bigMsg: $('big-message'),
    errorStrip: $('error-strip'),
    errorText: $('error-text'),
    deliveryTag: $('delivery-tag'),
    timingTag: $('timing-tag'),
    modeIndicator: $('mode-indicator'),
    handBadge: $('hand-badge'),
    gameOver: $('game-over'),
    resultText: $('result-text'),
    startScreen: $('start-screen'),
    diffOptions: [...document.querySelectorAll('.diff-option')],
    ovOptions: [...document.querySelectorAll('.ov-option')],
    customOvers: $('custom-overs'),
  };
}

export function setDifficultyBadge(key, label) {
  if (!els.difficultyBadge) return;
  els.difficultyBadge.textContent = (label || key || '').toUpperCase();
  els.difficultyBadge.className = `diff-${key}`;
}

export function showStartScreen() {
  els.startScreen?.classList.remove('hidden');
}

export function hideStartScreen() {
  els.startScreen?.classList.add('hidden');
}

export function isStartScreenVisible() {
  return !!els.startScreen && !els.startScreen.classList.contains('hidden');
}

export function markSelectedDifficulty(key) {
  els.diffOptions?.forEach((b) =>
    b.classList.toggle('selected', b.dataset.diff === key)
  );
}

export function onDifficultyPick(cb) {
  els.diffOptions?.forEach((b) => {
    b.addEventListener('click', () => cb(b.dataset.diff));
  });
}

// Overs picker: preset buttons select immediately (no autostart);
// the custom box applies on change, Enter confirms + starts.
export function markSelectedOvers(n) {
  const key = [5, 10, 20].includes(n) ? String(n) : 'custom';
  els.ovOptions?.forEach((b) =>
    b.classList.toggle('selected', b.dataset.overs === key)
  );
  if (els.customOvers && key === 'custom') els.customOvers.value = n;
}

function readCustomOvers() {
  const v = Math.max(1, Math.min(50, Math.round(Number(els.customOvers?.value) || 5)));
  if (els.customOvers) els.customOvers.value = v;
  return v;
}

export function onOversPick(cb) {
  els.ovOptions?.forEach((b) => {
    if (b.dataset.overs === 'custom') {
      b.addEventListener('click', (e) => {
        if (e.target !== els.customOvers) els.customOvers?.focus();
      });
    } else {
      b.addEventListener('click', () => cb(Number(b.dataset.overs)));
    }
  });
  els.customOvers?.addEventListener('change', () => cb(readCustomOvers()));
}

export function onCustomOversConfirm(cb) {
  els.customOvers?.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
      e.preventDefault();
      cb(readCustomOvers());
    }
  });
}

// Step-driven game flow indicator (B0): step n of 5 + what's happening.
// Steps: 1 bowling plan · 2 field setting · 3 freeze · 4 batsman ready ·
// 5 ball played.
export function showStep(n, text) {
  if (els.stepBadge) {
    els.stepBadge.textContent = n > 0 ? `${n}/5` : '—';
    els.stepBadge.dataset.step = String(Math.max(0, Math.min(5, n)));
  }
  if (els.stepText) els.stepText.textContent = text || '';
}

export function updateScoreboard(match) {
  els.score.textContent = match.scoreText();
  els.overs.textContent = `(${match.oversText()} ov)`;
}

export function updateBallReel(match) {
  const markers = match.lastSixMarkers();
  els.reelsBalls.innerHTML = markers.length
    ? markers
        .map((m) => {
          const cls = m.kind === 'four' ? 'r4' : m.kind === 'six' ? 'r6' : m.kind === 'wicket' ? 'wk' : m.kind === 'wide' ? 'wd' : '';
          return `<span class="${cls}">${m.marker}</span>`;
        })
        .join('')
    : '—';
}

export function setMode(attack) {
  els.modeIndicator.textContent = attack ? 'ATTACK' : 'DEFENSIVE';
  els.modeIndicator.className = attack ? 'mode-attack' : 'mode-defensive';
}

export function setHand(hand) {
  if (!els.handBadge) return;
  const left = hand === 'L';
  els.handBadge.textContent = left ? 'LHB' : 'RHB';
  els.handBadge.className = left ? 'hand-lhb' : 'hand-rhb';
}

export function showBigMessage(text, color = '#ffffff', hold = 1.1) {
  clearTimeout(bigMsgTimer);
  els.bigMsg.textContent = text;
  els.bigMsg.style.color = color;
  els.bigMsg.classList.add('show');
  bigMsgTimer = setTimeout(() => els.bigMsg.classList.remove('show'), hold * 1000);
}

export function showDelivery(tag) {
  els.deliveryTag.textContent = tag || '';
}

export function showTiming(text, persist = 0.9) {
  clearTimeout(timingTimer);
  els.timingTag.textContent = text || '';
  if (text) {
    timingTimer = setTimeout(() => { els.timingTag.textContent = ''; }, persist * 1000);
  }
}

export function showGameOver(text) {
  els.resultText.textContent = text;
  els.gameOver.classList.remove('hidden');
}
export function hideGameOver() {
  els.gameOver.classList.add('hidden');
}

// ---- Runtime error strip ----
// reportError (main.js) surfaces caught exceptions + window.onerror here so
// failures are VISIBLE on screen (with the first stack line) instead of the
// game silently freezing — copy the text from the console for debugging.
let errorTimer = null;

export function showError(text, hold = 8) {
  if (!els.errorStrip) return;
  if (els.errorText) els.errorText.textContent = text || '';
  els.errorStrip.classList.remove('hidden');
  clearTimeout(errorTimer);
  if (hold > 0) {
    errorTimer = setTimeout(() => els.errorStrip.classList.add('hidden'), hold * 1000);
  }
}

export function hideError() {
  clearTimeout(errorTimer);
  els.errorStrip?.classList.add('hidden');
}
