import {Injectable} from '@angular/core';
import * as jsyaml from 'js-yaml';
import {IOpenApiParserService} from "./openapi-parser.interface";

export interface ParsedOperation {
  path: string;
  method: string;
  operationId?: string;
  summary?: string;
  tags?: string[];
  parameters?: ParsedParameter[];
  requestBody?: ParsedRequestBody;
  responses: ParsedResponse[];
}

export interface ParsedParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  schema?: any;
  example?: any;
}

export interface ParsedRequestBody {
  required?: boolean;
  content: Record<string, { schema?: any; example?: any; examples?: any }>;
}

export interface ParsedResponse {
  statusCode: string;
  description?: string;
  headers?: Record<string, any>;
  content?: Record<string, { schema?: any; example?: any; examples?: any }>;
}

export interface ParsedSpec {
  title: string;
  version: string;
  specVersion: '2.0' | '3.0' | '3.1' | 'unknown';
  basePath?: string;
  operations: ParsedOperation[];
  errors: string[];
}

@Injectable({
  providedIn: 'root'
})
export class OpenApiParserService implements IOpenApiParserService {

  private static readonly MAX_SCHEMA_DEPTH = 5;

  /**
   * Parses a raw OpenAPI/Swagger spec string (YAML or JSON) and extracts operations.
   */
  async parse(rawSpec: string): Promise<ParsedSpec> {
    return this.parseSync(rawSpec);
  }

  /**
   * Synchronous implementation, exposed for internal use and testing convenience.
   */
  parseSync(rawSpec: string): ParsedSpec {
    const result: ParsedSpec = {
      title: 'Unknown',
      version: '1.0.0',
      specVersion: 'unknown',
      operations: [],
      errors: []
    };

    let spec: any;
    try {
      spec = this.parseRaw(rawSpec);
    } catch (e: any) {
      result.errors.push(`Failed to parse spec: ${e.message}`);
      return result;
    }

    if (!spec || typeof spec !== 'object') {
      result.errors.push('Invalid spec: not an object');
      return result;
    }

    // Detect spec version
    if (spec.swagger === '2.0') {
      result.specVersion = '2.0';
    } else if (spec.openapi?.startsWith('3.0')) {
      result.specVersion = '3.0';
    } else if (spec.openapi?.startsWith('3.1')) {
      result.specVersion = '3.1';
    } else {
      result.errors.push('Unrecognized spec version (expected swagger: 2.0 or openapi: 3.x)');
    }

    // Extract info
    result.title = spec.info?.title ?? 'Unknown';
    result.version = spec.info?.version ?? '1.0.0';

    // Base path (Swagger 2.0)
    if (result.specVersion === '2.0' && spec.basePath) {
      result.basePath = spec.basePath;
    }

    // Extract operations
    const paths = spec.paths ?? {};
    for (const [pathKey, pathItem] of Object.entries(paths)) {
      if (!pathItem || typeof pathItem !== 'object') continue;

      const sharedParams: any[] = (pathItem as any).parameters ?? [];

      for (const method of ['get', 'post', 'put', 'delete', 'patch', 'options', 'head']) {
        const operation: any = (pathItem as any)[method];
        if (!operation) continue;

        try {
          const parsed = this.parseOperation(pathKey, method.toUpperCase(), operation, sharedParams, result.specVersion, spec);
          result.operations.push(parsed);
        } catch (e: any) {
          result.errors.push(`Error parsing ${method.toUpperCase()} ${pathKey}: ${e.message}`);
        }
      }
    }

    return result;
  }

