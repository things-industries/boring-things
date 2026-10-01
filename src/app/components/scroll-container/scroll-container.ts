import { Component } from '@angular/core';

/** Scrolling content area of a `viewport-page`, below its `bt-top-bar`, centred in the page column. */
@Component({
  selector: 'bt-scroll-container',
  template: '<ng-content />',
  styleUrl: './scroll-container.scss',
})
export class ScrollContainer {}
