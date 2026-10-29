import { createClient } from '../../../src/client/createClient';
import type { RuntimeAdapter } from '../../../src/runtimes/types';
import type { GenerateOptions } from '../../../src/types';

function capturingAdapter(seen: { opts?: GenerateOptions }): RuntimeAdapter {
  return {
    chatStream(_messages, opts) {
      seen.opts = opts;
      return { [Symbol.asyncIterator]: () => ({ next: () => Promise.resolve({ value: undefined, done: true as const }) }) };
    },
    unload: () => Promise.resolve(),
  };
}

describe('chat.completions.create', () => {
  it('with a grammar, forwards it to the adapter options', async () => {
    const seen: { opts?: GenerateOptions } = {};
    const client = createClient(capturingAdapter(seen), 'm');

    await client.chat.completions.create({ messages: [], grammar: 'root ::= "a"' });

    expect(seen.opts?.grammar).toBe('root ::= "a"');
  });
});
