import { InjectionToken } from '@angular/core';
import type { Schema } from '../../../shared/model';
export const CONFIG = new InjectionToken<Schema['Config']>('runtime configuration');
