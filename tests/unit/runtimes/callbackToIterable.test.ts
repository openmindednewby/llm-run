import { callbackToIterable } from '../../../src/runtimes/callbackToIterable';
it('yields pushed values in order and ends', async () => {
  const it = callbackToIterable<string>((push, end) => { push('a'); setTimeout(() => { push('b'); end(); }, 0); });
  const out: string[] = []; for await (const v of it) out.push(v);
  expect(out).toEqual(['a', 'b']);
});
it('rethrows a failure', async () => {
  const it = callbackToIterable<string>((_p, _e, fail) => fail(new Error('boom')));
  await expect((async () => { for await (const _ of it) { /* drain */ } })()).rejects.toThrow('boom');
});
it('calls the cleanup once when the consumer breaks early', async () => {
  const cleanup = jest.fn();
  const it = callbackToIterable<string>((push) => { push('a'); push('b'); return cleanup; });
  for await (const v of it) { expect(v).toBe('a'); break; }
  expect(cleanup).toHaveBeenCalledTimes(1);
});
