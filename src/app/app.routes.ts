import type { Routes } from '@angular/router';
import { authenticated } from './core/services/auth.guard';
import { APP_TERMS } from './core/app-terms';
const dashboard = () => import('./features/dashboard/dashboard').then((m) => m.Dashboard);
const thingPage = () => import('./features/things/thing').then((m) => m.ThingPage);
const chatPage = () => import('./features/chat/chat').then((m) => m.ChatPage);
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
    pathMatch: 'full',
    title: APP_TERMS.things,
    canActivate: [authenticated],
    data: { bottomNav: true },
    loadComponent: dashboard,
  },
  {
    path: 'things',
    title: APP_TERMS.things,
    canActivate: [authenticated],
    data: { bottomNav: true },
    loadComponent: dashboard,
  },
  {
    path: 'things/new',
    title: APP_TERMS.addThing,
    canActivate: [authenticated],
    loadComponent: thingPage,
  },
  {
    path: 'things/:id',
    canActivate: [authenticated],
    loadComponent: thingPage,
  },
  {
    path: 'things/:id/details',
    canActivate: [authenticated],
    loadComponent: thingPage,
  },
  {
    path: 'things/:id/chat',
    title: APP_TERMS.assistant,
    canActivate: [authenticated],
    loadComponent: chatPage,
  },
  {
    path: 'chat',
    title: APP_TERMS.assistant,
    canActivate: [authenticated],
    loadComponent: chatPage,
  },
  {
    path: 'timeline',
    title: APP_TERMS.timeline,
    canActivate: [authenticated],
    data: { bottomNav: true },
    loadComponent: () => import('./features/timeline/timeline').then((m) => m.TimelinePage),
  },
  {
    path: 'profile',
    title: APP_TERMS.profile,
    canActivate: [authenticated],
    loadComponent: () => import('./features/profile/profile').then((m) => m.ProfilePage),
  },
  { path: '**', redirectTo: '' },
];
