/** Bind controls to hand identity, rather than the currently visible array. */
export class HandSlots {
  readonly ids: [string | null, string | null] = [null, null];

  observe(visibleIds: string[]): void {
    const current = new Set(visibleIds);
    for (const id of visibleIds.slice(0, 2)) {
      if (this.ids.includes(id)) continue;
      const slot = this.ids.findIndex(existing => existing === null || !current.has(existing));
      if (slot !== -1) this.ids[slot] = id;
    }
  }

  indexOf(id: string): number { return this.ids.indexOf(id); }
  clear(): void { this.ids[0] = null; this.ids[1] = null; }
}
