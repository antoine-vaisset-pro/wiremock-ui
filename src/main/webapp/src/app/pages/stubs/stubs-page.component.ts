import {ChangeDetectorRef, Component, ElementRef, OnInit, TemplateRef, ViewChild} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, Router} from '@angular/router';
import {NgbModal, NgbModalRef, NgbModule} from '@ng-bootstrap/ng-bootstrap';
import {MappingService} from '../../services/mapping.service';
import {ScenarioService} from '../../services/scenario.service';
import {ProcessedStub, StubImportService, ZipStructure} from '../../services/stub-import.service';
import {MappingsResponse, StubMapping} from '../../models/stub-mapping.model';

@Component({
  selector: 'app-stubs-page',
  standalone: true,
  imports: [CommonModule, FormsModule, NgbModule],
  templateUrl: './stubs-page.component.html',
  styleUrls: ['./stubs-page.component.scss']
})
export class StubsPageComponent implements OnInit {
  // Expose Math to template
  Math = Math;

  // Stubs
  mappings: StubMapping[] = [];
  selectedMapping: StubMapping | null = null;

  // Pagination (ng-bootstrap uses 1-based indexing)
  currentPage = 1;
  pageSize = 20;
  totalMappings = 0;

  // Search
  searchQuery = '';

  // UI State
  loading = false;
  error: string | null = null;
  activeResponseTab: 'direct' | 'fault' | 'proxy' = 'direct';
  activeViewTab: 'details' | 'json' = 'details';
  showCreateModal = false;
  editMode: 'create' | 'edit' = 'create';
  editorMode: 'simple' | 'advanced' = 'simple';
  newStubJson = '';
  createStubError = '';

  // Stores the raw original mapping to preserve unmapped fields in UI mode
  private _originalMapping: any = null;

  // Simple mode fields
  simpleForm = {
    name: '',
    method: 'GET',
    url: '',
    urlType: 'url' as 'url' | 'urlPath' | 'urlPattern' | 'urlPathPattern',
    priority: 5,
    persistent: false,
    queryParameters: [] as Array<{key: string; predicate: string; value: string}>,
    requestHeaders: [] as Array<{key: string; predicate: string; value: string}>,
    bodyPatterns: [] as Array<{predicate: string; value: string; ignoreArrayOrder?: boolean; ignoreExtraElements?: boolean}>,
    cookies: [] as Array<{key: string; predicate: string; value: string}>,
    basicAuthEnabled: false,
    basicAuthUsername: '',
    basicAuthPassword: '',
    formParameters: [] as Array<{key: string; predicate: string; value: string}>,
    responseMode: 'direct' as 'direct' | 'proxy' | 'fault',
    status: 200,
    statusMessage: '',
    responseHeaders: [{ key: 'Content-Type', value: 'application/json' }] as Array<{key: string; value: string}>,
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
    additionalProxyRequestHeaders: [] as Array<{key: string; value: string}>,
    removeProxyRequestHeaders: [] as string[],
    scenarioName: '',
    requiredScenarioState: '',
    newScenarioState: ''
  };

  editingStubUuid: string | null = null;

  // Scenarios for auto-completion
  availableScenarios: string[] = [];

  // Scenario section collapse state
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

  // Lateral collapse of Request / Response panels
  isRequestPanelCollapsed = false;
  isResponsePanelCollapsed = false;

  // Selection & Export/Import
  selectedStubIds: Set<string> = new Set();
  showImportModal = false;
  importFile: File | null = null;
  importPreview: { count: number; mappings: any[]; processedStubs?: ProcessedStub[] } | null = null;
  importMode: 'add' | 'replace' = 'add';
  importDetectedType: 'json' | 'zip' | 'directory' | null = null;
  importLoading = false;
  importError: string | null = null;
  importWarnings: string[] = [];
  importValidationInfo: { totalFiles: number; substitutedFiles: number } | null = null;

  // ZIP / Directory file selection
  zipStructure: ZipStructure | null = null;
  showZipFileSelection = false;
  zipSelectionLoading = false;

  // Reference to the unique file input (managed dynamically)
  @ViewChild('importInput') importInputRef!: ElementRef<HTMLInputElement>;

  // Modal templates
  @ViewChild('createModalTpl') createModalTpl!: TemplateRef<any>;
  @ViewChild('importModalTpl') importModalTpl!: TemplateRef<any>;

