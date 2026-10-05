import { Component } from '@angular/core';
@Component({
  selector: 'bt-dashboard-skeleton',
  templateUrl: './dashboard-skeleton.html',
  styleUrl: './dashboard-skeleton.scss',
})
export class DashboardSkeleton {
  readonly cards = [0, 1, 2, 3];
}
