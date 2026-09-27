import { withReload } from '../../../src/client/withReload';
import { ErrorCode, LlmRunError } from '../../../src/errors';
import type { RuntimeAdapter } from '../../../src/runtimes/types';

const throwing = (afterTokens: string[], error: unknown): RuntimeAdapter => ({
  async *chatStream() { yield* afterTokens; throw error; }, unload: async () => undefined });
const failing = (afterTokens: string[]): RuntimeAdapter => throwing(afterTokens, new Error('GPUDeviceLost'));
const healthy: RuntimeAdapter = { async *chatStream() { yield 'ok'; }, unload: async () => undefined };
const drain = async (it: AsyncIterable<string>): Promise<string[]> => { const o: string[] = []; for await (const x of it) o.push(x); return o; };

it('crash before any token → reload and retry transparently', async () => {
  const load = jest.fn(async () => healthy);
  await expect(drain(withReload(load, failing([])).chatStream([]))).resolves.toEqual(['ok']);
  expect(load).toHaveBeenCalledTimes(1);
});
it('crash after tokens → reload, then E_GPU_LOST for this request (no duplicated text)', async () => {
  const load = jest.fn(async () => healthy);
  await expect(drain(withReload(load, failing(['par'])).chatStream([]))).rejects.toMatchObject({ code: 'E_GPU_LOST' });
  expect(load).toHaveBeenCalledTimes(1);
});
it('the next request after a reload runs on the reloaded runtime', async () => {
  const load = jest.fn(async () => healthy);
  const a = withReload(load, failing(['par']));
  await expect(drain(a.chatStream([]))).rejects.toMatchObject({ code: 'E_GPU_LOST' });
  await expect(drain(a.chatStream([]))).resolves.toEqual(['ok']);
  expect(load).toHaveBeenCalledTimes(1);
});
it('an AbortError is rethrown as-is, with no reload', async () => {
  const load = jest.fn(async () => healthy);
  const abort = new DOMException('stopped', 'AbortError');
  await expect(drain(withReload(load, throwing([], abort)).chatStream([]))).rejects.toBe(abort);
  expect(load).not.toHaveBeenCalled();
});
it('an LlmRunError is rethrown as-is, with no reload', async () => {
  const load = jest.fn(async () => healthy);
  const err = new LlmRunError(ErrorCode.Network, 'x');
  await expect(drain(withReload(load, throwing([], err)).chatStream([]))).rejects.toBe(err);
  expect(load).not.toHaveBeenCalled();
});
it('a caller-aborted signal is never treated as GPU loss', async () => {
  const load = jest.fn(async () => healthy);
  const c = new AbortController();
  c.abort();
  await expect(drain(withReload(load, failing([])).chatStream([], { signal: c.signal }))).rejects.toThrow('GPUDeviceLost');
  expect(load).not.toHaveBeenCalled();
});
