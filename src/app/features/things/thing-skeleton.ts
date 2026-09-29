import { Component } from '@angular/core';
@Component({
  selector: 'bt-thing-skeleton',
  templateUrl: './thing-skeleton.html',
  styleUrl: './thing-skeleton.scss',
})
export class ThingSkeleton {
  readonly rows = [0, 1, 2, 3];
}
