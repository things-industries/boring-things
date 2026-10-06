import { booleanAttribute, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import type { Schema } from '../../../../shared/model';
import { categoryIcons, clearFilter } from '../../core/app-icons';
import { categoryIcon } from '../../utils/category.util';
/**
 * Category link with icon, name and Thing count, opening the Things list filtered to it. An `active`
 * chip shows as selected and links to the unfiltered list.
 */
@Component({
  selector: 'bt-category-chip',
  imports: [RouterLink, NgIcon],
  viewProviders: [provideIcons({ ...categoryIcons, clearFilter })],
  templateUrl: './category-chip.html',
  styleUrl: './category-chip.scss',
})
export class CategoryChip {
  readonly category = input.required<Schema['Category']>();
  readonly active = input(false, { transform: booleanAttribute });
  readonly categoryIcon = categoryIcon;
}
