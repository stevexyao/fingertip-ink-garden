import { FLOWERS } from './types';
import type { FlowerType, Handedness, HandObservation, Landmark, TrackedHand } from './types';

const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));
const validLandmarks = (points: Landmark[] | undefined): points is Landmark[] =>
  !!points && points.length >= 21 && points.slice(0, 21).every(p =>
    p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
const distance = (a: Landmark, b: Landmark): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Relative finger extension; invariant to translation and uniform hand scale.
 * World coordinates are preferred because camera foreshortening can shorten a
 * finger in the image. Normalized image x is corrected for video aspect ratio.
 */
export function computeOpenness(landmarks: Landmark[], worldLandmarks?: Landmark[], imageAspect = 1): number {
  if (!validLandmarks(landmarks)) return 0;
  const aspect = Number.isFinite(imageAspect) && imageAspect > 0 ? imageAspect : 1;
  let points = landmarks.map(p => ({ x: p.x * aspect, y: p.y, z: p.z * aspect }));
  if (validLandmarks(worldLandmarks) && distance(worldLandmarks[0]!, worldLandmarks[9]!) > 1e-6) {
    points = worldLandmarks;
  }
  const palmScale = (distance(points[0]!, points[9]!) + distance(points[5]!, points[17]!)) / 2;
  if (!Number.isFinite(palmScale) || palmScale < 1e-6) return 0;
  const fingers = [[5, 8], [9, 12], [13, 16], [17, 20]] as const;
  const extension = fingers.reduce((sum, [base, tip]) =>
    sum + clamp((distance(points[base]!, points[tip]!) / palmScale - .35) / 1.15), 0) / 4;
  const spread = clamp((distance(points[4]!, points[20]!) / palmScale - .65) / 1.4);
  return clamp(extension * .84 + spread * .16);
}

interface MotionPoint { x: number; y: number; t: number }
interface Track {
  hand: TrackedHand;
  palm: MotionPoint;
  confidence: number;
  present: boolean;
  armed: boolean;
  stableAnchor: MotionPoint;
  motion: MotionPoint[];
  cooldownUntil: number;
}
interface Observation {
  source: HandObservation;
  palm: MotionPoint;
  openness: number;
}
const PALM_POINTS = [0, 5, 9, 13, 17];
const TRACK_RETENTION = 1000;
// CPU inference can take 180–200ms per result. Only an implicit gap longer
// than a full gesture window resets motion; an explicit no-hand result resets
// immediately through present=false, regardless of elapsed time.
const MOTION_GAP = 450;
const COOLDOWN = 900;
const STABLE_MS = 200;
const OPEN_THRESHOLD = .55;

function prepare(source: HandObservation, timestamp: number): Observation | undefined {
  if (!validLandmarks(source.landmarks) || !Number.isFinite(source.confidence) || source.confidence < .25) return;
  let x = 0; let y = 0;
  for (const i of PALM_POINTS) { x += 1 - source.landmarks[i]!.x; y += source.landmarks[i]!.y; }
  return {
    source,
    palm: { x: x / PALM_POINTS.length, y: y / PALM_POINTS.length, t: timestamp },
    openness: computeOpenness(source.landmarks, source.worldLandmarks, source.imageAspect),
  };
}
const palmDistance = (a: MotionPoint, b: MotionPoint): number => Math.hypot(a.x - b.x, a.y - b.y);
const reliableLabel = (source: HandObservation): boolean => source.handedness !== 'Unknown' && source.confidence >= .75;

/** Stateful inference-time tracker. Call update once per new recognition result,
 * and getHands freely on animation frames; rendering never advances gestures.
 */
export class HandGestureTracker {
  private tracks: Track[] = [];
  private nextId = 1;
  private remembered = new Map<Handedness, FlowerType>();
  private lastTimestamp = -Infinity;

  update(observations: HandObservation[], timestamp: number): TrackedHand[] {
    if (!Number.isFinite(timestamp) || timestamp < this.lastTimestamp) return this.getHands(this.lastTimestamp);
    this.lastTimestamp = timestamp;
    this.releaseOldTracks(timestamp);
    const inputs = observations.map(source => prepare(source, timestamp))
      .filter((observation): observation is Observation => !!observation)
      .sort((a, b) => b.source.confidence - a.source.confidence).slice(0, 2);
    const matches = this.associate(inputs);
    const ambiguous = this.isAmbiguous(inputs, matches);
    const seen = new Set<Track>();
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i]!;
      let track = matches[i];
      if (!track) {
        // A retained invisible track may occupy a slot; release the oldest one
        // when two actual hands need both slots.
        if (this.tracks.length >= 2) {
          const removable = this.tracks.filter(t => !seen.has(t) && !matches.includes(t))
            .sort((a, b) => a.hand.lastSeen - b.hand.lastSeen)[0];
          if (removable) this.tracks.splice(this.tracks.indexOf(removable), 1);
        }
        if (this.tracks.length >= 2) continue;
        track = this.createTrack(input);
        this.tracks.push(track);
      } else {
        this.applyObservation(track, input, ambiguous);
      }
      if (ambiguous) this.resetMotion(track, input.palm);
      seen.add(track);
    }
    for (const track of this.tracks) {
      if (!seen.has(track)) { track.present = false; this.resetMotion(track, track.palm); }
    }
    return this.getHands(timestamp);
  }

  getHands(timestamp: number): TrackedHand[] {
    const time = Number.isFinite(timestamp) ? timestamp : this.lastTimestamp;
    this.releaseOldTracks(time);
    return this.tracks.flatMap(track => {
      // Hold through slower 10fps CPU inference intervals, then fade until 350ms.
      const gap = Math.max(0, time - track.hand.lastSeen);
      const opacity = clamp(1 - Math.max(0, gap - 150) / 200);
      return opacity > 0 ? [{ ...track.hand, opacity }] : [];
    });
  }

  setFlower(id: string, flower: FlowerType): void {
    if (!FLOWERS.some(candidate => candidate.type === flower)) return;
    const track = this.tracks.find(candidate => candidate.hand.id === id);
    if (!track) return;
    track.hand.flower = flower;
    track.hand.switchedAt = track.hand.lastSeen;
    track.cooldownUntil = track.hand.lastSeen + COOLDOWN;
    this.resetMotion(track, track.palm);
    this.rememberFlower(track);
  }

  cycleFlower(id: string, direction: number): void {
    const track = this.tracks.find(candidate => candidate.hand.id === id);
    if (!track || !Number.isFinite(direction) || direction === 0) return;
    const index = FLOWERS.findIndex(candidate => candidate.type === track.hand.flower);
    const next = (index + Math.sign(direction) + FLOWERS.length) % FLOWERS.length;
    this.setFlower(id, FLOWERS[next]!.type);
  }

  clear(): void {
    this.tracks = [];
    this.remembered.clear();
    this.lastTimestamp = -Infinity;
  }

  private releaseOldTracks(timestamp: number): void {
    this.tracks = this.tracks.filter(track => timestamp - track.hand.lastSeen <= TRACK_RETENTION);
  }

  private createTrack(input: Observation): Track {
    const source = input.source;
    const handedness = reliableLabel(source) ? source.handedness : 'Unknown';
    const tip = source.landmarks[8]!;
    const hand: TrackedHand = {
      id: `hand-${this.nextId++}`, x: clamp(1 - tip.x), y: clamp(tip.y),
      openness: input.openness, flower: this.remembered.get(handedness) ?? 'peony',
      opacity: 1, phase: this.nextId * 1.618, handedness,
      landmarks: source.landmarks, lastSeen: input.palm.t, switchedAt: -Infinity,
    };
    return {
      hand, palm: input.palm, confidence: source.confidence, present: true,
      armed: false, stableAnchor: input.palm, motion: [], cooldownUntil: -Infinity,
    };
  }

  private associate(inputs: Observation[]): (Track | undefined)[] {
    if (!inputs.length) return [];
    // Exhaustive assignment for <=2 hands avoids dependence on result order.
    let bestCost = Infinity;
    let best: (Track | undefined)[] = [];
    const visit = (index: number, used: Set<Track>, chosen: (Track | undefined)[], cost: number): void => {
      if (index === inputs.length) {
        if (cost < bestCost) { bestCost = cost; best = [...chosen]; }
        return;
      }
      const input = inputs[index]!;
      visit(index + 1, used, [...chosen, undefined], cost + .52);
      for (const track of this.tracks) {
        if (used.has(track)) continue;
        const d = palmDistance(track.palm, input.palm);
        const sameLabel = reliableLabel(input.source) && input.source.handedness === track.hand.handedness;
        if (d > .42 && !sameLabel) continue;
        let matchCost = d;
        if (reliableLabel(input.source) && track.hand.handedness !== 'Unknown') {
          matchCost += sameLabel ? -.12 : .48;
        }
        used.add(track);
        visit(index + 1, used, [...chosen, track], cost + matchCost);
        used.delete(track);
      }
    };
    visit(0, new Set(), [], 0);
    return best;
  }

  private isAmbiguous(inputs: Observation[], matches: (Track | undefined)[]): boolean {
    if (inputs.length !== 2) return false;
    const [a, b] = inputs as [Observation, Observation];
    if (palmDistance(a.palm, b.palm) < .18) return true;
    const [oldA, oldB] = matches;
    if (oldA && oldB) {
      const crossed = (oldA.palm.x - oldB.palm.x) * (a.palm.x - b.palm.x) <= 0;
      if (crossed && Math.abs(a.palm.y - b.palm.y) < .2) return true;
    }
    // If both labels are weak, a similarly plausible spatial assignment is
    // ambiguous even before their palm centers overlap.
    if (!reliableLabel(a.source) || !reliableLabel(b.source)) {
      if (this.tracks.length === 2) {
        const [one, two] = this.tracks as [Track, Track];
        const direct = palmDistance(one.palm, a.palm) + palmDistance(two.palm, b.palm);
        const swapped = palmDistance(one.palm, b.palm) + palmDistance(two.palm, a.palm);
        if (Math.abs(direct - swapped) < .06) return true;
      }
    }
    return false;
  }

  private applyObservation(track: Track, input: Observation, ambiguous: boolean): void {
    const elapsed = Math.max(0, input.palm.t - track.hand.lastSeen);
    const reentered = !track.present || elapsed > MOTION_GAP;
    const positionAlpha = reentered ? 1 : 1 - Math.exp(-elapsed / 55);
    const openAlpha = reentered ? 1 : 1 - Math.exp(-elapsed / 85);
    const tip = input.source.landmarks[8]!;
    track.hand.x += (clamp(1 - tip.x) - track.hand.x) * positionAlpha;
    track.hand.y += (clamp(tip.y) - track.hand.y) * positionAlpha;
    track.hand.openness += (input.openness - track.hand.openness) * openAlpha;
    track.hand.landmarks = input.source.landmarks;
    track.hand.lastSeen = input.palm.t;
    // Once a label is established, a later classification never reassigns the
    // track. Spatial matching can bridge brief classification flicker.
    if (track.hand.handedness === 'Unknown' && reliableLabel(input.source) && !ambiguous) {
      track.hand.handedness = input.source.handedness;
      const remembered = this.remembered.get(track.hand.handedness);
      if (remembered) track.hand.flower = remembered;
    }
    track.confidence = input.source.confidence;
    track.present = true;
    track.palm = input.palm;
    if (reentered || ambiguous) this.resetMotion(track, input.palm);
    else this.advanceGesture(track, input);
  }

  private resetMotion(track: Track, point: MotionPoint): void {
    track.armed = false;
    track.stableAnchor = point;
    track.motion = [];
  }

  private advanceGesture(track: Track, input: Observation): void {
    const point = input.palm;
    if (input.openness < OPEN_THRESHOLD) { this.resetMotion(track, point); return; }
    if (!track.armed) {
      if (Math.abs(point.x - track.stableAnchor.x) > .03 || Math.abs(point.y - track.stableAnchor.y) > .035) {
        track.stableAnchor = point;
      }
      if (point.t >= track.cooldownUntil && point.t - track.stableAnchor.t >= STABLE_MS) {
        track.armed = true;
        track.motion = [point];
      }
      return;
    }
    track.motion.push(point);
    track.motion = track.motion.filter(sample => point.t - sample.t <= 450);
    for (let start = 0; start < track.motion.length - 1; start++) {
      const first = track.motion[start]!;
      const duration = point.t - first.t;
      const dx = point.x - first.x;
      const dy = point.y - first.y;
      if (duration < 180 || duration > 450 || Math.abs(dx) < .22 || Math.abs(dy) > .085) continue;
      let horizontalPath = 0; let verticalPath = 0; let movingDuration = 0;
      for (let i = start + 1; i < track.motion.length; i++) {
        const movement = Math.abs(track.motion[i]!.x - track.motion[i - 1]!.x);
        horizontalPath += movement;
        // Stable time before/after a quick jump must not pad a short stroke
        // into the qualifying 180ms recognition window.
        if (movement > .002) movingDuration += track.motion[i]!.t - track.motion[i - 1]!.t;
        verticalPath += Math.abs(track.motion[i]!.y - track.motion[i - 1]!.y);
      }
      if (movingDuration < 180 || Math.abs(dx) / Math.max(horizontalPath, 1e-6) < .85 || verticalPath > .13) continue;
      this.cycleFlower(track.hand.id, Math.sign(dx));
      return;
    }
  }

  private rememberFlower(track: Track): void {
    if (track.hand.handedness !== 'Unknown') this.remembered.set(track.hand.handedness, track.hand.flower);
  }
}
