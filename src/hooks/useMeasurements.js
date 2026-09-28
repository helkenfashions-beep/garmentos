import { useState, useCallback } from 'react';

// European standard defaults (ISO 8559 / Aldrich size 40)
// All values in mm — matches canvas coordinate system
export const DEFAULT_MEASUREMENTS = {
  height:          1780,
  chest:           1000,
  waist:            840,
  hip:             1000,
  seat:            1020,
  shoulderWidth:    460,
  bodyRise:         290,
  // Extended measurements (used in body construction)
  neckGirth:        380,
  upperThighGirth:  580,
  kneeGirth:        400,
  calfGirth:        370,
  bicepGirth:       330,
  wristGirth:       170,
  // Lengths left out on purpose — each follows from height until measured:
  //   inseam (crotch → floor)        measured: fixes the waist height
  //   backWaistLength (nape → waist) measured: sets the torso length
  //   sleeveLength (shoulder → wrist)
};

/**
 * Bring saved measurements up to date: `upperArmGirth` is now `bicepGirth`.
 * (Old files and autosaves still open with their own value.)
 */
export function normalizeMeasurements(m) {
  const out = { ...(m || {}) };
  if (out.bicepGirth == null && out.upperArmGirth != null) out.bicepGirth = out.upperArmGirth;
  delete out.upperArmGirth;
  // Older versions stored fixed defaults for these two lengths (they were
  // never used then). Now a stored length is a measurement, so the untouched
  // old defaults go back to automatic.
  if (out.backWaistLength === 440) delete out.backWaistLength;
  if (out.sleeveLength === 650) delete out.sleeveLength;
  return out;
}

export function useMeasurements(initial = null) {
  const [measurements, setMeasurements] = useState(() => ({ ...DEFAULT_MEASUREMENTS, ...normalizeMeasurements(initial) }));

  /** Set one measurement (mm). `undefined` clears it back to automatic. */
  const updateMeasurement = useCallback((key, valueMm) => {
    setMeasurements(m => {
      const next = { ...m };
      if (valueMm == null) delete next[key]; else next[key] = valueMm;
      return next;
    });
  }, []);

  /** Replace every measurement at once (opening a saved pattern). */
  const replaceMeasurements = useCallback((next) => {
    setMeasurements({ ...DEFAULT_MEASUREMENTS, ...normalizeMeasurements(next) });
  }, []);

  return { measurements, updateMeasurement, replaceMeasurements };
}
