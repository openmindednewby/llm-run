export class DeadlineExceeded extends Error {
  constructor(deadlineMs: number) {
    super(`did not finish within ${deadlineMs} ms`);
    this.name = 'DeadlineExceeded';
  }
}

/** Settle with the work, or reject with `DeadlineExceeded` when it takes longer; the work itself keeps running. */
export function withDeadline<T>(work: Promise<T>, deadlineMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DeadlineExceeded(deadlineMs)), deadlineMs);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
