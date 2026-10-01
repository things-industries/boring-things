import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { CONFIG } from '../runtime-config';
/** Sends import-only routes back to Add Thing while AI imports are unconfigured. */
export const importsEnabled: CanActivateFn = () =>
  inject(CONFIG).importEnabled || inject(Router).createUrlTree(['/things/new']);
