import { Component, Input, OnInit, OnDestroy, Output, EventEmitter, HostListener } from '@angular/core';
import { ChatService } from '../../Services/chat.service';
import { Subject, takeUntil, forkJoin } from 'rxjs';
import { ChartConfig } from '../chart/chart.component';
import { TemplateOption } from '../template-selection/template-selection.component';
import { DashboardChartData, DashboardRequest, DashboardResponse } from '../dashboard/dashboard.component';

export interface TableData {
  headers: string[];
  rows: string[][];
}

export interface PredefinedChartData {
  chart_id: string;
  success: boolean;
  error: string | null;
  chart_data: ChartConfig | null;
  table_data?: TableData | null;
  original_query: string;
  chart_type: string;
  position: string;
}

export interface PredefinedDashboardResponse {
  success: boolean;
  charts_data: PredefinedChartData[];
  error: string | null;
  total_charts: number;
  query_processed: string;
  template_used: string;
}

@Component({
  selector: 'app-predefined-dashboard',
  templateUrl: './predefined-dashboard.component.html',
  styleUrls: ['./predefined-dashboard.component.css']
})
export class PredefinedDashboardComponent implements OnInit, OnDestroy {
  @Input() selectedTemplate!: TemplateOption;
  @Input() dashboardQuery: string = '';
  @Input() isDarkTheme: boolean = false;
  @Output() dashboardReady = new EventEmitter<void>();
  @Output() errorOccurred = new EventEmitter<string>();
  @Output() maximizeChart = new EventEmitter<ChartConfig>();
  @Output() closeDashboardEvent = new EventEmitter<void>();

  dashboardData: PredefinedChartData[] = [];
  isLoading: boolean = false;
  hasError: boolean = false;
  errorMessage: string = '';
  totalCharts: number = 0;
  successfulCharts: number = 0;

  private destroy$ = new Subject<void>();

  constructor(private chatService: ChatService) {}

