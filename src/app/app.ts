import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { Auth } from './core/services/auth.service';
import { TermPipe } from './pipes/term.pipe';
@Component({
  selector: 'bt-root',
  imports: [RouterOutlet, RouterLink, TermPipe],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly auth = inject(Auth);
}
