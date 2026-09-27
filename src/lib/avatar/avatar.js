/**
 * Avatar = calibrated body model + its mesh. The one entry point the 3D view,
 * the drape and (next) the cloth solver use.
 */
import { createBodyModel } from './body.js';
import { polygonize, meshTopology } from './mesher.js';
import { bodyMeasurementsFor } from '../body/dims.js';

export { tapeGirth } from './body.js';
export { meshTopology };

/**
 * @param measurements  mm, as in useMeasurements
 * @param bodyType      'male_adult' | 'female_adult' | 'male_child' | 'female_child'
 * @param opts.spacing  mesh grid spacing in mm (12 = default, 14 = fast preview)
 * @returns { model, mesh: { positions, indices }, topology, attempts, ms }
 */
export function createAvatar(measurements, bodyType = 'male_adult', { spacing = 12 } = {}) {
  const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
  const m = bodyMeasurementsFor(measurements, bodyType);
  const model = createBodyModel(m, bodyType);
  // Surface nets can, in rare grid alignments, join two quads along one edge
  // (a non-manifold edge — seen only at wrists). The shape is fine; the grid
  // sampling is unlucky. Check every mesh and, if needed, rebuild on a grid
  // shifted by a fraction of a cell.
  const OFFSETS = [[0, 0, 0], [0.37, 0.29, 0.41], [0.61, 0.13, 0.77], [0.19, 0.53, 0.23], [0.83, 0.71, 0.47]];
  let mesh = null, topology = null, attempts = 0;
  for (const [ox, oy, oz] of OFFSETS) {
    attempts++;
    const b = {
      min: [model.bounds.min[0] - ox * spacing, model.bounds.min[1] - oy * spacing, model.bounds.min[2] - oz * spacing],
      max: model.bounds.max,
    };
    const candidate = polygonize(model.sdf, b, spacing, { snapSteps: 2 });
    const topo = meshTopology(candidate.indices);
    if (!mesh || topo.nonManifold + topo.boundary < topology.nonManifold + topology.boundary) { mesh = candidate; topology = topo; }
    if (topo.nonManifold === 0 && topo.boundary === 0 && topo.degenerate === 0) break;
  }
  const ms = (typeof performance !== 'undefined' ? performance : Date).now() - t0;
  return { model, mesh, topology, attempts, ms };
}

/**
 * The body as the drape engine needs it: landmark dims plus the collision
 * field (distance, outward normal) and the crotch point.
 */
export function bodyForDrape(model) {
  return {
    ...model.dims, sdf: model.sdf, normal: model.normal, crotchPoint: model.crotchPoint,
    torsoSection: model.torsoSection, legSection: model.legSection,
  };
}

/** Build the calibrated body model only (no mesh) — fast, for the drape. */
export function createAvatarModel(measurements, bodyType = 'male_adult') {
  return createBodyModel(bodyMeasurementsFor(measurements, bodyType), bodyType);
}

/**
 * Mesh data ready for rendering (plain typed arrays — transferable from a
 * worker): positions, per-vertex normals taken from the SDF gradient (smooth
 * shading without faceting), triangle indices.
 */
export function avatarMeshData(measurements, bodyType = 'male_adult', { spacing = 12 } = {}) {
  const av = createAvatar(measurements, bodyType, { spacing });
  const P = av.mesh.positions;
  const N = new Float32Array(P.length);
  for (let i = 0; i < P.length; i += 3) {
    const n = av.model.normal(P[i], P[i + 1], P[i + 2]);
    N[i] = n[0]; N[i + 1] = n[1]; N[i + 2] = n[2];
  }
  return { positions: P, normals: N, indices: av.mesh.indices, ms: av.ms, topology: av.topology };
}
