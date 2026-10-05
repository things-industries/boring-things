import type { Routes } from '@angular/router';
import { authenticated } from './core/services/auth.guard';
import { addFirstThing } from './core/services/first-thing.guard';
import { importsEnabled } from './core/services/imports.guard';
import { APP_TERMS } from './core/app-terms';
const dashboard = () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage);
const chatPage = () => import('./features/chat/chat.page').then((m) => m.ChatPage);
export const routes: Routes = [
  {
    path: 'login',
    title: APP_TERMS.login,
    loadComponent: () => import('./features/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'callback',
    title: APP_TERMS.login,
    loadComponent: () => import('./features/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    pathMatch: 'full',
    title: APP_TERMS.home,
    canActivate: [authenticated, addFirstThing],
    data: { bottomNav: true },
    loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
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
    loadComponent: () => import('./features/add-thing/add-thing.page').then((m) => m.AddThingPage),
  },
  {
    path: 'things/new/text',
    title: APP_TERMS.addThing,
    canActivate: [authenticated, importsEnabled],
    loadComponent: () =>
      import('./features/add-thing/paste-text/paste-text.page').then((m) => m.PasteTextPage),
  },
  {
    path: 'things/new/manual',
    title: APP_TERMS.addThing,
    canActivate: [authenticated],
    loadComponent: () =>
      import('./features/add-thing/manual-thing/manual-thing.page').then((m) => m.ManualThingPage),
  },
  {
    path: 'things/:id',
    canActivate: [authenticated],
    loadComponent: () => import('./features/things/thing.page').then((m) => m.ThingPage),
  },
  {
    path: 'things/:id/details',
    canActivate: [authenticated],
    loadComponent: () =>
      import('./features/things/thing-details/thing-details.page').then((m) => m.ThingDetailsPage),
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
    loadComponent: () => import('./features/timeline/timeline.page').then((m) => m.TimelinePage),
  },
  {
    path: 'profile',
    title: APP_TERMS.profile,
    canActivate: [authenticated],
    loadComponent: () => import('./features/profile/profile.page').then((m) => m.ProfilePage),
  },
  { path: '**', redirectTo: '' },
];