  // Modal refs
  private _createModalRef: NgbModalRef | null = null;
  private _importModalRef: NgbModalRef | null = null;

  // Getter to make the Set size reactive
  get selectedCount(): number {
    return this.selectedStubIds.size;
  }


  constructor(
    private mappingService: MappingService,
    private scenarioService: ScenarioService,
    private stubImportService: StubImportService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private route: ActivatedRoute,
    private modalService: NgbModal
  ) {}

  ngOnInit(): void {
    // Load scenarios for auto-completion
    this.loadAvailableScenarios();

    // Handle URL parameters to restore state
    this.route.params.subscribe(params => {
      if (params['id']) {
        // Select the specific stub from URL after loading
        this.loadMappings(() => {
          this.selectStubById(params['id']);
        });
      } else {
        this.loadMappings();
      }
    });

    this.route.queryParams.subscribe(params => {
      // Restore search from URL
      if (params['search']) {
        this.searchQuery = params['search'];
      }
      if (params['url']) {
        this.searchQuery = params['url'];
      }

      // Reload if params change (but not on first load which is already done above)
      if (params['search'] || params['url']) {
        this.loadMappings();
      }

      // Handle createFrom after loading
      if (params['createFrom']) {
        try {
          const requestData = JSON.parse(decodeURIComponent(params['createFrom']));
          this.createStubFromRequest(requestData);

          // Clean up URL parameter after use
          this.router.navigate(['/ui/stubs'], {
            queryParams: { createFrom: null },
            queryParamsHandling: 'merge'
          });
        } catch (e) {
          console.error('Failed to parse createFrom parameter:', e);
        }
      }
    });
  }

  loadMappings(callback?: () => void): void {
    this.loading = true;
    this.error = null;

    // Convert to 0-based for API
    const apiPage = this.currentPage - 1;

    this.mappingService.getMappings(apiPage, this.pageSize, this.searchQuery)
      .subscribe({
        next: (response: MappingsResponse) => {
          this.mappings = response.mappings;
          this.totalMappings = response.meta.total;
          this.loading = false;

          // Execute callback if provided (for selection after loading)
          if (callback) {
            callback();
          }
        },
        error: (err) => {
          this.error = 'Failed to load mappings. Please check if WireMock is running on port 3001.';
          console.error('Error loading mappings:', err);
          this.loading = false;
        }
      });
  }

  loadAvailableScenarios(): void {
    this.scenarioService.getAllScenarios().subscribe({
      next: (response) => {
        this.availableScenarios = response.scenarios.map(s => s.name);
      },
      error: (err) => {
        console.warn('Failed to load scenarios for auto-completion:', err);
        this.availableScenarios = [];
      }
    });
  }

  onSearchChange(): void {
    this.currentPage = 1; // Reset to first page on new search

    // Update URL with search term
    const queryParams: any = {};
    if (this.searchQuery) {
      queryParams.search = this.searchQuery;
    }

    this.router.navigate(['/ui/stubs'], {
      queryParams,
      queryParamsHandling: 'merge'
    });

    this.loadMappings();
  }

  onPageChange(_page: number): void {
    this.loadMappings();
  }

  selectStub(mapping: StubMapping, updateUrl: boolean = true): void {
    this.selectedMapping = mapping;
    this.activeViewTab = 'details'; // Reset to details tab when selecting a new stub

    // Update URL with stub ID only if requested
    if (updateUrl) {
      const stubId = mapping.uuid || mapping.id;
      if (stubId) {
        this.router.navigate(['/ui/stubs', stubId], {
          queryParamsHandling: 'preserve'
        });
      }
    }
  }

  selectStubById(stubId: string): void {
    console.log('selectStubById called with:', stubId);
    // Look for stub in current list
    const stub = this.mappings.find(m => (m.uuid || m.id) === stubId);
    if (stub) {
      console.log('Stub found in current page:', stub);
      // Do not update URL as we already came from the URL
      this.selectStub(stub, false);
    } else {
      console.log('Stub not in current page, loading all stubs...');
      // Stub is not in the current page, load all stubs
      this.mappingService.getMappings(0, 1000, '').subscribe({
        next: (response) => {
          const foundStub = response.mappings.find(m => (m.uuid || m.id) === stubId);
          if (foundStub) {
            console.log('Stub found after loading all:', foundStub);
            // Do not update URL as we already came from the URL
            this.selectStub(foundStub, false);
            // Optionally, update the list to display this page
            this.mappings = response.mappings;
            this.totalMappings = response.meta.total;
          } else {
            console.error('Stub not found:', stubId);
          }
        },
        error: (err) => {
          console.error('Error loading stubs:', err);
        }
      });
    }
  }

