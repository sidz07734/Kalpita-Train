import { 
  Component, 
  Input, 
  OnInit, 
  OnDestroy, 
  Output, 
  EventEmitter, 
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ViewChild,
  ElementRef,
  SimpleChanges
} from '@angular/core';
import { ChatService } from '../../Services/chat.service';
import { Subject, takeUntil, retry, catchError, of } from 'rxjs';
import { ChartConfig } from '../chart/chart.component';

const GENERIC_LAYOUTS = [
  { id: 'auto', name: 'Auto Grid', icon: '▦', containerStyles: { 'display': 'grid', 'grid-template-columns': 'repeat(auto-fit, minmax(350px, 1fr))', 'gap': '20px' } },
  { id: '2col', name: 'Side by Side', icon: '◫', containerStyles: { 'display': 'grid', 'grid-template-columns': '1fr 1fr', 'gap': '20px' } },
  { id: '1col', name: 'Feed View', icon: '▭', containerStyles: { 'display': 'grid', 'grid-template-columns': '1fr', 'gap': '20px' } }
];

export interface DashboardRequest {
  app_id?: any;
  query: string;
  max_results?: number;
   tenant_id?: string | null;     // <-- ADD THIS
  user_role?: string;            // <-- ADD THIS
  user_email?: string | null;    // <-- ADD THIS
  data_sources?: string[]; 
}

export interface DashboardChartData {
  chart_id: string;
  success: boolean;
  error: string | null;
  chart_data: any; 
  original_query: string;
  chart_type: string;
  styles?: any;
}

// Re-added to fix imports in other files
export interface DashboardResponse {
  success: boolean;
  charts_data: DashboardChartData[];
  error: string | null;
  total_charts: number;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent implements OnInit, OnDestroy {
  @Input() dashboardQuery: string = '';
  @Input() isDarkTheme: boolean = false;
  @Output() dashboardReady = new EventEmitter<void>();
  @Output() errorOccurred = new EventEmitter<string>();
  @Output() maximizeChart = new EventEmitter<ChartConfig>();
  @Output() closeDashboardEvent = new EventEmitter<void>();
  @ViewChild('promptInput') promptInput!: ElementRef<HTMLTextAreaElement>;
  @Input() restoredState: any = null;
  @Output() dashboardStateGenerated = new EventEmitter<any>();
  
  sheetChatPrompts: string[] = [];
  inputMessage: string = '';
  dashboardData: DashboardChartData[] =[];
  visibleCharts: DashboardChartData[] =[];
  isLoading: boolean = false;
  hasError: boolean = false;
  errorMessage: string = '';
  public isSidebarOpen: boolean = true;
  // Modal & Layout State
  public showLayoutModal: boolean = false;
  public availableLayouts: any[] = GENERIC_LAYOUTS;
  public dynamicLayoutStyle: any = {};
  public hasSelectedTemplate: boolean = false;
  public loadingStage: string = '';
  public selectedLayoutClass: string = 'layout-auto'; // NEW
  public selectedPalette: string = 'corporate';  
  private destroy$ = new Subject<void>();

  constructor(
    private chatService: ChatService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    console.log('🚀 Dashboard component initialized');
    this.populateSheetChat(this.dashboardQuery);
    
    // CHECK IF WE HAVE SAVED DATA
    if (this.restoredState) {
      console.log('🔄 Restoring previous dashboard state - bypassing modal');
      this.applyRestoredState(this.restoredState);
    } else {
      // New generation: Open the modal immediately
      this.openTemplateSelection();
    }
  }
   ngOnChanges(changes: SimpleChanges): void {
    // Handle the case where the state is restored while the component is still alive
    if (changes['restoredState'] && changes['restoredState'].currentValue) {
      this.applyRestoredState(changes['restoredState'].currentValue);
    } 
    else if (changes['dashboardQuery']) {
      const queryChange = changes['dashboardQuery'];
      if (!queryChange.firstChange && queryChange.currentValue !== queryChange.previousValue && !this.restoredState) {
        console.log('📊 Dashboard query changed. Resetting flow.');
        this.dashboardQuery = queryChange.currentValue;
        this.populateSheetChat(this.dashboardQuery);
        this.openTemplateSelection();
      }
    }
  }

  // ngOnChanges(changes: SimpleChanges): void {
  //   if (changes['dashboardQuery']) {
  //     const queryChange = changes['dashboardQuery'];

  //     // Only if the query actually changed and it's not the very first load
  //     if (!queryChange.firstChange && queryChange.currentValue !== queryChange.previousValue) {
  //       console.log('📊 Dashboard query changed. Resetting flow.');
  //       this.dashboardQuery = queryChange.currentValue;
  //       this.populateSheetChat(this.dashboardQuery);
        
  //       // Don't generate automatically. Force template selection again.
  //       this.openTemplateSelection();
  //     }
  //   }
  // }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  private applyRestoredState(state: any): void {
    this.showLayoutModal = false;
    this.hasSelectedTemplate = true;
    this.isLoading = false;
    
    // Restore all the previously generated visual variables
    this.dashboardData = state.dashboardData;
    this.visibleCharts = state.visibleCharts;
    this.selectedLayoutClass = state.selectedLayoutClass;
    this.selectedPalette = state.selectedPalette;
    this.dynamicLayoutStyle = state.dynamicLayoutStyle;
    
    this.cdr.markForCheck();
  }

