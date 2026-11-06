import type { HandObservation, Landmark } from './types';

export interface HandPose { scale: number; rotation: number; motion: number }
interface PalmMetrics {
  x: number; y: number; angle: number; imageSize: number;
}
interface Calibration {
  startedAt: number; anchor: PalmMetrics; imageSizes: number[];
}
interface PoseState {
  value: HandPose;
  latestAt: number;
  sampleAt: number | null;
  previous?: PalmMetrics;
  previousOpenness: number;
  calibration?: Calibration;
  baseline?: { imageSize: number; angle: number };
}

const PALM = [0, 5, 9, 13, 17];
const BONES = [[0, 5], [0, 9], [0, 17], [5, 9], [9, 13], [13, 17], [5, 17]] as const;
const CALIBRATION_MS = 500;
const MAX_GAP_MS = 400;
const clamp = (value: number, low = 0, high = 1): number => Math.min(high, Math.max(low, value));
const shortAngle = (value: number): number => Math.atan2(Math.sin(value), Math.cos(value));
const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};
const validPoints = (points: Landmark[] | undefined): points is Landmark[] =>
  !!points && points.length >= 21 && points.slice(0, 21).every(point =>
    point && [point.x, point.y, point.z].every(Number.isFinite));

function facingCamera(points: Landmark[]): boolean {
  const origin = points[0]!, a = points[5]!, b = points[17]!;
  const ux = a.x - origin.x, uy = a.y - origin.y, uz = a.z - origin.z;
  const vx = b.x - origin.x, vy = b.y - origin.y, vz = b.z - origin.z;
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz);
  return length > 1e-8 && Math.abs(nz) / length >= .22;
}

function measure(source: HandObservation): PalmMetrics | undefined {
  if (!validPoints(source.landmarks) || !Number.isFinite(source.confidence) || source.confidence < .25) return;
  const aspect = Number.isFinite(source.imageAspect) && source.imageAspect! > 0 ? source.imageAspect! : 1;
  // All image dimensions use image-width units. Normalized z is relative to
  // the wrist and scaled like x; it is not an absolute camera distance.
  const image = source.landmarks.map(point => ({ x: point.x, y: point.y / aspect, z: point.z }));
  if (PALM.some(index => source.landmarks[index]!.x < -.05 || source.landmarks[index]!.x > 1.05 ||
      source.landmarks[index]!.y < -.05 || source.landmarks[index]!.y > 1.05)) return;
  const world = validPoints(source.worldLandmarks) ? source.worldLandmarks : undefined;
  if (!facingCamera(world ?? image)) return;

  const imageSizes: number[] = [];
  for (const [a, b] of BONES) {
    const p = image[a]!, q = image[b]!;
    imageSizes.push(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z));
  }
  // World hand dimensions can drift even during a pure image-plane rotation.
  // Keep them for pose-quality checks, while image-space palm bones (including
  // normalized relative z) supply a stable relative-distance measurement.
  const imageSize = median(imageSizes);
  const axisX = -(image[9]!.x - image[0]!.x), axisY = image[9]!.y - image[0]!.y;
  if (imageSize < .008 || imageSize > .6 || Math.hypot(axisX, axisY) < .012) return;
  const angle = Math.atan2(axisY, axisX) + Math.PI / 2;
  if (world) {
    const worldAxisX = -(world[9]!.x - world[0]!.x), worldAxisY = world[9]!.y - world[0]!.y;
    const worldAngle = Math.atan2(worldAxisY, worldAxisX) + Math.PI / 2;
    // A single projected landmark can jump while its 3D estimate stays put.
    // Keep the last pose when the two independent axes disagree strongly.
    if (Math.hypot(worldAxisX, worldAxisY) < .004 || Math.abs(shortAngle(angle - worldAngle)) > .65) return;
  }
  return {
    x: PALM.reduce((sum, index) => sum + 1 - image[index]!.x, 0) / PALM.length,
    y: PALM.reduce((sum, index) => sum + image[index]!.y, 0) / PALM.length,
    angle,
    imageSize,
  };
}

/** Per-ID pose state. Only captured recognition results advance calibration,
 * smoothing or movement; missing/ambiguous results preserve the visual pose.
 */
