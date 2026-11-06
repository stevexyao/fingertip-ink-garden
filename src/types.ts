export type FlowerType = 'peony' | 'lotus' | 'plum' | 'chrysanthemum' | 'orchid';

export const FLOWERS: { type: FlowerType; name: string; note: string; color: string }[] = [
  { type: 'peony', name: '牡丹', note: '一庭春色', color: '#a95260' },
  { type: 'lotus', name: '荷花', note: '清风徐来', color: '#cc8d94' },
  { type: 'plum', name: '梅花', note: '暗香疏影', color: '#b94238' },
  { type: 'chrysanthemum', name: '菊花', note: '秋意入墨', color: '#b88b35' },
  { type: 'orchid', name: '兰花', note: '幽兰生谷', color: '#7b7991' },
];

export interface Landmark { x: number; y: number; z: number }
export type Handedness = 'Left' | 'Right' | 'Unknown';

export interface HandObservation {
  landmarks: Landmark[];
  worldLandmarks?: Landmark[];
  handedness: Handedness;
  confidence: number;
  imageAspect?: number;
}

export interface FlowerState {
  id: string;
  x: number;
  y: number;
  openness: number;
  flower: FlowerType;
  opacity: number;
  phase: number;
  /** Per-hand relative size, in 0.65–1.8; absent means 1. */
  scale?: number;
  /** Mirrored in-plane rotation in radians; absent means 0. */
  rotation?: number;
  /** Smoothed movement intensity, in 0–1; absent means 0. */
  motion?: number;
}

export interface TrackedHand extends FlowerState {
  handedness: Handedness;
  landmarks: Landmark[];
  lastSeen: number;
  switchedAt: number;
}