  // 4. ADD this method to emit state back to the chat history
  private emitDashboardState(): void {
    this.dashboardStateGenerated.emit({
      dashboardData: this.dashboardData,
      visibleCharts: this.visibleCharts,
      selectedLayoutClass: this.selectedLayoutClass,
      selectedPalette: this.selectedPalette,
      dynamicLayoutStyle: this.dynamicLayoutStyle
    });
  }
  private populateSheetChat(query: string): void {
    if(!query) return;
    const prompts = query.split(/,(?=\s*create|show|generate)| and (?=\s*create|show|generate)/i);
    this.sheetChatPrompts = prompts.map(p => p.trim());
    this.cdr.markForCheck();
  }

  // --- 1. MODAL LOGIC ---
  private openTemplateSelection(): void {
    this.hasSelectedTemplate = false;
    this.isLoading = false; 
    this.visibleCharts =[]; // Clear existing charts so background is empty
    const chartCount = this.estimateChartCount(this.dashboardQuery);
    this.availableLayouts = this.getLayoutsForCount(chartCount); 
    this.showLayoutModal = true; // Show the modal
    this.cdr.markForCheck();
  }
  private estimateChartCount(query: string): number {
    if (!query) return 1;
    const q = query.toLowerCase();
    
    let total = 0;
    const specificMatches = q.match(/(bar|pie|line|doughnut|radar|scatter)\s+chart/g);
    if (specificMatches) total += specificMatches.length;
    
    const tableMatches = q.match(/pivot table|table/g);
    if (tableMatches) total += tableMatches.length;

    if (total === 0 && q.includes('dashboard')) return 4;
    return total === 0 ? 1 : total;
  }

  private getLayoutsForCount(count: number): any[] {
    const svgStyles = `width="36" height="36" stroke="currentColor" stroke-width="1.5" fill="none" rx="2"`;

    if (count <= 1) {
      return [
        { id: '1-full', name: 'Full Screen View', gridClass: 'layout-1-full', palette: 'ocean',
          iconSvg: `<svg viewBox="0 0 24 24" ${svgStyles}><rect x="2" y="4" width="20" height="16" rx="2"/></svg>` }
      ];
    } else if (count === 2) {
      return [
        { id: '2-side', name: 'Side by Side', gridClass: 'layout-2-side', palette: 'corporate',
          iconSvg: `<svg viewBox="0 0 24 24" ${svgStyles}><rect x="2" y="4" width="9" height="16" rx="1"/><rect x="13" y="4" width="9" height="16" rx="1"/></svg>` },
        { id: '2-stack', name: 'Stacked', gridClass: 'layout-2-stack', palette: 'sunset',
          iconSvg: `<svg viewBox="0 0 24 24" ${svgStyles}><rect x="3" y="2" width="18" height="8" rx="1"/><rect x="3" y="14" width="18" height="8" rx="1"/></svg>` }
      ];
    } else if (count === 3) {
      return [
        { id: '3-top2', name: 'Two Top, One Bottom', gridClass: 'layout-3-top2', palette: 'corporate',
          iconSvg: `<svg viewBox="0 0 24 24" ${svgStyles}><rect x="2" y="2" width="9" height="9" rx="1"/><rect x="13" y="2" width="9" height="9" rx="1"/><rect x="2" y="13" width="20" height="9" rx="1"/></svg>` },
        { id: '3-bottom2', name: 'One Top, Two Bottom', gridClass: 'layout-3-bottom2', palette: 'emerald',
          iconSvg: `<svg viewBox="0 0 24 24" ${svgStyles}><rect x="2" y="2" width="20" height="9" rx="1"/><rect x="2" y="13" width="9" height="9" rx="1"/><rect x="13" y="13" width="9" height="9" rx="1"/></svg>` },
        { id: '3-stack', name: 'Three Stacked', gridClass: 'layout-3-stack', palette: 'ocean',
          iconSvg: `<svg viewBox="0 0 24 24" ${svgStyles}><rect x="3" y="1" width="18" height="5" rx="1"/><rect x="3" y="9" width="18" height="5" rx="1"/><rect x="3" y="17" width="18" height="5" rx="1"/></svg>` }
      ];
    } else {
      return [
        { id: '4-grid', name: '2x2 Grid', gridClass: 'layout-4-grid', palette: 'corporate',
          iconSvg: `<svg viewBox="0 0 24 24" ${svgStyles}><rect x="2" y="2" width="9" height="9" rx="1"/><rect x="13" y="2" width="9" height="9" rx="1"/><rect x="2" y="13" width="9" height="9" rx="1"/><rect x="13" y="13" width="9" height="9" rx="1"/></svg>` },
        { id: '4-stack', name: 'All Stacked', gridClass: 'layout-4-stack', palette: 'sunset',
          iconSvg: `<svg viewBox="0 0 24 24" ${svgStyles}><rect x="3" y="2" width="18" height="4" rx="1"/><rect x="3" y="8" width="18" height="4" rx="1"/><rect x="3" y="14" width="18" height="4" rx="1"/><rect x="3" y="20" width="18" height="4" rx="1"/></svg>` }
      ];
    }
  }

