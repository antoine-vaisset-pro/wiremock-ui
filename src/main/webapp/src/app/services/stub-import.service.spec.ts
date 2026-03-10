import { TestBed } from '@angular/core/testing';
import { StubImportService } from './stub-import.service';

describe('StubImportService', () => {
  let service: StubImportService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StubImportService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('stripJsonComments', () => {
    it('should remove single-line comments', () => {
      const jsonWithComments = `{
  // This is a comment
  "name": "test"
}`;
      const result = (service as any).stripJsonComments(jsonWithComments);
      const parsed = JSON.parse(result);
      expect(parsed.name).toBe('test');
    });

    it('should remove multi-line comments', () => {
      const jsonWithComments = `{
  /* This is a
     multi-line comment */
  "name": "test"
}`;
      const result = (service as any).stripJsonComments(jsonWithComments);
      const parsed = JSON.parse(result);
      expect(parsed.name).toBe('test');
    });

    it('should preserve URLs with //', () => {
      const jsonWithUrl = `{
  "url": "http://example.com/api/test",
  "name": "test"
}`;
      const result = (service as any).stripJsonComments(jsonWithUrl);
      const parsed = JSON.parse(result);
      expect(parsed.url).toBe('http://example.com/api/test');
    });

    it('should remove trailing commas', () => {
      const jsonWithTrailingComma = `{
  "name": "test",
  "url": "/api/test",
}`;
      const result = (service as any).stripJsonComments(jsonWithTrailingComma);
      const parsed = JSON.parse(result);
      expect(parsed.name).toBe('test');
      expect(parsed.url).toBe('/api/test');
    });

    it('should handle escaped quotes in strings', () => {
      const jsonWithEscaped = `{
  "message": "Use \\"quotes\\" here",
  "path": "C:\\\\test\\\\file.json"
}`;
      const result = (service as any).stripJsonComments(jsonWithEscaped);
      const parsed = JSON.parse(result);
      expect(parsed.message).toBe('Use "quotes" here');
      expect(parsed.path).toBe('C:\\test\\file.json');
    });

    it('should parse real-world mappings.json with comments', () => {
      // Sample mappings.json for an e-commerce order management SOAP API
      const realMappingsJson = `{
  "mappings": [
    {
      // Standard mapping for a successful order creation
      "request": {
        "method": "POST",
        "url": "/OrderManagement/Orders/CreateOrder/v1.0"
      },
      "response": {
        "status": 200,
        "bodyFileName": "createOrderResponse.xml"
      }
    },
    {
      // client error when ordered quantity is invalid (below 0, excluded)
      "request": {
        "method": "POST",
        "url": "/OrderManagement/Orders/CreateOrder/v1.0",
        "bodyPatterns": [{
            "matchesXPath": "/Envelope/Body/CreateOrder_Document/OrderLine_List/OrderLine/product_Stock.quantity[text() < 0]"
          }
        ]
      },
      "response": {
        "status": 500,
        "bodyFileName": "soapFault.xml",
        "transformerParameters": {
          "faultCode": "Client",
          "faultString": "An error occurred on the client while processing the request."
        }
      }
    },
    {
      // server error when stock level drops below critical threshold (included)
      "request": {
        "method": "POST",
        "url": "/OrderManagement/Orders/CreateOrder/v1.0",
        "bodyPatterns": [{
          "matchesXPath": "/Envelope/Body/CreateOrder_Document/OrderLine_List/OrderLine/product_Stock.quantity[text() <= -10]"
        }
        ]
      },
      "response": {
        "status": 500,
        "bodyFileName": "soapFault.xml",
        "transformerParameters": {
            "faultCode": "Server",
            "faultString": "An error occurred on the server while processing the request."
        }
      }
    }
  ]
}`;

      // Test comment cleanup
      const cleaned = (service as any).stripJsonComments(realMappingsJson);

      // Doit pouvoir parser sans erreur
      const parsed = JSON.parse(cleaned);

      // Verify the structure
      expect(parsed).toBeTruthy();
      expect(parsed.mappings).toBeDefined();
      expect(Array.isArray(parsed.mappings)).toBe(true);
      expect(parsed.mappings.length).toBe(3);

      // Verify the first mapping
      const firstMapping = parsed.mappings[0];
      expect(firstMapping.request).toBeDefined();
      expect(firstMapping.request.method).toBe('POST');
      expect(firstMapping.request.url).toBe('/OrderManagement/Orders/CreateOrder/v1.0');
      expect(firstMapping.response).toBeDefined();
      expect(firstMapping.response.status).toBe(200);
      expect(firstMapping.response.bodyFileName).toBe('createOrderResponse.xml');

      // Verify the second mapping with bodyPatterns
      const secondMapping = parsed.mappings[1];
      expect(secondMapping.request.bodyPatterns).toBeDefined();
      expect(Array.isArray(secondMapping.request.bodyPatterns)).toBe(true);
      expect(secondMapping.request.bodyPatterns.length).toBe(1);
      expect(secondMapping.request.bodyPatterns[0].matchesXPath).toContain('text() < 0');
      expect(secondMapping.response.transformerParameters).toBeDefined();
      expect(secondMapping.response.transformerParameters.faultCode).toBe('Client');

      // Verify the third mapping
      const thirdMapping = parsed.mappings[2];
      expect(thirdMapping.request.bodyPatterns).toBeDefined();
      expect(thirdMapping.request.bodyPatterns[0].matchesXPath).toContain('text() <= -10');
      expect(thirdMapping.response.transformerParameters.faultCode).toBe('Server');
    });
  });

  describe('validateJsonImport', () => {
    it('should validate mappings array format', () => {
      const jsonArray = JSON.stringify([
        { request: { method: 'GET', url: '/test' }, response: { status: 200 } }
      ]);

      const result = service.validateJsonImport(jsonArray);
      expect(result.valid).toBe(true);
      expect(result.mappings).toBeDefined();
      expect(result.mappings!.length).toBe(1);
    });

    it('should validate mappings object format', () => {
      const jsonObject = JSON.stringify({
        mappings: [
          { request: { method: 'GET', url: '/test' }, response: { status: 200 } }
        ]
      });

      const result = service.validateJsonImport(jsonObject);
      expect(result.valid).toBe(true);
      expect(result.mappings).toBeDefined();
      expect(result.mappings!.length).toBe(1);
    });

    it('should reject invalid mapping without request', () => {
      const jsonInvalid = JSON.stringify({
        mappings: [
          { response: { status: 200 } }
        ]
      });

      const result = service.validateJsonImport(jsonInvalid);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('missing request or response');
    });

    it('should reject invalid JSON', () => {
      const invalidJson = '{ invalid json }';

      const result = service.validateJsonImport(invalidJson);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid JSON');
    });
  });
});

