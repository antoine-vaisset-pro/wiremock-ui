import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import { switchMap, startWith } from 'rxjs/operators';
import { ScenarioService } from '../../services/scenario.service';
import { MappingService } from '../../services/mapping.service';
import { Scenario } from '../../models/scenario.model';
import { StubMapping } from '../../models/stub-mapping.model';

interface FlowNode {
  state: string;
  x: number;
  y: number;
  isCurrent: boolean;
}

interface FlowTransition {
  from: string;
  to: string;
  stubName?: string;
}

@Component({
  selector: 'app-scenarios-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './scenarios-page.component.html',
  styleUrls: ['./scenarios-page.component.scss']
})
export class ScenariosPageComponent implements OnInit, OnDestroy {
  scenarios: Scenario[] = [];
  selectedScenario: Scenario | null = null;
  loading = false;
  error: string | null = null;

  // Stubs associated with the selected scenario
  scenarioStubs: StubMapping[] = [];
  loadingStubs = false;

  // Flow diagram
  flowNodes: FlowNode[] = [];
  flowTransitions: FlowTransition[] = [];
  flowTransitionPaths = new Map<string, string>(); // Cache of pre-computed SVG paths
  selectedTransition: FlowTransition | null = null; // Selected transition (edge click)
  highlightedStubIds = new Set<string>(); // IDs of stubs to highlight

  // Change state modal
  showChangeStateModal = false;
  newStateValue = '';
  changeStateError = '';

  // Pending scenario name from query param (applied after scenarios are loaded)
  private pendingScenarioName: string | null = null;

  // Auto-refresh
  private refreshSubscription?: Subscription;
  private readonly REFRESH_INTERVAL = 30000; // 30 secondes

