import { createClient } from '../../../src/client/createClient';
import type { RuntimeAdapter } from '../../../src/runtimes/types';
import type { GenerateOptions } from '../../../src/types';

function trackingAdapter(): { adapter: RuntimeAdapter; state: { returned: boolean; opts?: GenerateOptions; unloaded: boolean } } {
  const state: { returned: boolean; opts?: GenerateOptions; unloaded: boolean } = { returned: false, unloaded: false };
  const adapter: RuntimeAdapter = {
    chatStream(_messages, opts) {
      state.opts = opts;
      let i = 0;
      const iterator: AsyncIterator<string> = {
        next: () => Promise.resolve(i < 10 ? { value: `t${i++}`, done: false } : { value: undefined, done: true }),
        return: () => { state.returned = true; return Promise.resolve({ value: undefined, done: true }); },
      };
      return { [Symbol.asyncIterator]: () => iterator };
    },
    unload: () => { state.unloaded = true; return Promise.resolve(); },
  };
  return { adapter, state };
}

describe('createClient', () => {
  it('breaking out of a stream early calls the adapter iterator return()', async () => {
    const { adapter, state } = trackingAdapter();
    const stream = await createClient(adapter, 'm').chat.completions.create({ messages: [], stream: true });
    for await (const _c of stream) break;
    expect(state.returned).toBe(true);
  });

  it('maps OpenAI request fields onto adapter options', async () => {
    const { adapter, state } = trackingAdapter();
    const signal = new AbortController().signal;
    await createClient(adapter, 'm').chat.completions.create({ messages: [], max_tokens: 5, temperature: 0.2, signal });
    expect(state.opts).toEqual({ maxTokens: 5, temperature: 0.2, signal });
  });

  it('stream chunks share one id and created timestamp', async () => {
    const { adapter } = trackingAdapter();
    const chunks = [];
    for await (const c of await createClient(adapter, 'm').chat.completions.create({ messages: [], stream: true })) chunks.push(c);
    expect(new Set(chunks.map((c) => c.id)).size).toBe(1);
    expect(new Set(chunks.map((c) => c.created)).size).toBe(1);
    expect(chunks).toHaveLength(11);
  });

  it('unload delegates to the adapter', async () => {
    const { adapter, state } = trackingAdapter();
    await createClient(adapter, 'm').unload();
    expect(state.unloaded).toBe(true);
  });
});
