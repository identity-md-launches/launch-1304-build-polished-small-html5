/** Pure game rules. Rendering, input, audio and browser storage live elsewhere. */
export const COLS = 7;
export const ROWS = 6;
export const ROUND_SECONDS = 60;
export const HOP_DURATION = 0.16;
export const COIN_POINTS = 10;
export const START_LIVES = 3;
export const INVULNERABILITY_SECONDS = 1.6;

export type Phase = 'title' | 'playing' | 'paused' | 'over';
export type Direction = 'up' | 'down' | 'left' | 'right';
export type EndReason = 'time' | 'lives';
export type HitReason = 'water' | 'hazard';

export interface Cell {
  x: number;
  y: number;
}

export interface Frog extends Cell {
  previousX: number;
  previousY: number;
  /** Seconds into the current hop; HOP_DURATION means the frog has landed. */
  hopElapsed: number;
}

export interface Coin extends Cell {
  id: number;
}

export interface Hazard extends Cell {
  id: number;
  /** Signed horizontal velocity in cells per second. */
  speed: number;
}

export interface GameState {
  phase: Phase;
  frog: Frog;
  score: number;
  lives: number;
  timeLeft: number;
  elapsed: number;
  invulnerableRemaining: number;
  coins: Coin[];
  hazards: Hazard[];
  endReason: EndReason | null;
}

export interface GameEvent extends Cell {
  type: 'hop' | 'coin' | 'hit' | 'over';
  reason?: HitReason | EndReason;
}

/** Gaps are actual water. Both bank rows are safe from moving hazards. */
export const PAD_LAYOUT: readonly (readonly boolean[])[] = [
  [true, true, true, true, true, true, true],
  [true, true, false, true, true, true, true],
  [true, false, true, true, false, true, true],
  [true, true, true, true, false, true, true],
  [true, false, true, true, true, false, true],
  [true, true, true, true, true, true, true],
];

const START: Cell = { x: 3, y: 5 };
const COLLISION_RADIUS = 0.43;
const MAX_STEP = 1 / 60;
const EPSILON = 1e-9;
const HAZARD_MARGIN = 0.7;
const HAZARD_WRAP_WIDTH = COLS - 1 + HAZARD_MARGIN * 2;
const MOVES: Record<Direction, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function hasPad(x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && PAD_LAYOUT[y]?.[x] === true;
}

function restingFrog(): Frog {
  return {
    ...START,
    previousX: START.x,
    previousY: START.y,
    hopElapsed: HOP_DURATION,
  };
}

function initialState(): GameState {
  return {
    phase: 'title',
    frog: restingFrog(),
    score: 0,
    lives: START_LIVES,
    timeLeft: ROUND_SECONDS,
    elapsed: 0,
    invulnerableRemaining: 0,
    coins: [
      { id: 0, x: 3, y: 4 },
      { id: 1, x: 1, y: 3 },
      { id: 2, x: 5, y: 2 },
      { id: 3, x: 4, y: 0 },
    ],
    hazards: [
      { id: 0, x: 0.1, y: 4, speed: 1.1 },
      { id: 1, x: 5.3, y: 3, speed: -1.35 },
      { id: 2, x: 2.5, y: 2, speed: 0.9 },
      { id: 3, x: 6.2, y: 1, speed: -1.2 },
    ],
    endReason: null,
  };
}

export class Game {
  readonly state: GameState;
  private readonly random: () => number;
  private events: GameEvent[] = [];
  private nextCoinId = 4;

  constructor(random: () => number = Math.random) {
    this.random = random;
    this.state = initialState();
  }

  start(): void {
    Object.assign(this.state, initialState(), { phase: 'playing' });
    this.nextCoinId = 4;
    this.events = [];
  }

  pause(): void {
    if (this.state.phase === 'playing') this.state.phase = 'paused';
  }

  resume(): void {
    if (this.state.phase === 'paused') this.state.phase = 'playing';
  }

