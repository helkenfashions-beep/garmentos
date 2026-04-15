import { useState } from 'react';

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

export function useMeasurements() {
  const [measurements, setMeasurements] = useState(DEFAULT_MEASUREMENTS);

  function updateMeasurement(key, valueMm) {
    setMeasurements(m => ({ ...m, [key]: valueMm }));
  }

  return { measurements, updateMeasurement };
}
