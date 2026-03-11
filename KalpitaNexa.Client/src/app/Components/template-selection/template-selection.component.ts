import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';

export interface TemplateOption {
  id: string;
  name: string;
  description: string;
  layout: string;
  charts: {
    type: string;
    position: string;
    title: string;
  }[];
  preview?: string;
}

@Component({
  selector: 'app-template-selection',
  templateUrl: './template-selection.component.html',
  styleUrls: ['./template-selection.component.css']
})
export class TemplateSelectionComponent implements OnInit {
  @Input() isDarkTheme: boolean = false;
  @Input() userQuery: string = '';
  @Output() templateSelected = new EventEmitter<{ template: TemplateOption; query: string }>();
  @Output() dynamicSelected = new EventEmitter<string>();
  @Output() cancelled = new EventEmitter<void>();

  selectedTemplate: TemplateOption | null = null;

  templates: TemplateOption[] = [
    {
      id: 'mixed',
      name: 'Mixed Analytics',
      description: 'Perfect for comparing different data types with bar chart, pie chart, line chart, and data table',
      layout: '2×2 Grid',
      charts: [
        { type: 'bar', position: 'top-left', title: 'Bar Chart' },
        { type: 'pie', position: 'top-right', title: 'Pie Chart' },
        { type: 'line', position: 'bottom-left', title: 'Line Chart' },
        { type: 'table', position: 'bottom-right', title: 'Data Table' }
      ]
    },
    {
      id: 'analytics',
      name: 'Analytics Dashboard',
      description: 'Comprehensive view with dual charts and detailed data table for thorough analysis',
      layout: '3×2 Grid',
      charts: [
        { type: 'bar', position: 'left-top', title: 'Primary Chart' },
        { type: 'pie', position: 'left-bottom', title: 'Distribution' },
        { type: 'table', position: 'right-full', title: 'Detailed Data' }
      ]
    }
  ];

  ngOnInit(): void {
    // Auto-select first template by default
    if (this.templates.length > 0) {
      this.selectedTemplate = this.templates[0];
    }
  }

  // selectTemplate(template: TemplateOption): void {
  //   this.selectedTemplate = template;
  // }

  selectTemplate(template: TemplateOption): void {
  // Toggle selection - if clicking the same template, unselect it
  if (this.selectedTemplate?.id === template.id) {
    this.selectedTemplate = null;
  } else {
    this.selectedTemplate = template;
  }
}

  onConfirm(): void {
    if (this.selectedTemplate) {
      this.templateSelected.emit({
        template: this.selectedTemplate,
        query: this.userQuery
      });
    }
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  useDynamicDashboard(): void {
    this.dynamicSelected.emit(this.userQuery);
  }
}
