import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { Auth } from './auth.service';
export const authenticated: CanActivateFn = () =>
  inject(Auth).signedIn() || inject(Router).createUrlTree(['/login']);
