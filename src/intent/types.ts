export const MatchSource = { Keyword: 'keyword', Embedding: 'embedding', None: 'none' } as const;
export type MatchSource = (typeof MatchSource)[keyof typeof MatchSource];

export const FallbackReason = { NotLoaded: 'not-loaded', Deadline: 'deadline', Error: 'error', BelowThreshold: 'below-threshold' } as const;
export type FallbackReason = (typeof FallbackReason)[keyof typeof FallbackReason];

export const LoadFailure = { Deadline: 'deadline', Error: 'error' } as const;
export type LoadFailure = (typeof LoadFailure)[keyof typeof LoadFailure];

export const LoadPhase = { Download: 'download', Prepare: 'prepare' } as const;
export type LoadPhase = (typeof LoadPhase)[keyof typeof LoadPhase];

export type KeywordPattern = string | RegExp;

/** One thing a user can ask for. A string keyword matches whole words in any case; a RegExp runs on the raw text. */
export interface Intent<Id extends string = string> {
  id: Id;
  keywords?: readonly KeywordPattern[];
  examples?: readonly string[];
  /** Packed vectors keyed by example text, from `packVectors()` with the same model; a missing or corrupt one is embedded at load. */
  vectors?: Readonly<Record<string, string>>;
  /** A keyword hit on this intent returns at once, without embedding the query. */
  keywordsWin?: boolean;
  /** Off-topic examples: when one is the closest, the result is no intent. Its keywords are ignored. */
  negative?: boolean;
}

export interface IntentMatch<Id extends string = string> {
  id: Id | null;
  source: MatchSource;
  score: number | null;
  fallback: FallbackReason | null;
}

export interface DownloadProgress {
  loaded: number;
  total: number;
}

export interface LoadProgress extends DownloadProgress {
  phase: LoadPhase;
}

export interface LoadOptions {
  deadlineMs?: number;
  onProgress?: (progress: LoadProgress) => void;
}

export type LoadResult = { ok: true } | { ok: false; reason: LoadFailure; message: string };

export interface RuntimeRequest {
  model: string;
  onProgress: (progress: DownloadProgress) => void;
}

export interface EmbeddingRuntime {
  embed(text: string): Promise<ArrayLike<number>>;
  dispose?(): Promise<void>;
}

export type RuntimeLoader = (request: RuntimeRequest) => Promise<EmbeddingRuntime>;

export interface IntentMatcherOptions<Id extends string = string> {
  intents: readonly Intent<Id>[];
  threshold: number;
  model: string;
  queryDeadlineMs?: number;
  loadRuntime?: RuntimeLoader;
}

export interface IntentMatcher<Id extends string = string> {
  matchKeywords(text: string): IntentMatch<Id>;
  loadOnDemand(options?: LoadOptions): Promise<LoadResult>;
  match(text: string): Promise<IntentMatch<Id>>;
  isReady(): boolean;
  packVectors(): Partial<Record<Id, Record<string, string>>>;
  unload(): Promise<void>;
}
