import { Component, OnInit, OnDestroy, Output, EventEmitter, ViewChild, ElementRef, AfterViewInit, HostListener } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import { switchMap, startWith } from 'rxjs/operators';
import { DashboardService, DashboardStats } from '../../services/dashboard.service';
import { ScenarioService } from '../../services/scenario.service';
import { Scenario } from '../../models/scenario.model';
import * as Highcharts from 'highcharts';

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
  @ViewChild('chartContainer', { static: false }) chartContainer?: ElementRef;
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

  // Highcharts
  private chart?: Highcharts.Chart;

  constructor(
    private dashboardService: DashboardService,
    private scenarioService: ScenarioService,
    private router: Router,
    private route: ActivatedRoute
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
    if (this.chart) {
      this.chart.destroy();
    }
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
        this.updateChart(stats);
        this.loading = false;

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
          this.updateChart(stats);
          this.loading = false;
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

  // Highcharts Methods
  private initializeChart(stats: DashboardStats): void {
    if (!this.chartContainer) {
      return;
    }

    const categories = stats.requestsByHour?.map(h => h.hour) || [];
    const data = stats.requestsByHour?.map(h => h.count) || [];
    const timestamps = stats.requestsByHour?.map(h => h.timestamp) || [];

    this.chart = Highcharts.chart(this.chartContainer.nativeElement, {
      chart: {
        type: 'column',
        backgroundColor: 'transparent',
        height: 280,
        zoomType: 'x' as any, // Enable horizontal zoom
        resetZoomButton: {
          theme: {
            fill: '#6366f1',
            stroke: '#6366f1',
            style: {
              color: 'white',
              fontWeight: '500'
            },
            r: 4,
            states: {
              hover: {
                fill: '#4f46e5',
                stroke: '#4f46e5'
              }
            }
          },
          position: {
            align: 'right',
            verticalAlign: 'top',
            x: -10,
            y: 10
          }
        },
        events: {
          selection: (event: any) => {
            if (event.xAxis) {
              // User selected a zone to zoom into
              const xAxis = event.xAxis[0];
              const minIndex = Math.floor(xAxis.min);
              const maxIndex = Math.ceil(xAxis.max);

              // Update time filter with indices
              this.onChartZoom(minIndex, maxIndex);

              // Prevent default zoom (data will be reloaded)
              return false;
            }
            return true;
          }
        }
      } as any,
      title: {
        text: ''
      },
      xAxis: {
        categories: categories,
        labels: {
          style: {
            color: '#64748b',
            fontSize: '11px'
          }
        },
        lineColor: '#e2e8f0',
        tickColor: '#e2e8f0'
      },
      yAxis: {
        min: 0,
        title: {
          text: 'Requests',
          style: {
            color: '#64748b',
            fontSize: '12px'
          }
        },
        gridLineColor: '#f1f5f9',
        labels: {
          style: {
            color: '#64748b'
          }
        }
      },
      legend: {
        enabled: false
      },
      plotOptions: {
        column: {
          borderRadius: 4,
          pointPadding: 0.1,
          groupPadding: 0.1,
          dataLabels: {
            enabled: true,
            style: {
              fontSize: '10px',
              fontWeight: 'bold',
              color: '#1e293b',
              textOutline: 'none'
            },
            formatter: function() {
              return this.y && this.y > 0 ? this.y.toString() : '';
            }
          }
        },
        series: {
          animation: {
            duration: 500
          }
        }
      },
      series: [{
        type: 'column',
        name: 'Requests',
        data: data,
        color: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [
            [0, '#6366f1'],
            [1, '#4f46e5']
          ]
        }
      }],
      credits: {
        enabled: false
      },
      tooltip: {
        backgroundColor: '#1e293b',
        borderColor: '#1e293b',
        borderRadius: 8,
        style: {
          color: '#ffffff'
        },
        formatter: function(this: any) {
          // Retrieve the data point timestamp
          const pointIndex = this.point.index;
          const timestamp = timestamps[pointIndex];

          // Format datetime with millisecond precision
          const date = new Date(timestamp);
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          const seconds = String(date.getSeconds()).padStart(2, '0');
          const milliseconds = String(date.getMilliseconds()).padStart(3, '0');

          const fullDatetime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;

          return `<b style="font-size:11px;color:#94a3b8;">${fullDatetime}</b><br/>` +
                 `Requests: <b>${this.y}</b>`;
        }
      }
    });
  }

  private updateChart(stats: DashboardStats): void {
    setTimeout(() => {
      if (!this.chartContainer) {
        console.warn('Chart container not available yet');
        return;
      }

      // Always destroy the existing chart to ensure a clean re-initialization
      if (this.chart) {
        try {
          this.chart.destroy();
        } catch (e) {
          console.warn('Error destroying chart:', e);
        }
        this.chart = undefined;
      }

      // Clear the HTML container to avoid artifacts
      if (this.chartContainer.nativeElement) {
        this.chartContainer.nativeElement.innerHTML = '';
      }

      // Always reinitialize the chart
      this.initializeChart(stats);
    }, 50);
  }
}

