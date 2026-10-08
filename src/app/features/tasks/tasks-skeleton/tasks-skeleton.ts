import { Component } from '@angular/core';

@Component({
  selector: 'bt-tasks-skeleton',
  templateUrl: './tasks-skeleton.html',
  styleUrl: './tasks-skeleton.scss',
})
export class TasksSkeleton {
  readonly days = [
    [0, 1, 2],
    [0, 1],
  ];
}
