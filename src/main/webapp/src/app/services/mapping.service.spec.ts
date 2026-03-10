import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { MappingService } from './mapping.service';
import { ConfigService } from './config.service';

describe('MappingService', () => {
  let service: MappingService;
  let httpMock: HttpTestingController;
  let configServiceSpy: jasmine.SpyObj<ConfigService>;

  const API_URL = 'http://localhost:8080/__admin/mappings';

  beforeEach(() => {
    configServiceSpy = jasmine.createSpyObj('ConfigService', [], {
      wiremockApiUrl: 'http://localhost:8080/__admin'
    });

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        MappingService,
        { provide: ConfigService, useValue: configServiceSpy }
      ]
    });

    service = TestBed.inject(MappingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getMappings', () => {
    const mockRawMappings = [
      { uuid: '1', name: 'Stub A', request: { method: 'GET', url: '/api/a' }, response: { status: 200 } },
      { uuid: '2', name: 'Stub B', request: { method: 'POST', url: '/api/b' }, response: { status: 201 } },
      { uuid: '3', name: 'Stub C', request: { method: 'GET', url: '/api/c' }, response: { status: 204 } },
    ];

    it('should return all mappings with pagination metadata on page 0', () => {
      service.getMappings(0, 20, '').subscribe(response => {
        expect(response.mappings.length).toBe(3);
        expect(response.meta.total).toBe(3);
        expect(response.meta.page).toBe(0);
        expect(response.meta.totalPages).toBe(1);
      });

      const req = httpMock.expectOne(API_URL);
      expect(req.request.method).toBe('GET');
      req.flush({ mappings: mockRawMappings });
    });

    it('should paginate results based on page and size', () => {
      const manyMappings = Array.from({ length: 25 }, (_, i) => ({
        uuid: String(i),
        name: `Stub ${i}`,
        request: { method: 'GET', url: `/api/${i}` },
        response: { status: 200 }
      }));

      service.getMappings(0, 10, '').subscribe(response => {
        expect(response.mappings.length).toBe(10);
        expect(response.meta.total).toBe(25);
        expect(response.meta.totalPages).toBe(3);
        expect(response.mappings[0].uuid).toBe('0');
        expect(response.mappings[9].uuid).toBe('9');
      });

      const req = httpMock.expectOne(API_URL);
      req.flush({ mappings: manyMappings });
    });

    it('should return the correct page slice for page 1', () => {
      const manyMappings = Array.from({ length: 25 }, (_, i) => ({
        uuid: String(i),
        name: `Stub ${i}`,
        request: { method: 'GET', url: `/api/${i}` },
        response: { status: 200 }
      }));

      service.getMappings(1, 10, '').subscribe(response => {
        expect(response.mappings.length).toBe(10);
        expect(response.mappings[0].uuid).toBe('10');
        expect(response.mappings[9].uuid).toBe('19');
      });

      const req = httpMock.expectOne(API_URL);
      req.flush({ mappings: manyMappings });
    });

    it('should filter mappings by search query matching name', () => {
      service.getMappings(0, 20, 'Stub A').subscribe(response => {
        expect(response.mappings.length).toBe(1);
        expect(response.mappings[0].name).toBe('Stub A');
        expect(response.meta.total).toBe(1);
      });

      const req = httpMock.expectOne(API_URL);
      req.flush({ mappings: mockRawMappings });
    });

    it('should filter mappings by search query matching URL', () => {
      service.getMappings(0, 20, '/api/b').subscribe(response => {
        expect(response.mappings.length).toBe(1);
        expect(response.mappings[0].uuid).toBe('2');
      });

      const req = httpMock.expectOne(API_URL);
      req.flush({ mappings: mockRawMappings });
    });

    it('should filter mappings by search query matching method (case-insensitive)', () => {
      service.getMappings(0, 20, 'post').subscribe(response => {
        expect(response.mappings.length).toBe(1);
        expect(response.mappings[0].uuid).toBe('2');
      });

      const req = httpMock.expectOne(API_URL);
      req.flush({ mappings: mockRawMappings });
    });

    it('should return empty results when search matches nothing', () => {
      service.getMappings(0, 20, 'nonexistent-query').subscribe(response => {
        expect(response.mappings.length).toBe(0);
        expect(response.meta.total).toBe(0);
      });

      const req = httpMock.expectOne(API_URL);
      req.flush({ mappings: mockRawMappings });
    });

    it('should handle empty mappings array', () => {
      service.getMappings(0, 20, '').subscribe(response => {
        expect(response.mappings.length).toBe(0);
        expect(response.meta.total).toBe(0);
        expect(response.meta.totalPages).toBe(0);
      });

      const req = httpMock.expectOne(API_URL);
      req.flush({ mappings: [] });
    });
  });

  describe('createMapping', () => {
    it('should POST the mapping data to the API', () => {
      const newMapping = { request: { method: 'GET', url: '/api/new' }, response: { status: 200 } };
      const mockResponse = { uuid: 'new-uuid', ...newMapping };

      service.createMapping(newMapping).subscribe(response => {
        expect(response.uuid).toBe('new-uuid');
      });

      const req = httpMock.expectOne(API_URL);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(newMapping);
      req.flush(mockResponse);
    });
  });

  describe('updateMapping', () => {
    it('should PUT the mapping data to the correct UUID endpoint', () => {
      const uuid = 'test-uuid-123';
      const updatedMapping = { request: { method: 'GET', url: '/api/updated' }, response: { status: 200 } };

      service.updateMapping(uuid, updatedMapping).subscribe();

      const req = httpMock.expectOne(`${API_URL}/${uuid}`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(updatedMapping);
      req.flush(updatedMapping);
    });
  });

  describe('deleteMapping', () => {
    it('should DELETE the mapping at the correct UUID endpoint', () => {
      const uuid = 'delete-uuid-456';

      service.deleteMapping(uuid).subscribe();

      const req = httpMock.expectOne(`${API_URL}/${uuid}`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });
  });

  describe('getAllMappingsRaw', () => {
    it('should GET all mappings without pagination', () => {
      const mockResponse = { mappings: [{ uuid: '1', request: { method: 'GET', url: '/api/a' } }] };

      service.getAllMappingsRaw().subscribe(response => {
        expect(response.mappings.length).toBe(1);
      });

      const req = httpMock.expectOne(API_URL);
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);
    });
  });

  describe('importMappings', () => {
    it('should POST mappings array to the import endpoint', () => {
      const mappings = [
        { request: { method: 'GET', url: '/api/1' }, response: { status: 200 } }
      ];

      service.importMappings(mappings).subscribe();

      const req = httpMock.expectOne(`${API_URL}/import`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ mappings });
      req.flush({});
    });
  });

  describe('resetMappings', () => {
    it('should POST to the reset endpoint', () => {
      service.resetMappings().subscribe();

      const req = httpMock.expectOne(`${API_URL}/reset`);
      expect(req.request.method).toBe('POST');
      req.flush({});
    });
  });
});
