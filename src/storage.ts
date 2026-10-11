/** Best score is the only persisted value. Opaque sandbox origins deny storage. */
export class BestScore {
  value = 0;
  available = true;
  private readonly key = 'lily-hop.best.v1';

  constructor() {
    try {
      const stored = window.localStorage.getItem(this.key);
      if (stored !== null && /^\d+$/.test(stored)) {
        const value = Number(stored);
        if (Number.isSafeInteger(value) && value >= 0) this.value = value;
      }
    } catch {
      // Includes SecurityError in an opaque-origin iframe and disabled storage.
      this.available = false;
    }
  }

  record(score: number): boolean {
    if (!Number.isSafeInteger(score) || score <= this.value) return false;
    this.value = score;
    if (this.available) {
      try {
        window.localStorage.setItem(this.key, String(score));
      } catch {
        // QuotaExceededError, SecurityError, or a changed browser privacy policy.
        this.available = false;
      }
    }
    return true;
  }
}
