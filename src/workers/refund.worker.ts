import { env } from '../config/env';
import { processRefundJobsBatch } from '../modules/refunds/refund-processor.service';

let timer: NodeJS.Timeout | null = null;
let running = false;

// Execute one refund processing cycle; avoid parallel overlapping runs.
async function runRefundCycle(): Promise<void> {
  if (running) {
    return;
  }

  running = true;
  try {
    const processedCount = await processRefundJobsBatch();
    if (processedCount > 0) {
      console.log(`[worker] processed ${processedCount} refund job(s)`);
    }
  } catch (error) {
    console.error('[worker] refund cycle failed', error);
  } finally {
    running = false;
  }
}

// Start periodic refund processing and fire one immediate cycle.
export function startRefundWorker(): void {
  if (timer) {
    return;
  }

  timer = setInterval(() => {
    void runRefundCycle();
  }, env.REFUND_POLL_INTERVAL_MS);

  void runRefundCycle();
  console.log(`[worker] refund worker started with interval=${env.REFUND_POLL_INTERVAL_MS}ms`);
}

// Stop periodic refund processing during graceful shutdown.
export function stopRefundWorker(): void {
  if (!timer) {
    return;
  }

  clearInterval(timer);
  timer = null;
  console.log('[worker] refund worker stopped');
}
