import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RequestService, WiremockRequest } from './request.service';
import { ConfigService } from './config.service';

describe('RequestService', () => {
  let service: RequestService;
  let httpMock: HttpTestingController;
  let configServiceSpy: jasmine.SpyObj<ConfigService>;

  const BASE_URL = 'http://localhost:8080/__admin';

  beforeEach(() => {
    configServiceSpy = jasmine.createSpyObj('ConfigService', [], {
      wiremockApiUrl: BASE_URL
    });

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        RequestService,
        { provide: ConfigService, useValue: configServiceSpy }
      ]
    });

    service = TestBed.inject(RequestService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getRequests', () => {
    it('should GET requests with default limit and offset', () => {
      service.getRequests().subscribe(response => {
        expect(response.requests.length).toBe(2);
      });

      const req = httpMock.expectOne(`${BASE_URL}/requests?limit=50&offset=0`);
      expect(req.request.method).toBe('GET');
      req.flush({ requests: [
        { id: '1', request: { url: '/api/a', method: 'GET', loggedDate: Date.now(), loggedDateString: '', absoluteUrl: '' }, wasMatched: true },
        { id: '2', request: { url: '/api/b', method: 'POST', loggedDate: Date.now(), loggedDateString: '', absoluteUrl: '' }, wasMatched: false }
      ]});
    });

    it('should GET requests with custom limit and offset', () => {
      service.getRequests(100, 20).subscribe();

      const req = httpMock.expectOne(`${BASE_URL}/requests?limit=100&offset=20`);
      expect(req.request.method).toBe('GET');
      req.flush({ requests: [] });
    });
  });

  describe('clearRequests', () => {
    it('should DELETE all requests', () => {
      service.clearRequests().subscribe();

      const req = httpMock.expectOne(`${BASE_URL}/requests`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });
  });

  describe('deleteRequest', () => {
    it('should DELETE a specific request by ID', () => {
      const requestId = 'abc-123';

      service.deleteRequest(requestId).subscribe();

      const req = httpMock.expectOne(`${BASE_URL}/requests/${requestId}`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });
  });

  describe('getRequestById', () => {
    it('should GET a specific request by ID', () => {
      const requestId = 'xyz-789';
      const mockRequest: WiremockRequest = {
        id: requestId,
        request: {
          url: '/api/test',
          absoluteUrl: 'http://localhost/api/test',
          method: 'GET',
          loggedDate: Date.now(),
          loggedDateString: '2024-01-01T00:00:00Z'
        },
        wasMatched: true
      };

      service.getRequestById(requestId).subscribe(response => {
        expect(response.id).toBe(requestId);
        expect(response.request.url).toBe('/api/test');
      });

      const req = httpMock.expectOne(`${BASE_URL}/requests/${requestId}`);
      expect(req.request.method).toBe('GET');
      req.flush(mockRequest);
    });
  });

  describe('getNearMissesForRequest', () => {
    it('should POST request data to near-misses endpoint', () => {
      const mockRequest: WiremockRequest = {
        id: 'nm-test-1',
        request: {
          url: '/api/unmatched',
          absoluteUrl: 'http://localhost/api/unmatched',
          method: 'GET',
          loggedDate: Date.now(),
          loggedDateString: '2024-01-01T00:00:00Z'
        },
        wasMatched: false
      };

      service.getNearMissesForRequest(mockRequest).subscribe(response => {
        expect(response.nearMisses.length).toBe(1);
      });

      const req = httpMock.expectOne(`${BASE_URL}/near-misses/request`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(mockRequest.request);
      req.flush({ nearMisses: [{ request: mockRequest.request, matchResult: { distance: 0.2 } }] });
    });
  });
});
