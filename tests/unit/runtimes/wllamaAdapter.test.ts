const loadModel = jest.fn().mockResolvedValue(undefined);
const createChatCompletion = jest.fn((req: { onData: (c: unknown) => void }) => {
  req.onData({ choices: [{ delta: { content: '{}' } }] });
  return Promise.resolve();
});

jest.mock('@wllama/wllama/esm/index.js', () => ({
  Wllama: jest.fn().mockImplementation(() => ({ loadModel, createChatCompletion, exit: jest.fn() })),
}));

import { loadWllama } from '../../../src/runtimes/wllamaAdapter';

async function drain(it: AsyncIterable<string>): Promise<string> {
  let out = '';
  for await (const piece of it) out += piece;
  return out;
}

describe('loadWllama', () => {
  beforeEach(() => {
    loadModel.mockClear();
    createChatCompletion.mockClear();
  });

  it('with nGpuLayers 0, loads the model with n_gpu_layers 0', async () => {
    const request = { files: [], contextLength: 512, nGpuLayers: 0 };

    await loadWllama(request);

    expect(loadModel).toHaveBeenCalledWith([], { n_ctx: 512, n_gpu_layers: 0 });
  });

  it('without nGpuLayers, leaves n_gpu_layers to wllama', async () => {
    const request = { files: [], contextLength: 512 };

    await loadWllama(request);

    expect(loadModel).toHaveBeenCalledWith([], { n_ctx: 512 });
  });

  it('with a grammar, passes it to the chat completion', async () => {
    const adapter = await loadWllama({ files: [], contextLength: 512 });
    const grammar = 'root ::= "{}"';

    await drain(adapter.chatStream([{ role: 'user', content: 'x' }], { grammar }));

    expect(createChatCompletion).toHaveBeenCalledWith(expect.objectContaining({ grammar: 'root ::= "{}"' }));
  });
});
