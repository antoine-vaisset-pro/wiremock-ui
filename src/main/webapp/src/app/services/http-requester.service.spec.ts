import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HttpRequesterService, HttpRequestConfig } from './http-requester.service';

describe('HttpRequesterService', () => {
  let service: HttpRequesterService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [HttpRequesterService]
    });

    service = TestBed.inject(HttpRequesterService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('sendRequest - HTTP method routing', () => {
    const TARGET_URL = 'http://wiremock-server/api/resource';

    it('should send a GET request', () => {
      const config: HttpRequestConfig = { method: 'GET', url: TARGET_URL, headers: {} };

      service.sendRequest(config).subscribe(response => {
        expect(response.status).toBe(200);
      });

      const req = httpMock.expectOne(TARGET_URL);
      expect(req.request.method).toBe('GET');
      req.flush('{"data": "ok"}', { status: 200, statusText: 'OK' });
    });

    it('should send a POST request with body', () => {
      const config: HttpRequestConfig = {
        method: 'POST',
        url: TARGET_URL,
        headers: { 'Content-Type': 'application/json' },
        body: '{"name": "test"}'
      };

      service.sendRequest(config).subscribe(response => {
        expect(response.status).toBe(201);
      });

      const req = httpMock.expectOne(TARGET_URL);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBe('{"name": "test"}');
      req.flush('{}', { status: 201, statusText: 'Created' });
    });

    it('should send a PUT request with body', () => {
      const config: HttpRequestConfig = {
        method: 'PUT',
        url: TARGET_URL,
        headers: {},
        body: '{"id": 1, "name": "updated"}'
      };

      service.sendRequest(config).subscribe();

      const req = httpMock.expectOne(TARGET_URL);
      expect(req.request.method).toBe('PUT');
      req.flush('', { status: 200, statusText: 'OK' });
    });

    it('should send a DELETE request', () => {
      const config: HttpRequestConfig = { method: 'DELETE', url: TARGET_URL, headers: {} };

      service.sendRequest(config).subscribe();

      const req = httpMock.expectOne(TARGET_URL);
      expect(req.request.method).toBe('DELETE');
      req.flush('', { status: 204, statusText: 'No Content' });
    });

    it('should send a PATCH request with body', () => {
      const config: HttpRequestConfig = {
        method: 'PATCH',
        url: TARGET_URL,
        headers: {},
        body: '{"name": "patched"}'
      };

      service.sendRequest(config).subscribe();

      const req = httpMock.expectOne(TARGET_URL);
      expect(req.request.method).toBe('PATCH');
      req.flush('', { status: 200, statusText: 'OK' });
    });

    it('should send a HEAD request', () => {
      const config: HttpRequestConfig = { method: 'HEAD', url: TARGET_URL, headers: {} };

      service.sendRequest(config).subscribe();

      const req = httpMock.expectOne(TARGET_URL);
      expect(req.request.method).toBe('HEAD');
      req.flush('', { status: 200, statusText: 'OK' });
    });

    it('should send an OPTIONS request', () => {
      const config: HttpRequestConfig = { method: 'OPTIONS', url: TARGET_URL, headers: {} };

      service.sendRequest(config).subscribe();

      const req = httpMock.expectOne(TARGET_URL);
      expect(req.request.method).toBe('OPTIONS');
      req.flush('', { status: 200, statusText: 'OK' });
    });

    it('should handle method case-insensitively', () => {
      const config: HttpRequestConfig = { method: 'get', url: TARGET_URL, headers: {} };

      service.sendRequest(config).subscribe();

      const req = httpMock.expectOne(TARGET_URL);
      expect(req.request.method).toBe('GET');
      req.flush('', { status: 200, statusText: 'OK' });
    });

    it('should set custom request headers', () => {
      const config: HttpRequestConfig = {
        method: 'GET',
        url: TARGET_URL,
        headers: {
          'Authorization': 'Bearer my-token',
          'X-Custom-Header': 'custom-value'
        }
      };

      service.sendRequest(config).subscribe();

      const req = httpMock.expectOne(TARGET_URL);
      expect(req.request.headers.get('Authorization')).toBe('Bearer my-token');
      expect(req.request.headers.get('X-Custom-Header')).toBe('custom-value');
      req.flush('', { status: 200, statusText: 'OK' });
    });

    it('should use the generic request method for unknown HTTP methods', () => {
      const config: HttpRequestConfig = {
        method: 'PROPFIND',
        url: TARGET_URL,
        headers: {}
      };

      service.sendRequest(config).subscribe();

      const req = httpMock.expectOne(TARGET_URL);
      expect(req.request.method).toBe('PROPFIND');
      req.flush('', { status: 207, statusText: 'Multi-Status' });
    });
  });
});
