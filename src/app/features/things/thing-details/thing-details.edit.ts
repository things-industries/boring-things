import { FormControl, FormGroup, FormRecord } from '@angular/forms';
import type { FieldDraft, FieldInput } from '../../../interfaces/field-input.interface';
import { fieldValueValidator } from '../../../validators/field-value.validator';
import {
  type DetailRow,
  type DetailsDraft,
  descriptionInput,
  nameInput,
} from './thing-details.view';

function draftControl(input: FieldInput, draft: FieldDraft) {
  return new FormControl<FieldDraft>(draft, {
    nonNullable: true,
    validators: fieldValueValidator(input),
  });
}

/** The edit form over `detailsDraft()` drafts, validating each row by its input. */
export function detailsForm(draft: DetailsDraft, rows: DetailRow[]) {
  const fields = new FormRecord<FormControl<FieldDraft>>({});

  for (const row of rows)
    fields.addControl(row.anchor, draftControl(row.input, draft.fields[row.anchor] ?? ''));

  return new FormGroup({
    name: draftControl(nameInput, draft.name),
    description: draftControl(descriptionInput, draft.description),
    categoryId: new FormControl<FieldDraft>(draft.categoryId, { nonNullable: true }),
    fields,
  });
}

export type DetailsForm = ReturnType<typeof detailsForm>;
