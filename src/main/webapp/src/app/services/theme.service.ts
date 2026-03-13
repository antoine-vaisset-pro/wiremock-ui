import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'wiremock-ui-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = new BehaviorSubject<Theme>(this.resolveInitialTheme());

  readonly theme$ = this._theme.asObservable();

  get isDark(): boolean {
    return this._theme.value === 'dark';
  }

  get currentTheme(): Theme {
    return this._theme.value;
  }

  constructor() {
    this.applyTheme(this._theme.value);
  }

  toggleTheme(): void {
    const next: Theme = this._theme.value === 'dark' ? 'light' : 'dark';
    this.setTheme(next);
  }

  setTheme(theme: Theme): void {
    this._theme.next(theme);
    localStorage.setItem(STORAGE_KEY, theme);
    this.applyTheme(theme);
  }

  private applyTheme(theme: Theme): void {
    document.documentElement.setAttribute('data-bs-theme', theme);
  }

  private resolveInitialTheme(): Theme {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (saved === 'dark' || saved === 'light') {
      return saved;
    }
    // Fall back to OS preference
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }
}

