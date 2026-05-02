/**
 * RingBuffer — fixed-capacity circular in-memory queue.
 * Handles bursts up to 10,000 signals/sec without crashing
 * if the persistence layer is slow (backpressure mitigation).
 */
class RingBuffer {
  constructor(capacity = 50000) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
    this.head = 0;   // next write position
    this.tail = 0;   // next read position
    this.size = 0;
    this.droppedCount = 0;
  }

  push(item) {
    if (this.size === this.capacity) {
      // Overwrite oldest item (drop it) — shed load gracefully
      this.tail = (this.tail + 1) % this.capacity;
      this.droppedCount++;
    } else {
      this.size++;
    }
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
  }

  pop() {
    if (this.size === 0) return null;
    const item = this.buffer[this.tail];
    this.buffer[this.tail] = undefined; // GC help
    this.tail = (this.tail + 1) % this.capacity;
    this.size--;
    return item;
  }

  drain(maxItems = 500) {
    const items = [];
    while (items.length < maxItems && this.size > 0) {
      items.push(this.pop());
    }
    return items;
  }

  get isEmpty() {
    return this.size === 0;
  }

  get isFull() {
    return this.size === this.capacity;
  }

  stats() {
    return {
      size: this.size,
      capacity: this.capacity,
      dropped: this.droppedCount,
      utilization: ((this.size / this.capacity) * 100).toFixed(1) + '%',
    };
  }
}

module.exports = RingBuffer;
