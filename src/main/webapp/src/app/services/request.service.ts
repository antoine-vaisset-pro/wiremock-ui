import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ConfigService } from './config.service';

export interface WiremockRequest {
  id: string;
  request: {
    url: string;
    absoluteUrl: string;
    method: string;
    clientIp?: string;
    headers?: Record<string, string>;
    body?: string;
    bodyAsBase64?: string;
    loggedDate: number;
    loggedDateString: string;
  };
  response?: {
    status: number;
    headers?: Record<string, string>;
    body?: string;
    bodyAsBase64?: string;
  };
  responseDefinition?: {
    status: number;
    body?: string;
    jsonBody?: any;
    headers?: Record<string, string>;
  };
  wasMatched: boolean;
  stubMapping?: {
    id?: string;
    uuid?: string;
    name?: string;
  };
}

export interface RequestsResponse {
  requests: WiremockRequest[];
  meta?: {
    total: number;
  };
}

export interface NearMiss {
  request: {
    url: string;
    absoluteUrl: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
    loggedDate: number;
    loggedDateString: string;
  };
  requestPattern?: {
    url?: string;
    urlPattern?: string;
    method?: string;
  };
  stubMapping?: {
    id?: string;
    uuid?: string;
    name?: string;
    request?: any;
    response?: any;
  };
  matchResult: {
    distance: number;
  };
}

export interface NearMissesResponse {
  nearMisses: NearMiss[];
}

@Injectable({
  providedIn: 'root'
})
export class RequestService {
  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) { }

  private get baseUrl(): string {
    return this.configService.wiremockApiUrl;
  }

  getRequests(limit = 50, offset = 0): Observable<RequestsResponse> {
    return this.http.get<RequestsResponse>(`${this.baseUrl}/requests?limit=${limit}&offset=${offset}`);
  }

  clearRequests(): Observable<any> {
    return this.http.delete(`${this.baseUrl}/requests`);
  }

  deleteRequest(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/requests/${id}`);
  }

  getRequestById(id: string): Observable<WiremockRequest> {
    return this.http.get<WiremockRequest>(`${this.baseUrl}/requests/${id}`);
  }

  getNearMissesForRequest(request: WiremockRequest): Observable<NearMissesResponse> {
    return this.http.post<NearMissesResponse>(`${this.baseUrl}/near-misses/request`, request.request);
  }
}
