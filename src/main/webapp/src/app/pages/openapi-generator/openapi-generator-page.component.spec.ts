import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { OpenApiGeneratorPageComponent } from './openapi-generator-page.component';
import { ConfigService } from '../../services/config.service';
import { MappingService } from '../../services/mapping.service';
import { OPENAPI_PARSER_SERVICE } from '../../services/openapi-parser.interface';
import { OpenApiParserService } from '../../services/openapi-parser.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SIMPLE_SPEC = JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'Test API', version: '1.0.0' },
  paths: {
    '/users': {
      get: {
        summary: 'List users',
        responses: { '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' } } } } } } }
      },
      post: {
        summary: 'Create user',
        requestBody: {
          required: true,
          content: { 'application/json': { examples: { req1: { value: { name: 'Alice' } } } } }
        },
        responses: { '201': { description: 'Created' } }
      }
    },
    '/users/{id}': {
      get: {
        summary: 'Get user',
        parameters: [{ name: 'id', in: 'path', required: true }],
        responses: {
          '200': {
            description: 'OK',
            content: { 'application/json': { examples: { found: { value: { id: 1 } } } } }
          },
          '404': {
            description: 'Not found',
            content: { 'application/json': { examples: { notFound: { value: { error: 'not found' } } } } }
          }
        }
      }
    }
  }
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OpenApiGeneratorPageComponent', () => {
  let component: OpenApiGeneratorPageComponent;
  let fixture: ComponentFixture<OpenApiGeneratorPageComponent>;
  let configServiceSpy: jasmine.SpyObj<ConfigService>;
  let mappingServiceSpy: jasmine.SpyObj<MappingService>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    configServiceSpy = jasmine.createSpyObj('ConfigService', ['loadConfig', 'getAppConfig'], {
      wiremockApiUrl: 'http://localhost:8080/__admin'
    });
    mappingServiceSpy = jasmine.createSpyObj('MappingService', ['createMapping', 'updateMapping', 'deleteMapping']);

    await TestBed.configureTestingModule({
      imports: [OpenApiGeneratorPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: configServiceSpy },
        { provide: MappingService, useValue: mappingServiceSpy },
        { provide: OPENAPI_PARSER_SERVICE, useClass: OpenApiParserService }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(OpenApiGeneratorPageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  // ── Creation ──────────────────────────────────────────────────────────────

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with paste input mode', () => {
    expect(component.inputMode).toBe('paste');
  });

  it('should start with empty state', () => {
    expect(component.parsedSpec).toBeNull();
    expect(component.endpoints.length).toBe(0);
    expect(component.generatedStubs.length).toBe(0);
  });

  // ── Parsing ───────────────────────────────────────────────────────────────

  describe('parseSpec()', () => {
    it('should set parseError when rawSpec is empty', () => {
      component.rawSpec = '';
      component.parseSpec();
      expect(component.parseError).toBeTruthy();
    });

    it('should set parseError on invalid spec', fakeAsync(() => {
      component.rawSpec = '{ not valid json {{';
      component.parseSpec();
      tick(20);
      expect(component.parseError).toBeTruthy();
    }));

    it('should populate parsedSpec and endpoints on valid spec', fakeAsync(() => {
      component.rawSpec = SIMPLE_SPEC;
      component.parseSpec();
      tick(20);
      expect(component.parsedSpec).not.toBeNull();
      expect(component.parsedSpec!.title).toBe('Test API');
      expect(component.endpoints.length).toBe(3); // GET /users, POST /users, GET /users/{id}
    }));

    it('should set allSelected to true after parsing', fakeAsync(() => {
      component.rawSpec = SIMPLE_SPEC;
      component.parseSpec();
      tick(20);
      expect(component.allSelected).toBeTrue();
    }));

    it('should populate allResponseExamples for endpoints with examples', fakeAsync(() => {
      component.rawSpec = SIMPLE_SPEC;
      component.parseSpec();
      tick(20);
      const getUserById = component.endpoints.find(e => e.operation.path === '/users/{id}');
      expect(getUserById?.allResponseExamples.length).toBe(2); // found (200) + notFound (404)
    }));

    it('should populate requestExampleKeys for POST endpoint', fakeAsync(() => {
      component.rawSpec = SIMPLE_SPEC;
      component.parseSpec();
      tick(20);
      const postUser = component.endpoints.find(e => e.operation.method === 'POST');
      expect(postUser?.requestExampleKeys).toEqual(['req1']);
    }));

    it('should initialise faultType to empty string', fakeAsync(() => {
      component.rawSpec = SIMPLE_SPEC;
      component.parseSpec();
      tick(20);
      component.endpoints.forEach(e => expect(e.faultType).toBe(''));
    }));
  });

  // ── Endpoint configuration ────────────────────────────────────────────────

  describe('endpoint configuration', () => {
    beforeEach(fakeAsync(() => {
      component.rawSpec = SIMPLE_SPEC;
      component.parseSpec();
      tick(20);
    }));

    it('applyGlobalPrefix() should update urlPrefix on all endpoints', () => {
      component.globalUrlPrefix = '/api/v2';
      component.applyGlobalPrefix();
      component.endpoints.forEach(e => expect(e.urlPrefix).toBe('/api/v2'));
    });

    it('toggleAll() should disable all endpoints', () => {
      component.allSelected = true;
      component.toggleAll();
      component.endpoints.forEach(e => expect(e.enabled).toBeFalse());
    });

    it('toggleAll() should re-enable all endpoints', () => {
      component.allSelected = false;
      component.toggleAll();
      component.endpoints.forEach(e => expect(e.enabled).toBeTrue());
    });

    it('updateAllSelected() should set allSelected false when one is disabled', () => {
      component.endpoints[0].enabled = false;
      component.updateAllSelected();
      expect(component.allSelected).toBeFalse();
    });

    it('getEnabledCount() should count only enabled endpoints', () => {
      component.endpoints[0].enabled = false;
      expect(component.getEnabledCount()).toBe(2);
    });

    it('onStatusCodeChange() should reset selectedResponseExample', () => {
      const entry = component.endpoints[0];
      entry.selectedResponseExample = 'someExample';
      component.onStatusCodeChange(entry);
      expect(entry.selectedResponseExample).toBeUndefined();
    });

    it('onResponseExampleChange() should update statusCode from example', () => {
      const getUserById = component.endpoints.find(e => e.operation.path === '/users/{id}')!;
      getUserById.selectedResponseExample = 'notFound';
      component.onResponseExampleChange(getUserById);
      expect(getUserById.statusCode).toBe('404');
    });

    it('onResponseExampleChange() should update statusCode to 200 for success example', () => {
      const getUserById = component.endpoints.find(e => e.operation.path === '/users/{id}')!;
      getUserById.selectedResponseExample = 'found';
      component.onResponseExampleChange(getUserById);
      expect(getUserById.statusCode).toBe('200');
    });

    it('onResponseExampleChange() should do nothing when no example selected', () => {
      const entry = component.endpoints[0];
      entry.statusCode = '200';
      entry.selectedResponseExample = undefined;
      component.onResponseExampleChange(entry);
      expect(entry.statusCode).toBe('200');
    });
  });

  // ── Generation ────────────────────────────────────────────────────────────

  describe('generate()', () => {
    beforeEach(fakeAsync(() => {
      component.rawSpec = SIMPLE_SPEC;
      component.parseSpec();
      tick(20);
    }));

    it('should generate stubs for all enabled endpoints', fakeAsync(() => {
      component.generate();
      tick(20);
      expect(component.generatedStubs.length).toBe(3);
    }));

    it('should generate 2 stubs for endpoint with faultType set', fakeAsync(() => {
      component.endpoints[0].faultType = 'EMPTY_RESPONSE';
      component.generate();
      tick(20);
      // 1 happy + 1 fault for endpoint[0], 1 for [1], 1 for [2] = 4
      expect(component.generatedStubs.length).toBe(4);
    }));

    it('should not generate stubs for disabled endpoints', fakeAsync(() => {
      component.endpoints[0].enabled = false;
      component.generate();
      tick(20);
      expect(component.generatedStubs.length).toBe(2);
    }));

    it('generated stubs should use urlPattern for path-param routes', fakeAsync(() => {
      component.generate();
      tick(20);
      const getUserById = component.generatedStubs.find(s =>
        s.mapping.request.urlPattern !== undefined
      );
      expect(getUserById).toBeDefined();
    }));

    it('generated stubs should include bodyPatterns when request example selected', fakeAsync(() => {
      const postEntry = component.endpoints.find(e => e.operation.method === 'POST')!;
      postEntry.selectedRequestExample = 'req1';
      component.generate();
      tick(20);
      const postStub = component.generatedStubs.find(s => s.mapping.request.method === 'POST');
      expect(postStub?.mapping.request.bodyPatterns).toBeDefined();
      expect(postStub?.mapping.request.bodyPatterns!.length).toBe(1);
    }));

    it('generated stub should use selected response example body', fakeAsync(() => {
      const getUserById = component.endpoints.find(e => e.operation.path === '/users/{id}')!;
      getUserById.selectedResponseExample = 'found';
      component.generate();
      tick(20);
      const stub = component.generatedStubs.find(s =>
        s.mapping.request.urlPattern !== undefined
      );
      expect(stub?.mapping.response.jsonBody).toEqual({ id: 1 });
    }));
  });

  // ── Preview ───────────────────────────────────────────────────────────────

  describe('preview', () => {
    beforeEach(fakeAsync(() => {
      component.rawSpec = SIMPLE_SPEC;
      component.parseSpec();
      tick(20);
      component.generate();
      tick(20);
    }));

    it('openPreview() should set previewStub', () => {
      component.openPreview(component.generatedStubs[0]);
      expect(component.previewStub).toBe(component.generatedStubs[0]);
    });

    it('closePreview() should clear previewStub', () => {
      component.openPreview(component.generatedStubs[0]);
      component.closePreview();
      expect(component.previewStub).toBeNull();
    });

    it('getPreviewJson() should return formatted JSON string', () => {
      component.openPreview(component.generatedStubs[0]);
      const json = component.getPreviewJson();
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('getPreviewJson() should return empty string when no previewStub', () => {
      expect(component.getPreviewJson()).toBe('');
    });
  });

  // ── Import into WireMock ──────────────────────────────────────────────────

  describe('importIntoWiremock()', () => {
    beforeEach(fakeAsync(() => {
      component.rawSpec = SIMPLE_SPEC;
      component.parseSpec();
      tick(20);
      component.generate();
      tick(20);
    }));

    it('should do nothing when no stubs generated', fakeAsync(() => {
      component.generatedStubs = [];
      component.importIntoWiremock();
      tick();
      httpMock.expectNone('http://localhost:8080/__admin/mappings');
      expect(component.importSuccess).toBeFalse();
    }));

    it('should POST each stub sequentially to the admin API', fakeAsync(() => {
      const stubCount = component.generatedStubs.length; // 3
      component.importIntoWiremock();

      // importIntoWiremock() sends requests one by one with await — flush each sequentially
      for (let i = 0; i < stubCount; i++) {
        tick();
        const req = httpMock.expectOne('http://localhost:8080/__admin/mappings');
        req.flush({});
      }
      tick();

      expect(component.importSuccess).toBeTrue();
      expect(component.importedCount).toBe(stubCount);
    }));

    it('should report partial failure when some POSTs fail', fakeAsync(() => {
      const stubCount = component.generatedStubs.length; // 3
      component.importIntoWiremock();

      // First request succeeds
      tick();
      httpMock.expectOne('http://localhost:8080/__admin/mappings').flush({});
      // Second fails
      tick();
      httpMock.expectOne('http://localhost:8080/__admin/mappings')
        .flush({ message: 'conflict' }, { status: 409, statusText: 'Conflict' });
      // Third succeeds
      tick();
      httpMock.expectOne('http://localhost:8080/__admin/mappings').flush({});
      tick();

      expect(component.importError).toBeTruthy();
      expect(component.importedCount).toBe(2);
    }));
  });

  // ── Reset ─────────────────────────────────────────────────────────────────

  describe('resetAll()', () => {
    it('should clear all state', fakeAsync(() => {
      component.rawSpec = SIMPLE_SPEC;
      component.parseSpec();
      tick(20);
      component.generate();
      tick(20);
      component.resetAll();
      expect(component.rawSpec).toBe('');
      expect(component.parsedSpec).toBeNull();
      expect(component.endpoints.length).toBe(0);
      expect(component.generatedStubs.length).toBe(0);
      expect(component.previewStub).toBeNull();
      expect(component.importError).toBeNull();
    }));
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  describe('getMethodClass()', () => {
    it('should return correct class for known methods', () => {
      expect(component.getMethodClass('GET')).toBe('method-get');
      expect(component.getMethodClass('POST')).toBe('method-post');
      expect(component.getMethodClass('PUT')).toBe('method-put');
      expect(component.getMethodClass('DELETE')).toBe('method-delete');
      expect(component.getMethodClass('PATCH')).toBe('method-patch');
    });

    it('should return method-default for unknown method', () => {
      expect(component.getMethodClass('UNKNOWN')).toBe('method-default');
    });
  });

  describe('getSpecVersionLabel()', () => {
    it('should return Swagger 2.0 for version 2.0', () => {
      expect(component.getSpecVersionLabel('2.0')).toBe('Swagger 2.0');
    });

    it('should return OpenAPI 3.0 for version 3.0', () => {
      expect(component.getSpecVersionLabel('3.0')).toBe('OpenAPI 3.0');
    });

    it('should return OpenAPI 3.1 for version 3.1', () => {
      expect(component.getSpecVersionLabel('3.1')).toBe('OpenAPI 3.1');
    });

    it('should return Unknown version for unrecognised version', () => {
      expect(component.getSpecVersionLabel('unknown')).toBe('Unknown version');
    });
  });

  describe('getSpecVersionBadgeClass()', () => {
    it('should return spec-version-swagger for version 2.0', () => {
      expect(component.getSpecVersionBadgeClass('2.0')).toBe('spec-version-swagger');
    });

    it('should return spec-version-openapi30 for version 3.0', () => {
      expect(component.getSpecVersionBadgeClass('3.0')).toBe('spec-version-openapi30');
    });

    it('should return spec-version-openapi31 for version 3.1', () => {
      expect(component.getSpecVersionBadgeClass('3.1')).toBe('spec-version-openapi31');
    });

    it('should return spec-version-unknown for unrecognised version', () => {
      expect(component.getSpecVersionBadgeClass('unknown')).toBe('spec-version-unknown');
    });
  });

  describe('WIREMOCK_FAULTS', () => {
    it('should expose the 4 WireMock fault types', () => {
      expect(component.WIREMOCK_FAULTS.length).toBe(4);
      const values = component.WIREMOCK_FAULTS.map(f => f.value);
      expect(values).toContain('CONNECTION_RESET_BY_PEER');
      expect(values).toContain('EMPTY_RESPONSE');
      expect(values).toContain('MALFORMED_RESPONSE_CHUNK');
      expect(values).toContain('RANDOM_DATA_THEN_CLOSE');
    });
  });

  // ── Endpoint variants ─────────────────────────────────────────────────────

  describe('addEndpointVariant()', () => {
    beforeEach(fakeAsync(() => {
      component.rawSpec = SIMPLE_SPEC;
      component.parseSpec();
      tick(20);
    }));

    it('should insert a new entry after the given index', () => {
      const initialLength = component.endpoints.length;
      component.addEndpointVariant(component.endpoints[0], 0);
      expect(component.endpoints.length).toBe(initialLength + 1);
    });

    it('new variant should be placed right after the source entry', () => {
      const firstEntry = component.endpoints[0];
      component.addEndpointVariant(firstEntry, 0);
      expect(component.endpoints[1].operation.path).toBe(firstEntry.operation.path);
      expect(component.endpoints[1].operation.method).toBe(firstEntry.operation.method);
    });

    it('new variant should have a unique variantId', () => {
      const firstEntry = component.endpoints[0];
      const originalId = firstEntry.variantId;
      component.addEndpointVariant(firstEntry, 0);
      expect(component.endpoints[1].variantId).not.toBe(originalId);
    });

    it('should copy the statusCode from the source entry', () => {
      component.endpoints[0].statusCode = '404';
      component.addEndpointVariant(component.endpoints[0], 0);
      expect(component.endpoints[1].statusCode).toBe('404');
    });
  });

  describe('removeEndpointEntry()', () => {
    beforeEach(fakeAsync(() => {
      component.rawSpec = SIMPLE_SPEC;
      component.parseSpec();
      tick(20);
    }));

    it('should remove the entry at the given index', () => {
      const initialLength = component.endpoints.length;
      component.removeEndpointEntry(0);
      expect(component.endpoints.length).toBe(initialLength - 1);
    });

    it('should remove the correct entry', () => {
      const secondPath = component.endpoints[1].operation.path;
      component.removeEndpointEntry(0);
      expect(component.endpoints[0].operation.path).toBe(secondPath);
    });

    it('should update allSelected after removing disabled entry', () => {
      component.endpoints[0].enabled = false;
      component.updateAllSelected();
      expect(component.allSelected).toBeFalse();
      component.removeEndpointEntry(0);
      expect(component.allSelected).toBeTrue();
    });
  });

  // ── Edit generated stub ───────────────────────────────────────────────────

  describe('onStubEdited()', () => {
    beforeEach(fakeAsync(() => {
      component.rawSpec = SIMPLE_SPEC;
      component.parseSpec();
      tick(20);
      component.generate();
      tick(20);
    }));

    it('should update the mapping at editingStubIndex', () => {
      const newMapping = { request: { method: 'GET', urlPath: '/edited' }, response: { status: 999 } };
      component.editingStubIndex = 0;
      component.onStubEdited(newMapping);
      expect(component.generatedStubs[0].mapping).toEqual(newMapping as any);
    });

    it('should preserve other stubs when editing one', () => {
      const originalSecond = component.generatedStubs[1];
      component.editingStubIndex = 0;
      component.onStubEdited({ request: { method: 'GET', urlPath: '/x' }, response: { status: 200 } });
      expect(component.generatedStubs[1]).toBe(originalSecond);
    });

    it('should clear editingStubIndex after edit', () => {
      component.editingStubIndex = 0;
      component.onStubEdited({ request: { method: 'GET', urlPath: '/x' }, response: { status: 200 } });
      expect(component.editingStubIndex).toBeNull();
    });

    it('should do nothing when editingStubIndex is null', () => {
      const originalStubs = [...component.generatedStubs];
      component.editingStubIndex = null;
      component.onStubEdited({ request: { method: 'GET', urlPath: '/x' }, response: { status: 200 } });
      expect(component.generatedStubs).toEqual(originalStubs);
    });
  });
});

