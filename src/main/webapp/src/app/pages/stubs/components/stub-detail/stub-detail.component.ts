import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { StubMapping } from '../../../../models/stub-mapping.model';

@Component({
  selector: 'app-stub-detail',
  standalone: true,
  imports: [CommonModule, NgbModule],
  templateUrl: './stub-detail.component.html',
  styleUrls: ['./stub-detail.component.scss']
})
export class StubDetailComponent {
  @Input() selectedMapping: StubMapping | null = null;

  @Output() editRequested = new EventEmitter<void>();
  @Output() cloneRequested = new EventEmitter<void>();
  @Output() deleteRequested = new EventEmitter<void>();
  @Output() closeRequested = new EventEmitter<void>();

  activeResponseTab: 'direct' | 'fault' | 'proxy' = 'direct';
  activeViewTab: 'details' | 'json' = 'details';

  setResponseTab(tab: 'direct' | 'fault' | 'proxy'): void {
    this.activeResponseTab = tab;
  }

  setViewTab(tab: 'details' | 'json'): void {
    this.activeViewTab = tab;
  }

  resetTabs(): void {
    this.activeViewTab = 'details';
    this.activeResponseTab = 'direct';
  }

  getUrl(mapping: StubMapping): string {
    return mapping.request?.url
      || mapping.request?.urlPattern
      || mapping.request?.urlPath
      || mapping.request?.urlPathPattern
      || '/';
  }

  getHeaders(mapping: StubMapping): Array<{ key: string; value: string }> {
    const headers: Array<{ key: string; value: string }> = [];
    if (mapping.response?.headers) {
      Object.keys(mapping.response.headers).forEach(key => {
        const value = mapping.response!.headers![key];
        headers.push({
          key,
          value: Array.isArray(value) ? value.join(', ') : String(value)
        });
      });
    }
    return headers;
  }

  getFormattedBody(mapping: StubMapping): string {
    if (mapping.response?.jsonBody) {
      return JSON.stringify(mapping.response.jsonBody, null, 2);
    }
    if (mapping.response?.body) {
      try {
        const parsed = JSON.parse(mapping.response.body);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return mapping.response.body;
      }
    }
    return '';
  }

  copyBody(): void {
    if (this.selectedMapping) {
      const body = this.getFormattedBody(this.selectedMapping);
      navigator.clipboard.writeText(body).then(() => {
        console.log('Body copied to clipboard');
      });
    }
  }

  copyJson(): void {
    if (this.selectedMapping) {
      const json = JSON.stringify(this.selectedMapping, null, 2);
      navigator.clipboard.writeText(json).then(() => {
        console.log('JSON copied to clipboard');
      });
    }
  }
}
