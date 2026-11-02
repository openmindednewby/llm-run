import { compileKeywords, firstKeywordHit } from './keywordMatch';
import type { ExampleVector } from './prepareExamples';
import { closestExample, prepareExamples } from './prepareExamples';
import type { EmbeddingRuntime, FallbackReason as FallbackReasonValue, IntentMatch, IntentMatcher, IntentMatcherOptions, LoadOptions, LoadResult } from './types';
import { FallbackReason, LoadFailure, LoadPhase, MatchSource } from './types';
import { encodeVector } from './vectors';
import { DeadlineExceeded, withDeadline } from './withDeadline';
import { loadWllamaRuntime } from './wllamaRuntime';

export const DEFAULT_LOAD_DEADLINE_MS = 90_000;
export const DEFAULT_QUERY_DEADLINE_MS = 8_000;

const READY: LoadResult = { ok: true };

interface KeywordEntry<Id extends string> {
  id: Id;
  keywordsWin: boolean;
  patterns: readonly RegExp[];
}

const disposeQuietly = async (runtime: EmbeddingRuntime): Promise<void> => {
  try {
    await runtime.dispose?.();
  } catch {
    return;
  }
};

const failureMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

class Matcher<Id extends string> implements IntentMatcher<Id> {
  private readonly keywordEntries: readonly KeywordEntry<Id>[];
  private generation = 0;
  private runtime: EmbeddingRuntime | null = null;
  private examples: readonly ExampleVector<Id>[] | null = null;
  private pending: Promise<LoadResult> | null = null;

  constructor(private readonly options: IntentMatcherOptions<Id>) {
    this.keywordEntries = options.intents
      .filter((intent) => intent.negative !== true)
      .map((intent) => ({ id: intent.id, keywordsWin: intent.keywordsWin === true, patterns: compileKeywords(intent.keywords) }));
  }

  readonly matchKeywords = (text: string): IntentMatch<Id> => this.keywordResult(text, null, null);

  readonly isReady = (): boolean => this.examples !== null;

  readonly loadOnDemand = (options: LoadOptions = {}): Promise<LoadResult> => {
    if (this.examples !== null) {
      return Promise.resolve(READY);
    }
    if (this.pending !== null) {
      return this.pending;
    }
    this.generation += 1;
    const tracked: Promise<LoadResult> = this.runLoad(this.generation, options).then((result) => {
      if (this.pending === tracked) {
        this.pending = null;
      }
      return result;
    });
    this.pending = tracked;
    return tracked;
  };

  readonly match = async (text: string): Promise<IntentMatch<Id>> => {
    if (text.trim() === '') {
      return { id: null, source: MatchSource.None, score: null, fallback: null };
    }
    const winner = firstKeywordHit(text, this.keywordEntries.filter((entry) => entry.keywordsWin));
    if (winner !== null) {
      return { id: winner.id, source: MatchSource.Keyword, score: null, fallback: null };
    }
    if (this.runtime === null || this.examples === null) {
      return this.keywordResult(text, FallbackReason.NotLoaded, null);
    }
    return this.embeddingResult(text, this.runtime, this.examples);
  };

  readonly packVectors = (): Partial<Record<Id, Record<string, string>>> => {
    const table: Partial<Record<Id, Record<string, string>>> = {};
    for (const example of this.examples ?? []) {
      table[example.intentId] = { ...table[example.intentId], [example.text]: encodeVector(example.vector) };
    }
    return table;
  };

  readonly unload = async (): Promise<void> => {
    const runtime = this.runtime;
    this.generation += 1;
    this.pending = null;
    this.runtime = null;
    this.examples = null;
    if (runtime !== null) {
      await disposeQuietly(runtime);
    }
  };

  private keywordResult(text: string, fallback: FallbackReasonValue | null, score: number | null): IntentMatch<Id> {
    const hit = firstKeywordHit(text, this.keywordEntries);
    return { id: hit?.id ?? null, source: hit === null ? MatchSource.None : MatchSource.Keyword, score, fallback };
  }

  private async embeddingResult(text: string, runtime: EmbeddingRuntime, examples: readonly ExampleVector<Id>[]): Promise<IntentMatch<Id>> {
    let query: ArrayLike<number>;
    try {
      query = await withDeadline(runtime.embed(text), this.options.queryDeadlineMs ?? DEFAULT_QUERY_DEADLINE_MS);
    } catch (error) {
      return this.keywordResult(text, error instanceof DeadlineExceeded ? FallbackReason.Deadline : FallbackReason.Error, null);
    }
    const closest = closestExample(query, examples);
    if (closest === null || closest.score < this.options.threshold) {
      return this.keywordResult(text, FallbackReason.BelowThreshold, closest?.score ?? null);
    }
    return { id: closest.example.negative ? null : closest.example.intentId, source: MatchSource.Embedding, score: closest.score, fallback: null };
  }

  private async runLoad(run: number, options: LoadOptions): Promise<LoadResult> {
    try {
      await withDeadline(this.prepare(run, options), options.deadlineMs ?? DEFAULT_LOAD_DEADLINE_MS);
      return READY;
    } catch (error) {
      if (run === this.generation) {
        this.generation += 1;
      }
      return { ok: false, reason: error instanceof DeadlineExceeded ? LoadFailure.Deadline : LoadFailure.Error, message: failureMessage(error) };
    }
  }

  private async prepare(run: number, options: LoadOptions): Promise<void> {
    const isCurrent = (): boolean => run === this.generation;
    const report: NonNullable<LoadOptions['onProgress']> = (progress) => {
      if (isCurrent()) {
        options.onProgress?.(progress);
      }
    };
    const load = this.options.loadRuntime ?? loadWllamaRuntime;
    const runtime = await load({ model: this.options.model, onProgress: (progress) => report({ phase: LoadPhase.Download, ...progress }) });
    try {
      const examples = await prepareExamples(this.options.intents, runtime, { isCurrent, report });
      this.runtime = runtime;
      this.examples = examples;
    } catch (error) {
      await disposeQuietly(runtime);
      throw error;
    }
  }
}

/** A matcher that answers from keywords at once and from an on-device embedding model after `loadOnDemand`; every failure falls back to keywords. */
export function createIntentMatcher<Id extends string = string>(options: IntentMatcherOptions<Id>): IntentMatcher<Id> {
  return new Matcher(options);
}
