import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfigService, WiremockEndpointConfig, CustomBackend } from '../../services/config.service';

export interface EndpointOption {
  id: string;
  label: string;
  url: string;
  type: 'local' | 'env' | 'custom';
  badge?: string;
  badgeClass?: string;
  customBackendId?: string;  // set if this option is a saved custom backend
}

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings-page.component.html',
  styleUrls: ['./settings-page.component.scss']
})
export class SettingsPageComponent implements OnInit {
  options: EndpointOption[] = [];
  selectedOptionId = '';

  // Saved custom backends management
  savedCustomBackends: CustomBackend[] = [];
  newBackendLabel = '';
  newBackendUrl = '';
  editingBackendId: string | null = null;
  editingBackendLabel = '';
  editingBackendUrl = '';

  constructor(private configService: ConfigService) {}

  ngOnInit(): void {
    this.loadSavedCustomBackends();
    this.buildOptions();
    const config = this.configService.getEndpointConfig();
    this.applyCurrentConfig(config);
  }

  private loadSavedCustomBackends(): void {
    this.savedCustomBackends = this.configService.getSavedCustomBackends();
  }

  private buildOptions(): void {
    this.options = [];

    // 1. Local (pre-registered)
    const preRegistered = this.configService.getPreRegisteredEndpoints();
    Object.entries(preRegistered).forEach(([key, url]) => {
      this.options.push({
        id: `pre-${key}`,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        url,
        type: 'local',
        badge: undefined
      });
    });

    // 2. URLs depuis WIREMOCK_BACKEND
    const envBackends = this.configService.getWiremockBackends();
    envBackends.forEach((b, i) => {
      this.options.push({
        id: `env-${i}`,
        label: b.label,
        url: b.url,
        type: 'env',
        badge: 'ENV',
        badgeClass: 'badge-env'
      });
    });

    // 3. Saved custom backends
    const customBackends = this.configService.getSavedCustomBackends();
    customBackends.forEach(b => {
      this.options.push({
        id: `custom-${b.id}`,
        label: b.label,
        url: b.url,
        type: 'custom',
        badge: 'custom',
        badgeClass: 'badge-custom',
        customBackendId: b.id
      });
    });
  }

  private applyCurrentConfig(config: WiremockEndpointConfig): void {
    const match = this.options.find(o =>
      o.url === config.url && o.type === config.type
    );
    if (match) {
      this.selectedOptionId = match.id;
      return;
    }
    // Fallback: first option
    if (this.options.length > 0) {
      const defaultOption = this.options[0];
      this.selectedOptionId = defaultOption.id;
      this.configService.setEndpointConfig({ type: defaultOption.type, url: defaultOption.url });
    } else {
      this.selectedOptionId = '';
    }
  }

  onOptionSelect(option: EndpointOption): void {
    this.selectedOptionId = option.id;
    this.configService.setEndpointConfig({ type: option.type, url: option.url });
  }

  saveSettings(): void {
    alert('Settings saved successfully! The page will reload to apply changes.');
    window.location.reload();
  }

  // ---- Custom backend CRUD ----

  addCustomBackend(): void {
    const url = this.newBackendUrl.trim();
    if (!url) return;
    this.configService.addCustomBackend(this.newBackendLabel.trim(), url);
    this.newBackendLabel = '';
    this.newBackendUrl = '';
    this.loadSavedCustomBackends();
    this.buildOptions();
  }

  startEditCustomBackend(backend: CustomBackend): void {
    this.editingBackendId = backend.id;
    this.editingBackendLabel = backend.label;
    this.editingBackendUrl = backend.url;
  }

  saveEditCustomBackend(): void {
    if (!this.editingBackendId) return;
    const url = this.editingBackendUrl.trim();
    if (!url) return;
    this.configService.updateCustomBackend(this.editingBackendId, this.editingBackendLabel.trim(), url);
    this.editingBackendId = null;
    this.loadSavedCustomBackends();
    this.buildOptions();
    // Re-sync selection in case the active URL changed
    this.applyCurrentConfig(this.configService.getEndpointConfig());
  }

  cancelEditCustomBackend(): void {
    this.editingBackendId = null;
  }

  deleteCustomBackend(id: string): void {
    this.configService.deleteCustomBackend(id);
    this.loadSavedCustomBackends();
    this.buildOptions();
    this.applyCurrentConfig(this.configService.getEndpointConfig());
  }
}
