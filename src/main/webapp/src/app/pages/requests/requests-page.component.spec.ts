import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { RequestsPageComponent } from './requests-page.component';
import { RequestService, WiremockRequest } from '../../services/request.service';

function makeRequest(
  overrides: Partial<WiremockRequest> & { request?: Partial<WiremockRequest['request']> } = {}
): WiremockRequest {
  return {
    id: overrides.id || 'req-' + Math.random(),
    wasMatched: overrides.wasMatched !== undefined ? overrides.wasMatched : true,
    request: {
      url: '/api/test',
      absoluteUrl: 'http://localhost/api/test',
      method: 'GET',
      loggedDate: Date.now(),
      loggedDateString: new Date().toISOString(),
      ...overrides.request
    },
    response: overrides.response,
    responseDefinition: overrides.responseDefinition,
    stubMapping: overrides.stubMapping
  };
}

describe('RequestsPageComponent', () => {
  let component: RequestsPageComponent;
  let fixture: ComponentFixture<RequestsPageComponent>;
  let requestServiceSpy: jasmine.SpyObj<RequestService>;
  let routerSpy: jasmine.SpyObj<Router>;

  const defaultRequests: WiremockRequest[] = [
    makeRequest({ id: '1', wasMatched: true, request: { method: 'GET', url: '/api/users', loggedDate: Date.now(), loggedDateString: '', absoluteUrl: '' }, response: { status: 200 } }),
    makeRequest({ id: '2', wasMatched: false, request: { method: 'POST', url: '/api/orders', loggedDate: Date.now(), loggedDateString: '', absoluteUrl: '' }, response: { status: 404 } }),
    makeRequest({ id: '3', wasMatched: true, request: { method: 'DELETE', url: '/api/items/5', loggedDate: Date.now(), loggedDateString: '', absoluteUrl: '' }, response: { status: 204 } }),
    makeRequest({ id: '4', wasMatched: true, request: { method: 'GET', url: '/api/products', loggedDate: Date.now(), loggedDateString: '', absoluteUrl: '' }, response: { status: 500 } })
  ];

  beforeEach(() => {
    requestServiceSpy = jasmine.createSpyObj('RequestService', [
      'getRequests', 'clearRequests', 'deleteRequest', 'getNearMissesForRequest'
    ]);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    requestServiceSpy.getRequests.and.returnValue(of({ requests: defaultRequests }));
    requestServiceSpy.getNearMissesForRequest.and.returnValue(of({ nearMisses: [] }));

    TestBed.configureTestingModule({
      imports: [RequestsPageComponent],
      providers: [
        { provide: RequestService, useValue: requestServiceSpy },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            params: of({}),
            queryParams: of({})
          }
        }
      ]
    });

    fixture = TestBed.createComponent(RequestsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  describe('loadRequests', () => {
    it('should load requests on init', async () => {
      await component.loadRequests();
      expect(component.requests.length).toBe(4);
      expect(component.loading).toBeFalse();
    });

    it('should set error state on load failure', async () => {
      requestServiceSpy.getRequests.and.returnValue(throwError(() => new Error('Network error')));
      try {
        await component.loadRequests();
      } catch { /* expected */ }
      expect(component.error).toBeTruthy();
      expect(component.loading).toBeFalse();
    });
  });

  describe('selectRequest', () => {
    it('should set selectedRequest', () => {
      const req = defaultRequests[0];
      component.selectRequest(req, false);
      expect(component.selectedRequest).toEqual(req);
    });

    it('should navigate to request URL when updateUrl is true', () => {
      const req = defaultRequests[0];
      component.selectRequest(req, true);
      expect(routerSpy.navigate).toHaveBeenCalledWith(
        ['/ui/requests', req.id],
        jasmine.objectContaining({ queryParamsHandling: 'preserve' })
      );
    });

    it('should NOT navigate when updateUrl is false', () => {
      const req = defaultRequests[0];
      component.selectRequest(req, false);
      expect(routerSpy.navigate).not.toHaveBeenCalled();
    });

    it('should load near-misses for unmatched requests', () => {
      const unmatchedReq = defaultRequests[1]; // wasMatched: false
      component.selectRequest(unmatchedReq, false);
      expect(requestServiceSpy.getNearMissesForRequest).toHaveBeenCalled();
    });

    it('should clear near-misses for matched requests', () => {
      component.nearMisses = [{ request: { url: '/api/x', absoluteUrl: '', method: 'GET', loggedDate: 0, loggedDateString: '' }, matchResult: { distance: 0.1 } }];
      const matchedReq = defaultRequests[0]; // wasMatched: true
      component.selectRequest(matchedReq, false);
      expect(component.nearMisses).toEqual([]);
    });

    it('should reset activeRequestViewTab to details', () => {
      component.activeRequestViewTab = 'json';
      component.selectRequest(defaultRequests[0], false);
      expect(component.activeRequestViewTab).toBe('details');
    });
  });

  describe('closeRequestDetails', () => {
    it('should clear selectedRequest', () => {
      component.selectedRequest = defaultRequests[0];
      component.closeRequestDetails();
      expect(component.selectedRequest).toBeNull();
    });

    it('should clear nearMisses', () => {
      component.nearMisses = [{ request: { url: '/api/x', absoluteUrl: '', method: 'GET', loggedDate: 0, loggedDateString: '' }, matchResult: { distance: 0.1 } }];
      component.closeRequestDetails();
      expect(component.nearMisses).toEqual([]);
    });
  });

  describe('getFilteredRequests', () => {
    beforeEach(async () => {
      await component.loadRequests();
    });

    it('should return all requests when no filter is set', () => {
      component.statusFilter = 'all';
      component.methodFilters = new Set();
      component.responseCodeFilter = 'all';
      component.searchQuery = '';
      expect(component.getFilteredRequests().length).toBe(4);
    });

    describe('status filter', () => {
      it('should filter to only matched requests', () => {
        component.statusFilter = 'matched';
        const filtered = component.getFilteredRequests();
        expect(filtered.every(r => r.wasMatched)).toBeTrue();
        expect(filtered.length).toBe(3);
      });

      it('should filter to only unmatched requests', () => {
        component.statusFilter = 'unmatched';
        const filtered = component.getFilteredRequests();
        expect(filtered.every(r => !r.wasMatched)).toBeTrue();
        expect(filtered.length).toBe(1);
      });
    });

    describe('method filter', () => {
      it('should filter by a single HTTP method', () => {
        component.methodFilters = new Set(['GET']);
        const filtered = component.getFilteredRequests();
        expect(filtered.every(r => r.request.method === 'GET')).toBeTrue();
        expect(filtered.length).toBe(2);
      });

      it('should filter by multiple HTTP methods', () => {
        component.methodFilters = new Set(['GET', 'DELETE']);
        const filtered = component.getFilteredRequests();
        expect(filtered.every(r => r.request.method === 'GET' || r.request.method === 'DELETE')).toBeTrue();
        expect(filtered.length).toBe(3);
      });

      it('should return all requests when method filter is empty', () => {
        component.methodFilters = new Set();
        expect(component.getFilteredRequests().length).toBe(4);
      });
    });

    describe('response code filter', () => {
      it('should filter 2xx responses', () => {
        component.responseCodeFilter = '2xx';
        const filtered = component.getFilteredRequests();
        expect(filtered.every(r => r.response!.status! >= 200 && r.response!.status! < 300)).toBeTrue();
        expect(filtered.length).toBeGreaterThanOrEqual(1);
      });

      it('should filter 4xx responses', () => {
        component.responseCodeFilter = '4xx';
        const filtered = component.getFilteredRequests();
        expect(filtered.every(r => r.response!.status! >= 400 && r.response!.status! < 500)).toBeTrue();
        expect(filtered.length).toBe(1);
      });

      it('should filter 5xx responses', () => {
        component.responseCodeFilter = '5xx';
        const filtered = component.getFilteredRequests();
        expect(filtered.every(r => r.response!.status! >= 500 && r.response!.status! < 600)).toBeTrue();
        expect(filtered.length).toBe(1);
      });
    });

    describe('search query filter', () => {
      it('should filter by URL substring (case-insensitive)', () => {
        component.searchQuery = 'users';
        const filtered = component.getFilteredRequests();
        expect(filtered.length).toBe(1);
        expect(filtered[0].request.url).toContain('users');
      });

      it('should filter by method (case-insensitive)', () => {
        component.searchQuery = 'delete';
        const filtered = component.getFilteredRequests();
        expect(filtered.length).toBe(1);
        expect(filtered[0].request.method).toBe('DELETE');
      });

      it('should return empty array when search matches nothing', () => {
        component.searchQuery = 'nonexistent-endpoint-xyz';
        expect(component.getFilteredRequests().length).toBe(0);
      });
    });

    describe('date range filter', () => {
      it('should filter requests in the last hour', () => {
        // All requests have loggedDate = Date.now(), so they should all be in last hour
        component.dateRangeFilter = 'last-hour';
        const filtered = component.getFilteredRequests();
        expect(filtered.length).toBe(4);
      });

      it('should return no results for last-hour when all requests are old', () => {
        const oldTimestamp = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago
        component.requests = [
          makeRequest({ id: 'old', wasMatched: true, request: { method: 'GET', url: '/old', loggedDate: oldTimestamp, loggedDateString: '', absoluteUrl: '' } })
        ];
        component.dateRangeFilter = 'last-hour';
        const filtered = component.getFilteredRequests();
        expect(filtered.length).toBe(0);
      });
    });

    describe('combined filters', () => {
      it('should apply multiple filters simultaneously', () => {
        component.statusFilter = 'matched';
        component.methodFilters = new Set(['GET']);
        const filtered = component.getFilteredRequests();
        expect(filtered.every(r => r.wasMatched && r.request.method === 'GET')).toBeTrue();
      });
    });
  });

  describe('toggleRequestSelection', () => {
    it('should add request ID to selection', () => {
      component.toggleRequestSelection('1');
      expect(component.selectedRequestIds.has('1')).toBeTrue();
    });

    it('should remove request ID from selection when toggled again', () => {
      component.toggleRequestSelection('1');
      component.toggleRequestSelection('1');
      expect(component.selectedRequestIds.has('1')).toBeFalse();
    });
  });

  describe('toggleSelectAll', () => {
    beforeEach(async () => {
      await component.loadRequests();
    });

    it('should select all filtered requests when toggling on', () => {
      component.selectAllRequests = false;
      component.statusFilter = 'all';
      component.toggleSelectAll();
      expect(component.selectedRequestIds.size).toBe(4);
    });

    it('should clear all selections when toggling off', () => {
      component.selectAllRequests = true; // start as true, toggle will set to false
      component.toggleSelectAll();
      expect(component.selectedRequestIds.size).toBe(0);
    });
  });
});
