/**
 * Builds the avatar mesh off the main thread, so dragging a measurement
 * slider never freezes the 2D canvas or the orbit controls.
 */
import { avatarMeshData } from './avatar.js';

self.onmessage = (e) => {
  const { id, measurements, bodyType, spacing } = e.data;
  try {
    const d = avatarMeshData(measurements, bodyType, { spacing });
    self.postMessage({ id, ...d }, [d.positions.buffer, d.normals.buffer, d.indices.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message ?? err) });
  }
};
