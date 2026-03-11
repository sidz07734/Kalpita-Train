import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpEventType, HttpResponse } from '@angular/common/http';
import { Observable, throwError, of, Subject } from 'rxjs';
import { catchError, map, takeUntil, timeout, retry, filter } from 'rxjs/operators';
import { DashboardRequest, DashboardResponse } from '../Components/dashboard/dashboard.component';
import { ChatHistoryService, InsertMessageRequest } from './chat-history.service';
import { environment } from 'src/environments/environment';

export interface Citation {
  title: string;
  url?: string;
  filepath?: string;
  content?: string;
  source_type?: string;
  score?: number;
}
export interface LoginRequest {
  email: string;
  password: string;
}
export interface ExternalLoginRequest {
  email: string;
  name: string;
  role: string;
  tenant_id?: string;
  // timestamp: string;
  signature: string;
  app_id: string; // <--- Include App ID
}
export interface UserDetailsResponse {
  success: boolean;
  userId?: string;
  tenantId?: string;
  error?: string;
}

export interface ChangePasswordRequest {
  email: string;
  oldPassword: string;
  newPassword: string;
}

export interface ChangePasswordResponse {
  success: boolean;
  message?: string;
  error?: string; // Mapped from 'detail' in case of HTTPException
}

export interface LoginResponse {
  success: boolean;
  userId?: string;
  TenantId?: string;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  access_token?: string;
  error?: string;
}
export interface SsoLoginRequest {
  token: string;
}

export interface SendOtpRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  otp: string;
  newPassword: string;
}

export interface SuccessResponse {
  success: boolean;
  message?: string;
}
export interface ChatRequest {
  message: string;
  app_id: number;
  tenant_id?: string | null;
  data_sources?: ('sharepoint' | 'sql' | 'brave' | 'all' | 'kalpitapolicy')[];
  debug_mode?: boolean;
  client_id?: string | null;
  user_id_token?: string | null;
  user_role?: string;
  user_email?: string;
  model?: string;
}

export interface ChatResponse {
  success: boolean;
  response?: string;
  citations?: Citation[];
  error?: string;
  is_visualization?: boolean;
  visualization_suggestion?: string;
  follow_up_questions?: string[];
  services_used?: string[];
  is_dashboard?: boolean;
  dashboard_data?: DashboardResponse;
  message_id?: string;
}

export interface SharePointRequest {
  query: string;
  max_results?: number;
  // temperature?: number;
}

export interface SharePointResponse {
  success: boolean;
  content?: string;
  citations?: Citation[];
  error?: string;
  document_count?: number;
  query_processed?: string;
}

export interface SQLRequest {
  query: string;
  max_results?: number;
  // temperature?: number;

  user_role?: string;
  user_email?: string;
}

export interface CandidateInfo {
  name?: string;
  mobile?: string;
  email?: string;
  skills?: string;
  experience?: string;
  organization?: string;
  designation?: string;
  location?: string;
  ctc?: string;
  search_score?: number;
}

export interface SQLResponse {
  success: boolean;
  content?: string;
  candidates?: CandidateInfo[];
  error?: string;
  candidate_count?: number;
  query_processed?: string;
}

export interface BraveSearchRequest {
  query: string;
  max_results?: number;
  search_type?: string;
}

export interface WebResult {
  title: string;
  url: string;
  description?: string;
  search_score?: number;
}

export interface BraveSearchResponse {
  success: boolean;
  content?: string;
  web_results?: WebResult[];
  error?: string;
  results_count?: number;
  query_processed?: string;
}

export interface VisualizationRequest {
  query: string;
  chart_type: string;
  data_sources?: string[];
  max_results?: number;
}


export interface KalpitaPolicyRequest {
  query: string;
  max_results?: number;
  // temperature?: number;
  use_semantic?: boolean;
}

export interface KalpitaPolicyResponse {
  success: boolean;
  content?: string;
  policies?: any[];
  citations?: Citation[];
  error?: string;
  policy_count?: number;
  query_processed?: string;
  search_type?: string;
  follow_up_questions?: string[];
}
export interface UpdateChatFeedbackRequest {
  chat_id: string;
  user_id: string; // This should match the backend model
  tenant_id: string;
  app_id: number;
  feedback: number;
}

export interface UpdateMessageFeedbackResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface VisualizationResponse {
  success: boolean;
  chart_data?: {
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
    options: {
      responsive?: boolean;
      maintainAspectRatio?: boolean;
      plugins?: {
        legend?: { display?: boolean; position?: string };
        tooltip?: { enabled?: boolean };
        title?: { display?: boolean; text?: string };
      };
      scales?: {
        x?: { [key: string]: any };
        y?: { [key: string]: any };
      };
    };
    insights: string[];
  };
  error?: string;
  raw_ai_response?: string;
  query_processed?: string;
  suggested_chart_type?: string;
  data_sources_used?: string[];
}

export interface HealthResponse {
  status: string;
  message: string;
}
export interface ChartVisualizationRequest {
  query: string;
  chart_type: string;
  max_results?: number;
}
export interface ChartDataResponse {
  success: boolean;
  chart_data?: {
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
    options: {
      responsive?: boolean;
      maintainAspectRatio?: boolean;
      plugins?: {
        legend?: { display?: boolean; position?: string };
        tooltip?: { enabled?: boolean };
        title?: { display?: boolean; text?: string };
      };
      scales?: {
        x?: { [key: string]: any };
        y?: { [key: string]: any };
      };
    };
    insights: string[];
  };
  error?: string;
  raw_ai_response?: string;
  query_processed?: string;
  suggested_chart_type?: string;
}
export interface SearchDebugResponse {
  success: boolean;
  debug_info?: any;
  error?: string;
}

export interface RBACRequest {
  message: string;
  client_id: string | null;
  user_id_token: string | null;
  data_sources: ('sharepoint' | 'sql' | 'brave' | 'all')[];
  debug_mode?: boolean;
  user_role: string;
  user_email: string;
}

export interface RBACUploadParams {
  client_id: string;
  user_id_token: string;
  user_role: string;
  user_email: string;
  data_sources?: ('sharepoint' | 'sql' | 'brave' | 'all' | 'kalpitapolicy')[];
  generate_summary?: boolean;
}

export interface TranslationRequest {
  text: string;
  target_language: string;
  source_language?: string;
}

export interface TranslationResponse {
  success: boolean;
  translated_text?: string;
  error?: string;
}

export interface DataSourceInfo {
  data_source_id: number;
  data_source_name: string;
}

export interface ApplicationWithDataSources {
  app_id: number;
  application_name: string;
  data_sources: DataSourceInfo[];
}

export interface GetApplicationsResponse {
  success: boolean;
  applications: ApplicationWithDataSources[];
  error?: string;
}
export interface LanguageItem {
  language_id: number;
  language_name: string;
  language_code: string | null;
}

export interface GetLanguagesResponse {
  success: boolean;
  languages: LanguageItem[];
  total_languages: number;
  error?: string;
}

export interface ModelItem {
  model_id: number;
  model_name: string;
}

export interface GetModelsResponse {
  success: boolean;
  models: ModelItem[];
  total_models: number;
  error?: string;
}

export interface RoleFeatureItem {
  feature_id: number;
  feature_name: string;
}

