/**
 * Cloth solver off the main thread. The avatar's distance field is a function,
 * so it can't be posted — the worker rebuilds the (cached) body model from the
 * measurements, which is the same deterministic calibration the main thread
 * runs, then streams positions back one frame at a time.
 *
 * in:  { type: 'start', id, measurements, bodyType, instances, options, run }
 *      { type: 'cancel', id }
 * out: { type: 'frame', id, positions (transferred), info }
 *      { type: 'done', id, info }
 *      { type: 'error', id, message }
 */
import { createAvatarModel } from '../avatar/avatar.js';
import { runClothSimulation } from './runner.js';

let bodyKey = null, bodyModel = null;
let current = null;   // { id, handle }

function bodyFor(measurements, bodyType) {
  const key = JSON.stringify([measurements, bodyType]);
  if (key !== bodyKey) { bodyModel = createAvatarModel(measurements, bodyType); bodyKey = key; }
  return bodyModel;
}

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'cancel') {
    if (current && current.id === msg.id) current.handle.cancel();
    return;
  }
  if (msg.type !== 'start') return;
  if (current) current.handle.cancel();          // one simulation at a time
  const id = msg.id;
  try {
    const body = bodyFor(msg.measurements, msg.bodyType);
    const handle = runClothSimulation({
      ...(msg.run ?? {}),
      instances: msg.instances,
      body,
      options: msg.options,
      schedule: (fn) => setTimeout(fn, 0),
      onFrame: (positions, info) => self.postMessage({ type: 'frame', id, positions, info }, [positions.buffer]),
      onDone: (info) => {
        if (current && current.id === id) current = null;
        self.postMessage({ type: 'done', id, info });
      },
    });
    current = { id, handle };
  } catch (err) {
    self.postMessage({ type: 'error', id, message: String(err?.message ?? err) });
  }
};
