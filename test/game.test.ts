import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COIN_POINTS,
  COLS,
  Game,
  HOP_DURATION,
  INVULNERABILITY_SECONDS,
  PAD_LAYOUT,
  ROUND_SECONDS,
  ROWS,
  hasPad,
} from '../src/game.ts';
import type { Direction } from '../src/game.ts';

function hop(game: Game, direction: Direction): void {
  assert.equal(game.move(direction), true);
  game.update(HOP_DURATION);
}

test('title is inert, starting a round resets all round state', () => {
  const game = new Game();
  assert.equal(game.state.phase, 'title');
  assert.equal(game.move('up'), false);
  game.update(100);
  assert.equal(game.state.timeLeft, ROUND_SECONDS);
  game.start();
  assert.equal(game.state.phase, 'playing');
  assert.equal(game.state.lives, 3);
  assert.deepEqual([game.state.frog.x, game.state.frog.y], [3, 5]);
  hop(game, 'up');
  assert.equal(game.state.score, COIN_POINTS);
  game.start();
  assert.equal(game.state.score, 0);
  assert.equal(game.state.timeLeft, ROUND_SECONDS);
  assert.equal(game.state.coins.length, 4);
  assert.deepEqual(game.drainEvents(), []);
});

test('valid hops collect 10-point coins only on landing and replace them on free pads', () => {
  const game = new Game(() => 0);
  game.start();
  assert.equal(game.move('up'), true);
  assert.equal(game.state.score, 0);
  assert.equal(game.move('left'), false, 'a hop must finish before another begins');
  game.update(HOP_DURATION / 2);
  assert.equal(game.state.score, 0);
  game.update(HOP_DURATION / 2);
  assert.equal(game.state.score, 10);
  assert.equal(game.state.coins.length, 4);
  assert.equal(new Set(game.state.coins.map((coin) => `${coin.x},${coin.y}`)).size, 4);
  assert.ok(game.state.coins.every((coin) => hasPad(coin.x, coin.y)));
  assert.ok(game.state.coins.every((coin) => coin.y < ROWS - 1));
  assert.deepEqual(game.drainEvents().map((event) => event.type), ['hop', 'coin']);
  game.update(0.1);
  assert.equal(game.state.score, 10, 'a collected coin cannot count again');
});

test('the whole playable pad layout is connected from the starting bank', () => {
  const visited = new Set<string>(['3,5']);
  const queue = [{ x: 3, y: 5 }];
  for (let index = 0; index < queue.length; index += 1) {
    const cell = queue[index];
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const x = cell.x + dx;
      const y = cell.y + dy;
      const key = `${x},${y}`;
      if (hasPad(x, y) && !visited.has(key)) {
        visited.add(key);
        queue.push({ x, y });
      }
    }
  }
  assert.equal(visited.size, PAD_LAYOUT.flat().filter(Boolean).length);
  assert.equal(hasPad(-1, 0), false);
  assert.equal(hasPad(COLS, 0), false);
  assert.equal(hasPad(0, ROWS), false);
  assert.equal(hasPad(0.5, 0), false);
});

test('out-of-bounds movement is ignored without spending a life or starting a hop', () => {
  const game = new Game();
  game.start();
  assert.equal(game.move('down'), false);
  hop(game, 'left');
  hop(game, 'left');
  hop(game, 'left');
  assert.equal(game.move('left'), false);
  assert.equal(game.state.frog.x, 0);
  assert.equal(game.state.lives, 3);
  assert.equal(game.state.frog.hopElapsed, HOP_DURATION);
});

test('a water landing loses one life, emits feedback, and respawns safely', () => {
  const game = new Game();
  game.start();
  hop(game, 'left');
  hop(game, 'up');
  game.drainEvents();
  hop(game, 'left');
  assert.equal(game.state.lives, 2);
  assert.deepEqual([game.state.frog.x, game.state.frog.y], [3, 5]);
  assert.ok(game.state.invulnerableRemaining > 1.5);
  assert.equal(game.state.phase, 'playing');
  assert.deepEqual(game.drainEvents().map((event) => [event.type, event.reason]), [
    ['hop', undefined], ['hit', 'water'],
  ]);
  game.update(0.2);
  assert.equal(game.state.lives, 2, 'respawn cannot cause another hit');
});