export class HandPoseTracker {
  private states = new Map<string, PoseState>();

  update(id: string, source: HandObservation, capturedAt: number, openness: number): HandPose {
    let state = this.states.get(id);
    if (!state) {
      state = { value: { scale: 1, rotation: 0, motion: 0 }, latestAt: -Infinity,
        sampleAt: null, previousOpenness: 0 };
      this.states.set(id, state);
    }
    if (!Number.isFinite(capturedAt) || capturedAt <= state.latestAt) return { ...state.value };
    state.latestAt = capturedAt;
    const sample = measure(source);
    if (!sample) return this.pause(id);
    const open = Number.isFinite(openness) ? clamp(openness) : 0;
    const elapsed = state.sampleAt === null ? 0 : capturedAt - state.sampleAt;
    const previous = state.previous;
    const resumed = !previous || state.sampleAt === null || elapsed > MAX_GAP_MS;

    if (resumed) {
      state.value.motion = 0;
      state.calibration = undefined;
    } else {
      const translation = Math.hypot(sample.x - previous.x, sample.y - previous.y);
      const turning = Math.abs(shortAngle(sample.angle - previous.angle));
      const depth = Math.abs(Math.log(sample.imageSize / previous.imageSize));
      const opening = Math.abs(open - state.previousOpenness);
      const intensity = clamp(
        (translation > .002 ? translation / elapsed / .0015 * .6 : 0) +
        (turning > .01 ? turning / elapsed / .006 * .3 : 0) +
        (depth > .02 ? depth / elapsed / .004 * .4 : 0) +
        (opening > .02 ? opening / elapsed / .006 * .2 : 0),
      );
      const motionAlpha = 1 - Math.exp(-elapsed / (intensity > state.value.motion ? 90 : 250));
      state.value.motion += (intensity - state.value.motion) * motionAlpha;
      if (state.baseline) {
        const reference = state.baseline;
        const ratio = sample.imageSize / reference.imageSize;
        const scaleAlpha = 1 - Math.exp(-elapsed / 150);
        state.value.scale = clamp(Math.exp(Math.log(state.value.scale) +
          (Math.log(clamp(ratio, .65, 1.8)) - Math.log(state.value.scale)) * scaleAlpha), .65, 1.8);
        const rotationAlpha = 1 - Math.exp(-elapsed / 110);
        const targetAngle = shortAngle(sample.angle - reference.angle);
        state.value.rotation += shortAngle(targetAngle - state.value.rotation) * rotationAlpha;
      }
    }

    if (!state.baseline) this.calibrate(state, sample, capturedAt, open);
    state.previous = sample;
    state.previousOpenness = open;
    state.sampleAt = capturedAt;
    return { ...state.value };
  }

  pause(id: string): HandPose {
    const state = this.states.get(id);
    if (!state) return { scale: 1, rotation: 0, motion: 0 };
    state.sampleAt = null;
    state.previous = undefined;
    state.calibration = undefined;
    state.value.motion = 0;
    return { ...state.value };
  }

  retain(ids: Iterable<string>): void {
    const current = new Set(ids);
    for (const id of this.states.keys()) if (!current.has(id)) this.states.delete(id);
  }

  clear(): void { this.states.clear(); }

  private calibrate(state: PoseState, sample: PalmMetrics, capturedAt: number, openness: number): void {
    if (openness < .55) { state.calibration = undefined; return; }
    let calibration = state.calibration;
    if (!calibration || Math.hypot(sample.x - calibration.anchor.x, sample.y - calibration.anchor.y) > .025 ||
        Math.abs(Math.log(sample.imageSize / calibration.anchor.imageSize)) > .08 ||
        Math.abs(shortAngle(sample.angle - calibration.anchor.angle)) > .15) {
      calibration = { startedAt: capturedAt, anchor: sample, imageSizes: [] };
      state.calibration = calibration;
    }
    calibration.imageSizes.push(sample.imageSize);
    if (capturedAt - calibration.startedAt >= CALIBRATION_MS && calibration.imageSizes.length >= 3) {
      state.baseline = { imageSize: median(calibration.imageSizes), angle: calibration.anchor.angle };
      state.calibration = undefined;
    }
  }
}
