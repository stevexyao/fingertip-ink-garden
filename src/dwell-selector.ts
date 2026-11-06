import type { FlowerType } from './types';

export interface DwellHand { id: string; x: number; y: number; flower: FlowerType }
export interface DwellTarget { flower: FlowerType; left: number; top: number; right: number; bottom: number }
export interface DwellProgress { id: string; target: FlowerType | null; progress: number; locked: boolean }
export interface DwellSelection { id: string; flower: FlowerType }
export interface DwellResult { progress: DwellProgress[]; selections: DwellSelection[] }

interface DwellState {
  target: FlowerType | null;
  startedAt: number;
  lastCapturedAt: number;
  lastReceivedAt: number;
  observations: number;
  progress: number;
  locked: boolean;
}

const DWELL_MS = 800;
const MAX_GAP_MS = 400;
const MIN_OBSERVATIONS = 3;

const hitTarget = (hand: DwellHand, targets: DwellTarget[]): FlowerType | null => {
  if (!Number.isFinite(hand.x) || !Number.isFinite(hand.y)) return null;
  return targets.find(target =>
    [target.left, target.top, target.right, target.bottom].every(Number.isFinite) &&
    target.left <= target.right && target.top <= target.bottom &&
    hand.x >= target.left && hand.x <= target.right && hand.y >= target.top && hand.y <= target.bottom,
  )?.flower ?? null;
};

/** Inference-time dwell selection. Rendering may reuse progress but never adds
 * time or observations. IDs own their state regardless of result ordering.
 */
export class DwellFlowerSelector {
  private states = new Map<string, DwellState>();
  private lastCapturedAt = -Infinity;
  private lastReceivedAt = -Infinity;
  private latestProgress: DwellProgress[] = [];

  update(hands: DwellHand[], targets: DwellTarget[], capturedAt: number, receivedAt: number): DwellResult {
    if (!Number.isFinite(capturedAt) || !Number.isFinite(receivedAt) ||
        capturedAt <= this.lastCapturedAt || receivedAt < this.lastReceivedAt) {
      return { progress: this.snapshot(), selections: [] };
    }
    this.lastCapturedAt = capturedAt;
    this.lastReceivedAt = receivedAt;
    const seen = new Set<string>();
    const progress: DwellProgress[] = [];
    const selections: DwellSelection[] = [];

    for (const hand of hands) {
      if (seen.has(hand.id)) continue;
      seen.add(hand.id);
      const target = hitTarget(hand, targets);
      let state = this.states.get(hand.id);
      const gap = !!state && (capturedAt - state.lastCapturedAt > MAX_GAP_MS || receivedAt - state.lastReceivedAt > MAX_GAP_MS);
      if (!state || state.target !== target || (gap && !state.locked)) {
        state = {
          target, startedAt: capturedAt, lastCapturedAt: capturedAt, lastReceivedAt: receivedAt,
          observations: 0, progress: 0, locked: false,
        };
        this.states.set(hand.id, state);
      }
      state.lastCapturedAt = capturedAt;
      state.lastReceivedAt = receivedAt;

      if (!target) {
        state.progress = 0;
        state.observations = 0;
        state.locked = false;
      } else if (state.locked) {
        // A pause clears the ring, but cannot undo a manual/selected lock while
        // the hand is still over the same target. An observed exit unlocks it.
        if (gap || target === hand.flower) state.progress = 0;
      } else if (target === hand.flower) {
        state.progress = 0;
        state.observations = 0;
      } else {
        if (state.observations === 0) state.startedAt = capturedAt;
        state.observations++;
        state.progress = Math.min(1, Math.max(0, (capturedAt - state.startedAt) / DWELL_MS));
        if (state.progress === 1 && state.observations >= MIN_OBSERVATIONS) {
          state.locked = true;
          selections.push({ id: hand.id, flower: target });
        }
      }
      progress.push({ id: hand.id, target, progress: state.progress, locked: state.locked });
    }

    for (const id of this.states.keys()) if (!seen.has(id)) this.states.delete(id);
    this.latestProgress = progress;
    return { progress: this.snapshot(), selections };
  }

  cancel(id: string): void {
    const state = this.states.get(id);
    if (!state?.target) return;
    state.observations = 0;
    state.progress = 0;
    state.locked = true;
    this.latestProgress = this.latestProgress.map(item => item.id === id ? { ...item, progress: 0, locked: true } : item);
  }

  clear(): void {
    this.states.clear();
    this.latestProgress = [];
    this.lastCapturedAt = -Infinity;
    this.lastReceivedAt = -Infinity;
  }

  private snapshot(): DwellProgress[] {
    return this.latestProgress.map(item => ({ ...item }));
  }
}