  // --- 2. USER SELECTS TEMPLATE (Triggers API) ---
  public selectLayout(layout: any) {
    console.log('✅ Layout Selected:', layout.name);
    this.selectedLayoutClass = layout.gridClass; // NEW
    this.selectedPalette = layout.palette;    
    // Apply layout styles
    this.dynamicLayoutStyle = layout.containerStyles;
    
    // Close modal
    this.showLayoutModal = false;
    this.hasSelectedTemplate = true;

    // NOW trigger the API call using dynamic routing
    this.generateDashboard(this.dashboardQuery);
    
    this.cdr.markForCheck();
  }

  // --- 3. DYNAMIC ROUTING (Auth vs Generic) ---
  generateDashboard(query: string): void {
    if (!query || query.trim() === '') {
      this.showError('Please provide a dashboard query');
      return;
    }

    // Reset UI for loading state
    this.resetState(); 
    this.updateLoadingStage('Connecting to backend...');

    // Detect Context (App or Tenant Name)
    const appName = sessionStorage.getItem('appName')?.toLowerCase() || '';
    const tenantName = sessionStorage.getItem('selectedTenantName')?.toLowerCase() || '';

    if (appName.includes('auth') || tenantName.includes('optimized')) {
      console.log('Routing to Auth Dashboard Logic');
      this.generateAuthDashboard(query.trim());
    } else {
      console.log('Routing to Generic Dashboard Logic');
      this.generateGenericDashboard(query.trim());
    }
  }

  // --- AUTH DASHBOARD LOGIC ---
  private generateAuthDashboard(query: string): void {
    const appId = parseInt(sessionStorage.getItem('appId') || '0', 10);
    const tenantId = sessionStorage.getItem('TenantId') || '';

    this.chatService.getDailyAuthInsights(query, appId, tenantId)
      .pipe(takeUntil(this.destroy$), catchError(error => of(null)))
      .subscribe({
        next: (response: any) => {
          if (!response) {
             this.handleFinalError(new Error('Network error connecting to auth service.'));
             return;
          }
          if (!response.success) {
             this.handleFinalError(new Error(response.error || response.response_text || 'Access Denied or Error'));
             return;
          }
          if (!response.widgets || response.widgets.length === 0) {
             this.handleFinalError(new Error('Query executed, but no matching records were found.'));
             return;
          }

          this.isLoading = false;

          // Convert Daily Auth Widgets into standard ChartConfig format
          this.dashboardData = response.widgets.map((widget: any, index: number) => {
            const mappedChartData = this.mapAuthWidgetToChartConfig(widget);
            
            return {
              chart_id: `auth-chart-${index}`,
              success: true,
              error: null,
              chart_data: mappedChartData,
              original_query: query,
              chart_type: mappedChartData.chart_type,
              styles: {}
            };
          });

          this.visibleCharts = this.dashboardData;
          this.dashboardReady.emit();
          this.emitDashboardState();
          this.cdr.markForCheck();
        },
        error: (err) => this.handleFinalError(err)
      });
  }

