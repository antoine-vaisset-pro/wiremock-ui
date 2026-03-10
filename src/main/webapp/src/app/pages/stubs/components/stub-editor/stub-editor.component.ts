import { ChangeDetectorRef, Component, EventEmitter, Input, Output, TemplateRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbModal, NgbModalRef, NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { MappingService } from '../../../../services/mapping.service';
import { StubMapping } from '../../../../models/stub-mapping.model';

const MANAGED_TOP_KEYS = new Set([
  'uuid', 'id', 'name', 'priority', 'persistent',
  'request', 'response',
  'scenarioName', 'requiredScenarioState', 'newScenarioState'
]);

const MANAGED_REQUEST_KEYS = new Set([
  'method', 'url', 'urlPath', 'urlPattern', 'urlPathPattern',
  'queryParameters', 'headers', 'bodyPatterns', 'cookies',
  'basicAuthCredentials', 'formParameters'
]);

const MANAGED_RESPONSE_KEYS = new Set([
  'status', 'statusMessage', 'headers', 'body', 'jsonBody', 'base64Body',
  'bodyFileName', 'fault', 'proxyBaseUrl', 'proxyUrlPrefixToRemove',
  'additionalProxyRequestHeaders', 'removeProxyRequestHeaders',
  'fixedDelayMilliseconds', 'delayDistribution', 'chunkedDribbleDelay',
  'transformers'
]);

export interface StubEditorOpenConfig {
  editMode: 'create' | 'edit' | 'clone';
  mapping?: StubMapping;
}

export interface StubSavedEvent {
  savedUuid: string | null;
  editMode: 'create' | 'edit' | 'clone';
}

@Component({
  selector: 'app-stub-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, NgbModule],
  templateUrl: './stub-editor.component.html',
  styleUrls: ['./stub-editor.component.scss']
})
export class StubEditorComponent {
  @Input() availableScenarios: string[] = [];
  /** When true, Save does not call the WireMock API — instead it emits the mapping via mappingReady. */
  @Input() localOnly: boolean = false;

  @Output() saved = new EventEmitter<StubSavedEvent>();
  @Output() cancelled = new EventEmitter<void>();
  /** Emitted instead of saved when localOnly is true. */
  @Output() mappingReady = new EventEmitter<any>();

  @ViewChild('createModalTpl') createModalTpl!: TemplateRef<any>;

  editMode: 'create' | 'edit' | 'clone' = 'create';
  editorMode: 'simple' | 'advanced' = 'simple';
  editingStubUuid: string | null = null;
  showCreateModal = false;
  newStubJson = '';
  createStubError = '';

  private _originalMapping: any = null;
  private _createModalRef: NgbModalRef | null = null;

  simpleForm = {
    name: '',
    method: 'GET',
    url: '',
    urlType: 'url' as 'url' | 'urlPath' | 'urlPattern' | 'urlPathPattern',
    priority: 5,
    persistent: false,
    queryParameters: [] as Array<{ key: string; predicate: string; value: string }>,
    requestHeaders: [] as Array<{ key: string; predicate: string; value: string }>,
    bodyPatterns: [] as Array<{ predicate: string; value: string; ignoreArrayOrder?: boolean; ignoreExtraElements?: boolean }>,
    cookies: [] as Array<{ key: string; predicate: string; value: string }>,
    basicAuthEnabled: false,
    basicAuthUsername: '',
    basicAuthPassword: '',
    formParameters: [] as Array<{ key: string; predicate: string; value: string }>,
    responseMode: 'direct' as 'direct' | 'proxy' | 'fault',
    status: 200,
    statusMessage: '',
    responseHeaders: [{ key: 'Content-Type', value: 'application/json' }] as Array<{ key: string; value: string }>,
    body: '{}',
    bodyType: 'json',
    bodyFileName: '',
    enableTemplating: false,
    faultType: '',
    delayType: '',
    fixedDelay: 0,
    uniformLower: 0,
    uniformUpper: 1000,
    lognormalMedian: 500,
    lognormalSigma: 0.1,
    chunkedChunks: 5,
    chunkedDuration: 1000,
    proxyBaseUrl: '',
    proxyUrlPrefixToRemove: '',
    additionalProxyRequestHeaders: [] as Array<{ key: string; value: string }>,
    removeProxyRequestHeaders: [] as string[],
    scenarioName: '',
    requiredScenarioState: '',
    newScenarioState: ''
  };

  isScenarioSectionExpanded = false;
  isStubInfoExpanded = true;
  isRequestMatchingExpanded = true;
  isQueryParamsExpanded = false;
  isRequestHeadersExpanded = false;
  isBodyPatternsExpanded = false;
  isCookiesExpanded = false;
  isBasicAuthExpanded = false;
  isFormParamsExpanded = false;
  isResponseExpanded = true;
  isDelayExpanded = false;
  isResponseHeadersExpanded = false;
  isTemplatingHelpExpanded = false;
  isProxyAdditionalHeadersExpanded = false;
  isProxyRemoveHeadersExpanded = false;

  isRequestPanelCollapsed = false;
  isResponsePanelCollapsed = false;

  constructor(
    private mappingService: MappingService,
    private modalService: NgbModal,
    private cdr: ChangeDetectorRef
  ) {}

  open(config: StubEditorOpenConfig): void {
    const { editMode, mapping } = config;
    this.editMode = editMode;
    this.editorMode = 'simple';
    this.createStubError = '';
    this.editingStubUuid = null;

    if (editMode === 'create') {
      this.resetSimpleForm();
      this.newStubJson = JSON.stringify({
        name: 'New Stub',
        request: { method: 'GET', url: '/api/example' },
        response: { status: 200, jsonBody: {}, headers: { 'Content-Type': 'application/json' } }
      }, null, 2);
    } else if (editMode === 'edit' && mapping) {
      this.editingStubUuid = mapping.uuid || mapping.id || null;
      this._originalMapping = JSON.parse(JSON.stringify(mapping));
      this.populateSimpleFormFromMapping(mapping);
      this.newStubJson = JSON.stringify(mapping, null, 2);
    } else if (editMode === 'clone' && mapping) {
      const cloned = JSON.parse(JSON.stringify(mapping));
      delete cloned.uuid;
      delete cloned.id;
      cloned.name = (cloned.name || 'Unnamed') + ' [COPY]';
      this._originalMapping = JSON.parse(JSON.stringify(cloned));
      this.populateSimpleFormFromMapping(cloned);
      this.newStubJson = JSON.stringify(cloned, null, 2);
    }

    this.showCreateModal = true;
    this.cdr.detectChanges();
    this._openModal();
  }

  openWithRequestData(requestData: any): void {
    this.editMode = 'create';
    this.editorMode = 'simple';
    this.editingStubUuid = null;
    this.showCreateModal = true;
    this.createStubError = '';

    this.simpleForm.name = `Stub for ${requestData.request?.method || 'ANY'} ${requestData.request?.url || '/'}`;
    this.simpleForm.method = requestData.request?.method || 'GET';

    const rawUrl: string = requestData.request?.url || '';
    try {
      const parsed = new URL('http://placeholder' + rawUrl);
      const path = parsed.pathname;
      const queryParams: Array<{ key: string; predicate: string; value: string }> = [];
      parsed.searchParams.forEach((value, key) => {
        queryParams.push({ key, predicate: 'equalTo', value });
      });
      if (queryParams.length > 0) {
        this.simpleForm.url = path;
        this.simpleForm.urlType = 'urlPath';
        this.simpleForm.queryParameters = queryParams;
        this.isQueryParamsExpanded = true;
      } else {
        this.simpleForm.url = rawUrl;
        this.simpleForm.urlType = 'url';
        this.simpleForm.queryParameters = [];
      }
    } catch {
      this.simpleForm.url = rawUrl;
      this.simpleForm.urlType = 'url';
      this.simpleForm.queryParameters = [];
    }

    const ignoredHeaders = ['host', 'content-length', 'connection'];
    this.simpleForm.requestHeaders = [];
    if (requestData.request?.headers) {
      Object.keys(requestData.request.headers).forEach(key => {
        if (ignoredHeaders.includes(key.toLowerCase())) return;
        const value = requestData.request.headers[key];
        this.simpleForm.requestHeaders.push({
          key,
          predicate: 'equalTo',
          value: Array.isArray(value) ? value.join(', ') : String(value)
        });
      });
    }

    this.simpleForm.status = 200;
    this.simpleForm.responseMode = 'direct';
    this.simpleForm.responseHeaders = [{ key: 'Content-Type', value: 'application/json' }];

    if (requestData.request?.body) {
      try {
        const parsedBody = JSON.parse(requestData.request.body);
        this.simpleForm.body = JSON.stringify({ received: parsedBody }, null, 2);
        this.simpleForm.bodyType = 'json';
      } catch {
        this.simpleForm.body = '{"status": "ok"}';
        this.simpleForm.bodyType = 'json';
      }
    } else {
      this.simpleForm.body = '{"status": "ok"}';
      this.simpleForm.bodyType = 'json';
    }

    this.newStubJson = this.simpleFormToJson();
    this.cdr.detectChanges();
    this._openModal();
  }

  close(): void {
    this.showCreateModal = false;
    this.newStubJson = '';
    this.createStubError = '';
    this.editingStubUuid = null;
    this._originalMapping = null;
    this.resetSimpleForm();
    if (this._createModalRef) {
      this._createModalRef.dismiss();
      this._createModalRef = null;
    }
  }

  private _openModal(): void {
    if (this._createModalRef) {
      return;
    }
    this._createModalRef = this.modalService.open(this.createModalTpl, {
      size: 'xl',
      scrollable: true,
      backdrop: 'static'
    });
    this._createModalRef.dismissed.subscribe(() => {
      this.showCreateModal = false;
      this._createModalRef = null;
      this.newStubJson = '';
      this.createStubError = '';
      this.editingStubUuid = null;
      this._originalMapping = null;
      this.resetSimpleForm();
      this.cancelled.emit();
    });
  }

  toggleEditorMode(): void {
    if (this.editorMode === 'simple') {
      this.newStubJson = this.simpleFormToJson();
      this.editorMode = 'advanced';
    } else {
      try {
        const parsed = JSON.parse(this.newStubJson);
        this._originalMapping = JSON.parse(JSON.stringify(parsed));
        this.populateSimpleFormFromMapping(parsed);
        this.editorMode = 'simple';
        this.createStubError = '';
      } catch (e: any) {
        this.createStubError = 'Cannot switch to simple mode: Invalid JSON - ' + e.message;
      }
    }
  }

  submitNewStub(): void {
    let mappingData: any;

    try {
      if (this.editorMode === 'simple') {
        mappingData = this.simpleFormToMapping();
      } else {
        mappingData = JSON.parse(this.newStubJson);
      }

      if (this.editMode === 'create' || this.editMode === 'clone') {
        delete mappingData.uuid;
        delete mappingData.id;
      }

      if (this.localOnly) {
        this.close();
        this.mappingReady.emit(mappingData);
        return;
      }

      const isCreate = this.editMode === 'create' || this.editMode === 'clone';
      const operation = isCreate
        ? this.mappingService.createMapping(mappingData)
        : this.mappingService.updateMapping(this.editingStubUuid!, mappingData);

      operation.subscribe({
        next: (response) => {
          const savedUuid = isCreate ? (response.uuid || response.id) : this.editingStubUuid;
          this.close();
          this.saved.emit({ savedUuid, editMode: this.editMode });
        },
        error: (err) => {
          this.createStubError = `Failed to ${this.editMode} stub: ` + (err.error?.message || err.message);
        }
      });
    } catch (e: any) {
      this.createStubError = 'Invalid JSON: ' + e.message;
    }
  }

  // ========== Form Field Management ==========

  addHeader(): void { this.simpleForm.responseHeaders.push({ key: '', value: '' }); }
  removeHeader(index: number): void { this.simpleForm.responseHeaders.splice(index, 1); }

  addRequestHeader(): void { this.simpleForm.requestHeaders.push({ key: '', predicate: 'equalTo', value: '' }); }
  removeRequestHeader(index: number): void { this.simpleForm.requestHeaders.splice(index, 1); }

  addQueryParam(): void { this.simpleForm.queryParameters.push({ key: '', predicate: 'equalTo', value: '' }); }
  removeQueryParam(i: number): void { this.simpleForm.queryParameters.splice(i, 1); }

  addBodyPattern(): void { this.simpleForm.bodyPatterns.push({ predicate: 'contains', value: '' }); }
  removeBodyPattern(i: number): void { this.simpleForm.bodyPatterns.splice(i, 1); }

  addCookie(): void { this.simpleForm.cookies.push({ key: '', predicate: 'equalTo', value: '' }); }
  removeCookie(i: number): void { this.simpleForm.cookies.splice(i, 1); }

  addFormParam(): void { this.simpleForm.formParameters.push({ key: '', predicate: 'equalTo', value: '' }); }
  removeFormParam(i: number): void { this.simpleForm.formParameters.splice(i, 1); }

  addProxyAdditionalHeader(): void { this.simpleForm.additionalProxyRequestHeaders.push({ key: '', value: '' }); }
  removeProxyAdditionalHeader(i: number): void { this.simpleForm.additionalProxyRequestHeaders.splice(i, 1); }

  addProxyHeaderToRemove(): void { this.simpleForm.removeProxyRequestHeaders.push(''); }
  removeProxyHeaderToRemove(i: number): void { this.simpleForm.removeProxyRequestHeaders.splice(i, 1); }

  onBodyTypeChange(): void {
    const contentTypeMap: { [key: string]: string } = {
      json: 'application/json',
      html: 'text/html',
      xml: 'application/xml',
      base64: 'application/octet-stream',
      file: 'application/octet-stream'
    };

    const contentType = contentTypeMap[this.simpleForm.bodyType];
    const contentTypeIndex = this.simpleForm.responseHeaders.findIndex(h => h.key.toLowerCase() === 'content-type');

    if (contentType) {
      if (contentTypeIndex >= 0) {
        this.simpleForm.responseHeaders[contentTypeIndex].value = contentType;
      } else {
        this.simpleForm.responseHeaders.unshift({ key: 'Content-Type', value: contentType });
      }
    } else {
      if (contentTypeIndex >= 0) {
        const autoValues = ['application/json', 'text/html', 'application/xml', 'application/octet-stream'];
        if (autoValues.includes(this.simpleForm.responseHeaders[contentTypeIndex].value)) {
          this.simpleForm.responseHeaders.splice(contentTypeIndex, 1);
        }
      }
    }
  }

  isValidRegex(pattern: string): boolean {
    try {
      new RegExp(pattern);
      return true;
    } catch {
      return false;
    }
  }

  getUrlValidationClass(): string {
    if (!this.simpleForm.url || (this.simpleForm.urlType !== 'urlPattern' && this.simpleForm.urlType !== 'urlPathPattern')) return '';
    return this.isValidRegex(this.simpleForm.url) ? 'is-valid' : 'is-invalid';
  }

  predicateNeedsValue(predicate: string): boolean {
    return predicate !== 'absent';
  }

  isFormMethodWithBody(): boolean {
    return ['POST', 'PUT', 'PATCH'].includes(this.simpleForm.method);
  }

  // ========== Section toggles ==========

  toggleScenarioSection(): void { this.isScenarioSectionExpanded = !this.isScenarioSectionExpanded; }
  toggleStubInfoSection(): void { this.isStubInfoExpanded = !this.isStubInfoExpanded; }
  toggleRequestMatchingSection(): void { this.isRequestMatchingExpanded = !this.isRequestMatchingExpanded; }
  toggleQueryParamsSection(): void { this.isQueryParamsExpanded = !this.isQueryParamsExpanded; }
  toggleRequestHeadersSection(): void { this.isRequestHeadersExpanded = !this.isRequestHeadersExpanded; }
  toggleBodyPatternsSection(): void { this.isBodyPatternsExpanded = !this.isBodyPatternsExpanded; }
  toggleCookiesSection(): void { this.isCookiesExpanded = !this.isCookiesExpanded; }
  toggleBasicAuthSection(): void { this.isBasicAuthExpanded = !this.isBasicAuthExpanded; }
  toggleFormParamsSection(): void { this.isFormParamsExpanded = !this.isFormParamsExpanded; }
  toggleResponseSection(): void { this.isResponseExpanded = !this.isResponseExpanded; }
  toggleDelaySection(): void { this.isDelayExpanded = !this.isDelayExpanded; }
  toggleResponseHeadersSection(): void { this.isResponseHeadersExpanded = !this.isResponseHeadersExpanded; }
  toggleTemplatingHelp(): void { this.isTemplatingHelpExpanded = !this.isTemplatingHelpExpanded; }
  toggleProxyAdditionalHeadersSection(): void { this.isProxyAdditionalHeadersExpanded = !this.isProxyAdditionalHeadersExpanded; }
  toggleProxyRemoveHeadersSection(): void { this.isProxyRemoveHeadersExpanded = !this.isProxyRemoveHeadersExpanded; }

  // ========== Private helpers ==========

  private resetSimpleForm(): void {
    this.simpleForm = {
      name: '',
      method: 'GET',
      url: '',
      urlType: 'url',
      priority: 5,
      persistent: false,
      queryParameters: [],
      requestHeaders: [],
      bodyPatterns: [],
      cookies: [],
      basicAuthEnabled: false,
      basicAuthUsername: '',
      basicAuthPassword: '',
      formParameters: [],
      responseMode: 'direct',
      status: 200,
      statusMessage: '',
      responseHeaders: [],
      body: '',
      bodyType: 'text',
      bodyFileName: '',
      enableTemplating: false,
      faultType: '',
      delayType: '',
      fixedDelay: 0,
      uniformLower: 0,
      uniformUpper: 1000,
      lognormalMedian: 500,
      lognormalSigma: 0.1,
      chunkedChunks: 5,
      chunkedDuration: 1000,
      proxyBaseUrl: '',
      proxyUrlPrefixToRemove: '',
      additionalProxyRequestHeaders: [],
      removeProxyRequestHeaders: [],
      scenarioName: '',
      requiredScenarioState: '',
      newScenarioState: ''
    };
    this.isScenarioSectionExpanded = false;
    this.isStubInfoExpanded = true;
    this.isRequestMatchingExpanded = true;
    this.isQueryParamsExpanded = false;
    this.isRequestHeadersExpanded = false;
    this.isBodyPatternsExpanded = false;
    this.isCookiesExpanded = false;
    this.isBasicAuthExpanded = false;
    this.isFormParamsExpanded = false;
    this.isResponseExpanded = true;
    this.isDelayExpanded = false;
    this.isResponseHeadersExpanded = false;
    this.isTemplatingHelpExpanded = false;
    this.isProxyAdditionalHeadersExpanded = false;
    this.isProxyRemoveHeadersExpanded = false;
    this.isRequestPanelCollapsed = false;
    this.isResponsePanelCollapsed = false;
  }

  private objectToKVMatcherArray(obj: any): Array<{ key: string; predicate: string; value: string }> {
    if (!obj) return [];
    return Object.entries(obj).map(([key, pattern]: [string, any]) => {
      const predicate = this.detectStringPredicate(pattern);
      const predicateKey = predicate === 'equalToCI' ? 'equalTo' : predicate;
      return { key, predicate, value: predicate === 'absent' ? '' : (pattern[predicateKey] || '') };
    });
  }

  private detectStringPredicate(pattern: any): string {
    if (pattern?.absent) return 'absent';
    if (pattern?.equalTo !== undefined) return pattern.caseInsensitive ? 'equalToCI' : 'equalTo';
    if (pattern?.contains !== undefined) return 'contains';
    if (pattern?.doesNotContain !== undefined) return 'doesNotContain';
    if (pattern?.matches !== undefined) return 'matches';
    if (pattern?.doesNotMatch !== undefined) return 'doesNotMatch';
    return 'equalTo';
  }

  private populateSimpleFormFromMapping(mapping: any): void {
    this.simpleForm.name = mapping.name || '';
    this.simpleForm.method = mapping.request?.method || 'GET';

    if (mapping.request?.url) {
      this.simpleForm.urlType = 'url';
      this.simpleForm.url = mapping.request.url;
    } else if (mapping.request?.urlPath) {
      this.simpleForm.urlType = 'urlPath';
      this.simpleForm.url = mapping.request.urlPath;
    } else if (mapping.request?.urlPattern) {
      this.simpleForm.urlType = 'urlPattern';
      this.simpleForm.url = mapping.request.urlPattern;
    } else if (mapping.request?.urlPathPattern) {
      this.simpleForm.urlType = 'urlPathPattern';
      this.simpleForm.url = mapping.request.urlPathPattern;
    } else {
      this.simpleForm.urlType = 'url';
      this.simpleForm.url = '';
    }

    this.simpleForm.priority = mapping.priority ?? 5;
    this.simpleForm.persistent = mapping.persistent ?? false;

    this.simpleForm.queryParameters = this.objectToKVMatcherArray(mapping.request?.queryParameters);
    this.simpleForm.requestHeaders = this.objectToKVMatcherArray(mapping.request?.headers);

    this.simpleForm.bodyPatterns = [];
    if (mapping.request?.bodyPatterns) {
      for (const p of mapping.request.bodyPatterns) {
        const predicate = Object.keys(p).find(k => k !== 'ignoreArrayOrder' && k !== 'ignoreExtraElements') || 'contains';
        this.simpleForm.bodyPatterns.push({
          predicate,
          value: p[predicate] || '',
          ignoreArrayOrder: p.ignoreArrayOrder,
          ignoreExtraElements: p.ignoreExtraElements
        });
      }
    }

    this.simpleForm.cookies = this.objectToKVMatcherArray(mapping.request?.cookies);

    if (mapping.request?.basicAuthCredentials) {
      this.simpleForm.basicAuthEnabled = true;
      this.simpleForm.basicAuthUsername = mapping.request.basicAuthCredentials.username || '';
      this.simpleForm.basicAuthPassword = mapping.request.basicAuthCredentials.password || '';
    } else {
      this.simpleForm.basicAuthEnabled = false;
      this.simpleForm.basicAuthUsername = '';
      this.simpleForm.basicAuthPassword = '';
    }

    this.simpleForm.formParameters = this.objectToKVMatcherArray(mapping.request?.formParameters);

    if (mapping.response?.fault) {
      this.simpleForm.responseMode = 'fault';
      this.simpleForm.faultType = mapping.response.fault;
    } else if (mapping.response?.proxyBaseUrl) {
      this.simpleForm.responseMode = 'proxy';
      this.simpleForm.proxyBaseUrl = mapping.response.proxyBaseUrl;
      this.simpleForm.proxyUrlPrefixToRemove = mapping.response.proxyUrlPrefixToRemove || '';
      const addHeaders = mapping.response.additionalProxyRequestHeaders;
      if (addHeaders) {
        this.simpleForm.additionalProxyRequestHeaders = Object.entries(addHeaders).map(([key, value]: [string, any]) => ({ key, value: String(value) }));
      } else {
        this.simpleForm.additionalProxyRequestHeaders = [];
      }
      this.simpleForm.removeProxyRequestHeaders = mapping.response.removeProxyRequestHeaders || [];
    } else {
      this.simpleForm.responseMode = 'direct';
      this.simpleForm.faultType = '';
    }

    this.simpleForm.status = mapping.response?.status || 200;
    this.simpleForm.statusMessage = mapping.response?.statusMessage || '';

    this.simpleForm.responseHeaders = [];
    if (mapping.response?.headers) {
      Object.keys(mapping.response.headers).forEach(key => {
        const value = mapping.response.headers[key];
        this.simpleForm.responseHeaders.push({
          key,
          value: Array.isArray(value) ? value.join(', ') : String(value)
        });
      });
    }

    if (mapping.response?.bodyFileName) {
      this.simpleForm.bodyType = 'file';
      this.simpleForm.bodyFileName = mapping.response.bodyFileName;
      this.simpleForm.body = '';
    } else if (mapping.response?.base64Body) {
      this.simpleForm.bodyType = 'base64';
      this.simpleForm.body = mapping.response.base64Body;
      this.simpleForm.bodyFileName = '';
    } else if (mapping.response?.jsonBody) {
      this.simpleForm.body = JSON.stringify(mapping.response.jsonBody, null, 2);
      this.simpleForm.bodyType = 'json';
      this.simpleForm.bodyFileName = '';
    } else if (mapping.response?.body) {
      this.simpleForm.body = mapping.response.body;
      const contentType = mapping.response?.headers?.['Content-Type'] || '';
      if (contentType.includes('json')) this.simpleForm.bodyType = 'json';
      else if (contentType.includes('html')) this.simpleForm.bodyType = 'html';
      else if (contentType.includes('xml')) this.simpleForm.bodyType = 'xml';
      else this.simpleForm.bodyType = 'text';
      this.simpleForm.bodyFileName = '';
    } else {
      this.simpleForm.body = '{}';
      this.simpleForm.bodyType = 'json';
      this.simpleForm.bodyFileName = '';
    }

    this.simpleForm.enableTemplating = !!(mapping.response?.transformers?.includes('response-template'));

    if (mapping.response?.fixedDelayMilliseconds) {
      this.simpleForm.delayType = 'fixed';
      this.simpleForm.fixedDelay = mapping.response.fixedDelayMilliseconds;
    } else if (mapping.response?.delayDistribution) {
      const dist = mapping.response.delayDistribution;
      if (dist.type === 'uniform') {
        this.simpleForm.delayType = 'uniform';
        this.simpleForm.uniformLower = dist.lower || 0;
        this.simpleForm.uniformUpper = dist.upper || 1000;
      } else if (dist.type === 'lognormal') {
        this.simpleForm.delayType = 'lognormal';
        this.simpleForm.lognormalMedian = dist.median || 500;
        this.simpleForm.lognormalSigma = dist.sigma || 0.1;
      }
    } else if (mapping.response?.chunkedDribbleDelay) {
      this.simpleForm.delayType = 'chunked';
      this.simpleForm.chunkedChunks = mapping.response.chunkedDribbleDelay.numberOfChunks || 5;
      this.simpleForm.chunkedDuration = mapping.response.chunkedDribbleDelay.totalDuration || 1000;
    } else {
      this.simpleForm.delayType = '';
    }

    this.simpleForm.scenarioName = mapping.scenarioName || '';
    this.simpleForm.requiredScenarioState = mapping.requiredScenarioState || '';
    this.simpleForm.newScenarioState = mapping.newScenarioState || '';
    this.isScenarioSectionExpanded = !!(mapping.scenarioName || mapping.requiredScenarioState || mapping.newScenarioState);

    this.isQueryParamsExpanded = this.simpleForm.queryParameters.length > 0;
    this.isRequestHeadersExpanded = this.simpleForm.requestHeaders.length > 0;
    this.isBodyPatternsExpanded = this.simpleForm.bodyPatterns.length > 0;
    this.isCookiesExpanded = this.simpleForm.cookies.length > 0;
    this.isBasicAuthExpanded = this.simpleForm.basicAuthEnabled;
    this.isFormParamsExpanded = this.simpleForm.formParameters.length > 0;
    this.isDelayExpanded = this.simpleForm.delayType !== '';
    this.isResponseHeadersExpanded = false;
  }

  private buildKVMatchers(items: Array<{ key: string; predicate: string; value: string }>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const item of items) {
      if (!item.key.trim()) continue;
      if (item.predicate === 'absent') { result[item.key.trim()] = { absent: true }; continue; }
      if (item.predicate === 'equalToCI') { result[item.key.trim()] = { equalTo: item.value, caseInsensitive: true }; continue; }
      result[item.key.trim()] = { [item.predicate]: item.value };
    }
    return result;
  }

  private buildBodyPatterns(items: Array<{ predicate: string; value: string; ignoreArrayOrder?: boolean; ignoreExtraElements?: boolean }>): any[] {
    return items
      .filter(p => p.value.trim() !== '' || p.predicate === 'absent')
      .map(p => {
        const pattern: any = { [p.predicate]: p.value };
        if (p.predicate === 'equalToJson') {
          if (p.ignoreArrayOrder) pattern.ignoreArrayOrder = true;
          if (p.ignoreExtraElements) pattern.ignoreExtraElements = true;
        }
        return pattern;
      });
  }

  private buildHeadersObject(items: Array<{ key: string; value: string }>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const item of items) {
      if (item.key.trim()) {
        result[item.key.trim()] = item.value;
      }
    }
    return result;
  }

  private simpleFormToMapping(): any {
    const orig = this._originalMapping;
    const mapping: any = {};

    if (orig) {
      for (const key of Object.keys(orig)) {
        if (!MANAGED_TOP_KEYS.has(key)) {
          mapping[key] = JSON.parse(JSON.stringify(orig[key]));
        }
      }
    }

    if (this.simpleForm.name) mapping.name = this.simpleForm.name;
    if (this.simpleForm.priority !== 5) mapping.priority = this.simpleForm.priority;
    if (this.simpleForm.persistent) mapping.persistent = true;

    mapping.request = { method: this.simpleForm.method };
    if (orig?.request) {
      for (const key of Object.keys(orig.request)) {
        if (!MANAGED_REQUEST_KEYS.has(key)) {
          mapping.request[key] = JSON.parse(JSON.stringify(orig.request[key]));
        }
      }
    }

    const urlVal = this.simpleForm.url;
    if (this.simpleForm.urlType === 'url') mapping.request.url = urlVal;
    else if (this.simpleForm.urlType === 'urlPath') mapping.request.urlPath = urlVal;
    else if (this.simpleForm.urlType === 'urlPattern') mapping.request.urlPattern = urlVal;
    else if (this.simpleForm.urlType === 'urlPathPattern') mapping.request.urlPathPattern = urlVal;

    const queryParams = this.buildKVMatchers(this.simpleForm.queryParameters);
    if (Object.keys(queryParams).length > 0) mapping.request.queryParameters = queryParams;

    const reqHeaders = this.buildKVMatchers(this.simpleForm.requestHeaders);
    if (Object.keys(reqHeaders).length > 0) mapping.request.headers = reqHeaders;

    const bodyPatterns = this.buildBodyPatterns(this.simpleForm.bodyPatterns);
    if (bodyPatterns.length > 0) mapping.request.bodyPatterns = bodyPatterns;

    const cookies = this.buildKVMatchers(this.simpleForm.cookies);
    if (Object.keys(cookies).length > 0) mapping.request.cookies = cookies;

    if (this.simpleForm.basicAuthEnabled && this.simpleForm.basicAuthUsername) {
      mapping.request.basicAuthCredentials = {
        username: this.simpleForm.basicAuthUsername,
        password: this.simpleForm.basicAuthPassword
      };
    }

    if (this.isFormMethodWithBody()) {
      const formParams = this.buildKVMatchers(this.simpleForm.formParameters);
      if (Object.keys(formParams).length > 0) mapping.request.formParameters = formParams;
    }

    mapping.response = {};
    if (orig?.response) {
      for (const key of Object.keys(orig.response)) {
        if (!MANAGED_RESPONSE_KEYS.has(key)) {
          mapping.response[key] = JSON.parse(JSON.stringify(orig.response[key]));
        }
      }
    }

    if (this.simpleForm.responseMode === 'fault') {
      mapping.response.fault = this.simpleForm.faultType;
    } else if (this.simpleForm.responseMode === 'proxy') {
      mapping.response.proxyBaseUrl = this.simpleForm.proxyBaseUrl;
      if (this.simpleForm.proxyUrlPrefixToRemove) {
        mapping.response.proxyUrlPrefixToRemove = this.simpleForm.proxyUrlPrefixToRemove;
      }
      const addHeaders = this.buildHeadersObject(this.simpleForm.additionalProxyRequestHeaders);
      if (Object.keys(addHeaders).length > 0) {
        mapping.response.additionalProxyRequestHeaders = addHeaders;
      }
      const removeHeaders = this.simpleForm.removeProxyRequestHeaders.filter(h => h.trim());
      if (removeHeaders.length > 0) {
        mapping.response.removeProxyRequestHeaders = removeHeaders;
      }
    } else {
      mapping.response.status = this.simpleForm.status;
      if (this.simpleForm.statusMessage) {
        mapping.response.statusMessage = this.simpleForm.statusMessage;
      }

      const respHeaders = this.buildHeadersObject(this.simpleForm.responseHeaders);
      if (Object.keys(respHeaders).length > 0) {
        mapping.response.headers = respHeaders;
      }

      if (this.simpleForm.bodyType === 'file') {
        if (this.simpleForm.bodyFileName) {
          mapping.response.bodyFileName = this.simpleForm.bodyFileName;
        }
      } else if (this.simpleForm.bodyType === 'json') {
        try {
          mapping.response.jsonBody = JSON.parse(this.simpleForm.body);
        } catch {
          mapping.response.body = this.simpleForm.body;
        }
      } else if (this.simpleForm.bodyType === 'base64') {
        mapping.response.base64Body = this.simpleForm.body;
      } else {
        if (this.simpleForm.body) {
          mapping.response.body = this.simpleForm.body;
        }
      }

      if (this.simpleForm.enableTemplating) {
        const existingTransformers: string[] = orig?.response?.transformers
          ? [...orig.response.transformers]
          : [];
        if (!existingTransformers.includes('response-template')) {
          existingTransformers.push('response-template');
        }
        mapping.response.transformers = existingTransformers;
      } else if (orig?.response?.transformers) {
        const remaining = orig.response.transformers.filter((t: string) => t !== 'response-template');
        if (remaining.length > 0) {
          mapping.response.transformers = remaining;
        }
      }
    }

    if (this.simpleForm.responseMode !== 'fault') {
      if (this.simpleForm.delayType === 'fixed') {
        mapping.response.fixedDelayMilliseconds = this.simpleForm.fixedDelay;
      } else if (this.simpleForm.delayType === 'uniform') {
        mapping.response.delayDistribution = {
          type: 'uniform',
          lower: this.simpleForm.uniformLower,
          upper: this.simpleForm.uniformUpper
        };
      } else if (this.simpleForm.delayType === 'lognormal') {
        mapping.response.delayDistribution = {
          type: 'lognormal',
          median: this.simpleForm.lognormalMedian,
          sigma: this.simpleForm.lognormalSigma
        };
      } else if (this.simpleForm.delayType === 'chunked') {
        mapping.response.chunkedDribbleDelay = {
          numberOfChunks: this.simpleForm.chunkedChunks,
          totalDuration: this.simpleForm.chunkedDuration
        };
      }
    }

    if (this.simpleForm.scenarioName) {
      mapping.scenarioName = this.simpleForm.scenarioName;
      if (this.simpleForm.requiredScenarioState) {
        mapping.requiredScenarioState = this.simpleForm.requiredScenarioState;
      }
      if (this.simpleForm.newScenarioState) {
        mapping.newScenarioState = this.simpleForm.newScenarioState;
      }
    }

    return mapping;
  }

  private simpleFormToJson(): string {
    const mapping = this.simpleFormToMapping();
    return JSON.stringify(mapping, null, 2);
  }
}
