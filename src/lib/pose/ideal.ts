// Reference "ideal" angle ranges for an intermediate→pro swing (degrees).
// Down-the-line view assumed. These are heuristic targets used to flag deviation.

export interface Range { min: number; max: number; weight: number; }

export const IDEAL = {
  spineTiltAddress: { min: 25, max: 40, weight: 1 } as Range,
  spineTiltDrift: { min: 0, max: 10, weight: 1.5 } as Range, // max allowed change through swing
  shoulderTurn: { min: 85, max: 105, weight: 1.5 } as Range,
  hipTurn: { min: 40, max: 55, weight: 1.2 } as Range,
  xFactor: { min: 35, max: 55, weight: 1.3 } as Range,
  leadArmStraightness: { min: 160, max: 180, weight: 1.2 } as Range, // 180 = straight
  wristHinge: { min: 75, max: 100, weight: 1 } as Range,
  headLateral: { min: 0, max: 4, weight: 1.3 } as Range, // % body height
  headVertical: { min: 0, max: 4, weight: 1.2 } as Range,
  tempoRatio: { min: 2.6, max: 3.4, weight: 1 } as Range, // backswing:downswing
};

export const WEIGHTS = {
  posture: 0.20,
  rotation: 0.25,
  plane: 0.25,
  tempo: 0.15,
  balance: 0.15,
};
