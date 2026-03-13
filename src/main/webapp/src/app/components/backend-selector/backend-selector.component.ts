import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ConfigService, WiremockEndpointConfig, CustomBackend } from '../../services/config.service';

interface SelectorOption {
  value: string;
  label: string;
  group: 'ENV' | 'Local' | 'Custom';
  config: WiremockEndpointConfig;
}

@Component({
  selector: 'app-backend-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './backend-selector.component.html',
  styleUrls: ['./backend-selector.component.scss']
})
export class BackendSelectorComponent implements OnInit, OnDestroy {
  options: SelectorOption[] = [];
  selectedValue = '';

  private subscription: Subscription | null = null;
  private customBackendsSubscription: Subscription | null = null;

  constructor(private configService: ConfigService, private router: Router) {}

  ngOnInit(): void {
    this.buildOptions();
    this.syncSelection(this.configService.getEndpointConfig());

    this.subscription = this.configService.getEndpointConfigObservable().subscribe(config => {
      this.buildOptions();
      this.syncSelection(config);
    });

    this.customBackendsSubscription = this.configService.getCustomBackendsChangedObservable().subscribe(() => {
      this.buildOptions();
      this.syncSelection(this.configService.getEndpointConfig());
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.customBackendsSubscription?.unsubscribe();
  }

  private buildOptions(): void {
    this.options = [];

    // ENV backends
    const envBackends = this.configService.getWiremockBackends();
    envBackends.forEach((b, i) => {
      this.options.push({
        value: `env-${i}`,
        label: `[ENV] ${b.label}`,
        group: 'ENV',
        config: { type: 'env', url: b.url }
      });
    });

    // Pre-registered (local) backends
    const preRegistered = this.configService.getPreRegisteredEndpoints();
    Object.entries(preRegistered).forEach(([key, url]) => {
      this.options.push({
        value: `pre-${key}`,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        group: 'Local',
        config: { type: 'local', url: url as string }
      });
    });

    // Saved custom backends
    const customBackends: CustomBackend[] = this.configService.getSavedCustomBackends();
    customBackends.forEach(b => {
      this.options.push({
        value: `custom-${b.id}`,
        label: `[${b.label}] ${b.url}`,
        group: 'Custom',
        config: { type: 'custom', url: b.url }
      });
    });
  }

  private syncSelection(config: WiremockEndpointConfig): void {
    const match = this.options.find(o => o.config.url === config.url && o.config.type === config.type);
    if (match) {
      this.selectedValue = match.value;
    } else if (this.options.length > 0) {
      this.selectedValue = this.options[0].value;
    }
  }

  get envOptions(): SelectorOption[] {
    return this.options.filter(o => o.group === 'ENV');
  }

  get localOptions(): SelectorOption[] {
    return this.options.filter(o => o.group === 'Local');
  }

  get customOptions(): SelectorOption[] {
    return this.options.filter(o => o.group === 'Custom');
  }

  onSelectionChange(): void {
    const option = this.options.find(o => o.value === this.selectedValue);
    if (option) {
      this.configService.setEndpointConfig(option.config);
      // Reload the current page to refresh the data
      const currentUrl = this.router.url;
      this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
        this.router.navigateByUrl(currentUrl);
      });
    }
  }
}
