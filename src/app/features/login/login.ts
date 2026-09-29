import { NgIcon, provideIcons } from '@ng-icons/core';
import { open, homeExample, vehicleExample, membershipExample } from '../../core/app-icons';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../../core/services/auth.service';
import { ErrorMessage } from '../../components/error-message/error-message';
@Component({
  viewProviders: [provideIcons({ open, homeExample, vehicleExample, membershipExample })],
  selector: 'bt-login',
  imports: [RouterLink, ErrorMessage, NgIcon],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  readonly auth = inject(Auth);
}
