import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { StubsPageComponent } from './stubs-page.component';
import { MappingService } from '../../services/mapping.service';
import { ScenarioService } from '../../services/scenario.service';
import { StubImportService } from '../../services/stub-import.service';

describe('StubsPageComponent', () => {
  let component: StubsPageComponent;
  let fixture: ComponentFixture<StubsPageComponent>;
  let mappingServiceSpy: jasmine.SpyObj<MappingService>;
  let scenarioServiceSpy: jasmine.SpyObj<ScenarioService>;
  let routerSpy: jasmine.SpyObj<Router>;

  const mockMappingsResponse = {
    mappings: [
      { uuid: 'uuid-1', name: 'Stub A', request: { method: 'GET', url: '/api/a' }, response: { status: 200 } },
      { uuid: 'uuid-2', name: 'Stub B', request: { method: 'POST', url: '/api/b' }, response: { status: 201 } }
    ],
    meta: { total: 2, page: 0, size: 20, totalPages: 1 }
  };

  beforeEach(() => {
    mappingServiceSpy = jasmine.createSpyObj('MappingService', [
      'getMappings', 'createMapping', 'updateMapping', 'deleteMapping',
      'getAllMappingsRaw', 'importMappings', 'resetMappings'
    ]);
    scenarioServiceSpy = jasmine.createSpyObj('ScenarioService', ['getAllScenarios']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    mappingServiceSpy.getMappings.and.returnValue(of(mockMappingsResponse));
    scenarioServiceSpy.getAllScenarios.and.returnValue(of({ scenarios: [] }));

    TestBed.configureTestingModule({
      imports: [StubsPageComponent],
      providers: [
        { provide: MappingService, useValue: mappingServiceSpy },
        { provide: ScenarioService, useValue: scenarioServiceSpy },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            params: of({}),
            queryParams: of({})
          }
        }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });

    fixture = TestBed.createComponent(StubsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit - loadMappings', () => {
    it('should load mappings on init', () => {
      expect(mappingServiceSpy.getMappings).toHaveBeenCalled();
      expect(component.mappings.length).toBe(2);
      expect(component.totalMappings).toBe(2);
      expect(component.loading).toBeFalse();
    });

    it('should load available scenarios on init', () => {
      expect(scenarioServiceSpy.getAllScenarios).toHaveBeenCalled();
    });

    it('should set error message when loading mappings fails', () => {
      mappingServiceSpy.getMappings.and.returnValue(throwError(() => new Error('Network error')));

      component.loadMappings();

      expect(component.error).toBeTruthy();
      expect(component.loading).toBeFalse();
    });
  });

  describe('selectStub', () => {
    it('should set selectedMapping when a stub is selected', () => {
      const stub = mockMappingsResponse.mappings[0];
      component.selectStub(stub);
      expect(component.selectedMapping).toEqual(stub);
    });

    it('should navigate to stub URL when updateUrl is true', () => {
      const stub = mockMappingsResponse.mappings[0];
      component.selectStub(stub, true);
      expect(routerSpy.navigate).toHaveBeenCalledWith(
        ['/ui/stubs', 'uuid-1'],
        jasmine.objectContaining({ queryParamsHandling: 'preserve' })
      );
    });

    it('should NOT navigate when updateUrl is false', () => {
      const stub = mockMappingsResponse.mappings[0];
      component.selectStub(stub, false);
      expect(routerSpy.navigate).not.toHaveBeenCalled();
    });
  });

  describe('closeDetails', () => {
    it('should clear selectedMapping', () => {
      component.selectedMapping = mockMappingsResponse.mappings[0];
      component.closeDetails();
      expect(component.selectedMapping).toBeNull();
    });
  });

  describe('onSearchChange', () => {
    it('should reset currentPage to 1 and reload mappings', () => {
      component.currentPage = 3;
      component.onSearchChange('test search');
      expect(component.currentPage).toBe(1);
      expect(component.searchQuery).toBe('test search');
      expect(mappingServiceSpy.getMappings).toHaveBeenCalled();
    });

    it('should update searchQuery when called with empty string', () => {
      component.onSearchChange('');
      expect(component.searchQuery).toBe('');
    });
  });

  describe('onPageChange', () => {
    it('should update currentPage and reload mappings when page changes', () => {
      mappingServiceSpy.getMappings.calls.reset();
      component.onPageChange(2);
      expect(component.currentPage).toBe(2);
      expect(mappingServiceSpy.getMappings).toHaveBeenCalled();
    });
  });

  describe('stub selection (checkboxes)', () => {
    it('should add stub to selection on toggleStubSelection', () => {
      const event = new Event('click');
      component.toggleStubSelection('uuid-1', event);
      expect(component.selectedStubIds.has('uuid-1')).toBeTrue();
    });

    it('should remove stub from selection when toggled again', () => {
      const event = new Event('click');
      component.toggleStubSelection('uuid-1', event);
      component.toggleStubSelection('uuid-1', event);
      expect(component.selectedStubIds.has('uuid-1')).toBeFalse();
    });

    it('should select all stubs with selectAllStubs()', () => {
      component.selectAllStubs();
      expect(component.selectedCount).toBe(2);
      expect(component.selectedStubIds.has('uuid-1')).toBeTrue();
      expect(component.selectedStubIds.has('uuid-2')).toBeTrue();
    });

    it('should deselect all stubs with deselectAllStubs()', () => {
      component.selectAllStubs();
      component.deselectAllStubs();
      expect(component.selectedCount).toBe(0);
    });
  });

  describe('onSelectionToggled', () => {
    it('should toggle stub selection from payload', () => {
      const event = new Event('click');
      component.onSelectionToggled({ uuid: 'uuid-1', event });
      expect(component.selectedStubIds.has('uuid-1')).toBeTrue();
      component.onSelectionToggled({ uuid: 'uuid-1', event });
      expect(component.selectedStubIds.has('uuid-1')).toBeFalse();
    });
  });

  describe('selectedCount getter', () => {
    it('should return count of selected stubs', () => {
      expect(component.selectedCount).toBe(0);
      const event = new Event('click');
      component.toggleStubSelection('uuid-1', event);
      expect(component.selectedCount).toBe(1);
    });
  });

  describe('deleteStub', () => {
    it('should not delete when no stub selected', () => {
      component.selectedMapping = null;
      component.deleteStub();
      expect(mappingServiceSpy.deleteMapping).not.toHaveBeenCalled();
    });

    it('should call deleteMapping and reload when confirmed', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      mappingServiceSpy.deleteMapping.and.returnValue(of({}));
      component.selectedMapping = mockMappingsResponse.mappings[0];
      component.deleteStub();
      expect(mappingServiceSpy.deleteMapping).toHaveBeenCalledWith('uuid-1');
    });
  });

  describe('deleteSelectedStubs', () => {
    it('should not delete when no stubs are selected', () => {
      component.deleteSelectedStubs();
      expect(mappingServiceSpy.deleteMapping).not.toHaveBeenCalled();
    });
  });

  describe('onStubSaved', () => {
    it('should reload mappings and select saved stub', () => {
      mappingServiceSpy.getMappings.and.returnValue(of(mockMappingsResponse));
      component.onStubSaved({ savedUuid: 'uuid-1', editMode: 'create' });
      expect(mappingServiceSpy.getMappings).toHaveBeenCalled();
      expect(component.selectedMapping).toEqual(mockMappingsResponse.mappings[0]);
    });
  });

  describe('availableScenarios', () => {
    it('should populate availableScenarios from scenario service', () => {
      scenarioServiceSpy.getAllScenarios.and.returnValue(of({
        scenarios: [
          { id: 's1', name: 'scenario-1', state: 'Started', possibleStates: ['Started'] },
          { id: 's2', name: 'scenario-2', state: 'Started', possibleStates: ['Started'] }
        ]
      }));
      component.loadAvailableScenarios();
      expect(component.availableScenarios).toEqual(['scenario-1', 'scenario-2']);
    });

    it('should set availableScenarios to empty array on error', () => {
      scenarioServiceSpy.getAllScenarios.and.returnValue(throwError(() => new Error('error')));
      component.loadAvailableScenarios();
      expect(component.availableScenarios).toEqual([]);
    });
  });
});
