/** Test helper (not shipped code paths): an in-memory BroadcastChannel for the presenter link. */
import type { ChannelFactory, ChannelLike } from './channel';

/** An in-memory BroadcastChannel: a message reaches every other channel of the same name, asynchronously. */
export function memoryChannels() {
  const all = new Set<ChannelLike & { name: string }>();
  const sent: Array<{ name: string; data: unknown }> = [];
  const factory: ChannelFactory = (name) => {
    const ch: ChannelLike & { name: string } = {
      name,
      onmessage: null,
      postMessage(data) {
        sent.push({ name, data: JSON.parse(JSON.stringify(data)) });
        for (const other of all) if (other !== ch && other.name === name) queueMicrotask(() => other.onmessage?.({ data: JSON.parse(JSON.stringify(data)) } as MessageEvent));
      },
      close() {
        all.delete(ch);
      },
    };
    all.add(ch);
    return ch;
  };
  return { factory, sent, open: () => all.size };
}

