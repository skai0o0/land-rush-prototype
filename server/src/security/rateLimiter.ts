export interface RateLimitResult {
  allowed: boolean;
  disconnect: boolean;
  reason?: string;
}

export interface RateLimiterOptions {
  capacity?: number;
  refillRate?: number;
  sensitiveCooldownMs?: number;
  maxViolations?: number;
}

interface ClientBucket {
  tokens: number;
  lastRefill: number;
  violations: number;
  lastSensitiveTimes: Map<string, number>;
}

export class RateLimiter {
  private capacity: number;
  private refillRate: number; // Tokens added per second
  private sensitiveCooldownMs: number; // Minimum ms between sensitive actions
  private maxViolations: number;
  private clients = new Map<string, ClientBucket>();

  private sensitiveMessages = new Set<string>([
    "rollUniStop",
    "roll_unistop",
    "openChest",
    "open_chest",
    "guessLandmark",
    "guess_landmark"
  ]);

  constructor(options?: RateLimiterOptions) {
    this.capacity = options?.capacity ?? 40;
    this.refillRate = options?.refillRate ?? 20;
    this.sensitiveCooldownMs = options?.sensitiveCooldownMs ?? 1000;
    this.maxViolations = options?.maxViolations ?? 5;
  }

  public isSensitive(messageType: string): boolean {
    return this.sensitiveMessages.has(messageType);
  }

  private getBucket(sessionId: string, now: number): ClientBucket {
    let bucket = this.clients.get(sessionId);
    if (!bucket) {
      bucket = {
        tokens: this.capacity,
        lastRefill: now,
        violations: 0,
        lastSensitiveTimes: new Map<string, number>()
      };
      this.clients.set(sessionId, bucket);
    }
    return bucket;
  }

  /**
   * Check if a message from sessionId is allowed.
   * Consumes a token and checks sensitive message cooldowns.
   */
  public check(sessionId: string, messageType: string, now: number = Date.now()): RateLimitResult {
    const bucket = this.getBucket(sessionId, now);

    // 1. Refill tokens based on elapsed time
    const elapsedSec = Math.max(0, (now - bucket.lastRefill) / 1000);
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSec * this.refillRate);
    bucket.lastRefill = now;

    // 2. Check global token bucket
    if (bucket.tokens < 1) {
      bucket.violations++;
      const shouldDisconnect = bucket.violations >= this.maxViolations;
      return {
        allowed: false,
        disconnect: shouldDisconnect,
        reason: shouldDisconnect
          ? `Spam detected: ${bucket.violations} violations (excessive message rate)`
          : `Tốc độ gửi lệnh quá nhanh (${bucket.violations}/${this.maxViolations})`
      };
    }
    bucket.tokens -= 1;

    // 3. Check sensitive action cooldown
    if (this.sensitiveMessages.has(messageType)) {
      const lastTime = bucket.lastSensitiveTimes.get(messageType) || 0;
      if (now - lastTime < this.sensitiveCooldownMs) {
        bucket.violations++;
        const shouldDisconnect = bucket.violations >= this.maxViolations;
        return {
          allowed: false,
          disconnect: shouldDisconnect,
          reason: shouldDisconnect
            ? `Spam detected: ${bucket.violations} violations (spamming sensitive action '${messageType}')`
            : `Hành động nhạy cảm '${messageType}' cần chờ ${Math.ceil((this.sensitiveCooldownMs - (now - lastTime)) / 1000)}s`
        };
      }
      bucket.lastSensitiveTimes.set(messageType, now);
    }

    return { allowed: true, disconnect: false };
  }

  /**
   * Clean up rate limiter memory for a disconnected client.
   */
  public removeClient(sessionId: string): void {
    this.clients.delete(sessionId);
  }

  /**
   * Reset rate limiter state for a specific client or all clients.
   */
  public reset(sessionId?: string): void {
    if (sessionId) {
      this.clients.delete(sessionId);
    } else {
      this.clients.clear();
    }
  }

  /**
   * Get current violation count for a client (useful for diagnostics & tests).
   */
  public getViolations(sessionId: string): number {
    return this.clients.get(sessionId)?.violations ?? 0;
  }
}
