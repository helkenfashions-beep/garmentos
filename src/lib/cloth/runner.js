/**
 * Runs a cloth simulation frame by frame without blocking: one frame per tick,
 * yielding between ticks so a Stop (or a new edit) is heard immediately.
 * Shared by the worker (cloth.worker.js) and the main-thread fallback
 * (clothClient.js) so both behave identically.
 */
import { buildCloth, createClothSim } from './pbd.js';

export const RUN_DEFAULTS = {
  maxFrames: 240,        // 4 s of simulated time at most
  minFrames: 20,         // never stop before the rest-length ramp has finished
  settleMove: 1.0,       // mm — "settled" when nothing moves more than this per frame…
  settleFrames: 6,       // …for this many frames in a row
};

/**
 * @param job {
 *   instances, body, options,              // what to simulate
 *   maxFrames?, settleMove?, settleFrames?,
 *   onFrame(positions: Float32Array, info), // positions is a fresh copy (transferable)
 *   onDone(info),                           // info.reason: 'settled' | 'max-frames' | 'cancelled'
 *   schedule(fn),                           // how to yield (setTimeout 0)
 * }
 * @returns { cancel() }
 */
export function runClothSimulation(job) {
  const r = { ...RUN_DEFAULTS, ...job };
  const cloth = buildCloth(r.instances, r.options);
  const sim = createClothSim(cloth, r.body, r.options);
  let cancelled = false, still = 0;
  const t0 = now();

  const finish = (reason) => r.onDone({ reason, ...sim.stats(), ms: now() - t0, offsets: cloth.offsets });

  function tick() {
    if (cancelled) { finish('cancelled'); return; }
    const f0 = now();
    sim.step();
    const move = sim.lastFrameMove();
    still = move < r.settleMove ? still + 1 : 0;
    r.onFrame(Float32Array.from(sim.positions), { frame: sim.frame, move, frameMs: now() - f0, offsets: cloth.offsets });
    if (sim.frame >= r.minFrames && still >= r.settleFrames) { finish('settled'); return; }
    if (sim.frame >= r.maxFrames) { finish('max-frames'); return; }
    r.schedule(tick);
  }
  r.schedule(tick);
  return { cancel() { cancelled = true; }, sim, cloth };
}

function now() { return (typeof performance !== 'undefined' ? performance : Date).now(); }
