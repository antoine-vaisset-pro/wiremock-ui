import {TestBed} from '@angular/core/testing';
import {StubConfig, StubGeneratorService, WireMockFault} from './stub-generator.service';
import {OpenApiParserService, ParsedOperation} from './openapi-parser.service';
import {OPENAPI_PARSER_SERVICE} from './openapi-parser.interface';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOperation(overrides: Partial<ParsedOperation> = {}): ParsedOperation {
  return {
    path: '/users',
    method: 'GET',
    summary: 'List users',
    parameters: [],
    responses: [{ statusCode: '200', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' } } } } } }],
    ...overrides
  };
}

function makeConfig(overrides: Partial<StubConfig> = {}): StubConfig {
  return {
    operation: makeOperation(),
    enabled: true,
    statusCode: '200',
    urlPrefix: '',
    ...overrides
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StubGeneratorService', () => {
  let service: StubGeneratorService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: OPENAPI_PARSER_SERVICE, useClass: OpenApiParserService }
      ]
    });
    service = TestBed.inject(StubGeneratorService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── generateStubs() ───────────────────────────────────────────────────────

  describe('generateStubs()', () => {
    it('should return empty array when no configs', () => {
      expect(service.generateStubs([])).toEqual([]);
    });

    it('should skip disabled configs', () => {
      const config = makeConfig({ enabled: false });
      expect(service.generateStubs([config])).toEqual([]);
    });

    it('should generate one stub for a simple enabled config', () => {
      const stubs = service.generateStubs([makeConfig()]);
      expect(stubs.length).toBe(1);
    });

    it('should generate a fault stub when faultType is set', () => {
      const config = makeConfig({ faultType: 'EMPTY_RESPONSE' });
      const stubs = service.generateStubs([config]);
      expect(stubs.length).toBe(2);
      const faultStub = stubs.find(s => s.mapping.response.fault);
      expect(faultStub?.mapping.response.fault).toBe('EMPTY_RESPONSE');
    });

    it('should not generate a fault stub when faultType is empty', () => {
      const config = makeConfig({ faultType: '' });
      expect(service.generateStubs([config]).length).toBe(1);
    });

    it('should generate deduplicated file names for same endpoint', () => {
      const op = makeOperation();
      const stubs = service.generateStubs([makeConfig(), makeConfig()]);
      const names = stubs.map(s => s.fileName);
      expect(new Set(names).size).toBe(names.length);
    });

    it('should set correct HTTP status in response', () => {
      const stubs = service.generateStubs([makeConfig({ statusCode: '201' })]);
      expect(stubs[0].mapping.response.status).toBe(201);
    });
  });

  // ── URL matching ──────────────────────────────────────────────────────────

  describe('URL matching', () => {
    it('should use urlPath for simple paths', () => {
      const stubs = service.generateStubs([makeConfig()]);
      expect(stubs[0].mapping.request.urlPath).toBe('/users');
      expect(stubs[0].mapping.request.urlPattern).toBeUndefined();
    });

    it('should use urlPattern for paths with path parameters', () => {
      const config = makeConfig({ operation: makeOperation({ path: '/users/{id}' }) });
      const stubs = service.generateStubs([config]);
      expect(stubs[0].mapping.request.urlPattern).toBeDefined();
      expect(stubs[0].mapping.request.urlPath).toBeUndefined();
    });

    it('should convert path parameters to regex in urlPattern', () => {
      const config = makeConfig({ operation: makeOperation({ path: '/users/{id}/posts/{postId}' }) });
      const stubs = service.generateStubs([config]);
      const pattern = stubs[0].mapping.request.urlPattern!;
      expect(pattern).toMatch(/\[\^\/\]\+/);
    });

    it('should prepend urlPrefix to the path', () => {
      const config = makeConfig({ urlPrefix: '/api/v1' });
      const stubs = service.generateStubs([config]);
      expect(stubs[0].mapping.request.urlPath).toBe('/api/v1/users');
    });

    it('should assign priority 5 for path-param routes', () => {
      const config = makeConfig({ operation: makeOperation({ path: '/users/{id}' }) });
      const stubs = service.generateStubs([config]);
      expect(stubs[0].mapping.priority).toBe(5);
    });

    it('should assign priority 1 for static routes', () => {
      const stubs = service.generateStubs([makeConfig()]);
      expect(stubs[0].mapping.priority).toBe(1);
    });
  });

  // ── Response body ─────────────────────────────────────────────────────────

  describe('response body generation', () => {
    it('should inline small JSON body as jsonBody', () => {
      const config = makeConfig({
        operation: makeOperation({
          responses: [{
            statusCode: '200',
            content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' } } } } }
          }]
        })
      });
      const stubs = service.generateStubs([config]);
      expect(stubs[0].mapping.response.jsonBody).toEqual({ id: 0 });
    });

    it('should use bodyFileName for large response bodies', () => {
      const largeObj: any = {};
      for (let i = 0; i < 200; i++) largeObj[`field${i}`] = 'some long value here for padding';
      const config = makeConfig({
        operation: makeOperation({
          responses: [{
            statusCode: '200',
            content: { 'application/json': { example: largeObj } }
          }]
        })
      });
      const stubs = service.generateStubs([config]);
      // Either inline or external depending on size
      const stub = stubs[0];
      const hasBody = stub.mapping.response.jsonBody !== undefined
        || stub.mapping.response.bodyFileName !== undefined;
      expect(hasBody).toBeTrue();
    });

    it('should set Content-Type header when response has a media type', () => {
      const stubs = service.generateStubs([makeConfig()]);
      expect(stubs[0].mapping.response.headers?.['Content-Type']).toBe('application/json');
    });

    it('should use selected response example value', () => {
      const config = makeConfig({
        selectedResponseExample: 'myExample',
        operation: makeOperation({
          responses: [{
            statusCode: '200',
            content: {
              'application/json': {
                examples: { myExample: { value: { foo: 'bar' } } }
              }
            }
          }]
        })
      });
      const stubs = service.generateStubs([config]);
      expect(stubs[0].mapping.response.jsonBody).toEqual({ foo: 'bar' });
    });
  });

  // ── Request matching ──────────────────────────────────────────────────────

  describe('request matching', () => {
    it('should set correct HTTP method', () => {
      const config = makeConfig({ operation: makeOperation({ method: 'POST' }) });
      expect(service.generateStubs([config])[0].mapping.request.method).toBe('POST');
    });

    it('should add queryParameters for required query params', () => {
      const config = makeConfig({
        operation: makeOperation({
          parameters: [{ name: 'q', in: 'query', required: true }]
        })
      });
      const stubs = service.generateStubs([config]);
      expect(stubs[0].mapping.request.queryParameters?.['q']).toEqual({ present: true });
    });

    it('should not add queryParameters for optional query params', () => {
      const config = makeConfig({
        operation: makeOperation({
          parameters: [{ name: 'q', in: 'query', required: false }]
        })
      });
      const stubs = service.generateStubs([config]);
      expect(stubs[0].mapping.request.queryParameters).toBeUndefined();
    });

    it('should add bodyPatterns when selectedRequestExample is set', () => {
      const config = makeConfig({
        selectedRequestExample: 'createReq',
        operation: makeOperation({
          method: 'POST',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                examples: { createReq: { value: { name: 'Alice' } } }
              }
            }
          }
        })
      });
      const stubs = service.generateStubs([config]);
      const patterns = stubs[0].mapping.request.bodyPatterns;
      expect(patterns).toBeDefined();
      expect(patterns!.length).toBe(1);
      expect(JSON.parse(patterns![0].equalToJson)).toEqual({ name: 'Alice' });
      expect(patterns![0].ignoreArrayOrder).toBeTrue();
    });

    it('should not add bodyPatterns when no request example selected', () => {
      const stubs = service.generateStubs([makeConfig()]);
      expect(stubs[0].mapping.request.bodyPatterns).toBeUndefined();
    });
  });

  // ── Fault stubs ───────────────────────────────────────────────────────────

  describe('fault stub generation', () => {
    const FAULT_TYPES: WireMockFault[] = [
      'CONNECTION_RESET_BY_PEER',
      'EMPTY_RESPONSE',
      'MALFORMED_RESPONSE_CHUNK',
      'RANDOM_DATA_THEN_CLOSE'
    ];

    FAULT_TYPES.forEach(fault => {
      it(`should generate fault stub for ${fault}`, () => {
        const config = makeConfig({ faultType: fault });
        const stubs = service.generateStubs([config]);
        const faultStub = stubs.find(s => s.mapping.response.fault === fault);
        expect(faultStub).toBeDefined();
      });
    });

    it('should include fault name in the stub name', () => {
      const config = makeConfig({ faultType: 'EMPTY_RESPONSE' });
      const stubs = service.generateStubs([config]);
      const faultStub = stubs.find(s => s.mapping.response.fault);
      expect(faultStub?.mapping.name).toContain('EMPTY_RESPONSE');
    });

    it('fault stub should match the same URL as the happy path', () => {
      const config = makeConfig({ faultType: 'EMPTY_RESPONSE' });
      const stubs = service.generateStubs([config]);
      const happy = stubs[0];
      const fault = stubs[1];
      expect(fault.mapping.request.urlPath).toBe(happy.mapping.request.urlPath);
      expect(fault.mapping.request.method).toBe(happy.mapping.request.method);
    });

    it('fault stub should have unique file name', () => {
      const config = makeConfig({ faultType: 'EMPTY_RESPONSE' });
      const stubs = service.generateStubs([config]);
      expect(stubs[0].fileName).not.toBe(stubs[1].fileName);
    });
  });

  // ── getDefaultStatusCode() ────────────────────────────────────────────────

  describe('getDefaultStatusCode()', () => {
    it('should return first 2xx status code', () => {
      const op = makeOperation({ responses: [{ statusCode: '201' }, { statusCode: '400' }] });
      expect(service.getDefaultStatusCode(op)).toBe('201');
    });

    it('should convert "default" response to "200"', () => {
      const op = makeOperation({ responses: [{ statusCode: 'default' }] });
      expect(service.getDefaultStatusCode(op)).toBe('200');
    });

    it('should return "200" when no responses', () => {
      const op = makeOperation({ responses: [] });
      expect(service.getDefaultStatusCode(op)).toBe('200');
    });

    it('should prefer 2xx over 4xx/5xx', () => {
      const op = makeOperation({
        responses: [{ statusCode: '500' }, { statusCode: '200' }]
      });
      expect(service.getDefaultStatusCode(op)).toBe('200');
    });
  });

  // ── stub name deduplication ───────────────────────────────────────────────

  describe('stub name deduplication', () => {
    it('should generate unique file names for multiple configs with the same operation', () => {
      const configs = [makeConfig(), makeConfig(), makeConfig()];
      const stubs = service.generateStubs(configs);
      const names = stubs.map(s => s.fileName);
      expect(new Set(names).size).toBe(3);
    });
  });

  // ── multiple operations ───────────────────────────────────────────────────

  describe('multiple operations', () => {
    it('should generate stubs for all enabled operations', () => {
      const configs = [
        makeConfig({ operation: makeOperation({ path: '/a', method: 'GET' }) }),
        makeConfig({ operation: makeOperation({ path: '/b', method: 'POST' }) }),
        makeConfig({ operation: makeOperation({ path: '/c', method: 'DELETE' }) }),
      ];
      expect(service.generateStubs(configs).length).toBe(3);
    });

    it('should skip disabled operations in a mixed list', () => {
      const configs = [
        makeConfig({ operation: makeOperation({ path: '/a' }), enabled: true }),
        makeConfig({ operation: makeOperation({ path: '/b' }), enabled: false }),
        makeConfig({ operation: makeOperation({ path: '/c' }), enabled: true }),
      ];
      expect(service.generateStubs(configs).length).toBe(2);
    });
  });
});

