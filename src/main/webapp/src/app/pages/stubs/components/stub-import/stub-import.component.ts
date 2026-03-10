import { Component, ElementRef, EventEmitter, Output, TemplateRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbModal, NgbModalRef, NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { MappingService } from '../../../../services/mapping.service';
import { ProcessedStub, StubImportService, ZipStructure } from '../../../../services/stub-import.service';

@Component({
  selector: 'app-stub-import',
  standalone: true,
  imports: [CommonModule, FormsModule, NgbModule],
  templateUrl: './stub-import.component.html',
  styleUrls: ['./stub-import.component.scss']
})
export class StubImportComponent {
  @Output() importCompleted = new EventEmitter<void>();

  @ViewChild('importModalTpl') importModalTpl!: TemplateRef<any>;
  @ViewChild('importInput') importInputRef!: ElementRef<HTMLInputElement>;

  showImportModal = false;
  importFile: File | null = null;
  importPreview: { count: number; mappings: any[]; processedStubs?: ProcessedStub[] } | null = null;
  importMode: 'add' | 'replace' = 'add';
  importDetectedType: 'json' | 'zip' | 'directory' | null = null;
  importLoading = false;
  importError: string | null = null;
  importWarnings: string[] = [];
  importValidationInfo: { totalFiles: number; substitutedFiles: number } | null = null;

  zipStructure: ZipStructure | null = null;
  showZipFileSelection = false;
  zipSelectionLoading = false;

  private _importModalRef: NgbModalRef | null = null;

  constructor(
    private mappingService: MappingService,
    private stubImportService: StubImportService,
    private modalService: NgbModal
  ) {}

  open(): void {
    this.showImportModal = true;
    this.importFile = null;
    this.importPreview = null;
    this.importMode = 'add';
    this.importDetectedType = null;
    this.importError = null;
    this.importWarnings = [];
    this.importValidationInfo = null;
    this.zipStructure = null;
    this.showZipFileSelection = false;
    this.zipSelectionLoading = false;

    this._importModalRef = this.modalService.open(this.importModalTpl, {
      size: 'lg',
      scrollable: true,
      backdrop: 'static'
    });
    this._importModalRef.dismissed.subscribe(() => {
      this.showImportModal = false;
      this._importModalRef = null;
    });
  }

  close(): void {
    this.showImportModal = false;
    this.importFile = null;
    this.importPreview = null;
    this.importDetectedType = null;
    this.importError = null;
    this.importWarnings = [];
    this.importValidationInfo = null;
    this.zipStructure = null;
    this.showZipFileSelection = false;
    this.zipSelectionLoading = false;
    if (this._importModalRef) {
      this._importModalRef.dismiss();
      this._importModalRef = null;
    }
  }

  onDropFile(event: DragEvent): void {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const name = file.name.toLowerCase();
    if (!name.endsWith('.json') && !name.endsWith('.zip')) {
      this.importError = 'Only .json and .zip files are supported via drag & drop.';
      return;
    }

    this.importError = null;
    this.importWarnings = [];
    this.importPreview = null;
    this.importValidationInfo = null;
    this.zipStructure = null;
    this.showZipFileSelection = false;

    if (name.endsWith('.zip')) {
      this.importDetectedType = 'zip';
      this.importFile = file;
      this.processZipFileSource(file);
    } else {
      this.importDetectedType = 'json';
      this.importFile = file;
      this.processJsonFile(file);
    }
  }

  openImportInput(mode: 'file' | 'directory'): void {
    const input = this.importInputRef.nativeElement;
    input.value = '';
    if (mode === 'directory') {
      input.removeAttribute('accept');
      input.setAttribute('webkitdirectory', '');
      input.removeAttribute('multiple');
    } else {
      input.removeAttribute('webkitdirectory');
      input.setAttribute('accept', '.json,.zip');
      input.removeAttribute('multiple');
    }
    input.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) {
      return;
    }

    this.importError = null;
    this.importWarnings = [];
    this.importPreview = null;
    this.importValidationInfo = null;
    this.zipStructure = null;
    this.showZipFileSelection = false;

    const isDirectoryMode = input.hasAttribute('webkitdirectory');

    if (isDirectoryMode) {
      this.importDetectedType = 'directory';
      this.processDirectoryFiles(files);
    } else if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
      this.importDetectedType = 'zip';
      this.importFile = files[0];
      this.processZipFileSource(files[0]);
    } else {
      this.importDetectedType = 'json';
      this.importFile = files[0];
      this.processJsonFile(files[0]);
    }
  }

  private async processDirectoryFiles(files: FileList): Promise<void> {
    this.zipSelectionLoading = true;
    try {
      this.zipStructure = await this.stubImportService.loadDirectoryStructure(files);
      this.showZipFileSelection = true;
    } catch (err: any) {
      this.importError = err.message || 'Failed to read directory';
    } finally {
      this.zipSelectionLoading = false;
    }
  }

  private async processZipFileSource(file: File): Promise<void> {
    this.zipSelectionLoading = true;
    try {
      this.zipStructure = await this.stubImportService.loadZipStructure(file);
      this.showZipFileSelection = true;
    } catch (err: any) {
      this.importError = err.message || 'Failed to load ZIP structure';
    } finally {
      this.zipSelectionLoading = false;
    }
  }

  async processSelectedZipFiles(): Promise<void> {
    if (!this.zipStructure) {
      return;
    }

    this.importLoading = true;
    this.importError = null;

    try {
      const selectedMappingPaths = this.zipStructure.mappingFiles
        .filter(f => f.selected)
        .map(f => f.path);

      const selectedBodyFilePaths = this.zipStructure.bodyFiles
        .filter(f => f.selected)
        .map(f => f.path);

      if (selectedMappingPaths.length === 0) {
        this.importError = 'Please select at least one mapping file';
        this.importLoading = false;
        return;
      }

      const result = await this.stubImportService.processSelectedFiles(
        this.zipStructure,
        selectedMappingPaths,
        selectedBodyFilePaths
      );

      if (result.errors.length > 0) {
        this.importError = `Found ${result.errors.length} error(s):\n${result.errors.join('\n')}`;
        this.importLoading = false;
        return;
      }

      this.importWarnings = result.warnings;
      this.importValidationInfo = {
        totalFiles: result.totalFiles,
        substitutedFiles: result.substitutedFiles
      };

      this.importPreview = {
        count: result.mappings.length,
        mappings: result.mappings.map(p => p.stub),
        processedStubs: result.mappings
      };

      this.showZipFileSelection = false;

      console.log(`[IMPORT ZIP] Preview: ${result.mappings.length} stubs, ${result.substitutedFiles} files substituted`);

    } catch (err: any) {
      this.importError = err.message || 'Failed to process selected files';
      console.error('Error processing selected files:', err);
    } finally {
      this.importLoading = false;
    }
  }

  backToFileSelection(): void {
    this.showZipFileSelection = true;
    this.importPreview = null;
    this.importWarnings = [];
    this.importValidationInfo = null;
  }

  toggleAllMappings(selected: boolean): void {
    if (this.zipStructure) {
      this.zipStructure.mappingFiles.forEach(f => f.selected = selected);
    }
  }

  toggleAllBodyFiles(selected: boolean): void {
    if (this.zipStructure) {
      this.zipStructure.bodyFiles.forEach(f => f.selected = selected);
    }
  }

  getSelectedMappingsCount(): number {
    return this.zipStructure?.mappingFiles.filter(f => f.selected).length || 0;
  }

  getSelectedBodyFilesCount(): number {
    return this.zipStructure?.bodyFiles.filter(f => f.selected).length || 0;
  }

  private processJsonFile(file: File): void {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const validation = this.stubImportService.validateJsonImport(content);

        if (!validation.valid) {
          this.importError = validation.error || 'Invalid JSON file';
          return;
        }

        this.importPreview = {
          count: validation.mappings!.length,
          mappings: validation.mappings!
        };

        console.log(`[IMPORT JSON] Preview: ${validation.mappings!.length} stubs to import`);

      } catch (err: any) {
        this.importError = 'Failed to parse file: ' + (err.message || 'Invalid JSON');
        console.error('Error parsing import file:', err);
      }
    };

    reader.onerror = () => {
      this.importError = 'Failed to read file';
    };

    reader.readAsText(file);
  }

  executeImport(): void {
    if (!this.importPreview) {
      return;
    }

    this.importLoading = true;
    this.importError = null;

    const importAction = () => {
      this.mappingService.importMappings(this.importPreview!.mappings).subscribe({
        next: () => {
          const importedCount = this.importPreview?.count ?? 0;
          console.log(`[IMPORT] Successfully imported ${importedCount} stubs`);
          this.importLoading = false;
          this.close();
          this.importCompleted.emit();
          alert(`Successfully imported ${importedCount} stubs!`);
        },
        error: (err) => {
          this.importError = 'Failed to import stubs: ' + (err.error?.message || err.message);
          console.error('Error importing stubs:', err);
          this.importLoading = false;
        }
      });
    };

    if (this.importMode === 'replace') {
      if (!confirm(`This will DELETE all existing stubs and replace them with ${this.importPreview.count} new stubs. Are you sure?`)) {
        this.importLoading = false;
        return;
      }

      this.mappingService.resetMappings().subscribe({
        next: () => {
          console.log('[IMPORT] Existing stubs reset');
          importAction();
        },
        error: (err) => {
          this.importError = 'Failed to reset stubs: ' + (err.error?.message || err.message);
          console.error('Error resetting stubs:', err);
          this.importLoading = false;
        }
      });
    } else {
      importAction();
    }
  }
}
