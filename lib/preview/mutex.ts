const tails = new Map<string, Promise<unknown>>();

/** Serialize async work per key (e.g. chatId). */
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  let result!: Promise<T>;
  const next = prev
    .catch(() => undefined)
    .then(() => {
      result = fn();
      return result;
    });
  tails.set(
    key,
    next.finally(() => {
      if (tails.get(key) === next) tails.delete(key);
    }),
  );
  await next;
  return result;
}
