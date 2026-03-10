import { TestBed } from '@angular/core/testing';
import { OpenApiParserService, ParsedOperation } from './openapi-parser.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const OPENAPI3_MINIMAL = JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'My API', version: '2.1.0' },
  paths: {
    '/users': {
      get: {
        operationId: 'listUsers',
        summary: 'List users',
        responses: { '200': { description: 'OK' } }
      }
    }
  }
});

const OPENAPI3_FULL = JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'Full API', version: '1.0.0' },
  paths: {
    '/users': {
      get: {
        summary: 'List users',
        parameters: [
          { name: 'page', in: 'query', required: true, schema: { type: 'integer' } }
        ],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } },
                examples: {
                  successExample: { value: { id: 1, name: 'Alice' } },
                  emptyExample:   { value: { id: 2, name: 'Bob' } }
                }
              }
            }
          },
          '404': {
            description: 'Not found',
            content: {
              'application/json': {
                examples: {
                  notFoundExample: { value: { error: 'User not found' } }
                }
              }
            }
          }
        }
      },
      post: {
        summary: 'Create user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', properties: { name: { type: 'string' } } },
              examples: {
                createRequest: { value: { name: 'Charlie' } }
              }
            }
          }
        },
        responses: { '201': { description: 'Created' } }
      }
    },
    '/users/{id}': {
      get: {
        summary: 'Get user',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } }
        ],
        responses: { '200': { description: 'OK' } }
      }
    }
  }
});

const SWAGGER2_SPEC = JSON.stringify({
  swagger: '2.0',
  info: { title: 'Swagger API', version: '0.1.0' },
  basePath: '/api',
  paths: {
    '/items': {
      get: {
        summary: 'List items',
        parameters: [
          { name: 'q', in: 'query', required: false, type: 'string' }
        ],
        responses: {
          '200': {
            description: 'OK',
            schema: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' } } } }
          }
        }
      }
    }
  }
});

const YAML_SPEC = `
openapi: 3.0.0
info:
  title: YAML API
  version: 1.0.0
paths:
  /ping:
    get:
      summary: Ping
      responses:
        '200':
          description: pong
`;

