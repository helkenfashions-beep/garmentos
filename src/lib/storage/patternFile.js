/**
 * Pattern files and on-device autosave.
 *
 * File format (.garmentos.json):
 *   { format: 'garmentos-pattern', version: 1, savedAt, name,
 *     measurements: {...mm}, bodyType, pattern: { points, segments, pieces } }
 *
 * Everything stays on the device — nothing is uploaded anywhere.
 */

export const FORMAT = 'garmentos-pattern';
export const VERSION = 1;
const AUTOSAVE_KEY = 'garmentos.autosave.v1';

export function serializePattern({ pattern, measurements, bodyType, name }) {
  return JSON.stringify({
    format: FORMAT,
    version: VERSION,
    savedAt: new Date().toISOString(),
    name: name || 'Untitled pattern',
    measurements,
    bodyType,
    pattern: {
      points: pattern?.points ?? {},
      segments: pattern?.segments ?? {},
      pieces: pattern?.pieces ?? {},
    },
  });
}

/** Parse and validate a pattern file. Throws a readable Error on bad input. */
export function parsePattern(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('This file is not a GarmentOS pattern (not valid JSON).'); }
  if (!data || data.format !== FORMAT) throw new Error('This file is not a GarmentOS pattern.');
  if (typeof data.version !== 'number' || data.version > VERSION) {
    throw new Error('This pattern was saved by a newer version of GarmentOS.');
  }
  const p = data.pattern || {};
  const points = p.points && typeof p.points === 'object' ? p.points : {};
  const segments = p.segments && typeof p.segments === 'object' ? p.segments : {};
  for (const pt of Object.values(points)) {
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y) || typeof pt.id !== 'string') {
      throw new Error('Pattern file is damaged (bad point).');
    }
  }
  // Drop segments that reference missing points rather than failing the whole file
  const cleanSegs = {};
  for (const [id, s] of Object.entries(segments)) {
    if (s && points[s.p1] && points[s.p2]) cleanSegs[id] = s;
  }
  return {
    name: data.name || 'Untitled pattern',
    measurements: data.measurements && typeof data.measurements === 'object' ? data.measurements : null,
    bodyType: typeof data.bodyType === 'string' ? data.bodyType : null,
    pattern: { points, segments: cleanSegs, pieces: p.pieces && typeof p.pieces === 'object' ? p.pieces : {} },
  };
}

export function fileNameFor(name) {
  const base = (name || 'pattern').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pattern';
  return `${base}.garmentos.json`;
}

export function downloadPattern(state) {
  const blob = new Blob([serializePattern(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileNameFor(state.name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function readPatternFile(file) {
  return file.text().then(parsePattern);
}

// ── Autosave (browser storage can be unavailable — never let it break the app)

export function autosave(state) {
  try { localStorage.setItem(AUTOSAVE_KEY, serializePattern(state)); return true; } catch { return false; }
}

export function loadAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? parsePattern(raw) : null;
  } catch { return null; }
}

export function clearAutosave() {
  try { localStorage.removeItem(AUTOSAVE_KEY); } catch { /* ignore */ }
}
