import { Injectable } from '@angular/core';
import SwaggerParser from '@apidevtools/swagger-parser';
import {
  OpenApiParserService,
  ParsedOperation,
  ParsedParameter,
  ParsedRequestBody,
  ParsedResponse,
  ParsedSpec,
} from './openapi-parser.service';
import {IOpenApiParserService} from "./openapi-parser.interface";

/**
 * Alternative implementation backed by @apidevtools/swagger-parser.
 *
 * Key difference vs OpenApiParserService: `parse()` is async and returns
 * Promise<ParsedSpec>. SwaggerParser.dereference() replaces the manual
 * resolveRef() walk — the ParsedSpec handed back to callers is fully
 * resolved, no $ref objects remain anywhere in the tree.
 *
 * All stateless helpers (extractExample, generateFromSchema, ...) are
 * delegated to the base OpenApiParserService unchanged.
 */
@Injectable({ providedIn: 'root' })
export class SwaggerParserOpenApiParserService implements IOpenApiParserService {

  constructor(private readonly base: OpenApiParserService) {}

  // --- Main parse -----------------------------------------------------------

  async parse(rawSpec: string): Promise<ParsedSpec> {
    const result: ParsedSpec = {
      title: 'Unknown',
      version: '1.0.0',
      specVersion: 'unknown',
      operations: [],
      errors: []
    };

    // 1. Parse raw string to a plain JS object (JSON or YAML)
    let rawObject: any;
    try {
      rawObject = this.parseRaw(rawSpec);
    } catch (e: any) {
      result.errors.push(`Failed to parse spec: ${e.message}`);
      return result;
    }

    if (!rawObject || typeof rawObject !== 'object') {
      result.errors.push('Invalid spec: not an object');
      return result;
    }

    // 2. Detect spec version from root fields (before any transformation)
    if (rawObject.swagger === '2.0') {
      result.specVersion = '2.0';
    } else if (typeof rawObject.openapi === 'string' && rawObject.openapi.startsWith('3.0')) {
      result.specVersion = '3.0';
    } else if (typeof rawObject.openapi === 'string' && rawObject.openapi.startsWith('3.1')) {
      result.specVersion = '3.1';
    } else {
      result.errors.push('Unrecognized spec version (expected swagger: 2.0 or openapi: 3.x)');
    }

    // 3. Dereference all $ref pointers via swagger-parser
    let spec: any;
    try {
      spec = await SwaggerParser.dereference(rawObject as any, {
        dereference: { circular: 'ignore' }
      });
    } catch (e: any) {
      // Fall back to the raw object so the rest of the pipeline still runs
      spec = rawObject;
      result.errors.push(`Warning: $ref dereferencing failed (${e.message}), falling back to raw parsing`);
    }

    // 4. Extract top-level info
    result.title = spec.info?.title ?? 'Unknown';
    result.version = spec.info?.version ?? '1.0.0';
    if (result.specVersion === '2.0' && spec.basePath) {
      result.basePath = spec.basePath;
    }

    // 5. Extract operations — spec is fully dereferenced, no $ref remain
    const paths = spec.paths ?? {};
    for (const [pathKey, pathItem] of Object.entries(paths)) {
      if (!pathItem || typeof pathItem !== 'object') continue;
      const sharedParams: any[] = (pathItem as any).parameters ?? [];

      for (const method of ['get', 'post', 'put', 'delete', 'patch', 'options', 'head']) {
        const operation: any = (pathItem as any)[method];
        if (!operation) continue;
        try {
          result.operations.push(
            this.extractOperation(pathKey, method.toUpperCase(), operation, sharedParams, result.specVersion)
          );
        } catch (e: any) {
          result.errors.push(`Error parsing ${method.toUpperCase()} ${pathKey}: ${e.message}`);
        }
      }
    }

    return result;
  }

  // --- Compatibility shim ---------------------------------------------------

  /**
   * No-op: the spec delivered by parse() is already fully dereferenced.
   * Kept for API compatibility with OpenApiParserService.
   */
  resolveRef(obj: any, _fullSpec: any): any {
    return obj;
  }

  // --- Delegated helpers ----------------------------------------------------
  // Logic is $ref-agnostic once the spec is resolved — delegate to base service.

  getResponseExampleKeys(operation: ParsedOperation, statusCode: string): string[] {
    return this.base.getResponseExampleKeys(operation, statusCode);
  }

  getAllResponseExamples(operation: ParsedOperation): Array<{ key: string; statusCode: string }> {
    return this.base.getAllResponseExamples(operation);
  }

  getRequestBodyExampleKeys(operation: ParsedOperation): string[] {
    return this.base.getRequestBodyExampleKeys(operation);
  }

  extractExample(mediaTypeEntry: { schema?: any; example?: any; examples?: any } | undefined): any {
    return this.base.extractExample(mediaTypeEntry);
  }

  generateFromSchema(schema: any, fullSpec?: any, depth = 0): any {
    return this.base.generateFromSchema(schema, fullSpec, depth);
  }

  // --- Private --------------------------------------------------------------

  private parseRaw(rawSpec: string): any {
    const trimmed = rawSpec.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return JSON.parse(trimmed);
    }
    // js-yaml is already a project dependency — reuse it for YAML input
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const jsyaml = require('js-yaml');
    return jsyaml.load(trimmed);
  }

  /**
   * Builds a ParsedOperation from an already-dereferenced operation object.
   * No resolveRef() calls needed here.
   */
  private extractOperation(
    path: string,
    method: string,
    operation: any,
    sharedParams: any[],
    specVersion: string
  ): ParsedOperation {
    const allParams: any[] = [...sharedParams, ...(operation.parameters ?? [])];

    const parameters: ParsedParameter[] = allParams
      .filter(p => p && ['path', 'query', 'header', 'cookie'].includes(p.in))
      .map(p => ({
        name: p.name,
        in: p.in as ParsedParameter['in'],
        required: p.required ?? false,
        schema: p.schema ?? (p.type ? { type: p.type } : undefined),
        example: p.example ?? p.schema?.example ?? p.schema?.default
      }));

    let requestBody: ParsedRequestBody | undefined;
    if (operation.requestBody) {
      requestBody = {
        required: operation.requestBody.required,
        content: operation.requestBody.content ?? {}
      };
    } else if (specVersion === '2.0') {
      // Swagger 2.0: body parameter -> normalise to requestBody shape
      const bodyParam = allParams.find(p => p.in === 'body');
      if (bodyParam) {
        requestBody = {
          required: bodyParam.required,
          content: { 'application/json': { schema: bodyParam.schema } }
        };
      }
    }

    const responses: ParsedResponse[] = [];
    for (const [statusCode, responseObj] of Object.entries(operation.responses ?? {})) {
      const r = responseObj as any;
      const response: ParsedResponse = { statusCode, description: r.description };

      if (specVersion === '2.0') {
        if (r.schema || r.example) {
          response.content = { 'application/json': { schema: r.schema, example: r.example } };
        }
        if (r.headers) response.headers = r.headers;
      } else {
        if (r.content) {
          response.content = {};
          for (const [mt, mediaType] of Object.entries(r.content as any)) {
            const m = mediaType as any;
            response.content[mt] = { schema: m.schema, example: m.example, examples: m.examples };
          }
        }
        if (r.headers) response.headers = r.headers;
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
}
