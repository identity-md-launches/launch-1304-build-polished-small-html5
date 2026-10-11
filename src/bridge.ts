const PROTOCOL = 'pepe-game/1';

/** Optional, unprivileged launchpad messages. The parent is the only authority. */
export function connectBridge(handlers: { pause: () => void; resume: () => void }): {
  reportScore: (score: number) => void;
} {
  let channel: string | null = null;
  const parent = window.parent;
  const post = (payload: Record<string, unknown>) => {
    try {
      parent.postMessage({ protocol: PROTOCOL, channel, ...payload }, '*');
    } catch {
      // Standalone play and parent teardown must never interrupt the round.
    }
  };

  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (parent === window || event.source !== parent) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    const message = data as Record<string, unknown>;
    if (message.protocol !== PROTOCOL) return;
    if (message.type === 'init' && typeof message.channel === 'string') {
      channel = message.channel;
      post({ type: 'ready' });
      return;
    }
    if (channel === null || message.channel !== channel) return;
    if (message.type === 'pause') handlers.pause();
    if (message.type === 'resume') handlers.resume();
  });

  return {
    reportScore(score) {
      if (parent === window || channel === null || !Number.isSafeInteger(score) || score < 0) return;
      post({ type: 'score', score });
    },
  };
}
