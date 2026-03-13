import { TestBed } from '@angular/core/testing';
import { ThemeService, Theme } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;

  beforeEach(() => {
    localStorage.clear();
    // Reset data-bs-theme attribute before each test
    document.documentElement.removeAttribute('data-bs-theme');
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-bs-theme');
  });

  describe('initial theme resolution', () => {
    it('should default to light theme when no localStorage value and system prefers light', () => {
      spyOn(window, 'matchMedia').and.returnValue({ matches: false } as MediaQueryList);
      service = TestBed.inject(ThemeService);

      expect(service.currentTheme).toBe('light');
      expect(document.documentElement.getAttribute('data-bs-theme')).toBe('light');
    });

    it('should default to dark theme when no localStorage value and system prefers dark', () => {
      spyOn(window, 'matchMedia').and.returnValue({ matches: true } as MediaQueryList);
      service = TestBed.inject(ThemeService);

      expect(service.currentTheme).toBe('dark');
      expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
    });

    it('should use saved light theme from localStorage', () => {
      localStorage.setItem('wiremock-ui-theme', 'light');
      service = TestBed.inject(ThemeService);

      expect(service.currentTheme).toBe('light');
      expect(document.documentElement.getAttribute('data-bs-theme')).toBe('light');
    });

    it('should use saved dark theme from localStorage', () => {
      localStorage.setItem('wiremock-ui-theme', 'dark');
      service = TestBed.inject(ThemeService);

      expect(service.currentTheme).toBe('dark');
      expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
    });

    it('should ignore invalid localStorage value and fall back to system preference', () => {
      localStorage.setItem('wiremock-ui-theme', 'invalid-value');
      spyOn(window, 'matchMedia').and.returnValue({ matches: false } as MediaQueryList);
      service = TestBed.inject(ThemeService);

      expect(service.currentTheme).toBe('light');
    });
  });

  describe('toggleTheme()', () => {
    beforeEach(() => {
      spyOn(window, 'matchMedia').and.returnValue({ matches: false } as MediaQueryList);
      service = TestBed.inject(ThemeService);
    });

    it('should switch from light to dark', () => {
      service.setTheme('light');
      service.toggleTheme();

      expect(service.currentTheme).toBe('dark');
      expect(service.isDark).toBeTrue();
    });

    it('should switch from dark to light', () => {
      service.setTheme('dark');
      service.toggleTheme();

      expect(service.currentTheme).toBe('light');
      expect(service.isDark).toBeFalse();
    });

    it('should apply the new theme to the document element', () => {
      service.setTheme('light');
      service.toggleTheme();

      expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
    });
  });

  describe('setTheme()', () => {
    beforeEach(() => {
      spyOn(window, 'matchMedia').and.returnValue({ matches: false } as MediaQueryList);
      service = TestBed.inject(ThemeService);
    });

    it('should persist the theme in localStorage', () => {
      service.setTheme('dark');
      expect(localStorage.getItem('wiremock-ui-theme')).toBe('dark');

      service.setTheme('light');
      expect(localStorage.getItem('wiremock-ui-theme')).toBe('light');
    });

    it('should emit the new theme via theme$ observable', (done) => {
      const themes: Theme[] = [];
      service.theme$.subscribe(t => themes.push(t));

      service.setTheme('dark');
      service.setTheme('light');

      // BehaviorSubject emits immediately, so themes[0] is the current value at subscription
      expect(themes).toContain('dark');
      expect(themes).toContain('light');
      done();
    });

    it('should update isDark getter', () => {
      service.setTheme('dark');
      expect(service.isDark).toBeTrue();

      service.setTheme('light');
      expect(service.isDark).toBeFalse();
    });
  });
});

