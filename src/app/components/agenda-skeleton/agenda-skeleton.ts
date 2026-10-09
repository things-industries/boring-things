import { Component } from '@angular/core';

@Component({
  selector: 'bt-agenda-skeleton',
  templateUrl: './agenda-skeleton.html',
  styleUrl: './agenda-skeleton.scss',
})
export class AgendaSkeleton {
  readonly days = [
    [0, 1, 2],
    [0, 1],
  ];
}
