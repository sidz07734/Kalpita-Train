import { 
  Component, 
  Input, 
  OnInit, 
  OnDestroy, 
  ViewChild, 
  ElementRef, 
  AfterViewInit, 
  ChangeDetectorRef, 
  OnChanges, 
  SimpleChanges, 
  EventEmitter, 
  Output,
  ChangeDetectionStrategy,
  NgZone
} from '@angular/core';
import { 
  Chart, 
  ChartConfiguration, 
  ChartType, 
  ArcElement, 
  BarElement, 
  LineElement, 
  PointElement, 
  CategoryScale, 
  LinearScale, 
  Tooltip, 
  Legend,
  PieController,
  BarController,
  LineController,
  DoughnutController,
  RadarController,
  PolarAreaController,
  ScatterController,
  BubbleController,
  RadialLinearScale
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

// Register ALL necessary controllers and components
Chart.register(
  ArcElement, 
  BarElement, 
  LineElement, 
  PointElement, 
  CategoryScale, 
  LinearScale, 
  RadialLinearScale,
  Tooltip, 
  Legend, 
  ChartDataLabels,
  PieController,
  BarController,
  LineController,
  DoughnutController,
  RadarController,
  PolarAreaController,
  ScatterController,
  BubbleController
);

export interface ChartConfig {
  chart_type: string;
  title: string;
  description: string;
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor: string[];
    borderColor?: string[];
    borderWidth?: number;
  }[];
  options?: any;
  insights?: string[];
}

