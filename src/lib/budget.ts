/** Deadline helpers: one absolute timestamp (epoch ms) is shared by every step of a request. */

export function deadlineFrom(startMs: number, budgetMs: number): number {
  return startMs + budgetMs;
}

export function remainingMs(deadline: number, now: number = Date.now()): number {
  return deadline - now;
}
