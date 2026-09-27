/**
 * Main-thread side of the avatar mesh worker.
 *
 * requestAvatarMesh() resolves with { positions, normals, indices, ms }.
 * The worker is inlined into the bundle (works offline, in the PWA and in the
 * single-file build). If workers are unavailable the mesh is built on the
 * main thread instead — slower, same result.
 */
import { avatarMeshData } from './avatar.js';
import AvatarWorker from './avatar.worker.js?worker&inline';

let worker = null, workerBroken = false, nextId = 1;
const pending = new Map();

function getWorker() {
  if (worker || workerBroken) return worker;
  try {
    worker = new AvatarWorker();
    worker.onmessage = (e) => {
      const job = pending.get(e.data.id);
      if (!job) return;
      pending.delete(e.data.id);
      if (e.data.error) job.fallback(); else job.resolve(e.data);
    };
    worker.onerror = () => {
      workerBroken = true;
      worker = null;
      for (const job of pending.values()) job.fallback();
      pending.clear();
    };
  } catch {
    workerBroken = true;
    worker = null;
  }
  return worker;
}

export function requestAvatarMesh(measurements, bodyType, spacing = 12) {
  return new Promise((resolve) => {
    const sync = () => resolve(avatarMeshData(measurements, bodyType, { spacing }));
    const w = getWorker();
    if (!w) { sync(); return; }
    const id = nextId++;
    pending.set(id, { resolve, fallback: sync });
    w.postMessage({ id, measurements, bodyType, spacing });
  });
}
