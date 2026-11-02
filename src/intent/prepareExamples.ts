import type { EmbeddingRuntime, Intent, LoadProgress } from './types';
import { LoadPhase } from './types';
import { cosine, decodeVector } from './vectors';

export interface ExampleVector<Id extends string> {
  intentId: Id;
  negative: boolean;
  text: string;
  vector: ArrayLike<number>;
}

export interface ClosestExample<Id extends string> {
  example: ExampleVector<Id>;
  score: number;
}

interface PrepareContext {
  isCurrent(): boolean;
  report(progress: LoadProgress): void;
}

const packedVector = <Id extends string>(intent: Intent<Id>, text: string): Int8Array | null => {
  const packed = intent.vectors?.[text];
  return typeof packed === 'string' ? decodeVector(packed) : null;
};

const assertCurrent = (context: PrepareContext): void => {
  if (!context.isCurrent()) {
    throw new Error('the load was superseded');
  }
};

/** A vector per example: the packed one when usable, otherwise embedded one at a time, stopping once the load is no longer current. */
export async function prepareExamples<Id extends string>(intents: readonly Intent<Id>[], runtime: EmbeddingRuntime, context: PrepareContext): Promise<ExampleVector<Id>[]> {
  const entries = intents.flatMap((intent) => (intent.examples ?? []).map((text) => ({ intent, text, packed: packedVector(intent, text) })));
  const total = entries.filter((entry) => entry.packed === null).length;
  const prepared: ExampleVector<Id>[] = [];
  let embedded = 0;
  assertCurrent(context);
  for (const { intent, text, packed } of entries) {
    const vector = packed ?? (await runtime.embed(text));
    assertCurrent(context);
    if (packed === null) {
      embedded += 1;
      context.report({ phase: LoadPhase.Prepare, loaded: embedded, total });
    }
    prepared.push({ intentId: intent.id, negative: intent.negative === true, text, vector });
  }
  return prepared;
}

/** The example nearest the query; the first one listed wins a tie, and a NaN score never wins. */
export function closestExample<Id extends string>(query: ArrayLike<number>, examples: readonly ExampleVector<Id>[]): ClosestExample<Id> | null {
  let best: ClosestExample<Id> | null = null;
  for (const example of examples) {
    const score = cosine(query, example.vector);
    if (score > (best?.score ?? Number.NEGATIVE_INFINITY)) {
      best = { example, score };
    }
  }
  return best;
}