test('moving hazards cannot tunnel through a resting frog during a slow frame', () => {
  const game = new Game();
  game.start();
  game.state.frog = { x: 3, y: 4, previousX: 3, previousY: 4, hopElapsed: HOP_DURATION };
  game.state.hazards = [{ id: 0, x: 2, y: 4, speed: 1.1 }];
  game.update(2);
  assert.equal(game.state.lives, 2);
  assert.equal(game.drainEvents().filter((event) => event.type === 'hit' && event.reason === 'hazard').length, 1);
});

test('respawn protection prevents hazard damage and expires on game time', () => {
  const game = new Game();
  game.start();
  game.state.frog = { x: 3, y: 4, previousX: 3, previousY: 4, hopElapsed: HOP_DURATION };
  game.state.hazards = [{ id: 0, x: 3, y: 4, speed: 0 }];
  game.state.invulnerableRemaining = INVULNERABILITY_SECONDS;
  game.update(1);
  assert.equal(game.state.lives, 3);
  assert.ok(game.state.invulnerableRemaining > 0.59);
  game.update(0.7);
  assert.equal(game.state.lives, 2);
});

test('pause freezes the timer, hops, hazards and protection; resume continues them', () => {
  const game = new Game();
  game.start();
  game.move('up');
  game.update(0.05);
  game.pause();
  const snapshot = structuredClone(game.state);
  game.update(30);
  assert.equal(game.move('left'), false);
  assert.deepEqual(game.state, snapshot);
  game.resume();
  game.update(0.2);
  assert.equal(game.state.phase, 'playing');
  assert.equal(game.state.score, 10);
  assert.ok(game.state.timeLeft < snapshot.timeLeft);
});

test('60 seconds finishes exactly once and final score remains an integer', () => {
  const game = new Game();
  game.start();
  game.update(59.75);
  assert.equal(game.state.phase, 'playing');
  assert.ok(Math.abs(game.state.timeLeft - 0.25) < 1e-7);
  game.update(0.25);
  assert.equal(game.state.phase, 'over');
  assert.equal(game.state.endReason, 'time');
  assert.equal(game.state.timeLeft, 0);
  assert.equal(game.state.elapsed, 60);
  assert.ok(Number.isInteger(game.state.score));
  assert.equal(game.drainEvents().filter((event) => event.type === 'over').length, 1);
  game.update(100);
  game.pause();
  game.resume();
  assert.equal(game.move('up'), false);
  assert.equal(game.state.phase, 'over');
  assert.deepEqual(game.drainEvents(), []);
});

test('the third water landing ends the round, even during hazard protection', () => {
  const game = new Game();
  game.start();
  game.state.hazards = [];
  for (let life = 3; life > 0; life -= 1) {
    hop(game, 'left');
    hop(game, 'up');
    hop(game, 'left');
    assert.equal(game.state.lives, life - 1);
  }
  assert.equal(game.state.phase, 'over');
  assert.equal(game.state.endReason, 'lives');
  assert.ok(game.state.timeLeft > 0);
  const events = game.drainEvents();
  assert.equal(events.filter((event) => event.type === 'hit').length, 3);
  assert.equal(events.filter((event) => event.type === 'over').length, 1);
  game.start();
  assert.equal(game.state.phase, 'playing');
  assert.equal(game.state.lives, 3);
});

test('invalid frame durations do not poison the game state', () => {
  const game = new Game();
  game.start();
  const snapshot = structuredClone(game.state);
  for (const duration of [-1, 0, Number.NaN, Number.POSITIVE_INFINITY]) game.update(duration);
  assert.deepEqual(game.state, snapshot);
});

test('hazards wrap around the board in both directions', () => {
  const game = new Game();
  game.start();
  game.state.hazards = [
    { id: 0, x: 6.69, y: 1, speed: 1 },
    { id: 1, x: -0.69, y: 2, speed: -1 },
  ];
  game.update(0.1);
  assert.ok(game.state.hazards[0].x < 0);
  assert.ok(game.state.hazards[1].x > 6);
});

test('injectable random coin placement is deterministic and guards invalid random values', () => {
  const first = new Game(() => 0.75);
  const second = new Game(() => 0.75);
  first.start();
  second.start();
  hop(first, 'up');
  hop(second, 'up');
  assert.deepEqual(first.state.coins, second.state.coins);
  for (const value of [0, 1, -1, Number.NaN]) {
    const game = new Game(() => value);
    game.start();
    hop(game, 'up');
    assert.equal(game.state.coins.length, 4);
    assert.ok(game.state.coins.every((coin) => hasPad(coin.x, coin.y)));
  }
});
