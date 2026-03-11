import { 
  Component, 
  Input, 
  OnInit, 
  OnDestroy, 
  Output, 
  EventEmitter, 
  HostListener,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  NgZone,
  AfterViewInit,
  ViewChild,
  ElementRef,
  SimpleChanges,
} from '@angular/core';
import { ChatService } from '../../Services/chat.service';
import { Subject, takeUntil, retry, catchError, of, delay, timer } from 'rxjs';
import { ChartConfig } from '../chart/chart.component';


export interface DashboardRequest {
  app_id?: any;
  query: string;
  max_results?: number;
}

export interface DashboardChartData {
  chart_id: string;
  success: boolean;
  error: string | null;
  chart_data: ChartConfig;
  original_query: string;
  chart_type: string;
  citations?: any[];
}

export interface DashboardResponse {
  success: boolean;
  charts_data: DashboardChartData[];
  error: string | null;
  total_charts: number;
  query_processed: string;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() dashboardQuery: string = '';
  @Input() isDarkTheme: boolean = false;
  @Output() dashboardReady = new EventEmitter<void>();
  @Output() errorOccurred = new EventEmitter<string>();
  @Output() maximizeChart = new EventEmitter<ChartConfig>();
  @Output() closeDashboardEvent = new EventEmitter<void>();

  @ViewChild('promptInput') promptInput!: ElementRef<HTMLTextAreaElement>;

   @ViewChild('dashboardContent') dashboardContentRef!: ElementRef;


   sheetChatPrompts: string[] = [];
   inputMessage: string = '';

  dashboardData: DashboardChartData[] = [];
  visibleCharts: DashboardChartData[] = [];
  isLoading: boolean = false;
  hasError: boolean = false;
  errorMessage: string = '';
  totalCharts: number = 0;
  successfulCharts: number = 0;
  
  // Enhanced retry logic
  private destroy$ = new Subject<void>();
  private loadingTimeout: any;
  public retryAttempts: number = 0; // Make public for template access
  public readonly MAX_RETRY_ATTEMPTS = 3; // Make public for template access
  private readonly INITIAL_TIMEOUT = 45000; // 45 seconds
  private readonly MAX_CONCURRENT_CHARTS = 3; // Reduced for better reliability

  // Loading states
  loadingStage: string = '';
  loadingProgress: number = 0;

   isDownloading: boolean = false;

  constructor(
    private chatService: ChatService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    console.log('🚀 Dashboard component initialized');
     this.populateSheetChat(this.dashboardQuery);
  }

   ngOnChanges(changes: SimpleChanges): void {
    if (changes['dashboardQuery']) {
      const queryChange = changes['dashboardQuery'];

      if (!queryChange.firstChange && queryChange.currentValue !== queryChange.previousValue) {
        console.log('📊 Dashboard query changed via input. Regenerating with new query:', queryChange.currentValue);
        
        this.generateDashboard(queryChange.currentValue);
      }
    }
  }

  ngAfterViewInit(): void {
    if (this.dashboardQuery) {
      setTimeout(() => {
        this.generateDashboard(this.dashboardQuery);
      }, 300);
    }
  }

  ngOnDestroy(): void {
    this.cleanup();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private cleanup(): void {
    if (this.loadingTimeout) {
      clearTimeout(this.loadingTimeout);
      this.loadingTimeout = null;
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent): void {
    this.closeDashboard();
  }

    private populateSheetChat(query: string): void {
    const prompts = query.split(/,(?=\s*create|show|generate)| and (?=\s*create|show|generate)/i);
    this.sheetChatPrompts = prompts.map(p => p.trim());
    this.cdr.markForCheck();
  }
sendNewPrompt(): void {
    const message = this.inputMessage.trim();
    if (message) {
      console.log('Regenerating dashboard with new prompt:', message);
      
      // Update the component's query state
      this.dashboardQuery = message;
      
      // Directly call the generation logic instead of emitting an event
      this.generateDashboard(message);
      
      // Clear the input field
      this.inputMessage = '';
      if (this.promptInput) {
        this.promptInput.nativeElement.value = '';
      }
    }
  }
 handlePromptKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendNewPrompt();
    }
  }

