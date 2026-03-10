export interface StubMapping {
  id?: string;
  uuid?: string;
  name?: string;
  request: {
    method?: string;
    url?: string;
    urlPattern?: string;
    urlPath?: string;
    urlPathPattern?: string;
    queryParameters?: any;
    headers?: any;
    bodyPatterns?: any[];
    cookies?: any;
    basicAuthCredentials?: { username: string; password: string };
    formParameters?: any;
  };
  response?: {
    status?: number;
    statusMessage?: string;
    body?: string;
    jsonBody?: any;
    headers?: any;
    fixedDelayMilliseconds?: number;
    delayDistribution?: {
      type: 'uniform' | 'lognormal' | 'fixed';
      lower?: number;
      upper?: number;
      median?: number;
      sigma?: number;
      milliseconds?: number;
    };
    chunkedDribbleDelay?: {
      numberOfChunks: number;
      totalDuration: number;
    };
    fault?: string;
    proxyBaseUrl?: string;
    base64Body?: string;
    bodyFileName?: string;
    transformers?: string[];
    proxyUrlPrefixToRemove?: string;
    additionalProxyRequestHeaders?: any;
    removeProxyRequestHeaders?: string[];
  };
  priority?: number;
  scenarioName?: string;
  requiredScenarioState?: string;
  newScenarioState?: string;
  persistent?: boolean;
  metadata?: any;
}

export interface MappingsResponse {
  mappings: StubMapping[];
  meta: {
    total: number;
    page: number;
    size: number;
    totalPages: number;
  };
}