export interface GetRoleFeaturesResponse {
  success: boolean;
  features: RoleFeatureItem[];
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService implements OnDestroy {
  private apiUrl = environment.apiUrl;
  private destroy$ = new Subject<void>();
  private pendingRequests: Subject<void>[] = [];

  constructor(private http: HttpClient, private chatHistoryService: ChatHistoryService) { }

  ngOnDestroy(): void {
    this.pendingRequests.forEach(req => {
      req.next();
      req.complete();
    });
    this.pendingRequests = [];
    this.destroy$.next();
    this.destroy$.complete();
  }
  private getHeaders(): HttpHeaders {
    let headersConfig: any = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    // Retrieve token from storage (Logic handled in login component)
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');

    if (token) {
      headersConfig['Authorization'] = `Bearer ${token}`;
    }

    return new HttpHeaders(headersConfig);
  }

  private createRequest<T>(observable: Observable<T>): Observable<T> {
    const requestDestroy$ = new Subject<void>();
    this.pendingRequests.push(requestDestroy$);
    return observable.pipe(
      timeout(90000),
      retry(2),
      takeUntil(requestDestroy$),
      takeUntil(this.destroy$),
      catchError((error) => {
        const index = this.pendingRequests.indexOf(requestDestroy$);
        if (index > -1) {
          this.pendingRequests.splice(index, 1);
        }
        if (error.status !== 0 && error.status !== 499) {
          console.error('API Error:', error);
        }
        return throwError(() => error);
      })
    );
  }



  checkHealth(): Observable<HealthResponse> {
    return this.createRequest(
      this.http.get<HealthResponse>('http://localhost:8000/health')
    ).pipe(
      catchError(this.handleError<HealthResponse>('checkHealth'))
    );
  }

  testConnection(): Observable<any> {
    return this.createRequest(
      this.http.get<any>(`${this.apiUrl}/test-connection`)
    ).pipe(
      catchError(this.handleError<any>('testConnection'))
    );
  }

  searchSharePoint(request: SharePointRequest): Observable<SharePointResponse> {
    return this.createRequest(
      this.http.post<SharePointResponse>(`${this.apiUrl}/sharepoint/search`, request, {
        headers: this.getHeaders()
      })
    ).pipe(
      catchError(this.handleError<SharePointResponse>('searchSharePoint'))
    );
  }


  searchSQL(request: SQLRequest): Observable<SQLResponse> {
    console.log('🔍 Searching SQL with RBAC:', {
      query: request.query,
      user_role: request.user_role,
      user_email: request.user_email
    });

    return this.createRequest(
      this.http.post<SQLResponse>(`${this.apiUrl}/sql/search`, request, {
        headers: this.getHeaders()
      })
    ).pipe(
      catchError(this.handleError<SQLResponse>('searchSQL'))
    );
  }


  searchWeb(request: BraveSearchRequest): Observable<BraveSearchResponse> {
    return this.createRequest(
      this.http.post<BraveSearchResponse>(`${this.apiUrl}/brave/search`, request, {
        headers: this.getHeaders()
      })
    ).pipe(
      catchError(this.handleError<BraveSearchResponse>('searchWeb'))
    );
  }


  sendQuery(
    message: string,
    appId: number,
    tenantId: string | null,
    clientId: string | null = null,
    user_id_token: string | null = null,
    data_sources: ('sharepoint' | 'sql' | 'brave' | 'all' | 'kalpitapolicy')[] = ['all'], // 'all' = recruit sources only
    user_role?: string,
    user_email?: string,
    model?: string
  ): Observable<ChatResponse> {
    const payload: ChatRequest = {
      message: message,
      client_id: clientId,
      app_id: appId,
      tenant_id: tenantId,
      user_id_token: user_id_token,
      data_sources: data_sources,
      debug_mode: false,
      user_role: user_role || '',
      user_email: user_email || '',
      model: model || 'o3-mini'
    };

    console.log('Sending query with model:', payload.model);

    return this.createRequest(
      this.http.post<ChatResponse>(`${this.apiUrl}/chat`, payload, {
        headers: this.getHeaders()
      })
    ).pipe(
      map(response => {
        console.log('Raw API response with potential policy data:', response);

        // Store in database after successful response

        // Handle Kalpita Policy specific response structure if needed
        if (response.services_used?.includes('kalpitapolicy')) {
          console.log('Response includes Kalpita Policy data');

          // If the backend returns policies array, convert to citations
          if ((response as any).policies && !response.citations) {
            response.citations = this.convertPoliciesToCitations((response as any).policies);
          }
        }

        // Convert web_results to citations if needed (existing logic)
        if ((response as any).web_results && (!response.citations || response.citations.length === 0)) {
          console.log('Converting web_results to citations');
          response.citations = (response as any).web_results.map((result: any, index: number) => ({
            title: result.title,
            url: result.url,
            content: result.description,
            source_type: 'Brave Search',
            score: result.search_score || (1 - index * 0.1)
          }));
        }

        return response;
      }),
      catchError(this.handleError<ChatResponse>('sendQuery'))
    );
  }

  private convertPoliciesToCitations(policies: any[]): Citation[] {
    if (!policies || !Array.isArray(policies)) return [];

    return policies.map((policy, index) => {
      const title = policy.metadata_spo_item_path ?
        policy.metadata_spo_item_path.split('/').pop() :
        `Policy Document ${index + 1}`;

      return {
        title: title,
        url: policy.metadata_spo_item_weburi,
        content: policy.content ? policy.content.substring(0, 200) + '...' : '',
        source_type: 'Kalpita Policy',
        score: 10 - index // Higher score for earlier results
      } as Citation;
    });
  }

  sendQueryWithRBAC(request: RBACRequest): Observable<ChatResponse> {
    console.log('🚀 Sending query with RBAC to /api/chat:', request);

    return this.createRequest(
      this.http.post<ChatResponse>(`${this.apiUrl}/chat`, request, {
        headers: this.getHeaders()
      })
    ).pipe(
      map(response => {
        console.log('📥 Response from RBAC-enabled chat:', response);

        // The redundant call to storeMessageInDatabase has been removed.
        // The backend is now the single source of truth for saving messages.

        return response;
      }),
      catchError(this.handleError<ChatResponse>('sendQueryWithRBAC'))
    );
  }


  sendSmartQuery(
    message: string,
    appId: number,
    tenantId: string | null,
    clientId: string | null = null,
    user_id_token: string | null = null,
    data_sources: ('sharepoint' | 'sql' | 'brave' | 'all' | 'kalpitapolicy')[] = ['all'],  // Add here
    user_role?: string,
    user_email?: string,
    context?: 'recruit' | 'policy' | null
  ): Observable<ChatResponse> {

    // Handle Kalpita Policy context
    if (context === 'policy' || (data_sources.length === 1 && data_sources[0] === 'kalpitapolicy')) {
      console.log('📋 Routing to Kalpita Policy search');
      return this.searchKalpitaPolicy({
        query: message,
        max_results: 10,
        // temperature: 0.7 
      }).pipe(
        map(response => this.convertKalpitaPolicyToChatResponse(response))
      );
    }

    // For single data source requests, use service-specific endpoints
    if (data_sources.length === 1 && data_sources[0] !== 'all') {
      const source = data_sources[0];

      switch (source) {
        case 'sharepoint':
          return this.searchSharePoint({ query: message, max_results: 10 }).pipe(
            map(response => this.convertSharePointToChatResponse(response))
          );

        case 'sql':
          return this.searchSQL({
            query: message,
            max_results: 10,
            user_role: user_role,
            user_email: user_email
          }).pipe(
            map(response => this.convertSQLToChatResponse(response))
          );

        case 'brave':
          return this.searchWeb({ query: message, max_results: 10 }).pipe(
            map(response => this.convertBraveToChatResponse(response))
          );
      }
    }

    // For multiple sources or 'all', use the unified chat endpoint
    return this.sendQuery(message, appId, tenantId, clientId, user_id_token, data_sources, user_role, user_email);
  }


  private convertKalpitaPolicyToChatResponse(response: KalpitaPolicyResponse): ChatResponse {
    console.log('Converting Kalpita Policy response:', response);

    // Process citations to ensure max 5 with backend scores
    let citations: Citation[] = [];

    if (response.policies && Array.isArray(response.policies)) {
      citations = response.policies.slice(0, 5).map((policy: any, index: number) => {
        const title = policy.metadata_spo_item_path ?
          policy.metadata_spo_item_path.split('/').pop() :
          `Policy Document ${index + 1}`;

        return {
          title: title,
          url: policy.metadata_spo_item_weburi,
          content: policy.content ? policy.content.substring(0, 200) + '...' : '',
          source_type: 'Kalpita Policy SharePoint',
          score: policy.score || policy.search_score || 0  // Use backend score directly
        } as Citation;
      });
    } else if (response.citations && Array.isArray(response.citations)) {
      citations = response.citations.slice(0, 5).map((citation: any, index: number) => {
        return {
          title: citation.title || `Policy Document ${index + 1}`,
          url: citation.url,
          content: citation.content,
          source_type: 'Kalpita Policy SharePoint',
          score: citation.score || citation.search_score || 0  // Use backend score directly
        } as Citation;
      });
    }

    return {
      success: response.success,
      response: response.content || 'Here are the policy search results:',
      citations: citations,
      error: response.error,
      is_visualization: false,
      services_used: ['kalpitapolicy'],
      follow_up_questions: response.follow_up_questions || []  // ADD THIS LINE
    };
  }


  uploadAndSummarize(
    files: File[],
    clientId: string | null = null,
    tenantId: string | null = null,
    appId: number | null = null,
    user_id_token: string | null = null,
    user_role?: string,
    user_email?: string,
    data_sources?: ('sharepoint' | 'sql' | 'brave' | 'all' | 'kalpitapolicy')[]
  ): Observable<ChatResponse> {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    if (clientId) formData.append('client_id', clientId);
    if (user_id_token) formData.append('user_id', user_id_token);
    if (user_role) formData.append('user_role', user_role);
    if (user_email) formData.append('user_email', user_email);

    if (data_sources && data_sources.length > 0) {
      formData.append('data_sources', JSON.stringify(data_sources));
    } else {
      formData.append('data_sources', JSON.stringify(['all']));
    }
    formData.append('generate_summary', 'true');
    const headers = this.getHeaders().delete('Content-Type');

    return this.createRequest(
      this.http.post<ChatResponse>(`${this.apiUrl}/files/upload`, formData, {
        headers: headers,
        reportProgress: true,
        observe: 'events'
      })
    ).pipe(
      filter((event): event is HttpResponse<ChatResponse> => event.type === HttpEventType.Response),
      map((event: HttpResponse<ChatResponse>) => {
        console.log('Raw response event:', event);
        if (event.body) {
          console.log('Parsed response body:', JSON.stringify(event.body, null, 2));

          // Store file upload interaction in database
          if (event.body.success && event.body.response && user_id_token) {
            const userMessage = `Uploaded files: ${files.map(f => f.name).join(', ')}`;
            // We don't have tenantId/appId here, so we pass null. This is a potential issue to address later if needed.
            this.storeMessageInDatabase(userMessage, event.body.response, clientId, user_id_token, null, null);
          }

          return event.body;
        } else {
          console.warn('No body in response, returning default error');
          return { success: false, error: 'No response body received from server' } as ChatResponse;
        }
      }),
      catchError(this.handleError<ChatResponse>('uploadAndSummarize'))
    );
  }

  uploadAndSummarizeWithRBAC(files: File[], rbacParams: RBACUploadParams, userQuery: string, tenantId: string | null, appId: number | null): Observable<ChatResponse> {
    console.log('📤 Uploading files with RBAC and query:', rbacParams, `Query: "${userQuery}"`);

    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    let url = `${this.apiUrl}/files/upload?`;
    const params = new URLSearchParams();

    if (rbacParams.client_id) {
      params.append('client_id', rbacParams.client_id);
    }
    if (rbacParams.user_id_token) {
      params.append('user_id', rbacParams.user_id_token);
    }
    if (userQuery) {
      params.append('user_query', userQuery);
    }
    // ADDED: Include tenantId and appId in the request URL
    if (tenantId) {
      params.append('tenant_id', tenantId);
    }
    if (appId !== null && appId !== undefined) {
      params.append('app_id', appId.toString());
    }

    url += params.toString();
    console.log(`Constructed upload URL: ${url}`);
    const headers = this.getHeaders().delete('Content-Type');

    return this.createRequest(
      // Pass the new URL with query parameters to the post request
      this.http.post<ChatResponse>(url, formData, {
        headers: headers,
        reportProgress: true,
        observe: 'events'
      })
    ).pipe(
      filter((event): event is HttpResponse<ChatResponse> => event.type === HttpEventType.Response),
      map((event: HttpResponse<ChatResponse>) => {
        console.log('📥 Upload response with RBAC:', event);
        if (event.body) {
          if (event.body.success && event.body.response && rbacParams.user_id_token) {
            const userMessage = userQuery ? `${userQuery} (File: ${files.map(f => f.name).join(', ')})` : `Uploaded files: ${files.map(f => f.name).join(', ')}`;
            this.storeMessageInDatabase(
              userMessage,
              event.body.response,
              rbacParams.client_id,
              rbacParams.user_id_token,
              tenantId,
              appId
            );
          }
          return event.body;
        } else {
          return { success: false, error: 'No response body received from server' } as ChatResponse;
        }
      }),
      catchError(this.handleError<ChatResponse>('uploadAndSummarizeWithRBAC'))
    );
  }



  private convertSharePointToChatResponse(response: SharePointResponse): ChatResponse {
    return {
      success: response.success,
      response: response.content,
      citations: response.citations,
      error: response.error,
      is_visualization: false,
      services_used: ['sharepoint']
    };
  }

  private convertSQLToChatResponse(response: SQLResponse): ChatResponse {
    return {
      success: response.success,
      response: response.content,
      citations: response.candidates?.map(candidate => ({
        title: `[SQL Database] ${candidate.name || 'Candidate'}`,
        content: `Mobile: ${candidate.mobile}, Email: ${candidate.email}, Skills: ${candidate.skills}`,
        source_type: 'SQL Database',
        score: candidate.search_score
      })) || [],
      error: response.error,
      is_visualization: false,
      services_used: ['sql']
    };
  }

  private convertBraveToChatResponse(response: BraveSearchResponse): ChatResponse {
    console.log('Converting Brave response:', response);

    // Convert web_results to proper citations format
    const citations: Citation[] = response.web_results?.map((result, index) => ({
      title: result.title,
      url: result.url,
      content: result.description,
      source_type: 'Brave Search',
      score: result.search_score || (1 - index * 0.1) // Fallback scoring based on order
    })) || [];

    console.log('Converted Brave citations:', citations);

    return {
      success: response.success,
      response: response.content || 'Here are the search results from the web:',
      citations: citations,
      error: response.error,
      is_visualization: false,
      services_used: ['brave'],
      follow_up_questions: [
        'Search for more recent information',
        'Compare prices from different sources',
        'Find customer reviews and ratings'
      ]
    };
  }

  extractChartType(visualizationSuggestion: string): string {
    if (!visualizationSuggestion) return 'bar';
    const match = visualizationSuggestion.match(/chart_type:(\w+)/);
    return match ? match[1] : 'bar';
  }

  getBackendStatus(): Observable<{ mode: string, available: boolean, health?: HealthResponse }> {
    return this.checkHealth().pipe(
      map(health => ({
        mode: 'backend',
        available: true,
        health: health
      })),
      catchError((error) => of({
        mode: 'offline',
        available: false,
        health: undefined
      }))
    );
  }

  formatCitations(citations: Citation[]): string {
    if (!citations || citations.length === 0) {
      return '';
    }
    return citations.map((citation, index) => {
      const title = citation.title || 'Unknown Source';
      return `[${index + 1}] ${title}`;
    }).join(', ');
  }

  getCitationsBySource(citations: Citation[], sourceType: string): Citation[] {
    if (!citations) return [];
    return citations.filter(citation =>
      citation.source_type?.toLowerCase().includes(sourceType.toLowerCase())
    );
  }
  login(email: string, passwordHash: string): Observable<LoginResponse> {
    const payload: LoginRequest = {
      email: email,
      password: passwordHash
    };

    return this.http.post<LoginResponse>(`${this.apiUrl}/auth/login`, payload, {
      headers: this.getHeaders()
    }).pipe(
      catchError(this.handleError<LoginResponse>('login'))
    );
  }
  ssoLogin(token: string): Observable<LoginResponse> {
    const payload: SsoLoginRequest = { token };
    return this.http.post<LoginResponse>(`${this.apiUrl}/auth/sso-login`, payload, {
      headers: this.getHeaders()
    }).pipe(
      catchError(this.handleError<LoginResponse>('ssoLogin'))
    );
  }
  sendOtp(email: string): Observable<SuccessResponse> {
    const payload: SendOtpRequest = { email };
    return this.http.post<SuccessResponse>(`${this.apiUrl}/auth/send-otp`, payload)
      .pipe(
        catchError(this.handleError<SuccessResponse>('sendOtp'))
      );
  }

  resetPassword(email: string, otp: string, newPasswordHash: string): Observable<SuccessResponse> {
    const payload: ResetPasswordRequest = { email, otp, newPassword: newPasswordHash };
    return this.http.post<SuccessResponse>(`${this.apiUrl}/auth/reset-password`, payload)
      .pipe(
        catchError(this.handleError<SuccessResponse>('resetPassword'))
      );
  }

  isTemplateWorthyQuery(query: string): boolean {
    const chartTypes = ['bar chart', 'pie chart', 'line chart', 'doughnut chart', 'radar chart', 'scatter chart'];
    let uniqueTypes = new Set();

    chartTypes.forEach(type => {
      if (query.toLowerCase().includes(type)) {
        uniqueTypes.add(type);
      }
    });

    return uniqueTypes.size >= 2;
  }

  extractChartTypesFromQuery(query: string): string[] {
    const chartTypes: string[] = [];
    const patterns = [
      { type: 'bar', regex: /bar\s+chart/gi },
      { type: 'pie', regex: /pie\s+chart/gi },
      { type: 'line', regex: /line\s+chart/gi },
      { type: 'doughnut', regex: /doughnut\s+chart/gi },
      { type: 'radar', regex: /radar\s+chart/gi },
      { type: 'scatter', regex: /scatter\s+chart/gi }
    ];

    patterns.forEach(pattern => {
      if (pattern.regex.test(query)) {
        chartTypes.push(pattern.type);
      }
    });

    return [...new Set(chartTypes)];
  }

  private handleError<T>(operation = 'operation', result?: T) {
    return (error: any): Observable<T> => {
      console.error(`${operation} failed:`, error);

      let errorMessage = 'An error occurred. Please try again later.';
      if (error.status === 0) {
        errorMessage = 'Unable to connect to the server. Please check if the backend is running.';
      } else if (error.status === 401 || error.status === 403) {
        errorMessage = 'You do not have permission to perform this action.';
      } else if (error.status === 499) {
        errorMessage = 'Request cancelled.';
      } else if (error.status === 503) {
        errorMessage = 'Service temporarily unavailable.';
      } else if (error.status >= 500) {
        errorMessage = 'Server error. Please contact support.';
      } else {
        if (error.error) {
          if (typeof error.error === 'string') {
            errorMessage = error.error;
          } else if (error.error.detail) {
            errorMessage = error.error.detail;
          } else if (error.error.error) {
            errorMessage = error.error.error;
          }
        }
      }

      const errorResult = result as T || {} as T;
      if (typeof errorResult === 'object' && errorResult !== null) {
        (errorResult as any).error = errorMessage;
        (errorResult as any).success = false;
      }

      return of(errorResult);
    };
  }




  generateDashboard(request: DashboardRequest): Observable<DashboardResponse> {
    if (!request.app_id) {
      const appIdStr = sessionStorage.getItem('appId');
      if (appIdStr) {
        request.app_id = parseInt(appIdStr, 10);
        console.log('Injected app_id from sessionStorage:', request.app_id);
      } else {
        console.error('app_id not found in sessionStorage – dashboard generation will fail');
      }
    }
    console.log('🚀 Sending dashboard request:', request);
    return this.http.post<DashboardResponse>(`${this.apiUrl}/dashboard/generate`, request, { headers: this.getHeaders() })
      .pipe(
        map(response => {
          console.log('📊 Dashboard response received:', response);
          return response;
        }),
        catchError(this.handleError<DashboardResponse>('generateDashboard'))

      );
  }

  private convertVisualizationToDashboardResponse(vizResponse: VisualizationResponse, originalRequest: DashboardRequest): DashboardResponse {
    if (!vizResponse.success || !vizResponse.chart_data) {
      return {
        success: false,
        error: vizResponse.error || 'Failed to generate dashboard'
      } as DashboardResponse;
    }

    return {
      query_processed: originalRequest.query,
      ...vizResponse
    } as DashboardResponse;
  }


  searchKalpitaPolicy(request: KalpitaPolicyRequest): Observable<KalpitaPolicyResponse> {
    console.log('📋 Searching Kalpita policies:', request);

    return this.createRequest(
      this.http.post<KalpitaPolicyResponse>(`${this.apiUrl}/kalpitapolicy/search`, request, {
        headers: this.getHeaders()
      })
    ).pipe(
      catchError((error) => {
        console.error('Kalpita Policy search error:', error);
        // Return a structured error response instead of throwing
        return of({
          success: false,
          content: 'Policy search service is currently unavailable. Please try again later.',
          policies: [],
          citations: [],
          error: error.message || 'Policy search failed',
          policy_count: 0,
          query_processed: request.query
        } as KalpitaPolicyResponse);
      })
    );
  }




  private storeMessageInDatabase(
    userMessage: string,
    aiResponse: string,
    clientId: string | null,
    userId: string | null,
    tenantId: string | null,
    appId: number | null
  ): void {
    if (!userId || !tenantId || appId === null) {
      console.error('❌ Cannot store message: Missing userId, tenantId, or appId.');
      return;
    }

    const userTokens = this.countTokens(userMessage);
    const responseTokens = this.countTokens(aiResponse);

    // Store the message using your database API
    const request: InsertMessageRequest = {
      user_id: userId,
      tenant_id: tenantId,
      user_id_token: userId,
      app_id: appId,
      client_id: clientId || '',
      user_message: userMessage,
      ai_response: aiResponse,
      prompt_tokens: userTokens,
      response_tokens: responseTokens,
      is_favorited: false,
      is_flagged: false,
      visibility: 'private'
    };

    this.chatHistoryService.insertMessage(request).subscribe({
      next: (response: any) => {
        if (response.success) {
          console.log('✅ Message stored in database via ChatHistoryService:', response.message_id);
        } else {
          console.error('❌ Failed to store message via ChatHistoryService:', response.error);
        }
      },
      error: (error) => {
        console.error('❌ Error calling insertMessage service:', error);
      }
    });
  }

  private countTokens(text: string): number {
    return Math.ceil((text || '').length / 4);
  }

  updateMessageFeedback(request: UpdateChatFeedbackRequest): Observable<UpdateMessageFeedbackResponse> {
    console.log('👍 Sending app-aware feedback to API:', request);
    const url = `${this.apiUrl}/database/chats/feedback`; // Correct endpoint

    // The first parameter is the URL, the second is the request body.
    return this.http.put<UpdateMessageFeedbackResponse>(url, request, { headers: this.getHeaders() })
      .pipe(
        catchError(this.handleError<UpdateMessageFeedbackResponse>('updateMessageFeedback'))
      );
  }

  generateVisualization(request: ChartVisualizationRequest): Observable<ChartDataResponse> {
    const visualizationEndpoint = `${this.apiUrl}/visualization/generate`;

    console.log('📊 Calling visualization endpoint:', visualizationEndpoint);
    console.log('📊 Request payload:', request);

    return this.createRequest(
      this.http.post<ChartDataResponse>(visualizationEndpoint, request, {
        headers: this.getHeaders()
      })
    ).pipe(
      map(response => {
        console.log('📊 Visualization response:', response);
        return response;
      }),
      catchError((error) => {
        console.error('📊 Visualization API error:', error);
        return this.handleError<ChartDataResponse>('generateVisualization')(error);
      })
    );
  }

  translateText(request: TranslationRequest): Observable<TranslationResponse> {
    return this.createRequest(
      this.http.post<TranslationResponse>(`${this.apiUrl}/translate`, request, {
        headers: this.getHeaders()
      })
    ).pipe(
      catchError(this.handleError<TranslationResponse>('translateText'))
    );
  }

  changePassword(request: ChangePasswordRequest): Observable<ChangePasswordResponse> {
    // In a real app, you would hash the passwords here before sending.
    // For this example, we assume the backend handles it.
    const payload = {
      email: request.email,
      oldPassword: request.oldPassword, // This should be a hash
      newPassword: request.newPassword  // This should be a hash
    };
    return this.http.post<SuccessResponse>(`${this.apiUrl}/auth/change-password`, payload)
      .pipe(
        map(response => ({ ...response })), // Ensure mapping from SuccessResponse
        catchError(this.handleError<ChangePasswordResponse>('changePassword'))
      );
  }
  getUserDetailsByEmail(email: string): Observable<UserDetailsResponse> {
    return this.createRequest(
      this.http.get<UserDetailsResponse>(`${this.apiUrl}/users/details-by-email`, {
        params: { user_email: email }
      })
    ).pipe(
      catchError(this.handleError<UserDetailsResponse>('getUserDetailsByEmail'))
    );
  }

  getApplicationsForTenant(tenantId: string): Observable<GetApplicationsResponse> {
    const url = `${this.apiUrl}/tenants/${tenantId}/applications`;
    console.log(`Fetching applications for tenant from: ${url}`);
    return this.createRequest(
      this.http.get<GetApplicationsResponse>(url, {
        headers: this.getHeaders()
      })
    ).pipe(
      catchError(this.handleError<GetApplicationsResponse>('getApplicationsForTenant'))
    );
  }


  getModels(): Observable<GetModelsResponse> {
    const url = `${this.apiUrl}/catalog/models`;
    console.log(`[ChatService] Fetching available models from: ${url}`);
    return this.createRequest(
      this.http.get<GetModelsResponse>(url, {
        headers: this.getHeaders()
      })
    ).pipe(
      catchError(this.handleError<GetModelsResponse>('getModels'))
    );
  }
  getLanguages(): Observable<GetLanguagesResponse> {
    const url = `${this.apiUrl}/catalog/languages`;
    console.log(`[ChatService] Fetching available languages from: ${url}`);
    return this.createRequest(
      this.http.get<GetLanguagesResponse>(url, {
        headers: this.getHeaders()
      })
    ).pipe(
      catchError(this.handleError<GetLanguagesResponse>('getLanguages'))
    );
  }

  getRoleFeatures(tenantId: string, appId: number, roleName: string): Observable<GetRoleFeaturesResponse> {
    const url = `${this.apiUrl}/roles/features`;
    const params = {
      tenant_id: tenantId,
      app_id: appId.toString(),
      role_name: roleName
    };

    console.log(`[ChatService] Fetching features for role '${roleName}'`);
    return this.createRequest(
      this.http.get<GetRoleFeaturesResponse>(url, { params, headers: this.getHeaders() })
    ).pipe(
      catchError(this.handleError<GetRoleFeaturesResponse>('getRoleFeatures'))
    );
  }
  externalLogin(
    email: string,
    name: string,
    role: string,
    signature: string,
    appId: string,
    tenantId?: string
  ): Observable<LoginResponse> {

    const payload: ExternalLoginRequest = {
      email, name, role, signature,
      app_id: appId,
      tenant_id: tenantId || '188E191A-F692-47DC-933A-22B78F5A6E4A'
    };

    return this.http.post<LoginResponse>(`${this.apiUrl}/auth/external-login`, payload, {
      headers: this.getHeaders()
    }).pipe(
      catchError(this.handleError<LoginResponse>('externalLogin'))
    );
  }
  getTrainingQuiz(topic: string): Observable<any> {
    const token = sessionStorage.getItem('jwtToken') || sessionStorage.getItem('token') || '';
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.post<any>(`${this.apiUrl}/training/quiz`, { topic }, { headers });
  }
}
export { ChatHistoryService };
