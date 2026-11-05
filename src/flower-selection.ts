import type { HandGestureTracker } from './gestures';
import type { HandSlots } from './hand-slots';
import type { FlowerType, TrackedHand } from './types';

/** Only an explicit unconsumed selection may override a tracked flower. */
export function synchronizeFlowerSelection(
  tracker: Pick<HandGestureTracker, 'setFlower'>,
  slots: HandSlots,
  hands: TrackedHand[],
  pending: (FlowerType | null)[],
  displayed: (FlowerType | null)[],
): void {
  slots.observe(hands.map(hand => hand.id));
  for (const hand of hands) {
    const index = slots.indexOf(hand.id);
    if (index < 0) continue;
    const selection = pending[index];
    if (selection) {
      tracker.setFlower(hand.id, selection);
      hand.flower = selection;
      pending[index] = null;
    }
    // This cache is for the empty-slot UI, never for resetting new hand IDs.
    displayed[index] = hand.flower;
  }
}
