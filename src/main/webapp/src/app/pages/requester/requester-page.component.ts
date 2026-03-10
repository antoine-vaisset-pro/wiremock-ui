import {Component, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {HttpResponse} from '@angular/common/http';
import {MappingService} from '../../services/mapping.service';
import {ConfigService, WIREMOCK_ADMIN_SUFFIX} from '../../services/config.service';
import {HttpRequesterService, HttpResponseData} from '../../services/http-requester.service';
import {MappingsResponse, StubMapping} from '../../models/stub-mapping.model';

@Component({
  selector: 'app-requester-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './requester-page.component.html',
  styleUrls: ['./requester-page.component.css']
})
export class RequesterPageComponent implements OnInit {
  requesterForm = {
    selectedStubId: '',
    baseUrl: '',
    method: 'GET',
    url: '',
    headers: [] as { key: string; value: string }[],
    body: ''
  };
  requesterResponse: HttpResponseData | null = null;
  requesterLoading = false;
  requesterError = '';
  allStubs: StubMapping[] = [];

  constructor(
    private mappingService: MappingService,
    private httpRequesterService: HttpRequesterService,
    private configService: ConfigService
  ) {}

  ngOnInit(): void {
    // Initialize baseUrl with the WireMock URL configured in settings
    this.requesterForm.baseUrl = this.getWiremockBaseUrl();
    this.loadAllStubs();
  }

  loadAllStubs(): void {
    this.mappingService.getMappings(0, 1000, '').subscribe({
      next: (response: MappingsResponse) => {
        this.allStubs = response.mappings;
      },
      error: (err) => {
        console.error('Error loading stubs for requester:', err);
      }
    });
  }

  onStubSelected(): void {
    if (!this.requesterForm.selectedStubId) {
      this.resetRequesterForm();
      return;
    }

    const stub = this.allStubs.find(s => (s.uuid || s.id) === this.requesterForm.selectedStubId);
    if (!stub) return;

    this.requesterForm.method = stub.request?.method || 'GET';
    this.requesterForm.url = this.getUrl(stub);

    this.requesterForm.headers = [];
    if (stub.request?.headers) {
      Object.keys(stub.request.headers).forEach(key => {
        const value = stub.request.headers![key];
        let headerValue: string;
        if (typeof value === 'object' && value !== null) {
          headerValue = (value as any).equalTo || (value as any).contains || (value as any).matches || JSON.stringify(value);
        } else {
          headerValue = String(value);
        }
        this.requesterForm.headers.push({ key, value: headerValue });
      });
    }
    // Do not add a default Content-Type if the stub does not define one

    if (stub.request?.bodyPatterns && stub.request.bodyPatterns.length > 0) {
      const firstPattern = stub.request.bodyPatterns[0];
      if (firstPattern.equalToJson !== undefined) {
        // JSON body: serialize properly
        this.requesterForm.body = typeof firstPattern.equalToJson === 'string'
            ? firstPattern.equalToJson
            : JSON.stringify(firstPattern.equalToJson, null, 2);
        // Add Content-Type application/json if not already present
        if (!this.requesterForm.headers.some(h => h.key.toLowerCase() === 'content-type')) {
          this.requesterForm.headers.push({ key: 'Content-Type', value: 'application/json' });
        }
      } else if (firstPattern.equalToXml !== undefined) {
        // Body XML
        this.requesterForm.body = firstPattern.equalToXml;
        if (!this.requesterForm.headers.some(h => h.key.toLowerCase() === 'content-type')) {
          this.requesterForm.headers.push({ key: 'Content-Type', value: 'application/xml' });
        }
      } else if (firstPattern.equalTo !== undefined) {
        // Body texte brut
        this.requesterForm.body = firstPattern.equalTo;
      } else if (firstPattern.matchesXPath !== undefined || (firstPattern as any).matchingXPath !== undefined) {
        // XPath pattern: infer XML
        this.requesterForm.body = '';
        if (!this.requesterForm.headers.some(h => h.key.toLowerCase() === 'content-type')) {
          this.requesterForm.headers.push({ key: 'Content-Type', value: 'application/xml' });
        }
      } else if (firstPattern.matchesJsonPath !== undefined || (firstPattern as any).matchingJsonPath !== undefined) {
        // JsonPath pattern: infer JSON
        this.requesterForm.body = '';
        if (!this.requesterForm.headers.some(h => h.key.toLowerCase() === 'content-type')) {
          this.requesterForm.headers.push({ key: 'Content-Type', value: 'application/json' });
        }
      } else {
        this.requesterForm.body = '';
      }
    } else {
      this.requesterForm.body = '';
    }
  }

  addRequesterHeader(): void {
    this.requesterForm.headers.push({ key: '', value: '' });
  }

  removeRequesterHeader(index: number): void {
    this.requesterForm.headers.splice(index, 1);
  }

  resetRequesterForm(): void {
    const currentBaseUrl = this.requesterForm.baseUrl || this.getWiremockBaseUrl();
    this.requesterForm = {
      selectedStubId: '',
      baseUrl: currentBaseUrl,
      method: 'GET',
      url: '',
      headers: [],
      body: ''
    };
    this.requesterResponse = null;
    this.requesterError = '';
  }

  sendHttpRequest(): void {
    this.requesterLoading = true;
    this.requesterError = '';
    this.requesterResponse = null;

    const headers: { [key: string]: string } = {};
    this.requesterForm.headers.forEach(h => {
      if (h.key && h.value) {
        headers[h.key] = h.value;
      }
    });

    // Build the full URL by combining baseUrl and url
    let fullUrl = this.requesterForm.url;
    if (this.requesterForm.baseUrl) {
      // If the URL does not start with http://, combine with baseUrl
      if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
        // Ensure there is a slash between baseUrl and url
        const baseUrlWithoutSlash = this.requesterForm.baseUrl.replace(/\/$/, '');
        const urlWithSlash = fullUrl.startsWith('/') ? fullUrl : `/${fullUrl}`;
        fullUrl = `${baseUrlWithoutSlash}${urlWithSlash}`;
      }
    }

    const startTime = Date.now();

    this.httpRequesterService.sendRequest({
      method: this.requesterForm.method,
      url: fullUrl,
      headers: headers,
      body: this.requesterForm.body || undefined
    }).subscribe({
      next: (response: HttpResponse<any>) => {
        const timing = Date.now() - startTime;

        const responseHeaders: { [key: string]: string } = {};
        response.headers.keys().forEach(key => {
          responseHeaders[key] = response.headers.get(key) || '';
        });

        this.requesterResponse = {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: response.body || '',
          timing: timing
        };
        this.requesterLoading = false;
      },
      error: (err) => {
        const timing = Date.now() - startTime;

        if (err.status) {
          const responseHeaders: { [key: string]: string } = {};
          if (err.headers) {
            err.headers.keys().forEach((key: string) => {
              responseHeaders[key] = err.headers.get(key) || '';
            });
          }

          this.requesterResponse = {
            status: err.status,
            statusText: err.statusText || 'Error',
            headers: responseHeaders,
            body: err.error || '',
            timing: timing
          };
        } else {
          this.requesterError = 'Network error: ' + (err.message || 'Unable to connect to WireMock');
        }
        this.requesterLoading = false;
      }
    });
  }

  getResponseBodyFormatted(): string {
    if (!this.requesterResponse) return '';

    try {
      const parsed = JSON.parse(this.requesterResponse.body);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return this.requesterResponse.body;
    }
  }

  getResponseHeadersArray(): Array<{key: string, value: string}> {
    if (!this.requesterResponse) return [];

    return Object.keys(this.requesterResponse.headers).map(key => ({
      key,
      value: this.requesterResponse!.headers[key]
    }));
  }

  copyRequesterResponse(): void {
    if (this.requesterResponse) {
      navigator.clipboard.writeText(this.getResponseBodyFormatted()).then(() => {
        console.log('Response copied to clipboard');
      });
    }
  }

  getStubDisplayName(stub: StubMapping): string {
    return stub.name || `${stub.request?.method || 'ANY'} ${this.getUrl(stub)}`;
  }

  getUrl(mapping: StubMapping): string {
    return mapping.request?.url
      || mapping.request?.urlPattern
      || mapping.request?.urlPath
      || mapping.request?.urlPathPattern
      || '/';
  }

  private getWiremockBaseUrl(): string {
    // wiremockApiUrl = baseUrl + WIREMOCK_ADMIN_SUFFIX, strip suffix to get root URL
    return this.configService.wiremockApiUrl.replace(new RegExp(`${WIREMOCK_ADMIN_SUFFIX}$`), '');
  }
}