  // --- GENERIC VISUALIZATION LOGIC ---
  private generateGenericDashboard(query: string): void {
    const rawAppId = sessionStorage.getItem('appId');
    const safeAppId = (rawAppId && !isNaN(parseInt(rawAppId, 10))) ? parseInt(rawAppId, 10) : null;
    const safeTenantId = sessionStorage.getItem('TenantId') || null;
    const safeUserRole = sessionStorage.getItem('userRole') || 'User';
    const safeUserEmail = sessionStorage.getItem('userEmail') || null;
    const dashboardRequest: DashboardRequest = {
      query: query,
      max_results: 15,
      app_id: safeAppId,
      tenant_id: safeTenantId,
      user_role: safeUserRole,
      user_email: safeUserEmail,
      data_sources: ['all'] 
    };

    this.chatService.generateDashboard(dashboardRequest)
      .pipe(
        takeUntil(this.destroy$),
        retry({ count: 1, delay: 2000 }), 
        catchError(error => of(null))
      )
      .subscribe({
        next: (response: any) => {
          if (!response || !response.success || !response.charts_data?.length) {
            this.handleFinalError(new Error(response?.error || 'No data returned'));
            return;
          }

          this.isLoading = false;
          this.dashboardData = response.charts_data;

          this.visibleCharts = this.dashboardData.map((chart: any) => ({
              ...chart,
              success: chart.success === true, 
              styles: {} 
          }));
          
          this.dashboardReady.emit();
          this.emitDashboardState();
          this.cdr.markForCheck();
        },
        error: (error) => this.handleFinalError(error)
      });
  }

  // --- HELPER: MAP AUTH DATA TO CHART.JS FORMAT ---
 private mapAuthWidgetToChartConfig(widget: any): ChartConfig {
    let mappedType = widget.type || 'bar';
    if (mappedType.includes('line')) mappedType = 'line';
    else if (mappedType.includes('pie')) mappedType = 'pie';
    else if (mappedType.includes('doughnut') || mappedType.includes('donut')) mappedType = 'doughnut';
    else if (mappedType.includes('bar')) mappedType = 'bar';
    else mappedType = 'bar'; // fallback for table/card to chart representation

    const layout = widget.layout || {};
    const rawData: any[] = widget.data || [];
    
    // Extract Keys
    const keys = Object.keys(rawData.length > 0 ? rawData[0] : {});
    const xAxisKey = layout.x_axis || layout.series || keys[0];
    
    const yAxisKeys = (Array.isArray(layout.y_axis) && layout.y_axis.length > 0) 
                      ? layout.y_axis 
                      : keys.filter(k => k !== xAxisKey);

    // Extract Labels -> FIXED: Maps specifically to the row's xAxisKey
    const labels = rawData.map(row => String(row[xAxisKey] || 'N/A'));

    // Extract Datasets -> FIXED: Maps specifically to the row's yKey
    const datasets = yAxisKeys.map((yKey: string) => {
      return {
        label: this.formatTitle(yKey),
        data: rawData.map(row => Number(row[yKey]) || 0),
        backgroundColor: [], // Let the chart component auto-generate colors
        borderWidth: 1
      };
    });

    return {
      chart_type: mappedType,
      title: widget.title || this.formatTitle(yAxisKeys[0] || 'Chart'),
      description: '',
      labels: labels,
      datasets: datasets,
      insights: []
    };
  }

  private formatTitle(key: string): string {
    if (!key) return 'Value';
    return key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  // --- UI STATE HELPERS (Fixing the cut-off functions) ---
  private resetState(): void {
    this.isLoading = true;
    this.hasError = false;
    this.errorMessage = '';
    this.dashboardData = [];
    this.visibleCharts =[];
    this.cdr.markForCheck();
  }

  private updateLoadingStage(stage: string): void {
    this.loadingStage = stage;
    this.cdr.markForCheck();
  }
// --- ERROR HANDLING HELPERS ---
  private handleFinalError(error?: any): void {
    this.isLoading = false;
    this.hasError = true;
    this.errorMessage = error?.message || 'Failed to generate dashboard.';
    this.cdr.markForCheck();
  }

  private showError(message: string): void {
    this.handleFinalError(new Error(message));
  }

  // --- USER INTERACTION HELPERS ---
  sendNewPrompt(): void {
    const message = this.inputMessage.trim();
    if (message) {
      this.dashboardQuery = message;
      this.generateDashboard(message);
      this.inputMessage = '';
      if (this.promptInput) this.promptInput.nativeElement.value = '';
    }
  }

  handlePromptKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendNewPrompt();
    }
  }

  closeDashboard(): void {
    this.closeDashboardEvent.emit();
  }

  retryDashboard(): void {
    if (this.dashboardQuery) {
      this.generateDashboard(this.dashboardQuery);
    }
  }

  onMaximizeChart(chartData: ChartConfig): void {
    this.maximizeChart.emit(chartData);
  }
  
  getChartItemClass(index: number): string {
    return `chart-item-${index + 1}`;
  }
  
  trackByChartId(index: number, item: DashboardChartData): string {
    return item.chart_id;
  }
  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
    this.cdr.markForCheck(); // Trigger UI update
  }
  
}

