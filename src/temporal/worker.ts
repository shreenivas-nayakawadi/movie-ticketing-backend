// Temporal worker entrypoint placeholder for Step 6.
// Use this file when introducing @temporalio/worker runtime in deployment environment.
export async function startTemporalWorker(): Promise<void> {
  console.log('[temporal-worker] placeholder started');
}

if (require.main === module) {
  startTemporalWorker().catch((error: unknown) => {
    console.error('[temporal-worker] failed to start', error);
    process.exit(1);
  });
}
