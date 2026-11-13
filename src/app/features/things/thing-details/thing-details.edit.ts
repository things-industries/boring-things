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
  const validate = fieldValueValidator(input);

  return new FormControl<FieldDraft>(draft, {
    nonNullable: true,
    // Account email values saved as text can stay as entered until the owner changes them.
    validators: (control) =>
      input.kind === 'email' && control.pristine && control.value === draft
        ? null
        : validate(control),
  });
}

/** The edit form over `detailsDraft()` drafts, validating each row by its input. */
export function detailsForm(draft: Required<DetailsDraft>, rows: DetailRow[]) {
  const fields = new FormRecord<FormControl<FieldDraft>>({});

  for (const row of rows)
    fields.addControl(row.anchor, draftControl(row.input, draft.fields[row.anchor] ?? ''));

  return new FormGroup({
    name: draftControl(nameInput, draft.name),
    description: draftControl(descriptionInput, draft.description),
    fields,
  });
}

export type DetailsForm = ReturnType<typeof detailsForm>;

/**
 * The drafts of the controls the owner changed. Untouched values are left out, so saving never
 * writes back a value that changed elsewhere during the edit.
 */
export function changedDraft(form: DetailsForm): DetailsDraft {
  const { name, description, fields } = form.controls;
  const draft: DetailsDraft = { fields: {} };

  if (name.dirty) draft.name = name.value;
  if (description.dirty) draft.description = description.value;
  for (const [anchor, control] of Object.entries(fields.controls))
    if (control.dirty) draft.fields[anchor] = control.value;
  return draft;
}
