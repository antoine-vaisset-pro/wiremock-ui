import {ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, OnInit, Output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, Router} from '@angular/router';
import {NearMiss, RequestService, WiremockRequest} from '../../services/request.service';

@Component({
  selector: 'app-requests-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './requests-page.component.html',
  styleUrls: ['./requests-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RequestsPageComponent implements OnInit {
  @Output() createStubRequest = new EventEmitter<WiremockRequest>();
  @Output() navigateToStubRequest = new EventEmitter<string>();

  requests: WiremockRequest[] = [];
  selectedRequest: WiremockRequest | null = null;
  nearMisses: NearMiss[] = [];
  loadingNearMisses = false;
  totalRequests = 0;
  nearMissCache = new Map<string, NearMiss[]>(); // Near-miss cache by request ID
  requestHeadersExpanded = false;
  selectedRequestIds = new Set<string>();
  selectAllRequests = false;
  loading = false;
  error: string | null = null;
  activeRequestViewTab: 'details' | 'json' = 'details';

  // Filters
  statusFilter: 'all' | 'matched' | 'unmatched' | 'near-miss-90' = 'all';
  methodFilters = new Set<string>();
  responseCodeFilter: 'all' | '2xx' | '3xx' | '4xx' | '5xx' = 'all';
  dateRangeFilter: 'all' | 'last-hour' | 'last-24h' | 'last-7d' | 'today' | 'custom' = 'all';
  customDateFrom = '';
  customDateTo = '';
  availableMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];

  // Derived / cached state for template binding (avoids ExpressionChangedAfterChecked)
  filteredRequests: WiremockRequest[] = [];
  activeFiltersCount = 0;
  selectedRequestHeaders: {key: string, value: string}[] = [];
  selectedResponseHeaders: {key: string, value: string}[] = [];
  selectedRequestBody = '';
  selectedResponseBody = '';
  selectedResponseStatus: number | null = null;

  get searchQuery(): string { return this._searchQuery; }
  set searchQuery(value: string) {
    this._searchQuery = value;
    this.refreshDerivedState();
  }
  private _searchQuery = '';

  constructor(
    private requestService: RequestService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  /** Recomputes all derived state used by the template. Must be called after any state mutation. */
  private refreshDerivedState(): void {
    this.filteredRequests = this.computeFilteredRequests();
    this.activeFiltersCount = this.computeActiveFiltersCount();
    if (this.selectedRequest) {
      this.selectedRequestHeaders = this.computeRequestHeaders(this.selectedRequest);
      this.selectedResponseHeaders = this.computeResponseHeaders(this.selectedRequest);
      this.selectedRequestBody = this.computeRequestBody(this.selectedRequest);
      this.selectedResponseBody = this.computeResponseBody(this.selectedRequest);
      this.selectedResponseStatus = this.computeResponseStatus(this.selectedRequest);
    } else {
      this.selectedRequestHeaders = [];
      this.selectedResponseHeaders = [];
      this.selectedRequestBody = '';
      this.selectedResponseBody = '';
      this.selectedResponseStatus = null;
    }
    this.cdr.markForCheck();
  }

  ngOnInit(): void {
    // Load requests first
    this.loadRequests().then(() => {
      // Then restore state from URL
      this.route.params.subscribe(params => {
        if (params['id']) {
          // Select the specific request from URL
          const request = this.requests.find(r => r.id === params['id']);
          if (request) {
            this.selectRequest(request, false); // false to avoid re-navigating
          }
        }
      });
    });

    // Restore filters from URL
    this.route.queryParams.subscribe(params => {
      if (params['status']) {
        this.statusFilter = params['status'];
      }
      if (params['method']) {
        const methods = params['method'].split(',');
        this.methodFilters = new Set(methods);
      }
      if (params['responseCode']) {
        this.responseCodeFilter = params['responseCode'];
      }
      if (params['dateRange']) {
        this.dateRangeFilter = params['dateRange'];
      }
      if (params['dateFrom']) {
        this.customDateFrom = params['dateFrom'];
      }
      if (params['dateTo']) {
        this.customDateTo = params['dateTo'];
      }
      this.refreshDerivedState();
    });
  }

  loadRequests(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.loading = true;
      this.error = null;

      this.requestService.getRequests(1000, 0).subscribe({
        next: (response) => {
          this.requests = response.requests || [];
          this.totalRequests = response.meta?.total || this.requests.length;
          this.loading = false;

          // Load near-misses for all unmatched requests
          this.loadNearMissesForAllUnmatched();
          this.refreshDerivedState();
          resolve();
        },
        error: (err) => {
          this.error = 'Failed to load requests.';
          console.error('Error loading requests:', err);
          this.loading = false;
          this.refreshDerivedState();
          reject(err);
        }
      });
    });
  }

  loadNearMissesForAllUnmatched(): void {
    const unmatchedRequests = this.requests.filter(req => !req.wasMatched);

    if (unmatchedRequests.length === 0) {
      return;
    }

    console.log(`Loading near-misses for ${unmatchedRequests.length} unmatched requests...`);

    unmatchedRequests.forEach(request => {
      this.requestService.getNearMissesForRequest(request).subscribe({
        next: (response) => {
          this.nearMissCache.set(request.id, response.nearMisses);
          this.refreshDerivedState();
        },
        error: (err) => {
          console.error(`Error loading near-misses for request ${request.id}:`, err);
          this.nearMissCache.set(request.id, []); // Set empty array on error
          this.refreshDerivedState();
        }
      });
    });
  }

  selectRequest(request: WiremockRequest, updateUrl = true): void {
    this.selectedRequest = request;
    this.requestHeadersExpanded = false;
    this.activeRequestViewTab = 'details';

    if (request && !request.wasMatched) {
      this.loadNearMisses(request);
    } else {
      this.nearMisses = [];
    }

    // Update URL with request ID only if requested
    if (updateUrl) {
      this.router.navigate(['/ui/requests', request.id], {
        queryParamsHandling: 'preserve'
      });
    }
    this.refreshDerivedState();
  }

  loadNearMisses(request: WiremockRequest): void {
    this.loadingNearMisses = true;
    this.nearMisses = [];

    this.requestService.getNearMissesForRequest(request).subscribe({
      next: (response) => {
        this.nearMisses = response.nearMisses.slice(0, 3);
        // Cache the near-misses for filtering
        this.nearMissCache.set(request.id, response.nearMisses);
        this.loadingNearMisses = false;
        this.refreshDerivedState();
      },
      error: (err) => {
        console.error('Error loading near-misses:', err);
        this.loadingNearMisses = false;
        this.refreshDerivedState();
      }
    });
  }


  closeRequestDetails(): void {
    this.selectedRequest = null;
    this.nearMisses = [];
    this.requestHeadersExpanded = false;
    this.refreshDerivedState();
  }

  clearRequests(): void {
    if (!confirm('Are you sure you want to clear all request logs?')) {
      return;
    }

    this.requestService.clearRequests().subscribe({
      next: () => {
        this.selectedRequest = null;
        this.refreshDerivedState();
        this.loadRequests();
        console.log('Requests cleared successfully');
      },
      error: (err) => {
        console.error('Error clearing requests:', err);
        alert('Failed to clear requests');
      }
    });
  }

  refreshRequests(): void {
    this.loadRequests();
  }

  deleteSelectedRequests(): void {
    console.log('Delete selected requests:', this.selectedRequestIds);
  }

  toggleSelectAll(): void {
    this.selectAllRequests = !this.selectAllRequests;
    if (this.selectAllRequests) {
      this.filteredRequests.forEach(req => this.selectedRequestIds.add(req.id));
    } else {
      this.selectedRequestIds.clear();
    }
    this.cdr.markForCheck();
  }

  toggleRequestSelection(requestId: string): void {
    if (this.selectedRequestIds.has(requestId)) {
      this.selectedRequestIds.delete(requestId);
    } else {
      this.selectedRequestIds.add(requestId);
    }
    this.cdr.markForCheck();
  }

  private computeFilteredRequests(): WiremockRequest[] {
    let filtered = [...this.requests];


    // Search query filter
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(req =>
        req.request?.url?.toLowerCase().includes(query) ||
        req.request?.method?.toLowerCase().includes(query) ||
        req.stubMapping?.name?.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (this.statusFilter === 'matched') {
      filtered = filtered.filter(req => req.wasMatched);
    } else if (this.statusFilter === 'unmatched') {
      filtered = filtered.filter(req => !req.wasMatched);
    } else if (this.statusFilter === 'near-miss-90') {
      // Filter unmatched requests that have high near-miss scores
      filtered = filtered.filter(req => {
        if (req.wasMatched) return false;

        // Check cache for near-miss score
        if (this.nearMissCache.has(req.id)) {
          const nearMisses = this.nearMissCache.get(req.id) || [];
          return nearMisses.some(nm => (1 - nm.matchResult.distance) >= 0.9);
        }

        // If not in cache, don't show
        return false;
      });
    }

    // Method filter
    if (this.methodFilters.size > 0) {
      filtered = filtered.filter(req =>
        this.methodFilters.has(req.request?.method || '')
      );
    }

    // Response code filter
    if (this.responseCodeFilter !== 'all') {
      filtered = filtered.filter(req => {
        const status = req.response?.status || req.responseDefinition?.status;
        if (!status) return false;

        switch (this.responseCodeFilter) {
          case '2xx': return status >= 200 && status < 300;
          case '3xx': return status >= 300 && status < 400;
          case '4xx': return status >= 400 && status < 500;
          case '5xx': return status >= 500 && status < 600;
          default: return true;
        }
      });
    }

    // Date range filter
    if (this.dateRangeFilter !== 'all') {
      const now = new Date();
      let startDate: Date | null = null;

      switch (this.dateRangeFilter) {
        case 'last-hour':
          startDate = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case 'last-24h':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'last-7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'custom':
          if (this.customDateFrom) {
            startDate = new Date(this.customDateFrom);
          }
          break;
      }

      if (startDate) {
        filtered = filtered.filter(req => {
          const reqDate = new Date(req.request?.loggedDate || 0);
          if (this.dateRangeFilter === 'custom' && this.customDateTo) {
            const endDate = new Date(this.customDateTo);
            endDate.setHours(23, 59, 59, 999);
            return reqDate >= startDate! && reqDate <= endDate;
          }
          return reqDate >= startDate!;
        });
      }
    }

    return filtered;
  }

  /** Public accessor kept for backward compatibility with tests; template uses filteredRequests property */
  getFilteredRequests(): WiremockRequest[] {
    return this.computeFilteredRequests();
  }

  formatDate(timestamp: number | string | undefined): string {
    if (!timestamp) return '';
    const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
    return date.toLocaleString('fr-FR');
  }

  formatDateShort(timestamp: number | string | undefined): string {
    if (!timestamp) return '';
    const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  private computeRequestHeaders(request: WiremockRequest): {key: string, value: string}[] {
    const headers: {key: string, value: string}[] = [];
    if (request.request?.headers) {
      Object.keys(request.request.headers).forEach(key => {
        const value = request.request.headers![key];
        headers.push({
          key,
          value: Array.isArray(value) ? value.join(', ') : String(value)
        });
      });
    }
    return headers;
  }

  private computeResponseHeaders(request: WiremockRequest): {key: string, value: string}[] {
    const headers: {key: string, value: string}[] = [];
    const responseHeaders = request.response?.headers || request.responseDefinition?.headers;

    if (responseHeaders) {
      Object.keys(responseHeaders).forEach(key => {
        const value = responseHeaders[key];
        headers.push({
          key,
          value: Array.isArray(value) ? value.join(', ') : String(value)
        });
      });
    }
    return headers;
  }

  private computeRequestBody(request: WiremockRequest): string {
    if (request.request?.body) {
      try {
        const parsed = JSON.parse(request.request.body);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return request.request.body;
      }
    }
    return '';
  }

  private computeResponseBody(request: WiremockRequest): string {
    const body = request.response?.body || request.responseDefinition?.body;
    const jsonBody = request.responseDefinition?.jsonBody;

    if (jsonBody) {
      return JSON.stringify(jsonBody, null, 2);
    }
    if (body) {
      try {
        const parsed = JSON.parse(body);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return body;
      }
    }
    return '';
  }

  setRequestViewTab(tab: 'details' | 'json'): void {
    this.activeRequestViewTab = tab;
    this.cdr.markForCheck();
  }

  toggleRequestHeaders(): void {
    this.requestHeadersExpanded = !this.requestHeadersExpanded;
    this.cdr.markForCheck();
  }

  copyRequestJson(): void {
    if (this.selectedRequest) {
      const json = JSON.stringify(this.selectedRequest, null, 2);
      navigator.clipboard.writeText(json).then(() => {
        console.log('Request JSON copied to clipboard');
      });
    }
  }

  navigateToStub(stubId: string): void {
    console.log('Navigate to stub:', stubId);
    this.router.navigate(['/ui/stubs', stubId]);
  }

  createStubFromRequest(): void {
    if (this.selectedRequest) {
      // Encode the request in the URL to pass to the stubs page
      const requestData = encodeURIComponent(JSON.stringify(this.selectedRequest));
      this.router.navigate(['/ui/stubs'], {
        queryParams: { createFrom: requestData }
      });
    }
  }

  // Filter methods
  setStatusFilter(status: 'all' | 'matched' | 'unmatched' | 'near-miss-90'): void {
    this.statusFilter = status;
    this.refreshDerivedState();
  }

  toggleMethodFilter(method: string): void {
    if (this.methodFilters.has(method)) {
      this.methodFilters.delete(method);
    } else {
      this.methodFilters.add(method);
    }
    this.refreshDerivedState();
  }

  setResponseCodeFilter(filter: 'all' | '2xx' | '3xx' | '4xx' | '5xx'): void {
    this.responseCodeFilter = filter;
    this.refreshDerivedState();
  }

  setDateRangeFilter(filter: 'all' | 'last-hour' | 'last-24h' | 'last-7d' | 'today' | 'custom'): void {
    this.dateRangeFilter = filter;
    this.refreshDerivedState();
  }

  clearAllFilters(): void {
    this.statusFilter = 'all';
    this.methodFilters.clear();
    this.responseCodeFilter = 'all';
    this.dateRangeFilter = 'all';
    this.customDateFrom = '';
    this.customDateTo = '';
    this._searchQuery = '';
    this.refreshDerivedState();
  }

  private computeActiveFiltersCount(): number {
    let count = 0;
    if (this.statusFilter !== 'all') count++;
    if (this.methodFilters.size > 0) count++;
    if (this.responseCodeFilter !== 'all') count++;
    if (this.dateRangeFilter !== 'all') count++;
    if (this.searchQuery) count++;
    return count;
  }

  getBestNearMissScore(requestId: string): number {
    if (this.nearMissCache.has(requestId)) {
      const nearMisses = this.nearMissCache.get(requestId) || [];
      if (nearMisses.length > 0) {
        return Math.max(...nearMisses.map(nm => 1 - nm.matchResult.distance));
      }
    }
    return 0;
  }

  hasHighNearMiss(requestId: string): boolean {
    return this.getBestNearMissScore(requestId) >= 0.9;
  }

  private computeResponseStatus(request: WiremockRequest): number | null {
    return request.response?.status || request.responseDefinition?.status || null;
  }

  getResponseStatus(request: WiremockRequest): number | null {
    return this.computeResponseStatus(request);
  }

  getResponseCodeClass(status: number | null): string {
    if (!status) return '';
    if (status >= 200 && status < 300) return 'bg-success';
    if (status >= 300 && status < 400) return 'bg-info';
    if (status >= 400 && status < 500) return 'bg-warning';
    if (status >= 500) return 'bg-danger';
    return 'bg-secondary';
  }

  getRequestTooltip(request: WiremockRequest): string {
    const method = request.request?.method || 'ANY';
    const url = request.request?.absoluteUrl || request.request?.url || '';
    const status = this.getResponseStatus(request);
    const date = request.request?.loggedDate ? new Date(request.request.loggedDate) : null;
    const time = date ? date.toLocaleTimeString('fr-FR') : '';
    const matchStatus = request.wasMatched ? 'MATCHED' : 'UNMATCHED';

    let tooltip = `${method} ${url}\n`;
    if (status) {
      tooltip += `Response: ${status}\n`;
    }
    tooltip += `Status: ${matchStatus}\n`;
    if (time) {
      tooltip += `Time: ${time}`;
    }

    return tooltip;
  }
}

