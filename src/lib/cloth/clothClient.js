/**
 * Main-thread side of the cloth solver worker (same pattern as
 * lib/avatar/meshClient.js).
 *
 *   const run = simulateCloth({ measurements, bodyType, instances, options,
 *                               onFrame, onDone });
 *   run.cancel();
 *
 * onFrame(positions, info) — positions: one Float32Array for all particles
 *   (instance k occupies info.offsets[k]… in particles); copy it into the
 *   geometry buffers. onDone(info) — info.reason 'settled' | 'max-frames' |
 *   'cancelled', plus solver stats.
 *
 * The worker is inlined into the bundle. If it can't start (or crashes), the
 * same runner runs on the main thread, one frame per tick.
 */
import { createAvatarModel } from '../avatar/avatar.js';
import { runClothSimulation } from './runner.js';
import ClothWorker from './cloth.worker.js?worker&inline';

let worker = null, workerBroken = false, nextId = 1;
const jobs = new Map();

function getWorker() {
  if (worker || workerBroken) return worker;
  try {
    worker = new ClothWorker();
    worker.onmessage = (e) => {
      const job = jobs.get(e.data.id);
      if (!job) return;
      if (e.data.type === 'frame') job.onFrame(e.data.positions, e.data.info);
      else if (e.data.type === 'done') { jobs.delete(e.data.id); job.onDone(e.data.info); }
      else if (e.data.type === 'error') { jobs.delete(e.data.id); job.fallback(); }
    };
    worker.onerror = () => {
      workerBroken = true;
      worker = null;
      const pending = [...jobs.values()];
      jobs.clear();
      for (const job of pending) job.fallback();
    };
  } catch {
    workerBroken = true;
    worker = null;
  }
  return worker;
}

/** Only what the solver needs, as plain data (drape instances carry functions). */
function plainInstances(instances) {
  return instances.map(i => ({
    key: i.key, sx: i.sx, waistY: i.waistY,
    positions: i.positions, patternXY: i.patternXY, sewnXY: i.sewnXY, indices: i.indices,
  }));
}

export function simulateCloth({ measurements, bodyType, instances, options = {}, run = {}, onFrame, onDone }) {
  const plain = plainInstances(instances);
  let local = null, cancelled = false, finished = false;
  let thread = 'worker';
  const done = (info) => { if (!finished) { finished = true; onDone({ ...info, thread }); } };

  const runLocally = () => {
    thread = 'main';
    if (cancelled) { done({ reason: 'cancelled' }); return; }
    local = runClothSimulation({
      ...run,
      instances: plain,
      body: createAvatarModel(measurements, bodyType),
      options,
      schedule: (fn) => setTimeout(fn, 0),
      onFrame: (p, info) => { if (!cancelled) onFrame(p, info); },
      onDone: done,
    });
  };

  const w = getWorker();
  const id = nextId++;
  if (!w) runLocally();
  else {
    jobs.set(id, {
      onFrame: (p, info) => { if (!cancelled) onFrame(p, info); },
      onDone: done,
      fallback: runLocally,
    });
    w.postMessage({ type: 'start', id, measurements, bodyType, instances: plain, options, run });
  }

  return {
    cancel() {
      if (cancelled || finished) return;
      cancelled = true;
      if (local) local.cancel();
      else if (w && jobs.has(id)) w.postMessage({ type: 'cancel', id });
    },
  };
}
