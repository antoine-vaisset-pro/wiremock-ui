import { Component, EventEmitter, Input, Output } from '@angular/core';


export type ViewType = 'dashboard' | 'stubs' | 'scenarios' | 'requests' | 'requester' | 'recording' | 'generator' | 'settings' | 'help';

@Component({
  selector: 'app-sidebar-menu',
  standalone: true,
  imports: [],
  templateUrl: './sidebar-menu.component.html',
  styleUrls: ['./sidebar-menu.component.css']
})
export class SidebarMenuComponent {
  @Input() activeView: ViewType = 'stubs';
  @Output() viewChange = new EventEmitter<ViewType>();

  switchView(view: ViewType): void {
    this.viewChange.emit(view);
  }
}
