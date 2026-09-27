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
  backWaistLength:  440,
  bodyRise:         290,
  // Extended measurements (used in body construction)
  neckGirth:        380,
  upperThighGirth:  580,
  kneeGirth:        400,
  calfGirth:        370,
  upperArmGirth:    330,
  wristGirth:       170,
  sleeveLength:     650,
};

export function useMeasurements(initial = null) {
  const [measurements, setMeasurements] = useState(() => ({ ...DEFAULT_MEASUREMENTS, ...(initial || {}) }));

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
    setMeasurements({ ...DEFAULT_MEASUREMENTS, ...(next || {}) });
  }, []);

  return { measurements, updateMeasurement, replaceMeasurements };
}
