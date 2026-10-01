import { Component } from '@angular/core';
@Component({
  selector: 'bt-home-skeleton',
  templateUrl: './home-skeleton.html',
  styleUrl: './home-skeleton.scss',
})
export class HomeSkeleton {
  readonly rows = [0, 1];
  readonly things = [0, 1, 2];
  readonly categories = [0, 1, 2, 3, 4, 5, 6, 7];
}