  generateDashboard(query: string): void {
     this.populateSheetChat(query);
    if (!query || query.trim() === '') {
      this.showError('Please provide a dashboard query');
      return;
    }

    console.log(`📊 Generating dashboard (attempt ${this.retryAttempts + 1}/${this.MAX_RETRY_ATTEMPTS + 1})`);
    this.resetState();
    this.updateLoadingStage('Preparing dashboard request...');

    const dashboardRequest: DashboardRequest = {
      query: query.trim(),
      max_results: 15
    };

    const currentTimeout = this.INITIAL_TIMEOUT + (this.retryAttempts * 15000);
    
    this.loadingTimeout = setTimeout(() => {
      if (this.isLoading) {
        console.warn(`⚠️ Dashboard generation timeout after ${currentTimeout}ms`);
        this.handleTimeout();
      }
    }, currentTimeout);

    this.updateLoadingStage('Connecting to backend...');
    this.setLoadingProgress(10);

    this.chatService.generateDashboard(dashboardRequest)
      .pipe(
        takeUntil(this.destroy$),
        retry({
          count: 2,
          delay: (error, retryCount) => {
            console.log(`🔄 Retry attempt ${retryCount} after error:`, error);
            this.updateLoadingStage(`Retrying... (${retryCount}/2)`);
            return timer(Math.min(1000 * Math.pow(2, retryCount - 1), 5000));
          }
        }),
        catchError(error => {
          console.error('❌ All retry attempts failed:', error);
          return of(null);
        })
      )
      .subscribe({
        next: (response: DashboardResponse | null) => {
          this.cleanup();
          this.ngZone.run(() => {
            if (response === null) {
              this.handleFinalError();
            } else {
              this.handleDashboardResponse(response);
            }
          });
        },
        error: (error) => {
          this.cleanup();
          this.ngZone.run(() => {
            this.handleFinalError(error);
          });
        }
      });
  }

  private resetState(): void {
    this.isLoading = true;
    this.hasError = false;
    this.errorMessage = '';
    this.dashboardData = [];
    this.visibleCharts = [];
    this.successfulCharts = 0;
    this.loadingProgress = 0;
    this.loadingStage = 'Initializing...';
    this.cdr.markForCheck();
  }

  private updateLoadingStage(stage: string): void {
    this.loadingStage = stage;
    console.log(`📊 Loading stage: ${stage}`);
    this.cdr.markForCheck();
  }

  private setLoadingProgress(progress: number): void {
    this.loadingProgress = Math.min(progress, 100);
    this.cdr.markForCheck();
  }

  private handleTimeout(): void {
    if (this.retryAttempts < this.MAX_RETRY_ATTEMPTS) {
      this.retryAttempts++;
      console.log(`⏰ Timeout occurred, retrying... (${this.retryAttempts}/${this.MAX_RETRY_ATTEMPTS})`);
      
      this.cleanup();
      setTimeout(() => {
        this.generateDashboard(this.dashboardQuery);
      }, 2000);
    } else {
      this.showError(
        'Dashboard generation timed out after multiple attempts. This might be due to:\n\n' +
        '• Backend server overload\n' +
        '• Complex query requiring more processing time\n' +
        '• Network connectivity issues\n' +
        '• Data source unavailability\n\n' +
        'Please try with a simpler query or check your connection.'
      );
    }
  }

