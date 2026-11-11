import type { CanDeactivateFn } from '@angular/router';
import type { LeaveGuarded } from '../../interfaces/leave-guarded.interface';

/** Holds navigation until the page allows it to leave. */
export const confirmLeave: CanDeactivateFn<LeaveGuarded> = (page) => page.canLeave();
