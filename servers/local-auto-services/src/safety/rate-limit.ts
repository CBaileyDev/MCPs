type RateLimiterOptions = {
  minimumDelayMs: number;
  now?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
};

export class SequentialRateLimiter {
  private readonly minimumDelayMs: number;
  private readonly now: () => number;
  private readonly sleep: (delayMs: number) => Promise<void>;
  private lastRunAt: number | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: RateLimiterOptions) {
    this.minimumDelayMs = options.minimumDelayMs;
    this.now = options.now ?? Date.now;
    this.sleep =
      options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  }

  run<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.queue.then(async () => {
      if (this.lastRunAt !== undefined) {
        const elapsed = this.now() - this.lastRunAt;
        const delayMs = Math.max(0, this.minimumDelayMs - elapsed);
        if (delayMs > 0) {
          await this.sleep(delayMs);
        }
      }
      this.lastRunAt = this.now();
      return operation();
    });

    this.queue = pending.catch(() => undefined);
    return pending;
  }
}
