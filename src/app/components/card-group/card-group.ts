import { booleanAttribute, Component, input } from '@angular/core';
/** White rounded container for divided rows. */
@Component({
  selector: 'bt-card-group',
  templateUrl: './card-group.html',
  styleUrl: './card-group.scss',
  host: { '[class.has-action]': 'hasAction()' },
})
export class CardGroup {
  /** Narrows the rows' end gutter so trailing row actions sit near the edge. */
  hasAction = input(false, { transform: booleanAttribute });
}
