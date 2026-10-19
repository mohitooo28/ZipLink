/**
 * Minimal external store for useSyncExternalStore. Snapshots are immutable;
 * frequent updates (progress) can be coalesced with `scheduleEmit`.
 */
export class ObservableStore<T> {
  private listeners = new Set<() => void>();
  private emitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    protected snapshot: T,
    private readonly throttleMs = 120,
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): T => this.snapshot;

  protected update(patch: Partial<T>, immediate = true): void {
    this.snapshot = { ...this.snapshot, ...patch };
    if (immediate) this.emit();
    else this.scheduleEmit();
  }

  protected emit(): void {
    if (this.emitTimer) clearTimeout(this.emitTimer);
    this.emitTimer = null;
    for (const listener of [...this.listeners]) listener();
  }

  private scheduleEmit(): void {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => this.emit(), this.throttleMs);
  }
}
