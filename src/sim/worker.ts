// Runs the bloom ensemble off the main thread.

import { BloomModel, type SimInput, type SimOutput, type SimSetup } from './model';

export type WorkerRequest = { type: 'init'; setup: SimSetup } | { type: 'run'; id: number; input: SimInput };

export type WorkerResponse =
  | { type: 'progress'; id: number; progress: number }
  | { type: 'result'; id: number; output: SimOutput }
  | { type: 'error'; id: number; message: string };

const ctx = self as unknown as Worker;
let model: BloomModel | null = null;

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === 'init') {
    model = new BloomModel(msg.setup);
    return;
  }
  const post = (r: WorkerResponse, transfer: Transferable[] = []) => ctx.postMessage(r, transfer);
  if (!model) {
    post({ type: 'error', id: msg.id, message: 'Simulation was not initialised.' });
    return;
  }
  try {
    const output = model.run(msg.input, (progress) => post({ type: 'progress', id: msg.id, progress }));
    post({ type: 'result', id: msg.id, output }, [
      output.conc.buffer,
      output.prob.buffer,
      output.farmSeries.buffer,
      output.sensorSeries.buffer,
    ]);
  } catch (err) {
    post({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) });
  }
};
