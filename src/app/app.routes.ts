import type { Routes } from '@angular/router';
import { authenticated } from './core/services/auth.guard';
import { APP_TERMS } from './core/app-terms';
export const routes: Routes = [
  {
    path: 'login',
    title: APP_TERMS.login,
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
  },
  {
    path: 'callback',
    title: APP_TERMS.login,
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
  },
  {
    path: '',
    title: APP_TERMS.things,
    canActivate: [authenticated],
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'things/new',
    title: APP_TERMS.addThing,
    canActivate: [authenticated],
    loadComponent: () => import('./features/things/thing').then((m) => m.ThingPage),
  },
  {
    path: 'things/:id',
    canActivate: [authenticated],
    loadComponent: () => import('./features/things/thing').then((m) => m.ThingPage),
  },
  {
    path: 'chat',
    title: APP_TERMS.assistant,
    canActivate: [authenticated],
    loadComponent: () => import('./features/chat/chat').then((m) => m.ChatPage),
  },
  { path: '**', redirectTo: '' },
];