  closeDetails(): void {
    this.selectedMapping = null;
  }

  setResponseTab(tab: 'direct' | 'fault' | 'proxy'): void {
    this.activeResponseTab = tab;
  }

  setViewTab(tab: 'details' | 'json'): void {
    this.activeViewTab = tab;
  }

  refreshStubs(): void {
    this.loadMappings();
  }

  createNewStub(): void {
    this.editMode = 'create';
    this.editorMode = 'simple';
    this.editingStubUuid = null;
    this.showCreateModal = true;
    this.resetSimpleForm();
    this.newStubJson = JSON.stringify({
      "name": "New Stub",
      "request": {
        "method": "GET",
        "url": "/api/example"
      },
      "response": {
        "status": 200,
        "jsonBody": {},
        "headers": {
          "Content-Type": "application/json"
        }
      }
    }, null, 2);
    this.createStubError = '';
    this._openCreateModal();
  }

  editStub(): void {
    if (!this.selectedMapping) return;

    this.editMode = 'edit';
    this.editorMode = 'simple';
    this.editingStubUuid = this.selectedMapping.uuid || this.selectedMapping.id || null;
    this.showCreateModal = true;

    // Save the full original mapping to preserve unmapped fields
    this._originalMapping = JSON.parse(JSON.stringify(this.selectedMapping));

    // Populate simple form from selected mapping
    this.populateSimpleFormFromMapping(this.selectedMapping);

    // Populate JSON
    this.newStubJson = JSON.stringify(this.selectedMapping, null, 2);
    this.createStubError = '';
    this._openCreateModal();
  }

