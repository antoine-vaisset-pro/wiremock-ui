import { Injectable } from '@angular/core';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { ParsedOperation, ParsedResponse, OpenApiParserService } from './openapi-parser.service';

export type WireMockFault = 'CONNECTION_RESET_BY_PEER' | 'EMPTY_RESPONSE' | 'MALFORMED_RESPONSE_CHUNK' | 'RANDOM_DATA_THEN_CLOSE';

export type ErrorCaseType =
  | 'http_400' | 'http_404' | 'http_500'
  | WireMockFault;

export interface StubConfig {
  operation: ParsedOperation;
  enabled: boolean;
  statusCode: string;
  urlPrefix: string;
  generateErrorCases: boolean;
  /** Single WireMock fault type to generate as an additional stub (empty = none) */
  faultType?: string;
  /** @deprecated use faultType instead */
  errorCaseTypes?: ErrorCaseType[];
  /** Key of the selected request example (from operation.requestBody examples) */
  selectedRequestExample?: string;
  /** Key of the selected response example (from the matched response examples) */
  selectedResponseExample?: string;
  /** Full spec object for $ref resolution */
  fullSpec?: any;
}

export interface GeneratedStub {
  fileName: string;
  mapping: WireMockMapping;
  bodyFileName?: string;
  bodyContent?: any;
}

export interface WireMockMapping {
  name?: string;
  request: {
    method: string;
    url?: string;
    urlPattern?: string;
    urlPath?: string;
    queryParameters?: { [key: string]: any };
    headers?: { [key: string]: any };
    bodyPatterns?: Array<{ equalToJson: string; ignoreArrayOrder?: boolean; ignoreExtraElements?: boolean }>;
  };
  response: {
    status: number;
    headers?: { [key: string]: string };
    jsonBody?: any;
    bodyFileName?: string;
    body?: string;
    fault?: string;
  };
  priority?: number;
}

@Injectable({
  providedIn: 'root'
})
export class StubGeneratorService {

  private static readonly MAX_INLINE_BODY_LENGTH = 2048;

  constructor(private parser: OpenApiParserService) {}

  /**
   * Generates WireMock stubs from the provided stub configurations.
   */
  generateStubs(configs: StubConfig[]): GeneratedStub[] {
    const stubs: GeneratedStub[] = [];
    const usedNames = new Set<string>();

    for (const config of configs) {
      if (!config.enabled) continue;

      const happyStub = this.generateStub(config, config.statusCode, usedNames);
      if (happyStub) stubs.push(happyStub);

      // Fault stub: single WireMock fault combobox
      if (config.faultType) {
        const faultStub = this.generateFaultStub(config, config.faultType, usedNames);
        if (faultStub) stubs.push(faultStub);
      }
    }

    return stubs;
  }

  private generateFaultStub(
    config: StubConfig,
    fault: string,
    usedNames: Set<string>
  ): GeneratedStub | null {
    const { operation, urlPrefix } = config;
    const fullPath = (urlPrefix || '') + operation.path;
    const hasPathParams = /\{[^}]+\}/.test(fullPath);

