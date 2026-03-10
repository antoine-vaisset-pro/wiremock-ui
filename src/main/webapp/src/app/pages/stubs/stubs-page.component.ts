import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { MappingService } from '../../services/mapping.service';
import { ScenarioService } from '../../services/scenario.service';
import { MappingsResponse, StubMapping } from '../../models/stub-mapping.model';
import { StubListComponent } from './components/stub-list/stub-list.component';
import { StubDetailComponent } from './components/stub-detail/stub-detail.component';
import { StubEditorComponent } from './components/stub-editor/stub-editor.component';
import { StubImportComponent } from './components/stub-import/stub-import.component';

@Component({
  selector: 'app-stubs-page',
  standalone: true,
  imports: [CommonModule, FormsModule, NgbModule, StubListComponent, StubDetailComponent, StubEditorComponent, StubImportComponent],
  templateUrl: './stubs-page.component.html',
  styleUrls: ['./stubs-page.component.scss']
})
export class StubsPageComponent implements OnInit {
  // Stubs
  mappings: StubMapping[] = [];
  selectedMapping: StubMapping | null = null;

  // Pagination (ng-bootstrap uses 1-based indexing)
  currentPage = 1;
  pageSize = 20;
  totalMappings = 0;

  // Search
  searchQuery = '';

  // UI State
  loading = false;
  error: string | null = null;

  // Selection & Export/Import
  selectedStubIds: Set<string> = new Set();

  // Scenarios for auto-completion
  availableScenarios: string[] = [];

  // References to child modal components
  @ViewChild(StubEditorComponent) stubEditor!: StubEditorComponent;
  @ViewChild(StubImportComponent) stubImport!: StubImportComponent;
  @ViewChild(StubDetailComponent) stubDetail!: StubDetailComponent;

  get selectedCount(): number {
    return this.selectedStubIds.size;
  }

  constructor(
    private mappingService: MappingService,
    private scenarioService: ScenarioService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.loadAvailableScenarios();

    this.route.params.subscribe(params => {
      if (params['id']) {
        this.loadMappings(() => {
          this.selectStubById(params['id']);
        });
      } else {
        this.loadMappings();
      }
    });

    this.route.queryParams.subscribe(params => {
      if (params['search']) {
        this.searchQuery = params['search'];
      }
      if (params['url']) {
        this.searchQuery = params['url'];
      }

      if (params['search'] || params['url']) {
        this.loadMappings();
      }

      if (params['createFrom']) {
        try {
          const requestData = JSON.parse(decodeURIComponent(params['createFrom']));
          this.createStubFromRequest(requestData);

          this.router.navigate(['/ui/stubs'], {
            queryParams: { createFrom: null },
            queryParamsHandling: 'merge'
          });
        } catch (e) {
          console.error('Failed to parse createFrom parameter:', e);
        }
      }
    });
  }

  loadMappings(callback?: () => void): void {
    this.loading = true;
    this.error = null;

    const apiPage = this.currentPage - 1;

    this.mappingService.getMappings(apiPage, this.pageSize, this.searchQuery)
      .subscribe({
        next: (response: MappingsResponse) => {
          this.mappings = response.mappings;
          this.totalMappings = response.meta.total;
          this.loading = false;

          if (callback) {
            callback();
          }
        },
        error: (err) => {
          this.error = 'Failed to load mappings. Please check if WireMock is running on port 3001.';
          console.error('Error loading mappings:', err);
          this.loading = false;
        }
      });
  }

  loadAvailableScenarios(): void {
    this.scenarioService.getAllScenarios().subscribe({
      next: (response) => {
        this.availableScenarios = response.scenarios.map(s => s.name);
      },
      error: (err) => {
        console.warn('Failed to load scenarios for auto-completion:', err);
        this.availableScenarios = [];
      }
    });
  }

  onSearchChange(query: string): void {
    this.searchQuery = query;
    this.currentPage = 1;

    const queryParams: any = {};
    if (this.searchQuery) {
      queryParams.search = this.searchQuery;
    }

    this.router.navigate(['/ui/stubs'], {
      queryParams,
      queryParamsHandling: 'merge'
    });

    this.loadMappings();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadMappings();
  }

  selectStub(mapping: StubMapping, updateUrl: boolean = true): void {
    this.selectedMapping = mapping;
    if (this.stubDetail) {
      this.stubDetail.resetTabs();
    }

    if (updateUrl) {
      const stubId = mapping.uuid || mapping.id;
      if (stubId) {
        this.router.navigate(['/ui/stubs', stubId], {
          queryParamsHandling: 'preserve'
        });
      }
    }
  }

  selectStubById(stubId: string): void {
    const stub = this.mappings.find(m => (m.uuid || m.id) === stubId);
    if (stub) {
      this.selectStub(stub, false);
    } else {
      this.mappingService.getMappings(0, 1000, '').subscribe({
        next: (response) => {
          const foundStub = response.mappings.find(m => (m.uuid || m.id) === stubId);
          if (foundStub) {
            this.selectStub(foundStub, false);
            this.mappings = response.mappings;
            this.totalMappings = response.meta.total;
          } else {
            console.error('Stub not found:', stubId);
          }
        },
        error: (err) => {
          console.error('Error loading stubs:', err);
        }
      });
    }
  }

