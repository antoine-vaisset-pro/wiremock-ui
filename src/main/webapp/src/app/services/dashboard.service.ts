import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, map, catchError, of } from 'rxjs';
import { ConfigService } from './config.service';

export interface DashboardStats {
  totalStubs: number;
  totalRequests: number;
  unmatchedRequests: number;
  recordingStatus: RecordingStatus;
  version: string;
  requestsByHour: RequestsTimeserie[];
  topEndpoints: EndpointStats[];
  unusedStubs: UnusedStub[];
}

export interface RecordingStatus {
  status: 'Stopped' | 'Recording' | 'NeverStarted';
}

export interface RequestsTimeserie {
  hour: string;
  count: number;
  timestamp: number; // Data point timestamp for precise datetime display in the tooltip
}

export interface EndpointStats {
  url: string;
  method: string;
  count: number;
}

export interface UnusedStub {
  id: string;
  name?: string;
  url: string;
  method: string;
}

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private get baseUrl(): string {
    return this.configService.wiremockApiUrl;
  }

  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) {}

  getDashboardStats(timeRangeStart?: number, timeRangeEnd?: number): Observable<DashboardStats> {
    // Build query parameters to filter by date on the WireMock side
    let requestsUrl = `${this.baseUrl}/requests`;
    let unmatchedUrl = `${this.baseUrl}/requests/unmatched`;

    if (timeRangeStart) {
      // Use WireMock API 'since' parameter to filter on the backend side
      requestsUrl += `?since=${new Date(timeRangeStart).toISOString()}`;
      unmatchedUrl += `?since=${new Date(timeRangeStart).toISOString()}`;
    }

    return forkJoin({
      mappings: this.http.get<any>(`${this.baseUrl}/mappings`).pipe(
        catchError(() => of({ mappings: [] }))
      ),
      requests: this.http.get<any>(requestsUrl).pipe(
        catchError(() => of({ requests: [] }))
      ),
      unmatchedRequests: this.http.get<any>(unmatchedUrl).pipe(
        catchError(() => of({ requests: [] }))
      ),
      recordingStatus: this.http.get<any>(`${this.baseUrl}/recordings/status`).pipe(
        catchError(() => of({ status: 'NeverStarted' }))
      )
    }).pipe(
      map(data => this.transformDashboardData(data, timeRangeStart, timeRangeEnd))
    );
  }

  private transformDashboardData(data: any, timeRangeStart?: number, timeRangeEnd?: number): DashboardStats {
    const mappings = data.mappings?.mappings || [];
    let requests = data.requests?.requests || [];
    let unmatchedRequests = data.unmatchedRequests?.requests || [];

    // Filter out requests to __admin (internal API requests)
    requests = requests.filter((req: any) =>
      !req.request?.url?.includes('__admin')
    );

    unmatchedRequests = unmatchedRequests.filter((req: any) =>
      !req.request?.url?.includes('__admin')
    );

    // Date filtering is already done on the backend via the 'since' parameter
    // Just apply additional filtering for endTime if provided
    if (timeRangeEnd) {
      requests = requests.filter((req: any) =>
        req.request?.loggedDate &&
        req.request.loggedDate <= timeRangeEnd
      );
      unmatchedRequests = unmatchedRequests.filter((req: any) =>
        req.request?.loggedDate &&
        req.request.loggedDate <= timeRangeEnd
      );
    }

    // Log filtered requests for debug
    console.log('[DASHBOARD SERVICE] Requests after filtering:', {
      total: requests.length,
      unmatched: unmatchedRequests.length,
      requests: requests.map((r: any) => ({
        method: r.request?.method,
        url: r.request?.url,
        loggedDate: r.request?.loggedDate ? new Date(r.request.loggedDate).toISOString() : 'N/A'
      }))
    });

    // Calculate statistics per hour
    const requestsByHour = this.calculateHourlyStats(requests, timeRangeStart, timeRangeEnd);

    // Top 5 most called endpoints
    const topEndpoints = this.calculateTopEndpoints(requests);

    // Top 5 stubs never used
    const unusedStubs = this.calculateUnusedStubs(mappings, requests);

    return {
      totalStubs: mappings.length,
      totalRequests: requests.length,
      unmatchedRequests: unmatchedRequests.length,
      recordingStatus: data.recordingStatus,
      version: 'WireMock',
      requestsByHour,
      topEndpoints,
      unusedStubs
    };
  }

  private calculateHourlyStats(requests: any[], timeRangeStart?: number, timeRangeEnd?: number): RequestsTimeserie[] {
    const now = Date.now();
    const endTime = timeRangeEnd || now;
    const startTime = timeRangeStart || (now - 24 * 60 * 60 * 1000);

    // Calculate the period duration in milliseconds
    const periodDurationMs = endTime - startTime;
    const periodDurationMinutes = periodDurationMs / (60 * 1000);
    const periodDurationHours = periodDurationMs / (60 * 60 * 1000);
    const periodDurationDays = periodDurationMs / (24 * 60 * 60 * 1000);

    // Maximum number of points to display
    const MAX_POINTS = 60;

    // Calculate the optimal interval to have approximately MAX_POINTS points
    const optimalIntervalMs = periodDurationMs / MAX_POINTS;

    // Determine interval and display format based on computed granularity
    let intervalMs: number;
    let formatLabel: (date: Date) => string;
    let granularityLabel: string;

    // Define standard interval thresholds (in milliseconds)
    const MINUTE = 60 * 1000;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;

    // Determine if the period spans multiple days (to display date+time on X axis)
    const spansMultipleDays = periodDurationHours > 24;

    if (optimalIntervalMs <= MINUTE) {
      // Interval < 1 minute: round to the minute
      intervalMs = MINUTE;
      granularityLabel = '1min';
      formatLabel = spansMultipleDays
        ? (date) => `${date.getDate()}/${date.getMonth() + 1} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
        : (date) => `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } else if (optimalIntervalMs <= 2 * MINUTE) {
      // 1-2 minutes : 2 minutes
      intervalMs = 2 * MINUTE;
      granularityLabel = '2min';
      formatLabel = spansMultipleDays
        ? (date) => `${date.getDate()}/${date.getMonth() + 1} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
        : (date) => `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } else if (optimalIntervalMs <= 5 * MINUTE) {
      // 2-5 minutes : 5 minutes
      intervalMs = 5 * MINUTE;
      granularityLabel = '5min';
      formatLabel = spansMultipleDays
        ? (date) => `${date.getDate()}/${date.getMonth() + 1} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
        : (date) => `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } else if (optimalIntervalMs <= 10 * MINUTE) {
      // 5-10 minutes : 10 minutes
      intervalMs = 10 * MINUTE;
      granularityLabel = '10min';
      formatLabel = spansMultipleDays
        ? (date) => `${date.getDate()}/${date.getMonth() + 1} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
        : (date) => `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } else if (optimalIntervalMs <= 15 * MINUTE) {
      // 10-15 minutes : 15 minutes
      intervalMs = 15 * MINUTE;
      granularityLabel = '15min';
      formatLabel = spansMultipleDays
        ? (date) => `${date.getDate()}/${date.getMonth() + 1} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
        : (date) => `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } else if (optimalIntervalMs <= 30 * MINUTE) {
      // 15-30 minutes : 30 minutes
      intervalMs = 30 * MINUTE;
      granularityLabel = '30min';
      formatLabel = spansMultipleDays
        ? (date) => `${date.getDate()}/${date.getMonth() + 1} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
        : (date) => `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } else if (optimalIntervalMs <= HOUR) {
      // 30min-1h : 1 heure
      intervalMs = HOUR;
      granularityLabel = '1h';
      formatLabel = (date) => `${date.getDate()}/${date.getMonth() + 1} ${date.getHours().toString().padStart(2, '0')}:00`;
    } else if (optimalIntervalMs <= 2 * HOUR) {
      // 1-2h : 2 heures
      intervalMs = 2 * HOUR;
      granularityLabel = '2h';
      formatLabel = (date) => `${date.getDate()}/${date.getMonth() + 1} ${date.getHours().toString().padStart(2, '0')}h`;
    } else if (optimalIntervalMs <= 3 * HOUR) {
      // 2-3h : 3 heures
      intervalMs = 3 * HOUR;
      granularityLabel = '3h';
      formatLabel = (date) => `${date.getDate()}/${date.getMonth() + 1} ${date.getHours().toString().padStart(2, '0')}h`;
    } else if (optimalIntervalMs <= 6 * HOUR) {
      // 3-6h : 6 heures
      intervalMs = 6 * HOUR;
      granularityLabel = '6h';
      formatLabel = (date) => `${date.getDate()}/${date.getMonth() + 1} ${date.getHours().toString().padStart(2, '0')}h`;
    } else if (optimalIntervalMs <= 12 * HOUR) {
      // 6-12h : 12 heures
      intervalMs = 12 * HOUR;
      granularityLabel = '12h';
      formatLabel = (date) => `${date.getDate()}/${date.getMonth() + 1} ${date.getHours().toString().padStart(2, '0')}h`;
    } else if (optimalIntervalMs <= DAY) {
      // 12h-1j : 1 jour
      intervalMs = DAY;
      granularityLabel = '1j';
      formatLabel = (date) => `${date.getDate()}/${date.getMonth() + 1}`;
    } else if (optimalIntervalMs <= 7 * DAY) {
      // 1-7j : 1 semaine
      intervalMs = 7 * DAY;
      granularityLabel = '1sem';
      formatLabel = (date) => `Sem ${Math.floor(date.getDate() / 7) + 1} ${date.getMonth() + 1}/${date.getFullYear()}`;
    } else {
      // > 7j : 1 mois (approximatif : 30 jours)
      intervalMs = 30 * DAY;
      granularityLabel = '1mois';
      formatLabel = (date) => `${date.getMonth() + 1}/${date.getFullYear()}`;
    }

    // Group with a full timestamp to avoid collisions
    const dataMap = new Map<number, { hour: string; count: number; timestamp: number }>();

    // Helper function to round a timestamp to the chosen interval
    const roundToInterval = (timestamp: number): number => {
      const date = new Date(timestamp);

      if (intervalMs < 60 * 60 * 1000) {
        // For minutes: round to the minute or multiple of minutes
        const minutes = Math.floor(date.getMinutes() / (intervalMs / (60 * 1000))) * (intervalMs / (60 * 1000));
        return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), minutes).getTime();
      } else if (intervalMs < 24 * 60 * 60 * 1000) {
        // For hours: round to the hour or multiple of hours
        const hours = Math.floor(date.getHours() / (intervalMs / (60 * 60 * 1000))) * (intervalMs / (60 * 60 * 1000));
        return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours).getTime();
      } else if (intervalMs === 24 * 60 * 60 * 1000) {
        // For 1 day: round to the start of the day
        return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      } else if (intervalMs === 7 * 24 * 60 * 60 * 1000) {
        // For 1 week: round to the start of the week (Monday)
        const day = date.getDay();
        const diff = (day === 0 ? -6 : 1) - day; // Lundi = 1
        const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() + diff);
        return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate()).getTime();
      } else {
        // For 1 month: round to the start of the month
        return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
      }
    };

    // Round startTime and endTime to intervals to ensure full period coverage
    const firstIntervalTimestamp = roundToInterval(startTime);
    let lastIntervalTimestamp = roundToInterval(endTime);

    // If endTime is not exactly on an interval, add one more interval
    // to cover requests between roundToInterval(endTime) and endTime
    if (lastIntervalTimestamp < endTime) {
      lastIntervalTimestamp += intervalMs;
    }

    // Initialize all intervals from firstInterval to lastInterval (inclusive)
    let currentTimestamp = firstIntervalTimestamp;
    while (currentTimestamp <= lastIntervalTimestamp) {
      // Format d'affichage
      const label = formatLabel(new Date(currentTimestamp));

      if (!dataMap.has(currentTimestamp)) {
        dataMap.set(currentTimestamp, { hour: label, count: 0, timestamp: currentTimestamp });
      }

      // Passer au prochain intervalle
      currentTimestamp += intervalMs;
    }

    // Debug log
    console.log('[DASHBOARD SERVICE] Chart period:', {
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      firstInterval: new Date(firstIntervalTimestamp).toISOString(),
      lastInterval: new Date(lastIntervalTimestamp).toISOString(),
      periodDurationMinutes: Math.round(periodDurationMinutes),
      periodDurationHours: Math.round(periodDurationHours * 10) / 10,
      periodDurationDays: Math.round(periodDurationDays * 10) / 10,
      optimalIntervalMs: Math.round(optimalIntervalMs),
      granularite: granularityLabel,
      intervalMs: intervalMs,
      nombreIntervalles: dataMap.size,
      intervallesInitialises: Array.from(dataMap.keys()).map(ts => new Date(ts).toISOString())
    });

    // Filter and count requests per interval
    let requestsInPeriod = 0;
    let requestsCounted = 0;
    let requestsOutOfRange = 0;

    requests.forEach(req => {
      if (req.request?.loggedDate &&
          req.request.loggedDate >= startTime &&
          req.request.loggedDate <= endTime) {

        requestsInPeriod++;
        const intervalTimestamp = roundToInterval(req.request.loggedDate);

        if (dataMap.has(intervalTimestamp)) {
          const entry = dataMap.get(intervalTimestamp)!;
          entry.count++;
          requestsCounted++;
        } else {
          // If the interval is not in the displayed range, ignore it
          requestsOutOfRange++;
          console.warn('[DASHBOARD SERVICE] Request out of displayed range:', {
            loggedDate: new Date(req.request.loggedDate).toISOString(),
            intervalTimestamp: new Date(intervalTimestamp).toISOString(),
            firstInterval: new Date(firstIntervalTimestamp).toISOString(),
            lastInterval: new Date(lastIntervalTimestamp).toISOString(),
            method: req.request?.method,
            url: req.request?.url
          });
        }
      }
    });

    console.log('[DASHBOARD SERVICE] Request count:', {
      totalRequestsFiltered: requestsInPeriod,
      requestsCounted: requestsCounted,
      requestsOutOfRange: requestsOutOfRange,
      difference: requestsInPeriod - requestsCounted
    });

    // Convert to array sorted by timestamp
    const result = Array.from(dataMap.entries())
      .sort((a, b) => a[0] - b[0]) // Sort by timestamp
      .map(([, data]) => data);

    console.log('[DASHBOARD SERVICE] Chart result:', result);

    return result;
  }

  private calculateTopEndpoints(requests: any[]): EndpointStats[] {
    const endpointMap = new Map<string, { method: string; count: number }>();

    requests.forEach(req => {
      if (req.request?.url && req.request?.method) {
        const key = `${req.request.method}:${req.request.url}`;
        const existing = endpointMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          endpointMap.set(key, { method: req.request.method, count: 1 });
        }
      }
    });

    return Array.from(endpointMap.entries())
      .map(([key, value]) => ({
        url: key.split(':')[1],
        method: value.method,
        count: value.count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  private calculateUnusedStubs(mappings: any[], requests: any[]): UnusedStub[] {
    const usedStubIds = new Set<string>();

    // Collect all used stub IDs
    requests.forEach(req => {
      if (req.stubMapping?.id) {
        usedStubIds.add(req.stubMapping.id);
      }
      if (req.stubMapping?.uuid) {
        usedStubIds.add(req.stubMapping.uuid);
      }
    });

    // Find unused stubs
    return mappings
      .filter(mapping => {
        const id = mapping.id || mapping.uuid;
        return id && !usedStubIds.has(id);
      })
      .slice(0, 5)
      .map(mapping => ({
        id: mapping.id || mapping.uuid,
        name: mapping.name,
        url: mapping.request?.url || mapping.request?.urlPattern || 'N/A',
        method: mapping.request?.method || 'ANY'
      }));
  }
}