  private parseRaw(rawSpec: string): any {
    const trimmed = rawSpec.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return JSON.parse(trimmed);
    }
    return jsyaml.load(trimmed);
  }

  private parseOperation(
    path: string,
    method: string,
    operation: any,
    sharedParams: any[],
    specVersion: string,
    fullSpec: any
  ): ParsedOperation {
    const allParams = [...sharedParams, ...(operation.parameters ?? [])].map(p =>
      this.resolveRef(p, fullSpec)
    );

    const parameters: ParsedParameter[] = allParams
      .filter(p => p && ['path', 'query', 'header', 'cookie'].includes(p.in))
      .map(p => ({
        name: p.name,
        in: p.in,
        required: p.required ?? false,
        schema: p.schema ?? (p.type ? { type: p.type } : undefined),
        example: p.example ?? p.schema?.example ?? p.schema?.default
      }));

    let requestBody: ParsedRequestBody | undefined;
    if (operation.requestBody) {
      const rb = this.resolveRef(operation.requestBody, fullSpec);
      requestBody = {
        required: rb.required,
        content: rb.content ?? {}
      };
    } else if (operation.consumes || (specVersion === '2.0' && operation.parameters)) {
      // Swagger 2.0: body parameter
      const bodyParam = allParams.find(p => p.in === 'body');
      if (bodyParam) {
        requestBody = {
          required: bodyParam.required,
          content: {
            'application/json': {
              schema: bodyParam.schema
            }
          }
        };
      }
    }

    const responses: ParsedResponse[] = [];
    for (const [statusCode, responseObj] of Object.entries(operation.responses ?? {})) {
      const resolved = this.resolveRef(responseObj as any, fullSpec);
      const response: ParsedResponse = {
        statusCode,
        description: resolved.description
      };

      if (specVersion === '2.0') {
        // Swagger 2.0 response format
        if (resolved.schema || resolved.example) {
          response.content = {
            'application/json': {
              schema: resolved.schema ? this.resolveRef(resolved.schema, fullSpec) : undefined,
              example: resolved.example
            }
          };
        }
        if (resolved.headers) {
          response.headers = resolved.headers;
        }
      } else {
        // OpenAPI 3.x
        if (resolved.content) {
          response.content = {};
          for (const [mt, mediaType] of Object.entries(resolved.content as any)) {
            const mtResolved = this.resolveRef(mediaType as any, fullSpec);
            response.content[mt] = {
              schema: mtResolved.schema ? this.resolveRef(mtResolved.schema, fullSpec) : undefined,
              example: mtResolved.example,
              examples: mtResolved.examples
            };
          }
        }
        if (resolved.headers) {
          response.headers = resolved.headers;
        }
      }

      responses.push(response);
    }

    return {
      path,
      method,
      operationId: operation.operationId,
      summary: operation.summary,
      tags: operation.tags,
      parameters,
      requestBody,
      responses
    };
  }

  /**
   * Resolves a $ref if present, otherwise returns the object as-is.
   */
  resolveRef(obj: any, fullSpec: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    if (!obj.$ref) return obj;

    const ref: string = obj.$ref;
    if (!ref.startsWith('#/')) return obj; // External refs not supported

    const parts = ref.slice(2).split('/');
    let current = fullSpec;
    for (const part of parts) {
      const decoded = part.replace(/~1/g, '/').replace(/~0/g, '~');
      current = current?.[decoded];
      if (current === undefined) return obj;
    }
    return current;
  }

  /**
   * Returns the list of named examples keys for a given response status code of an operation.
   */
  getResponseExampleKeys(operation: ParsedOperation, statusCode: string, fullSpec?: any): string[] {
    const response = operation.responses.find(r => r.statusCode === statusCode)
      ?? operation.responses[0];
    if (!response?.content) return [];
    const types = Object.keys(response.content);
    const primaryType = types.find(t => t.includes('json')) ?? types[0];
    if (!primaryType) return [];
    const mediaEntry = response.content[primaryType];
    if (!mediaEntry?.examples) return [];
    return Object.keys(mediaEntry.examples);
  }

  /**
   * Returns ALL named response examples across all status codes,
   * as { key, statusCode } entries — used to populate the response example selector.
   */
  getAllResponseExamples(operation: ParsedOperation, fullSpec?: any): { key: string; statusCode: string }[] {
    const result: { key: string; statusCode: string }[] = [];
    for (const response of operation.responses) {
      if (!response?.content) continue;
      const types = Object.keys(response.content);
      const primaryType = types.find(t => t.includes('json')) ?? types[0];
      if (!primaryType) continue;
      const mediaEntry = response.content[primaryType];
      if (!mediaEntry?.examples) continue;
      for (const key of Object.keys(mediaEntry.examples)) {
        result.push({ key, statusCode: response.statusCode });
      }
    }
    return result;
  }

  /**
   * Returns the list of named examples keys for the request body of an operation.
   */
  getRequestBodyExampleKeys(operation: ParsedOperation, fullSpec?: any): string[] {
    if (!operation.requestBody?.content) return [];
    const types = Object.keys(operation.requestBody.content);
    const primaryType = types.find(t => t.includes('json')) ?? types[0];
    if (!primaryType) return [];
    const mediaEntry = operation.requestBody.content[primaryType];
    if (!mediaEntry?.examples) return [];
    return Object.keys(mediaEntry.examples);
  }

  /**
   * Attempts to extract a meaningful example value from a schema + media type entry.
   * Priority: examples (first) > example > schema.example > schema.default > generated minimal
   */
  extractExample(
    mediaTypeEntry: { schema?: any; example?: any; examples?: any } | undefined,
    fullSpec?: any
  ): any {
    if (!mediaTypeEntry) return null;

    // 1. examples object (OpenAPI 3.x)
    if (mediaTypeEntry.examples) {
      const firstKey = Object.keys(mediaTypeEntry.examples)[0];
      if (firstKey) {
        const ex = mediaTypeEntry.examples[firstKey];
        const resolved = fullSpec ? this.resolveRef(ex, fullSpec) : ex;
        return resolved?.value ?? resolved;
      }
    }

    // 2. example field
    if (mediaTypeEntry.example !== undefined) {
      return mediaTypeEntry.example;
    }

    // 3. schema.example or schema.default
    if (mediaTypeEntry.schema) {
      const schema = fullSpec ? this.resolveRef(mediaTypeEntry.schema, fullSpec) : mediaTypeEntry.schema;
      if (schema?.example !== undefined) return schema.example;
      if (schema?.default !== undefined) return schema.default;
      return this.generateFromSchema(schema, fullSpec, 0);
    }

    return null;
  }

  /**
   * Generates a minimal example object from a JSON Schema definition.
   */
  generateFromSchema(schema: any, fullSpec?: any, depth = 0): any {
    if (!schema || depth > OpenApiParserService.MAX_SCHEMA_DEPTH) return null;

    const resolved = fullSpec ? this.resolveRef(schema, fullSpec) : schema;
    if (!resolved) return null;

    if (resolved.example !== undefined) return resolved.example;
    if (resolved.default !== undefined) return resolved.default;

    // Handle allOf / oneOf / anyOf
    if (resolved.allOf) {
      return this.mergeSchemas(resolved.allOf, fullSpec, depth);
    }
    if (resolved.oneOf?.[0]) {
      return this.generateFromSchema(resolved.oneOf[0], fullSpec, depth + 1);
    }
    if (resolved.anyOf?.[0]) {
      return this.generateFromSchema(resolved.anyOf[0], fullSpec, depth + 1);
    }

    switch (resolved.type) {
      case 'object': {
        if (!resolved.properties) return {};
        const obj: any = {};
        for (const [propName, propSchema] of Object.entries(resolved.properties)) {
          obj[propName] = this.generateFromSchema(propSchema as any, fullSpec, depth + 1);
        }
        return obj;
      }
      case 'array': {
        const itemExample = this.generateFromSchema(resolved.items, fullSpec, depth + 1);
        return itemExample !== null ? [itemExample] : [];
      }
      case 'string':
        if (resolved.enum?.length) return resolved.enum[0];
        if (resolved.format === 'date-time') return new Date().toISOString();
        if (resolved.format === 'date') return new Date().toISOString().split('T')[0];
        if (resolved.format === 'uuid') return '00000000-0000-0000-0000-000000000000';
        if (resolved.format === 'email') return 'user@example.com';
        if (resolved.format === 'uri') return 'https://example.com';
        return 'string';      case 'integer':
      case 'number':
        if (resolved.enum?.length) return resolved.enum[0];
        return 0;
      case 'boolean':
        return true;
      case 'null':
        return null;
      default:
        // Infer from properties
        if (resolved.properties) {
          const obj: any = {};
          for (const [propName, propSchema] of Object.entries(resolved.properties)) {
            obj[propName] = this.generateFromSchema(propSchema as any, fullSpec, depth + 1);
          }
          return obj;
        }
        return null;
    }
  }

  private mergeSchemas(schemas: any[], fullSpec: any | undefined, depth: number): any {
    const result: any = {};
    for (const schema of schemas) {
      const example = this.generateFromSchema(schema, fullSpec, depth + 1);
      if (example && typeof example === 'object' && !Array.isArray(example)) {
        Object.assign(result, example);
      }
    }
    return result;
  }
}