  closeDetails(): void {
    this.selectedMapping = null;
  }

  navigateToScenario(scenarioName: string): void {
    this.router.navigate(['/ui/scenarios'], { queryParams: { scenario: scenarioName } });
  }

  refreshStubs(): void {
    this.loadMappings();
  }

  createNewStub(): void {
    this.stubEditor.open({ editMode: 'create' });
  }

  editStub(): void {
    if (!this.selectedMapping) return;
    this.stubEditor.open({ editMode: 'edit', mapping: this.selectedMapping });
  }

  cloneStub(): void {
    if (!this.selectedMapping) return;
    this.stubEditor.open({ editMode: 'clone', mapping: this.selectedMapping });
  }

  deleteStub(): void {
    if (!this.selectedMapping) return;

    const stubName = this.selectedMapping.name || 'this stub';
    if (!confirm(`Are you sure you want to delete "${stubName}"?`)) {
      return;
    }

    const uuid = this.selectedMapping.uuid || this.selectedMapping.id;
    if (!uuid) {
      alert('Cannot delete: stub has no UUID');
      return;
    }

    this.mappingService.deleteMapping(uuid).subscribe({
      next: () => {
        this.selectedMapping = null;
        this.loadMappings();
        console.log('Stub deleted successfully');
      },
      error: (err) => {
        alert('Failed to delete stub: ' + (err.error?.message || err.message));
      }
    });
  }

  onStubSaved(event: { savedUuid: string | null; editMode: string }): void {
    this.mappingService.getMappings(this.currentPage - 1, this.pageSize, this.searchQuery).subscribe({
      next: (mappingsResponse) => {
        this.mappings = mappingsResponse.mappings;
        this.totalMappings = mappingsResponse.meta.total;

        if (event.savedUuid) {
          const savedStub = this.mappings.find(m => (m.uuid || m.id) === event.savedUuid);
          if (savedStub) {
            this.selectedMapping = savedStub;
          }
        }

        console.log(`Stub ${event.editMode === 'edit' ? 'updated' : 'created'} successfully`);
      },
      error: (err) => {
        console.error('Error reloading mappings:', err);
        this.loadMappings();
      }
    });
  }

  createStubFromRequest(request: any): void {
    this.stubEditor.openWithRequestData(request);
    this.cdr.detectChanges();
  }

  // ========== SELECTION & EXPORT/IMPORT ==========

  toggleStubSelection(uuid: string, event: Event): void {
    event.stopPropagation();
    if (this.selectedStubIds.has(uuid)) {
      this.selectedStubIds.delete(uuid);
    } else {
      this.selectedStubIds.add(uuid);
    }
    this.cdr.detectChanges();
  }

  onSelectionToggled(payload: { uuid: string; event: Event }): void {
    this.toggleStubSelection(payload.uuid, payload.event);
  }

  selectAllStubs(): void {
    this.mappings.forEach(m => {
      const uuid = m.uuid || m.id;
      if (uuid) {
        this.selectedStubIds.add(uuid);
      }
    });
    this.cdr.detectChanges();
  }

  deselectAllStubs(): void {
    this.selectedStubIds.clear();
    this.cdr.detectChanges();
  }

  exportStubs(exportSelected: boolean = false): void {
    this.loading = true;
    this.error = null;

    this.mappingService.getAllMappingsRaw().subscribe({
      next: (response) => {
        let mappingsToExport = response.mappings || [];

        if (exportSelected && this.selectedStubIds.size > 0) {
          mappingsToExport = mappingsToExport.filter((m: any) =>
            this.selectedStubIds.has(m.uuid || m.id)
          );
        }

        const exportData = { mappings: mappingsToExport };
        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        a.download = `wiremock-stubs-${timestamp}.json`;

        a.click();
        window.URL.revokeObjectURL(url);

        this.loading = false;
        console.log(`[EXPORT] Exported ${mappingsToExport.length} stubs`);
      },
      error: (err) => {
        this.error = 'Failed to export stubs: ' + (err.error?.message || err.message);
        console.error('Error exporting stubs:', err);
        this.loading = false;
      }
    });
  }

  openImportModal(): void {
    this.stubImport.open();
  }

  deleteSelectedStubs(): void {
    if (this.selectedStubIds.size === 0) {
      return;
    }

    if (!confirm(`Delete ${this.selectedStubIds.size} selected stubs?`)) {
      return;
    }

    this.loading = true;
    this.error = null;

    const deletePromises: Promise<any>[] = [];
    this.selectedStubIds.forEach(uuid => {
      const promise = this.mappingService.deleteMapping(uuid).toPromise();
      deletePromises.push(promise);
    });

    Promise.all(deletePromises).then(
      () => {
        console.log(`[DELETE] Successfully deleted ${this.selectedStubIds.size} stubs`);
        this.selectedStubIds.clear();
        this.loading = false;
        this.loadMappings();
      },
      (err) => {
        this.error = 'Failed to delete some stubs';
        console.error('Error deleting stubs:', err);
        this.loading = false;
      }
    );
  }
}
