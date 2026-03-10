import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HelpPageComponent } from './help-page.component';

describe('HelpPageComponent', () => {
  let component: HelpPageComponent;
  let fixture: ComponentFixture<HelpPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HelpPageComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HelpPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have 9 sections', () => {
    expect(component.sections.length).toBe(9);
  });

  it('should include the openapi-generator section', () => {
    const ids = component.sections.map(s => s.id);
    expect(ids).toContain('openapi-generator');
  });

  it('should have openapi-generator section between recording and settings', () => {
    const ids = component.sections.map(s => s.id);
    const recordingIdx = ids.indexOf('recording');
    const openapiIdx = ids.indexOf('openapi-generator');
    const settingsIdx = ids.indexOf('settings');
    expect(openapiIdx).toBeGreaterThan(recordingIdx);
    expect(openapiIdx).toBeLessThan(settingsIdx);
  });

  it('should clear search and show all sections', () => {
    component.searchQuery = 'test';
    component.clearSearch();
    expect(component.searchQuery).toBe('');
    component.sections.forEach(s => expect(s.hidden).toBeFalse());
  });

  it('should hide non-matching sections on search', () => {
    component.searchQuery = 'openapi';
    component['applySearch']();
    const openApiSection = component.sections.find(s => s.id === 'openapi-generator');
    expect(openApiSection?.hidden).toBeFalse();
  });
});

