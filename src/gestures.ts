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

interface PalmSample { x: number; y: number; t: number }
interface Track {
  hand: TrackedHand;
  palm: PalmSample;
  present: boolean;
}
interface Observation {
  source: HandObservation;
  palm: PalmSample;
  palmWidth: number;
  openness: number;
}
const PALM_POINTS = [0, 5, 9, 13, 17];
const TRACK_RETENTION = 1000;
// Resume at the observed position after a long detection gap, while normal
// slower CPU inference intervals keep the same smoothing and hand identity.
const POSITION_RESET_GAP = 450;

function prepare(source: HandObservation, timestamp: number): Observation | undefined {
  if (!validLandmarks(source.landmarks) || !Number.isFinite(source.confidence) || source.confidence < .25) return;
  let x = 0; let y = 0;
  for (const i of PALM_POINTS) { x += 1 - source.landmarks[i]!.x; y += source.landmarks[i]!.y; }
  const aspect = Number.isFinite(source.imageAspect) && source.imageAspect! > 0 ? source.imageAspect! : 1;
  const knuckleA = source.landmarks[5]!; const knuckleB = source.landmarks[17]!;
  return {
    source,
    palm: { x: x / PALM_POINTS.length, y: y / PALM_POINTS.length, t: timestamp },
    // Measure apparent palm size in image-width units, including rotated palms.
    palmWidth: Math.hypot(knuckleA.x - knuckleB.x, (knuckleA.y - knuckleB.y) / aspect),
    openness: computeOpenness(source.landmarks, source.worldLandmarks, source.imageAspect),
  };
}
const palmDistance = (a: PalmSample, b: PalmSample): number => Math.hypot(a.x - b.x, a.y - b.y);
const reliableLabel = (source: HandObservation): boolean => source.handedness !== 'Unknown' && source.confidence >= .75;

/** Track identity, position and openness once per recognition result. Flower
 * changes are explicit through setFlower/cycleFlower; moving a hand never selects.
 */
export class HandGestureTracker {
  private tracks: Track[] = [];
  private nextId = 1;
  private remembered = new Map<Handedness, FlowerType>();
  private lastTimestamp = -Infinity;
  private lastReceivedAt = -Infinity;

  update(observations: HandObservation[], capturedAt: number, receivedAt = capturedAt): TrackedHand[] {
    if (!Number.isFinite(capturedAt) || capturedAt < this.lastTimestamp || !Number.isFinite(receivedAt)) {
      return this.getHands(this.lastReceivedAt);
    }
    this.lastTimestamp = capturedAt;
    this.lastReceivedAt = receivedAt;
    this.releaseOldTracks(receivedAt);
    const inputs = observations.map(source => prepare(source, capturedAt))
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
        track = this.createTrack(input, receivedAt);
        this.tracks.push(track);
      } else {
        this.applyObservation(track, input, ambiguous, receivedAt);
      }
      seen.add(track);
    }
    for (const track of this.tracks) {
      if (!seen.has(track)) track.present = false;
    }
    return this.getHands(receivedAt);
  }

  getHands(timestamp: number): TrackedHand[] {
    const time = Number.isFinite(timestamp) ? timestamp : this.lastReceivedAt;
    this.releaseOldTracks(time);
    return this.tracks.flatMap(track => {
      // Hold through slower 10fps CPU inference intervals, then fade until 350ms.
      const gap = Math.max(0, time - track.hand.lastSeen);
      const opacity = clamp(1 - Math.max(0, gap - 150) / 200);
      return opacity > 0 ? [{ ...track.hand, opacity }] : [];
    });
  }

  setFlower(id: string, flower: FlowerType, changedAt?: number): void {
    if (!FLOWERS.some(candidate => candidate.type === flower)) return;
    const track = this.tracks.find(candidate => candidate.hand.id === id);
    if (!track) return;
    const visibleAt = Number.isFinite(changedAt) ? Math.max(track.hand.lastSeen, changedAt!) : track.hand.lastSeen;
    track.hand.flower = flower;
    track.hand.switchedAt = visibleAt;
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
    this.lastReceivedAt = -Infinity;
  }

  private releaseOldTracks(timestamp: number): void {
    this.tracks = this.tracks.filter(track => timestamp - track.hand.lastSeen <= TRACK_RETENTION);
  }

  private createTrack(input: Observation, receivedAt: number): Track {
    const source = input.source;
    const handedness = reliableLabel(source) ? source.handedness : 'Unknown';
    const tip = source.landmarks[8]!;
    const hand: TrackedHand = {
      id: `hand-${this.nextId++}`, x: clamp(1 - tip.x), y: clamp(tip.y),
      openness: input.openness, flower: this.remembered.get(handedness) ?? 'peony',
      opacity: 1, phase: this.nextId * 1.618, handedness,
      landmarks: source.landmarks, lastSeen: receivedAt, switchedAt: -Infinity,
    };
    return {
      hand, palm: input.palm, present: true,
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
    // Keep uncertain handedness assignments conservative near palm overlap.
    const overlapDistance = Math.max(.045, (a.palmWidth + b.palmWidth) * .7);
    if (palmDistance(a.palm, b.palm) < overlapDistance) return true;
    const [oldA, oldB] = matches;
    if (oldA && oldB) {
      const crossed = (oldA.palm.x - oldB.palm.x) * (a.palm.x - b.palm.x) < 0;
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

  private applyObservation(track: Track, input: Observation, ambiguous: boolean, receivedAt: number): void {
    // Smoothing follows captured frames; visibility starts when a result arrives.
    const elapsed = Math.max(0, input.palm.t - track.palm.t);
    const reentered = !track.present || elapsed > POSITION_RESET_GAP;
    const positionAlpha = reentered ? 1 : 1 - Math.exp(-elapsed / 55);
    const openAlpha = reentered ? 1 : 1 - Math.exp(-elapsed / 85);
    const tip = input.source.landmarks[8]!;
    track.hand.x += (clamp(1 - tip.x) - track.hand.x) * positionAlpha;
    track.hand.y += (clamp(tip.y) - track.hand.y) * positionAlpha;
    track.hand.openness += (input.openness - track.hand.openness) * openAlpha;
    track.hand.landmarks = input.source.landmarks;
    track.hand.lastSeen = receivedAt;
    // Once a label is established, a later classification never reassigns the
    // track. Spatial matching can bridge brief classification flicker.
    if (track.hand.handedness === 'Unknown' && reliableLabel(input.source) && !ambiguous) {
      track.hand.handedness = input.source.handedness;
      const remembered = this.remembered.get(track.hand.handedness);
      if (remembered) track.hand.flower = remembered;
    }
    track.present = true;
    track.palm = input.palm;
  }

  private rememberFlower(track: Track): void {
    if (track.hand.handedness !== 'Unknown') this.remembered.set(track.hand.handedness, track.hand.flower);
  }
}
