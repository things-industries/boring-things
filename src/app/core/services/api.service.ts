import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from './auth.service';
import { allPages, createApiClient } from '../api/api-client';

@Injectable({ providedIn: 'root' })
export class Api {
  private auth = inject(Auth);
  private router = inject(Router);
  readonly client = createApiClient({
    token: () => this.auth.token(),

    onUnauthorized: () => {
      this.auth.expireSession();
      void this.router.navigate(['/login']);
    },
  });

  readonly all = allPages;
}
