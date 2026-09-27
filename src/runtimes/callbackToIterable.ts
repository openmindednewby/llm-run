/** Optional teardown, run once if the consumer stops early (break / throw in for-await). */
export type Cleanup = () => void;
type Start<T> = (push: (v: T) => void, end: () => void, fail: (e: unknown) => void) => Cleanup | void;

/** Bridges a push/end/fail callback API into an AsyncIterable (values buffered in order). */
export function callbackToIterable<T>(start: Start<T>): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      const queue: T[] = [];
      let done = false;
      let error: unknown = null;
      let wake: (() => void) | null = null;
      const notify = (): void => {
        wake?.();
        wake = null;
      };
      let cleanup: Cleanup | null = null;
      const stop = (): void => {
        done = true;
        const c = cleanup;
        cleanup = null;
        c?.();
      };
      const returned = start(
        (v) => {
          queue.push(v);
          notify();
        },
        () => {
          done = true;
          notify();
        },
        (e) => {
          error = e ?? new Error('failed');
          notify();
        },
      );
      cleanup = returned ?? null;
      return {
        async next(): Promise<IteratorResult<T>> {
          for (;;) {
            if (queue.length > 0) {
              return { value: queue.shift() as T, done: false };
            }
            if (error !== null) {
              throw error;
            }
            if (done) {
              return { value: undefined, done: true };
            }
            await new Promise<void>((r) => {
              wake = r;
            });
          }
        },
        return(): Promise<IteratorResult<T>> {
          stop();
          return Promise.resolve({ value: undefined, done: true });
        },
        throw(e?: unknown): Promise<IteratorResult<T>> {
          stop();
          return Promise.reject(e);
        },
      };
    },
  };
}
