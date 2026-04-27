/**
 * Circular buffer for telemetry samples.
 * Fixed-capacity ring buffer with drain and slice-by-distance operations.
 */

import type { TelemetrySample } from './types';

export class CircularTelemetryBuffer {
  private buffer: TelemetrySample[];
  private writeIndex = 0;
  private count = 0;

  constructor(private readonly capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(sample: TelemetrySample): void {
    this.buffer[this.writeIndex] = sample;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  /**
   * Snapshot buffer contents in insertion order, then clear.
   */
  drain(): TelemetrySample[] {
    if (this.count === 0) return [];

    const result: TelemetrySample[] = new Array(this.count);
    const start =
      this.count < this.capacity
        ? 0
        : this.writeIndex; // oldest item index

    for (let i = 0; i < this.count; i++) {
      result[i] = this.buffer[(start + i) % this.capacity];
    }

    this.clear();
    return result;
  }

  /**
   * Extract a slice where lapDistPct is between [startPct, endPct).
   * Does NOT drain — caller reads from live buffer.
   */
  sliceByDistPct(startPct: number, endPct: number): TelemetrySample[] {
    const result: TelemetrySample[] = [];
    const readStart =
      this.count < this.capacity ? 0 : this.writeIndex;

    for (let i = 0; i < this.count; i++) {
      const sample = this.buffer[(readStart + i) % this.capacity];
      if (sample.lapDistPct >= startPct && sample.lapDistPct < endPct) {
        result.push(sample);
      }
    }
    return result;
  }

  clear(): void {
    this.writeIndex = 0;
    this.count = 0;
  }

  get size(): number {
    return this.count;
  }
}
