import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { connectBridge } from '../src/bridge.ts';
import { BestScore } from '../src/storage.ts';

function browserWindow(context: TestContext, value: object): void {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value });
  context.after(() => {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  });
}

function bridgeHarness(context: TestContext, standalone = false) {
  const messages: { payload: Record<string, unknown>; origin: string }[] = [];
  const calls = { pause: 0, resume: 0 };
  let listener: (event: { source: unknown; data: unknown }) => void;
  let rejectPosts = false;
  const parent = {
    postMessage(payload: Record<string, unknown>, origin: string) {
      if (rejectPosts) throw new DOMException('Parent has gone away', 'InvalidStateError');
      messages.push({ payload, origin });
    },
  };
  const mockWindow = {
    parent: parent as unknown,
    addEventListener(type: string, callback: typeof listener) {
      assert.equal(type, 'message');
      listener = callback;
    },
  };
  if (standalone) mockWindow.parent = mockWindow;
  browserWindow(context, mockWindow);
  const bridge = connectBridge({
    pause() { calls.pause += 1; },
    resume() { calls.resume += 1; },
  });
  return {
    bridge, messages, calls, parent, mockWindow,
    send(data: unknown, source: unknown = parent) { listener({ source, data }); },
    closeParent() { rejectPosts = true; },
  };
}

const protocol = 'pepe-game/1';

test('bridge initializes only from the parent with the correct protocol and a string channel', context => {
  const host = bridgeHarness(context);
  for (const data of [null, 'init', 42, {}, { protocol, type: 'init', channel: 123 }, { protocol: 'other', type: 'init', channel: 'a' }]) {
    host.send(data);
  }
  host.send({ protocol, type: 'init', channel: 'a' }, {});
  host.send({ protocol, type: 'pause', channel: 'a' });
  host.bridge.reportScore(10);
  assert.deepEqual(host.messages, []);
  assert.equal(host.calls.pause, 0);

  host.send({ protocol, type: 'init', channel: 'a' });
  assert.deepEqual(host.messages, [{
    payload: { protocol, type: 'ready', channel: 'a' },
    origin: '*',
  }]);
});

test('pause and resume require the parent and the current protocol/channel', context => {
  const host = bridgeHarness(context);
  host.send({ protocol, type: 'init', channel: 'a' });
  host.send({ protocol, type: 'pause', channel: 'a' }, {});
  host.send({ protocol: 'other', type: 'pause', channel: 'a' });
  host.send({ protocol, type: 'resume', channel: 'wrong' });
  host.send({ protocol, type: 'pause' });
  assert.deepEqual(host.calls, { pause: 0, resume: 0 });

  host.send({ protocol, type: 'pause', channel: 'a' });
  host.send({ protocol, type: 'resume', channel: 'a' });
  assert.deepEqual(host.calls, { pause: 1, resume: 1 });
  host.send({ protocol, type: 'init', channel: 'b' });
  host.send({ protocol, type: 'pause', channel: 'a' });
  assert.equal(host.calls.pause, 1, 'reinitialization revokes the previous channel');
  host.send({ protocol, type: 'pause', channel: 'b' });
  assert.equal(host.calls.pause, 2);
});

test('score reports are non-negative integers with the active channel and survive parent teardown', context => {
  const host = bridgeHarness(context);
  host.send({ protocol, type: 'init', channel: 'round' });
  host.messages.length = 0;
  for (const value of [-1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) host.bridge.reportScore(value);
  assert.deepEqual(host.messages, []);
  host.bridge.reportScore(120);
  assert.deepEqual(host.messages, [{
    payload: { protocol, type: 'score', channel: 'round', score: 120 },
    origin: '*',
  }]);
  host.closeParent();
  assert.doesNotThrow(() => host.bridge.reportScore(130));
  assert.doesNotThrow(() => host.send({ protocol, type: 'init', channel: 'next' }));
});

test('standalone play does not post to itself or accept self-issued host commands', context => {
  const host = bridgeHarness(context, true);
  host.send({ protocol, type: 'init', channel: 'self' }, host.mockWindow);
  host.send({ protocol, type: 'pause', channel: 'self' }, host.mockWindow);
  assert.doesNotThrow(() => host.bridge.reportScore(20));
  assert.deepEqual(host.messages, []);
  assert.deepEqual(host.calls, { pause: 0, resume: 0 });
});

test('an opaque-origin SecurityError preserves a usable in-memory best score', context => {
  browserWindow(context, {
    get localStorage() { throw new DOMException('Opaque origin', 'SecurityError'); },
  });
  const best = new BestScore();
  assert.equal(best.available, false);
  assert.equal(best.value, 0);
  assert.equal(best.record(20), true);
  assert.equal(best.record(10), false);
  assert.equal(best.record(20), false);
  assert.equal(best.value, 20);
});

for (const errorName of ['SecurityError', 'QuotaExceededError']) {
  test(`a storage write ${errorName} keeps the latest best and stops further writes`, context => {
    let attempts = 0;
    browserWindow(context, {
      localStorage: {
        getItem() { return '30'; },
        setItem() {
          attempts += 1;
          throw new DOMException('Storage denied', errorName);
        },
      },
    });
    const best = new BestScore();
    assert.equal(best.value, 30);
    assert.equal(best.available, true);
    assert.equal(best.record(40), true);
    assert.equal(best.available, false);
    assert.equal(best.value, 40);
    assert.equal(best.record(50), true);
    assert.equal(best.value, 50);
    assert.equal(attempts, 1);
  });
}

test('storage ignores corrupt values and persists only a new integer best score', context => {
  let stored: string | null = null;
  const writes: [string, string][] = [];
  browserWindow(context, {
    localStorage: {
      getItem() { return stored; },
      setItem(key: string, value: string) { writes.push([key, value]); },
    },
  });
  for (const value of [null, '', '-1', '4.5', 'NaN', '{}', String(Number.MAX_SAFE_INTEGER + 1)]) {
    stored = value;
    assert.equal(new BestScore().value, 0);
  }
  stored = '40';
  const best = new BestScore();
  assert.equal(best.value, 40);
  for (const value of [0, 20, 40, -1, 2.5, Number.NaN, Infinity]) assert.equal(best.record(value), false);
  assert.deepEqual(writes, []);
  assert.equal(best.record(50), true);
  assert.deepEqual(writes, [['lily-hop.best.v1', '50']]);
});
