import { Component } from '@angular/core';
/** White rounded container for divided rows. */
@Component({
  selector: 'bt-card-group',
  template: `<ng-content />`,
  styleUrl: './card-group.scss',
})
export class CardGroup {}
