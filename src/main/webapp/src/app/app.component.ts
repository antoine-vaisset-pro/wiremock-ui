import { Component, OnInit } from '@angular/core';

import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { SidebarMenuComponent, ViewType } from './components/sidebar-menu/sidebar-menu.component';
import { BackendSelectorComponent } from './components/backend-selector/backend-selector.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    SidebarMenuComponent,
    BackendSelectorComponent
  ],
  template: `
    <div class="wiremock-ui">
      <!-- Sidebar Menu -->
      <app-sidebar-menu
        [activeView]="activeView"
        (viewChange)="onViewChange($event)">
      </app-sidebar-menu>

      <!-- Main Container -->
      <div class="main-container">
        <!-- Top Bar -->
        <header class="app-top-bar">
          <div class="app-top-bar-right">
            <app-backend-selector></app-backend-selector>
          </div>
        </header>

        <!-- Page Content -->
        <div class="app-page-content">
          <router-outlet></router-outlet>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'WireMock UI';
  activeView: ViewType = 'dashboard';

  constructor(private router: Router) {}

  ngOnInit(): void {
    // Sync activeView with URL on navigation
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        const url = event.urlAfterRedirects || event.url;
        this.updateActiveViewFromUrl(url);
      });

    // Initialiser activeView depuis l'URL actuelle
    this.updateActiveViewFromUrl(this.router.url);
  }

  private updateActiveViewFromUrl(url: string): void {
    if (url.startsWith('/ui/dashboard')) {
      this.activeView = 'dashboard';
    } else if (url.startsWith('/ui/stubs')) {
      this.activeView = 'stubs';
    } else if (url.startsWith('/ui/scenarios')) {
      this.activeView = 'scenarios';
    } else if (url.startsWith('/ui/requests')) {
      this.activeView = 'requests';
    } else if (url.startsWith('/ui/requester')) {
      this.activeView = 'requester';
    } else if (url.startsWith('/ui/recording')) {
      this.activeView = 'recording';
    } else if (url.startsWith('/ui/generator')) {
      this.activeView = 'generator';
    } else if (url.startsWith('/ui/settings')) {
      this.activeView = 'settings';
    } else if (url.startsWith('/ui/help')) {
      this.activeView = 'help';
    }
  }

  onViewChange(view: ViewType): void {
    this.activeView = view;
    // Navigate to the matching route with the 'ui' prefix
    this.router.navigate([`/ui/${view}`]);
  }
}

