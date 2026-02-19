type KitchenPrepWorkflowInput = {
  bookingId: string;
  prepAtIso: string;
};

// Placeholder workflow function name used by WorkflowClient.start.
// Actual Temporal execution can be implemented in dedicated worker runtime.
export async function kitchenPrepWorkflow(_input: KitchenPrepWorkflowInput): Promise<void> {
  return;
}
