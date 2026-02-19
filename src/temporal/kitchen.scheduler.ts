import { WorkflowClient } from '@temporalio/client';
import { env } from '../config/env';
import { getTemporalConnection } from '../lib/temporal';

type KitchenPrepScheduleInput = {
  bookingId: string;
  prepAtIso: string;
};

// Trigger kitchen-prep workflow in Temporal; failures are logged by caller as non-fatal.
export async function scheduleKitchenPrepWorkflow(
  input: KitchenPrepScheduleInput,
): Promise<void> {
  if (!env.TEMPORAL_KITCHEN_WORKFLOW_ENABLED) {
    return;
  }

  const connection = await getTemporalConnection();
  const client = new WorkflowClient({
    connection,
    namespace: env.TEMPORAL_NAMESPACE,
  });

  await client.start('kitchenPrepWorkflow', {
    taskQueue: env.TEMPORAL_TASK_QUEUE,
    workflowId: `kitchen-prep-${input.bookingId}`,
    args: [input],
  });
}
