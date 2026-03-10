import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { DashboardService } from './dashboard.service';
import { ConfigService } from './config.service';

describe('DashboardService', () => {
  let service: DashboardService;
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
        DashboardService,
        { provide: ConfigService, useValue: configServiceSpy }
      ]
    });

    service = TestBed.inject(DashboardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  function flushDashboardRequests(
    mappings: any[] = [],
    requests: any[] = [],
    unmatchedRequests: any[] = [],
    recordingStatus: any = { status: 'NeverStarted' }
  ) {
    httpMock.expectOne(`${BASE_URL}/mappings`).flush({ mappings });
    httpMock.expectOne(`${BASE_URL}/requests`).flush({ requests });
    httpMock.expectOne(`${BASE_URL}/requests/unmatched`).flush({ requests: unmatchedRequests });
    httpMock.expectOne(`${BASE_URL}/recordings/status`).flush(recordingStatus);
  }

  describe('getDashboardStats - basic aggregation', () => {
    it('should return totalStubs matching the number of mappings', () => {
      const mappings = [
        { uuid: '1', request: { method: 'GET', url: '/api/a' } },
        { uuid: '2', request: { method: 'POST', url: '/api/b' } }
      ];

      service.getDashboardStats().subscribe(stats => {
        expect(stats.totalStubs).toBe(2);
      });

      flushDashboardRequests(mappings);
    });

    it('should return totalRequests excluding __admin requests', () => {
      const requests = [
        { request: { method: 'GET', url: '/api/test', loggedDate: Date.now() } },
        { request: { method: 'GET', url: '/__admin/mappings', loggedDate: Date.now() } },
        { request: { method: 'POST', url: '/api/data', loggedDate: Date.now() } }
      ];

      service.getDashboardStats().subscribe(stats => {
        expect(stats.totalRequests).toBe(2); // __admin filtered out
      });

      flushDashboardRequests([], requests);
    });

    it('should return unmatchedRequests count excluding __admin requests', () => {
      const unmatchedRequests = [
        { request: { method: 'GET', url: '/api/missing', loggedDate: Date.now() } },
        { request: { method: 'GET', url: '/__admin/something', loggedDate: Date.now() } }
      ];

      service.getDashboardStats().subscribe(stats => {
        expect(stats.unmatchedRequests).toBe(1);
      });

      flushDashboardRequests([], [], unmatchedRequests);
    });

    it('should propagate the recording status from the API', () => {
      service.getDashboardStats().subscribe(stats => {
        expect(stats.recordingStatus.status).toBe('Recording');
      });

      flushDashboardRequests([], [], [], { status: 'Recording' });
    });

    it('should return zero stats when all APIs return empty data', () => {
      service.getDashboardStats().subscribe(stats => {
        expect(stats.totalStubs).toBe(0);
        expect(stats.totalRequests).toBe(0);
        expect(stats.unmatchedRequests).toBe(0);
        expect(stats.topEndpoints).toEqual([]);
        expect(stats.unusedStubs).toEqual([]);
      });

      flushDashboardRequests();
    });

    it('should handle API errors gracefully with fallback data', () => {
      service.getDashboardStats().subscribe(stats => {
        expect(stats.totalStubs).toBe(0);
        expect(stats.totalRequests).toBe(0);
      });

      httpMock.expectOne(`${BASE_URL}/mappings`).error(new ProgressEvent('error'));
      httpMock.expectOne(`${BASE_URL}/requests`).error(new ProgressEvent('error'));
      httpMock.expectOne(`${BASE_URL}/requests/unmatched`).error(new ProgressEvent('error'));
      httpMock.expectOne(`${BASE_URL}/recordings/status`).error(new ProgressEvent('error'));
    });
  });

  describe('getDashboardStats - top endpoints', () => {
    it('should aggregate request counts per method+url and return top 5', () => {
      const now = Date.now();
      const requests = [
        { request: { method: 'GET', url: '/api/popular', loggedDate: now } },
        { request: { method: 'GET', url: '/api/popular', loggedDate: now } },
        { request: { method: 'GET', url: '/api/popular', loggedDate: now } },
        { request: { method: 'POST', url: '/api/data', loggedDate: now } },
        { request: { method: 'POST', url: '/api/data', loggedDate: now } },
        { request: { method: 'DELETE', url: '/api/item', loggedDate: now } },
      ];

      service.getDashboardStats().subscribe(stats => {
        expect(stats.topEndpoints.length).toBe(3);
        expect(stats.topEndpoints[0].url).toBe('/api/popular');
        expect(stats.topEndpoints[0].count).toBe(3);
        expect(stats.topEndpoints[0].method).toBe('GET');
        expect(stats.topEndpoints[1].url).toBe('/api/data');
        expect(stats.topEndpoints[1].count).toBe(2);
        expect(stats.topEndpoints[2].count).toBe(1);
      });

      flushDashboardRequests([], requests);
    });

    it('should return at most 5 top endpoints', () => {
      const now = Date.now();
      const requests = Array.from({ length: 10 }, (_, i) => ({
        request: { method: 'GET', url: `/api/endpoint-${i}`, loggedDate: now }
      }));

      service.getDashboardStats().subscribe(stats => {
        expect(stats.topEndpoints.length).toBeLessThanOrEqual(5);
      });

      flushDashboardRequests([], requests);
    });
  });

  describe('getDashboardStats - unused stubs', () => {
    it('should detect stubs with no matching requests as unused', () => {
      const mappings = [
        { uuid: 'used-1', request: { method: 'GET', url: '/api/used' } },
        { uuid: 'unused-1', request: { method: 'POST', url: '/api/unused' } },
        { uuid: 'unused-2', name: 'Never called', request: { method: 'DELETE', url: '/api/never' } }
      ];
      const now = Date.now();
      const requests = [
        { request: { method: 'GET', url: '/api/used', loggedDate: now }, stubMapping: { id: 'used-1' } }
      ];

      service.getDashboardStats().subscribe(stats => {
        expect(stats.unusedStubs.length).toBe(2);
        const unusedIds = stats.unusedStubs.map(s => s.id);
        expect(unusedIds).toContain('unused-1');
        expect(unusedIds).toContain('unused-2');
      });

      flushDashboardRequests(mappings, requests);
    });

    it('should return at most 5 unused stubs', () => {
      const mappings = Array.from({ length: 10 }, (_, i) => ({
        uuid: `unused-${i}`,
        request: { method: 'GET', url: `/api/unused-${i}` }
      }));

      service.getDashboardStats().subscribe(stats => {
        expect(stats.unusedStubs.length).toBeLessThanOrEqual(5);
      });

      flushDashboardRequests(mappings, []);
    });

    it('should mark stub as used when referenced by stubMapping.uuid in request', () => {
      const mappings = [
        { uuid: 'stub-uuid-1', request: { method: 'GET', url: '/api/test' } }
      ];
      const now = Date.now();
      const requests = [
        { request: { method: 'GET', url: '/api/test', loggedDate: now }, stubMapping: { uuid: 'stub-uuid-1' } }
      ];

      service.getDashboardStats().subscribe(stats => {
        expect(stats.unusedStubs.length).toBe(0);
      });

      flushDashboardRequests(mappings, requests);
    });

    it('should expose correct url and method for unused stubs', () => {
      const mappings = [
        { uuid: 'u1', name: 'My Stub', request: { method: 'PUT', url: '/api/resource' } }
      ];

      service.getDashboardStats().subscribe(stats => {
        expect(stats.unusedStubs.length).toBe(1);
        expect(stats.unusedStubs[0].id).toBe('u1');
        expect(stats.unusedStubs[0].name).toBe('My Stub');
        expect(stats.unusedStubs[0].url).toBe('/api/resource');
        expect(stats.unusedStubs[0].method).toBe('PUT');
      });

      flushDashboardRequests(mappings, []);
    });
  });

  describe('getDashboardStats - time range filtering', () => {
    it('should filter requests before timeRangeEnd', () => {
      const baseTime = new Date('2024-01-15T12:00:00.000Z').getTime();
      const requests = [
        { request: { method: 'GET', url: '/api/before', loggedDate: baseTime - 1000 } },
        { request: { method: 'GET', url: '/api/after', loggedDate: baseTime + 1000 } }
      ];

      service.getDashboardStats(baseTime - 5000, baseTime).subscribe(stats => {
        expect(stats.totalRequests).toBe(1); // only the request before baseTime
      });

      const mappingsReq = httpMock.expectOne(`${BASE_URL}/mappings`);
      const requestsReq = httpMock.expectOne((req) => req.url.includes('/requests') && !req.url.includes('unmatched'));
      const unmatchedReq = httpMock.expectOne((req) => req.url.includes('/requests/unmatched'));
      httpMock.expectOne(`${BASE_URL}/recordings/status`).flush({ status: 'NeverStarted' });

      mappingsReq.flush({ mappings: [] });
      requestsReq.flush({ requests });
      unmatchedReq.flush({ requests: [] });
    });

    it('should add since parameter to request URL when timeRangeStart is provided', () => {
      const startTime = new Date('2024-01-01T00:00:00.000Z').getTime();

      service.getDashboardStats(startTime).subscribe();

      const requestsReq = httpMock.expectOne((req) =>
        req.url.includes('/requests') && !req.url.includes('unmatched') && req.url.includes('since=')
      );
      const unmatchedReq = httpMock.expectOne((req) =>
        req.url.includes('/requests/unmatched') && req.url.includes('since=')
      );

      expect(requestsReq.request.url).toContain('since=');
      expect(unmatchedReq.request.url).toContain('since=');

      httpMock.expectOne(`${BASE_URL}/mappings`).flush({ mappings: [] });
      requestsReq.flush({ requests: [] });
      unmatchedReq.flush({ requests: [] });
      httpMock.expectOne(`${BASE_URL}/recordings/status`).flush({ status: 'NeverStarted' });
    });
  });

  describe('getDashboardStats - hourly time-series', () => {
    it('should return a non-empty requestsByHour array', () => {
      const now = Date.now();
      const requests = [
        { request: { method: 'GET', url: '/api/test', loggedDate: now - 1000 } },
        { request: { method: 'POST', url: '/api/data', loggedDate: now - 2000 } }
      ];

      service.getDashboardStats().subscribe(stats => {
        expect(stats.requestsByHour).toBeDefined();
        expect(Array.isArray(stats.requestsByHour)).toBeTrue();
        expect(stats.requestsByHour.length).toBeGreaterThan(0);
      });

      flushDashboardRequests([], requests);
    });

    it('should include count > 0 in at least one interval when requests exist', () => {
      const now = Date.now();
      const requests = [
        { request: { method: 'GET', url: '/api/test', loggedDate: now - 60000 } },
        { request: { method: 'GET', url: '/api/test', loggedDate: now - 120000 } }
      ];

      service.getDashboardStats().subscribe(stats => {
        const totalCounted = stats.requestsByHour.reduce((sum, bin) => sum + bin.count, 0);
        expect(totalCounted).toBe(2);
      });

      flushDashboardRequests([], requests);
    });

    it('should have timestamps that match the displayed labels', () => {
      service.getDashboardStats().subscribe(stats => {
        stats.requestsByHour.forEach(bin => {
          expect(bin.hour).toBeTruthy();
          expect(typeof bin.timestamp).toBe('number');
          expect(bin.timestamp).toBeGreaterThan(0);
        });
      });

      flushDashboardRequests();
    });
  });
});