  closeCreateModal(): void {
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

  toggleEditorMode(): void {
    if (this.editorMode === 'simple') {
      // Switching to advanced: convert simple form to JSON
      this.newStubJson = this.simpleFormToJson();
      this.editorMode = 'advanced';
    } else {
      // Switching to simple: parse JSON to simple form
      try {
        const parsed = JSON.parse(this.newStubJson);
        // Update _originalMapping with current JSON (edited in advanced mode)
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

      // Remove uuid/id for create
      if (this.editMode === 'create') {
        delete mappingData.uuid;
        delete mappingData.id;
      }

      const operation = this.editMode === 'create'
        ? this.mappingService.createMapping(mappingData)
        : this.mappingService.updateMapping(this.editingStubUuid!, mappingData);

      operation.subscribe({
        next: (response) => {
          const savedUuid = this.editMode === 'create' ? response.uuid || response.id : this.editingStubUuid;
          this.closeCreateModal();

          // Reload mappings and select the saved stub
          this.mappingService.getMappings(this.currentPage - 1, this.pageSize, this.searchQuery).subscribe({
            next: (mappingsResponse) => {
              this.mappings = mappingsResponse.mappings;
              this.totalMappings = mappingsResponse.meta.total;

              // Find and select the saved stub
              const savedStub = this.mappings.find(m => (m.uuid || m.id) === savedUuid);
              if (savedStub) {
                this.selectedMapping = savedStub;
              }

              console.log(`Stub ${this.editMode === 'create' ? 'created' : 'updated'} successfully`);
            },
            error: (err) => {
              console.error('Error reloading mappings:', err);
              this.loadMappings();
            }
          });
        },
        error: (err) => {
          this.createStubError = `Failed to ${this.editMode} stub: ` + (err.error?.message || err.message);
        }
      });
    } catch (e: any) {
      this.createStubError = 'Invalid JSON: ' + e.message;
    }
  }

  deleteStub(): void {
    if (!this.selectedMapping) return;

    const stubName = this.selectedMapping.name || 'this stub';
    if (!confirm(`Are you sure you want to delete "${stubName}"?`)) {
      return;
    }

    const uuid = this.selectedMapping.uuid || this.selectedMapping.id;
    if (!uuid) {
      alert('Cannot delete: stub has no UUID');
      return;
    }

    this.mappingService.deleteMapping(uuid).subscribe({
      next: () => {
        this.selectedMapping = null;
        this.loadMappings();
        console.log('Stub deleted successfully');
      },
      error: (err) => {
        alert('Failed to delete stub: ' + (err.error?.message || err.message));
      }
    });
  }

  cloneStub(): void {
    if (!this.selectedMapping) return;

    this.editMode = 'create';
    this.editorMode = 'simple';
    this.editingStubUuid = null;
    this.showCreateModal = true;

    // Clone the mapping and populate the simple form
    const cloned = JSON.parse(JSON.stringify(this.selectedMapping));
    delete cloned.uuid;
    delete cloned.id;
    cloned.name = (cloned.name || 'Unnamed') + ' [COPY]';

    // Save the clone as original to preserve unmapped fields
    this._originalMapping = JSON.parse(JSON.stringify(cloned));

    // Populate simple form with cloned data
    this.populateSimpleFormFromMapping(cloned);

    // Also prepare the JSON for advanced mode
    this.newStubJson = JSON.stringify(cloned, null, 2);
    this.createStubError = '';
    this._openCreateModal();
  }

  addHeader(): void {
    this.simpleForm.responseHeaders.push({ key: '', value: '' });
  }

  removeHeader(index: number): void {
    this.simpleForm.responseHeaders.splice(index, 1);
  }

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
    // Auto-set Content-Type header based on body type
    // For 'text', no Content-Type is forced (user chooses)
    const contentTypeMap: { [key: string]: string } = {
      'json': 'application/json',
      'html': 'text/html',
      'xml': 'application/xml',
      'base64': 'application/octet-stream',
      'file': 'application/octet-stream'
    };

    const contentType = contentTypeMap[this.simpleForm.bodyType];
    const contentTypeIndex = this.simpleForm.responseHeaders.findIndex(h => h.key.toLowerCase() === 'content-type');

    if (contentType) {
      // Known type: add or update Content-Type
      if (contentTypeIndex >= 0) {
        this.simpleForm.responseHeaders[contentTypeIndex].value = contentType;
      } else {
        this.simpleForm.responseHeaders.unshift({ key: 'Content-Type', value: contentType });
      }
    } else {
      // Type 'text': remove auto-added Content-Type if it matches a known auto value
      if (contentTypeIndex >= 0) {
        const autoValues = ['application/json', 'text/html', 'application/xml', 'application/octet-stream'];
        if (autoValues.includes(this.simpleForm.responseHeaders[contentTypeIndex].value)) {
          this.simpleForm.responseHeaders.splice(contentTypeIndex, 1);
        }
      }
    }
  }

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
  }

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

  private objectToKVMatcherArray(obj: any): Array<{key: string; predicate: string; value: string}> {
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
    // Do not inject a default Content-Type: keep what is in the original mapping

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

  private buildKVMatchers(items: Array<{key: string; predicate: string; value: string}>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const item of items) {
      if (!item.key.trim()) continue;
      if (item.predicate === 'absent') { result[item.key.trim()] = { absent: true }; continue; }
      if (item.predicate === 'equalToCI') { result[item.key.trim()] = { equalTo: item.value, caseInsensitive: true }; continue; }
      result[item.key.trim()] = { [item.predicate]: item.value };
    }
    return result;
  }

  private buildBodyPatterns(patterns: Array<{predicate: string; value: string; ignoreArrayOrder?: boolean; ignoreExtraElements?: boolean}>): any[] {
    return patterns
      .filter(p => p.value.trim() || p.predicate === 'absent')
      .map(p => {
        const obj: any = { [p.predicate]: p.value };
        if (p.predicate === 'equalToJson') {
          if (p.ignoreArrayOrder) obj.ignoreArrayOrder = true;
          if (p.ignoreExtraElements) obj.ignoreExtraElements = true;
        }
        return obj;
      });
  }

