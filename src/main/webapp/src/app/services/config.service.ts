import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, BehaviorSubject, Subject } from 'rxjs';

export interface AppConfig {
  wiremockApiUrl: string;
  wiremockBackend?: string;
}

export type EndpointType = 'local' | 'env' | 'custom';

export interface WiremockEndpointConfig {
  type: EndpointType;
  url: string;
}

export interface CustomBackend {
  id: string;
  label: string;
  url: string;
}

const STORAGE_KEY = 'wiremock-endpoint-config';
const CUSTOM_BACKENDS_KEY = 'wiremock-custom-backends';

export const WIREMOCK_ADMIN_SUFFIX = '/__admin';

let _idCounter = 0;
function generateId(): string {
  return `custom-${Date.now()}-${++_idCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

const PRE_REGISTERED_ENDPOINTS = {
  local: ''
};

@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  private config: AppConfig | null = null;
  private endpointConfig$ = new BehaviorSubject<WiremockEndpointConfig>(this.loadEndpointConfig());
  private customBackendsChanged$ = new Subject<void>();

  constructor(private http: HttpClient) {}

  async loadConfig(): Promise<AppConfig> {
    if (this.config) {
      return this.config;
    }

    try {
      this.config = await firstValueFrom(
        this.http.get<AppConfig>('/config.json')
      );
    } catch (error) {
      console.warn('Failed to load config.json, using default configuration', error);
      this.config = { wiremockApiUrl: '' };
    }

    // Prioritize WIREMOCK_BACKEND unless the user has saved an explicit choice
    // (an explicit choice = non-empty url different from '' / /__admin)
    const storedConfig = localStorage.getItem(STORAGE_KEY);
    const hasExplicitChoice = storedConfig
      ? (() => { try { const c = JSON.parse(storedConfig); return c.url && c.url !== '' && c.url !== WIREMOCK_ADMIN_SUFFIX; } catch { return false; } })()
      : false;

    if (!hasExplicitChoice) {
      const backends = this.getWiremockBackends();
      if (backends.length > 0) {
        this.endpointConfig$.next({ type: 'env', url: backends[0].url });
      }
    }

    return this.config;
  }

  get wiremockApiUrl(): string {
    return (this.endpointConfig$.value.url || '') + WIREMOCK_ADMIN_SUFFIX;
  }

  getEndpointConfig(): WiremockEndpointConfig {
    return this.endpointConfig$.value;
  }

  getEndpointConfigObservable() {
    return this.endpointConfig$.asObservable();
  }

  getCustomBackendsChangedObservable() {
    return this.customBackendsChanged$.asObservable();
  }

  setEndpointConfig(config: WiremockEndpointConfig): void {
    this.endpointConfig$.next(config);
    this.saveEndpointConfig(config);
  }

  getPreRegisteredEndpoints() {
    return PRE_REGISTERED_ENDPOINTS;
  }

  getAppConfig(): AppConfig | null {
    return this.config;
  }

  /**
   * Returns the list of URLs defined in WIREMOCK_BACKEND (semicolon-separated).
   * Each entry has a label derived from the URL and the URL itself.
   */
  getWiremockBackends(): { label: string; url: string }[] {
    const raw = this.config?.wiremockBackend;
    if (!raw || raw.trim() === '') {
      return [];
    }
    return raw
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map((url, index) => {
        let label: string;
        try {
          const parsed = new URL(url);
          label = parsed.hostname + (parsed.port ? `:${parsed.port}` : '');
        } catch {
          label = `Backend ${index + 1}`;
        }
        return { label, url };
      });
  }

  /** @deprecated Utiliser getWiremockBackends() */
  getWiremockBackend(): string {
    return this.getWiremockBackends()[0]?.url ?? '';
  }

  getSavedCustomBackends(): CustomBackend[] {
    try {
      const stored = localStorage.getItem(CUSTOM_BACKENDS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  addCustomBackend(label: string, url: string): CustomBackend {
    const backends = this.getSavedCustomBackends();
    const newBackend: CustomBackend = {
      id: generateId(),
      label: label.trim() || url,
      url
    };
    backends.push(newBackend);
    this.saveCustomBackends(backends);
    this.customBackendsChanged$.next();
    return newBackend;
  }

  updateCustomBackend(id: string, label: string, url: string): void {
    const backends = this.getSavedCustomBackends();
    const idx = backends.findIndex(b => b.id === id);
    if (idx !== -1) {
      const oldUrl = backends[idx].url;
      backends[idx] = { id, label: label.trim() || url, url };
      this.saveCustomBackends(backends);
      this.customBackendsChanged$.next();
      // If this was the active backend, update the active config too
      const current = this.endpointConfig$.value;
      if (current.type === 'custom' && current.url === oldUrl) {
        this.setEndpointConfig({ type: 'custom', url });
      }
    }
  }

  deleteCustomBackend(id: string): void {
    const backends = this.getSavedCustomBackends();
    const toDelete = backends.find(b => b.id === id);
    const updated = backends.filter(b => b.id !== id);
    this.saveCustomBackends(updated);
    this.customBackendsChanged$.next();
    // If the deleted backend was active, fall back to first available option
    if (toDelete) {
      const current = this.endpointConfig$.value;
      if (current.type === 'custom' && current.url === toDelete.url) {
        const envBackends = this.getWiremockBackends();
        if (envBackends.length > 0) {
          this.setEndpointConfig({ type: 'env', url: envBackends[0].url });
        } else {
          this.setEndpointConfig({ type: 'local', url: '' });
        }
      }
    }
  }

  private saveCustomBackends(backends: CustomBackend[]): void {
    try {
      localStorage.setItem(CUSTOM_BACKENDS_KEY, JSON.stringify(backends));
    } catch (error) {
      console.warn('Failed to save custom backends to localStorage', error);
    }
  }

  private loadEndpointConfig(): WiremockEndpointConfig {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load endpoint config from localStorage', error);
    }
    return { type: 'local', url: '' };
  }

  private saveEndpointConfig(config: WiremockEndpointConfig): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (error) {
      console.warn('Failed to save endpoint config to localStorage', error);
    }
  }
}
