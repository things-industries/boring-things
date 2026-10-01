import { Component, computed, input } from '@angular/core';
import type { Schema } from '../../../../shared/model';
import { IMPORT_STEP_COUNT, importStep } from './thing.view';

/** The current import stage in words, over a track of the stages done, current and to come. */
@Component({
  selector: 'bt-import-steps',
  templateUrl: './import-steps.html',
  styleUrl: './import-steps.scss',
})
export class ImportSteps {
  readonly status = input.required<Schema['ImportStatusEnum']>();
  readonly step = computed(() => importStep(this.status()));
  readonly count = IMPORT_STEP_COUNT;
  readonly steps = Array.from({ length: IMPORT_STEP_COUNT }, (_, index) => index);
}
