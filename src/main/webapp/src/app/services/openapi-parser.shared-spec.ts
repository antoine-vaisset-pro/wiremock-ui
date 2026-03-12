import { TestBed } from '@angular/core/testing';
import { IOpenApiParserService } from './openapi-parser.interface';
// --- Shared fixtures ---------------------------------------------------------
export const OPENAPI3_MINIMAL = JSON.stringify({
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
export const OPENAPI3_FULL = JSON.stringify({
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
                examples: { notFoundExample: { value: { error: 'User not found' } } }
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
              examples: { createRequest: { value: { name: 'Charlie' } } }
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
export const SWAGGER2_SPEC = JSON.stringify({
  swagger: '2.0',
  info: { title: 'Swagger API', version: '0.1.0' },
  basePath: '/api',
  paths: {
    '/items': {
      get: {
        summary: 'List items',
        parameters: [{ name: 'q', in: 'query', required: false, type: 'string' }],
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
export const YAML_SPEC = `
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
export const SPEC_WITH_REFS = JSON.stringify({
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
            content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } }
          }
        }
      }
    }
  }
});
// --- Contract suite ----------------------------------------------------------
// Call describeIOpenApiParserService() from each implementation spec file to
// run the full contract against that specific implementation.
export function describeIOpenApiParserService(
  label: string,
  getService: () => IOpenApiParserService
): void {
  describe(label + ' (IOpenApiParserService contract)', () => {
    let service: IOpenApiParserService;
    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = getService();
    });
    it('should be created', () => {
      expect(service).toBeTruthy();
    });
    // -- parse() --------------------------------------------------------------
    describe('parse()', () => {
      it('should return error for invalid input', async () => {
        const result = await service.parse('not json or yaml {{{{');
        expect(result.errors.length).toBeGreaterThan(0);
      });
      it('should return error for unrecognized spec version', async () => {
        const result = await service.parse(JSON.stringify({ openapi: '2.5.0', info: {}, paths: {} }));
        expect(result.errors.some(e => e.includes('Unrecognized'))).toBeTrue();
      });
      it('should detect OpenAPI 3.0 version', async () => {
        expect((await service.parse(OPENAPI3_MINIMAL)).specVersion).toBe('3.0');
      });
      it('should detect OpenAPI 3.1 version', async () => {
        const spec = JSON.stringify({ openapi: '3.1.0', info: { title: 'T', version: '1' }, paths: {} });
        expect((await service.parse(spec)).specVersion).toBe('3.1');
      });
      it('should detect Swagger 2.0 version', async () => {
        expect((await service.parse(SWAGGER2_SPEC)).specVersion).toBe('2.0');
      });
      it('should extract title and version from info', async () => {
        const result = await service.parse(OPENAPI3_MINIMAL);
        expect(result.title).toBe('My API');
        expect(result.version).toBe('2.1.0');
      });
      it('should extract basePath for Swagger 2.0', async () => {
        expect((await service.parse(SWAGGER2_SPEC)).basePath).toBe('/api');
      });
      it('should parse a YAML spec', async () => {
        const result = await service.parse(YAML_SPEC);
        expect(result.errors.length).toBe(0);
        expect(result.title).toBe('YAML API');
        expect(result.operations.length).toBe(1);
        expect(result.operations[0].path).toBe('/ping');
      });
      it('should extract 3 operations from paths', async () => {
        expect((await service.parse(OPENAPI3_FULL)).operations.length).toBe(3);
      });
      it('should correctly set method and path on operations', async () => {
        const op = (await service.parse(OPENAPI3_MINIMAL)).operations[0];
        expect(op.method).toBe('GET');
        expect(op.path).toBe('/users');
      });
      it('should extract operationId and summary', async () => {
        const op = (await service.parse(OPENAPI3_MINIMAL)).operations[0];
        expect(op.operationId).toBe('listUsers');
        expect(op.summary).toBe('List users');
      });
      it('should extract query parameters', async () => {
        const result = await service.parse(OPENAPI3_FULL);
        const p = result.operations.find(o => o.method === 'GET' && o.path === '/users')!.parameters![0];
        expect(p.name).toBe('page');
        expect(p.in).toBe('query');
        expect(p.required).toBeTrue();
      });
      it('should extract path parameters', async () => {
        const result = await service.parse(OPENAPI3_FULL);
        const p = result.operations.find(o => o.path === '/users/{id}')!.parameters![0];
        expect(p.name).toBe('id');
        expect(p.in).toBe('path');
      });
      it('should extract requestBody for POST', async () => {
        const result = await service.parse(OPENAPI3_FULL);
        const post = result.operations.find(o => o.method === 'POST')!;
        expect(post.requestBody).toBeDefined();
        expect(post.requestBody!.required).toBeTrue();
        expect(post.requestBody!.content['application/json']).toBeDefined();
      });
      it('should extract responses with status codes', async () => {
        const result = await service.parse(OPENAPI3_FULL);
        const codes = result.operations
          .find(o => o.method === 'GET' && o.path === '/users')!
          .responses.map(r => r.statusCode);
        expect(codes).toContain('200');
        expect(codes).toContain('404');
      });
      it('should extract Swagger 2.0 body parameter as requestBody', async () => {
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
        const post = (await service.parse(spec)).operations[0];
        expect(post.requestBody).toBeDefined();
        expect(post.requestBody!.required).toBeTrue();
      });
      it('should expose a resolved schema type for $ref responses', async () => {
        const result = await service.parse(SPEC_WITH_REFS);
        expect(result.errors.length).toBe(0);
        const content = result.operations[0].responses[0].content?.['application/json'];
        expect(content?.schema?.type).toBe('object');
      });
    });
    // -- resolveRef() ---------------------------------------------------------
    describe('resolveRef()', () => {
      it('should return the object as-is when there is no $ref', () => {
        const obj = { type: 'string' };
        expect(service.resolveRef(obj, {})).toBe(obj);
      });
      it('should return null/undefined as-is', () => {
        expect(service.resolveRef(null, {})).toBeNull();
        expect(service.resolveRef(undefined, {})).toBeUndefined();
      });
    });
    // -- getAllResponseExamples() ----------------------------------------------
    describe('getAllResponseExamples()', () => {
      it('should return empty array when no content', () => {
        expect(service.getAllResponseExamples({
          path: '/test', method: 'GET', responses: [{ statusCode: '200' }]
        })).toEqual([]);
      });
      it('should collect examples from multiple status codes', async () => {
        const result = await service.parse(OPENAPI3_FULL);
        const getUsers = result.operations.find(o => o.method === 'GET' && o.path === '/users')!;
        const examples = service.getAllResponseExamples(getUsers);
        expect(examples.map(e => e.key)).toContain('successExample');
        expect(examples.map(e => e.key)).toContain('notFoundExample');
        expect(examples.map(e => e.statusCode)).toContain('200');
        expect(examples.map(e => e.statusCode)).toContain('404');
      });
      it('should map each example key to its correct statusCode', async () => {
        const result = await service.parse(OPENAPI3_FULL);
        const getUsers = result.operations.find(o => o.method === 'GET' && o.path === '/users')!;
        const notFound = service.getAllResponseExamples(getUsers).find(e => e.key === 'notFoundExample');
        expect(notFound?.statusCode).toBe('404');
      });
    });
    // -- getRequestBodyExampleKeys() ------------------------------------------
    describe('getRequestBodyExampleKeys()', () => {
      it('should return empty array when no requestBody', async () => {
        const result = await service.parse(OPENAPI3_FULL);
        const getUsers = result.operations.find(o => o.method === 'GET' && o.path === '/users')!;
        expect(service.getRequestBodyExampleKeys(getUsers)).toEqual([]);
      });
      it('should return example keys from requestBody', async () => {
        const result = await service.parse(OPENAPI3_FULL);
        const post = result.operations.find(o => o.method === 'POST')!;
        expect(service.getRequestBodyExampleKeys(post)).toEqual(['createRequest']);
      });
    });
  });
}