  private buildHeadersObject(headers: Array<{key: string; value: string}>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const h of headers) {
      if (h.key.trim()) result[h.key.trim()] = h.value;
    }
    return result;
  }

  private simpleFormToMapping(): any {
    // Top-level keys managed by the form (will be overwritten)
    const MANAGED_TOP_KEYS = new Set(['name', 'priority', 'persistent', 'request', 'response',
      'scenarioName', 'requiredScenarioState', 'newScenarioState']);
    // Request keys managed by the form
    const MANAGED_REQUEST_KEYS = new Set(['method', 'url', 'urlPath', 'urlPattern', 'urlPathPattern',
      'queryParameters', 'headers', 'bodyPatterns', 'cookies', 'basicAuthCredentials', 'formParameters']);
    // Response keys managed by the form
    const MANAGED_RESPONSE_KEYS = new Set(['status', 'statusMessage', 'headers', 'body', 'jsonBody',
      'base64Body', 'bodyFileName', 'fault', 'proxyBaseUrl', 'proxyUrlPrefixToRemove',
      'additionalProxyRequestHeaders', 'removeProxyRequestHeaders', 'transformers',
      'fixedDelayMilliseconds', 'delayDistribution', 'chunkedDribbleDelay']);

    // Start from original to preserve unmapped fields, otherwise create from scratch
    const orig = this._originalMapping;
    const mapping: any = {};

    // 1. Copy unmanaged top-level fields from original
    if (orig) {
      for (const key of Object.keys(orig)) {
        if (!MANAGED_TOP_KEYS.has(key)) {
          mapping[key] = JSON.parse(JSON.stringify(orig[key]));
        }
      }
    }

    // 2. Managed top-level fields
    if (this.simpleForm.name) mapping.name = this.simpleForm.name;
    if (this.simpleForm.priority !== 5) mapping.priority = this.simpleForm.priority;
    if (this.simpleForm.persistent) mapping.persistent = true;

    // 3. Request section: copy unmanaged fields from original
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

    // 4. Response section: copy unmanaged fields from original
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
        } catch (e) {
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
        // Preserve any other transformers from original, add response-template
        const existingTransformers: string[] = orig?.response?.transformers
          ? [...orig.response.transformers]
          : [];
        if (!existingTransformers.includes('response-template')) {
          existingTransformers.push('response-template');
        }
        mapping.response.transformers = existingTransformers;
      } else if (orig?.response?.transformers) {
        // Keep transformers other than response-template
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

  getUrl(mapping: StubMapping): string {
    return mapping.request?.url
      || mapping.request?.urlPattern
      || mapping.request?.urlPath
      || mapping.request?.urlPathPattern
      || '/';
  }

  getHeaders(mapping: StubMapping): Array<{key: string, value: string}> {
    const headers: Array<{key: string, value: string}> = [];
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

  createStubFromRequest(request: any): void {
    console.log('=== createStubFromRequest START ===');
    console.log('Request data:', request);
    console.log('showCreateModal BEFORE:', this.showCreateModal);

    this.editMode = 'create';
    this.editorMode = 'simple';
    this.editingStubUuid = null;
    this.showCreateModal = true;
    this.createStubError = '';

    console.log('showCreateModal AFTER:', this.showCreateModal);
    console.log('editMode:', this.editMode);

    // Pre-fill the form with request data
    this.simpleForm.name = `Stub for ${request.request?.method || 'ANY'} ${request.request?.url || '/'}`;
    this.simpleForm.method = request.request?.method || 'GET';

    // Parse URL to extract query params
    const rawUrl: string = request.request?.url || '';
    try {
      // Use a dummy base to allow parsing relative URLs (paths without a host)
      const parsed = new URL('http://placeholder' + rawUrl);
      const path = parsed.pathname;
      const queryParams: Array<{key: string; predicate: string; value: string}> = [];
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

    console.log('Pre-filled form:', {
      name: this.simpleForm.name,
      method: this.simpleForm.method,
      url: this.simpleForm.url,
      showCreateModal: this.showCreateModal
    });

    // Request headers - filter and convert to predicate format
    const ignoredHeaders = ['host', 'content-length', 'connection'];
    this.simpleForm.requestHeaders = [];
    if (request.request?.headers) {
      Object.keys(request.request.headers).forEach(key => {
        if (ignoredHeaders.includes(key.toLowerCase())) return;
        const value = request.request.headers[key];
        this.simpleForm.requestHeaders.push({
          key,
          predicate: 'equalTo',
          value: Array.isArray(value) ? value.join(', ') : String(value)
        });
      });
    }

    // Default response (200 OK)
    this.simpleForm.status = 200;
    this.simpleForm.responseMode = 'direct';
    this.simpleForm.responseHeaders = [{ key: 'Content-Type', value: 'application/json' }];

    // If the request had a body, propose a default body
    if (request.request?.body) {
      try {
        const parsedBody = JSON.parse(request.request.body);
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

    // Also prepare JSON for advanced mode
    this.newStubJson = this.simpleFormToJson();

    // Force change detection
    this.cdr.detectChanges();
    this._openCreateModal();

    console.log('=== createStubFromRequest END ===');
    console.log('FINAL showCreateModal:', this.showCreateModal);
  }

  private _openCreateModal(): void {
    if (this._createModalRef) {
      return; // already open
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
    });
  }

  // ========== SELECTION & EXPORT/IMPORT ==========

  toggleStubSelection(uuid: string, event: Event): void {
    event.stopPropagation();
    if (this.selectedStubIds.has(uuid)) {
      this.selectedStubIds.delete(uuid);
    } else {
      this.selectedStubIds.add(uuid);
    }
    // Force change detection pour mettre à jour le compteur
    this.cdr.detectChanges();
  }

  isStubSelected(uuid: string): boolean {
    return this.selectedStubIds.has(uuid);
  }

  selectAllStubs(): void {
    this.mappings.forEach(m => {
      const uuid = m.uuid || m.id;
      if (uuid) {
        this.selectedStubIds.add(uuid);
      }
    });
    // Force change detection pour mettre à jour le compteur
    this.cdr.detectChanges();
  }

  deselectAllStubs(): void {
    this.selectedStubIds.clear();
    // Force change detection pour mettre à jour le compteur
    this.cdr.detectChanges();
  }

  /**
   * Exports all stubs or only selected ones
   */
  exportStubs(exportSelected: boolean = false): void {
    this.loading = true;
    this.error = null;

    this.mappingService.getAllMappingsRaw().subscribe({
      next: (response) => {
        let mappingsToExport = response.mappings || [];

        // If selection mode active, filter selected stubs
        if (exportSelected && this.selectedStubIds.size > 0) {
          mappingsToExport = mappingsToExport.filter((m: any) =>
            this.selectedStubIds.has(m.uuid || m.id)
          );
        }

        // Format natif WireMock
        const exportData = {
          mappings: mappingsToExport
        };

        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        // Filename pattern: wiremock-stubs-{timestamp}.json
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        a.download = `wiremock-stubs-${timestamp}.json`;

        a.click();
        window.URL.revokeObjectURL(url);

        this.loading = false;
        console.log(`[EXPORT] Exported ${mappingsToExport.length} stubs`);
      },
      error: (err) => {
        this.error = 'Failed to export stubs: ' + (err.error?.message || err.message);
        console.error('Error exporting stubs:', err);
        this.loading = false;
      }
    });
  }

  /**
   * Ouvre le modal d'import
   */
  openImportModal(): void {
    this.showImportModal = true;
    this.importFile = null;
    this.importPreview = null;
    this.importMode = 'add';
    this.importDetectedType = null;
    this.importError = null;
    this.importWarnings = [];
    this.importValidationInfo = null;
    this.zipStructure = null;
    this.showZipFileSelection = false;
    this.zipSelectionLoading = false;
    this._importModalRef = this.modalService.open(this.importModalTpl, {
      size: 'lg',
      scrollable: true,
      backdrop: 'static'
    });
    this._importModalRef.dismissed.subscribe(() => {
      this.showImportModal = false;
      this._importModalRef = null;
    });
  }

  /**
   * Ferme le modal d'import
   */
  closeImportModal(): void {
    this.showImportModal = false;
    this.importFile = null;
    this.importPreview = null;
    this.importDetectedType = null;
    this.importError = null;
    this.importWarnings = [];
    this.importValidationInfo = null;
    this.zipStructure = null;
    this.showZipFileSelection = false;
    this.zipSelectionLoading = false;
    if (this._importModalRef) {
      this._importModalRef.dismiss();
      this._importModalRef = null;
    }
  }

  /**
   * Handles a file drop via drag & drop in the drop zone.
   * Only .json and .zip files are accepted.
   */
  onDropFile(event: DragEvent): void {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const name = file.name.toLowerCase();
    if (!name.endsWith('.json') && !name.endsWith('.zip')) {
      this.importError = 'Only .json and .zip files are supported via drag & drop.';
      return;
    }

    this.importError = null;
    this.importWarnings = [];
    this.importPreview = null;
    this.importValidationInfo = null;
    this.zipStructure = null;
    this.showZipFileSelection = false;

    if (name.endsWith('.zip')) {
      this.importDetectedType = 'zip';
      this.importFile = file;
      this.processZipFileSource(file);
    } else {
      this.importDetectedType = 'json';
      this.importFile = file;
      this.processJsonFile(file);
    }
  }

  /**
   * Opens the file picker in "file" mode (.json / .zip)
   * or "directory" (webkitdirectory), depending on the button clicked.
   */
  openImportInput(mode: 'file' | 'directory'): void {
    const input = this.importInputRef.nativeElement;
    // Reset value to allow re-selecting the same file
    input.value = '';
    if (mode === 'directory') {
      input.removeAttribute('accept');
      input.setAttribute('webkitdirectory', '');
      input.removeAttribute('multiple');
    } else {
      input.removeAttribute('webkitdirectory');
      input.setAttribute('accept', '.json,.zip');
      input.removeAttribute('multiple');
    }
    input.click();
  }

  /**
   * Automatically detects the import type and starts the appropriate processing.
   * - webkitdirectory is set on the input → directory (non-empty webkitRelativePath)
   * - Fichier unique .zip               → ZIP
   * - Fichier unique .json              → JSON
   */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) {
      return;
    }

    this.importError = null;
    this.importWarnings = [];
    this.importPreview = null;
    this.importValidationInfo = null;
    this.zipStructure = null;
    this.showZipFileSelection = false;

    // The presence of webkitdirectory on the input is the source of truth
    const isDirectoryMode = input.hasAttribute('webkitdirectory');

    if (isDirectoryMode) {
      this.importDetectedType = 'directory';
      this.processDirectoryFiles(files);
    } else if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
      this.importDetectedType = 'zip';
      this.importFile = files[0];
      this.processZipFileSource(files[0]);
    } else {
      this.importDetectedType = 'json';
      this.importFile = files[0];
      this.processJsonFile(files[0]);
    }
  }

  /**
   * Processes a directory selected via webkitdirectory or multi-selection
   */
  private async processDirectoryFiles(files: FileList): Promise<void> {
    this.zipSelectionLoading = true;
    try {
      this.zipStructure = await this.stubImportService.loadDirectoryStructure(files);
      this.showZipFileSelection = true;
    } catch (err: any) {
      this.importError = err.message || 'Failed to read directory';
    } finally {
      this.zipSelectionLoading = false;
    }
  }

  /**
   * Traite un fichier ZIP - Phase 1 : Chargement de la structure
   */
  private async processZipFileSource(file: File): Promise<void> {
    this.zipSelectionLoading = true;
    try {
      this.zipStructure = await this.stubImportService.loadZipStructure(file);
      this.showZipFileSelection = true;
    } catch (err: any) {
      this.importError = err.message || 'Failed to load ZIP structure';
    } finally {
      this.zipSelectionLoading = false;
    }
  }

  /**
   * Processes selected files - Phase 2: Processing
   */
  async processSelectedZipFiles(): Promise<void> {
    if (!this.zipStructure) {
      return;
    }

    this.importLoading = true;
    this.importError = null;

    try {
      // Retrieve selected files
      const selectedMappingPaths = this.zipStructure.mappingFiles
        .filter(f => f.selected)
        .map(f => f.path);

      const selectedBodyFilePaths = this.zipStructure.bodyFiles
        .filter(f => f.selected)
        .map(f => f.path);

      // Validate that at least one mapping is selected
      if (selectedMappingPaths.length === 0) {
        this.importError = 'Please select at least one mapping file';
        this.importLoading = false;
        return;
      }

      // Process selected files
      const result = await this.stubImportService.processSelectedFiles(
        this.zipStructure,
        selectedMappingPaths,
        selectedBodyFilePaths
      );

      // Check for errors
      if (result.errors.length > 0) {
        this.importError = `Found ${result.errors.length} error(s):\n${result.errors.join('\n')}`;
        this.importLoading = false;
        return;
      }

      // Store warnings
      this.importWarnings = result.warnings;

      // Store validation information
      this.importValidationInfo = {
        totalFiles: result.totalFiles,
        substitutedFiles: result.substitutedFiles
      };

      // Create the preview
      this.importPreview = {
        count: result.mappings.length,
        mappings: result.mappings.map(p => p.stub),
        processedStubs: result.mappings
      };

      // Hide file selection and show preview
      this.showZipFileSelection = false;

      console.log(`[IMPORT ZIP] Preview: ${result.mappings.length} stubs, ${result.substitutedFiles} files substituted`);

    } catch (err: any) {
      this.importError = err.message || 'Failed to process selected files';
      console.error('Error processing selected files:', err);
    } finally {
      this.importLoading = false;
    }
  }

  /**
   * Back to file selection from preview
   */
  backToFileSelection(): void {
    this.showZipFileSelection = true;
    this.importPreview = null;
    this.importWarnings = [];
    this.importValidationInfo = null;
  }

  /**
   * Select/deselect all mappings
   */
  toggleAllMappings(selected: boolean): void {
    if (this.zipStructure) {
      this.zipStructure.mappingFiles.forEach(f => f.selected = selected);
    }
  }

  /**
   * Select/deselect all body files
   */
  toggleAllBodyFiles(selected: boolean): void {
    if (this.zipStructure) {
      this.zipStructure.bodyFiles.forEach(f => f.selected = selected);
    }
  }

  /**
   * Count selected files
   */
  getSelectedMappingsCount(): number {
    return this.zipStructure?.mappingFiles.filter(f => f.selected).length || 0;
  }

  getSelectedBodyFilesCount(): number {
    return this.zipStructure?.bodyFiles.filter(f => f.selected).length || 0;
  }

  /**
   * Traite un fichier JSON
   */
  private processJsonFile(file: File): void {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const validation = this.stubImportService.validateJsonImport(content);

        if (!validation.valid) {
          this.importError = validation.error || 'Invalid JSON file';
          return;
        }

        this.importPreview = {
          count: validation.mappings!.length,
          mappings: validation.mappings!
        };

        console.log(`[IMPORT JSON] Preview: ${validation.mappings!.length} stubs to import`);

      } catch (err: any) {
        this.importError = 'Failed to parse file: ' + (err.message || 'Invalid JSON');
        console.error('Error parsing import file:', err);
      }
    };

    reader.onerror = () => {
      this.importError = 'Failed to read file';
    };

    reader.readAsText(file);
  }

  /**
   * Executes the import
   */
  executeImport(): void {
    if (!this.importPreview) {
      return;
    }

    this.importLoading = true;
    this.importError = null;

    const importAction = () => {
      this.mappingService.importMappings(this.importPreview!.mappings).subscribe({
        next: () => {
          const importedCount = this.importPreview?.count ?? 0;
          console.log(`[IMPORT] Successfully imported ${importedCount} stubs`);
          this.importLoading = false;
          this.closeImportModal();
          this.loadMappings();

          // Show a success message
          alert(`Successfully imported ${importedCount} stubs!`);
        },
        error: (err) => {
          this.importError = 'Failed to import stubs: ' + (err.error?.message || err.message);
          console.error('Error importing stubs:', err);
          this.importLoading = false;
        }
      });
    };

    // Si mode replace, reset d'abord puis import
    if (this.importMode === 'replace') {
      if (!confirm(`This will DELETE all existing stubs and replace them with ${this.importPreview.count} new stubs. Are you sure?`)) {
        this.importLoading = false;
        return;
      }

      this.mappingService.resetMappings().subscribe({
        next: () => {
          console.log('[IMPORT] Existing stubs reset');
          importAction();
        },
        error: (err) => {
          this.importError = 'Failed to reset stubs: ' + (err.error?.message || err.message);
          console.error('Error resetting stubs:', err);
          this.importLoading = false;
        }
      });
    } else {
      // Mode add: import directement
      importAction();
    }
  }

  /**
   * Deletes selected stubs
   */
  deleteSelectedStubs(): void {
    if (this.selectedStubIds.size === 0) {
      return;
    }

    if (!confirm(`Delete ${this.selectedStubIds.size} selected stubs?`)) {
      return;
    }

    this.loading = true;
    this.error = null;

    const deletePromises: Promise<any>[] = [];
    this.selectedStubIds.forEach(uuid => {
      const promise = this.mappingService.deleteMapping(uuid).toPromise();
      deletePromises.push(promise);
    });

    Promise.all(deletePromises).then(
      () => {
        console.log(`[DELETE] Successfully deleted ${this.selectedStubIds.size} stubs`);
        this.selectedStubIds.clear();
        this.loading = false;
        this.loadMappings();
      },
      (err) => {
        this.error = 'Failed to delete some stubs';
        console.error('Error deleting stubs:', err);
        this.loading = false;
      }
    );
  }
}

