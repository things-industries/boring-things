import { NgIcon, provideIcons } from '@ng-icons/core';
import { signInWithEmail, signInWithApple, setupNotice } from '../../core/app-icons';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../../core/services/auth.service';
import { TermPipe } from '../../pipes/term.pipe';
import { ErrorMessage } from '../../components/error-message/error-message';
import { Notice } from '../../components/notice/notice';
@Component({
  viewProviders: [provideIcons({ signInWithEmail, signInWithApple, setupNotice })],
  selector: 'bt-login',
  imports: [RouterLink, ErrorMessage, NgIcon, Notice, TermPipe],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
})
export class LoginPage {
  readonly auth = inject(Auth);
}
