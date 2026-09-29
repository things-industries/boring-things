import { Component, inject, provideAppInitializer } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, RouterLink, RouterOutlet } from '@angular/router';
import { Auth, CONFIG, authenticated } from './app-services';
import { Dashboard } from './pages/dashboard';
import { ThingPage } from './pages/thing';
import { Login } from './pages/login';
import { apiClient, apiData } from './core/api/api-client';
@Component({
  selector: 'bt-root',
  imports: [RouterOutlet, RouterLink],
  template: `
    <header class="app-header">
      <a routerLink="/" class="brand"><span class="brand-mark">b.</span>Boring Things</a>
      @if (auth.signedIn()) {
        <nav>
          <a routerLink="/">Your things</a
          ><button class="quiet" (click)="auth.signOut()">Sign out</button>
        </nav>
      }
    </header>
    <main><router-outlet /></main>
    <footer>A little less life admin.</footer>
  `,
})
class App {
  readonly auth = inject(Auth);
}
apiClient
  .GET('/api/config')
  .then(apiData)
  .then(async (config) => {
    await bootstrapApplication(App, {
      providers: [
        { provide: CONFIG, useValue: config },
        provideAppInitializer(() => inject(Auth).initialize()),
        provideRouter([
          { path: 'login', component: Login },
          { path: 'callback', component: Login },
          { path: '', component: Dashboard, canActivate: [authenticated] },
          { path: 'things/new', component: ThingPage, canActivate: [authenticated] },
          { path: 'things/:id', component: ThingPage, canActivate: [authenticated] },
          { path: '**', redirectTo: '' },
        ]),
      ],
    });
  })
  .catch(() => {
    document.body.textContent =
      'Boring Things could not connect. Start the server, then reload this page.';
  });
