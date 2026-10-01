import { Component, input } from '@angular/core';
/** Section title with an optional inline action (`[sectionInline]`) and a trailing link or action. */
@Component({
  selector: 'bt-section-header',
  templateUrl: './section-header.html',
  styleUrl: './section-header.scss',
})
export class SectionHeader {
  readonly title = input.required<string>();
}
