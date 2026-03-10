import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SettingsPageComponent } from './settings-page.component';
import { ConfigService, WiremockEndpointConfig, CustomBackend } from '../../services/config.service';

describe('SettingsPageComponent', () => {
  let component: SettingsPageComponent;
  let fixture: ComponentFixture<SettingsPageComponent>;
  let configServiceSpy: jasmine.SpyObj<ConfigService>;

  const defaultEndpointConfig: WiremockEndpointConfig = { type: 'local', url: '' };
  const preRegisteredEndpoints = { local: '' };

  function createComponent(
    endpointConfig: WiremockEndpointConfig = defaultEndpointConfig,
    customBackends: CustomBackend[] = []
  ) {
    configServiceSpy = jasmine.createSpyObj('ConfigService', [
      'getEndpointConfig',
      'getAppConfig',
      'getPreRegisteredEndpoints',
      'getWiremockBackends',
      'setEndpointConfig',
      'getSavedCustomBackends',
      'addCustomBackend',
      'updateCustomBackend',
      'deleteCustomBackend'
    ]);
    configServiceSpy.getEndpointConfig.and.returnValue(endpointConfig);
    configServiceSpy.getAppConfig.and.returnValue(null);
    configServiceSpy.getPreRegisteredEndpoints.and.returnValue(preRegisteredEndpoints);
    configServiceSpy.getWiremockBackends.and.returnValue([]);
    configServiceSpy.getSavedCustomBackends.and.returnValue(customBackends);

    TestBed.configureTestingModule({
      imports: [SettingsPageComponent],
      providers: [{ provide: ConfigService, useValue: configServiceSpy }]
    });

    fixture = TestBed.createComponent(SettingsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should be created', () => {
    createComponent();
    expect(component).toBeTruthy();
  });

  describe('ngOnInit - endpoint selection', () => {
    it('should select the matching pre-registered option when config type is local', () => {
      createComponent(defaultEndpointConfig);

      expect(component.selectedOptionId).toBe('pre-local');
    });

    it('should select the matching saved custom backend when config type is custom', () => {
      const savedBackend: CustomBackend = { id: 'custom-123', label: 'Staging', url: 'http://staging:8080' };
      createComponent({ type: 'custom', url: 'http://staging:8080' }, [savedBackend]);

      expect(component.selectedOptionId).toBe('custom-custom-123');
    });

    it('should fall back to first option when no match found', () => {
      createComponent({ type: 'custom', url: 'http://unknown:9999' });

      // Seule option disponible : pre-local
      expect(component.selectedOptionId).toBe('pre-local');
    });
  });

  describe('ngOnInit - env backends', () => {
    it('should include env backends in options when provided', () => {
      configServiceSpy = jasmine.createSpyObj('ConfigService', [
        'getEndpointConfig',
        'getAppConfig',
        'getPreRegisteredEndpoints',
        'getWiremockBackends',
        'setEndpointConfig',
        'getSavedCustomBackends',
        'addCustomBackend',
        'updateCustomBackend',
        'deleteCustomBackend'
      ]);
      configServiceSpy.getEndpointConfig.and.returnValue(defaultEndpointConfig);
      configServiceSpy.getAppConfig.and.returnValue(null);
      configServiceSpy.getPreRegisteredEndpoints.and.returnValue(preRegisteredEndpoints);
      configServiceSpy.getWiremockBackends.and.returnValue([
        { label: 'localhost:8080', url: 'http://localhost:8080' }
      ]);
      configServiceSpy.getSavedCustomBackends.and.returnValue([]);

      TestBed.configureTestingModule({
        imports: [SettingsPageComponent],
        providers: [{ provide: ConfigService, useValue: configServiceSpy }]
      });

      fixture = TestBed.createComponent(SettingsPageComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();

      const envOption = component.options.find(o => o.id === 'env-0');
      expect(envOption).toBeTruthy();
      expect(envOption!.url).toBe('http://localhost:8080');
      expect(envOption!.badge).toBe('ENV');
    });
  });

  describe('ngOnInit - saved custom backends', () => {
    it('should include saved custom backends in options', () => {
      const savedBackend: CustomBackend = { id: 'custom-1', label: 'Staging', url: 'http://staging:8080' };
      createComponent(defaultEndpointConfig, [savedBackend]);

      const customOption = component.options.find(o => o.id === 'custom-custom-1');
      expect(customOption).toBeTruthy();
      expect(customOption!.url).toBe('http://staging:8080');
      expect(customOption!.badge).toBe('custom');
    });

    it('should expose savedCustomBackends', () => {
      const backends: CustomBackend[] = [
        { id: 'a', label: 'Staging', url: 'http://staging:8080' },
        { id: 'b', label: 'Prod', url: 'http://prod:8080' }
      ];
      createComponent(defaultEndpointConfig, backends);

      expect(component.savedCustomBackends.length).toBe(2);
    });
  });

  describe('custom backend CRUD', () => {
    it('should call addCustomBackend on configService when adding', () => {
      createComponent();
      const newBackend: CustomBackend = { id: 'new-1', label: 'New', url: 'http://new:8080' };
      configServiceSpy.addCustomBackend.and.returnValue(newBackend);
      configServiceSpy.getSavedCustomBackends.and.returnValue([newBackend]);

      component.newBackendLabel = 'New';
      component.newBackendUrl = 'http://new:8080';
      component.addCustomBackend();

      expect(configServiceSpy.addCustomBackend).toHaveBeenCalledWith('New', 'http://new:8080');
    });

    it('should not call addCustomBackend when URL is empty', () => {
      createComponent();
      component.newBackendUrl = '';
      component.addCustomBackend();

      expect(configServiceSpy.addCustomBackend).not.toHaveBeenCalled();
    });

    it('should set editingBackendId when starting edit', () => {
      const backend: CustomBackend = { id: 'e1', label: 'Edit Me', url: 'http://edit:8080' };
      createComponent(defaultEndpointConfig, [backend]);

      component.startEditCustomBackend(backend);

      expect(component.editingBackendId).toBe('e1');
      expect(component.editingBackendLabel).toBe('Edit Me');
      expect(component.editingBackendUrl).toBe('http://edit:8080');
    });

    it('should call updateCustomBackend when saving edit', () => {
      const backend: CustomBackend = { id: 'e1', label: 'Old', url: 'http://old:8080' };
      createComponent(defaultEndpointConfig, [backend]);
      configServiceSpy.getSavedCustomBackends.and.returnValue([]);

      component.startEditCustomBackend(backend);
      component.editingBackendLabel = 'New Label';
      component.editingBackendUrl = 'http://new-url:8080';
      component.saveEditCustomBackend();

      expect(configServiceSpy.updateCustomBackend).toHaveBeenCalledWith('e1', 'New Label', 'http://new-url:8080');
    });

    it('should call deleteCustomBackend on configService', () => {
      const backend: CustomBackend = { id: 'd1', label: 'Del', url: 'http://del:8080' };
      createComponent(defaultEndpointConfig, [backend]);
      configServiceSpy.getSavedCustomBackends.and.returnValue([]);

      component.deleteCustomBackend('d1');

      expect(configServiceSpy.deleteCustomBackend).toHaveBeenCalledWith('d1');
    });

    it('should cancel edit without saving', () => {
      const backend: CustomBackend = { id: 'c1', label: 'Cancel', url: 'http://cancel:8080' };
      createComponent(defaultEndpointConfig, [backend]);

      component.startEditCustomBackend(backend);
      component.cancelEditCustomBackend();

      expect(component.editingBackendId).toBeNull();
      expect(configServiceSpy.updateCustomBackend).not.toHaveBeenCalled();
    });
  });
});
