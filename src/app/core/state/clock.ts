/** Calendar clock for timeline placement and Event followup eligibility. */

import { DestroyRef, inject, signal } from '@angular/core';

/** Refreshes the displayed time each minute while the view exists. */
export function createClock() {
  const now = signal(new Date());
  const timer = setInterval(() => now.set(new Date()), 60000);
  inject(DestroyRef).onDestroy(() => clearInterval(timer));
  return now.asReadonly();
}
