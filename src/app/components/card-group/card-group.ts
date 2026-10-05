import { booleanAttribute, Component, input } from '@angular/core';
/** White rounded container for divided rows. */
@Component({
  selector: 'bt-card-group',
  templateUrl: './card-group.html',
  styleUrl: './card-group.scss',
  host: { '[class.has-action]': 'hasAction()' },
})
export class CardGroup {
  /** Drops right padding so trailing row actions sit flush with the edge. */
  hasAction = input(false, { transform: booleanAttribute });
}
