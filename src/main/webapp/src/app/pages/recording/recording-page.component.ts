import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { interval, Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { RecordingService, RecordingStatus, RecordingConfig, SnapshotConfig, RecordingResult } from '../../services/recording.service';

@Component({
  selector: 'app-recording-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './recording-page.component.html',
  styleUrls: ['./recording-page.component.css']
})
export class RecordingPageComponent implements OnInit, OnDestroy {
  // Mode Read-only (Work in Progress)
  readonly = true;

  // Recording state
  recordingStatus: RecordingStatus = { status: 'NeverStarted' };
  loading = false;
  error: string | null = null;

  // Polling to refresh status
  private statusPolling?: Subscription;
  private readonly POLLING_INTERVAL = 5000; // 5 secondes

  // Configuration de l'enregistrement
  config: RecordingConfig = {
    targetBaseUrl: '',
    persist: true,
    repeatsAsScenarios: false
  };

  // Advanced configuration (hidden by default)
  showAdvancedConfig = false;
  urlFilterPattern = '';
  methodFilter = '';
  captureHeadersKeys = '';
  textSizeThreshold = '2048';
  binarySizeThreshold = '10240';

  // Recording results
  recordedMappings: any[] = [];
  showResults = false;
  selectedMapping: any = null;

  // Saved configurations
  savedConfigs: { name: string; config: RecordingConfig }[] = [];
  showSaveConfigModal = false;
  newConfigName = '';
  showLoadConfigModal = false;

  constructor(private recordingService: RecordingService) {}

  ngOnInit(): void {
    this.loadRecordingStatus();
    this.loadSavedConfigs();
    this.startStatusPolling();
  }

  ngOnDestroy(): void {
    this.stopStatusPolling();
  }

  /**
   * Charge le statut actuel de l'enregistrement
   */
  loadRecordingStatus(): void {
    this.recordingService.getRecordingStatus().subscribe({
      next: (status) => {
        this.recordingStatus = status;
        console.log('[RECORDING] Status loaded:', status);
      },
      error: (err) => {
        console.error('Error loading recording status:', err);
        this.error = 'Impossible de charger le statut de l\'enregistrement';
      }
    });
  }

  /**
   * Starts status polling
   */
  startStatusPolling(): void {
    this.statusPolling = interval(this.POLLING_INTERVAL)
      .pipe(
        switchMap(() => this.recordingService.getRecordingStatus())
      )
      .subscribe({
        next: (status) => {
          this.recordingStatus = status;
        },
        error: (err) => {
          console.error('Error polling recording status:', err);
        }
      });
  }

  /**
   * Stops status polling
   */
  stopStatusPolling(): void {
    if (this.statusPolling) {
      this.statusPolling.unsubscribe();
    }
  }

  /**
   * Starts recording
   */
  startRecording(): void {
    if (!this.config.targetBaseUrl) {
      this.error = 'Please specify a target URL';
      return;
    }

    this.loading = true;
    this.error = null;

    // Build the full configuration
    const fullConfig = this.buildRecordingConfig();

    this.recordingService.startRecording(fullConfig).subscribe({
      next: () => {
        console.log('[RECORDING] Recording started');
        this.recordingStatus = { status: 'Recording' };
        this.loading = false;
        this.showResults = false;
        this.recordedMappings = [];
      },
      error: (err) => {
        console.error('Error starting recording:', err);
        this.error = 'Impossible de démarrer l\'enregistrement: ' + (err.error?.message || err.message);
        this.loading = false;
      }
    });
  }

  /**
   * Stops recording
   */
  stopRecording(): void {
    this.loading = true;
    this.error = null;

    this.recordingService.stopRecording().subscribe({
      next: (result: RecordingResult) => {
        console.log('[RECORDING] Recording stopped, mappings:', result.mappings);
        this.recordingStatus = { status: 'Stopped' };
        this.recordedMappings = result.mappings || [];
        this.showResults = true;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error stopping recording:', err);
        this.error = 'Impossible d\'arrêter l\'enregistrement: ' + (err.error?.message || err.message);
        this.loading = false;
      }
    });
  }

  /**
   * Takes a snapshot without stopping recording
   */
  takeSnapshot(): void {
    this.loading = true;
    this.error = null;

    const snapshotConfig: SnapshotConfig = {
      persist: this.config.persist,
      repeatsAsScenarios: this.config.repeatsAsScenarios
    };

    // Add filters if configured
    if (this.urlFilterPattern || this.methodFilter) {
      snapshotConfig.filters = {};
      if (this.urlFilterPattern) {
        snapshotConfig.filters.urlPathPattern = this.urlFilterPattern;
      }
      if (this.methodFilter) {
        snapshotConfig.filters.method = this.methodFilter;
      }
    }

    this.recordingService.takeSnapshot(snapshotConfig).subscribe({
      next: (result: RecordingResult) => {
        console.log('[RECORDING] Snapshot taken, mappings:', result.mappings);
        this.recordedMappings = result.mappings || [];
        this.showResults = true;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error taking snapshot:', err);
        this.error = 'Impossible de prendre un snapshot: ' + (err.error?.message || err.message);
        this.loading = false;
      }
    });
  }

  /**
   * Builds the full configuration to start recording
   */
  private buildRecordingConfig(): RecordingConfig {
    const fullConfig: RecordingConfig = {
      targetBaseUrl: this.config.targetBaseUrl,
      persist: this.config.persist,
      repeatsAsScenarios: this.config.repeatsAsScenarios
    };

    // Filtres
    if (this.urlFilterPattern || this.methodFilter) {
      fullConfig.filters = {};
      if (this.urlFilterPattern) {
        fullConfig.filters.urlPathPattern = this.urlFilterPattern;
      }
      if (this.methodFilter) {
        fullConfig.filters.method = this.methodFilter;
      }
    }

    // Headers to capture
    if (this.captureHeadersKeys) {
      fullConfig.captureHeaders = {};
      const headers = this.captureHeadersKeys.split(',').map(h => h.trim());
      headers.forEach(header => {
        if (header) {
          fullConfig.captureHeaders![header] = {};
        }
      });
    }

    // Body extraction criteria
    if (this.textSizeThreshold || this.binarySizeThreshold) {
      fullConfig.extractBodyCriteria = {
        textSizeThreshold: this.textSizeThreshold,
        binarySizeThreshold: this.binarySizeThreshold
      };
    }

    return fullConfig;
  }

  /**
   * Selects a mapping to display
   */
  selectMapping(mapping: any): void {
    this.selectedMapping = mapping;
  }

  /**
   * Closes the mapping preview
   */
  closeMapping(): void {
    this.selectedMapping = null;
  }

  /**
   * Copie le JSON d'un mapping dans le presse-papiers
   */
  copyMappingJson(mapping: any): void {
    const json = JSON.stringify(mapping, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      console.log('[RECORDING] Mapping JSON copied to clipboard');
    });
  }

  /**
   * Exports all recorded mappings as JSON
   */
  exportMappings(): void {
    const json = JSON.stringify(this.recordedMappings, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wiremock-recording-${new Date().getTime()}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  /**
   * Loads saved configurations from localStorage
   */
  loadSavedConfigs(): void {
    const saved = localStorage.getItem('wiremock-recording-configs');
    if (saved) {
      try {
        this.savedConfigs = JSON.parse(saved);
      } catch (e) {
        console.error('Error loading saved configs:', e);
      }
    }
  }

  /**
   * Sauvegarde la configuration actuelle
   */
  saveConfig(): void {
    if (!this.newConfigName) {
      return;
    }

    const config = this.buildRecordingConfig();
    this.savedConfigs.push({
      name: this.newConfigName,
      config: config
    });

    localStorage.setItem('wiremock-recording-configs', JSON.stringify(this.savedConfigs));
    this.showSaveConfigModal = false;
    this.newConfigName = '';
  }

  /**
   * Loads a saved configuration
   */
  loadConfig(savedConfig: { name: string; config: RecordingConfig }): void {
    this.config = { ...savedConfig.config };

    // Load advanced fields
    if (savedConfig.config.filters) {
      this.urlFilterPattern = savedConfig.config.filters.urlPathPattern || '';
      this.methodFilter = savedConfig.config.filters.method || '';
    }

    if (savedConfig.config.captureHeaders) {
      this.captureHeadersKeys = Object.keys(savedConfig.config.captureHeaders).join(', ');
    }

    if (savedConfig.config.extractBodyCriteria) {
      this.textSizeThreshold = savedConfig.config.extractBodyCriteria.textSizeThreshold || '2048';
      this.binarySizeThreshold = savedConfig.config.extractBodyCriteria.binarySizeThreshold || '10240';
    }

    this.showLoadConfigModal = false;
  }

  /**
   * Deletes a saved configuration
   */
  deleteConfig(index: number): void {
    this.savedConfigs.splice(index, 1);
    localStorage.setItem('wiremock-recording-configs', JSON.stringify(this.savedConfigs));
  }

  /**
   * Gets an icon for the recording status
   */
  getStatusIcon(): string {
    switch (this.recordingStatus.status) {
      case 'Recording':
        return '🔴';
      case 'Stopped':
        return '⏹️';
      default:
        return '⚪';
    }
  }

  /**
   * Obtient une classe CSS pour le statut
   */
  getStatusClass(): string {
    switch (this.recordingStatus.status) {
      case 'Recording':
        return 'status-recording';
      case 'Stopped':
        return 'status-stopped';
      default:
        return 'status-never-started';
    }
  }

  /**
   * Obtient le label du statut
   */
  getStatusLabel(): string {
    switch (this.recordingStatus.status) {
      case 'Recording':
        return 'En cours d\'enregistrement';
      case 'Stopped':
        return 'Stopped';
      case 'NeverStarted':
        return 'Never started';
      default:
        return 'Inconnu';
    }
  }
}

