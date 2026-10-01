import { Injectable, inject } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { ACTION_TERMS, ERROR_TERMS } from '../app-terms';
import type { ActionTerm } from '../../interfaces/terms.interface';
import type { UiErrorCode } from '../../interfaces/error.interface';

@Injectable({ providedIn: 'root' })
export class Toasts {
  private toastr = inject(ToastrService);
  error(action: ActionTerm, code: UiErrorCode) {
    this.toastr.error(ERROR_TERMS[code], ACTION_TERMS[action]);
  }
}