    const requestMatcher: WireMockMapping['request'] = { method: operation.method };
    if (hasPathParams) {
      const pattern = fullPath.replace(/\{[^}]+\}/g, '[^/]+');
      requestMatcher.urlPattern = `^${pattern}(\\?.*)?$`;
    } else {
      requestMatcher.urlPath = fullPath;
    }

    const baseName = this.buildStubName(operation, fault.toLowerCase(), true, usedNames);
    usedNames.add(baseName);

    const mapping: WireMockMapping = {
      name: `${operation.summary ?? `${operation.method} ${operation.path}`} (${fault})`,
      request: requestMatcher,
      response: {
        status: 200,
        fault
      },
      priority: hasPathParams ? 5 : 1
    };

    return { fileName: `${baseName}.json`, mapping };
  }

  private generateStub(
    config: StubConfig,
    statusCode: string,
    usedNames: Set<string>,
    isError = false
  ): GeneratedStub | null {
    const { operation, urlPrefix } = config;
    const status = parseInt(statusCode, 10);

    // Build URL pattern
    const fullPath = (urlPrefix || '') + operation.path;
    const hasPathParams = /\{[^}]+\}/.test(fullPath);

    // Find matching response from spec
    const matchedResponse = operation.responses.find(r =>
      r.statusCode === statusCode || r.statusCode === 'default'
    ) ?? operation.responses[0];

    // Build request matcher
    const requestMatcher: WireMockMapping['request'] = {
      method: operation.method
    };

    if (hasPathParams) {
      const pattern = fullPath.replace(/\{[^}]+\}/g, '[^/]+');
      requestMatcher.urlPattern = `^${pattern}(\\?.*)?$`;
    } else {
      requestMatcher.urlPath = fullPath;
    }

    // Add required query params if any
    const requiredQueryParams = (operation.parameters ?? []).filter(
      p => p.in === 'query' && p.required
    );
    if (requiredQueryParams.length > 0) {
      requestMatcher.queryParameters = {};
      for (const param of requiredQueryParams) {
        requestMatcher.queryParameters[param.name] = { present: true };
      }
    }

    // Add request body matching if a request example is selected
    if (!isError && config.selectedRequestExample && operation.requestBody?.content) {
      const rbTypes = Object.keys(operation.requestBody.content);
      const rbPrimaryType = rbTypes.find(t => t.includes('json')) ?? rbTypes[0];
      const rbMediaEntry = rbPrimaryType ? operation.requestBody.content[rbPrimaryType] : undefined;
      if (rbMediaEntry?.examples?.[config.selectedRequestExample]) {
        const ex = rbMediaEntry.examples[config.selectedRequestExample];
        const resolved = config.fullSpec ? this.parser.resolveRef(ex, config.fullSpec) : ex;
        const exampleValue = resolved?.value ?? resolved;
        if (exampleValue !== null && exampleValue !== undefined) {
          requestMatcher.bodyPatterns = [{
            equalToJson: JSON.stringify(exampleValue),
            ignoreArrayOrder: true,
            ignoreExtraElements: false
          }];
        }
      }
    }

    // Build response
    const responseHeaders: { [key: string]: string } = {};
    const primaryMediaType = this.getPrimaryMediaType(matchedResponse);
    if (primaryMediaType) {
      responseHeaders['Content-Type'] = primaryMediaType;
    }

    // Extract response body
    let bodyContent: any = null;
    if (!isError && matchedResponse?.content) {
      const mediaEntry = matchedResponse.content[primaryMediaType ?? '']
        ?? Object.values(matchedResponse.content)[0];
      if (mediaEntry) {
        // Use selected example if provided
        const selectedKey = config.selectedResponseExample;
        if (selectedKey && mediaEntry.examples?.[selectedKey]) {
          const ex = mediaEntry.examples[selectedKey];
          const resolved = config.fullSpec ? this.parser.resolveRef(ex, config.fullSpec) : ex;
          bodyContent = resolved?.value ?? resolved;
        } else {
          bodyContent = this.parser.extractExample(mediaEntry, config.fullSpec);
        }
      }
    } else if (isError) {
      bodyContent = this.buildErrorBody(status, operation.path);
    }

    // Build file name
    const baseName = this.buildStubName(operation, statusCode, isError, usedNames);
    usedNames.add(baseName);

    const mapping: WireMockMapping = {
      name: operation.summary ?? `${operation.method} ${operation.path}`,
      request: requestMatcher,
      response: {
        status,
        headers: Object.keys(responseHeaders).length > 0 ? responseHeaders : undefined
      },
      priority: hasPathParams ? 5 : 1
    };

    const stub: GeneratedStub = { fileName: `${baseName}.json`, mapping };

    if (bodyContent !== null) {
      const isJson = primaryMediaType?.includes('json') !== false;
      if (isJson && typeof bodyContent === 'object') {
        // Inline small JSON bodies; use external file for larger ones
        const bodyStr = JSON.stringify(bodyContent);
        if (bodyStr.length <= StubGeneratorService.MAX_INLINE_BODY_LENGTH) {
          mapping.response.jsonBody = bodyContent;
        } else {
          const bodyFileName = `${baseName}-body.json`;
          mapping.response.bodyFileName = bodyFileName;
          stub.bodyFileName = bodyFileName;
          stub.bodyContent = bodyContent;
        }
      } else {
        mapping.response.body = String(bodyContent);
      }
    }

    return stub;
  }

  private getPrimaryMediaType(response: ParsedResponse | undefined): string | undefined {
    if (!response?.content) return undefined;
    const types = Object.keys(response.content);
    return types.find(t => t.includes('json')) ?? types[0];
  }

  private buildStubName(
    operation: ParsedOperation,
    statusCode: string,
    isError: boolean,
    usedNames: Set<string>
  ): string {
    const method = operation.method.toLowerCase();
    const pathPart = operation.path
      .replace(/^\//, '')
      .replace(/\//g, '-')
      .replace(/[{}]/g, '')
      .replace(/[^a-zA-Z0-9-_]/g, '')
      .toLowerCase()
      || 'root';

    const suffix = isError ? `-${statusCode}-error` : statusCode !== '200' ? `-${statusCode}` : '';
    let name = `${method}-${pathPart}${suffix}`;

    // Deduplicate
    let counter = 1;
    let candidate = name;
    while (usedNames.has(candidate)) {
      candidate = `${name}-${++counter}`;
    }
    return candidate;
  }

  private buildErrorBody(status: number, path: string): any {
    const messages: { [key: number]: string } = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      422: 'Unprocessable Entity',
      500: 'Internal Server Error'
    };
    return {
      error: messages[status] ?? 'Error',
      status,
      path,
      timestamp: '{{now}}'
    };
  }

  /**
   * Builds the default status code for an operation from its responses.
   */
  getDefaultStatusCode(operation: ParsedOperation): string {
    const successCode = operation.responses.find(r =>
      r.statusCode.startsWith('2') || r.statusCode === 'default'
    );
    return successCode?.statusCode === 'default' ? '200' : (successCode?.statusCode ?? '200');
  }

  /**
   * Exports the generated stubs as a ZIP archive with WireMock directory structure.
   */
  async exportAsZip(stubs: GeneratedStub[], archiveName = 'wiremock-stubs'): Promise<void> {
    const zip = new JSZip();
    const mappings = zip.folder('mappings')!;
    const files = zip.folder('__files')!;

    for (const stub of stubs) {
      mappings.file(stub.fileName, JSON.stringify(stub.mapping, null, 2));
      if (stub.bodyFileName && stub.bodyContent !== undefined) {
        files.file(stub.bodyFileName, JSON.stringify(stub.bodyContent, null, 2));
      }
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `${archiveName}.zip`);
  }

  /**
   * Exports a single stub as a JSON file download.
   */
  exportSingleStub(stub: GeneratedStub): void {
    const blob = new Blob([JSON.stringify(stub.mapping, null, 2)], { type: 'application/json' });
    saveAs(blob, stub.fileName);
  }
}
