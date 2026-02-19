import { env } from '../config/env';
import { processNotificationOutboxBatch } from '../modules/events/outbox-dispatcher.service';

let timer: NodeJS.Timeout | null = null;
let running = false;

// Execute one outbox dispatch cycle; skip overlap when previous cycle is still running.
async function runOutboxCycle(): Promise<void> {
  if (running) {
    return;
  }

  running = true;
  try {
    const sentCount = await processNotificationOutboxBatch();
    if (sentCount > 0) {
      console.log(`[worker] outbox dispatched ${sentCount} notification(s)`);
    }
  } catch (error) {
    console.error('[worker] outbox cycle failed', error);
  } finally {
    running = false;
  }
}

// Start periodic outbox processing and run one immediate cycle.
export function startOutboxWorker(): void {
  if (timer) {
    return;
  }

  timer = setInterval(() => {
    void runOutboxCycle();
  }, env.OUTBOX_POLL_INTERVAL_MS);

  void runOutboxCycle();
  console.log(`[worker] outbox worker started with interval=${env.OUTBOX_POLL_INTERVAL_MS}ms`);
}

// Stop outbox polling on process shutdown.
export function stopOutboxWorker(): void {
  if (!timer) {
    return;
  }

  clearInterval(timer);
  timer = null;
  console.log('[worker] outbox worker stopped');
}
