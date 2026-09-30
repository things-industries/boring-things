import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { BottomNav } from './components/bottom-nav/bottom-nav';
@Component({
  selector: 'bt-root',
  imports: [RouterOutlet, BottomNav],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly router = inject(Router);
  readonly bottomNav = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => {
        let route = this.router.routerState.snapshot.root;
        while (route.firstChild) route = route.firstChild;
        return route.data['bottomNav'] === true;
      }),
    ),
    { initialValue: false },
  );
}
