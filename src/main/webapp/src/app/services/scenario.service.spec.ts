import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ScenarioService } from './scenario.service';
import { ConfigService } from './config.service';

describe('ScenarioService', () => {
  let service: ScenarioService;
  let httpMock: HttpTestingController;
  let configServiceSpy: jasmine.SpyObj<ConfigService>;

  const BASE_URL = 'http://localhost:8080/__admin';
  const SCENARIOS_URL = `${BASE_URL}/scenarios`;

  beforeEach(() => {
    configServiceSpy = jasmine.createSpyObj('ConfigService', [], {
      wiremockApiUrl: BASE_URL
    });

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        ScenarioService,
        { provide: ConfigService, useValue: configServiceSpy }
      ]
    });

    service = TestBed.inject(ScenarioService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getAllScenarios', () => {
    it('should GET all scenarios from the API', () => {
      const mockResponse = {
        scenarios: [
          { id: '1', name: 'Login Flow', state: 'Started', possibleStates: ['Started', 'LoggedIn'] },
          { id: '2', name: 'Cart Flow', state: 'ItemAdded', possibleStates: ['Started', 'ItemAdded', 'Checkout'] }
        ]
      };

      service.getAllScenarios().subscribe(response => {
        expect(response.scenarios.length).toBe(2);
        expect(response.scenarios[0].name).toBe('Login Flow');
        expect(response.scenarios[1].state).toBe('ItemAdded');
      });

      const req = httpMock.expectOne(SCENARIOS_URL);
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);
    });
  });

  describe('resetAllScenarios', () => {
    it('should POST to the reset endpoint', () => {
      service.resetAllScenarios().subscribe();

      const req = httpMock.expectOne(`${SCENARIOS_URL}/reset`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush(null);
    });
  });

  describe('setScenarioState', () => {
    it('should PUT the new state to the correct scenario endpoint', () => {
      const scenarioName = 'Login Flow';
      const newState = 'LoggedIn';

      service.setScenarioState(scenarioName, newState).subscribe();

      const req = httpMock.expectOne(`${SCENARIOS_URL}/${encodeURIComponent(scenarioName)}/state`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ state: newState });
      req.flush(null);
    });

    it('should URL-encode scenario names with special characters', () => {
      const scenarioName = 'My Scenario/With Slashes & Ampersands';

      service.setScenarioState(scenarioName, 'NewState').subscribe();

      const req = httpMock.expectOne(`${SCENARIOS_URL}/${encodeURIComponent(scenarioName)}/state`);
      expect(req).toBeTruthy();
      req.flush(null);
    });
  });
});
