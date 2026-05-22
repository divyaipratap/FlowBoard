/**
 * Offline queue with exponential backoff for RelayTransport.
 *
 * Buffers outbound messages while disconnected and replays them on reconnect.
 * Backoff caps at 30 seconds per the RelayTransport contract.
 */

import type { Envelope } from "../index.js";

export interface QueuedMessage {
  envelope: Envelope;
  queuedAt: number;
}

const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 30_000;
const BACKOFF_FACTOR = 2;
const JITTER_FACTOR = 0.3;

/**
 * Compute the next backoff delay with jitter.
 */
export function computeBackoff(attempt: number): number {
  const exponential = Math.min(BACKOFF_BASE_MS * BACKOFF_FACTOR ** attempt, BACKOFF_MAX_MS);
  const jitter = exponential * JITTER_FACTOR * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(exponential + jitter));
}

/**
 * A simple FIFO queue for envelopes that couldn't be sent while offline.
 * Capped at a configurable max size to prevent unbounded memory growth.
 */
export class OfflineQueue {
  private readonly queue: QueuedMessage[] = [];
  private readonly maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  enqueue(envelope: Envelope): void {
    if (this.queue.length >= this.maxSize) {
      // Drop oldest message to make room (best-effort delivery).
      this.queue.shift();
    }
    this.queue.push({ envelope, queuedAt: Date.now() });
  }

  /**
   * Drain all queued messages in FIFO order.
   * Returns the envelopes and clears the queue.
   */
  drain(): Envelope[] {
    const envelopes = this.queue.map((m) => m.envelope);
    this.queue.length = 0;
    return envelopes;
  }

  get count(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue.length = 0;
  }
}
