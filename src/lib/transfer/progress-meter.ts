/**
 * Throughput and ETA from real byte counts, averaged over a sliding window so
 * the numbers stay steady without lagging far behind reality.
 */
export class ProgressMeter {
  private samples: Array<{ at: number; bytes: number }> = [];
  private startedAt: number | null = null;

  constructor(
    private readonly windowMs = 4_000,
    private readonly minElapsedForEtaMs = 1_500,
  ) {}

  record(bytes: number, at: number): void {
    if (this.startedAt === null) this.startedAt = at;
    const last = this.samples[this.samples.length - 1];
    if (last && last.at === at) last.bytes = bytes;
    else this.samples.push({ at, bytes });
    const cutoff = at - this.windowMs;
    while (this.samples.length > 2 && this.samples[1].at <= cutoff) this.samples.shift();
  }

  bytesPerSecond(now: number): number {
    if (this.samples.length < 2) return 0;
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    // Include idle time since the last sample so a stall shows as slowing down.
    const span = Math.max(now, last.at) - first.at;
    if (span <= 0) return 0;
    return ((last.bytes - first.bytes) * 1000) / span;
  }

  etaSeconds(totalBytes: number, now: number): number | null {
    if (this.startedAt === null || now - this.startedAt < this.minElapsedForEtaMs) return null;
    const rate = this.bytesPerSecond(now);
    const done = this.samples[this.samples.length - 1]?.bytes ?? 0;
    if (rate <= 0) return null;
    return Math.max(0, (totalBytes - done) / rate);
  }

  reset(): void {
    this.samples = [];
    this.startedAt = null;
  }
}
