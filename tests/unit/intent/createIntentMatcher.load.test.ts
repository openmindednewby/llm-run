import { createIntentMatcher } from '../../../src/intent/createIntentMatcher';
import { LoadFailure, LoadPhase } from '../../../src/intent/types';
import type { EmbeddingRuntime, RuntimeRequest } from '../../../src/intent/types';
import { encodeVector } from '../../../src/intent/vectors';

const runtime = (overrides: Partial<EmbeddingRuntime> = {}): EmbeddingRuntime => ({
  embed: () => Promise.resolve([1, 0]),
  ...overrides,
});
const intents = [{ id: 'shop', examples: ['open a shop', 'buy things'] }];

afterEach(() => {
  jest.useRealTimers();
});

describe('loadOnDemand', () => {
  it('with no call to it, never loads the model', () => {
    const loadRuntime = jest.fn(() => Promise.resolve(runtime()));

    const matcher = createIntentMatcher({ intents, threshold: 0.5, model: 'm.gguf', loadRuntime });

    expect([loadRuntime.mock.calls.length, matcher.isReady()]).toEqual([0, false]);
  });

  it('with a working runtime, passes the model on and reports ready', async () => {
    const loadRuntime = jest.fn((_request: RuntimeRequest) => Promise.resolve(runtime()));
    const matcher = createIntentMatcher({ intents, threshold: 0.5, model: 'https://x/m.gguf', loadRuntime });

    const result = await matcher.loadOnDemand();

    expect([result, loadRuntime.mock.calls[0][0].model, matcher.isReady()]).toEqual([{ ok: true }, 'https://x/m.gguf', true]);
  });

  it('with two calls, loads once', async () => {
    const loadRuntime = jest.fn(() => Promise.resolve(runtime()));
    const matcher = createIntentMatcher({ intents, threshold: 0.5, model: 'm.gguf', loadRuntime });

    await Promise.all([matcher.loadOnDemand(), matcher.loadOnDemand()]);
    await matcher.loadOnDemand();

    expect(loadRuntime).toHaveBeenCalledTimes(1);
  });

  it('with a download and embedded examples, reports both phases', async () => {
    const seen: [string, number, number][] = [];
    const loadRuntime = (request: RuntimeRequest) => {
      request.onProgress({ loaded: 5, total: 10 });
      return Promise.resolve(runtime());
    };
    const matcher = createIntentMatcher({ intents, threshold: 0.5, model: 'm.gguf', loadRuntime });

    await matcher.loadOnDemand({ onProgress: (p) => seen.push([p.phase, p.loaded, p.total]) });

    expect(seen).toEqual([
      [LoadPhase.Download, 5, 10],
      [LoadPhase.Prepare, 1, 2],
      [LoadPhase.Prepare, 2, 2],
    ]);
  });

  it('with a runtime that fails, resolves not ok and keeps keywords working', async () => {
    const matcher = createIntentMatcher({ intents: [{ id: 'shop', keywords: ['store'] }], threshold: 0.5, model: 'm.gguf', loadRuntime: () => Promise.reject(new Error('no wasm')) });

    const result = await matcher.loadOnDemand();

    expect(result).toEqual({ ok: false, reason: LoadFailure.Error, message: 'no wasm' });
    expect(matcher.isReady()).toBe(false);
    expect(matcher.matchKeywords('store').id).toBe('shop');
  });

  it('after a failed load, a second call loads again', async () => {
    const loadRuntime = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(runtime());
    const matcher = createIntentMatcher({ intents, threshold: 0.5, model: 'm.gguf', loadRuntime });

    await matcher.loadOnDemand();
    const second = await matcher.loadOnDemand();

    expect(second).toEqual({ ok: true });
  });

  it('with a download past the deadline, resolves deadline and stays not ready', async () => {
    jest.useFakeTimers();
    const matcher = createIntentMatcher({ intents, threshold: 0.5, model: 'm.gguf', loadRuntime: () => new Promise<EmbeddingRuntime>(() => undefined) });

    const pending = matcher.loadOnDemand({ deadlineMs: 1000 });
    await jest.advanceTimersByTimeAsync(1000);
    const result = await pending;

    expect((result as { reason: string }).reason).toBe(LoadFailure.Deadline);
    expect(matcher.isReady()).toBe(false);
  });

  it('with a runtime arriving after the deadline, disposes it and stays not ready', async () => {
    jest.useFakeTimers();
    const dispose = jest.fn(() => Promise.resolve());
    let arrive: (rt: EmbeddingRuntime) => void = () => undefined;
    const late = new Promise<EmbeddingRuntime>((resolve) => {
      arrive = resolve;
    });
    const matcher = createIntentMatcher({ intents, threshold: 0.5, model: 'm.gguf', loadRuntime: () => late });
    const pending = matcher.loadOnDemand({ deadlineMs: 1000 });
    await jest.advanceTimersByTimeAsync(1000);
    await pending;

    arrive(runtime({ dispose }));
    await jest.advanceTimersByTimeAsync(0);

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(matcher.isReady()).toBe(false);
  });

  it('with progress arriving after the deadline, does not report it', async () => {
    jest.useFakeTimers();
    const seen: number[] = [];
    const requests: RuntimeRequest[] = [];
    const loadRuntime = (request: RuntimeRequest) => {
      requests.push(request);
      return new Promise<EmbeddingRuntime>(() => undefined);
    };
    const matcher = createIntentMatcher({ intents, threshold: 0.5, model: 'm.gguf', loadRuntime });
    const pending = matcher.loadOnDemand({ deadlineMs: 1000, onProgress: (p) => seen.push(p.loaded) });
    await jest.advanceTimersByTimeAsync(1000);
    await pending;

    requests[0].onProgress({ loaded: 9, total: 10 });

    expect(seen).toEqual([]);
  });

  it('with an example embed failing, disposes the runtime and resolves error', async () => {
    const dispose = jest.fn(() => Promise.resolve());
    const embed = () => Promise.reject(new Error('oom'));
    const matcher = createIntentMatcher({ intents, threshold: 0.5, model: 'm.gguf', loadRuntime: () => Promise.resolve(runtime({ embed, dispose })) });

    const result = await matcher.loadOnDemand();

    expect(result).toEqual({ ok: false, reason: LoadFailure.Error, message: 'oom' });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('with packed vectors for every example, never embeds an example', async () => {
    const embed = jest.fn(() => Promise.resolve([1, 0]));
    const packed = { 'open a shop': encodeVector([1, 0]), 'buy things': encodeVector([0, 1]) };
    const matcher = createIntentMatcher({ intents: [{ ...intents[0], vectors: packed }], threshold: 0.5, model: 'm.gguf', loadRuntime: () => Promise.resolve(runtime({ embed })) });

    await matcher.loadOnDemand();

    expect(embed).not.toHaveBeenCalled();
  });

  it('with a corrupt packed vector, embeds only that example', async () => {
    const embed = jest.fn((_text: string) => Promise.resolve([1, 0]));
    const packed = { 'open a shop': encodeVector([1, 0]), 'buy things': '@@bad@@' };
    const matcher = createIntentMatcher({ intents: [{ ...intents[0], vectors: packed }], threshold: 0.5, model: 'm.gguf', loadRuntime: () => Promise.resolve(runtime({ embed })) });

    await matcher.loadOnDemand();

    expect(embed.mock.calls.map((c) => c[0])).toEqual(['buy things']);
  });
});

describe('packVectors', () => {
  it('after a load, returns a table a second matcher loads without embedding', async () => {
    const first = createIntentMatcher({ intents, threshold: 0.5, model: 'm.gguf', loadRuntime: () => Promise.resolve(runtime()) });
    await first.loadOnDemand();
    const table = first.packVectors();
    const embed = jest.fn(() => Promise.resolve([1, 0]));
    const second = createIntentMatcher({ intents: [{ ...intents[0], vectors: table.shop }], threshold: 0.5, model: 'm.gguf', loadRuntime: () => Promise.resolve(runtime({ embed })) });

    await second.loadOnDemand();

    expect(embed).not.toHaveBeenCalled();
  });

  it('before a load, returns an empty table', () => {
    const matcher = createIntentMatcher({ intents, threshold: 0.5, model: 'm.gguf' });

    const table = matcher.packVectors();

    expect(table).toEqual({});
  });
});

describe('unload', () => {
  it('with a loaded runtime, disposes it and goes back to keywords', async () => {
    const dispose = jest.fn(() => Promise.resolve());
    const matcher = createIntentMatcher({ intents, threshold: 0.5, model: 'm.gguf', loadRuntime: () => Promise.resolve(runtime({ dispose })) });
    await matcher.loadOnDemand();

    await matcher.unload();

    expect([dispose.mock.calls.length, matcher.isReady()]).toEqual([1, false]);
  });

  it('with a load in flight, a fresh load is not cancelled by the old one ending', async () => {
    let arriveOld: (rt: EmbeddingRuntime) => void = () => undefined;
    const old = new Promise<EmbeddingRuntime>((resolve) => {
      arriveOld = resolve;
    });
    const loadRuntime = jest.fn().mockReturnValueOnce(old).mockResolvedValueOnce(runtime());
    const matcher = createIntentMatcher({ intents, threshold: 0.5, model: 'm.gguf', loadRuntime });
    const stale = matcher.loadOnDemand();
    await matcher.unload();
    const fresh = matcher.loadOnDemand();

    arriveOld(runtime());
    const results = await Promise.all([stale, fresh]);

    expect((results[0] as { ok: boolean }).ok).toBe(false);
    expect(results[1]).toEqual({ ok: true });
    expect(matcher.isReady()).toBe(true);
  });
});
