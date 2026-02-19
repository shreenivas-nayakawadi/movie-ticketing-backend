import { env } from '../config/env';
import { expireActiveHoldsBatch } from '../modules/holds/holds.service';

let timer: NodeJS.Timeout | null = null;
let running = false;

// Run one cleanup iteration; guarded so overlapping intervals do not run in parallel.
async function runHoldExpiryCycle(): Promise<void> {
  if (running) {
    return;
  }

  running = true;
  try {
    const expiredCount = await expireActiveHoldsBatch();
    if (expiredCount > 0) {
      console.log(`[worker] expired ${expiredCount} hold(s)`);
    }
  } catch (error) {
    console.error('[worker] hold expiry cycle failed', error);
  } finally {
    running = false;
  }
}

// Start periodic hold-expiry processing and trigger one immediate cycle.
export function startHoldExpiryWorker(): void {
  if (timer) {
    return;
  }

  timer = setInterval(() => {
    void runHoldExpiryCycle();
  }, env.HOLD_CLEANUP_INTERVAL_MS);

  void runHoldExpiryCycle();
  console.log(
    `[worker] hold expiry worker started with interval=${env.HOLD_CLEANUP_INTERVAL_MS}ms`,
  );
}

// Stop periodic hold-expiry processing (used on graceful shutdown).
export function stopHoldExpiryWorker(): void {
  if (!timer) {
    return;
  }

  clearInterval(timer);
  timer = null;
  console.log('[worker] hold expiry worker stopped');
}
