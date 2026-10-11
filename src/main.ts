import { Game, COLS, ROWS, type Direction, type Phase } from './game.js';
import { PondRenderer } from './renderer.js';
import { PondAudio } from './audio.js';
import { BestScore } from './storage.js';
import { connectBridge } from './bridge.js';

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing game element: ${id}`);
  return value as T;
}

const game = new Game();
const best = new BestScore();
const sound = new PondAudio();
const canvas = element<HTMLCanvasElement>('game-canvas');
const renderer = new PondRenderer(canvas);
const shell = element('game-shell');
const overlay = element('overlay');
const overlayHeading = element('overlay-heading');
const overlayMessage = element('overlay-message');
const overlayTag = element('overlay-tag');
const overlayHint = element('overlay-hint');
const playButton = element<HTMLButtonElement>('play-button');
const playLabel = element('play-label');
const pauseButton = element<HTMLButtonElement>('pause-button');
const helpButton = element<HTMLButtonElement>('help-button');
const helpDialog = element<HTMLDialogElement>('help-dialog');
const soundButton = element<HTMLButtonElement>('sound-button');
const scoreValue = element('score-value');
const timeValue = element('time-value');
const livesValue = element('lives-value');
const pondStatus = element('pond-status');
const announcer = element('announcer');
const feedback = element('game-feedback');
const roundResult = element('round-result');
const directionButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-direction]')];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let previousPhase: Phase = 'title';
let previousTimestamp = performance.now();
let feedbackUntil = 0;
let newBest = false;
let needsDraw = true;
let lastHud = '';
let soundPending = false;

function announce(message: string): void { announcer.textContent = message; }
function updateBest(): void {
  element('best-value').textContent = String(best.value);
  element('best-label').textContent = best.available ? 'Personal best' : 'Best this visit';
}

function updateHud(): void {
  const state = game.state;
  const seconds = Math.ceil(state.timeLeft);
  const signature = `${state.score}:${seconds}:${state.lives}:${state.frog.x}:${state.frog.y}`;
  if (signature === lastHud) return;
  lastHud = signature;
  scoreValue.textContent = String(state.score).padStart(3, '0');
  timeValue.textContent = String(seconds).padStart(2, '0');
  timeValue.closest('.time-stat')?.classList.toggle('urgent', seconds <= 10);
  livesValue.setAttribute('aria-label', `${state.lives} ${state.lives === 1 ? 'life' : 'lives'} remaining`);
  [...livesValue.children].forEach((heart, index) => heart.classList.toggle('lost', index >= state.lives));
  canvas.setAttribute('aria-label', `Lily Hop pond. Frog at column ${state.frog.x + 1} of ${COLS}, row ${state.frog.y + 1} of ${ROWS}. Score ${state.score}. ${state.lives} lives. Green lily pads are safe; avoid water gaps and moving red beetles.`);
}

function syncPhase(focus = true): void {
  const phase = game.state.phase;
  shell.dataset.phase = phase;
  overlay.hidden = phase === 'playing';
  pauseButton.disabled = phase !== 'playing';
  directionButtons.forEach(button => { button.disabled = phase !== 'playing'; });
  canvas.tabIndex = phase === 'playing' ? 0 : -1;
  canvas.setAttribute('aria-hidden', String(phase !== 'playing'));
  roundResult.hidden = phase !== 'over';
  feedback.hidden = true;
  needsDraw = true;
  updateHud();
  if (phase === previousPhase) return;
  previousPhase = phase;

  if (phase === 'playing') {
    pondStatus.textContent = 'A hop at a time';
    if (focus) canvas.focus({ preventScroll: true });
  } else if (phase === 'paused') {
    pondStatus.textContent = 'Taking a breather';
    overlayTag.textContent = 'The pond can wait';
    overlayHeading.textContent = 'Take a little breather.';
    overlayMessage.textContent = 'Your round is paused. Jump back in when you’re ready.';
    playLabel.textContent = 'Resume game';
    overlayHint.textContent = 'Press P or Esc to resume';
    announce('Game paused. Press P to resume.');
    if (focus && !helpDialog.open) playButton.focus({ preventScroll: true });
  } else if (phase === 'over') {
    pondStatus.textContent = 'A lovely little run';
    overlayTag.textContent = 'Every hop counts';
    overlayHeading.textContent = game.state.endReason === 'time' ? 'Time flies. Frogs hop.' : 'One more little hop?';
    overlayMessage.textContent = game.state.endReason === 'time' ? 'That’s 60 seconds well spent.' : 'Out of lives. The pond is ready for another round.';
    element('result-score').textContent = String(game.state.score);
    element('result-note').textContent = newBest ? (best.available ? 'A new personal best!' : 'Your best this visit!') : `${best.available ? 'Personal best' : 'Best this visit'}: ${best.value}`;
    playLabel.textContent = 'Play again';
    overlayHint.textContent = 'A fresh pond. Another 60 seconds.';
    announce(`Round over. Final score ${game.state.score}. ${newBest ? 'New personal best. ' : ''}Play again to start a new round.`);
    if (focus) playButton.focus({ preventScroll: true });
  }
}

function pause(): void {
  if (game.state.phase !== 'playing') return;
  game.pause();
  syncPhase();
}
function resume(): void {
  if (game.state.phase !== 'paused' || helpDialog.open || document.hidden) return;
  game.resume();
  previousTimestamp = performance.now();
  syncPhase();
  announce('Game resumed.');
}
function start(): void {
  newBest = false;
  renderer.clearEffects();
  game.start();
  previousTimestamp = performance.now();
  feedbackUntil = 0;
  syncPhase();
  sound.play('start');
  announce('Round started. 60 seconds and 3 lives. Hop up to collect your first coin.');
}
function move(direction: Direction): void {
  if (helpDialog.open || document.hidden) return;
  if (game.move(direction)) needsDraw = true;
}

const bridge = connectBridge({ pause, resume });
playButton.addEventListener('click', () => game.state.phase === 'paused' ? resume() : start());
pauseButton.addEventListener('click', pause);
directionButtons.forEach(button => {
  button.addEventListener('click', () => move(button.dataset.direction as Direction));
});

const directions: Record<string, Direction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
};
window.addEventListener('keydown', event => {
  if (helpDialog.open || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if ((key === 'p' || key === 'Escape') && !event.repeat) {
    if (game.state.phase === 'playing') { event.preventDefault(); pause(); }
    else if (game.state.phase === 'paused') { event.preventDefault(); resume(); }
    return;
  }
  if (game.state.phase === 'playing' && directions[key]) {
    event.preventDefault();
    move(directions[key]);
  }
});

helpButton.setAttribute('aria-label', 'How to play');
helpButton.addEventListener('click', () => {
  pause();
  helpDialog.showModal();
  element<HTMLButtonElement>('close-help').focus();
});
function closeHelp(): void { helpDialog.close(); }
element('close-help').addEventListener('click', closeHelp);
element('help-done').addEventListener('click', closeHelp);
helpDialog.addEventListener('close', () => { helpButton.focus({ preventScroll: true }); });
helpDialog.addEventListener('click', event => {
  if (event.target !== helpDialog) return;
  const bounds = helpDialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeHelp();
});

soundButton.setAttribute('aria-label', 'Sound off');
soundButton.addEventListener('click', () => {
  if (soundPending) return;
  soundPending = true;
  const wasEnabled = sound.enabled;
  void sound.toggle().then(enabled => {
    soundButton.setAttribute('aria-pressed', String(enabled));
    soundButton.setAttribute('aria-label', enabled ? 'Sound on' : 'Sound off');
    soundButton.title = enabled ? 'Turn sound off' : 'Turn sound on';
    element('sound-label').textContent = enabled ? 'Sound on' : 'Sound off';
    document.getElementById('sound-icon')?.setAttribute('href', enabled ? '#i-sound' : '#i-mute');
    if (!enabled && !wasEnabled) announce('Sound is unavailable in this browser. You can keep playing.');
  }).finally(() => { soundPending = false; });
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
  previousTimestamp = performance.now();
});
window.addEventListener('pagehide', pause);
window.addEventListener('resize', () => { needsDraw = true; });
new ResizeObserver(() => { needsDraw = true; }).observe(canvas);
reducedMotion.addEventListener('change', () => { needsDraw = true; });

function frame(timestamp: number): void {
  const dt = Math.max(0, (timestamp - previousTimestamp) / 1000);
  previousTimestamp = timestamp;
  if (game.state.phase === 'playing') {
    game.update(dt);
    const events = game.drainEvents();
    renderer.addEffects(events, game.state.elapsed);
    for (const event of events) {
      sound.play(event.type);
      if (event.type === 'coin') {
        announce(`Coin collected. Score ${game.state.score}.`);
      } else if (event.type === 'hit') {
        const message = event.reason === 'water' ? 'Splash! Land on a lily pad.' : 'Beetle bump! Watch the crossing.';
        feedback.textContent = message;
        feedback.hidden = false;
        feedbackUntil = game.state.elapsed + 1.4;
        announce(`${message} ${game.state.lives} ${game.state.lives === 1 ? 'life' : 'lives'} remaining.`);
      } else if (event.type === 'over') {
        newBest = best.record(game.state.score);
        updateBest();
        bridge.reportScore(game.state.score);
      }
    }
    if (game.state.elapsed >= feedbackUntil) feedback.hidden = true;
    updateHud();
    if (game.state.phase !== previousPhase) syncPhase();
    needsDraw = true;
  }
  if (needsDraw) {
    renderer.draw(game.state, game.state.elapsed, reducedMotion.matches);
    needsDraw = false;
  }
  requestAnimationFrame(frame);
}
updateBest();
syncPhase(false);
requestAnimationFrame(frame);
