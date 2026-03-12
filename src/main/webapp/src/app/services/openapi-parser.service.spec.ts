import { TestBed } from '@angular/core/testing';
import { OpenApiParserService, ParsedOperation } from './openapi-parser.service';
import { describeIOpenApiParserService, SPEC_WITH_REFS, OPENAPI3_FULL } from './openapi-parser.shared-spec';

// ─── Shared contract suite ────────────────────────────────────────────────────

describeIOpenApiParserService('OpenApiParserService', () =>
  TestBed.inject(OpenApiParserService)
);

// ─── OpenApiParserService-specific tests ──────────────────────────────────────

describe('OpenApiParserService (specific)', () => {
  let service: OpenApiParserService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(OpenApiParserService);
  });

  // ── resolveRef() — real $ref resolution ───────────────────────────────────

  describe('resolveRef()', () => {
    const fullSpec = JSON.parse(SPEC_WITH_REFS);

    it('should resolve a local $ref', () => {
      const result = service.resolveRef({ $ref: '#/components/schemas/User' }, fullSpec);
      expect(result.type).toBe('object');
      expect(result.properties.id.type).toBe('integer');
    });

    it('should return the original object for an unresolvable $ref', () => {
      const obj = { $ref: '#/components/schemas/Missing' };
      expect(service.resolveRef(obj, fullSpec)).toBe(obj);
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
      expect(service.extractExample(entry)).toEqual({ name: 'string' });
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

  // ── getAllResponseExamples() — extra assertions ───────────────────────────

  describe('getAllResponseExamples() — extra assertions', () => {
    it('should also collect emptyExample from 200', async () => {
      const result = await service.parse(OPENAPI3_FULL);
      const getUsers = result.operations.find(
        (o: ParsedOperation) => o.method === 'GET' && o.path === '/users'
      )!;
      const keys = service.getAllResponseExamples(getUsers).map(e => e.key);
      expect(keys).toContain('emptyExample');
    });
  });
});

