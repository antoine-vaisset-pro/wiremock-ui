import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [AsyncPipe],
  template: `
    @if (themeService.theme$ | async; as theme) {
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm theme-toggle-btn"
        (click)="themeService.toggleTheme()"
        [title]="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
        [attr.aria-label]="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
      >
        @if (theme === 'dark') {
          <i class="fa-solid fa-sun"></i>
        } @else {
          <i class="fa-solid fa-moon"></i>
        }
      </button>
    }
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
    }
  `]
})
export class ThemeToggleComponent {
  protected readonly themeService = inject(ThemeService);
}

