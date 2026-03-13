import {Injectable} from '@angular/core';
import {HttpClient, HttpHeaders, HttpResponse} from '@angular/common/http';
import {Observable} from 'rxjs';

export interface HttpRequestConfig {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface HttpResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  timing: number;
}

@Injectable({
  providedIn: 'root'
})
export class HttpRequesterService {
  // Do not include baseUrl, use the path directly so the proxy works
  constructor(private http: HttpClient) {}

  sendRequest(config: HttpRequestConfig): Observable<HttpResponse<any>> {
    const headers = new HttpHeaders(config.headers);
    // Use the provided URL directly (Angular proxy will redirect to WireMock)
    const url = config.url;

    const options = {
      headers: headers,
      observe: 'response' as const,
      responseType: 'text' as const
    };

    switch (config.method.toUpperCase()) {
      case 'GET':
        return this.http.get(url, options);
      case 'POST':
        return this.http.post(url, config.body, options);
      case 'PUT':
        return this.http.put(url, config.body, options);
      case 'DELETE':
        return this.http.delete(url, options);
      case 'PATCH':
        return this.http.patch(url, config.body, options);
      case 'HEAD':
        return this.http.head(url, options);
      case 'OPTIONS':
        return this.http.options(url, options);
      default:
        return this.http.request(config.method, url, { ...options, body: config.body });
    }
  }
}

