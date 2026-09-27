import { createClient } from '../../src/client/createClient';
import type { RuntimeAdapter } from '../../src/runtimes/types';

const adapter: RuntimeAdapter = {
  async *chatStream() { yield await Promise.resolve('Hel'); yield 'lo'; },
  unload: () => Promise.resolve(),
};

describe('AC-12 chat.completions.create({ stream:true }) output matches the OpenAI chat-completion chunk shape', () => {
  it('AC-12 streams chat.completion.chunk objects and ends with finish_reason stop', async () => {
    const client = createClient(adapter, 'org/m');
    const chunks = [];
    for await (const c of await client.chat.completions.create({ messages: [{ role: 'user', content: 'hi' }], stream: true })) {
      chunks.push(c);
    }
    expect(chunks[0]).toMatchObject({ object: 'chat.completion.chunk', model: 'org/m',
      choices: [{ index: 0, delta: { content: 'Hel' }, finish_reason: null }] });
    expect(typeof chunks[0]?.id).toBe('string');
    expect(typeof chunks[0]?.created).toBe('number');
    expect(chunks.at(-1)?.choices[0]?.finish_reason).toBe('stop');
  });

  it('AC-12 non-stream returns a chat.completion with the full text', async () => {
    const r = await createClient(adapter, 'org/m').chat.completions.create({ messages: [{ role: 'user', content: 'hi' }] });
    expect(r).toMatchObject({ object: 'chat.completion', model: 'org/m',
      choices: [{ index: 0, message: { role: 'assistant', content: 'Hello' }, finish_reason: 'stop' }] });
  });

  it('AC-12 chat("text") helper returns the reply string', async () => {
    await expect(createClient(adapter, 'org/m').chat('hi')).resolves.toBe('Hello');
  });
});