@Component({
  selector: 'app-chart',
  templateUrl: './chart.component.html',
  styleUrls: ['./chart.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush // Optimize change detection
})
export class ChartComponent implements OnInit, AfterViewInit, OnDestroy, OnChanges {
  @Input() chartData!: ChartConfig;
  @Input() isDarkTheme: boolean = false;
  @Input() isMaximized: boolean = false;
  @ViewChild('chartCanvas', { static: true }) chartCanvas!: ElementRef<HTMLCanvasElement>;
  @Output() maximizeChart = new EventEmitter<ChartConfig>();

  private chartInstance: Chart | null = null;
  private isDestroyed = false;
  private isInitializing = false;
  private initializationTimeout: any;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    console.log('🔧 Chart component initialized');
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['chartData'] && !changes['chartData'].firstChange) {
      console.log('🔄 Chart data changed, updating chart');
      this.updateChart();
    }
  }

  ngAfterViewInit(): void {
    console.log('🎯 After view init - initializing chart');
    this.initializeChart();
    this.setupResizeObserver();
  }

  ngOnDestroy(): void {
    console.log('🗑️ Chart component destroying');
    this.isDestroyed = true;
    this.cleanup();
  }

  private cleanup(): void {
    // Clear any pending timeouts
    if (this.initializationTimeout) {
      clearTimeout(this.initializationTimeout);
      this.initializationTimeout = null;
    }

    // Destroy chart instance
    if (this.chartInstance) {
      try {
        this.chartInstance.destroy();
        console.log('✅ Chart instance destroyed');
      } catch (error) {
        console.warn('⚠️ Error destroying chart:', error);
      }
      this.chartInstance = null;
    }

    // Cleanup resize observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  private setupResizeObserver(): void {
    if (typeof ResizeObserver !== 'undefined' && this.chartCanvas?.nativeElement) {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.chartInstance && !this.isDestroyed) {
          // Debounce resize events
          this.ngZone.runOutsideAngular(() => {
            setTimeout(() => {
              if (this.chartInstance && !this.isDestroyed) {
                this.chartInstance.resize();
              }
            }, 100);
          });
        }
      });
      
      this.resizeObserver.observe(this.chartCanvas.nativeElement);
    }
  }

  private initializeChart(): void {
    if (this.isDestroyed || this.isInitializing) {
      return;
    }

    if (!this.validateChartData()) {
      console.error('❌ Chart data validation failed');
      return;
    }

    if (!this.chartCanvas?.nativeElement) {
      console.error('❌ Canvas element not available');
      return;
    }

    this.isInitializing = true;

    // Use setTimeout to prevent blocking the UI thread
    this.initializationTimeout = setTimeout(() => {
      this.ngZone.runOutsideAngular(() => {
        this.createChart();
        this.isInitializing = false;
      });
    }, 50);
  }

  private updateChart(): void {
    if (!this.chartInstance || this.isDestroyed) {
      this.initializeChart();
      return;
    }

    try {
      const processedData = this.processChartData(this.mapChartType(this.chartData.chart_type));
      
      if (processedData) {
        // Update chart data instead of recreating
        this.chartInstance.data = processedData;
        this.chartInstance.options = this.getChartOptions(this.mapChartType(this.chartData.chart_type));
        
        this.ngZone.runOutsideAngular(() => {
          this.chartInstance!.update('none'); // No animation for updates
        });
        
        console.log('✅ Chart updated successfully');
      }
    } catch (error) {
      console.error('❌ Error updating chart:', error);
      // Fallback to recreation if update fails
      this.cleanup();
      this.initializeChart();
    }
  }

  private validateChartData(): boolean {
    if (!this.chartData) {
      console.error('❌ Chart data is missing');
      return false;
    }

    if (!this.chartData.labels || !Array.isArray(this.chartData.labels) || this.chartData.labels.length === 0) {
      console.error('❌ Chart labels are invalid:', this.chartData.labels);
      return false;
    }

    if (!this.chartData.datasets || !Array.isArray(this.chartData.datasets) || this.chartData.datasets.length === 0) {
      console.error('❌ Chart datasets are invalid:', this.chartData.datasets);
      return false;
    }

    return true;
  }


  private createChart(): void {
    try {
      const canvas = this.chartCanvas.nativeElement;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        console.error('❌ Failed to get canvas context');
        return;
      }

      // Ensure any existing chart is destroyed
      if (this.chartInstance) {
        this.chartInstance.destroy();
        this.chartInstance = null;
      }

      const chartType = this.mapChartType(this.chartData.chart_type);
      const processedData = this.processChartData(chartType);
      
      if (!processedData) {
        console.error('❌ Processed data is invalid');
        return;
      }

      const config: ChartConfiguration = {
        type: chartType as ChartType,
        data: processedData,
        options: this.getChartOptions(chartType),
        plugins: [ChartDataLabels]
      };

      // Create chart instance
      this.chartInstance = new Chart(ctx, config);
      
      console.log('✅ Chart created successfully');
      
      // Update change detection
      this.ngZone.run(() => {
        this.cdr.markForCheck();
      });
      
    } catch (error) {
      console.error('❌ Error creating chart:', error);
      this.createErrorChart();
    }
  }


  


  private createErrorChart(): void {
    const canvas = this.chartCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    try {
      if (this.chartInstance) {
        this.chartInstance.destroy();
        this.chartInstance = null;
      }

      this.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Error'],
          datasets: [{
            label: 'Chart Error',
            data: [1],
            backgroundColor: ['#ff6b6b'],
            borderColor: ['#ff5252'],
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: 'Chart Error - Please Try Again',
              color: '#ff6b6b'
            },
            datalabels: { display: false }
          },
          scales: {
            y: { beginAtZero: true, max: 2 }
          },
          animation: { duration: 0 } // Disable animation for error chart
        }
      });
      
    } catch (error) {
      console.error('❌ Failed to create error chart:', error);
    }
  }

  private processChartData(chartType: string) {
    if (!this.chartData.labels || !this.chartData.datasets) {
      return null;
    }

    try {
      return {
        labels: this.chartData.labels,
        datasets: this.chartData.datasets.map((dataset, index) => {
          const data = dataset.data.map(value => Number(value) || 0);
          const backgroundColor = dataset.backgroundColor || this.generateColors(data.length, index);
          
          return {
            label: dataset.label,
            data,
            backgroundColor,
            borderColor: dataset.borderColor || backgroundColor.map(color => this.darkenColor(color)),
            borderWidth: dataset.borderWidth || 2
          };
        })
      };
    } catch (error) {
      console.error('❌ Error processing chart data:', error);
      return null;
    }
  }



  private getChartOptions(chartType: string): any {
    const isNonCartesian = ['pie', 'doughnut', 'radar', 'polarArea'].includes(chartType);
    
    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 500, // Reduced animation duration
        easing: 'easeInOutQuart'
      },
      interaction: {
        intersect: false, // Improve performance
        mode: 'index' as const
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom' as const,
          labels: {
            padding: 15,
            usePointStyle: true,
            font: { size: 11 },
            filter: (legendItem: any) => {
              // Limit legend items for performance
              return legendItem.text && legendItem.text.length <= 50;
            }
          }
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: 'white',
          bodyColor: 'white',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          animation: { duration: 200 } // Faster tooltip animation
        },
        title: {
          display: true,
          text: this.chartData.title || 'Chart',
          font: { size: 16, weight: 'bold' },
          padding: { top: 10, bottom: 20 }
        },
        datalabels: {
          display: isNonCartesian,
          color: 'white',
          font: { weight: 'bold' as const, size: 10 },
          formatter: (value: number, context: any) => {
            if (!value || value === 0) return '';
            
            if (isNonCartesian && chartType === 'pie') {
              const total = context.dataset.data.reduce((a: number, b: number) => a + (b || 0), 0);
              if (total === 0) return '';
              const percentage = ((value / total) * 100).toFixed(1);
              return `${percentage}%`;
            }
            
            return value.toString();
          }
        }
      },
      layout: {
        padding: { top: 10, bottom: 10, left: 10, right: 10 }
      }
    };

    if (!isNonCartesian) {
      (baseOptions as any).scales = {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value: any) {
              return Number.isInteger(value) ? value : '';
            }
          },
          grid: { color: 'rgba(0, 0, 0, 0.1)' }
        },
        x: {
          grid: { color: 'rgba(0, 0, 0, 0.1)' },
          ticks: { maxRotation: 45, minRotation: 0 }
        }
      };
    }

    return baseOptions;
  }

  private generateColors(count: number, datasetIndex: number = 0): string[] {
    const colorSets = [
      ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'],
      ['#FF9999', '#66B2FF', '#FFDF99', '#66E0E0', '#B399FF', '#FFB366', '#FF9999', '#66E0E0', '#66B7FF', '#B3E0B3']
    ];
    
    const colors = colorSets[datasetIndex % colorSets.length];
    const result = [];
    
    for (let i = 0; i < count; i++) {
      result.push(colors[i % colors.length]);
    }
    
    return result;
  }

  private darkenColor(color: string): string {
    if (color.startsWith('#')) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      
      const darkerR = Math.max(0, r - 30);
      const darkerG = Math.max(0, g - 30);
      const darkerB = Math.max(0, b - 30);
      
      return `#${darkerR.toString(16).padStart(2, '0')}${darkerG.toString(16).padStart(2, '0')}${darkerB.toString(16).padStart(2, '0')}`;
    }
    return color;
  }

  private mapChartType(chartType: string): ChartType {
    const typeMap: { [key: string]: ChartType } = {
      'bar': 'bar',
      'line': 'line',
      'pie': 'pie',
      'doughnut': 'doughnut',
      'radar': 'radar',
      'polarArea': 'polarArea',
      'scatter': 'scatter',
      'bubble': 'bubble'
    };
    
    return typeMap[chartType?.toLowerCase()] || 'bar';
  }

  downloadChart(): void {
    if (!this.chartInstance) {
      console.error('❌ No chart instance available for download');
      return;
    }

    try {
      const canvas = this.chartInstance.canvas;
      const url = canvas.toDataURL('image/png', 1.0);
      const link = document.createElement('a');
      link.download = `${this.chartData.title.replace(/\s+/g, '_').toLowerCase()}_chart.png`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      console.log('✅ Chart downloaded successfully');
    } catch (error) {
      console.error('❌ Error downloading chart:', error);
    }
  }

  openMaximizedChart(chartData: ChartConfig): void {
    console.log('📊 Emitting maximize chart event');
    this.maximizeChart.emit(chartData);
  }

  get hasChartInstance(): boolean {
    return !!this.chartInstance;
  }

  
}