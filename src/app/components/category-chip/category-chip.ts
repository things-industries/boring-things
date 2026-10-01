import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import type { Schema } from '../../../../shared/model';
import { categoryIcons } from '../../core/app-icons';
import { categoryIcon } from '../../utils/category.util';
/** Category link with icon, name and Thing count, opening the Things list filtered to it. */
@Component({
  selector: 'bt-category-chip',
  imports: [RouterLink, NgIcon],
  viewProviders: [provideIcons(categoryIcons)],
  templateUrl: './category-chip.html',
  styleUrl: './category-chip.scss',
})
export class CategoryChip {
  readonly category = input.required<Schema['Category']>();
  readonly categoryIcon = categoryIcon;
}
