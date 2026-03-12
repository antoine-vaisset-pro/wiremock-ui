import { InjectionToken } from '@angular/core';
import { ParsedOperation, ParsedSpec } from './openapi-parser.service';
/**
 * Common interface implemented by all OpenAPI parser service variants.
 * parse() is always async to accommodate implementations that require
 * asynchronous processing (e.g. $ref dereferencing via swagger-parser).
 */
export interface IOpenApiParserService {
  parse(rawSpec: string): Promise<ParsedSpec>;
  resolveRef(obj: any, fullSpec: any): any;
  getResponseExampleKeys(operation: ParsedOperation, statusCode: string, fullSpec?: any): string[];
  getAllResponseExamples(operation: ParsedOperation, fullSpec?: any): Array<{ key: string; statusCode: string }>;
  getRequestBodyExampleKeys(operation: ParsedOperation, fullSpec?: any): string[];
  extractExample(mediaTypeEntry: { schema?: any; example?: any; examples?: any } | undefined, fullSpec?: any): any;
  generateFromSchema(schema: any, fullSpec?: any, depth?: number): any;
}
export const OPENAPI_PARSER_SERVICE = new InjectionToken<IOpenApiParserService>('IOpenApiParserService');
