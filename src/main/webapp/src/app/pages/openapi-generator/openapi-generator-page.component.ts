import { Component, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import * as jsyaml from 'js-yaml';
import { OpenApiParserService, ParsedSpec } from '../../services/openapi-parser.service';
import { StubGeneratorService, StubConfig, GeneratedStub, WireMockFault } from '../../services/stub-generator.service';
import { ConfigService } from '../../services/config.service';
import { StubEditorComponent } from '../stubs/components/stub-editor/stub-editor.component';

interface EndpointEntry extends StubConfig {
  preview?: any;
  /** All response examples across all status codes */
  allResponseExamples: Array<{ key: string; statusCode: string }>;
  /** Available request body example keys */
  requestExampleKeys: string[];
  /** Single WireMock fault type to generate as additional stub ('' = none) */
  faultType: string;
  /** Unique identifier used for stable @for tracking */
  variantId: number;
}

@Component({
  selector: 'app-openapi-generator-page',
  standalone: true,
  imports: [CommonModule, FormsModule, NgbModule, StubEditorComponent],
  templateUrl: './openapi-generator-page.component.html',
  styleUrls: ['./openapi-generator-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OpenApiGeneratorPageComponent implements OnDestroy {

  // Input
  inputMode: 'paste' | 'upload' = 'paste';
  rawSpec = '';
  uploadedFileName = '';

  // Parsed state
  parsedSpec: ParsedSpec | null = null;
  parseError: string | null = null;
  isParsing = false;

  // Configuration
  globalUrlPrefix = '';
  generateErrorCases = false;

  // Endpoint list
  endpoints: EndpointEntry[] = [];
  allSelected = true;
  private _variantCounter = 0;

  // Generated stubs
  generatedStubs: GeneratedStub[] = [];
  isGenerating = false;
  previewStub: GeneratedStub | null = null;
  editingStubIndex: number | null = null;

  @ViewChild(StubEditorComponent) stubEditor!: StubEditorComponent;

  // Export
  isExporting = false;
  exportSuccess = false;

  // Import into WireMock
  isImporting = false;
  importSuccess = false;
  importError: string | null = null;
  importedCount = 0;

  private exportSuccessTimer: any;
  private importSuccessTimer: any;
  private static readonly EXPORT_SUCCESS_DISPLAY_DURATION = 3000;

  readonly STATUS_CODES = ['200', '201', '204', '400', '401', '403', '404', '500'];

  readonly WIREMOCK_FAULTS: { value: WireMockFault; label: string }[] = [
    { value: 'CONNECTION_RESET_BY_PEER', label: 'CONNECTION_RESET_BY_PEER' },
    { value: 'EMPTY_RESPONSE', label: 'EMPTY_RESPONSE' },
    { value: 'MALFORMED_RESPONSE_CHUNK', label: 'MALFORMED_RESPONSE_CHUNK' },
    { value: 'RANDOM_DATA_THEN_CLOSE', label: 'RANDOM_DATA_THEN_CLOSE' },
  ];

  constructor(
    private parserService: OpenApiParserService,
    private generatorService: StubGeneratorService,
    private configService: ConfigService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnDestroy(): void {
    if (this.exportSuccessTimer) clearTimeout(this.exportSuccessTimer);
    if (this.importSuccessTimer) clearTimeout(this.importSuccessTimer);
  }

  // ─── Input Handling ────────────────────────────────────────────────────────

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploadedFileName = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.rawSpec = (e.target?.result as string) ?? '';
      this.cdr.markForCheck();
    };
    reader.readAsText(file);
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    this.uploadedFileName = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.rawSpec = (e.target?.result as string) ?? '';
      this.cdr.markForCheck();
    };
    reader.readAsText(file);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  // ─── Parsing ───────────────────────────────────────────────────────────────

  parseSpec(): void {
    if (!this.rawSpec.trim()) {
      this.parseError = 'Please provide an OpenAPI specification.';
      this.cdr.markForCheck();
      return;
    }

    this.isParsing = true;
    this.parseError = null;
    this.parsedSpec = null;
    this.endpoints = [];
    this.generatedStubs = [];
    this.cdr.markForCheck();

    // Use setTimeout to let UI update before heavy parsing
    setTimeout(() => {
      try {
        const spec = this.parserService.parse(this.rawSpec);
        this.parsedSpec = spec;

        if (spec.errors.length > 0 && spec.operations.length === 0) {
          this.parseError = spec.errors.join('\n');
        } else {
          this.buildEndpointList(spec);
        }
      } catch (e: any) {
        this.parseError = `Parse error: ${e.message}`;
      } finally {
        this.isParsing = false;
        this.cdr.markForCheck();
      }
    }, 10);
  }

  private buildEndpointList(spec: ParsedSpec): void {
    // Try to get the full spec object for $ref resolution
    let fullSpec: any;
    try {
      const trimmed = this.rawSpec.trim();
      if (trimmed.startsWith('{')) {
        fullSpec = JSON.parse(trimmed);
      } else {
        fullSpec = jsyaml.load(trimmed);
      }
    } catch { /* ignore */ }

    this._variantCounter = 0;
    this.endpoints = spec.operations.map(op => {
      const statusCode = this.generatorService.getDefaultStatusCode(op);
      return {
        operation: op,
        enabled: true,
        statusCode,
        urlPrefix: this.globalUrlPrefix,
        generateErrorCases: false,
        faultType: '',
        fullSpec,
        allResponseExamples: this.parserService.getAllResponseExamples(op, fullSpec),
        requestExampleKeys: this.parserService.getRequestBodyExampleKeys(op, fullSpec),
        selectedRequestExample: undefined,
        selectedResponseExample: undefined,
        variantId: ++this._variantCounter
      };
    });
    this.allSelected = true;
  }

  // ─── Selection ─────────────────────────────────────────────────────────────

  toggleAll(): void {
    this.allSelected = !this.allSelected;
    this.endpoints.forEach(e => e.enabled = this.allSelected);
  }

  updateAllSelected(): void {
    this.allSelected = this.endpoints.every(e => e.enabled);
  }

  applyGlobalPrefix(): void {
    this.endpoints.forEach(e => e.urlPrefix = this.globalUrlPrefix);
  }

  applyGlobalErrorCases(): void {
    this.endpoints.forEach(e => {
      e.generateErrorCases = this.generateErrorCases;
    });
  }

  onStatusCodeChange(entry: EndpointEntry): void {
    entry.selectedResponseExample = undefined;
  }

  onResponseExampleChange(entry: EndpointEntry): void {
    if (!entry.selectedResponseExample) return;
    const found = entry.allResponseExamples.find(e => e.key === entry.selectedResponseExample);
    if (found && found.statusCode !== 'default') {
      entry.statusCode = found.statusCode;
    }
  }


  // ─── Generation ────────────────────────────────────────────────────────────

  generate(): void {
    if (!this.endpoints.length) return;

    this.isGenerating = true;
    this.generatedStubs = [];
    this.previewStub = null;
    this.cdr.markForCheck();

    setTimeout(() => {
      try {
        this.generatedStubs = this.generatorService.generateStubs(this.endpoints);
      } catch (e: any) {
        this.parseError = `Generation error: ${e.message}`;
      } finally {
        this.isGenerating = false;
        this.cdr.markForCheck();
      }
    }, 10);
  }

  // ─── Preview ───────────────────────────────────────────────────────────────

  openPreview(stub: GeneratedStub): void {
    this.previewStub = stub;
  }

  closePreview(): void {
    this.previewStub = null;
  }

  getPreviewJson(): string {
    if (!this.previewStub) return '';
    return JSON.stringify(this.previewStub.mapping, null, 2);
  }

  copyPreviewJson(): void {
    if (!this.previewStub) return;
    navigator.clipboard.writeText(this.getPreviewJson()).catch(() => {/* ignore */});
  }

  // ─── Export ────────────────────────────────────────────────────────────────

  async exportZip(): Promise<void> {
    if (!this.generatedStubs.length) return;

    this.isExporting = true;
    this.cdr.markForCheck();
    try {
      const archiveName = this.parsedSpec?.title
        ? `wiremock-${this.parsedSpec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
        : 'wiremock-stubs';
      await this.generatorService.exportAsZip(this.generatedStubs, archiveName);
      this.exportSuccess = true;
      if (this.exportSuccessTimer) clearTimeout(this.exportSuccessTimer);
      this.exportSuccessTimer = setTimeout(() => {
        this.exportSuccess = false;
        this.cdr.markForCheck();
      }, OpenApiGeneratorPageComponent.EXPORT_SUCCESS_DISPLAY_DURATION);
    } finally {
      this.isExporting = false;
      this.cdr.markForCheck();
    }
  }

  exportSingle(stub: GeneratedStub): void {
    this.generatorService.exportSingleStub(stub);
  }

  async importIntoWiremock(): Promise<void> {
    if (!this.generatedStubs.length) return;

    this.isImporting = true;
    this.importError = null;
    this.importSuccess = false;
    this.cdr.markForCheck();

    try {
      const apiUrl = `${this.configService.wiremockApiUrl}/mappings`;
      const mappings = this.generatedStubs.map(s => s.mapping);
      let successCount = 0;
      const errors: string[] = [];

      for (const mapping of mappings) {
        try {
          await this.http.post(apiUrl, mapping).toPromise();
          successCount++;
        } catch (err: any) {
          const msg = err?.error?.message ?? err?.message ?? 'Unknown error';
          errors.push(msg);
        }
      }

      if (errors.length === 0) {
        this.importSuccess = true;
        this.importedCount = successCount;
        if (this.importSuccessTimer) clearTimeout(this.importSuccessTimer);
        this.importSuccessTimer = setTimeout(() => {
          this.importSuccess = false;
          this.cdr.markForCheck();
        }, OpenApiGeneratorPageComponent.EXPORT_SUCCESS_DISPLAY_DURATION);
      } else {
        this.importedCount = successCount;
        this.importError = `${successCount} stub(s) imported, ${errors.length} failed. First error: ${errors[0]}`;
      }
    } catch (e: any) {
      this.importError = `Import failed: ${e.message}`;
    } finally {
      this.isImporting = false;
      this.cdr.markForCheck();
    }
  }

  // ─── Edit Generated Stub ──────────────────────────────────────────────────

  editGeneratedStub(stub: GeneratedStub, index: number): void {
    this.editingStubIndex = index;
    this.stubEditor.open({ editMode: 'edit', mapping: stub.mapping as any });
  }

  onStubEdited(mapping: any): void {
    if (this.editingStubIndex !== null && this.editingStubIndex >= 0 && this.editingStubIndex < this.generatedStubs.length) {
      const existing = this.generatedStubs[this.editingStubIndex];
      this.generatedStubs = [
        ...this.generatedStubs.slice(0, this.editingStubIndex),
        { ...existing, mapping },
        ...this.generatedStubs.slice(this.editingStubIndex + 1)
      ];
      this.editingStubIndex = null;
      this.cdr.markForCheck();
    }
  }

  // ─── Endpoint Variants ────────────────────────────────────────────────────

  addEndpointVariant(entry: EndpointEntry, index: number): void {
    const newEntry: EndpointEntry = {
      operation: entry.operation,
      enabled: entry.enabled,
      statusCode: entry.statusCode,
      urlPrefix: entry.urlPrefix,
      generateErrorCases: entry.generateErrorCases,
      faultType: entry.faultType,
      allResponseExamples: entry.allResponseExamples,
      requestExampleKeys: entry.requestExampleKeys,
      selectedRequestExample: entry.selectedRequestExample,
      selectedResponseExample: entry.selectedResponseExample,
      fullSpec: entry.fullSpec,
      variantId: ++this._variantCounter
    };
    this.endpoints = [
      ...this.endpoints.slice(0, index + 1),
      newEntry,
      ...this.endpoints.slice(index + 1)
    ];
  }

  removeEndpointEntry(index: number): void {
    this.endpoints = this.endpoints.filter((_, i) => i !== index);
    this.updateAllSelected();
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  getSpecVersionLabel(specVersion: string): string {
    switch (specVersion) {
      case '2.0': return 'Swagger 2.0';
      case '3.0': return 'OpenAPI 3.0';
      case '3.1': return 'OpenAPI 3.1';
      default: return 'Unknown version';
    }
  }

  getSpecVersionBadgeClass(specVersion: string): string {
    switch (specVersion) {
      case '2.0': return 'spec-version-swagger';
      case '3.0': return 'spec-version-openapi30';
      case '3.1': return 'spec-version-openapi31';
      default: return 'spec-version-unknown';
    }
  }

  getMethodClass(method: string): string {
    const map: { [k: string]: string } = {
      GET: 'method-get',
      POST: 'method-post',
      PUT: 'method-put',
      DELETE: 'method-delete',
      PATCH: 'method-patch',
      OPTIONS: 'method-options',
      HEAD: 'method-head'
    };
    return map[method.toUpperCase()] ?? 'method-default';
  }

  getEnabledCount(): number {
    return this.endpoints.filter(e => e.enabled).length;
  }

  resetAll(): void {
    this.rawSpec = '';
    this.uploadedFileName = '';
    this.parsedSpec = null;
    this.parseError = null;
    this.endpoints = [];
    this.generatedStubs = [];
    this.previewStub = null;
    this.editingStubIndex = null;
    this.exportSuccess = false;
    this.importSuccess = false;
    this.importError = null;
    this.importedCount = 0;
  }
}