  private handleFinalError(error?: any): void {
    this.retryAttempts++;
    
    if (this.retryAttempts <= this.MAX_RETRY_ATTEMPTS) {
      console.log(`🔄 Final error occurred, will show retry option (${this.retryAttempts}/${this.MAX_RETRY_ATTEMPTS})`);
      this.showError(
        `Dashboard generation failed (attempt ${this.retryAttempts}/${this.MAX_RETRY_ATTEMPTS + 1}).\n\n` +
        `${error?.message || 'Unknown error occurred'}\n\n` +
        'Click "Retry Dashboard" to try again.'
      );
    } else {
      this.showError(
        'Dashboard generation failed after multiple attempts.\n\n' +
        'Possible solutions:\n' +
        '• Try a simpler query with fewer chart types\n' +
        '• Check if the backend service is running\n' +
        '• Verify your data sources are accessible\n' +
        '• Check your internet connection\n\n' +
        'If the problem persists, please contact support.'
      );
    }
  }

  private showError(message: string): void {
    this.isLoading = false;
    this.hasError = true;
    this.errorMessage = message;
    this.errorOccurred.emit(message);
    this.cdr.markForCheck();
  }

  private handleDashboardResponse(response: DashboardResponse): void {
    console.log('📊 Dashboard response received:', response);
    this.updateLoadingStage('Processing response...');
    this.setLoadingProgress(60);

    if (!response) {
      this.handleFinalError(new Error('No response received from server'));
      return;
    }

    if (!response.success) {
      this.handleFinalError(new Error(response.error || 'Dashboard generation failed'));
      return;
    }

    this.dashboardData = response.charts_data || [];
    this.totalCharts = response.total_charts || 0;
    this.successfulCharts = this.dashboardData.filter(chart => chart.success).length;

    console.log(`📊 Response analysis: ${this.successfulCharts}/${this.totalCharts} charts successful`);

    if (this.successfulCharts === 0) {
      this.handleFinalError(new Error('No charts could be generated successfully from your query'));
      return;
    }

    this.retryAttempts = 0;
    this.isLoading = false;
    
    this.updateLoadingStage('Loading charts...');
    this.setLoadingProgress(80);
    
    this.loadChartsProgressively();
    
    console.log(`✅ Dashboard generated successfully: ${this.successfulCharts}/${this.totalCharts} charts`);
    this.dashboardReady.emit();
    this.cdr.markForCheck();
  }





  private loadChartsProgressively(): void {
    const batchSize = this.MAX_CONCURRENT_CHARTS;
    const totalBatches = Math.ceil(this.dashboardData.length / batchSize);
    
    let currentBatch = 0;
    
    const loadNextBatch = () => {
      if (currentBatch >= totalBatches || this.isDestroyed) {
        this.setLoadingProgress(100);
        this.updateLoadingStage('Complete!');
        return;
      }
      
      const startIndex = currentBatch * batchSize;
      const endIndex = Math.min(startIndex + batchSize, this.dashboardData.length);
      const batchCharts = this.dashboardData.slice(startIndex, endIndex);
      
      this.visibleCharts = [...this.visibleCharts, ...batchCharts];
      
      const progress = 80 + ((currentBatch + 1) / totalBatches) * 20;
      this.setLoadingProgress(progress);
      this.updateLoadingStage(`Loaded ${this.visibleCharts.length}/${this.dashboardData.length} charts`);
      
      console.log(`📊 Batch ${currentBatch + 1}/${totalBatches} loaded: ${batchCharts.length} charts`);
      
      this.cdr.markForCheck();
      currentBatch++;
      
      if (currentBatch < totalBatches) {
        setTimeout(() => {
          this.ngZone.runOutsideAngular(() => {
            setTimeout(() => {
              this.ngZone.run(() => {
                loadNextBatch();
              });
            }, 500);
          });
        }, 0);
      }
    };
    
    loadNextBatch();
  }

  // Template helper methods
  getSuccessfulChartsCount(): number {
    return this.visibleCharts.filter(chart => chart.success).length;
  }

  getRemainingChartsCount(): number {
    return Math.max(0, this.dashboardData.length - this.visibleCharts.length);
  }

