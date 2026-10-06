import { Component } from '@angular/core';
@Component({
  selector: 'bt-all-things-skeleton',
  templateUrl: './all-things-skeleton.html',
  styleUrl: './all-things-skeleton.scss',
})
export class AllThingsSkeleton {
  readonly categories = [0, 1, 2, 3];
  readonly things = [0, 1, 2, 3, 4, 5];
}
