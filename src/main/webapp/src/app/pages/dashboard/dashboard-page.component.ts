import { ChangeDetectorRef, Component, OnInit, OnDestroy, Output, EventEmitter, ViewChild, ElementRef, AfterViewInit, HostListener } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import { switchMap, startWith } from 'rxjs/operators';
import { DashboardService, DashboardStats } from '../../services/dashboard.service';
import { ScenarioService } from '../../services/scenario.service';
import { Scenario } from '../../models/scenario.model';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

Chart.register(...registerables);

// Time range presets - Grafana style
export type TimeRange = '5m' | '15m' | '30m' | '1h' | '3h' | '6h' | '12h' | '24h' | '2d' | '7d' | '30d' | 'custom';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './dashboard-page.component.html',
  styleUrls: ['./dashboard-page.component.scss']
})
export class DashboardPageComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('chartContainer', { static: false }) chartContainer?: ElementRef<HTMLCanvasElement>;
  @Output() navigateToStubs = new EventEmitter<string | null>();
  @Output() navigateToRequests = new EventEmitter<void>();

  stats: DashboardStats | null = null;
  activeScenarios: Scenario[] = [];
  loading = true;
  error: string | null = null;
  private refreshSubscription?: Subscription;

  // Auto-refresh every 30 seconds
  private readonly REFRESH_INTERVAL = 30000;

  // Time range selection - Grafana style
  selectedTimeRange: TimeRange = '24h';
  customStartDate = '';
  customEndDate = '';
  showTimeRangePicker = false;

  // Chart.js
  private chart?: Chart;
  private chartDragStart?: number;

  constructor(
    private dashboardService: DashboardService,
    private scenarioService: ScenarioService,
    private router: Router,
    private route: ActivatedRoute,
    private changeDetectorRef: ChangeDetectorRef
  ) {}

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (this.showTimeRangePicker && !target.closest('.time-range-picker')) {
      this.showTimeRangePicker = false;
    }
  }

  ngOnInit(): void {
    // Read URL parameters on startup
    this.route.queryParams.subscribe(params => {
      if (params['timeRange']) {
        this.selectedTimeRange = params['timeRange'] as TimeRange;
      }
      if (params['from']) {
        this.customStartDate = params['from'];
      }
      if (params['to']) {
        this.customEndDate = params['to'];
      }

      // Load dashboard with restored parameters
      this.loadDashboard();
    });

    this.startAutoRefresh();
  }

  ngAfterViewInit(): void {
    // Chart will be initialized once data is loaded
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
    this.destroyChart();
  }

  loadDashboard(): void {
    this.loading = true;
    this.error = null;

    const startTime = this.getTimeRangeMilliseconds();
    const endTime = this.selectedTimeRange === 'custom' && this.customEndDate
      ? new Date(this.customEndDate).getTime()
      : Date.now();

    this.dashboardService.getDashboardStats(startTime, endTime).subscribe({
      next: (stats) => {
        this.stats = stats;
        // Log dashboard statistics
        console.log('[DASHBOARD] Data loaded:', {
          timeRange: this.getTimeRangeLabel(),
          start: new Date(startTime).toISOString(),
          end: new Date(endTime).toISOString(),
          totalRequests: stats.totalRequests,
          unmatchedRequests: stats.unmatchedRequests,
          requestsByHour: stats.requestsByHour
        });
        this.loading = false;
        this.changeDetectorRef.detectChanges();
        this.updateChart(stats);

        // Load active scenarios
        this.loadActiveScenarios();
      },
      error: (err) => {
        console.error('Error loading dashboard stats:', err);
        this.error = 'Failed to load dashboard statistics';
        this.loading = false;
      }
    });
  }

  loadActiveScenarios(): void {
    this.scenarioService.getAllScenarios().subscribe({
      next: (response) => {
        this.activeScenarios = response.scenarios || [];
      },
      error: (err) => {
        console.warn('Failed to load scenarios for dashboard:', err);
        this.activeScenarios = [];
      }
    });
  }

  startAutoRefresh(): void {
    this.refreshSubscription = interval(this.REFRESH_INTERVAL)
      .pipe(
        startWith(0),
        switchMap(() => {
          const startTime = this.getTimeRangeMilliseconds();
          const endTime = this.selectedTimeRange === 'custom' && this.customEndDate
            ? new Date(this.customEndDate).getTime()
            : Date.now();
          return this.dashboardService.getDashboardStats(startTime, endTime);
        })
      )
      .subscribe({
        next: (stats) => {
          this.stats = stats;
          this.loading = false;
          this.changeDetectorRef.detectChanges();
          this.updateChart(stats);
        },
        error: (err) => {
          console.error('Error refreshing dashboard:', err);
        }
      });
  }

  stopAutoRefresh(): void {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
    }
  }

  getRecordingStatusClass(): string {
    if (!this.stats?.recordingStatus) return 'status-unknown';

    switch (this.stats.recordingStatus.status) {
      case 'Recording':
        return 'status-recording';
      case 'Stopped':
        return 'status-stopped';
      default:
        return 'status-never-started';
    }
  }

  getRecordingStatusText(): string {
    if (!this.stats?.recordingStatus) return 'Unknown';

    switch (this.stats.recordingStatus.status) {
      case 'Recording':
        return 'Recording';
      case 'Stopped':
        return 'Stopped';
      default:
        return 'Never Started';
    }
  }


  refreshDashboard(): void {
    this.loadDashboard();
  }

  getMethodClass(method: string): string {
    return `method-${method.toLowerCase()}`;
  }

  // Time Range Methods - Grafana style
  toggleTimeRangePicker(): void {
    this.showTimeRangePicker = !this.showTimeRangePicker;
  }

  closeTimeRangePicker(): void {
    this.showTimeRangePicker = false;
  }

  selectTimeRange(range: TimeRange): void {
    this.selectedTimeRange = range;

    if (range !== 'custom') {
      this.customStartDate = '';
      this.customEndDate = '';
      this.showTimeRangePicker = false;
      // Debug log
      const startTime = this.getTimeRangeMilliseconds();
      const endTime = Date.now();
      console.log('[DASHBOARD] Quick filter selected:', range, 'start:', new Date(startTime).toISOString(), 'end:', new Date(endTime).toISOString());
      this.updateUrlParams();
      this.loadDashboard();
    }
  }

  applyCustomDateRange(): void {
    if (this.customStartDate && this.customEndDate) {
      this.selectedTimeRange = 'custom';
      this.showTimeRangePicker = false;
      // Debug log
      console.log('[DASHBOARD] Custom filter applied:', this.customStartDate, '→', this.customEndDate);
      this.updateUrlParams();
      this.loadDashboard();
    }
  }

  private updateUrlParams(): void {
    const queryParams: any = { timeRange: this.selectedTimeRange };

    if (this.selectedTimeRange === 'custom') {
      if (this.customStartDate) queryParams.from = this.customStartDate;
      if (this.customEndDate) queryParams.to = this.customEndDate;
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge'
    });
  }

  getTimeRangeLabel(): string {
    switch (this.selectedTimeRange) {
      case '5m': return 'Last 5 minutes';
      case '15m': return 'Last 15 minutes';
      case '30m': return 'Last 30 minutes';
      case '1h': return 'Last 1 hour';
      case '3h': return 'Last 3 hours';
      case '6h': return 'Last 6 hours';
      case '12h': return 'Last 12 hours';
      case '24h': return 'Last 24 hours';
      case '2d': return 'Last 2 days';
      case '7d': return 'Last 7 days';
      case '30d': return 'Last 30 days';
      case 'custom': return 'Custom range';
      default: return 'Last 24 hours';
    }
  }

  getTimeRangeMilliseconds(): number {
    const now = Date.now();
    switch (this.selectedTimeRange) {
      case '5m': return now - 5 * 60 * 1000;
      case '15m': return now - 15 * 60 * 1000;
      case '30m': return now - 30 * 60 * 1000;
      case '1h': return now - 60 * 60 * 1000;
      case '3h': return now - 3 * 60 * 60 * 1000;
      case '6h': return now - 6 * 60 * 60 * 1000;
      case '12h': return now - 12 * 60 * 60 * 1000;
      case '24h': return now - 24 * 60 * 60 * 1000;
      case '2d': return now - 2 * 24 * 60 * 60 * 1000;
      case '7d': return now - 7 * 24 * 60 * 60 * 1000;
      case '30d': return now - 30 * 24 * 60 * 60 * 1000;
      case 'custom':
        if (this.customStartDate) {
          return new Date(this.customStartDate).getTime();
        }
        return now - 24 * 60 * 60 * 1000;
      default: return now - 24 * 60 * 60 * 1000;
    }
  }

  // Navigation methods
  onViewAllStubs(): void {
    this.router.navigate(['/ui/stubs']);
  }

  onViewAllScenarios(): void {
    this.router.navigate(['/ui/scenarios']);
  }

  onScenarioClick(scenarioName: string): void {
    this.router.navigate(['/ui/scenarios'], { queryParams: { scenario: scenarioName } });
  }

  onNavigateToRecording(): void {
    this.router.navigate(['/ui/recording']);
  }

  onViewAllRequests(): void {
    this.router.navigate(['/ui/requests']);
  }

  onEndpointClick(url: string, method: string): void {
    // Navigate to stubs with URL as filter
    this.router.navigate(['/ui/stubs'], {
      queryParams: { url, method }
    });
  }

  onUnusedStubClick(stubId: string): void {
    // Navigate to specific stub
    this.router.navigate(['/ui/stubs', stubId]);
  }

  // Chart Zoom Method
  onChartZoom(startIndex: number, endIndex: number): void {
    // Retrieve timestamps directly from data
    const timestamps = this.stats?.requestsByHour?.map(h => h.timestamp) || [];

    if (startIndex < 0 || endIndex >= timestamps.length) {
      console.warn('[DASHBOARD] Indices de zoom invalides:', { startIndex, endIndex, length: timestamps.length });
      return;
    }

    // Use timestamps from selected data points directly
    const newStartTime = timestamps[startIndex];
    const newEndTime = timestamps[endIndex];

    // Update custom filter
    this.selectedTimeRange = 'custom';
    this.customStartDate = this.formatDateForInput(new Date(newStartTime));
    this.customEndDate = this.formatDateForInput(new Date(newEndTime));

    // Debug log
    console.log('[DASHBOARD] Zoom graphique:', {
      startIndex,
      endIndex,
      startTimestamp: new Date(newStartTime).toISOString(),
      endTimestamp: new Date(newEndTime).toISOString(),
      customStartDate: this.customStartDate,
      customEndDate: this.customEndDate
    });

    // Reload dashboard with new time period
    this.loadDashboard();

    // Close dropdown if open
    this.showTimeRangePicker = false;
  }

  // Helper to format date to datetime-local format
  private formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  // Chart.js Methods
  private initializeChart(stats: DashboardStats): void {
    if (!this.chartContainer) {
      return;
    }

    const timestamps = stats.requestsByHour?.map(h => h.timestamp) || [];
    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels: stats.requestsByHour?.map(h => h.hour) || [],
        datasets: [{
          label: 'Requests',
          data: stats.requestsByHour?.map(h => h.count) || [],
          backgroundColor: '#6366f1',
          hoverBackgroundColor: '#4f46e5',
          borderRadius: 4,
          barPercentage: 0.9,
          categoryPercentage: 0.9
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1e293b',
            titleColor: '#94a3b8',
            bodyColor: '#ffffff',
            callbacks: {
              title: (items) => {
                const timestamp = timestamps[items[0].dataIndex];
                return this.formatChartTimestamp(timestamp);
              },
              label: (item) => `Requests: ${item.raw}`
            }
          }
        },
        scales: {
          x: {
            grid: { color: '#e2e8f0' },
            ticks: { color: '#64748b', font: { size: 11 } }
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Requests', color: '#64748b', font: { size: 12 } },
            grid: { color: '#f1f5f9' },
            ticks: { color: '#64748b' }
          }
        },
        onHover: (_event, elements) => {
          if (this.chartContainer) {
            this.chartContainer.nativeElement.style.cursor = elements.length ? 'pointer' : 'default';
          }
        }
      }
    };

    this.chart = new Chart(this.chartContainer.nativeElement, config);
    this.chartContainer.nativeElement.addEventListener('pointerdown', this.onChartPointerDown);
    this.chartContainer.nativeElement.addEventListener('pointerup', this.onChartPointerUp);
  }

  private updateChart(stats: DashboardStats): void {
    setTimeout(() => {
      if (!this.chartContainer) {
        console.warn('Chart container not available yet');
        return;
      }

      this.destroyChart();
      this.initializeChart(stats);
    }, 50);
  }

  private destroyChart(): void {
    if (this.chartContainer) {
      this.chartContainer.nativeElement.removeEventListener('pointerdown', this.onChartPointerDown);
      this.chartContainer.nativeElement.removeEventListener('pointerup', this.onChartPointerUp);
    }
    this.chart?.destroy();
    this.chart = undefined;
  }

  private readonly onChartPointerDown = (event: PointerEvent): void => {
    this.chartDragStart = this.chart?.scales['x']?.getValueForPixel(event.offsetX);
  };

  private readonly onChartPointerUp = (event: PointerEvent): void => {
    if (this.chartDragStart === undefined || !this.chart) {
      return;
    }

    const dragEnd = this.chart.scales['x']?.getValueForPixel(event.offsetX);
    const startIndex = Math.floor(Math.min(this.chartDragStart, dragEnd ?? this.chartDragStart));
    const endIndex = Math.ceil(Math.max(this.chartDragStart, dragEnd ?? this.chartDragStart));
    this.chartDragStart = undefined;

    if (endIndex > startIndex) {
      this.onChartZoom(startIndex, endIndex);
    }
  };

  private formatChartTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const pad = (value: number, length = 2) => String(value).padStart(length, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
      `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
  }
}
