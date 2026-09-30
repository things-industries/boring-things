import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  addThing,
  navAsk,
  navAskActive,
  navHome,
  navHomeActive,
  navThings,
  navThingsActive,
  navTimeline,
  navTimelineActive,
} from '../../core/app-icons';
import { TermPipe } from '../../pipes/term.pipe';
@Component({
  selector: 'bt-bottom-nav',
  imports: [RouterLink, RouterLinkActive, NgIcon, TermPipe],
  viewProviders: [
    provideIcons({
      addThing,
      navAsk,
      navAskActive,
      navHome,
      navHomeActive,
      navThings,
      navThingsActive,
      navTimeline,
      navTimelineActive,
    }),
  ],
  templateUrl: './bottom-nav.html',
  styleUrl: './bottom-nav.scss',
})
export class BottomNav {}