  getLoadingProgressPercent(): number {
    if (this.dashboardData.length === 0) return this.loadingProgress;
    return Math.max(this.loadingProgress, (this.visibleCharts.length / this.dashboardData.length) * 100);
  }

  hasRemainingCharts(): boolean {
    return this.visibleCharts.length < this.dashboardData.length;
  }

  canRetry(): boolean {
    return this.retryAttempts <= this.MAX_RETRY_ATTEMPTS;
  }

  getRetryButtonText(): string {
    if (this.retryAttempts === 0) return 'Retry Dashboard';
    return `Retry Dashboard (${this.retryAttempts}/${this.MAX_RETRY_ATTEMPTS + 1})`;
  }

  getRetryAttemptText(): string {
    return `${this.retryAttempts}/${this.MAX_RETRY_ATTEMPTS}`;
  }

  shouldShowRetryIndicator(): boolean {
    return this.retryAttempts > 0 && this.isLoading;
  }

  // Grid and display methods
  getDynamicGridClass(): string {
    const totalCharts = this.visibleCharts.length;
    
    if (totalCharts <= 1) return 'grid-1';
    if (totalCharts === 2) return 'grid-2';
    if (totalCharts === 3) return 'grid-3';
    if (totalCharts === 4) return 'grid-4';
    if (totalCharts === 5) return 'grid-5';
    if (totalCharts === 6) return 'grid-6';
    return 'grid-many';
  }

  getGridLayout(): string {
    const totalCharts = this.dashboardData.length;
    
    if (totalCharts <= 1) return '1×1';
    if (totalCharts === 2) return '2×1';
    if (totalCharts === 3) return '2×2 (3)';
    if (totalCharts === 4) return '2×2';
    if (totalCharts === 5) return '3×2 (5)';
    if (totalCharts === 6) return '3×2';
    return `${Math.ceil(Math.sqrt(totalCharts))}×${Math.ceil(totalCharts / Math.ceil(Math.sqrt(totalCharts)))}`;
  }

  getChartItemClass(index: number): string {
    return `chart-item-${index + 1}`;
  }

  // Event handlers
  onMaximizeChart(chartData: ChartConfig): void {
    console.log('📊 Maximizing chart from dashboard');
    this.maximizeChart.emit(chartData);
  }

  closeDashboard(): void {
    console.log('📊 Closing dashboard');
    this.closeDashboardEvent.emit();
  }

  retryDashboard(): void {
    console.log('🔄 Manual retry triggered');
    if (this.dashboardQuery) {
      this.generateDashboard(this.dashboardQuery);
    }
  }

  getCurrentTime(): Date {
    return new Date();
  }

  downloadAllCharts(): void {
    console.log('📥 Downloading all charts...');
    
    const successfulCharts = this.visibleCharts.filter(chart => chart.success);
    
    if (successfulCharts.length === 0) {
      console.warn('⚠️ No successful charts to download');
      return;
    }

    successfulCharts.forEach((chartItem, index) => {
      setTimeout(() => {
        try {
          const chartElements = document.querySelectorAll('app-chart canvas');
          if (chartElements[index]) {
            const chartCanvas = chartElements[index] as HTMLCanvasElement;
            const link = document.createElement('a');
            link.download = `${chartItem.chart_data.title?.replace(/\s+/g, '_').toLowerCase() || 'chart_' + (index + 1)}.png`;
            link.href = chartCanvas.toDataURL('image/png', 1.0);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
        } catch (error) {
          console.error(`Error downloading chart ${index + 1}:`, error);
        }
      }, index * 500);
    });
    
    setTimeout(() => {
      console.log('✅ All charts download initiated');
    }, successfulCharts.length * 500);
  }

  getCurrentChartProgress(): number {
    return Math.min(this.visibleCharts.filter(c => c.success).length + 1, this.totalCharts);
  }

  trackByChartId(index: number, item: DashboardChartData): string {
    return item.chart_id;
  }

  private get isDestroyed(): boolean {
    return this.destroy$.closed;
  }
}