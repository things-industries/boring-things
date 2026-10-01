import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { ThingsStore } from '../state/things.store';
import { Auth } from './auth.service';
/** Sends an account with no Things to Add Thing on its first page after sign-in. */
export const addFirstThing: CanActivateFn = async () => {
  if (!inject(Auth).takeSignInLanding()) return true;

  const things = inject(ThingsStore);
  const router = inject(Router);

  await things.ensureLoaded();
  return things.status() === 'loaded' && !things.entities().length
    ? router.createUrlTree(['/things/new'])
    : true;
};
