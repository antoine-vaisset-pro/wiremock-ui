import {TestBed} from '@angular/core/testing';
import {HttpClientTestingModule, HttpTestingController} from '@angular/common/http/testing';
import {AppConfig, ConfigService} from './config.service';

describe('ConfigService', () => {
  let service: ConfigService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule]
    });
    service = TestBed.inject(ConfigService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getAppConfig', () => {
    it('should return null before loadConfig is called', () => {
      expect(service.getAppConfig()).toBeNull();
    });

    it('should return the loaded config after loadConfig resolves', async () => {
      const mockConfig: AppConfig = { wiremockApiUrl: 'http://my-wiremock:8080' };

      const loadPromise = service.loadConfig();
      const req = httpMock.expectOne('/config.json');
      req.flush(mockConfig);
      await loadPromise;

      expect(service.getAppConfig()).toEqual(mockConfig);
    });

    it('should return the fallback config when config.json cannot be loaded', async () => {
      const loadPromise = service.loadConfig();
      const req = httpMock.expectOne('/config.json');
      req.error(new ProgressEvent('error'));
      await loadPromise;

      expect(service.getAppConfig()).toEqual({ wiremockApiUrl: '' });
    });
  });

  describe('custom backends CRUD', () => {
    it('should return empty array when no custom backends saved', () => {
      expect(service.getSavedCustomBackends()).toEqual([]);
    });

    it('should add a custom backend', () => {
      const backend = service.addCustomBackend('Staging', 'http://staging:8080');

      expect(backend.label).toBe('Staging');
      expect(backend.url).toBe('http://staging:8080');
      expect(backend.id).toBeTruthy();

      const stored = service.getSavedCustomBackends();
      expect(stored.length).toBe(1);
      expect(stored[0].url).toBe('http://staging:8080');
    });

    it('should use url as label when label is empty', () => {
      const backend = service.addCustomBackend('', 'http://staging:8080');
      expect(backend.label).toBe('http://staging:8080');
    });

    it('should update a custom backend', () => {
      const backend = service.addCustomBackend('Old', 'http://old:8080');
      service.updateCustomBackend(backend.id, 'New', 'http://new:8080');

      const stored = service.getSavedCustomBackends();
      expect(stored[0].label).toBe('New');
      expect(stored[0].url).toBe('http://new:8080');
    });

    it('should delete a custom backend', () => {
      const b1 = service.addCustomBackend('B1', 'http://b1:8080');
      service.addCustomBackend('B2', 'http://b2:8080');

      service.deleteCustomBackend(b1.id);

      const stored = service.getSavedCustomBackends();
      expect(stored.length).toBe(1);
      expect(stored[0].label).toBe('B2');
    });

    it('should fall back to local endpoint when deleting active custom backend', () => {
      const backend = service.addCustomBackend('Active', 'http://active:8080');
      service.setEndpointConfig({ type: 'custom', url: 'http://active:8080' });

      service.deleteCustomBackend(backend.id);

      expect(service.getEndpointConfig().type).toBe('local');
      expect(service.getEndpointConfig().url).toBe('');
    });
  });
});