  move(direction: Direction): boolean {
    const { state } = this;
    if (state.phase !== 'playing' || state.frog.hopElapsed < HOP_DURATION) return false;
    const delta = MOVES[direction];
    if (!delta) return false;
    const x = state.frog.x + delta.x;
    const y = state.frog.y + delta.y;
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;

    state.frog.previousX = state.frog.x;
    state.frog.previousY = state.frog.y;
    state.frog.x = x;
    state.frog.y = y;
    state.frog.hopElapsed = 0;
    this.events.push({ type: 'hop', x, y });
    return true;
  }

  /** Fixed small steps preserve collisions even when a frame is late. */
  update(dtSeconds: number): void {
    if (this.state.phase !== 'playing' || !Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
    let remaining = Math.min(dtSeconds, this.state.timeLeft);
    while (remaining > EPSILON && this.state.phase === 'playing') {
      const step = Math.min(MAX_STEP, remaining);
      this.tick(step);
      remaining -= step;
    }
  }

  drainEvents(): GameEvent[] {
    return this.events.splice(0);
  }

  private tick(dt: number): void {
    const { state } = this;
    state.elapsed = Math.min(ROUND_SECONDS, state.elapsed + dt);
    state.timeLeft = Math.max(0, ROUND_SECONDS - state.elapsed);
    state.invulnerableRemaining = Math.max(0, state.invulnerableRemaining - dt);

    for (const hazard of state.hazards) {
      hazard.x += hazard.speed * dt;
      if (hazard.x > COLS - 1 + HAZARD_MARGIN) hazard.x -= HAZARD_WRAP_WIDTH;
      if (hazard.x < -HAZARD_MARGIN) hazard.x += HAZARD_WRAP_WIDTH;
    }

    state.frog.hopElapsed = Math.min(HOP_DURATION, state.frog.hopElapsed + dt);
    if (state.frog.hopElapsed >= HOP_DURATION - EPSILON) {
      state.frog.hopElapsed = HOP_DURATION;
      if (!hasPad(state.frog.x, state.frog.y)) {
        this.hit('water');
      } else if (
        state.invulnerableRemaining <= 0 &&
        state.hazards.some((hazard) =>
          hazard.y === state.frog.y && Math.abs(hazard.x - state.frog.x) < COLLISION_RADIUS,
        )
      ) {
        this.hit('hazard');
      } else {
        this.collectCoin();
      }
    }

    if (state.phase === 'playing' && state.timeLeft <= EPSILON) {
      state.elapsed = ROUND_SECONDS;
      state.timeLeft = 0;
      this.finish('time');
    }
  }

  private collectCoin(): void {
    const { state } = this;
    const index = state.coins.findIndex((coin) => coin.x === state.frog.x && coin.y === state.frog.y);
    if (index < 0) return;

    const [coin] = state.coins.splice(index, 1);
    state.score += COIN_POINTS;
    this.events.push({ type: 'coin', x: coin.x, y: coin.y });
    this.spawnCoin();
  }

  private spawnCoin(): void {
    const { state } = this;
    const choices: Cell[] = [];
    // No coins on the safe starting bank: earning points means entering the pond.
    for (let y = 0; y < ROWS - 1; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (
          hasPad(x, y) &&
          !(state.frog.x === x && state.frog.y === y) &&
          !state.coins.some((coin) => coin.x === x && coin.y === y)
        ) choices.push({ x, y });
      }
    }
    if (choices.length === 0) return;
    const randomValue = this.random();
    const fraction = Number.isFinite(randomValue) ? Math.min(1 - Number.EPSILON, Math.max(0, randomValue)) : 0.5;
    const position = choices[Math.floor(fraction * choices.length)];
    state.coins.push({ id: this.nextCoinId, ...position });
    this.nextCoinId += 1;
  }

  private hit(reason: HitReason): void {
    const { state } = this;
    this.events.push({ type: 'hit', x: state.frog.x, y: state.frog.y, reason });
    state.lives = Math.max(0, state.lives - 1);
    state.frog = restingFrog();
    state.invulnerableRemaining = INVULNERABILITY_SECONDS;
    if (state.lives === 0) this.finish('lives');
  }

  private finish(reason: EndReason): void {
    if (this.state.phase !== 'playing') return;
    this.state.phase = 'over';
    this.state.endReason = reason;
    this.events.push({ type: 'over', x: this.state.frog.x, y: this.state.frog.y, reason });
  }
}
