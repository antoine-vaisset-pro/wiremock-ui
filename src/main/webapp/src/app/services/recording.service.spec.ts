import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RecordingService } from './recording.service';
import { ConfigService } from './config.service';

describe('RecordingService', () => {
  let service: RecordingService;
  let httpMock: HttpTestingController;
  let configServiceSpy: jasmine.SpyObj<ConfigService>;

  const BASE_URL = 'http://localhost:8080/__admin';

  beforeEach(() => {
    configServiceSpy = jasmine.createSpyObj('ConfigService', [], {
      wiremockApiUrl: BASE_URL
    });

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        RecordingService,
        { provide: ConfigService, useValue: configServiceSpy }
      ]
    });

    service = TestBed.inject(RecordingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('startRecording', () => {
    it('should POST the recording config to the start endpoint', () => {
      const config = { targetBaseUrl: 'http://target-server.com', persist: true, repeatsAsScenarios: false };

      service.startRecording(config).subscribe();

      const req = httpMock.expectOne(`${BASE_URL}/recordings/start`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(config);
      req.flush(null);
    });

    it('should POST recording config with optional filters', () => {
      const config = {
        targetBaseUrl: 'http://api.example.com',
        filters: { urlPathPattern: '/api/.*', method: 'GET' },
        persist: false,
        repeatsAsScenarios: true
      };

      service.startRecording(config).subscribe();

      const req = httpMock.expectOne(`${BASE_URL}/recordings/start`);
      expect(req.request.body.filters).toEqual(config.filters);
      req.flush(null);
    });
  });

  describe('stopRecording', () => {
    it('should POST to the stop endpoint and return recorded mappings', () => {
      const mockResult = {
        mappings: [
          { request: { method: 'GET', url: '/api/recorded' }, response: { status: 200 } }
        ]
      };

      service.stopRecording().subscribe(result => {
        expect(result.mappings.length).toBe(1);
      });

      const req = httpMock.expectOne(`${BASE_URL}/recordings/stop`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush(mockResult);
    });
  });

  describe('getRecordingStatus', () => {
    it('should GET the current recording status', () => {
      service.getRecordingStatus().subscribe(status => {
        expect(status.status).toBe('Recording');
      });

      const req = httpMock.expectOne(`${BASE_URL}/recordings/status`);
      expect(req.request.method).toBe('GET');
      req.flush({ status: 'Recording' });
    });

    it('should return NeverStarted status when recording has not been started', () => {
      service.getRecordingStatus().subscribe(status => {
        expect(status.status).toBe('NeverStarted');
      });

      const req = httpMock.expectOne(`${BASE_URL}/recordings/status`);
      req.flush({ status: 'NeverStarted' });
    });
  });

  describe('takeSnapshot', () => {
    it('should POST to the snapshot endpoint with empty config by default', () => {
      service.takeSnapshot().subscribe();

      const req = httpMock.expectOne(`${BASE_URL}/recordings/snapshot`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({ mappings: [] });
    });

    it('should POST to the snapshot endpoint with provided config', () => {
      const snapshotConfig = { persist: true, outputFormat: 'FULL' as const };

      service.takeSnapshot(snapshotConfig).subscribe();

      const req = httpMock.expectOne(`${BASE_URL}/recordings/snapshot`);
      expect(req.request.body).toEqual(snapshotConfig);
      req.flush({ mappings: [] });
    });
  });
});
