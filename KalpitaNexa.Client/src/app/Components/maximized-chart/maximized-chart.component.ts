import { Component, Input, Output, EventEmitter } from '@angular/core';
import { ChartConfig } from '../chart/chart.component';

@Component({
  selector: 'app-maximized-chart',
  templateUrl: './maximized-chart.component.html',
  styleUrls: ['./maximized-chart.component.css']
})
export class MaximizedChartComponent {
  @Input() chartData!: ChartConfig;
  @Output() close = new EventEmitter<void>();

  closeMaximizedChart(): void {
    this.close.emit();
  }
}