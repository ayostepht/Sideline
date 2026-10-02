/**
 * Placeholder for root scripts whose real implementation lands in a later task.
 * Usage: tsx scripts/not-implemented.ts <TASK_ID> [script-name]
 * Exit code 2 is the "not implemented" signal the gate script reports as SKIPPED.
 */
const taskId = process.argv[2] ?? "unknown task";
const name = process.argv[3] ?? "this script";

console.error(`${name}: not implemented until ${taskId}`);
process.exit(2);
