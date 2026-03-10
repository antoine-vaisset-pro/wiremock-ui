import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { StubsPageComponent } from './stubs-page.component';
import { MappingService } from '../../services/mapping.service';
import { ScenarioService } from '../../services/scenario.service';
import { StubImportService } from '../../services/stub-import.service';

describe('StubsPageComponent', () => {
  let component: StubsPageComponent;
  let fixture: ComponentFixture<StubsPageComponent>;
  let mappingServiceSpy: jasmine.SpyObj<MappingService>;
  let scenarioServiceSpy: jasmine.SpyObj<ScenarioService>;
  let stubImportServiceSpy: jasmine.SpyObj<StubImportService>;
  let routerSpy: jasmine.SpyObj<Router>;

  const mockMappingsResponse = {
    mappings: [
      { uuid: 'uuid-1', name: 'Stub A', request: { method: 'GET', url: '/api/a' }, response: { status: 200 } },
      { uuid: 'uuid-2', name: 'Stub B', request: { method: 'POST', url: '/api/b' }, response: { status: 201 } }
    ],
    meta: { total: 2, page: 0, size: 20, totalPages: 1 }
  };

  beforeEach(() => {
    mappingServiceSpy = jasmine.createSpyObj('MappingService', [
      'getMappings', 'createMapping', 'updateMapping', 'deleteMapping',
      'getAllMappingsRaw', 'importMappings', 'resetMappings'
    ]);
    scenarioServiceSpy = jasmine.createSpyObj('ScenarioService', ['getAllScenarios']);
    stubImportServiceSpy = jasmine.createSpyObj('StubImportService', [
      'validateJsonImport', 'processZipImport', 'processZipSelection'
    ]);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    mappingServiceSpy.getMappings.and.returnValue(of(mockMappingsResponse));
    scenarioServiceSpy.getAllScenarios.and.returnValue(of({ scenarios: [] }));

    TestBed.configureTestingModule({
      imports: [StubsPageComponent],
      providers: [
        { provide: MappingService, useValue: mappingServiceSpy },
        { provide: ScenarioService, useValue: scenarioServiceSpy },
        { provide: StubImportService, useValue: stubImportServiceSpy },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            params: of({}),
            queryParams: of({})
          }
        }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });

    fixture = TestBed.createComponent(StubsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit - loadMappings', () => {
    it('should load mappings on init', () => {
      expect(mappingServiceSpy.getMappings).toHaveBeenCalled();
      expect(component.mappings.length).toBe(2);
      expect(component.totalMappings).toBe(2);
      expect(component.loading).toBeFalse();
    });

    it('should load available scenarios on init', () => {
      expect(scenarioServiceSpy.getAllScenarios).toHaveBeenCalled();
    });

    it('should set error message when loading mappings fails', () => {
      mappingServiceSpy.getMappings.and.returnValue(throwError(() => new Error('Network error')));

      component.loadMappings();

      expect(component.error).toBeTruthy();
      expect(component.loading).toBeFalse();
    });
  });

  describe('selectStub', () => {
    it('should set selectedMapping when a stub is selected', () => {
      const stub = mockMappingsResponse.mappings[0];
      component.selectStub(stub);
      expect(component.selectedMapping).toEqual(stub);
    });

    it('should reset activeViewTab to details on selection', () => {
      const stub = mockMappingsResponse.mappings[0];
      component.activeViewTab = 'json';
      component.selectStub(stub);
      expect(component.activeViewTab).toBe('details');
    });

    it('should navigate to stub URL when updateUrl is true', () => {
      const stub = mockMappingsResponse.mappings[0];
      component.selectStub(stub, true);
      expect(routerSpy.navigate).toHaveBeenCalledWith(
        ['/ui/stubs', 'uuid-1'],
        jasmine.objectContaining({ queryParamsHandling: 'preserve' })
      );
    });

    it('should NOT navigate when updateUrl is false', () => {
      const stub = mockMappingsResponse.mappings[0];
      component.selectStub(stub, false);
      expect(routerSpy.navigate).not.toHaveBeenCalled();
    });
  });

  describe('closeDetails', () => {
    it('should clear selectedMapping', () => {
      component.selectedMapping = mockMappingsResponse.mappings[0];
      component.closeDetails();
      expect(component.selectedMapping).toBeNull();
    });
  });

  describe('createNewStub', () => {
    it('should open modal in create mode', () => {
      component.createNewStub();
      expect(component.showCreateModal).toBeTrue();
      expect(component.editMode).toBe('create');
    });

    it('should reset form when creating new stub', () => {
      component.simpleForm.name = 'Some Old Name';
      component.createNewStub();
      expect(component.simpleForm.name).toBe('');
    });

    it('should set default editor mode to simple', () => {
      component.createNewStub();
      expect(component.editorMode).toBe('simple');
    });

    it('should populate newStubJson with a default stub template', () => {
      component.createNewStub();
      const parsed = JSON.parse(component.newStubJson);
      expect(parsed.request).toBeDefined();
      expect(parsed.response).toBeDefined();
    });
  });

  describe('editStub', () => {
    it('should not open modal when no stub is selected', () => {
      component.selectedMapping = null;
      component.editStub();
      expect(component.showCreateModal).toBeFalse();
    });

    it('should open modal in edit mode with the selected stub', () => {
      component.selectedMapping = mockMappingsResponse.mappings[0];
      component.editStub();
      expect(component.showCreateModal).toBeTrue();
      expect(component.editMode).toBe('edit');
      expect(component.editingStubUuid).toBe('uuid-1');
    });

    it('should populate newStubJson with the selected stub JSON', () => {
      component.selectedMapping = mockMappingsResponse.mappings[0];
      component.editStub();
      const parsed = JSON.parse(component.newStubJson);
      expect(parsed.name).toBe('Stub A');
    });
  });

  describe('closeCreateModal', () => {
    it('should close the modal and clear state', () => {
      component.showCreateModal = true;
      component.newStubJson = '{"test": true}';
      component.createStubError = 'Some error';
      component.editingStubUuid = 'some-uuid';

      component.closeCreateModal();

      expect(component.showCreateModal).toBeFalse();
      expect(component.newStubJson).toBe('');
      expect(component.createStubError).toBe('');
      expect(component.editingStubUuid).toBeNull();
    });
  });

  describe('cloneStub', () => {
    it('should not clone when no stub is selected', () => {
      component.selectedMapping = null;
      component.cloneStub();
      expect(component.showCreateModal).toBeFalse();
    });

    it('should open modal in create mode with cloned data', () => {
      component.selectedMapping = mockMappingsResponse.mappings[0];
      component.cloneStub();
      expect(component.showCreateModal).toBeTrue();
      expect(component.editMode).toBe('create');
      expect(component.editingStubUuid).toBeNull();
    });

    it('should append [COPY] to the cloned stub name', () => {
      component.selectedMapping = mockMappingsResponse.mappings[0];
      component.cloneStub();
      expect(component.simpleForm.name).toContain('[COPY]');
    });
  });

  describe('onSearchChange', () => {
    it('should reset currentPage to 1 and reload mappings', () => {
      component.currentPage = 3;
      component.searchQuery = 'test search';
      component.onSearchChange();
      expect(component.currentPage).toBe(1);
      expect(mappingServiceSpy.getMappings).toHaveBeenCalled();
    });
  });

  describe('onPageChange', () => {
    it('should reload mappings when page changes', () => {
      mappingServiceSpy.getMappings.calls.reset();
      component.onPageChange(2);
      expect(mappingServiceSpy.getMappings).toHaveBeenCalled();
    });
  });

  describe('toggleEditorMode', () => {
    it('should switch from simple to advanced mode', () => {
      component.createNewStub(); // opens modal in simple mode
      component.editorMode = 'simple';
      component.toggleEditorMode();
      expect(component.editorMode).toBe('advanced');
    });

    it('should switch from advanced to simple mode when JSON is valid', () => {
      component.createNewStub();
      component.editorMode = 'advanced';
      component.newStubJson = JSON.stringify({
        request: { method: 'GET', url: '/api/test' },
        response: { status: 200 }
      });
      component.toggleEditorMode();
      expect(component.editorMode).toBe('simple');
    });

    it('should show error when switching to simple mode with invalid JSON', () => {
      component.editorMode = 'advanced';
      component.newStubJson = '{ invalid json }';
      component.toggleEditorMode();
      expect(component.createStubError).toContain('Invalid JSON');
      expect(component.editorMode).toBe('advanced');
    });
  });

  describe('stub selection (checkboxes)', () => {
    it('should add stub to selection on toggleStubSelection', () => {
      const event = new Event('click');
      component.toggleStubSelection('uuid-1', event);
      expect(component.isStubSelected('uuid-1')).toBeTrue();
    });

    it('should remove stub from selection when toggled again', () => {
      const event = new Event('click');
      component.toggleStubSelection('uuid-1', event);
      component.toggleStubSelection('uuid-1', event);
      expect(component.isStubSelected('uuid-1')).toBeFalse();
    });

    it('should select all stubs with selectAllStubs()', () => {
      component.selectAllStubs();
      expect(component.selectedCount).toBe(2);
      expect(component.isStubSelected('uuid-1')).toBeTrue();
      expect(component.isStubSelected('uuid-2')).toBeTrue();
    });

    it('should deselect all stubs with deselectAllStubs()', () => {
      component.selectAllStubs();
      component.deselectAllStubs();
      expect(component.selectedCount).toBe(0);
    });
  });

  describe('getUrl helper', () => {
    it('should return url when present', () => {
      const mapping = { request: { method: 'GET', url: '/api/test' } };
      expect(component.getUrl(mapping as any)).toBe('/api/test');
    });

    it('should return urlPattern when url is absent', () => {
      const mapping = { request: { method: 'GET', urlPattern: '/api/.*' } };
      expect(component.getUrl(mapping as any)).toBe('/api/.*');
    });

    it('should return "/" when no URL field is set', () => {
      const mapping = { request: { method: 'GET' } };
      expect(component.getUrl(mapping as any)).toBe('/');
    });
  });

  describe('getFormattedBody helper', () => {
    it('should format jsonBody as indented JSON', () => {
      const mapping = { request: { method: 'GET', url: '/api' }, response: { jsonBody: { key: 'value' } } };
      const result = component.getFormattedBody(mapping as any);
      expect(result).toBe('{\n  "key": "value"\n}');
    });

    it('should format body string as indented JSON when parseable', () => {
      const mapping = { request: { method: 'GET', url: '/api' }, response: { body: '{"name":"test"}' } };
      const result = component.getFormattedBody(mapping as any);
      expect(result).toContain('"name"');
    });

    it('should return plain body string when not valid JSON', () => {
      const mapping = { request: { method: 'GET', url: '/api' }, response: { body: 'plain text' } };
      const result = component.getFormattedBody(mapping as any);
      expect(result).toBe('plain text');
    });

    it('should return empty string when no body', () => {
      const mapping = { request: { method: 'GET', url: '/api' }, response: {} };
      const result = component.getFormattedBody(mapping as any);
      expect(result).toBe('');
    });
  });

  describe('isValidRegex helper', () => {
    it('should return true for valid regex patterns', () => {
      expect(component.isValidRegex('/api/.*')).toBeTrue();
      expect(component.isValidRegex('^/api/[0-9]+')).toBeTrue();
    });

    it('should return false for invalid regex patterns', () => {
      expect(component.isValidRegex('[invalid')).toBeFalse();
      expect(component.isValidRegex('(')).toBeFalse();
    });
  });

  describe('isFormMethodWithBody helper', () => {
    it('should return true for POST, PUT, PATCH', () => {
      component.simpleForm.method = 'POST';
      expect(component.isFormMethodWithBody()).toBeTrue();
      component.simpleForm.method = 'PUT';
      expect(component.isFormMethodWithBody()).toBeTrue();
      component.simpleForm.method = 'PATCH';
      expect(component.isFormMethodWithBody()).toBeTrue();
    });

    it('should return false for GET, DELETE, HEAD', () => {
      component.simpleForm.method = 'GET';
      expect(component.isFormMethodWithBody()).toBeFalse();
      component.simpleForm.method = 'DELETE';
      expect(component.isFormMethodWithBody()).toBeFalse();
    });
  });

  describe('onBodyTypeChange', () => {
    it('should set Content-Type to application/json for json body type', () => {
      component.simpleForm.responseHeaders = [];
      component.simpleForm.bodyType = 'json';
      component.onBodyTypeChange();
      const contentType = component.simpleForm.responseHeaders.find(h => h.key === 'Content-Type');
      expect(contentType?.value).toBe('application/json');
    });

    it('should set Content-Type to text/html for html body type', () => {
      component.simpleForm.responseHeaders = [];
      component.simpleForm.bodyType = 'html';
      component.onBodyTypeChange();
      const contentType = component.simpleForm.responseHeaders.find(h => h.key === 'Content-Type');
      expect(contentType?.value).toBe('text/html');
    });

    it('should update existing Content-Type header instead of adding a duplicate', () => {
      component.simpleForm.responseHeaders = [{ key: 'Content-Type', value: 'application/json' }];
      component.simpleForm.bodyType = 'xml';
      component.onBodyTypeChange();
      const contentTypeHeaders = component.simpleForm.responseHeaders.filter(h => h.key === 'Content-Type');
      expect(contentTypeHeaders.length).toBe(1);
      expect(contentTypeHeaders[0].value).toBe('application/xml');
    });
  });

  describe('createStubFromRequest', () => {
    it('should open modal in create mode', () => {
      const requestData = { request: { method: 'GET', url: '/api/test', headers: {} } };
      component.createStubFromRequest(requestData);
      expect(component.showCreateModal).toBeTrue();
      expect(component.editMode).toBe('create');
    });

    it('should pre-fill method from request data', () => {
      const requestData = { request: { method: 'DELETE', url: '/api/resource' } };
      component.createStubFromRequest(requestData);
      expect(component.simpleForm.method).toBe('DELETE');
    });

    it('should extract query params from URL', () => {
      const requestData = { request: { method: 'GET', url: '/api/search?q=test&page=2' } };
      component.createStubFromRequest(requestData);
      expect(component.simpleForm.queryParameters.length).toBe(2);
      expect(component.simpleForm.urlType).toBe('urlPath');
      expect(component.simpleForm.url).toBe('/api/search');
    });

    it('should use the full URL when no query params are present', () => {
      const requestData = { request: { method: 'GET', url: '/api/simple' } };
      component.createStubFromRequest(requestData);
      expect(component.simpleForm.url).toBe('/api/simple');
      expect(component.simpleForm.urlType).toBe('url');
    });

    it('should filter ignored headers (host, content-length, connection)', () => {
      const requestData = {
        request: {
          method: 'POST', url: '/api/data',
          headers: {
            'host': 'localhost:3000',
            'content-length': '42',
            'Authorization': 'Bearer token',
            'X-Custom': 'value'
          }
        }
      };
      component.createStubFromRequest(requestData);
      const headerKeys = component.simpleForm.requestHeaders.map(h => h.key);
      expect(headerKeys).not.toContain('host');
      expect(headerKeys).not.toContain('content-length');
      expect(headerKeys).toContain('Authorization');
      expect(headerKeys).toContain('X-Custom');
    });
  });

  describe('getHeaders helper', () => {
    it('should convert response headers object to key-value array', () => {
      const mapping = {
        request: { method: 'GET', url: '/api' },
        response: { status: 200, headers: { 'Content-Type': 'application/json', 'X-Custom': 'value' } }
      };
      const headers = component.getHeaders(mapping as any);
      expect(headers.length).toBe(2);
      expect(headers.find(h => h.key === 'Content-Type')?.value).toBe('application/json');
    });

    it('should return empty array when no response headers', () => {
      const mapping = { request: { method: 'GET', url: '/api' }, response: {} };
      const headers = component.getHeaders(mapping as any);
      expect(headers).toEqual([]);
    });
  });

  describe('import modal', () => {
    it('should open import modal with clean state', () => {
      component.openImportModal();
      expect(component.showImportModal).toBeTrue();
      expect(component.importFile).toBeNull();
      expect(component.importPreview).toBeNull();
      expect(component.importError).toBeNull();
    });

    it('should close import modal and reset state', () => {
      component.showImportModal = true;
      component.closeImportModal();
      expect(component.showImportModal).toBeFalse();
    });
  });

  describe('section toggle methods', () => {
    it('should toggle scenario section expanded state', () => {
      component.isScenarioSectionExpanded = false;
      component.toggleScenarioSection();
      expect(component.isScenarioSectionExpanded).toBeTrue();
      component.toggleScenarioSection();
      expect(component.isScenarioSectionExpanded).toBeFalse();
    });

    it('should toggle response section expanded state', () => {
      component.isResponseExpanded = true;
      component.toggleResponseSection();
      expect(component.isResponseExpanded).toBeFalse();
    });

    it('should toggle delay section expanded state', () => {
      component.isDelayExpanded = false;
      component.toggleDelaySection();
      expect(component.isDelayExpanded).toBeTrue();
    });
  });

  describe('response/view tab setters', () => {
    it('should set activeResponseTab', () => {
      component.setResponseTab('proxy');
      expect(component.activeResponseTab).toBe('proxy');
      component.setResponseTab('fault');
      expect(component.activeResponseTab).toBe('fault');
    });

    it('should set activeViewTab', () => {
      component.setViewTab('json');
      expect(component.activeViewTab).toBe('json');
      component.setViewTab('details');
      expect(component.activeViewTab).toBe('details');
    });
  });
});
