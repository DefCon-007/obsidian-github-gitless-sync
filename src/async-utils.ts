/**
 * Retries an async function until its return value satisfies a condition or
 * the maximum number of retries is reached. Thrown errors are treated as
 * transient until the retry budget is exhausted.
 */
export async function retryUntil<T>(
  fn: () => Promise<T>,
  condition: (result: T) => boolean,
  maxRetries: number = 5,
  initialDelay: number = 1000,
  backoffFactor: number = 2,
): Promise<T> {
  let retries = 0;
  let delay = initialDelay;

  while (true) {
    try {
      const result = await fn();

      if (condition(result) || retries >= maxRetries) {
        return result;
      }
    } catch (error) {
      if (retries >= maxRetries) {
        throw error;
      }
    }

    retries++;
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay *= backoffFactor;
  }
}

/**
 * Maps a collection without allowing it to create an unbounded number of
 * simultaneous file or network operations. Mobile vault adapters are
 * especially sensitive to large bursts of bridge calls.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("Concurrency must be a positive integer");
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index], index);
      }
    },
  );

  await Promise.all(workers);
  return results;
}
