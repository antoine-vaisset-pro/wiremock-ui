import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface HelpSection {
  id: string;
  icon: string;
  title: string;
  hidden: boolean;
}

@Component({
  selector: 'app-help-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './help-page.component.html',
  styleUrls: ['./help-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HelpPageComponent implements OnInit, OnDestroy {
  searchQuery = '';
  activeSection = '';

  sections: HelpSection[] = [
    { id: 'dashboard',        icon: 'fas fa-chart-line',   title: 'Dashboard',              hidden: false },
    { id: 'stubs',            icon: 'fas fa-layer-group',   title: 'Stubs',                  hidden: false },
    { id: 'scenarios',        icon: 'fas fa-sitemap',       title: 'Scenarios',              hidden: false },
    { id: 'requests',         icon: 'fas fa-history',       title: 'Requests',               hidden: false },
    { id: 'requester',        icon: 'fas fa-paper-plane',   title: 'Requester',              hidden: false },
    { id: 'recording',        icon: 'fas fa-circle',        title: 'Recording Studio',       hidden: false },
    { id: 'openapi-generator',icon: 'fas fa-magic',         title: 'OpenAPI Generator',      hidden: false },
    { id: 'settings',         icon: 'fas fa-cog',           title: 'Settings',               hidden: false },
    { id: 'license',          icon: 'fas fa-balance-scale', title: 'License & Credits',      hidden: false },
  ];

  private scrollListener!: () => void;
  private searchTimeout: any;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.scrollListener = () => this.updateActiveSection();
    window.addEventListener('scroll', this.scrollListener, true);
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.scrollListener, true);
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
  }

  onSearchChange(): void {
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.applySearch();
      this.cdr.markForCheck();
    }, 150);
  }

  private applySearch(): void {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) {
      this.sections.forEach(s => s.hidden = false);
      // Remove all highlights
      this.clearHighlights();
      return;
    }
    this.clearHighlights();
    this.sections.forEach(section => {
      const el = document.getElementById(section.id);
      if (!el) { section.hidden = false; return; }
      const text = el.textContent?.toLowerCase() ?? '';
      section.hidden = !text.includes(q);
      if (!section.hidden) {
        this.highlightInElement(el, q);
      }
    });
  }

  private highlightInElement(el: Element, q: string): void {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodesToReplace: { node: Text; parent: Node }[] = [];
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      if (node.nodeValue && node.nodeValue.toLowerCase().includes(q)) {
        nodesToReplace.push({ node, parent: node.parentNode! });
      }
    }
    nodesToReplace.forEach(({ node, parent }) => {
      if ((parent as Element).tagName === 'MARK') return;
      const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      const span = document.createElement('span');
      const text = node.nodeValue ?? '';
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          span.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }
        const mark = document.createElement('mark');
        mark.className = 'search-highlight';
        mark.textContent = match[0];
        span.appendChild(mark);
        lastIndex = regex.lastIndex;
      }
      if (lastIndex < text.length) {
        span.appendChild(document.createTextNode(text.slice(lastIndex)));
      }
      parent.replaceChild(span, node);
    });
  }

  private clearHighlights(): void {
    document.querySelectorAll('.search-highlight').forEach(el => {
      const parent = el.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(el.textContent ?? ''), el);
        (parent as Element).normalize?.();
      }
    });
    // Clean up wrapper spans
    document.querySelectorAll('.help-section span').forEach(span => {
      if (span.childNodes.length === 1 && span.firstChild?.nodeType === Node.TEXT_NODE) {
        span.parentNode?.replaceChild(span.firstChild, span);
      }
    });
  }

  private updateActiveSection(): void {
    const sectionIds = this.sections.map(s => s.id);
    let current = sectionIds[0];
    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= 120) current = id;
      }
    }
    if (this.activeSection !== current) {
      this.activeSection = current;
      this.cdr.markForCheck();
    }
  }

  scrollTo(id: string): void {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.onSearchChange();
  }
}