  ngOnInit(): void {
    console.log('🎯 Predefined Dashboard component initialized with template:', this.selectedTemplate.name);
    if (this.dashboardQuery && this.selectedTemplate) {
      this.generatePredefinedDashboard();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  generatePredefinedDashboard(): void {
    console.log('🎯 Generating predefined dashboard with template:', this.selectedTemplate.id);
    console.log('🎯 Original query:', this.dashboardQuery);
    
    this.isLoading = true;
    this.hasError = false;
    this.errorMessage = '';
    this.dashboardData = [];
    this.successfulCharts = 0;
    this.totalCharts = this.selectedTemplate.charts.length;

    // Create dashboard request - same as dynamic dashboard
    const dashboardRequest: DashboardRequest = {
      query: this.dashboardQuery.trim(),
      max_results: 20
    };

    console.log('🎯 Using dynamic dashboard endpoint with request:', dashboardRequest);

    // Use the same endpoint as dynamic dashboard
    this.chatService.generateDashboard(dashboardRequest)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: DashboardResponse) => {
          this.isLoading = false;
          this.processDashboardResponse(response);
        },
        error: (error) => {
          this.isLoading = false;
          this.hasError = true;
          this.errorMessage = `Failed to generate predefined dashboard: ${error.message || 'Unknown error'}`;
          console.error('❌ Predefined dashboard generation error:', error);
          this.errorOccurred.emit(this.errorMessage);
        }
      });
  }

  private processDashboardResponse(response: DashboardResponse): void {
  console.log('🎯 Processing dashboard response for predefined template:', response);

  if (!response || !response.success) {
    this.hasError = true;
    this.errorMessage = response?.error || 'Dashboard generation failed';
    this.errorOccurred.emit(this.errorMessage);
    return;
  }

  const dynamicCharts = response.charts_data || [];
  
  if (dynamicCharts.length === 0) {
    this.hasError = true;
    this.errorMessage = 'No charts could be generated from the query';
    this.errorOccurred.emit(this.errorMessage);
    return;
  }

  console.log('🎯 Dynamic charts received:', dynamicCharts.length);

  const finalDashboardData: PredefinedChartData[] = [];
  let chartIndex = 0;

  // Sequentially map received charts to the template's chart slots
  this.selectedTemplate.charts.forEach(templateComponent => {
    if (templateComponent.type !== 'table') {
      const receivedChart = dynamicCharts[chartIndex];
      
      if (receivedChart && receivedChart.success) {
        finalDashboardData.push({
          chart_id: `predefined_${templateComponent.position}`,
          success: true,
          error: null,
          chart_data: {
            ...receivedChart.chart_data,
            // IMPORTANT: Force the chart type to match the template's expectation
            chart_type: templateComponent.type 
          },
          original_query: this.dashboardQuery, // Use the main query for context
          chart_type: templateComponent.type,
          position: templateComponent.position
        });
        chartIndex++; // Move to the next received chart
      } else {
        // If there are not enough charts from the backend, create an error placeholder
        finalDashboardData.push({
          chart_id: `predefined_${templateComponent.position}`,
          success: false,
          error: `No data available for a ${templateComponent.type} chart.`,
          chart_data: null,
          original_query: `(No query for ${templateComponent.type})`,
          chart_type: templateComponent.type,
          position: templateComponent.position
        });
      }
    }
  });
  
  this.dashboardData = finalDashboardData;
  this.successfulCharts = this.dashboardData.filter(c => c.success).length;

  // Handle table data separately if the template requires it
  if (this.selectedTemplate.charts.some(c => c.type === 'table')) {
    this.generateTableDataFromResponse(response);
  }

  console.log(`✅ Predefined dashboard generated: ${this.successfulCharts}/${this.totalCharts} components successful`);
  this.dashboardReady.emit();
}

  private mapToTemplateStructure(dynamicCharts: DashboardChartData[]): PredefinedChartData[] {
    const mappedData: PredefinedChartData[] = [];

    // Create a map of chart types from dynamic response
    const chartTypeMap: { [key: string]: DashboardChartData } = {};
    dynamicCharts.forEach(chart => {
      if (chart.success && chart.chart_data) {
        // Use the first chart of each type
        if (!chartTypeMap[chart.chart_type]) {
          chartTypeMap[chart.chart_type] = chart;
        }
      }
    });

    console.log('🎯 Available chart types from dynamic response:', Object.keys(chartTypeMap));

    // Map template requirements to available charts
    this.selectedTemplate.charts.forEach((templateChart, index) => {
      if (templateChart.type === 'table') {
        // Handle table separately
        return;
      }

      const matchingChart = chartTypeMap[templateChart.type];
      
      if (matchingChart) {
        // Use the matching chart
        const predefinedChart: PredefinedChartData = {
          chart_id: `predefined_${templateChart.type}_${index}`,
          success: true,
          error: null,
          chart_data: matchingChart.chart_data,
          original_query: matchingChart.original_query,
          chart_type: templateChart.type,
          position: templateChart.position
        };
        mappedData.push(predefinedChart);
      } else {
        // No matching chart found, use the first available chart or create placeholder
        const fallbackChart = dynamicCharts.find(chart => chart.success);
        
        if (fallbackChart) {
          console.log(`🎯 Using fallback chart for ${templateChart.type}:`, fallbackChart.chart_type);
          const predefinedChart: PredefinedChartData = {
            chart_id: `predefined_${templateChart.type}_${index}`,
            success: true,
            error: null,
            chart_data: {
              ...fallbackChart.chart_data,
              chart_type: templateChart.type // Override chart type for consistent styling
            },
            original_query: fallbackChart.original_query,
            chart_type: templateChart.type,
            position: templateChart.position
          };
          mappedData.push(predefinedChart);
        } else {
          // Create error placeholder
          const errorChart: PredefinedChartData = {
            chart_id: `predefined_${templateChart.type}_${index}`,
            success: false,
            error: `No data available for ${templateChart.type} chart`,
            chart_data: null,
            original_query: this.dashboardQuery,
            chart_type: templateChart.type,
            position: templateChart.position
          };
          mappedData.push(errorChart);
        }
      }
    });

    return mappedData;
  }

  private generateTableDataFromResponse(response: DashboardResponse): void {
    // Find a table chart in the dashboard data or create one from citations
    const tableChart: PredefinedChartData = {
      chart_id: 'predefined_table_0',
      success: true,
      error: null,
      chart_data: null,
      table_data: this.createTableFromDashboardData(response),
      original_query: this.dashboardQuery,
      chart_type: 'table',
      position: 'table'
    };

    this.dashboardData.push(tableChart);
    if (tableChart.table_data) {
      this.successfulCharts++;
    }
  }

  private createTableFromDashboardData(response: DashboardResponse): TableData {
    // Extract data from successful charts to create table
    const tableData: TableData = {
      headers: ['Chart Type', 'Title', 'Data Points'],
      rows: []
    };

    response.charts_data?.forEach(chart => {
      if (chart.success && chart.chart_data) {
        const dataCount = chart.chart_data.datasets?.[0]?.data?.length || 0;
        tableData.rows.push([
          chart.chart_type.toUpperCase(),
          chart.chart_data.title || 'Untitled Chart',
          dataCount.toString()
        ]);
      }
    });

    // Add sample data if no charts available
    if (tableData.rows.length === 0) {
      tableData.rows = [
        ['Sample Data 1', 'JavaScript Skills', '15'],
        ['Sample Data 2', 'Python Skills', '12'],
        ['Sample Data 3', 'Java Skills', '8']
      ];
    }

    return tableData;
  }

  getTemplateGridClass(): string {
    return `template-${this.selectedTemplate.id}`;
  }

  getChartByType(chartType: string): PredefinedChartData | null {
    return this.dashboardData.find(chart => 
      chart.chart_type === chartType && chart.chart_data
    ) || null;
  }

  getTableData(): { table_data: TableData | null } | null {
    const tableChart = this.dashboardData.find(chart => chart.chart_type === 'table');
    return tableChart ? { table_data: tableChart.table_data || null } : null;
  }

  onMaximizeChart(chartData: ChartConfig): void {
    console.log('🎯 Maximizing chart from predefined dashboard');
    this.maximizeChart.emit(chartData);
  }

  closeDashboard(): void {
    console.log('🎯 Closing predefined dashboard');
    this.closeDashboardEvent.emit();
  }

  retryDashboard(): void {
    if (this.dashboardQuery && this.selectedTemplate) {
      this.generatePredefinedDashboard();
    }
  }

  getCurrentTime(): Date {
    return new Date();
  }

  // downloadTemplate(): void {
  //   console.log('📥 Starting template download...');
    
  //   if (!this.dashboardData || this.dashboardData.length === 0) {
  //     console.warn('No dashboard data available for download');
  //     this.showNotification('No data available to download', 'warning');
  //     return;
  //   }

  //   try {
  //     // Create the download data structure
  //     const downloadData = this.createDownloadData();
      
  //     // Generate filename with timestamp
  //     const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  //     const filename = `${this.selectedTemplate.name.replace(/\s+/g, '_')}_Dashboard_${timestamp}.json`;
      
  //     // Create and download the file
  //     this.downloadAsFile(downloadData, filename, 'application/json');
      
  //     console.log('✅ Template download completed successfully');
  //     this.showNotification('Template downloaded successfully!', 'success');
      
  //   } catch (error) {
  //     console.error('❌ Error downloading template:', error);
  //     this.showNotification('Failed to download template', 'error');
  //   }
  // }

  downloadTemplate(): void {
    console.log('📥 Starting template download...');
    
    if (!this.dashboardData || this.dashboardData.length === 0) {
      console.warn('No dashboard data available for download');
      this.showNotification('No data available to download', 'warning');
      return;
    }

    try {
      // Show simple download options
      this.showSimpleDownloadOptions();
      
    } catch (error) {
      console.error('❌ Error downloading template:', error);
      this.showNotification('Failed to download template', 'error');
    }
  }

  private showSimpleDownloadOptions(): void {
    // Create simple download modal
    const modal = document.createElement('div');
    modal.className = 'simple-download-modal';
    modal.innerHTML = `
      <div class="simple-download-overlay">
        <div class="simple-download-container">
          <div class="simple-download-header">
            <h3>📥 Download Dashboard</h3>
            <button class="close-btn" onclick="this.closest('.simple-download-modal').remove()">×</button>
          </div>
          <div class="simple-download-content">
            <button class="download-btn html-btn" data-type="html">
              <i class="fas fa-file-code"></i>
              <span>Download as HTML Dashboard</span>
            </button>
            <button class="download-btn pdf-btn" data-type="pdf">
              <i class="fas fa-file-pdf"></i>
              <span>Download as PDF Report</span>
            </button>
          </div>
        </div>
      </div>
    `;

    // Add modal styles
    const styles = document.createElement('style');
    styles.textContent = `
      .simple-download-modal {
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.7); z-index: 10003;
        display: flex; align-items: center; justify-content: center; padding: 20px;
      }
      .simple-download-overlay {
        background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        max-width: 400px; width: 100%; animation: slideIn 0.3s ease-out;
      }
      .simple-download-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 20px; border-bottom: 1px solid #e5e7eb;
      }
      .simple-download-header h3 { margin: 0; color: #1f2937; font-size: 18px; }
      .close-btn {
        background: #f3f4f6; border: none; border-radius: 50%; width: 32px; height: 32px;
        display: flex; align-items: center; justify-content: center; cursor: pointer;
        font-size: 16px; color: #6b7280;
      }
      .close-btn:hover { background: #e5e7eb; }
      .simple-download-content { padding: 20px; display: flex; flex-direction: column; gap: 12px; }
      .download-btn {
        display: flex; align-items: center; gap: 12px; padding: 16px 20px;
        border: 2px solid #667eea; border-radius: 8px; background: white;
        cursor: pointer; transition: all 0.2s ease; font-size: 16px; font-weight: 600;
      }
      .download-btn:hover { background: #667eea; color: white; }
      .download-btn i { font-size: 20px; }
      .pdf-btn { border-color: #ef4444; }
      .pdf-btn:hover { background: #ef4444; }
      @keyframes slideIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
    `;

    modal.appendChild(styles);
    document.body.appendChild(modal);

    // Add click handlers
    modal.querySelectorAll('.download-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = (e.currentTarget as HTMLElement).getAttribute('data-type');
        modal.remove();
        this.handleSimpleDownload(type!);
      });
    });

    // Close on overlay click
    modal.querySelector('.simple-download-overlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) modal.remove();
    });
  }



  private handleSimpleDownload(type: string): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `${this.selectedTemplate.name.replace(/\s+/g, '_')}_Dashboard_${timestamp}`;

    if (type === 'html') {
      this.downloadCompleteHTML(filename);
    } else if (type === 'pdf') {
      this.downloadAsPDF(filename);
    }
  }

  private downloadCompleteHTML(filename: string): void {
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.selectedTemplate.name} Dashboard</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.min.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1f2937; line-height: 1.6; }
        .dashboard { max-width: 1400px; margin: 0 auto; padding: 20px; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; padding: 20px; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); }
        .title { font-size: 28px; font-weight: 700; color: #1f2937; display: flex; align-items: center; gap: 12px; }
        .title i { color: #667eea; }
        .info { display: flex; gap: 16px; }
        .info-item { display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: #667eea; color: white; border-radius: 20px; font-weight: 600; font-size: 14px; }
        .grid { display: grid; gap: 20px; margin-bottom: 30px; grid-template-columns: 1fr 1fr; grid-template-rows: 400px 400px; }
        .chart-box { background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); overflow: hidden; transition: transform 0.2s ease; }
        .chart-box:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15); }
        .chart-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background: #f8fafc; }
        .chart-title { font-size: 16px; font-weight: 600; color: #374151; }
        .badge { padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
        .badge-bar { background: #dbeafe; color: #1e40af; }
        .badge-pie { background: #fef3c7; color: #92400e; }
        .badge-line { background: #d1fae5; color: #065f46; }
        .badge-table { background: #f3e8ff; color: #7c3aed; }
        .chart-content { padding: 20px; height: calc(100% - 60px); }
        .table-wrapper { padding: 16px; overflow: auto; max-height: 340px; }
        .data-table { width: 100%; border-collapse: collapse; font-size: 14px; }
        .data-table th, .data-table td { padding: 12px 8px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        .data-table th { background: #f8fafc; font-weight: 600; color: #374151; position: sticky; top: 0; }
        .data-table td { color: #6b7280; }
        .data-table tr:hover { background: #f9fafb; }
        .footer { text-align: center; padding: 20px; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); color: #6b7280; }
        .footer p { margin: 8px 0; }
        @media (max-width: 768px) { .grid { grid-template-columns: 1fr; grid-template-rows: repeat(auto, 400px); } .header { flex-direction: column; gap: 16px; text-align: center; } .info { flex-direction: column; } }
    </style>
</head>
<body>
    <div class="dashboard">
        <div class="header">
            <h1 class="title"><i class="fas fa-chart-line"></i>${this.selectedTemplate.name} Dashboard</h1>
            <div class="info">
                <span class="info-item"><i class="fas fa-calendar"></i>Generated: ${new Date().toLocaleDateString()}</span>
                <span class="info-item"><i class="fas fa-chart-bar"></i>${this.successfulCharts}/${this.totalCharts} Components</span>
            </div>
        </div>
        
        <div class="grid">
            ${this.generateSimpleHTMLCharts()}
        </div>
        
        <div class="footer">
            <p><i class="fas fa-info-circle"></i> Dashboard generated from: "${this.dashboardQuery}"</p>
            <p><strong>Template: ${this.selectedTemplate.name} (${this.selectedTemplate.layout})</strong></p>
        </div>
    </div>
    
    <script>
        const charts = ${JSON.stringify(this.dashboardData)};
        document.addEventListener('DOMContentLoaded', function() {
            charts.forEach((chart, i) => {
                if (chart.success && chart.chart_data && chart.chart_type !== 'table') {
                    const canvas = document.getElementById('chart-' + i);
                    if (canvas) {
                        new Chart(canvas, {
                            type: chart.chart_data.chart_config.type,
                            data: { labels: chart.chart_data.labels, datasets: chart.chart_data.datasets },
                            options: chart.chart_data.chart_config.options
                        });
                    }
                }
            });
        });
    </script>
</body>
</html>`;

    this.downloadAsFile(htmlContent, `${filename}.html`, 'text/html');
    this.showNotification('HTML Dashboard downloaded successfully!', 'success');
  }

  private generateSimpleHTMLCharts(): string {
    let html = '';
    this.dashboardData.forEach((chart, i) => {
      if (chart.chart_type === 'table' && chart.table_data) {
        html += `<div class="chart-box">
          <div class="chart-header">
            <h3 class="chart-title">Data Table</h3>
            <span class="badge badge-table">TABLE</span>
          </div>
          <div class="table-wrapper">
            <table class="data-table">
              <thead><tr>${chart.table_data.headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
              <tbody>${chart.table_data.rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>
            </table>
          </div>
        </div>`;
      } else if (chart.success && chart.chart_data) {
        html += `<div class="chart-box">
          <div class="chart-header">
            <h3 class="chart-title">${chart.chart_data.title || chart.chart_type.toUpperCase() + ' Chart'}</h3>
            <span class="badge badge-${chart.chart_type}">${chart.chart_type.toUpperCase()}</span>
          </div>
          <div class="chart-content">
            <canvas id="chart-${i}" width="400" height="300"></canvas>
          </div>
        </div>`;
      }
    });
    return html;
  }


  

  private downloadAsPDF(filename: string): void {
    const printHTML = this.generatePrintHTML();
    this.downloadAsFile(printHTML, `${filename}_PDF.html`, 'text/html');
    this.showNotification('PDF-ready file downloaded! Open it and use Ctrl+P to print as PDF.', 'success');
  }

  private generatePrintHTML(): string {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${this.selectedTemplate.name} Dashboard Report</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; background: white; color: #333; padding: 20px; }
  .report { max-width: 800px; margin: 0 auto; }
  .report-header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
  .report-title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
  .report-info { font-size: 14px; color: #666; }
  .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
  .chart-item { border: 1px solid #ddd; border-radius: 8px; padding: 15px; break-inside: avoid; }
  .chart-item h3 { font-size: 16px; margin-bottom: 15px; text-align: center; }
  .chart-placeholder { height: 200px; background: #f5f5f5; border: 1px dashed #ccc; display: flex; align-items: center; justify-content: center; color: #999; }
  .data-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .data-table th, .data-table td { padding: 8px; border: 1px solid #ddd; text-align: left; }
  .data-table th { background: #f5f5f5; font-weight: bold; }
  .report-footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; font-size: 12px; color: #666; }
  @media print { body { margin: 0; padding: 10px; } .charts-grid { grid-template-columns: 1fr; } }
</style></head>
<body>
<div class="report">
  <div class="report-header">
    <h1 class="report-title">${this.selectedTemplate.name} Dashboard Report</h1>
    <p class="report-info">Generated on ${new Date().toLocaleDateString()} | Query: "${this.dashboardQuery}"</p>
  </div>
  <div class="charts-grid">
    ${this.dashboardData.map(chart => {
      if (chart.chart_type === 'table' && chart.table_data) {
        return `<div class="chart-item">
          <h3>Data Table</h3>
          <table class="data-table">
            <thead><tr>${chart.table_data.headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
            <tbody>${chart.table_data.rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>`;
      } else if (chart.success && chart.chart_data) {
        return `<div class="chart-item">
          <h3>${chart.chart_data.title || chart.chart_type.toUpperCase() + ' Chart'}</h3>
          <div class="chart-placeholder">[${chart.chart_type.toUpperCase()} CHART]<br>Data: ${chart.chart_data.labels?.join(', ') || 'Chart Data'}</div>
        </div>`;
      }
      return '';
    }).join('')}
  </div>
  <div class="report-footer">
    <p>Dashboard Template: ${this.selectedTemplate.name} (${this.selectedTemplate.layout})</p>
    <p>Components: ${this.successfulCharts}/${this.totalCharts} successful</p>
  </div>
</div>
<script>window.onload = function() { setTimeout(() => window.print(), 1000); };</script>
</body></html>`;
  }




private showNotification(message: string, type: 'success' | 'error' | 'warning'): void {
    // Create a simple notification element
    const notification = document.createElement('div');
    notification.className = `download-notification ${type}`;
    notification.textContent = message;
    
    // Style the notification
    Object.assign(notification.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      padding: '12px 20px',
      borderRadius: '8px',
      color: 'white',
      fontWeight: '600',
      fontSize: '14px',
      zIndex: '10002',
      opacity: '0',
      transform: 'translateY(-20px)',
      transition: 'all 0.3s ease',
      backgroundColor: type === 'success' ? '#10b981' : 
                      type === 'error' ? '#ef4444' : '#f59e0b'
    });
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
      notification.style.opacity = '1';
      notification.style.transform = 'translateY(0)';
    }, 100);
    
    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateY(-20px)';
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  private downloadAsFile(data: any, filename: string, mimeType: string): void {
    // Convert data to JSON string with pretty formatting
    const jsonString = JSON.stringify(data, null, 2);
    
    // Create blob
    const blob = new Blob([jsonString], { type: mimeType });
    
    // Create download link
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
  

  onOverlayClick(event: MouseEvent): void {
    // Only close if clicking directly on the overlay (not on the dashboard content)
    if (event.target === event.currentTarget) {
      this.closeDashboard();
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent): void {
    this.closeDashboard();
  }
}