const SPEC_WITH_REFS = JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'Ref API', version: '1.0.0' },
  components: {
    schemas: {
      User: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } }
    }
  },
  paths: {
    '/users': {
      get: {
        summary: 'List',
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' }
              }
            }
          }
        }
      }
    }
  }
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OpenApiParserService', () => {
  let service: OpenApiParserService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(OpenApiParserService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── parse() ───────────────────────────────────────────────────────────────

  describe('parse()', () => {
    it('should return error for invalid input', () => {
      const result = service.parse('not json or yaml {{{{');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return error for unrecognized spec version', () => {
      const result = service.parse(JSON.stringify({ openapi: '2.5.0', info: {}, paths: {} }));
      expect(result.errors.some(e => e.includes('Unrecognized'))).toBeTrue();
    });

    it('should detect OpenAPI 3.0 version', () => {
      const result = service.parse(OPENAPI3_MINIMAL);
      expect(result.specVersion).toBe('3.0');
    });

    it('should detect OpenAPI 3.1 version', () => {
      const spec = JSON.stringify({ openapi: '3.1.0', info: { title: 'T', version: '1' }, paths: {} });
      expect(service.parse(spec).specVersion).toBe('3.1');
    });

    it('should detect Swagger 2.0 version', () => {
      const result = service.parse(SWAGGER2_SPEC);
      expect(result.specVersion).toBe('2.0');
    });

    it('should extract title and version from info', () => {
      const result = service.parse(OPENAPI3_MINIMAL);
      expect(result.title).toBe('My API');
      expect(result.version).toBe('2.1.0');
    });

    it('should extract basePath for Swagger 2.0', () => {
      const result = service.parse(SWAGGER2_SPEC);
      expect(result.basePath).toBe('/api');
    });

    it('should parse a YAML spec', () => {
      const result = service.parse(YAML_SPEC);
      expect(result.errors.length).toBe(0);
      expect(result.title).toBe('YAML API');
      expect(result.operations.length).toBe(1);
      expect(result.operations[0].path).toBe('/ping');
    });

    it('should extract operations from paths', () => {
      const result = service.parse(OPENAPI3_FULL);
      expect(result.operations.length).toBe(3); // GET /users, POST /users, GET /users/{id}
    });

    it('should correctly set method and path on operations', () => {
      const result = service.parse(OPENAPI3_MINIMAL);
      const op = result.operations[0];
      expect(op.method).toBe('GET');
      expect(op.path).toBe('/users');
    });

    it('should extract operationId and summary', () => {
      const result = service.parse(OPENAPI3_MINIMAL);
      const op = result.operations[0];
      expect(op.operationId).toBe('listUsers');
      expect(op.summary).toBe('List users');
    });

    it('should extract query parameters', () => {
      const result = service.parse(OPENAPI3_FULL);
      const getUsers = result.operations.find(o => o.method === 'GET' && o.path === '/users')!;
      expect(getUsers.parameters?.length).toBe(1);
      expect(getUsers.parameters![0].name).toBe('page');
      expect(getUsers.parameters![0].in).toBe('query');
      expect(getUsers.parameters![0].required).toBeTrue();
    });

    it('should extract path parameters', () => {
      const result = service.parse(OPENAPI3_FULL);
      const getUser = result.operations.find(o => o.path === '/users/{id}')!;
      expect(getUser.parameters?.length).toBe(1);
      expect(getUser.parameters![0].name).toBe('id');
      expect(getUser.parameters![0].in).toBe('path');
    });

    it('should extract requestBody for POST', () => {
      const result = service.parse(OPENAPI3_FULL);
      const post = result.operations.find(o => o.method === 'POST')!;
      expect(post.requestBody).toBeDefined();
      expect(post.requestBody!.required).toBeTrue();
      expect(post.requestBody!.content['application/json']).toBeDefined();
    });

    it('should extract responses with status codes', () => {
      const result = service.parse(OPENAPI3_FULL);
      const getUsers = result.operations.find(o => o.method === 'GET' && o.path === '/users')!;
      const codes = getUsers.responses.map(r => r.statusCode);
      expect(codes).toContain('200');
      expect(codes).toContain('404');
    });

    it('should extract Swagger 2.0 body parameter as requestBody', () => {
      const spec = JSON.stringify({
        swagger: '2.0', info: { title: 'T', version: '1' }, basePath: '/',
        paths: {
          '/items': {
            post: {
              parameters: [{ name: 'body', in: 'body', required: true, schema: { type: 'object' } }],
              responses: { '201': { description: 'Created' } }
            }
          }
        }
      });
      const result = service.parse(spec);
      const post = result.operations[0];
      expect(post.requestBody).toBeDefined();
      expect(post.requestBody!.required).toBeTrue();
    });
  });

  // ── resolveRef() ──────────────────────────────────────────────────────────

  describe('resolveRef()', () => {
    const fullSpec = JSON.parse(SPEC_WITH_REFS);

    it('should return object as-is if no $ref', () => {
      const obj = { type: 'string' };
      expect(service.resolveRef(obj, fullSpec)).toBe(obj);
    });

    it('should resolve a local $ref', () => {
      const result = service.resolveRef({ $ref: '#/components/schemas/User' }, fullSpec);
      expect(result.type).toBe('object');
      expect(result.properties.id.type).toBe('integer');
    });

    it('should return the original object for an unresolvable $ref', () => {
      const obj = { $ref: '#/components/schemas/Missing' };
      expect(service.resolveRef(obj, fullSpec)).toBe(obj);
    });

    it('should return null/undefined input as-is', () => {
      expect(service.resolveRef(null, fullSpec)).toBeNull();
      expect(service.resolveRef(undefined, fullSpec)).toBeUndefined();
    });
  });

  // ── extractExample() ──────────────────────────────────────────────────────

  describe('extractExample()', () => {
    it('should return null for undefined input', () => {
      expect(service.extractExample(undefined)).toBeNull();
    });

    it('should return value from examples object (first key)', () => {
      const entry = {
        examples: { first: { value: { id: 1 } }, second: { value: { id: 2 } } }
      };
      expect(service.extractExample(entry)).toEqual({ id: 1 });
    });

    it('should return value from example field when no examples object', () => {
      const entry = { example: { id: 42 } };
      expect(service.extractExample(entry)).toEqual({ id: 42 });
    });

    it('should return schema.example when present', () => {
      const entry = { schema: { type: 'object', example: { foo: 'bar' } } };
      expect(service.extractExample(entry)).toEqual({ foo: 'bar' });
    });

    it('should generate from schema when no explicit example', () => {
      const entry = {
        schema: { type: 'object', properties: { name: { type: 'string' } } }
      };
      const result = service.extractExample(entry);
      expect(result).toEqual({ name: 'string' });
    });
  });

  // ── generateFromSchema() ──────────────────────────────────────────────────

  describe('generateFromSchema()', () => {
    it('should generate string', () => {
      expect(service.generateFromSchema({ type: 'string' })).toBe('string');
    });

    it('should generate integer 0', () => {
      expect(service.generateFromSchema({ type: 'integer' })).toBe(0);
    });

    it('should generate boolean true', () => {
      expect(service.generateFromSchema({ type: 'boolean' })).toBe(true);
    });

    it('should generate null for null type', () => {
      expect(service.generateFromSchema({ type: 'null' })).toBeNull();
    });

    it('should use enum first value for string', () => {
      expect(service.generateFromSchema({ type: 'string', enum: ['a', 'b'] })).toBe('a');
    });

    it('should generate uuid format', () => {
      expect(service.generateFromSchema({ type: 'string', format: 'uuid' }))
        .toBe('00000000-0000-0000-0000-000000000000');
    });

    it('should generate email format', () => {
      expect(service.generateFromSchema({ type: 'string', format: 'email' }))
        .toBe('user@example.com');
    });

    it('should generate uri format', () => {
      expect(service.generateFromSchema({ type: 'string', format: 'uri' }))
        .toBe('https://example.com');
    });

    it('should generate object with properties', () => {
      const schema = {
        type: 'object',
        properties: { id: { type: 'integer' }, name: { type: 'string' } }
      };
      expect(service.generateFromSchema(schema)).toEqual({ id: 0, name: 'string' });
    });

    it('should generate array with one item', () => {
      const schema = { type: 'array', items: { type: 'integer' } };
      expect(service.generateFromSchema(schema)).toEqual([0]);
    });

    it('should return empty array for array with null items', () => {
      const schema = { type: 'array', items: null };
      expect(service.generateFromSchema(schema)).toEqual([]);
    });

    it('should respect MAX_SCHEMA_DEPTH and stop recursion', () => {
      const deepSchema: any = { type: 'object', properties: {} };
      let current = deepSchema;
      for (let i = 0; i < 10; i++) {
        current.properties.nested = { type: 'object', properties: {} };
        current = current.properties.nested;
      }
      // Should not throw, just return a partial result
      expect(() => service.generateFromSchema(deepSchema)).not.toThrow();
    });

    it('should handle allOf by merging schemas', () => {
      const schema = {
        allOf: [
          { type: 'object', properties: { a: { type: 'string' } } },
          { type: 'object', properties: { b: { type: 'integer' } } }
        ]
      };
      expect(service.generateFromSchema(schema)).toEqual({ a: 'string', b: 0 });
    });

    it('should handle oneOf by using first schema', () => {
      const schema = {
        oneOf: [
          { type: 'string' },
          { type: 'integer' }
        ]
      };
      expect(service.generateFromSchema(schema)).toBe('string');
    });

    it('should use schema.default when present', () => {
      expect(service.generateFromSchema({ type: 'string', default: 'hello' })).toBe('hello');
    });
  });

  // ── getAllResponseExamples() ───────────────────────────────────────────────

  describe('getAllResponseExamples()', () => {
    it('should return empty array when no content', () => {
      const op: ParsedOperation = {
        path: '/test', method: 'GET',
        responses: [{ statusCode: '200' }]
      };
      expect(service.getAllResponseExamples(op)).toEqual([]);
    });

    it('should collect examples from multiple status codes', () => {
      const result = service.parse(OPENAPI3_FULL);
      const getUsers = result.operations.find(o => o.method === 'GET' && o.path === '/users')!;
      const examples = service.getAllResponseExamples(getUsers);
      const keys = examples.map(e => e.key);
      const statuses = examples.map(e => e.statusCode);
      expect(keys).toContain('successExample');
      expect(keys).toContain('emptyExample');
      expect(keys).toContain('notFoundExample');
      expect(statuses).toContain('200');
      expect(statuses).toContain('404');
    });

    it('should map example keys to their correct statusCode', () => {
      const result = service.parse(OPENAPI3_FULL);
      const getUsers = result.operations.find(o => o.method === 'GET' && o.path === '/users')!;
      const examples = service.getAllResponseExamples(getUsers);
      const notFound = examples.find(e => e.key === 'notFoundExample');
      expect(notFound?.statusCode).toBe('404');
    });
  });

  // ── getRequestBodyExampleKeys() ───────────────────────────────────────────

  describe('getRequestBodyExampleKeys()', () => {
    it('should return empty array when no requestBody', () => {
      const result = service.parse(OPENAPI3_FULL);
      const getUsers = result.operations.find(o => o.method === 'GET' && o.path === '/users')!;
      expect(service.getRequestBodyExampleKeys(getUsers)).toEqual([]);
    });

    it('should return example keys from requestBody', () => {
      const result = service.parse(OPENAPI3_FULL);
      const post = result.operations.find(o => o.method === 'POST')!;
      expect(service.getRequestBodyExampleKeys(post)).toEqual(['createRequest']);
    });
  });

  // ── $ref resolution in parsed spec ────────────────────────────────────────

  describe('$ref resolution in parsed spec', () => {
    it('should resolve $ref in response schema', () => {
      const result = service.parse(SPEC_WITH_REFS);
      expect(result.errors.length).toBe(0);
      const op = result.operations[0];
      const content = op.responses[0].content?.['application/json'];
      expect(content?.schema?.type).toBe('object');
    });
  });
});

