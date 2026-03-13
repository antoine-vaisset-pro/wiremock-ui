import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { StubMapping } from '../../../../models/stub-mapping.model';

@Component({
  selector: 'app-stub-list',
  standalone: true,
  imports: [CommonModule, FormsModule, NgbModule],
  templateUrl: './stub-list.component.html',
  styleUrls: ['./stub-list.component.scss']
})
export class StubListComponent implements OnChanges {
  Math = Math;

  @Input() mappings: StubMapping[] = [];
  @Input() selectedMapping: StubMapping | null = null;
  @Input() loading = false;
  @Input() error: string | null = null;
  @Input() searchQuery = '';
  @Input() currentPage = 1;
  @Input() pageSize = 20;
  @Input() totalMappings = 0;
  @Input() selectedStubIds = new Set<string>();

  @Output() stubSelected = new EventEmitter<StubMapping>();
  @Output() searchChanged = new EventEmitter<string>();
  @Output() pageChanged = new EventEmitter<number>();
  @Output() selectionToggled = new EventEmitter<{ uuid: string; event: Event }>();
  @Output() selectAllRequested = new EventEmitter<void>();
  @Output() deselectAllRequested = new EventEmitter<void>();
  @Output() refreshRequested = new EventEmitter<void>();
  @Output() createNewRequested = new EventEmitter<void>();

  // Local copy of searchQuery for two-way binding
  localSearchQuery = '';

  ngOnChanges(): void {
    this.localSearchQuery = this.searchQuery;
  }

  getUrl(mapping: StubMapping): string {
    return mapping.request?.url
      || mapping.request?.urlPattern
      || mapping.request?.urlPath
      || mapping.request?.urlPathPattern
      || '/';
  }

  isStubSelected(uuid: string): boolean {
    return this.selectedStubIds.has(uuid);
  }

  onSearchInput(): void {
    this.searchChanged.emit(this.localSearchQuery);
  }

  clearSearch(): void {
    this.localSearchQuery = '';
    this.searchChanged.emit('');
  }

  onPageChange(page: number): void {
    this.pageChanged.emit(page);
  }

  onStubClick(mapping: StubMapping): void {
    this.stubSelected.emit(mapping);
  }

  onSelectionToggle(uuid: string, event: Event): void {
    this.selectionToggled.emit({ uuid, event });
  }
}
