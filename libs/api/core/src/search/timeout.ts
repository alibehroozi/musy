export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const timer = new Promise<never>((_, reject) => {
    const id = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
    // Allow the Node process to exit even if this timer is pending
    if (typeof id === "object" && "unref" in id) id.unref();
  });
  return Promise.race([promise, timer]);
}
