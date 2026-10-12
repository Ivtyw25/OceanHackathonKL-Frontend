// Main-thread wrapper around the simulation worker.

import type { SimInput, SimOutput, SimSetup } from './model';
import type { WorkerRequest, WorkerResponse } from './worker';

export class SimClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (o: SimOutput) => void; reject: (e: Error) => void; onProgress?: (p: number) => void }
  >();

  constructor(setup: SimSetup) {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      const job = this.pending.get(msg.id);
      if (!job) return;
      if (msg.type === 'progress') job.onProgress?.(msg.progress);
      else if (msg.type === 'result') {
        this.pending.delete(msg.id);
        job.resolve(msg.output);
      } else {
        this.pending.delete(msg.id);
        job.reject(new Error(msg.message));
      }
    };
    this.post({ type: 'init', setup });
  }

  private post(msg: WorkerRequest) {
    this.worker.postMessage(msg);
  }

  run(input: SimInput, onProgress?: (p: number) => void): Promise<SimOutput> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      this.post({ type: 'run', id, input });
    });
  }
}
