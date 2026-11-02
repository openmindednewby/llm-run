import { createIntentMatcher } from '../../../src/intent/createIntentMatcher';
import { FallbackReason, MatchSource } from '../../../src/intent/types';
import type { EmbeddingRuntime } from '../../../src/intent/types';

const table: Record<string, number[]> = {
  'open a shop': [1, 0],
  'close the door': [0, 1],
  'tell me a joke': [-1, 0],
  'shops please': [0.8, 0.6],
  'anything joke like': [-1, 0.05],
};

const runtime = (overrides: Partial<EmbeddingRuntime> = {}): EmbeddingRuntime => ({
  embed: (text) => Promise.resolve(table[text] ?? [0, 0]),
  ...overrides,
});

const intents = [
  { id: 'shop', keywords: ['store'], examples: ['open a shop'] },
  { id: 'door', keywords: ['gate'], examples: ['close the door'] },
];

afterEach(() => {
  jest.useRealTimers();
});

describe('match', () => {
  it('before any load, returns the keyword hit and says why', async () => {
    const matcher = createIntentMatcher({ intents, threshold: 0.5, model: 'm.gguf', loadRuntime: () => Promise.resolve(runtime()) });

    const result = await matcher.match('the store');

    expect(result).toEqual({ id: 'shop', source: MatchSource.Keyword, score: null, fallback: FallbackReason.NotLoaded });
  });

  it('with a score above the threshold, returns the embedding match', async () => {
    const matcher = createIntentMatcher({ intents, threshold: 0.5, model: 'm.gguf', loadRuntime: () => Promise.resolve(runtime()) });
    await matcher.loadOnDemand();

    const result = await matcher.match('shops please');

    expect([result.id, result.source, result.fallback]).toEqual(['shop', MatchSource.Embedding, null]);
    expect(result.score).toBeCloseTo(0.8);
  });

  it('with a score exactly at the threshold, accepts the match', async () => {
    const matcher = createIntentMatcher({ intents, threshold: 1, model: 'm.gguf', loadRuntime: () => Promise.resolve(runtime()) });
    await matcher.loadOnDemand();

    const result = await matcher.match('open a shop');

    expect(result.id).toBe('shop');
  });

  it('with a score below the threshold and no keyword, returns no intent with the score', async () => {
    const matcher = createIntentMatcher({ intents, threshold: 0.99, model: 'm.gguf', loadRuntime: () => Promise.resolve(runtime()) });
    await matcher.loadOnDemand();

    const result = await matcher.match('shops please');

    expect([result.id, result.source, result.fallback]).toEqual([null, MatchSource.None, FallbackReason.BelowThreshold]);
    expect(result.score).toBeCloseTo(0.8);
  });

  it('with a score below the threshold and a keyword hit, returns the keyword intent', async () => {
    const matcher = createIntentMatcher({ intents, threshold: 0.99, model: 'm.gguf', loadRuntime: () => Promise.resolve(runtime()) });
    await matcher.loadOnDemand();

    const result = await matcher.match('gate');

    expect([result.id, result.source, result.fallback]).toEqual(['door', MatchSource.Keyword, FallbackReason.BelowThreshold]);
  });

  it('with a failing embed, falls back to keywords', async () => {
    const embed = (text: string) => (text in table ? Promise.resolve(table[text]) : Promise.reject(new Error('wasm died')));
    const matcher = createIntentMatcher({ intents, threshold: 0.5, model: 'm.gguf', loadRuntime: () => Promise.resolve(runtime({ embed })) });
    await matcher.loadOnDemand();

    const result = await matcher.match('the store');

    expect([result.id, result.source, result.fallback]).toEqual(['shop', MatchSource.Keyword, FallbackReason.Error]);
  });

  it('with an embed past the query deadline, falls back to keywords', async () => {
    jest.useFakeTimers();
    const embed = (text: string) => (text in table ? Promise.resolve(table[text]) : new Promise<number[]>(() => undefined));
    const matcher = createIntentMatcher({ intents, threshold: 0.5, model: 'm.gguf', queryDeadlineMs: 100, loadRuntime: () => Promise.resolve(runtime({ embed })) });
    await matcher.loadOnDemand();

    const pending = matcher.match('the store');
    await jest.advanceTimersByTimeAsync(100);
    const result = await pending;

    expect([result.id, result.source, result.fallback]).toEqual(['shop', MatchSource.Keyword, FallbackReason.Deadline]);
  });

  it('with the closest example on a negative intent, returns no intent', async () => {
    const withNegative = [...intents, { id: 'offtopic', negative: true, examples: ['tell me a joke'] }];
    const matcher = createIntentMatcher({ intents: withNegative, threshold: 0.5, model: 'm.gguf', loadRuntime: () => Promise.resolve(runtime()) });
    await matcher.loadOnDemand();

    const result = await matcher.match('anything joke like');

    expect([result.id, result.source, result.fallback]).toEqual([null, MatchSource.Embedding, null]);
  });

  it('with a keywordsWin hit, returns it without embedding the query', async () => {
    const embed = jest.fn((text: string) => Promise.resolve(table[text] ?? [0, 0]));
    const winning = [{ id: 'exit', keywords: ['quit'], keywordsWin: true, examples: ['open a shop'] }];
    const matcher = createIntentMatcher({ intents: winning, threshold: 0.5, model: 'm.gguf', loadRuntime: () => Promise.resolve(runtime({ embed })) });
    await matcher.loadOnDemand();
    embed.mockClear();

    const result = await matcher.match('quit now');

    expect([result.id, result.source, result.fallback]).toEqual(['exit', MatchSource.Keyword, null]);
    expect(embed).not.toHaveBeenCalled();
  });

  it('with blank text, returns no intent without embedding', async () => {
    const embed = jest.fn((text: string) => Promise.resolve(table[text] ?? [0, 0]));
    const matcher = createIntentMatcher({ intents, threshold: 0.5, model: 'm.gguf', loadRuntime: () => Promise.resolve(runtime({ embed })) });
    await matcher.loadOnDemand();
    embed.mockClear();

    const result = await matcher.match('   ');

    expect([result.id, result.source]).toEqual([null, MatchSource.None]);
    expect(embed).not.toHaveBeenCalled();
  });
});

describe('matchKeywords', () => {
  it('with a negative intent holding keywords, never returns it', () => {
    const matcher = createIntentMatcher({ intents: [{ id: 'offtopic', negative: true, keywords: ['joke'] }], threshold: 0.5, model: 'm.gguf' });

    const result = matcher.matchKeywords('a joke');

    expect([result.id, result.source]).toEqual([null, MatchSource.None]);
  });
});