  constructor(
    private scenarioService: ScenarioService,
    private mappingService: MappingService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.pendingScenarioName = params['scenario'] || null;
    });
    this.loadScenarios();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
  }

  loadScenarios(): void {
    this.loading = true;
    this.error = null;

    this.scenarioService.getAllScenarios().subscribe({
      next: (response) => {
        this.scenarios = response.scenarios || [];
        this.loading = false;

        // If a scenario is selected, update it
        if (this.selectedScenario) {
          const updated = this.scenarios.find(s => s.name === this.selectedScenario!.name);
          if (updated) {
            this.selectedScenario = updated;
            this.generateFlowDiagram(updated);
          }
        } else if (this.pendingScenarioName) {
          this.preselectScenarioByName(this.pendingScenarioName);
          this.pendingScenarioName = null;
        }
      },
      error: (err) => {
        console.error('Error loading scenarios:', err);
        this.error = 'Failed to load scenarios. Please check if WireMock is running.';
        this.loading = false;
      }
    });
  }

  startAutoRefresh(): void {
    this.refreshSubscription = interval(this.REFRESH_INTERVAL)
      .pipe(
        startWith(0),
        switchMap(() => this.scenarioService.getAllScenarios())
      )
      .subscribe({
        next: (response) => {
          this.scenarios = response.scenarios || [];

          // Update the selected scenario if needed
          if (this.selectedScenario) {
            const updated = this.scenarios.find(s => s.name === this.selectedScenario!.name);
            if (updated) {
              this.selectedScenario = updated;
              this.generateFlowDiagram(updated);
            }
          }
        },
        error: (err) => {
          console.error('Error refreshing scenarios:', err);
        }
      });
  }

  stopAutoRefresh(): void {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
    }
  }

  selectScenario(scenario: Scenario): void {
    this.selectedScenario = scenario;
    this.loadScenarioStubs(scenario.name);
  }

  preselectScenarioByName(name: string): void {
    const scenario = this.scenarios.find(s => s.name === name);
    if (scenario) {
      this.selectScenario(scenario);
    }
  }

  closeDetails(): void {
    this.selectedScenario = null;
    this.scenarioStubs = [];
  }

  loadScenarioStubs(scenarioName: string): void {
    this.loadingStubs = true;

    // Load all stubs and filter those belonging to the scenario
    this.mappingService.getAllMappingsRaw().subscribe({
      next: (response) => {
        const allMappings = response.mappings || [];
        this.scenarioStubs = allMappings.filter((m: StubMapping) => m.scenarioName === scenarioName);
        this.loadingStubs = false;

        // Generate the diagram with the loaded stubs
        if (this.selectedScenario) {
          this.generateFlowDiagram(this.selectedScenario);
        }
      },
      error: (err) => {
        console.error('Error loading scenario stubs:', err);
        this.loadingStubs = false;
      }
    });
  }

  generateFlowDiagram(scenario: Scenario): void {
    const states = scenario.possibleStates;
    const currentState = scenario.state;

    // Increased size for better visibility
    const centerX = 350;
    const centerY = 280;
    const radius = 180;

    // Toujours placer "Started" en haut (position fixe)
    const startedIndex = states.indexOf('Started');
    const otherStates = states.filter(s => s !== 'Started');
    const angleStep = otherStates.length > 0 ? (2 * Math.PI) / (otherStates.length + 1) : 0;

    this.flowNodes = [];

    // Ajouter "Started" en premier (en haut)
    if (startedIndex >= 0) {
      this.flowNodes.push({
        state: 'Started',
        x: centerX,
        y: centerY - radius,
        isCurrent: currentState === 'Started'
      });
    }

    // Add other states around the circle
    otherStates.forEach((state, index) => {
      const angle = (index + 1) * angleStep - Math.PI / 2;
      this.flowNodes.push({
        state,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        isCurrent: state === currentState
      });
    });

    // Build transitions from stubs (avoid duplicates)
    this.flowTransitions = [];
    const transitionKeys = new Set<string>();

    this.scenarioStubs.forEach(stub => {
      if (stub.requiredScenarioState && stub.newScenarioState) {
        const key = `${stub.requiredScenarioState}->${stub.newScenarioState}`;
        if (!transitionKeys.has(key)) {
          transitionKeys.add(key);
          this.flowTransitions.push({
            from: stub.requiredScenarioState,
            to: stub.newScenarioState,
            stubName: stub.name
          });
        }
      }
    });

    // Pre-compute all SVG paths once
    this.flowTransitionPaths.clear();
    this.flowTransitions.forEach(transition => {
      const key = `${transition.from}->${transition.to}`;
      const path = this.calculateTransitionPath(transition);
      this.flowTransitionPaths.set(key, path);
    });

    // Force change detection after pre-computation
    setTimeout(() => {
      this.cdr.detectChanges();
    }, 0);
  }

  getNodePosition(state: string): { x: number, y: number } {
    const node = this.flowNodes.find(n => n.state === state);
    return node ? { x: node.x, y: node.y } : { x: 0, y: 0 };
  }

  isStartedState(state: string): boolean {
    return state === 'Started';
  }

  // Public method for template - uses the cache
  getTransitionPath(transition: FlowTransition): string {
    const key = `${transition.from}->${transition.to}`;
    return this.flowTransitionPaths.get(key) || this.calculateTransitionPath(transition);
  }

  // Private computation method (called once during generation)
  private calculateTransitionPath(transition: FlowTransition): string {
    const nodeRadius = 40;
    const from = this.getNodePosition(transition.from);
    const to = this.getNodePosition(transition.to);

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Self-loop (state to itself)
    if (distance < 10) {
      const loopSize = 60;
      return `M ${from.x + nodeRadius} ${from.y} 
              C ${from.x + nodeRadius + loopSize} ${from.y - loopSize}, 
                ${from.x + nodeRadius + loopSize} ${from.y + loopSize}, 
                ${from.x + nodeRadius} ${from.y}`;
    }

    // Angle of the straight line between centers (for direction)
    const centerAngle = Math.atan2(dy, dx);

    // Start and end points at the circle edges
    const startX = from.x + nodeRadius * Math.cos(centerAngle);
    const startY = from.y + nodeRadius * Math.sin(centerAngle);
    const arrowSpace = 8;
    const endX = to.x - (nodeRadius + arrowSpace) * Math.cos(centerAngle);
    const endY = to.y - (nodeRadius + arrowSpace) * Math.sin(centerAngle);

    // Control point for the curve
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;

    // Reduced perpendicular offset to avoid too much deviation
    const offset = Math.min(40, distance * 0.2);
    const perpAngle = centerAngle + Math.PI / 2;
    const ctrlX = midX + offset * Math.cos(perpAngle);
    const ctrlY = midY + offset * Math.sin(perpAngle);

    return `M ${startX} ${startY} Q ${ctrlX} ${ctrlY} ${endX} ${endY}`;
  }

  openChangeStateModal(): void {
    if (!this.selectedScenario) return;
    this.newStateValue = this.selectedScenario.state;
    this.showChangeStateModal = true;
    this.changeStateError = '';
  }

  closeChangeStateModal(): void {
    this.showChangeStateModal = false;
    this.newStateValue = '';
    this.changeStateError = '';
  }

  submitStateChange(): void {
    if (!this.selectedScenario || !this.newStateValue) {
      this.changeStateError = 'Please select a state';
      return;
    }

    this.scenarioService.setScenarioState(this.selectedScenario.name, this.newStateValue).subscribe({
      next: () => {
        console.log(`Scenario state changed to: ${this.newStateValue}`);
        this.closeChangeStateModal();
        this.loadScenarios();
      },
      error: (err) => {
        this.changeStateError = 'Failed to change state: ' + (err.error?.message || err.message);
        console.error('Error changing scenario state:', err);
      }
    });
  }

  resetAllScenarios(): void {
    if (!confirm('Reset all scenarios to their initial state (Started)?')) {
      return;
    }

    this.scenarioService.resetAllScenarios().subscribe({
      next: () => {
        console.log('All scenarios reset');
        this.loadScenarios();
      },
      error: (err) => {
        alert('Failed to reset scenarios: ' + (err.error?.message || err.message));
        console.error('Error resetting scenarios:', err);
      }
    });
  }

  navigateToStub(stubId: string): void {
    this.router.navigate(['/ui/stubs', stubId]);
  }

  onTransitionClick(transition: FlowTransition): void {
    // Toggle selection
    if (this.selectedTransition === transition) {
      // Deselect
      this.selectedTransition = null;
      this.highlightedStubIds.clear();
    } else {
      // Select and find matching stubs
      this.selectedTransition = transition;
      this.highlightedStubIds.clear();

      // Find all stubs matching this transition
      this.scenarioStubs.forEach(stub => {
        if (stub.requiredScenarioState === transition.from &&
            stub.newScenarioState === transition.to) {
          const stubId = stub.uuid || stub.id;
          if (stubId) {
            this.highlightedStubIds.add(stubId);
          }
        }
      });

      // Scroll to the first highlighted stub
      if (this.highlightedStubIds.size > 0) {
        setTimeout(() => {
          const firstHighlightedId = Array.from(this.highlightedStubIds)[0];
          const element = document.getElementById(`stub-${firstHighlightedId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      }
    }
  }

  isTransitionSelected(transition: FlowTransition): boolean {
    return this.selectedTransition === transition;
  }

  isStubHighlighted(stub: StubMapping): boolean {
    const stubId = stub.uuid || stub.id;
    return stubId ? this.highlightedStubIds.has(stubId) : false;
  }

  getStubUrl(stub: StubMapping): string {
    return stub.request?.url
      || stub.request?.urlPattern
      || stub.request?.urlPath
      || stub.request?.urlPathPattern
      || '/';
  }
}

