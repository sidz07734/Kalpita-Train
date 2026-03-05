import { Component, ElementRef, ViewChild, AfterViewInit, OnInit, OnChanges, SimpleChanges, Output, EventEmitter, OnDestroy, Input, HostListener } from '@angular/core';
import { DomSanitizer, SafeHtml, SafeUrl } from '@angular/platform-browser';
import { ChatService, Citation, ChatResponse, VisualizationRequest, VisualizationResponse, BraveSearchResponse, TranslationRequest, TranslationResponse, ChatRequest, UpdateMessageFeedbackResponse, ChangePasswordRequest, LanguageItem, ApplicationWithDataSources, ModelItem, UpdateChatFeedbackRequest } from '../../Services/chat.service';
import { Observable, Subject, takeUntil } from 'rxjs';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { ChartConfig } from '../chart/chart.component';
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';
import { DashboardChartData } from '../dashboard/dashboard.component';
import { TemplateOption } from '../template-selection/template-selection.component';
import { ChatHistoryService, ChatMessage, PopularTag, StoreMessageRequest, StoreMessageResponse } from '../../Services/chat-history.service';
import { TenantInfo, UserProfile, UserProfileLanguage, UserProfileModel, UserService, UserTenantResponse, UserPermissions, UserPreferences, GetUserDefaultsResponse, UserDefaults } from 'src/app/Services/user.service';
import { NgForm } from '@angular/forms';
import { AuthService } from 'src/app/Services/auth.service';
import { MsalService } from '@azure/msal-angular';
import { ToastrService } from 'ngx-toastr';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';
interface Message {
  name: string;
  message: string;
  timestamp?: Date;
  isChart?: boolean;
  chartData?: any;
  messageType?: 'text' | 'chart' | 'loading'| 'quiz' | 'audio';
  citations?: Citation[];
  followUpQuestions?: string[];
  cssClass?: string;
  messageId?: string;
  is_favorited?: boolean;
  is_pinned?: boolean;
  is_flagged?: boolean;
  visibility?: 'private' | 'public';
  user_feedback?: number;
  fileName?: string;
  fileSize?: number;
  public_approval_status?: 'Pending' | 'Approved' | 'Rejected' | 'NotApplicable';
  quizData?: {
    topic: string;
    questions: any[];
    currentIndex: number;
    selectedAnswers: string[];  // tracks answer per question
    answered: boolean[];
    score: number;
    finished: boolean;
    timeLeft: number;
    timerInterval: any;
    resultsPage?: number;
  }
  audioUrl?: string;
  audioTopic?: string;
  audioSession?: string;
}

@Component({
  selector: 'app-chatbot',
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.css'],
  animations: [
    trigger('slideInOut', [
      state('in', style({
        opacity: 1,
        transform: 'translateY(0)',
        visibility: 'visible'
      })),
      state('out', style({
        opacity: 0,
        transform: 'translateY(20px)',
        visibility: 'hidden'
      })),
      transition('* => in', [
        style({
          opacity: 0,
          transform: 'translateY(20px)',
          visibility: 'visible'
        }),
        animate('300ms ease-in-out')
      ]),
      transition('* => out', [
        animate('300ms ease-in-out', style({
          opacity: 0,
          transform: 'translateY(20px)'
        }))
      ])
    ])
  ]
})
export class ChatbotComponent implements AfterViewInit, OnInit, OnChanges, OnDestroy {
  @Input() userEmail?: string;
  @Input() appName?: string;
  @Input() isIntegrated?: boolean;
  @Input() preAuthenticated?: boolean;
  @Input() theme?: string;
  @Input() position?: string;
  @Input() autoOpen?: boolean;
  @Input() appId?: string;
  @Input() authToken?: string;
  @Input() userInfo?: any;
  @Input() userName?: string;

  @ViewChild('messageInput') messageInput!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('chatMessages') chatMessages!: ElementRef<HTMLDivElement>;
  @ViewChild('fileUpload') fileUpload!: ElementRef<HTMLInputElement>;
  @ViewChild('editTextarea') editTextarea!: ElementRef<HTMLTextAreaElement>;
  @Output() chatbotReady = new EventEmitter<void>();
  @Output() errorOccurred = new EventEmitter<string>();
  @Output() themeChanged = new EventEmitter<boolean>();

  isMaximized: boolean = false;
  isPopupMode: boolean = false; // True when opened in new tab via maximize
  private popupWindow: Window | null = null;
  private originalPosition: { bottom: string; right: string; width: string; height: string } = {
    bottom: '20px',
    right: '20px',
    width: '420px',
    height: '700px'
  };

  
  // Quiz modal state
  showQuizModal: boolean = false;
  quizTopic: string = '';
  quizQuestions: any[] = [];
  currentQuizIndex: number = 0;
  selectedAnswer: string = '';
  quizAnswered: boolean = false;
  quizScore: number = 0;
  quizFinished: boolean = false;
  quizTimeLeft: number = 15;
  quizTimerInterval: any = null;
  isLoadingQuiz: boolean = false;
  //siddharth-trainingquiz
  messages: Message[] = [];
  inputMessage: string = '';
  isOpen: boolean = false;
  isLoading: boolean = false;
  unreadCount: number = 0;
  backendStatus: string = 'connected';
  isInitialized: boolean = false;
  isDarkTheme: boolean = false;
  isGeneratingChart: boolean = false;
  isTeamsMode: boolean = false;
  showClearConfirmation: boolean = false
  showLogin: boolean = true;
  showProfileMenu: boolean = false;
  showOptionsMenu: boolean = false;
  isHandlingSsoRedirect: boolean = false;
  isPreConfigured: boolean = false;
  showTenants: boolean = false;
  selectedTenant: TenantInfo | null = null;
  showTenantDropdown: boolean = false;
  userTenants: TenantInfo[] = [];
  isCreditExpired: boolean = false;
  private audioDestination!: SpeechSDK.SpeakerAudioDestination;
  public isSpeakingPaused: boolean = false;
  private synthesizer: SpeechSDK.SpeechSynthesizer | null = null;
  private player: SpeechSDK.SpeakerAudioDestination | null = null;
  private isFetchingTenants = false;
  availableUserTenants: UserTenantResponse[] = [];
  showTenantSelection: boolean = false;
  selectedTenantForSession: UserTenantResponse | null = null;

  wasMaximizedBeforeModal: boolean = false;

  permissions: UserPermissions | null = null;
  preferences: UserPreferences | null = null;
  isLoadingPermissions = true;
  
  activeApp: ApplicationWithDataSources | null = null;
  showChangePasswordModal: boolean = false;
  oldPassword = '';
  newPassword = '';
  confirmPassword = '';
  changePasswordError = '';
  changePasswordSuccess = '';
  isChangingPassword = false;

  dataSourceSelection: { all: boolean; sharepoint: boolean; sql: boolean; brave: boolean } = {
    all: true,
    sharepoint: false,
    sql: false,
    brave: false
  };
  selectedDataSources: ('sharepoint' | 'sql' | 'brave' | 'all' | 'kalpitapolicy')[] = ['all'];
  selectedChartData: ChartConfig | null = null;
  selectedFiles: File[] = [];
  fileNames: string[] = [];
  isTextareaExpanded: boolean = false;
  isListening: boolean = false;
  showAttachDropdown: boolean = false;
  isSsoAuthenticating: boolean = false;
  showDashboard: boolean = false;
  dashboardQuery: string = '';
  hasDashboardData: boolean = false;
  dashboardData: DashboardChartData[] = [];
  showTemplateSelection: boolean = false;
  templateQuery: string = '';
  showPredefinedDashboard: boolean = false;
  selectedTemplate: TemplateOption | null = null;
  predefinedDashboardQuery: string = '';
  availableLanguages: LanguageItem[] = [];
  isLoadingLanguages: boolean = false;
  private speechSynthesizer!: SpeechSDK.SpeechSynthesizer;
  public isSpeakingMessageId: string | null = null;
  private voiceMap: { [key: string]: string } = {
    'en-US': 'en-US-JennyNeural',
    'pt-BR': 'pt-BR-FranciscaNeural',
    'es-ES': 'es-ES-ElviraNeural',
    'fr-FR': 'fr-FR-DeniseNeural',
    'de-DE': 'de-DE-AmalaNeural',
    'it-IT': 'it-IT-ElsaNeural',
    'ar-SA': 'ar-SA-ZariyahNeural'
  };

  private languageCodeMap: { [key: string]: string } = {
    'English': 'en-US',
    'Portuguese': 'pt-BR',
    'Spanish': 'es-ES',
    'French': 'fr-FR',
    'German': 'de-DE',
    'Italian': 'it-IT',
    'Arabic': 'ar-SA'
  };

  selectedLanguage: string = 'en-GB';
  isAdminUser: boolean = false;
  showLanguageDropdown: boolean = false;
  isFetchingUserDetails: boolean = false;
  private recognizer!: SpeechSDK.SpeechRecognizer;
  private speechConfig!: SpeechSDK.SpeechConfig;
  private destroy$ = new Subject<void>();
  private scrollSubject = new Subject<void>();

  showChatHistory: boolean = false;
  hoveredMessageIndex: number | null = null;

  editingMessageIndex: number | null = null;
  editingMessageText: string = '';
  showCopyToast: boolean = false;

  showClearChatConfirmation: boolean = false;

  showTagSuggestions: boolean = false;
  tagSuggestions: PopularTag[] = [];
  tagSearchTerm: string = '';
  selectedTagIndex: number = -1;
  tagSuggestionPosition = { top: 0, left: 0 };

  selectedAppIdForHistory: number | null = null;

  public userRole: string = '';
  public isSuperAdmin: boolean = false;
  public isAdmin: boolean = false;
  public isDragging: boolean = false;
  public userId: string = '';
  public TenantId: string = '';
  private clientId: string = '';
  public parseInt = parseInt;
  public Math = Math;

  tenantApplications: ApplicationWithDataSources[] = [];
  dataSourceSelections: { [appId: number]: { [dsId: number]: boolean } } = {};
  expandedGroups: { [appId: number]: boolean } = {};
  isLoadingApps: boolean = false;

  readonly MAX_CHARACTER_LIMIT = 1000;

  private currentSubscription: any = null;
  public isProcessingRequest: boolean = false;

  selectedModel: string = 'o3-mini';
  showModelDropdown: boolean = false;
  availableModels: ModelItem[] = [];
  isLoadingModels: boolean = false;
  fileUploadTooltip: string = 'Supported: PDF, DOCX, XLSX, PPT, TXT (Max 10MB)';
  acceptedFileFormats: string = '.pdf,.docx,.xlsx,.xls,.ppt,.pptx,.txt';
  maxFileSize: number = 10 * 1024 * 1024;

  activeDataContext: 'recruit' | 'policy' | null = 'recruit';
  showAdminPanel: boolean = false;

  showOldPassword = false;
showNewPassword = false;
showConfirmPassword = false;
  

  @ViewChild('adminPanel') adminPanel?: any;

  userFeatures: Set<string> = new Set();
  constructor(
    private chatService: ChatService,
    private sanitizer: DomSanitizer,
    private chatHistoryService: ChatHistoryService,
    private elementRef: ElementRef,
    private userService: UserService,
    private authService: AuthService,
    private msalService: MsalService,
    private toastr: ToastrService,
    private http: HttpClient

  ) { }

  @HostListener('document:click', ['$event'])
onDocumentClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;

  // 1. If we click completely outside the chatbot, close everything
  if (!this.elementRef.nativeElement.contains(target)) {
    this.closeAllDropdowns();
    return;
  }

  // 2. Check if the click was on a toggle button or inside a menu
  // We use specific classes to ensure we don't close the menu while the user is trying to use it
  const isToggleButton = !!target.closest('.options-btn, .language-btn, .model-text-btn, .attach-btn, .profile-btn');
  const isInsideMenu = !!target.closest('.options-menu, .language-dropdown-menu, .model-dropdown-menu, .attach-dropdown, .profile-menu');

  // 3. Logic: If the user clicked inside the chatbot window, 
  // but they DID NOT click a button and they ARE NOT inside a menu panel, close all popups.
  if (!isToggleButton && !isInsideMenu) {
    this.closeAllDropdowns();
  }
}

  // --- REPLACE your entire old ngOnInit method with this one ---
  ngOnInit(): void {
    console.log('🚀 ChatbotComponent ngOnInit started');
    this.userEmail = sessionStorage.getItem('userEmail') || undefined;
    this.userId = sessionStorage.getItem('userId') || '';
    this.TenantId = sessionStorage.getItem('TenantId') || '';
    // this.establishAppId();
    this.isTeamsMode = sessionStorage.getItem('isTeamsMode') === 'true';
    if (this.isTeamsMode) {
      console.log("🚀 Teams Mode Detected! Auto-maximizing.");
      this.isOpen = true;      // Open immediately
      this.isMaximized = true; // Force maximize state
    }
    this.ensureUserEmailIsSet();
    this.setUserRole();
    this.showLogin = !this.userEmail;

    // +++ FIX FOR INTEGRATION +++
    // If the component starts and we already have a user (from the parent app),n 
    // we must manually trigger the settings initialization.
    const savedTenantId = sessionStorage.getItem('TenantId');
    if (this.userId && !this.showLogin && savedTenantId) {
        this.TenantId = savedTenantId;
        this.appId = sessionStorage.getItem('appId') || '0';
        this.initializeUserSettings(); // This will trigger defaults -> permissions
    } else {
        // If no TenantId, we stay on the login or tenant selection screen
        console.log("Waiting for user to select a workspace...");
    }
    // ++++++++++++++++++++++++++++++

    this.loadModelPreference();
    console.log('📊 Initial user state:', {
      userEmail: this.userEmail,
      userRole: this.userRole,
      authToken: this.authToken,
      userId: this.userId,
      tenantId: this.TenantId,
      fromSession: sessionStorage.getItem('userEmail'),
    });

    if (this.isIntegrated) {
      this.extractUserDataFromParent();
    } else {
      this.extractRBACFromURL();
    }

    if (!this.userEmail) {
      this.ensureUserEmailIsSet();
    }

    if (this.userEmail) {
      this.chatHistoryService.setUserIdToken(this.userEmail);
      console.log('✅ Set user ID token in service:', this.userEmail);
    }

    const urlParams = new URLSearchParams(window.location.search);
    const urlUserEmail = urlParams.get('userEmail');
    const urlUserRole = urlParams.get('userRole');
    const urlUserId = urlParams.get('userId');

    console.log('📌 URL Parameters:', {
      userEmail: urlUserEmail,
      userRole: urlUserRole,
      userId: urlUserId
    });

    if (urlUserEmail) {
      this.userEmail = urlUserEmail;
      this.userRole = urlUserRole || 'User';
      this.userId = urlUserId || urlUserEmail;

      console.log('✅ RBAC data set from URL:', {
        userEmail: this.userEmail,
        userRole: this.userRole,
        userId: this.userId
      });
    }

    this.loadThemePreference();
    this.checkAdminStatus();
    this.loadMaximizePreference();
    if (this.isIntegrated) {
      this.extractRBACFromURL();
    }

    if (!this.isInitialized) {
      this.initializeChatbot();
      this.isInitialized = true;
    }

    this.scrollSubject.pipe(
      debounceTime(100),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.scrollToBottom();
    });

    if (window.matchMedia) {
      const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
      darkModeQuery.addEventListener('change', (e) => {
        if (!localStorage.getItem('chatbot-theme')) {
          this.isDarkTheme = e.matches;
        }
      });
    }

    if (this.autoOpen) {
      setTimeout(() => this.openChatWindow(), 1000);
    }

    this.initializeAzureSpeech();
    // this.initializeSpeechSynthesizer();
    this.setupParentCommunication();
    // this.loadModelPreference(); // This is now called within the new flow
    this.loadPermissionsAndPreferences(); // This is now called within the new flow

    if (this.isIntegrated) {
      this.requestRBACConfig();
    }
    this.checkUserRole();
    if (this.isAdminUser) {
      // this.loadTenants();
    }


    const manifestTenantId = urlParams.get('tenantId');
    const manifestAppId = urlParams.get('appId');

    // NEW: Capture the extra fields you wanted
    const manifestTenantName = urlParams.get('tenantName');
    const manifestIsSuperAdmin = urlParams.get('isSuperAdmin');
    const manifestAppName = urlParams.get('appName');

    if (manifestTenantId && manifestAppId) {
      console.log(`🚀 Found Context in URL: Tenant=${manifestTenantId}, App=${manifestAppId}`);

      // Store IDs
      this.TenantId = manifestTenantId;
      this.appId = manifestAppId;
      sessionStorage.setItem('TenantId', manifestTenantId);
      sessionStorage.setItem('appId', manifestAppId);

      // NEW: Store the extra metadata if it exists
      if (manifestTenantName) {
        sessionStorage.setItem('selectedTenantName', manifestTenantName);
      }
      if (manifestIsSuperAdmin) {
        sessionStorage.setItem('isSuperAdmin', manifestIsSuperAdmin);
      }
      if (manifestAppName) {
        sessionStorage.setItem('appName', manifestAppName);
      }

      this.isPreConfigured = true;
    }
  }



  public hasFeature(featureName: string): boolean {
    if (this.isSuperAdmin) {
      return true; // Super Admins can see everything.
    }
    return this.userFeatures.has(featureName);
  }

  // --- REPLACE your old loadPermissionsAndPreferences method with this one ---
  loadPermissionsAndPreferences(): Promise<void> {
    return new Promise((resolve) => {
      // Sync data one last time to be safe
      this.refreshSessionData();
      const tenantId = this.TenantId || sessionStorage.getItem('TenantId');
      const appId = parseInt(this.appId || '0', 10);

      this.isLoadingPermissions = true;
      this.isLoadingLanguages = true;
      this.isLoadingModels = true;
      this.isLoadingApps = true;

      let permissionsRequest$: Observable<any>;

      // --- BRANCHING LOGIC ---
      if (this.isIntegrated && this.userRole && this.TenantId) {
        // PATH A: Integrated Mode (Uses Role + Tenant + AppId)
        console.log(`🔄 [Integrated Mode] Calling New API for Role: ${this.userRole}, Tenant: ${this.TenantId}`);
        permissionsRequest$ = this.userService.getUserPermissionsForIntegratedApp(this.userRole, appId, this.TenantId);
      } else {
        // PATH B: Standalone Mode (Uses Email + AppId)
        if (!this.userEmail || !tenantId) {
        console.error("Permissions check failed: Email or TenantId missing.");
        this.finalizeLoadingState();
        resolve();
        return;
      }
      // tenantId is now guaranteed to be a string here
      permissionsRequest$ = this.userService.getUserPermissions(this.userEmail, appId, tenantId);
    }

      permissionsRequest$
        .pipe(takeUntil(this.destroy$))
        .subscribe({
  next: (permResponse) => {
    if (permResponse && permResponse.success && permResponse.permissions) {
        this.permissions = permResponse.permissions;
        
        // ONLY update preferences if the server actually sent new ones.
        // If the server sends null, keep the ones we set in initializeUserSettings.
        if (permResponse.preferences && permResponse.preferences.LanguageID) {
            this.preferences = permResponse.preferences;
        }

        this.processPermissionsResponse(); 
    }
    this.finalizeLoadingState();
    resolve();
},
          error: (err) => {
            console.error("HTTP error loading permissions:", err);
            this.finalizeLoadingState();
            resolve();
          }
        });
    });
  }
  private processPermissionsResponse() {
    if (!this.permissions) return;

    // Map Applications
    if (this.permissions.applications) {
      this.tenantApplications = this.permissions.applications.map((app: any) => {
        const mappedSources = app.data_sources.map((ds: any) => ({
          data_source_id: ds.data_source_id,
          data_source_name: ds.data_source_name
        }));
        if (mappedSources.length > 0) {
          mappedSources.unshift({ data_source_id: -1, data_source_name: "All", is_default: false });
        }
        return {
          app_id: app.app_id,
          application_name: app.application_name,
          data_sources: mappedSources
        };
      });
      this.initializeDataSourceSelections();

      // Auto-set AppId if missing
      if ((!this.appId || this.appId === '0') && this.tenantApplications.length > 0) {
        this.appId = this.tenantApplications[0].app_id.toString();
        sessionStorage.setItem('appId', this.appId);
      }
    }

     if (this.permissions.languages) {
        this.availableLanguages = this.permissions.languages.map((lang: any) => ({
            language_id: lang.LanguageID,
            language_name: lang.LanguageName,
            language_code: this.languageCodeMap[lang.LanguageName] || 'en-US'
        }));

        // Use the ID from our preferences to set the current language string
        const currentLangId = this.preferences?.LanguageID;
        const matchedLang = this.availableLanguages.find(l => l.language_id === currentLangId);
        if (matchedLang) {
            this.selectedLanguage = matchedLang.language_code || 'en-US';
        }
    }

    // SYNC MODELS
    if (this.permissions.models) {
        this.availableModels = this.permissions.models.map((model: any) => ({
            model_id: model.ModelID,
            model_name: model.ModelName
        }));

        // Use the ID from our preferences to set the current model string (e.g. 'gpt-4.1')
        const currentModelId = this.preferences?.ModelID;
        const matchedModel = this.availableModels.find(m => m.model_id === currentModelId);
        if (matchedModel) {
            this.selectedModel = matchedModel.model_name;
        }
    }


    // Map Features
    this.userFeatures.clear();
    if (this.permissions.features) {
      this.permissions.features.forEach((f: string) => {
        this.userFeatures.add(f);
        // Map backend names to frontend icons
        if (f === "Voice Assistant") this.userFeatures.add("Voice Input");
        if (f === "Language Selector") this.userFeatures.add("Multilingual");
        if (f === "AI Engine Selector") this.userFeatures.add("LLM Model Changing");
        if (f === "Document Analysis") this.userFeatures.add("Document Analysis");
        if (f === "Prompt Manager") this.userFeatures.add("Prompt Manager");
      });
    }
  }

  private finalizeLoadingState() {
    this.isLoadingLanguages = false;
    this.isLoadingModels = false;
    this.isLoadingPermissions = false;
    this.isLoadingApps = false;
  }

  private establishAppId(): void {
    let finalAppId: string | null = null;

    // Priority 1: Check for @Input value passed directly to the component.
    if (this.appId) {
      finalAppId = this.appId;
      console.log(`✅ AppId established from @Input property: ${finalAppId}`);
    } else {
      // Priority 2: Check session storage, which is the standard dynamic method.
      const sessionAppId = sessionStorage.getItem('appId');
      if (sessionAppId) {
        finalAppId = sessionAppId;
        console.log(`✅ AppId established from Session Storage: ${finalAppId}`);
      }
    }

    if (finalAppId) {
      this.appId = finalAppId;

      this.selectedAppIdForHistory = parseInt(finalAppId, 10);
    } else {
      // Critical Error: No AppId could be found.
      console.error("❌ CRITICAL: No AppId found from @Input or Session Storage. Chat history and other features will be impaired.");
      this.addMessage('KalpitaNexa', '❌ Configuration Error: Could not identify the application. Please reload or contact support.');
    }
  }

  private setUserRole(): void {
    this.userRole = this.getUserRoleFromSession() || '';
    const normalizedRole = this.userRole.toLowerCase();

    this.isSuperAdmin = normalizedRole === 'superadmin';
    this.isAdmin = normalizedRole === 'admin';

    console.log(`User role set to: '${this.userRole}'. isSuperAdmin: ${this.isSuperAdmin}, isAdmin: ${this.isAdmin}`);

    if (this.isSuperAdmin) {
      // this.loadTenants();
    }
  }

  checkUserRole(): void {
    this.isAdminUser = this.userRole === 'Admin' ||
      this.userEmail?.includes('admin') ||
      false;
  }


  toggleTenantDropdown(event: Event): void {
    event.stopPropagation();
    this.showTenantDropdown = !this.showTenantDropdown;
    console.log('🎯 Tenant dropdown toggled:', this.showTenantDropdown);
    console.log('Current userTenants:', this.userTenants);
  }

  selectTenant(tenant: TenantInfo, event: Event): void {
    event.stopPropagation();
    this.selectedTenant = tenant;
    this.showTenants = true;

    console.log('🎯 Selected tenant:', tenant.tenant_name || tenant.name);
    console.log('🔧 Opening tenant management for:', tenant);

    this.addMessage('KalpitaNexa', `🏢 Selected tenant: ${tenant.tenant_name || tenant.name}`);
  }
  trackByTenantId(index: number, tenant: any): string {
    return tenant.tenant_id || index.toString();
  }

  async toggleOptionsMenu(event: Event): Promise<void> {
    event.stopPropagation();
    const wasOpen = this.showOptionsMenu;
    this.closeAllDropdowns(); // This correctly closes all menus

    if (!wasOpen) {
      this.showOptionsMenu = true; // Now, open it back up.
      this.expandedGroups = {};
      const tenantId = sessionStorage.getItem('TenantId');

      // --- THIS IS THE FIX ---
      // Only load applications if the tenant ID exists AND the list of applications is currently empty.
      // This prevents the API from being called every time the menu is opened.
      if (tenantId && this.tenantApplications.length === 0 && !this.isLoadingApps) {
        this.loadTenantApplications(tenantId);
      } else {
        // If the data is already there, we don't need to do anything.
        console.log('Skipping application fetch: Data is already loaded or a request is in progress.');
      }

      // The logic to fetch user details is fine to run here as it's a quick check.
      if ((!this.userId || !this.TenantId) && !this.isFetchingUserDetails) {
        const userEmail = sessionStorage.getItem('userEmail');
        if (userEmail) {
          this.isFetchingUserDetails = true;
          try {
            const response = await this.chatService.getUserDetailsByEmail(userEmail).toPromise();
            if (response && response.success && response.userId && response.tenantId) {
              this.userId = response.userId;
              this.TenantId = response.tenantId;
              sessionStorage.setItem('userId', response.userId);
              sessionStorage.setItem('TenantId', response.tenantId);
            } else {
              console.error('Failed to fetch user details:', response?.error);
            }
          } catch (error) {
            console.error('API error while fetching user details:', error);
          } finally {
            this.isFetchingUserDetails = false;
          }
        }
      }
    }
    console.log('🔧 Options menu visibility is now:', this.showOptionsMenu);
  }

  checkAdminStatus(): void {
    this.isAdminUser = this.userRole === 'Admin' ||
      this.userEmail?.includes('admin') ||
      false;
  }

  openAdminPanel(): void {
    console.log('🔧 Opening Admin Panel');
    this.showAdminPanel = true;
    this.showOptionsMenu = false;
    this.pushModalState();
  }

  toggleLanguageDropdown(event: Event): void {
    event.stopPropagation();
    const wasOpen = this.showLanguageDropdown;
    this.closeAllDropdowns();
    if (!wasOpen) {
      this.showLanguageDropdown = true;
    }
  }


  selectLanguage(langCode: string, event: Event): void {
    event.stopPropagation();
    this.selectedLanguage = langCode;
    this.showLanguageDropdown = false;
    const langObj = this.availableLanguages.find(l => l.language_code === langCode);
    if (langObj && this.preferences) {
      this.preferences.LanguageID = langObj.language_id;
    }

    console.log(`Language changed to: ${langCode}`);
    this.saveLanguagePreference();
    if (this.recognizer) this.recognizer.close();
    if (this.speechSynthesizer) this.speechSynthesizer.close();
    this.initializeAzureSpeech();
    this.initializeSpeechSynthesizer();

    // ** This line is MODIFIED **
    const selectedLangObject = this.availableLanguages.find(lang => lang.language_code === langCode);
    const langName = selectedLangObject ? selectedLangObject.language_name : 'the selected language';

    this.addMessage('KalpitaNexa', `Language changed to ${langName}.`);
  }
  // --- REPLACE your existing selectModel method ---

  selectModel(modelName: string, event: Event): void {
    event.stopPropagation();
    this.selectedModel = modelName;
    this.showModelDropdown = false;

    // FIX: Find the model object and update the preference ID
    const modelObj = this.availableModels.find(m => m.model_name === modelName);
    if (modelObj && this.preferences) {
      this.preferences.ModelID = modelObj.model_id;
    }

    this.saveModelPreference();
    this.addMessage('KalpitaNexa', `Switched to ${modelName} model.`);
  }


  saveLanguagePreference(): void {
    try {
      localStorage.setItem('chatbot-language', this.selectedLanguage);
    } catch (error) {
      console.error('Failed to save language preference:', error);
    }
  }

  loadLanguagePreference(): void {
    try {
      const savedLanguage = localStorage.getItem('chatbot-language');
      if (savedLanguage) {
        this.selectedLanguage = savedLanguage;
        if (this.speechConfig && savedLanguage === 'Portuguese') {
          this.speechConfig.speechRecognitionLanguage = 'pt-BR';
        }
      }
    } catch (error) {
      console.error('Failed to load language preference:', error);
      this.selectedLanguage = 'English';
    }
  }

  private extractRBACFromURL(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const userEmail = urlParams.get('userEmail') || '';
    const userRole = urlParams.get('userRole') || '';
    const userId = urlParams.get('userId') || userEmail;
    const clientId = urlParams.get('clientId') || '';

    console.log('📌 Extracted RBAC from URL:', { userEmail, userRole, userId, clientId });
    if (userEmail) {
      this.userEmail = userEmail;
      this.userRole = userRole;
      this.userId = userId;
      this.clientId = clientId;
    }
  }

  private setupParentCommunication(): void {
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.origin !== 'http://localhost:4200') return;
      const { type, data } = event.data;
      switch (type) {
        case 'SET_USER_DATA':
          console.log('Received user data from parent:', data);
          this.handleUserDataFromParent(data.data);
          break;
        case 'RBAC_CONFIG':
          console.log('Received RBAC config from parent:', data);
          this.handleRBACConfig(data.data);
          break;
        case 'API_REQUEST_ENHANCED':
          console.log('Received enhanced API request from parent:', data);
          this.handleEnhancedApiRequest(data);
          break;
      }
    });
  }

  private requestRBACConfig(): void {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'GET_RBAC_CONFIG' }, 'http://localhost:4200');
      console.log('Requested RBAC config from parent');
    }
  }

  private handleUserDataFromParent(data: any): void {
    console.log('📨 Received user data from parent:', data);
    if (data.userEmail) {
      this.userEmail = data.userEmail;
      console.log('✅ Set userEmail:', this.userEmail);
      if (this.userEmail) {
        try {
          sessionStorage.setItem('userEmail', this.userEmail);
        } catch (e) {
          console.error('Could not store email in session:', e);
        }
      }
    }
    if (data.userRole) this.userRole = data.userRole;
    if (data.userId || data.userIdToken) this.userId = data.userId || data.userIdToken || this.userEmail || '';
    if (data.clientId) this.clientId = data.clientId;
    if (data.token) this.authToken = data.token;
    if (data.defaultApiConfig) {
      this.userRole = data.defaultApiConfig.user_role || this.userRole;
      this.userEmail = data.defaultApiConfig.user_email || this.userEmail;
      this.userId = data.defaultApiConfig.user_id_token || this.userId || this.userEmail || '';
    }
    if (this.userEmail) {
      this.chatHistoryService.setUserIdToken(this.userEmail);
    }
    console.log('📊 Final user data state:', {
      userEmail: this.userEmail,
      userRole: this.userRole,
      userId: this.userId,
      clientId: this.clientId
    });
    if (this.messages.length === 1 && this.messages[0].name === 'KalpitaNexa') {
      const welcomeMessage = `Welcome ${this.userEmail || 'User'}! I'm KalpitaNexa, your AI assistant. ` +
        `You're logged in as ${this.userRole}. What would you like to know?`;
      this.messages[0].message = welcomeMessage;
    }
  }

  private handleRBACConfig(config: any): void {
    this.userRole = config.user_role || '';
    this.userEmail = config.user_email || this.userEmail;
    this.userId = config.user_id_token || config.user_email || '';
    this.clientId = config.client_id || '';
    console.log('RBAC config updated:', {
      userRole: this.userRole,
      userEmail: this.userEmail,
      userId: this.userId,
      clientId: this.clientId
    });
  }

  private handleEnhancedApiRequest(data: any): void {
    if (data.requestId && data.payload) {
      console.log('Processing enhanced API request:', data.payload);
    }
  }

  private initializeAzureSpeech(): void {
    const speechKey = '';
    const speechRegion = 'eastus';
    this.speechConfig = SpeechSDK.SpeechConfig.fromSubscription(speechKey, speechRegion);
    this.speechConfig.speechRecognitionLanguage = this.selectedLanguage;
    const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
    this.recognizer = new SpeechSDK.SpeechRecognizer(this.speechConfig, audioConfig);
    this.recognizer.recognized = (s, e) => {
      if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech && e.result.text) {
        this.inputMessage += e.result.text + ' ';
        if (this.messageInput) {
          this.messageInput.nativeElement.value = this.inputMessage;
          this.autoAdjustTextarea();
        }
      }
    };
    this.recognizer.canceled = (s, e) => {
      this.isListening = false;
      console.error('🎤 Speech recognition canceled:', e.errorDetails);
      this.addMessage('KalpitaNexa', `❌ Speech recognition error: ${e.errorDetails}`);
      this.errorOccurred.emit(`Speech recognition error: ${e.errorDetails}`);
    };
    this.recognizer.sessionStopped = () => {
      this.isListening = false;
      console.log('🎤 Speech recognition session stopped');
    };
  }

  toggleVoiceInput(): void {
    if (!this.recognizer) {
      this.addMessage('KalpitaNexa', '❌ Azure Speech Service is not initialized.');
      return;
    }
    if (!this.isListening) {
      try {
        this.inputMessage = '';
        if (this.messageInput) {
          this.messageInput.nativeElement.value = '';
        }
        this.isListening = true;
        this.recognizer.startContinuousRecognitionAsync();
        console.log('🎤 Started Azure speech recognition');
        this.addMessage('KalpitaNexa', '🎤 Listening... (Click the mic again to stop)');
      } catch (error) {
        this.isListening = false;
        console.error('🎤 Error starting Azure speech recognition:', error);
        this.addMessage('KalpitaNexa', `❌ Error starting speech recognition: ${error}`);
        this.errorOccurred.emit(`Error starting speech recognition: ${error}`);
      }
    } else {
      this.recognizer.stopContinuousRecognitionAsync();
      this.isListening = false;
      console.log('🎤 Stopped Azure speech recognition');
      this.addMessage('KalpitaNexa', '🎤 Voice input stopped.');
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['appId']) {
      const newAppId = changes['appId'].currentValue;
      console.log(`%c 🚀 appId Input received: ${newAppId}`, 'color: #4CAF50; font-weight: bold;');
      if (newAppId) {
        this.appId = newAppId;
      }
    }

    if (changes['autoOpen'] && changes['autoOpen'].currentValue === true && !changes['autoOpen'].firstChange) {
      this.openChatWindow();
    }
    if (changes['theme']) {
      this.isDarkTheme = this.theme?.toLowerCase().includes('dark') || false;
    }
    // When AppComponent updates [authToken], this fires.
    if (changes['authToken'] && changes['authToken'].currentValue) {
      console.log('🔄 AuthToken detected! Initializing session...');

      // 1. Pull the latest data (Role, Tenant, Email) that AppComponent just saved
      this.refreshSessionData();

      // 2. If we are in integrated mode and have the required keys, Load Permissions immediately
      if (this.isIntegrated && this.userRole && this.TenantId) {
        console.log('🚀 Integrated Login Verified. Loading Configuration...');
        this.loadPermissionsAndPreferences();
      }
    }
  }

  private refreshSessionData(): void {
    this.userEmail = sessionStorage.getItem('userEmail') || this.userEmail;
    this.userId = sessionStorage.getItem('userId') || this.userId;
    this.userRole = sessionStorage.getItem('userRole') || this.userRole;
    this.TenantId = sessionStorage.getItem('TenantId') || this.TenantId;
    const sessionIntegrated = sessionStorage.getItem('isIntegrated');
    if (sessionIntegrated === 'true') {
      this.isIntegrated = true;
    }

    // Also sync AppID if it's missing locally
    if (!this.appId) {
      this.appId = sessionStorage.getItem('appId') || '0';
    }
  }

  ngAfterViewInit(): void {
    console.log('🎯 ChatbotComponent ngAfterViewInit');
    setTimeout(() => {
      if (this.isOpen && this.messageInput) {
        this.messageInput.nativeElement.focus();
      }
    }, 100);
  }

  ngOnDestroy(): void {
    this.scrollSubject.complete();
    this.destroy$.next();
    this.destroy$.complete();
    this.clearQuizTimer();

    if (this.recognizer) this.recognizer.close();
    if (this.speechSynthesizer) this.speechSynthesizer.close();
  }


  onIndividualSourceChange(): void {
    if (this.dataSourceSelection.sharepoint || this.dataSourceSelection.sql || this.dataSourceSelection.brave) {
      this.dataSourceSelection.all = false;
    }
    const hasIndividualSelection = this.dataSourceSelection.sharepoint || this.dataSourceSelection.sql || this.dataSourceSelection.brave;
    if (!hasIndividualSelection) {
      this.dataSourceSelection.all = true;
    }
    console.log('🔍 Individual source selection changed:', this.dataSourceSelection);
  }

  trackByMessage(index: number, message: Message): any {
    return message.timestamp ? message.timestamp.getTime() : index;
  }

  onChartIconError(event: any): void {
    console.log('📊 Chart icon load error');
    event.target.style.display = 'none';
  }

  onInputChange(event: any): void {
    const input = event.target.value;
    if (input.length > this.MAX_CHARACTER_LIMIT) {
      this.inputMessage = input.substring(0, this.MAX_CHARACTER_LIMIT);
      event.target.value = this.inputMessage;
      event.target.classList.add('at-limit');
      setTimeout(() => event.target.classList.remove('at-limit'), 300);
    } else {
      this.inputMessage = input;
    }
    this.checkForHashtagAutocomplete();
    this.autoAdjustTextarea();
  }

  private checkForHashtagAutocomplete(): void {
    if (!this.messageInput || !this.messageInput.nativeElement) return;
    const textarea = this.messageInput.nativeElement;
    const cursorPosition = textarea.selectionStart;
    const textBeforeCursor = this.inputMessage.substring(0, cursorPosition);
    const hashtagMatch = textBeforeCursor.match(/#(\w*)$/);
    if (hashtagMatch) {
      this.tagSearchTerm = hashtagMatch[1] || '';
      this.showTagAutocomplete(hashtagMatch.index || 0);
    } else {
      this.hideTagAutocomplete();
    }
  }

  private showTagAutocomplete(hashtagStartIndex: number): void {
    const textarea = this.messageInput.nativeElement;
    const textareaRect = textarea.getBoundingClientRect();
    const chatbotWindow = document.querySelector('.chatbot-window');
    const chatbotWindowRect = chatbotWindow?.getBoundingClientRect();
    const inputWrapper = textarea.closest('.chatbot-input');
    const inputWrapperRect = inputWrapper?.getBoundingClientRect();
    if (inputWrapperRect && chatbotWindowRect) {
      this.tagSuggestionPosition = {
        top: inputWrapperRect.top - chatbotWindowRect.top - 5,
        left: textareaRect.left - chatbotWindowRect.left
      };
    } else {
      this.tagSuggestionPosition = {
        top: textareaRect.top - 250,
        left: textareaRect.left
      };
    }
    this.chatHistoryService.searchTags(this.tagSearchTerm, this.authToken)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.tags.length > 0) {
            this.tagSuggestions = response.tags;
            this.showTagSuggestions = true;
            this.selectedTagIndex = -1;
          } else {
            this.hideTagAutocomplete();
          }
        },
        error: (error) => {
          console.error('Error searching tags:', error);
          this.hideTagAutocomplete();
        }
      });
  }

  private hideTagAutocomplete(): void {
    this.showTagSuggestions = false;
    this.tagSuggestions = [];
    this.selectedTagIndex = -1;
  }

  selectTag(tag: PopularTag): void {
    if (!this.messageInput || !this.messageInput.nativeElement) return;
    const textarea = this.messageInput.nativeElement;
    const cursorPosition = textarea.selectionStart;
    const textBeforeCursor = this.inputMessage.substring(0, cursorPosition);
    const textAfterCursor = this.inputMessage.substring(cursorPosition);
    const newTextBeforeCursor = textBeforeCursor.replace(/#\w*$/, `#${tag.tag_name} `);
    this.inputMessage = newTextBeforeCursor + textAfterCursor;
    textarea.value = this.inputMessage;
    const newCursorPosition = newTextBeforeCursor.length;
    setTimeout(() => {
      textarea.setSelectionRange(newCursorPosition, newCursorPosition);
      textarea.focus();
    }, 0);
    this.hideTagAutocomplete();
    this.autoAdjustTextarea();
  }

  private initializeChatbot(): void {
    console.log('🔧 Initializing chatbot...');
    const welcomeMessage = `Welcome to Kalpita Recruit. I'm KalpitaNexa — your smart assistant for navigating job requisitions, candidate profiles, and interview resumes.`;
    this.addMessage('KalpitaNexa', welcomeMessage);
    this.chatbotReady.emit();
  }

  private openChatWindow(): void {
    console.log('🪟 Opening chat window');
    this.isOpen = true;
    this.unreadCount = 0;
    if (this.authToken) {
      this.syncMessagesWithDatabase();
    }
    setTimeout(() => {
      if (this.messageInput) {
        this.messageInput.nativeElement.focus();
      }
      this.scrollToBottom();
    }, 300);
  }

   toggleChatbox(): void {
    console.log('🔄 Toggling chatbox, current state:', this.isOpen);
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.unreadCount = 0;
      this.pushModalState(); // Add history entry when chatbot opens
      setTimeout(() => {
        if (this.messageInput) {
          this.messageInput.nativeElement.focus();
        }
        this.scrollToBottom();
      }, 300);
    }
  }

  handleKeyUp(event: KeyboardEvent): void {
    if (this.showTagSuggestions) {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          this.selectedTagIndex = Math.min(this.selectedTagIndex + 1, this.tagSuggestions.length - 1);
          return;
        case 'ArrowUp':
          event.preventDefault();
          this.selectedTagIndex = Math.max(this.selectedTagIndex - 1, -1);
          return;
        case 'Enter':
          if (this.selectedTagIndex >= 0) {
            event.preventDefault();
            this.selectTag(this.tagSuggestions[this.selectedTagIndex]);
            return;
          }
          break;
        case 'Escape':
          event.preventDefault();
          this.hideTagAutocomplete();
          return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (this.inputMessage.trim().length > 0 && this.inputMessage.length <= this.MAX_CHARACTER_LIMIT) {
        this.sendMessage();
      }
    }
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (this.showTagSuggestions && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
    }
  }

  copyMessage(message: string, event: Event): void {
    event.stopPropagation();
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = message;
    const plainText = tempDiv.textContent || tempDiv.innerText || '';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(plainText).then(() => {
        this.showCopyNotification();
      }).catch(err => {
        console.error('Failed to copy text: ', err);
        this.fallbackCopyToClipboard(plainText);
      });
    } else {
      this.fallbackCopyToClipboard(plainText);
    }
  }

  private fallbackCopyToClipboard(text: string): void {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      this.showCopyNotification();
    } catch (err) {
      console.error('Fallback: Could not copy text', err);
    }
    document.body.removeChild(textArea);
  }

  private showCopyNotification(): void {
    this.showCopyToast = true;
    setTimeout(() => {
      this.showCopyToast = false;
    }, 2000);
  }

  startEditingMessage(messageIndex: number, event: Event): void {
    event.stopPropagation();
    const message = this.messages[messageIndex];
    if (message.name !== 'User') return;
    this.editingMessageIndex = messageIndex;
    this.editingMessageText = message.message;
    setTimeout(() => {
      if (this.editTextarea && this.editTextarea.nativeElement) {
        this.editTextarea.nativeElement.focus();
        this.editTextarea.nativeElement.setSelectionRange(this.editingMessageText.length, this.editingMessageText.length);
      }
    }, 0);
  }

  handleEditKeydown(event: KeyboardEvent, messageIndex: number): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.saveEditedMessage(messageIndex, event);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEditingMessage(event);
    }
  }

  saveEditedMessage(messageIndex: number, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    const editedText = this.editingMessageText.trim();
    if (!editedText) {
      this.cancelEditingMessage(event);
      return;
    }
    const originalMessage = this.messages[messageIndex];
    originalMessage.message = editedText;
    originalMessage.timestamp = new Date();
    this.editingMessageIndex = null;
    this.editingMessageText = '';
    let arckaResponseIndex = -1;
    for (let i = messageIndex + 1; i < this.messages.length; i++) {
      if (this.messages[i].name === 'KalpitaNexa') {
        arckaResponseIndex = i;
        break;
      }
    }
    if (arckaResponseIndex !== -1) {
      this.messages.splice(arckaResponseIndex, 1);
    }
    this.resendEditedMessage(editedText);
  }

  cancelEditingMessage(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.editingMessageIndex = null;
    this.editingMessageText = '';
  }

  private resendEditedMessage(message: string): void {
    this.isLoading = true;
    const chartRequestCount = this.countChartRequests(message);
    const isTemplateWorthy = this.isTemplateWorthyQuery(message);
    const isDashboardRequest = chartRequestCount > 1 || message.toLowerCase().includes('dashboard') || isTemplateWorthy;
    if (isDashboardRequest && isTemplateWorthy) {
      this.templateQuery = message;
      this.showTemplateSelection = true;
      this.isLoading = false;
      return;
    }
    if (isDashboardRequest && !isTemplateWorthy) {
      this.showDashboard = true;
      this.dashboardQuery = message;
      this.hasDashboardData = true;
      this.isLoading = false;
      return;
    }
    const dataSources = this.selectedDataSources as ('sharepoint' | 'sql' | 'brave' | 'all')[];
    console.log('🚀 Re-sending edited query:', message);
    this.chatService.sendQuery(
      message,
      parseInt(this.appId!),
      this.TenantId || null,
      this.clientId,
      this.userEmail || this.userId || null,
      dataSources,
      this.userRole,
      this.userEmail,
      this.selectedModel
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: ChatResponse) => {
          this.isLoading = false;
          console.log('📨 Received response for edited message');
          this.handleChatResponse(response, message, 0);
        },
        error: (error: any) => {
          this.isLoading = false;
          this.addMessage('KalpitaNexa', `❌ Error: ${error.message}`);
          this.errorOccurred.emit(error.message);
        }
      });
  }

  getRemainingCharacters(): number {
    return this.MAX_CHARACTER_LIMIT - this.inputMessage.length;
  }

  sanitizeHtml(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  sendMessage(): void {
  if (!this.isInputEnabled()) return;

  const messageText = this.inputMessage.trim();
  if (messageText === '' && this.selectedFiles.length === 0) return;

  // Quiz intent intercept
  const quizTopic = this.extractQuizTopic(messageText);
  if (quizTopic) {
    this.inputMessage = '';
    if (this.messageInput) {
      this.messageInput.nativeElement.value = '';
      this.autoAdjustTextarea();
    }
    this.openQuizModal(quizTopic);
    return;
  }

  if (messageText.length > this.MAX_CHARACTER_LIMIT) {
    this.addMessage('KalpitaNexa', `⚠️ Message exceeds ${this.MAX_CHARACTER_LIMIT} character limit.`);
    return;
  }

    const userMessage: Message = {
      name: 'User',
      message: messageText,
      timestamp: new Date(),
      visibility: 'private',
      fileName: this.selectedFiles.length > 0 ? this.fileNames.join(', ') : undefined,
      fileSize: this.selectedFiles.reduce((acc, file) => acc + file.size, 0)
    };
    this.messages.push(userMessage);

    const filesToSend = [...this.selectedFiles];

    this.inputMessage = '';
    if (this.messageInput) {
      this.messageInput.nativeElement.value = '';
      this.autoAdjustTextarea();
    }
    this.clearFileInput();

    this.isProcessingRequest = true;

    if (filesToSend.length > 0) {
      this.uploadFilesWithRBAC(filesToSend, filesToSend.length, messageText);
    } else {
      const langCode = this.selectedLanguage.split('-')[0];
      if (langCode !== 'en' && messageText) {
  this.isLoading = true;
  this.isProcessingRequest = true;

  const translationReq: TranslationRequest = {
    text: messageText,
    target_language: 'en',
    source_language: langCode
  };

  this.chatService.translateText(translationReq).pipe(takeUntil(this.destroy$)).subscribe({
    next: (res: TranslationResponse) => {
      if (res.success && res.translated_text) {
         this.processBackendQuery(res.translated_text);
      } else {
         console.warn('Translation failed, falling back to original message.');
         this.processBackendQuery(messageText); 
      }
    },
    error: (err) => {
      console.error('Translation error:', err);
      this.processBackendQuery(messageText);
    }
  });
} else {
  this.processBackendQuery(messageText);
}
    }
  }

  canSendMessage(): boolean {
    return sessionStorage.getItem('userEmail') !== null && sessionStorage.getItem('userRole') !== null && sessionStorage.getItem('userId') !== null;
  }

  clearConfirm(): void {
    this.showClearConfirmation = true
  }

  hideClearDialog(): void {
    this.showClearConfirmation = false
  }


  userAuthenticated(userData: { userEmail: string; userRole: string; userId: string; userName: string; TenantId: string; }): void {
    console.log('✅ User Authenticated:', userData);

    // 1. Store User Session Data
    sessionStorage.setItem('userEmail', userData.userEmail);
    sessionStorage.setItem('userRole', userData.userRole);
    sessionStorage.setItem('userId', userData.userId);
    sessionStorage.setItem('userName', userData.userName);

    // 2. Update Component State
    this.userEmail = userData.userEmail;
    this.userRole = userData.userRole;
    this.userId = userData.userId;
    this.userName = userData.userName;
    this.setUserRole();
    if (this.isSuperAdmin) {
        // SUPERADMIN: Must see the list and pick. 
        // We don't set TenantId yet.
        this.fetchUserTenants(this.userEmail!); 
    } else {
        // ADMIN / USER: Usually tied to specific tenants.
        // Fetch their tenants; if only one, it will auto-select in fetchUserTenants.
        this.fetchUserTenants(this.userEmail!);
    }

    // 3. Handle Tenant Context (Critical for Teams App)
    if (this.isPreConfigured && sessionStorage.getItem('TenantId')) {
      // If we are in "Teams Mode" (Pre-Configured), we PRESERVE the TenantId from the URL (Manifest).
      // We ignore the TenantId from the login token because the Manifest rules.
      this.TenantId = sessionStorage.getItem('TenantId') || '';
      console.log(`🔒 Enforcing Pre-Configured Tenant from Manifest: ${this.TenantId}`);
    } else {
      // Normal Web Mode: Use the TenantId returned by the Login/SSO process
      this.TenantId = userData.TenantId;
      sessionStorage.setItem('TenantId', userData.TenantId);
    }

    this.setUserRole(); // Set isSuperAdmin / isAdmin flags

    this.showLogin = false;
    this.isSsoAuthenticating = false;

    // 4. Determine Flow: Direct Access vs. Selection Screen
    if (this.isPreConfigured && this.TenantId) {
      console.log('⏩ Skipping Tenant Selection (Using Manifest Data)');

      // Retrieve values from Session (saved in ngOnInit)
      // Default to placeholders ONLY if the URL didn't have them
      const dynamicTenantName = sessionStorage.getItem('selectedTenantName');
      const dynamicIsSuperAdmin = parseInt(sessionStorage.getItem('isSuperAdmin') || '0', 10);



      // Create the Tenant Object dynamically
      const preSelectedTenant = {
        TenantId: this.TenantId,
        TenantName: dynamicTenantName,
        IsSuperAdmin: dynamicIsSuperAdmin
      };

      this.selectTenantForSession(preSelectedTenant as any);
    }
    else {
      // this.initializeUserSettings();
      this.fetchUserTenants(this.userEmail!);
    }
  }


  private initializeUserSettings(): void {
    if (!this.userId || !this.TenantId) return;

    this.userService.getUserDefaults(this.userId, this.TenantId).subscribe({
        next: (defaultsResponse) => {
            if (defaultsResponse.success && defaultsResponse.defaults) {
                const defaults = defaultsResponse.defaults;

                // 1. Manually set the preferences object immediately
                // This is what the HTML [checked] logic looks at
                this.preferences = {
                    AppID: defaults.default_app_id,
                    LanguageID: defaults.default_language_id,
                    ModelID: defaults.default_model_id
                };

                // 2. Sync the App selection for the sidebar radio
                if (defaults.default_app_id) {
                    this.appId = defaults.default_app_id.toString();
                    this.selectedAppIdForHistory = defaults.default_app_id;
                    sessionStorage.setItem('appId', this.appId);
                }

                // 3. Set the initial text labels for the buttons
                if (defaults.default_model_name) {
                    this.selectedModel = defaults.default_model_name;
                }

                // 4. Trigger history cleanup
                this.userService.cleanupChatHistory(this.userId, defaults.default_app_id || 0).subscribe();
                
                // 5. Load permissions to populate the actual lists (Models/Languages)
                this.loadPermissionsAndPreferences();
            }
        }
    });
}

  private applyUserDefaults(defaults: UserDefaults | null): void {
    if (!defaults) {
      console.warn("Could not apply user defaults because they are null.");
      return;
    }

    console.log("Applying user defaults to UI:", defaults);

    // Set Default Language
    if (defaults.default_language_id) {
      const foundLanguage = this.availableLanguages.find(lang => lang.language_id === defaults.default_language_id);
      if (foundLanguage?.language_code) {
        this.selectedLanguage = foundLanguage.language_code;
        // This is crucial for checking the radio button in the UI
        if (this.preferences) {
          this.preferences.LanguageID = defaults.default_language_id;
        }
        console.log(`✅ Default Language set to: ${foundLanguage.language_name}`);
      }
    }

    // Set Default Model
    if (defaults.default_model_name) {
      const foundModel = this.availableModels.find(m => m.model_name === defaults.default_model_name);
      if (foundModel) {
        this.selectedModel = foundModel.model_name;
        // This is crucial for checking the radio button in the UI
        if (this.preferences && defaults.default_model_id) {
          this.preferences.ModelID = defaults.default_model_id;
        }
        console.log(`✅ Default Model set to: ${foundModel.model_name}`);
      }
    }

    // Set Default Application context for history, etc.
    if (defaults.default_app_id) {
      this.selectedAppIdForHistory = defaults.default_app_id;
    }
  }
  private fetchUserTenants(userEmail: string): void {
    // Prevent double execution
    if (this.isFetchingTenants) return;
    
    console.log('🔍 Fetching tenants for user:', userEmail);
    this.isFetchingTenants = true;

    this.userService.getTenantsByEmail(userEmail).subscribe({
      next: (response) => {
        this.isFetchingTenants = false; // Reset guard

        if (response.success && response.tenants && response.tenants.length > 0) {
          const uniqueTenants = response.tenants.filter((tenant, index, self) =>
            index === self.findIndex((t) => t.TenantId === tenant.TenantId)
          );

          this.availableUserTenants = uniqueTenants;

          // If exactly one tenant, auto-select it. Otherwise show the modal.
          if (this.availableUserTenants.length === 1) {
            this.selectTenantForSession(this.availableUserTenants[0]);
          } else {
            this.showTenantSelection = true;
          }
        } else {
          this.initializeChatbotWithoutTenant();
        }
      },
      error: (error) => {
        this.isFetchingTenants = false; // Reset guard on error
        console.error('❌ Error fetching tenants:', error);
        this.initializeChatbotWithoutTenant();
      }
    });
}

  selectTenantForSession(tenant: UserTenantResponse): void {
    // 1. Establish the Tenant Context
    this.TenantId = tenant.TenantId;
    sessionStorage.setItem('TenantId', tenant.TenantId);
    sessionStorage.setItem('selectedTenantId', tenant.TenantId);
    sessionStorage.setItem('selectedTenantName', tenant.TenantName);

    this.showTenantSelection = false;
    console.log('✅ Tenant selected. Now fetching defaults for this specific workspace.');

    // 2. NOW call the initialization flow (Defaults -> Permissions)
    this.initializeUserSettings();
    
    // 3. Welcome the user to this specific workspace
    this.initializeChatbotWithTenant(tenant);
}

  private initializeChatbotWithTenant(tenant: UserTenantResponse): void {
    if (!this.isInitialized) {
      const tenantName = tenant.TenantName || 'Unknown Tenant';
      const welcomeMessage = `Welcome to ${tenantName}. I'm KalpitaNexa – your smart assistant for navigating job requisitions, candidate profiles, and interview resumes.`;
      this.addMessage('KalpitaNexa', welcomeMessage);
      this.isInitialized = true;
      this.chatbotReady.emit();
    }
  }

  trackByUserTenantId(index: number, tenant: UserTenantResponse): string {
    return tenant.TenantId;
  }

  private initializeChatbotWithoutTenant(): void {
    if (!this.isInitialized) {
      this.initializeChatbot();
    }
  }

  cancelTenantSelection(): void {
    this.showTenantSelection = false;
    this.logout();
  }

  cancelLogin(): void {
    console.log('Login cancelled by user.');
  }

  toggleProfileMenu(event: Event): void {
    event.stopPropagation();
    const wasOpen = this.showProfileMenu;
    this.closeAllDropdowns();
    if (!wasOpen) {
      this.showProfileMenu = true;
    }
  }

  logout(): void {
    // 1. Clear storage
    sessionStorage.clear();
    localStorage.clear();
 
    // 2. Reset chatbot state
    this.setMaximize(false);
    this.userEmail = undefined;
    this.messages = [];
    this.isInitialized = false;
   
    // 3. Bring back the login modal and hide the profile menu
    this.showProfileMenu = false;
    this.showLogin = true;
 
    // 4. Handle Microsoft SSO logout ONLY if an active Microsoft account exists
    if (this.msalService.instance.getAllAccounts().length > 0) {
      this.msalService.logoutRedirect({
        postLogoutRedirectUri: window.location.origin
      });
    }
   
  }


  stopRequest(): void {
    console.log('🛑 Stopping current request...');
    if (this.currentSubscription) {
      this.currentSubscription.unsubscribe();
      this.currentSubscription = null;
    }
    this.isLoading = false;
    this.isGeneratingChart = false;
    this.isProcessingRequest = false;
    const lastMessage = this.messages[this.messages.length - 1];
    if (lastMessage && lastMessage.messageType === 'loading') {
      this.messages.pop();
    }
    this.addMessage('KalpitaNexa', '⏹️ Request cancelled by user.');
    if (this.messageInput) {
      this.messageInput.nativeElement.focus();
    }
  }

  private processBackendQuery(englishMessage: string, isRegeneration: boolean = false): void {
    if (!this.appId) {
      this.addMessage('KalpitaNexa', '❌ Configuration Error: Application ID is not set. Cannot send message.');
      this.isLoading = false;
      this.isProcessingRequest = false;
      console.error("CRITICAL: Attempted to send a message without an appId. Current value:", this.appId);
      return;
    }
    if (isRegeneration) {
      console.log('🔄 Bypassing template checks for dashboard regeneration.');
      this.addMessage('User', englishMessage);
      this.isLoading = true;
 
      this.showDashboard = true;
      this.dashboardQuery = englishMessage;
      this.hasDashboardData = true;
 
      setTimeout(() => {
        this.isLoading = false;
        this.isProcessingRequest = false;
      }, 500);
 
      return;
    }
    this.isLoading = true;
    this.isProcessingRequest = true;
    const totalFiles = this.selectedFiles.length;
 
    if (totalFiles > 0) {
      this.uploadFilesWithRBAC(this.selectedFiles, totalFiles, englishMessage);
      return;
    }
 
    const chartRequestCount = this.countChartRequests(englishMessage);
    const isTemplateWorthy = this.isTemplateWorthyQuery(englishMessage);
    const isDashboardRequest = chartRequestCount >= 2 || englishMessage.toLowerCase().includes('dashboard') || (isTemplateWorthy && chartRequestCount > 1);
 
    if (isDashboardRequest) {
      if (isTemplateWorthy) {
        this.templateQuery = englishMessage;
        this.showTemplateSelection = true;
      } else {
        this.showDashboard = true;
        this.dashboardQuery = englishMessage;
        this.hasDashboardData = true;
      }
      this.isLoading = false;
      this.isProcessingRequest = false;
      return;
    }
 
 
    let finalDataSources: string[] = [];
 
    // 1. Identify the Active App (from Radio button or Input)
    const activeAppId = this.selectedAppIdForHistory || parseInt(this.appId);
    const activeApp = this.tenantApplications.find(a => a.app_id === activeAppId);
    const appSelections = this.dataSourceSelections[activeAppId];
 
    if (activeApp && appSelections) {
      // 2. Check if "All" is selected (Key -1)
      if (appSelections[-1]) {
        // If it's a Policy App, "All" means 'kalpitapolicy' for the backend
        if (activeApp.application_name.toLowerCase().includes('policy')) {
          finalDataSources.push('kalpitapolicy');
        } else {
          // For other apps, send 'all'
          finalDataSources.push('all');
        }
      }
      // 3. Map Individual Checkboxes
      else {
        Object.keys(appSelections).forEach(key => {
          const dsId = parseInt(key);
          // Only process if checked and not the 'All' key
          if (dsId !== -1 && appSelections[dsId]) {
            const dsInfo = activeApp.data_sources.find(d => d.data_source_id === dsId);
            if (dsInfo) {
              const name = dsInfo.data_source_name.toLowerCase();
 
              // Map to backend-specific keys
              if (name.includes('sharepoint')) {
                finalDataSources.push('sharepoint');
              } else if (name.includes('database') || name.includes('sql') || name.includes('azure')) {
                finalDataSources.push('sql');
              } else if (name.includes('brave') || name.includes('search')) {
                finalDataSources.push('brave');
              } else if (name.includes('policy')) {
                finalDataSources.push('kalpitapolicy');
              }
            }
          }
        });
      }
    }
 
    // 4. Final Safety: If list is empty, default based on App Name
    if (finalDataSources.length === 0) {
      if (activeApp?.application_name.toLowerCase().includes('policy')) {
        finalDataSources = ['kalpitapolicy'];
      } else {
        finalDataSources = ['all'];
      }
    }
 
    // 5. Deduplicate
    finalDataSources = Array.from(new Set(finalDataSources));
 
    console.log(`🚀 Sending Query for App: ${activeApp?.application_name}, Sources:`, finalDataSources);
    const request: ChatRequest = {
      app_id: parseInt(this.appId, 10),
      tenant_id: this.TenantId ?? null,
      message: englishMessage,
      client_id: this.clientId ?? null,
      user_id_token: this.userEmail || this.userId || null,
      user_role: this.userRole,
      user_email: this.userEmail || '',
      data_sources: finalDataSources as any,
      debug_mode: false,
      model: this.selectedModel
    };
 
    // Explicitly ensure tenant_id is never undefined
    const tenantId: string | null = request.tenant_id ?? null;
    const clientId: string | null = request.client_id ?? null;
    const userIdToken: string | null = request.user_id_token ?? null;
 
    this.currentSubscription = this.chatService.sendQuery(
      request.message,
      request.app_id,
      tenantId,              // Use the explicit variable
      clientId,              // Use the explicit variable
      userIdToken,           // Use the explicit variable
      request.data_sources,
      request.user_role,
      request.user_email,
      request.model
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: ChatResponse) => {
        if ((response as any).success === false) {
 
          this.isLoading = false;
          this.isProcessingRequest = false;
          this.currentSubscription = null;
 
          // A. Show the browser alert
          this.toastr.error((response as any).error, 'Credits Expired', {
            timeOut: 3000,
            positionClass: 'toast-top-right',
            progressBar: true
          });
 
          // B. If error says "expired", lock the chat
          if ((response as any).error && (response as any).error.toLowerCase().includes('expired')) {
            this.isCreditExpired = true;
          }
 
          // C. STOP EXECUTION IMMEDIATELY. Do not add AI bubble.
          return;
        }
        // ➤ CRITICAL CHANGE ENDS HERE ------------------------------------
 
        this.isLoading = false;
        this.isProcessingRequest = false;
        this.currentSubscription = null;
 
         if (response.is_visualization && response.visualization_suggestion) {
  console.log('📊 Backend indicated visualization request:', response.visualization_suggestion);
  this.handleChartRequest(englishMessage, response.visualization_suggestion);
} else {
  const langCode = this.selectedLanguage.split('-')[0];
  
  if (langCode !== 'en' && response.response) {
    const translationReq: TranslationRequest = {
      text: response.response,
      target_language: langCode,
      source_language: 'en'
    };
    
    this.chatService.translateText(translationReq).pipe(takeUntil(this.destroy$)).subscribe({
      next: (transRes: TranslationResponse) => {
        if (transRes.success && transRes.translated_text) {
          response.response = transRes.translated_text;
        }
        this.handleChatResponse(response, englishMessage, 0);
      },
      error: (err) => {
        console.error('Translation back error:', err);
        this.handleChatResponse(response, englishMessage, 0);
      }
    });
  } else {
    this.handleChatResponse(response, englishMessage, 0);
  }
}
      },
      error: (error: any) => {
        this.isLoading = false;
        this.isProcessingRequest = false;
        this.currentSubscription = null;
        this.addMessage('KalpitaNexa', `❌ Error: ${error.message}`);
        this.errorOccurred.emit(error.message);
      }
    });
 
    this.selectedFiles = [];
    this.fileNames = [];
  }
 


  private uploadFilesWithRBAC(files: File[], totalFiles: number, userQuery: string): void {
    this.isLoading = true;
    this.isProcessingRequest = true;

    console.log(`📎 Uploading files with query: "${userQuery}"`);

    const displayMessage = userQuery.trim() || `Uploaded: ${this.fileNames.join(', ')}`;

    this.currentSubscription = this.chatService.uploadAndSummarizeWithRBAC(
      files,
      {
        client_id: this.clientId || 'kalpita-recruit',
        user_id_token: this.userId || this.userEmail || 'anonymous',
        user_role: this.userRole || 'User',
        user_email: this.userEmail || '',
        data_sources: [],
        generate_summary: true
      },
      userQuery,
      this.TenantId,
      this.appId ? parseInt(this.appId) : null
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: ChatResponse) => {
          this.isLoading = false;
          this.isProcessingRequest = false;
          this.currentSubscription = null;
          console.log('📎 Upload response received:', response);

          this.handleChatResponse(response, displayMessage, totalFiles);
          this.clearFileInput();
        },
        error: (error: any) => {
          this.isLoading = false;
          this.isProcessingRequest = false;
          this.currentSubscription = null;
          console.error('📎 Upload error:', error);
          this.addMessage('KalpitaNexa', `❌ Error uploading files: ${error.message || 'Unknown error occurred'}`);
          this.errorOccurred.emit(error.message);
          this.clearFileInput();
        }
      });
  }


  private extractDocumentSummary(responseText: string): string | null {
    const sections = responseText.split(/📄 \*\*/);
    for (const section of sections) {
      if (section.includes('SharePoint:') || section.includes('SQL Database:') || section.includes('Web Search:') || section.includes('Kalpita Policy:')) {
        const colonIndex = section.indexOf(':');
        if (colonIndex !== -1) {
          const content = section.substring(colonIndex + 1).split('📄')[0].trim();
          if (content.includes(this.fileNames[0]) || content.includes('uploaded document')) {
            return content;
          }
        }
      }
    }
    return null;
  }

  private sendFollowUpSummaryRequest(fileName: string): void {
    console.log('📎 Sending follow-up request for document-only summary');
    const summaryRequest = `Please summarize ONLY the uploaded document: ${fileName}. Do not search any other data sources.`;
    this.isLoading = true;
    this.chatService.sendQuery(
      summaryRequest,
      parseInt(this.appId!),
      this.TenantId ?? null,         // Pass tenantId, fallback to null
      this.clientId,
      this.userEmail || this.userId || null,
      [], // data_sources
      this.userRole,
      this.userEmail,
      this.selectedModel             // 8. model
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: ChatResponse) => {
          this.isLoading = false;
          if (response && response.response) {
            let cleanedResponse = response.response.replace(/📄 \*\*[^:]+:\*\*/g, '');
            this.addMessage('KalpitaNexa', `📄 **Document Summary:**\n\n${cleanedResponse.trim()}`, 'text', undefined, response.citations);
          }
        },
        error: (error: any) => {
          this.isLoading = false;
          console.error('Summary generation error:', error);
          this.addMessage('KalpitaNexa', `✅ Document uploaded successfully. You can now ask questions about it.`);
        }
      });
  }

  private hasMultipleChartTypes(message: string): boolean {
    const chartTypePatterns = [/\bbar\s+chart\b/gi, /\bpie\s+chart\b/gi, /\bline\s+chart\b/gi, /\bdoughnut\s+chart\b/gi, /\bdoughut\s+chart\b/gi, /\bradar\s+chart\b/gi, /\bscatter\s+chart\b/gi];
    const foundTypes = new Set<string>();
    chartTypePatterns.forEach(pattern => {
      if (pattern.test(message)) {
        pattern.lastIndex = 0;
        foundTypes.add(pattern.source);
      }
    });
    return foundTypes.size >= 2;
  }

  private handleChatResponse(response: ChatResponse, originalMessage: string, totalFiles: number = 0): void {
    console.log('Handling response:', JSON.stringify(response, null, 2));
    console.log('Selected data sources during response handling:', this.selectedDataSources);
    if (!response) {
      this.addMessage('KalpitaNexa', `❌ No response received from server`);
      return;
    }
    let messageContent = '';
    const citations = response.citations || [];
    const responseText = response.response || '';
    const databaseMessageId = response.message_id;
    const isKalpitaPolicyResponse = response.services_used?.includes('kalpitapolicy');
    const hasStructuredSections = responseText.includes('📄 **SharePoint:**') || responseText.includes('📄 **SQL Database:**') || responseText.includes('📄 **Web Search:**') || responseText.includes('📄 **Brave:**') || responseText.includes('📄 **Kalpitapolicy:**');
    const hasCitations = response.citations && response.citations.length > 0;
    console.log('Response analysis:', { hasStructuredSections, hasCitations, citationsCount: response.citations?.length || 0, isKalpitaPolicyResponse, servicesUsed: response.services_used });

    if (totalFiles > 0) {
      const fileSummaries = responseText ? responseText.split(/📄 \*\*[^\n]*:/).filter(summary => summary.trim()).length : 0;
      if (fileSummaries > 0) messageContent += `🟢 Successfully processed: ${fileSummaries}/${totalFiles} file${totalFiles > 1 ? 's' : ''}\n\n`;
      if (response.error && fileSummaries < totalFiles) messageContent += `❌ ${response.error}\n` + `🟡 Partially processed: ${fileSummaries}/${totalFiles} file${totalFiles > 1 ? 's' : ''}\n\n`;
    }

    if (hasStructuredSections && hasCitations) {
      console.log('Processing structured response with inline citations');
      messageContent += this.injectCitationsIntoSections(responseText, response.citations || []);
    } else if (hasStructuredSections && !hasCitations) {
      messageContent += responseText;
    } else if (response.services_used && response.services_used.length === 1) {
      console.log('Processing single service response');
      const service = response.services_used[0];
      const noInfoPatterns = [/no candidates found/i, /no information found/i, /do not contain information/i, /no results found/i, /could not find/i];
      const hasNoInfo = noInfoPatterns.some(pattern => pattern.test(responseText));

      if (service === 'sharepoint') messageContent += `📄 **SharePoint:**\n`;
      else if (service === 'sql') messageContent += `📄 **SQL Database:**\n`;
      else if (service === 'brave' || service === 'web') messageContent += `📄 **Web Search:**\n`;
      else if (service === 'brave_linkedin') messageContent += `📄 **LinkedIn Search:**\n`;
      else if (service === 'kalpitapolicy') messageContent += `📄 **Kalpita Policy:**\n`;

      messageContent += responseText;
      if (hasCitations && !hasNoInfo) {
        const serviceCitations = this.filterCitationsByService(response.citations || [], service);
        if (serviceCitations.length > 0) messageContent += '\n' + this.formatCitationsAsBulletList(serviceCitations);
      }
    } else {
      console.log('Processing conversational/default response');
      messageContent = responseText;
      if (hasCitations) messageContent += this.formatCitationsAsBulletList(response.citations || []);
    }

    let followUpQuestions = response.follow_up_questions || [];
    if (response.is_visualization && response.visualization_suggestion) {
      console.log('🎯 Backend indicated this is a visualization request');
      const statusIndicator = this.backendStatus === 'connected' ? '🟢' : this.backendStatus === 'offline' ? '🔴' : '🟡';
      const visMessage = response.response ? `${statusIndicator} ${response.response}\n\n` : `${statusIndicator} I'll generate a visualization for you.\n\n`;
      messageContent = visMessage + messageContent;
    }
    if ((response as any).message_type === 'audio') {
      const audioMsg: Message = {
        name: 'KalpitaNexa',
        message: (response as any).response || '',
        timestamp: new Date(),
        messageType: 'audio' as any,
        audioUrl: (response as any).audio_url,
        audioTopic: (response as any).audio_topic,
        audioSession: (response as any).audio_session,
        messageId: this.generateMessageId(),
      };
      this.messages.push(audioMsg);
      this.scrollToBottomImmediate();
    } else if (messageContent.trim()) {
      this.addMessage('KalpitaNexa', messageContent, 'text', undefined, citations, followUpQuestions, undefined, databaseMessageId);
    }
    if (databaseMessageId) {
      for (let i = this.messages.length - 1; i >= 0; i--) {
        const msg = this.messages[i];
        if (msg.name === 'User' && !msg.messageId) {
          msg.messageId = databaseMessageId;
          console.log(`✅ Synced user message at index ${i} with DB ID: ${databaseMessageId}`);
          break;
        }
      }
    } else {
      console.warn("⚠️ Backend did not return a message_id. Feedback actions for this message will fail.");
    }
    if (!this.isOpen) this.unreadCount++;
  }

  private storeUserMessageInDatabase(userMessage: string, userEmail: string): void {
    console.log('💾 Storing user message for:', userEmail);
  }

  private storeMessageInDatabaseWithResponse(userMessage: string, aiResponse: string, citationCount: number, userEmail: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!userEmail) {
        console.error('❌ No user email provided for storing message');
        reject('No user email available');
        return;
      }
      const userTokens = this.countTokens(userMessage);
      const responseTokens = this.countTokens(aiResponse);
      const insertRequest: StoreMessageRequest = {
        user_id_token: userEmail,
        client_id: this.clientId || this.appId || 'kalpita-recruit',
        user_message: userMessage,
        ai_response: aiResponse,
        prompt_tokens: userTokens,
        response_tokens: responseTokens,
        is_favorited: false,
        is_pinned: false,
        is_flagged: false,
        visibility: 'private' as 'private' | 'public'
      };
      this.chatHistoryService.storeMessage(insertRequest).pipe(takeUntil(this.destroy$)).subscribe({
        next: (response: StoreMessageResponse) => {
          if (response.success && response.message_id) {
            resolve(response.message_id);
          } else {
            reject(response.error || 'Failed to store message');
          }
        },
        error: (error: any) => reject(error.message || 'Database error')
      });
    });
  }

  private injectCitationsIntoSections(responseText: string, citations: Citation[]): string {
    if (!citations || citations.length === 0) return responseText;
    const sections = responseText.split(/(?=📄 \*\*)/);
    let result = '';
    for (const section of sections) {
      if (!section.trim()) continue;
      const noInfoPatterns = [/no candidates found/i, /no information found/i, /do not contain information/i, /no information related/i, /no results found/i, /I'm sorry, but there is no information/i, /I'm sorry, but it seems that/i, /could not find/i, /unable to find/i];
      const hasNoInfo = noInfoPatterns.some(pattern => pattern.test(section));
      result += section;
      if (!hasNoInfo && !section.includes('• ')) {
        let sectionCitations: Citation[] = [];
        if (section.includes('📄 **SharePoint:**')) sectionCitations = this.filterCitationsByService(citations, 'sharepoint');
        else if (section.includes('📄 **SQL Database:**')) sectionCitations = this.filterCitationsByService(citations, 'sql');
        else if (section.includes('📄 **Web Search:**') || section.includes('📄 **Brave:**')) sectionCitations = this.filterCitationsByService(citations, 'brave');
        else if (section.includes('📄 **Kalpita Policy:**') || section.includes('📄 **Kalpitapolicy:**')) sectionCitations = this.filterCitationsByService(citations, 'kalpitapolicy');
        if (sectionCitations.length > 0) result += this.formatCitationsAsBulletList(sectionCitations);
      }
      if (!section.endsWith('\n')) result += '\n';
    }
    return result;
  }

  private filterCitationsByService(citations: Citation[], service: string): Citation[] {
    const filtered = citations.filter(citation => {
      const sourceType = (citation.source_type || '').toLowerCase();
      switch (service) {
        case 'sharepoint': return sourceType.includes('sharepoint') && !sourceType.includes('kalpita');
        case 'sql': return sourceType.includes('sql') || sourceType.includes('database');

        case 'brave': case 'web': case 'brave_linkedin': return sourceType.includes('brave') || sourceType.includes('web') || sourceType.includes('search');
        case 'kalpitapolicy': case 'policy': return sourceType.includes('kalpita') || sourceType.includes('policy');
        default: return false;
      }
    });
    return filtered.filter(c => c.title && c.title.trim() !== '' && (c.url || c.content)).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5);
  }

  private formatCitationsAsBulletList(citations: Citation[]): string {
    if (!citations || citations.length === 0) return '';
    const uniqueCitations = this.removeDuplicateCitations(citations).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 5);
    if (uniqueCitations.length === 0) return '';
    let citationHtml = `<div class="citation-container"><span class="citation-info-icon" title="Sources (Top ${uniqueCitations.length} relevant sources)">Sources:</span><span class="citation-numbered-list">`;
    citationHtml += uniqueCitations.map((citation, index) => {
      const scoreText = citation.score !== undefined && citation.score !== null ? `(score: ${citation.score.toFixed(2)})` : '';
      const tooltip = `${citation.title} ${scoreText}`.trim();
      return citation.url ? `<a href="${citation.url}" target="_blank" class="citation-number" title="${tooltip}">(${index + 1})</a>` : `<span class="citation-number non-clickable" title="${tooltip}">(${index + 1})</span>`;
    }).join(', ');
    citationHtml += `</span></div>`;
    return citationHtml;
  }

  private storeMessageInDatabaseFirst(userMessage: string, aiResponse: string, citationCount: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const userEmail = this.getUserEmailFromSession() || this.userEmail || this.authToken;
      if (!userEmail) {
        reject('No user email available');
        return;
      }
      const userTokens = this.countTokens(userMessage);
      const responseTokens = this.countTokens(aiResponse);
      const insertRequest: StoreMessageRequest = {
        user_id_token: userEmail,
        client_id: this.appId || this.clientId || 'web-client',
        user_message: userMessage,
        ai_response: aiResponse,
        prompt_tokens: userTokens,
        response_tokens: responseTokens,
        is_favorited: false,
        is_pinned: false,
        is_flagged: false,
        visibility: 'private' as 'private' | 'public'
      };
      this.chatHistoryService.storeMessage(insertRequest).pipe(takeUntil(this.destroy$)).subscribe({
        next: (response: StoreMessageResponse) => {
          if (response.success && response.message_id) {
            resolve(response.message_id);
          } else {
            reject(response.error || 'Failed to store message');
          }
        },
        error: (error: any) => reject(error.message || 'Database error')
      });
    });
  }

  private getUserEmailFromSession(): string | null {
    try {
      const userEmail = sessionStorage.getItem('userEmail');
      if (userEmail) return userEmail;
      if (this.userEmail) return this.userEmail;
      const msalKeys = Object.keys(sessionStorage).filter(key => key.includes('msal') && key.includes('account'));
      if (msalKeys.length > 0) {
        const accountData = sessionStorage.getItem(msalKeys[0]);
        if (accountData) {
          const parsed = JSON.parse(accountData);
          const email = parsed.username || parsed.preferred_username || parsed.email;
          if (email) return email;
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  private countTokens(text: string): number {
    return Math.ceil((text || '').length / 4);
  }

  trackByMessageIndex(index: number, message: Message): any {
    return message.messageId || message.timestamp?.getTime() || index;
  }

  private generateMessageId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private removeDuplicateCitations(citations: Citation[]): Citation[] {
    const seen = new Set();
    return citations.filter(citation => {
      const key = `${citation.title}-${citation.url}-${citation.score}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private handleChartRequest(message: string, visualizationSuggestion: string): void {
    console.log('📊 Starting chart generation for:', message);
    this.isGeneratingChart = true;
    this.isProcessingRequest = true;
    let chartType = 'auto';
    if (visualizationSuggestion) {
      const match = visualizationSuggestion.match(/chart_type:(\w+)/);
      if (match) chartType = match[1];
    }
    if (chartType === 'auto') chartType = this.detectChartType(message) || 'pie';
    const chartRequest: VisualizationRequest = {
      query: message,
      chart_type: chartType,
      data_sources: this.selectedDataSources.filter(ds => ds !== 'all'),
      max_results: 5
    };
    this.currentSubscription = this.chatService.generateVisualization(chartRequest)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (chartResponse: VisualizationResponse) => {
          this.isGeneratingChart = false;
          this.isProcessingRequest = false;
          this.currentSubscription = null;
          if (chartResponse.success && chartResponse.chart_data) {
            this.handleChartResponse(chartResponse, message);
          } else {
            this.addMessage('KalpitaNexa', '❌ Unable to generate the chart. Please check if the data is available.');
          }
        },
        error: (error: any) => {
          this.isGeneratingChart = false;
          this.isProcessingRequest = false;
          this.currentSubscription = null;
          this.addMessage('KalpitaNexa', '❌ Unable to generate the chart. Please try rephrasing your request.');
        }
      });
  }

  private handleChartResponse(chartResponse: VisualizationResponse, originalMessage: string): void {
    if (!chartResponse || !chartResponse.success || !chartResponse.chart_data) {
      this.addMessage('KalpitaNexa', '❌ Unable to generate the chart. The response format is invalid.');
      return;
    }
    const chartData = chartResponse.chart_data;
    if (!chartData.labels || !chartData.datasets || chartData.datasets.length === 0) {
      this.addMessage('KalpitaNexa', '❌ The chart data is incomplete. Please try a different query.');
      return;
    }
    this.addMessage('KalpitaNexa', '✅ Here\'s your chart:', 'chart', chartData);
    if (chartData.insights && chartData.insights.length > 0) {
      const insightsMessage = chartData.insights.join('\n• ');
      this.addMessage('KalpitaNexa', `📊 Key Insights:\n• ${insightsMessage}`);
    }
  }

  private addMessage(sender: string, content: string, messageType: 'text' | 'chart' | 'loading' = 'text',
    chartData?: any, citations?: Citation[], followUpQuestions?: string[], cssClass?: string,
    messageId?: string): void {
    let detectedCssClass = cssClass;
    if (!detectedCssClass && sender === 'KalpitaNexa') {
      if (content.toLowerCase().includes('welcome') || content.includes('I\'m KalpitaNexa')) detectedCssClass = 'welcome';
      else if (content.toLowerCase().includes('hello') || content.toLowerCase().includes('hi there')) detectedCssClass = 'greeting';
      else if (content.includes('❌') || content.includes('Error') || content.includes('Failed')) detectedCssClass = 'error';
      else if (content.includes('✅') || content.includes('Successfully') || content.includes('🟢')) detectedCssClass = 'success';
      else if (!citations || citations.length === 0) detectedCssClass = 'conversational';
    }
    const finalMessageId = messageId || (sender === 'KalpitaNexa' ? this.generateMessageId() : undefined);
    const message: Message = {
      name: sender,
      message: content,
      timestamp: new Date(),
      isChart: messageType === 'chart',
      chartData,
      messageType,
      citations,
      followUpQuestions,
      cssClass: detectedCssClass,
      messageId: finalMessageId,
      is_favorited: false,
      is_pinned: false,
      is_flagged: false,
      visibility: 'private'
    };
    this.messages.push(message);
    this.scrollToBottomImmediate();
  }

  scrollToBottom(): void {
    this.scrollToBottomImmediate();
  }

  private scrollToBottomImmediate(): void {
    setTimeout(() => {
      if (this.chatMessages && this.chatMessages.nativeElement) {
        const element = this.chatMessages.nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    }, 0);
  }

  isInputEnabled(): boolean {
    return !this.showLogin && !this.isLoading && !this.isGeneratingChart && !this.isProcessingRequest && !this.isCreditExpired && this.backendStatus === 'connected';
  }

  getInputPlaceholder(): string {
    if (this.isGeneratingChart) return 'Generating chart...';
    if (this.isLoading) return 'Processing...';
    if (this.backendStatus === 'offline') return 'Backend offline - check connection...';
    return this.fileNames.length > 0 ? `Selected files: ${this.fileNames.join(', ')}` : 'How can I help you today?';
  }

  public openChatbot(): void {
    this.isOpen = true;
    this.unreadCount = 0;
    this.scrollToBottomImmediate();
  }

  public closeChatbot(): void {
    this.isOpen = false;
    this.setMaximize(false);
    // this.showLogin = true;
  }

  openMaximizedChart(chartData: ChartConfig): void {
    this.selectedChartData = chartData;
  }

  closeMaximizedChart(): void {
    this.selectedChartData = null;
  }

  sanitizeUrl(url: string | undefined): SafeUrl {
    return url ? this.sanitizer.bypassSecurityTrustUrl(url) : '';
  }

  triggerFileInput(): void {
    if (this.fileUpload && this.fileUpload.nativeElement) {
      this.fileUpload.nativeElement.click();
    }
  }

  public onFileSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target && target.files && target.files.length > 0) {
      this.handleFiles(target.files);
    }
  }

  public clearFileInput(): void {
    const fileInput = document.getElementById('file-upload') as HTMLInputElement | null;
    if (fileInput) {
      fileInput.value = '';
    }
    this.selectedFiles = [];
    this.fileNames = [];
  }

  autoAdjustTextarea(): void {
    const textarea = this.messageInput.nativeElement;
    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, 200);
    textarea.style.height = `${newHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 100 ? 'auto' : 'hidden';
    if (this.isTextareaExpanded) {
      textarea.style.height = '200px';
      textarea.style.overflowY = 'auto';
    }
  }

  toggleTextareaExpansion(): void {
    this.isTextareaExpanded = !this.isTextareaExpanded;
    this.autoAdjustTextarea();
    if (this.messageInput) this.messageInput.nativeElement.focus();
  }

  // This is the new, corrected version
  toggleAttachDropdown(event: MouseEvent): void {
    event.stopPropagation();
    const wasOpen = this.showAttachDropdown;
    this.closeAllDropdowns();
    if (!wasOpen) {
      this.showAttachDropdown = true;
    }
  }

  triggerFileUpload(event: MouseEvent): void {
    event.stopPropagation();
    this.showAttachDropdown = false;
    this.triggerFileInput();
  }
  private extractQuizTopic(message: string): string | null {
    const patterns = [
      /test\s+me\s+on\s+(.+)/i,
      /quiz\s+me\s+on\s+(.+)/i,
      /can\s+(?:you|u)\s+test\s+me\s+on\s+(.+)/i,
      /test\s+my\s+knowledge\s+on\s+(.+)/i,
      /give\s+me\s+(?:a\s+)?quiz\s+on\s+(.+)/i,
      /knowledge\s+check\s+on\s+(.+)/i,
    ];
    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) return match[1].replace(/[?!.]+$/, '').trim();
    }
    return null;
  }
  sendFollowUpQuestion(question: string): void {
    const quizPrefix = 'Test my knowledge on ';
    if (question.startsWith(quizPrefix)) {
      const topic = question.replace(quizPrefix, '').trim();
      this.openQuizModal(topic);
      return;
    }
    this.inputMessage = question;
    this.sendMessage();
  }
  openQuizModal(topic: string): void {
  this.isLoadingQuiz = true;

  const quizMessage: Message = {
    name: 'KalpitaNexa',
    message: '',
    timestamp: new Date(),
    messageType: 'quiz' as any,
    quizData: {
      topic,
      questions: [],
      currentIndex: 0,
      selectedAnswers: [],
      answered: [],
      score: 0,
      finished: false,
      timeLeft: 15,
      timerInterval: null,
      resultsPage: 0
    }
  };
  this.messages.push(quizMessage);
  this.scrollToBottomImmediate();

  this.chatService.getTrainingQuiz(topic).subscribe({
    next: (res) => {
      if (res.success && res.data?.questions?.length) {
        quizMessage.quizData!.questions = res.data.questions;
        quizMessage.quizData!.selectedAnswers = new Array(res.data.questions.length).fill('');
        quizMessage.quizData!.answered = new Array(res.data.questions.length).fill(false);
        this.isLoadingQuiz = false;
        this.startInlineQuizTimer(quizMessage);
      } else {
        this.messages.pop();
        this.isLoadingQuiz = false;
      }
    },
    error: () => {
      this.messages.pop();
      this.isLoadingQuiz = false;
    }
  });
}

startInlineQuizTimer(msg: Message): void {
  if (!msg.quizData) return;
  msg.quizData.timeLeft = 15;
  this.clearInlineQuizTimer(msg);
  msg.quizData.timerInterval = setInterval(() => {
    if (!msg.quizData) return;
    msg.quizData.timeLeft--;
    if (msg.quizData.timeLeft <= 0) {
      this.clearInlineQuizTimer(msg);
      if (!msg.quizData.answered[msg.quizData.currentIndex]) {
        msg.quizData.answered[msg.quizData.currentIndex] = true;
      }
    }
  }, 1000);
}

clearInlineQuizTimer(msg: Message): void {
  if (msg.quizData?.timerInterval) {
    clearInterval(msg.quizData.timerInterval);
    msg.quizData.timerInterval = null;
  }
}

selectInlineAnswer(msg: Message, letter: string): void {
  if (!msg.quizData) return;
  const idx = msg.quizData.currentIndex;
  if (msg.quizData.answered[idx]) return;
  msg.quizData.selectedAnswers[idx] = letter;
  msg.quizData.answered[idx] = true;
  this.clearInlineQuizTimer(msg);
  if (letter === msg.quizData.questions[idx].correct_answer) {
    msg.quizData.score++;
  }
}

nextInlineQuestion(msg: Message): void {
  const qd = msg.quizData!;
  if (qd.currentIndex < qd.questions.length - 1) {
    qd.currentIndex++;
    this.clearInlineQuizTimer(msg);
    this.startInlineQuizTimer(msg);
  } else {
    qd.finished = true;
    qd.resultsPage = 0;
    this.clearInlineQuizTimer(msg);
    this.saveQuizResult(msg);
  }
}

saveQuizResult(msg: Message): void {
  const qd = msg.quizData!;
  const token = sessionStorage.getItem('jwtToken') || sessionStorage.getItem('token') || '';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  this.http.post(
    `${environment.apiUrl}/training/quiz-result`,
    {
      topic: qd.topic,
      score: qd.score,
      total_questions: qd.questions.length,
      tenant_id: this.TenantId || null,
      app_id: this.appId ? parseInt(this.appId) : null
    },
    { headers: new HttpHeaders(headers) }
  ).subscribe({
    next: () => console.log('Quiz result saved'),
    error: (e) => console.error('Failed to save quiz result', e)
  });
}  

  startQuizTimer(): void {
    this.quizTimeLeft = 15;
    this.clearQuizTimer();
    this.quizTimerInterval = setInterval(() => {
      this.quizTimeLeft--;
      if (this.quizTimeLeft <= 0) {
        this.clearQuizTimer();
        if (!this.quizAnswered) {
          this.quizAnswered = true;  // time's up — show correct answer
        }
      }
    }, 1000);
  }

  clearQuizTimer(): void {
    if (this.quizTimerInterval) {
      clearInterval(this.quizTimerInterval);
      this.quizTimerInterval = null;
    }
  }

  selectQuizAnswer(letter: string): void {
    if (this.quizAnswered) return;
    this.selectedAnswer = letter;
    this.quizAnswered = true;
    this.clearQuizTimer();
    if (letter === this.quizQuestions[this.currentQuizIndex].correct_answer) {
      this.quizScore++;
    }
  }

  nextQuizQuestion(): void {
    if (this.currentQuizIndex < this.quizQuestions.length - 1) {
      this.currentQuizIndex++;
      this.selectedAnswer = '';
      this.quizAnswered = false;
      this.startQuizTimer();
    } else {
      this.quizFinished = true;
      this.clearQuizTimer();
    }
  }

  closeQuizModal(): void {
    this.clearQuizTimer();
    this.showQuizModal = false;
    this.quizQuestions = [];
    this.quizFinished = false;
  }

  onDashboardReady(): void {
    this.hasDashboardData = true;
    if (!this.isOpen) this.unreadCount++;
  }

  onDashboardError(error: string): void {
    this.addMessage('KalpitaNexa', `❌ Dashboard generation failed: ${error}`);
    this.errorOccurred.emit(error);
  }

  closeDashboard(): void {
    this.showDashboard = false;
    this.hasDashboardData = false;
    this.addMessage('KalpitaNexa', '📊 Dashboard closed.');
    if (this.isOpen && this.messageInput) {
      setTimeout(() => this.messageInput.nativeElement.focus(), 100);
    }
    if (!this.wasMaximizedBeforeModal) {
      this.setMaximize(false);

    }

  }

  toggleDashboard(): void {
    this.showDashboard = !this.showDashboard;
    this.addMessage('KalpitaNexa', this.showDashboard ? '📊 Dashboard reopened.' : '📊 Dashboard minimized.');
  }

  private isTemplateWorthyQuery(message: string): boolean {
    const totalRequests = this.countChartRequests(message);
    if (message.toLowerCase().includes('dashboard')) return true;
    const complexityIndicators = [/comprehensive/gi, /detailed\s+analysis/gi, /full\s+report/gi, /complete\s+overview/gi, /multiple\s+charts?/gi, /various\s+charts?/gi];
    const hasComplexityIndicator = complexityIndicators.some(pattern => pattern.test(message));
    return (this.hasMultipleChartTypes(message) && totalRequests >= 2) || totalRequests >= 2 || hasComplexityIndicator;
  }

  private countChartRequests(message: string): number {
    if (!message || typeof message !== 'string' || message.length === 0) return 0;
    const explicitChartPatterns = [/\bbar\s+chart\b/gi, /\bpie\s+chart\b/gi, /\bline\s+chart\b/gi, /\bdoughnut\s+chart\b/gi, /\bdoughut\s+chart\b/gi, /\bradar\s+chart\b/gi, /\bscatter\s+chart\b/gi];
    let explicitCount = 0;
    explicitChartPatterns.forEach(pattern => {
      const matches = message.match(pattern);
      if (matches) explicitCount += matches.length;
    });
    if (explicitCount > 0) return explicitCount;
    const generalPatterns = [/\bchart\b/gi, /\bgraph\b/gi, /\bvisualization\b/gi, /\bvisualize\b/gi];
    let hasGeneralRequest = false;
    generalPatterns.forEach(pattern => {
      if (pattern.test(message)) hasGeneralRequest = true;
    });
    return hasGeneralRequest ? 1 : 0;
  }

  onTemplateSelected(event: { template: TemplateOption; query: string }): void {
    this.showTemplateSelection = false;
    this.selectedTemplate = event.template;
    this.predefinedDashboardQuery = event.query;
    this.showPredefinedDashboard = true;
    this.addMessage('KalpitaNexa', `🎯 Generating ${event.template.name} dashboard...`);

    this.wasMaximizedBeforeModal = this.isMaximized;
    this.setMaximize(true);

  }

  onTemplateSelectionCancelled(): void {
    this.showTemplateSelection = false;
    this.templateQuery = '';
    this.addMessage('KalpitaNexa', '🎯 Template selection cancelled.');
    if (this.isOpen && this.messageInput) {
      setTimeout(() => this.messageInput.nativeElement.focus(), 100);
    }
  }

  onDynamicDashboardSelected(query: string): void {
    this.showTemplateSelection = false;
    this.templateQuery = '';
    this.showDashboard = true;
    this.dashboardQuery = query;
    this.hasDashboardData = true;
    this.addMessage('KalpitaNexa', '🎯 Generating dynamic dashboard instead...');

    this.wasMaximizedBeforeModal = this.isMaximized;
    this.setMaximize(true);

  }

  onPredefinedDashboardReady(): void {
    this.addMessage('KalpitaNexa', `✅ ${this.selectedTemplate?.name} dashboard generated!`);
    if (!this.isOpen) this.unreadCount++;
  }

  onPredefinedDashboardError(error: string): void {
    this.addMessage('KalpitaNexa', `❌ Predefined dashboard failed: ${error}`);
    this.errorOccurred.emit(error);
  }

  closePredefinedDashboard(): void {
    this.showPredefinedDashboard = false;
    this.selectedTemplate = null;
    this.predefinedDashboardQuery = '';
    this.hasDashboardData = false;
    this.dashboardData = [];
    this.addMessage('KalpitaNexa', '🎯 Predefined dashboard closed.');
    if (this.isOpen && this.messageInput) {
      setTimeout(() => this.messageInput.nativeElement.focus(), 100);
    }

    if (!this.wasMaximizedBeforeModal) {
      this.setMaximize(false);

    }
  }

  toggleChatHistory(): void {
    this.showChatHistory = !this.showChatHistory;
    if (this.showChatHistory) {
      const userEmail = this.getUserEmailFromSession() || this.userEmail || this.authToken;
      if (userEmail) {
        this.chatHistoryService.setUserIdToken(userEmail);
        this.authToken = userEmail;
      }

      // Auto-maximize for modal
      this.wasMaximizedBeforeModal = this.isMaximized;
      this.setMaximize(true);
      this.pushModalState();
    }
  }

  onHistoryClose(): void {
    this.showChatHistory = false;

    // Restore previous maximize state
    this.setMaximize(this.wasMaximizedBeforeModal);
  }

  onHistoryMessageSelected(message: ChatMessage): void {
    this.inputMessage = message.user_message;
    if (this.messageInput && this.messageInput.nativeElement) {
      this.messageInput.nativeElement.value = message.user_message;
      this.autoAdjustTextarea();
      setTimeout(() => {
        this.messageInput.nativeElement.focus();
        const length = this.messageInput.nativeElement.value.length;
        this.messageInput.nativeElement.setSelectionRange(length, length);
      }, 100);
    }
    this.showChatHistory = false;
  }

  onMessageHover(index: number | null): void {
    if (this.editingMessageIndex !== null) return;
    this.hoveredMessageIndex = index;
  }

  toggleMessageFavorite(messageIndex: number, event: Event): void {
    event.stopPropagation();
    const message = this.messages[messageIndex];
    if (!message) return;

    // --- START OF CORRECTED CODE ---
    // Single, correct authorization check
    const userEmail = this.getUserEmailFromSession() || this.userEmail;
    if (!userEmail || !this.TenantId || !this.appId) {
      this.addMessage('KalpitaNexa', '❌ Please login to use this feature.');
      return;
    }

    let aiMessage: Message | null = null;
    if (message.name === 'User') {
      for (let i = messageIndex + 1; i < this.messages.length; i++) {
        if (this.messages[i].name === 'KalpitaNexa') {
          aiMessage = this.messages[i];
          break;
        }
      }
    }

    const messageIdToUpdate = aiMessage?.messageId || message.messageId;
    if (!messageIdToUpdate) {
      this.addMessage('KalpitaNexa', '❌ Cannot update favorite. Message is not synced.');
      return;
    }

    const newFavoriteState = !message.is_favorited;

    // Call the secure updateMessage method with the full payload
    this.chatHistoryService.updateMessage({
      message_id: messageIdToUpdate,
      user_id_token: userEmail,
      tenant_id: this.TenantId,
      app_id: parseInt(this.appId),
      is_favorited: newFavoriteState
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        if (response.success) {
          message.is_favorited = newFavoriteState;
          if (aiMessage) aiMessage.is_favorited = newFavoriteState;
          this.addMessage('KalpitaNexa', newFavoriteState ? '⭐ Added to favorites!' : '⭐ Removed from favorites.');
        } else {
          this.addMessage('KalpitaNexa', `❌ Error: ${response.error || 'Failed to update favorite.'}`);
        }
      },
      error: (err) => {
        this.addMessage('KalpitaNexa', '❌ A network error occurred while updating favorite status.');
      }
    });

  }

  toggleMessageVisibility(messageIndex: number, event: Event): void {
    event.stopPropagation();
    const message = this.messages[messageIndex];
    if (!message) return;

    // 1. Get IDs: Email for Chat Records, GUID for Approval Workflow
    const userEmail = this.userEmail || sessionStorage.getItem('userEmail');
    const userGuid = this.userId || sessionStorage.getItem('userId'); // GUID from session

    if (!userEmail || !userGuid || !this.TenantId || !this.appId) {
      this.addMessage('KalpitaNexa', '❌ Session expired. Please log in again.');
      return;
    }

    // Find the relevant Chat ID (from the AI response linked to this user question)
    let aiMessage: Message | null = null;
    if (message.name === 'User') {
      for (let i = messageIndex + 1; i < this.messages.length; i++) {
        if (this.messages[i].name === 'KalpitaNexa') {
          aiMessage = this.messages[i];
          break;
        }
      }
    }

    const messageIdToUpdate = aiMessage?.messageId || message.messageId;
    if (!messageIdToUpdate) {
      this.addMessage('KalpitaNexa', '❌ Message not synced. Try again in a moment.');
      return;
    }

    // LOGIC: If currently Private, we want to go Public (Needs Approval)
    if (message.visibility === 'private') {
      this.isLoading = true;
      this.chatHistoryService.requestPublicApproval(messageIdToUpdate, this.TenantId, userGuid)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            if (response.success) {
              message.public_approval_status = 'Pending';
              if (aiMessage) aiMessage.public_approval_status = 'Pending';
              this.addMessage('KalpitaNexa', '⏳ Request submitted to Admin to make this chat public.');
            } else {
              this.addMessage('KalpitaNexa', `❌ ${response.error || 'Failed to submit request.'}`);
            }
            this.isLoading = false;
          },
          error: () => {
            this.addMessage('KalpitaNexa', '❌ Network error during approval request.');
            this.isLoading = false;
          }
        });
    }
    // LOGIC: If currently Public, make it Private (Instant)
    else {
      this.chatHistoryService.updateMessage({
        message_id: messageIdToUpdate,
        user_id_token: userEmail,
        tenant_id: this.TenantId,
        app_id: parseInt(this.appId),
        visibility: 'private'
      }).subscribe({
        next: (response) => {
          if (response.success) {
            message.visibility = 'private';
            message.public_approval_status = 'NotApplicable';
            if (aiMessage) {
              aiMessage.visibility = 'private';
              aiMessage.public_approval_status = 'NotApplicable';
            }
          }
        }
      });
    }
  }

  private syncMessagesWithDatabase(): void {
    const userEmail = this.getUserEmailFromSession() || this.userEmail || this.authToken;
    if (!userEmail) return;
    this.chatHistoryService.getMessagesAndSummary(userEmail)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.messages && response.messages.length > 0) {
            const dbMessages = response.messages;
            for (let i = 0; i < this.messages.length; i++) {
              const localMsg = this.messages[i];
              if (localMsg.name === 'User' && !localMsg.messageId) {
                let aiMessage: Message | null = null;
                for (let j = i + 1; j < this.messages.length; j++) {
                  if (this.messages[j].name === 'KalpitaNexa') {
                    aiMessage = this.messages[j];
                    break;
                  }
                }
                if (aiMessage && !aiMessage.messageId) {
                  const dbMatch = dbMessages.find(dbMsg =>
                    dbMsg.user_message.trim() === localMsg.message.trim() &&
                    this.cleanHtmlForComparison(dbMsg.ai_response) === this.cleanHtmlForComparison(aiMessage!.message)
                  );
                  if (dbMatch) {
                    const messageId = dbMatch.id;
                    localMsg.messageId = messageId;
                    aiMessage.messageId = messageId;
                    localMsg.is_favorited = dbMatch.is_favorited;
                    localMsg.visibility = dbMatch.visibility;
                    aiMessage.is_favorited = dbMatch.is_favorited;
                    aiMessage.visibility = dbMatch.visibility;
                  }
                }
              }
            }
          }
        },
        error: (error) => console.error('❌ Failed to sync messages with database:', error)
      });
  }

  private detectChartType(message: string): string | null {
    if (!message) return null;
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('pie')) return 'pie';
    if (lowerMessage.includes('bar')) return 'bar';
    if (lowerMessage.includes('line')) return 'line';
    if (lowerMessage.includes('doughnut') || lowerMessage.includes('donut')) return 'doughnut';
    if (lowerMessage.includes('radar')) return 'radar';
    if (lowerMessage.includes('scatter')) return 'scatter';
    if (lowerMessage.includes('skill')) return 'pie';
    return null;
  }

  toggleTheme(): void {
    this.isDarkTheme = !this.isDarkTheme;
    this.saveThemePreference();
    this.themeChanged.emit(this.isDarkTheme);
  }

  private saveThemePreference(): void {
    try {
      localStorage.setItem('chatbot-theme', this.isDarkTheme ? 'dark' : 'light');
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    }
  }

  private loadThemePreference(): void {
    try {
      const savedTheme = localStorage.getItem('chatbot-theme');
      if (savedTheme) this.isDarkTheme = savedTheme === 'dark';
      else if (this.theme) this.isDarkTheme = this.theme.toLowerCase().includes('dark');
      else this.isDarkTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (error) {
      this.isDarkTheme = false;
    }
  }

  clearChat(): void {
    this.showClearChatConfirmation = true;
  }

  confirmClearChat(): void {
    const welcomeMessage = this.messages.find(msg => msg.name === 'KalpitaNexa' && (msg.message.includes('Welcome') || msg.message.includes("I'm KalpitaNexa")));
    this.messages = [];
    if (welcomeMessage) {
      this.messages.push(welcomeMessage);
    } else {
      const newWelcomeMessage = this.userEmail ? `Welcome back ${this.userEmail}! I'm KalpitaNexa...` : `Welcome back! I'm KalpitaNexa...`;
      this.addMessage('KalpitaNexa', newWelcomeMessage);
    }
    this.selectedFiles = [];
    this.fileNames = [];
    this.inputMessage = '';
    if (this.messageInput) {
      this.messageInput.nativeElement.value = '';
      this.autoAdjustTextarea();
    }
    this.showDashboard = false;
    this.showTemplateSelection = false;
    this.showPredefinedDashboard = false;
    this.selectedChartData = null;
    this.dashboardQuery = '';
    this.hasDashboardData = false;
    this.dashboardData = [];
    this.showClearChatConfirmation = false;
    this.scrollToTop();
    if (this.messageInput) setTimeout(() => this.messageInput.nativeElement.focus(), 100);
  }

  cancelClearChat(): void {
    this.showClearChatConfirmation = false;
  }

  private scrollToTop(): void {
    setTimeout(() => {
      if (this.chatMessages && this.chatMessages.nativeElement) {
        this.chatMessages.nativeElement.scrollTop = 0;
      }
    }, 0);
  }

  toggleMaximize(): void {
    // Check if running embedded in an iframe (KalpitaRecruit)
    const isEmbedded = window.self !== window.top;

    if (isEmbedded && !this.isMaximized) {
      // Embedded mode: Open in new tab
      this.openInNewTab();
    } else if (this.isPopupMode && this.isMaximized) {
      // Popup mode: Close tab and return to parent
      this.closePopupTab();
    } else {
      // Default behavior for standalone or other scenarios
      this.setMaximize(!this.isMaximized);
    }
  }

  /**
   * Opens KalpitaNexa in a new browser tab with session parameters
   */
  private openInNewTab(): void {
    // Build URL with session parameters
    const baseUrl = window.location.origin;
    const params = new URLSearchParams();

    // Pass session info
    if (this.userEmail) params.set('userEmail', this.userEmail);
    if (this.TenantId) params.set('tenantId', this.TenantId);
    if (this.appId) params.set('appId', this.appId);
    if (this.isDarkTheme) params.set('theme', 'dark');
    params.set('popupMode', 'true'); // Flag to indicate popup mode

    const popupUrl = `${baseUrl}?${params.toString()}`;

    // Open in new tab
    this.popupWindow = window.open(popupUrl, '_blank');

    // Minimize the embedded chatbot (optional: keep it visible but minimized)
    // The embedded version stays as-is; user can continue using it
  }

  /**
   * Closes the popup tab and returns focus to the parent window
   */
  private closePopupTab(): void {
    // Notify parent before closing (optional)
    if (window.opener) {
      window.opener.postMessage({ type: 'POPUP_CLOSED' }, '*');
      window.opener.focus();
    }
    window.close();
  }

  private setMaximize(enable: boolean): void {
    if (this.isMaximized === enable) return;

    this.isMaximized = enable;

    // Notify parent window (Kalpita Recruit) to resize the iframe container
    if (window.parent) {
      window.parent.postMessage({
        type: 'TOGGLE_MAXIMIZE',
        isMaximized: this.isMaximized
      }, '*');
    }

    if (this.isMaximized) {
      const chatbotWindow = document.querySelector('.chatbot-window') as HTMLElement;
      if (chatbotWindow) {
        this.originalPosition = {
          bottom: chatbotWindow.style.bottom || '20px',
          right: chatbotWindow.style.right || '20px',
          width: chatbotWindow.style.width || '420px',
          height: chatbotWindow.style.height || '700px'
        };
      }

      setTimeout(() => {
        if (this.messageInput) {
          this.messageInput.nativeElement.focus();
        }
        this.scrollToBottom();
      }, 300);
    }
    this.saveMaximizePreference();
  }

  private saveMaximizePreference(): void {
    try {
      localStorage.setItem('chatbot-maximized', this.isMaximized.toString());
    } catch (error) {
      console.error('Failed to save maximize preference:', error);
    }
  }

  private loadMaximizePreference(): void {
    try {
      const savedMaximized = localStorage.getItem('chatbot-maximized');
      if (savedMaximized === 'true') {
        // this.isMaximized = true;
      }
    } catch (error) {
      console.error('Failed to load maximize preference:', error);
    }
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardShortcut(event: KeyboardEvent): void {
    if (event.ctrlKey && event.shiftKey && event.key === 'D') {
      event.preventDefault();
      if (this.isOpen) this.clearChat();
    }
    if (event.key === 'F11' || (event.ctrlKey && event.shiftKey && event.key === 'F')) {
      event.preventDefault();
      if (this.isOpen) {
        this.toggleMaximize();
      }
    }

    if (event.key === 'Escape' && this.isMaximized) {
      event.preventDefault();
      this.toggleMaximize();
    }
  }


  getSelectedDataSourceLabel(): string {
    const selectedLabels: string[] = [];
    this.tenantApplications.forEach(app => {
      const selections = this.dataSourceSelections[app.app_id];
      if (!selections) return;

      const selectedForApp = app.data_sources
        .filter(ds => selections[ds.data_source_id])
        .map(ds => ds.data_source_name);

      if (selectedForApp.length > 0) {
        const isAllSelected = selectedForApp.some(name => name.toLowerCase() === 'all');
        const label = isAllSelected ? 'All' : selectedForApp.join(', ');
        selectedLabels.push(`${app.application_name}: ${label}`);
      }
    });

    if (selectedLabels.length === 0) return 'Select Sources';
    return selectedLabels.join('; ');
  }

  private initializeSpeechSynthesizer(): void {
    const audioConfig = SpeechSDK.AudioConfig.fromDefaultSpeakerOutput();
    this.speechSynthesizer = new SpeechSDK.SpeechSynthesizer(this.speechConfig, audioConfig);
  }

  private cleanTextForSpeech(html: string): string {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    let text = tempDiv.textContent || tempDiv.innerText || '';
    return text.replace(/•/g, ', ');
  }

public speakMessage(message: Message, event: Event): void {
    event.stopPropagation();
    if (!message.messageId) return;

    // --- CASE 1: TOGGLE PAUSE/RESUME ---
    // If the same message is already active, just pause/resume the existing player
    if (this.isSpeakingMessageId === message.messageId && this.player) {
      if (!this.isSpeakingPaused) {
        this.player.pause();
        this.isSpeakingPaused = true;
      } else {
        this.player.resume();
        this.isSpeakingPaused = false;
      }
      return;
    }

    // --- CASE 2: HARD STOP & START NEW ---
    // If a different message is clicked, or starting fresh
    this.stopSpeaking();

    // Initialize fresh audio destination and synthesizer
    this.player = new SpeechSDK.SpeakerAudioDestination();
    const audioConfig = SpeechSDK.AudioConfig.fromSpeakerOutput(this.player);
    this.synthesizer = new SpeechSDK.SpeechSynthesizer(this.speechConfig, audioConfig);

    const cleanedText = this.cleanTextForSpeech(message.message);
    const textToSpeak = this.escapeXml(cleanedText);
    const languageCode = this.selectedLanguage;
    const voiceName = this.voiceMap[languageCode] || 'en-US-JennyNeural';
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${languageCode}"><voice name="${voiceName}">${textToSpeak}</voice></speak>`;

    this.isSpeakingMessageId = message.messageId;
    this.isSpeakingPaused = false;

    this.synthesizer.speakSsmlAsync(
      ssml,
      result => {
        // When the audio naturally finishes
        if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
          // Only reset if we haven't already switched to a new message
          if (this.isSpeakingMessageId === message.messageId) {
            this.isSpeakingMessageId = null;
            this.isSpeakingPaused = false;
          }
        }
      },
      err => {
        console.error("Speech synthesis error.", err);
        this.stopSpeaking();
      }
    );
  }

  public stopSpeaking(): void {
    // 1. Close the synthesizer to cancel current synthesis
    if (this.synthesizer) {
      this.synthesizer.close();
      this.synthesizer = null;
    }

    // 2. Close the player to kill the audio buffer in the browser
    if (this.player) {
      this.player.pause(); // Stop current sound
      this.player.close(); // Dispose of the buffer
      this.player = null;
    }

    // 3. Reset UI states
    this.isSpeakingMessageId = null;
    this.isSpeakingPaused = false;
  }

  private escapeXml(text: string): string {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }


  private storeMessagePairInDatabase(userMessage: string, aiResponse: string, userEmail: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!userEmail) {
        reject('No user email available');
        return;
      }
      const userTokens = this.countTokens(userMessage);
      const responseTokens = this.countTokens(aiResponse);
      const normalizedEmail = userEmail.toLowerCase().trim();
      const insertRequest: StoreMessageRequest = {
        user_id_token: normalizedEmail,
        client_id: this.clientId || this.appId || 'kalpita-recruit',
        user_message: userMessage,
        ai_response: aiResponse || 'Pending response...',
        prompt_tokens: userTokens,
        response_tokens: responseTokens,
        is_favorited: false,
        is_pinned: false,
        is_flagged: false,
        visibility: 'private' as 'private' | 'public'
      };
      this.chatHistoryService.storeMessage(insertRequest).pipe(takeUntil(this.destroy$)).subscribe({
        next: (response: StoreMessageResponse) => response.success && response.message_id ? resolve(response.message_id) : reject(response.error || 'Failed to store message'),
        error: (error: any) => reject(error.message || 'Database error')
      });
    });
  }

  private cleanHtmlForComparison(text: string): string {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    return (tempDiv.textContent || tempDiv.innerText || '').trim();
  }

  private ensureUserEmailIsSet(): string | null {
    if (!this.userEmail) {
      const sessionEmail = sessionStorage.getItem('userEmail');
      if (sessionEmail) {
        this.userEmail = sessionEmail;
        this.authToken = sessionEmail;
      }
    }
    if (!this.userEmail) {
      const urlParams = new URLSearchParams(window.location.search);
      const urlEmail = urlParams.get('userEmail');
      if (urlEmail) {
        this.userEmail = urlEmail;
        this.authToken = urlEmail;
        sessionStorage.setItem('userEmail', urlEmail);
      }
    }
    return this.userEmail || null;
  }

  private extractUserDataFromParent(): void {
    const sessionEmail = sessionStorage.getItem('userEmail');
    if (sessionEmail) {
      this.userEmail = sessionEmail;
      this.authToken = sessionEmail;
      this.userId = sessionEmail;
    }
    try {
      const navbarService = (window as any).navbarService;
      if (navbarService) {
        const userData = navbarService.getCompleteUserData();
        if (userData.email) {
          this.userEmail = userData.email;
          this.userId = userData.userId || userData.email;
          this.userRole = userData.role || 'User';
          this.authToken = userData.token || userData.email;
          this.clientId = 'kalpita-recruit';
          if (this.userEmail) sessionStorage.setItem('userEmail', this.userEmail);
          if (this.userEmail) this.chatHistoryService.setUserIdToken(this.userEmail);
          return;
        }
      }
    } catch (e) {
      console.log('NavbarService not available');
    }
    this.extractUserDataFromSession();
  }

  private extractUserDataFromSession(): void {
    const userEmail = sessionStorage.getItem('userEmail') || '';
    const userRole = sessionStorage.getItem('userRole') || sessionStorage.getItem('userRoleName') || '';
    const userId = sessionStorage.getItem('userId') || userEmail;
    if (userEmail) {
      this.userEmail = userEmail;
      this.userRole = userRole || 'User';
      this.userId = userId;
      this.authToken = userEmail;
      this.clientId = 'kalpita-recruit';
      this.chatHistoryService.setUserIdToken(this.userEmail);
    }
  }

  toggleModelDropdown(event: Event): void {
    event.stopPropagation();
    const wasOpen = this.showModelDropdown;
    this.closeAllDropdowns();
    if (!wasOpen) {
      this.showModelDropdown = true;
    }
  }



  saveModelPreference(): void {
    try {
      localStorage.setItem('chatbot-model', this.selectedModel);
    } catch (error) {
      console.error('Failed to save model preference:', error);
    }
  }

  loadModelPreference(): void {
    try {
      const savedModel = localStorage.getItem('chatbot-model');
      // THE FIX: Check for 'model_name' instead of 'id' and remove the 'disabled' check.
      if (savedModel && this.availableModels.some(m => m.model_name === savedModel)) {
        this.selectedModel = savedModel;
      }
    } catch (error) {
      console.error('Failed to load model preference:', error);
    }
  }

  getModelTitle(): string {
    const model = this.availableModels.find(m => m.model_name === this.selectedModel);
    return `Model: ${model ? model.model_name : 'Default'}`;
  }

  getModelButtonLabel(): string {
    const model = this.availableModels.find(m => m.model_name === this.selectedModel);
    if (model) {
      // Simple logic to shorten common names, can be adjusted
      if (model.model_name.toLowerCase().includes('3.5') || model.model_name.toLowerCase().includes('35')) return 'o3-mini';
      if (model.model_name.toLowerCase().includes('4.1')) return 'gpt-4.1';
      return model.model_name.split(' ')[0]; // Return the first word as a fallback
    }
    return 'o3-mini';
  }

  giveFeedback(messageIndex: number, feedbackValue: 1 | -1, event: Event): void {
    event.stopPropagation();
    const message = this.messages[messageIndex];

    // 1. Authorization and Data Validation
    if (!message || !message.messageId) {
      this.addMessage('KalpitaNexa', '❌ Cannot save feedback. This message is not properly synced.');
      return;
    }



    if (!this.userEmail || !this.TenantId || !this.appId) {
      this.addMessage('KalpitaNexa', '❌ Cannot save feedback. Your session is invalid. Please log in again.');
      console.error('Feedback failed: Missing userEmail, TenantId, or appId.', {
        userEmail: this.userEmail,
        tenantId: this.TenantId,
        appId: this.appId
      });
      return;
    }

    // 2. Prepare for API Call (Optimistic UI)
    const newFeedback = message.user_feedback === feedbackValue ? 0 : feedbackValue; // Allows toggling off
    const originalFeedback = message.user_feedback;
    message.user_feedback = newFeedback; // Update UI immediately

    // 3. Construct the New Request Payload
    const request: UpdateChatFeedbackRequest = {
      chat_id: message.messageId,
      user_id: this.userEmail, // Use the user's email, not the GUID
      tenant_id: this.TenantId,
      app_id: parseInt(this.appId, 10),
      feedback: newFeedback
    };

    // 4. Call the Updated Service Method
    this.chatService.updateMessageFeedback(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: UpdateMessageFeedbackResponse) => {
          if (!response.success) {
            // If the API call fails, revert the UI change and show an error
            message.user_feedback = originalFeedback;
            this.addMessage('KalpitaNexa', `❌ Error saving feedback: ${response.error || 'An unknown error occurred.'}`);
          }
          // On success, do nothing, as the UI is already updated.
        },
        error: (err: any) => {
          // On network or other errors, also revert the UI change
          message.user_feedback = originalFeedback;
          this.addMessage('KalpitaNexa', '❌ Could not save feedback due to a network error.');
        }
      });
  }


  getAnimationState(): string {
    return this.isOpen ? 'in' : 'out';
  }
  cancelDataSourceSelection(): void {

    this.showOptionsMenu = false;
    console.log('❌ Data source selection cancelled');
  }
  onSsoFinished(): void {
    this.isHandlingSsoRedirect = false;
    if (!this.userEmail) {
      console.log("SSO validation failed or was cancelled. Displaying login modal.");
      this.showLogin = true;
    }
  }
  private isMsalRedirectInProgress(): boolean {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.includes('msal.') && key.includes('.interaction.status')) {
        return sessionStorage.getItem(key) === 'interaction_in_progress';
      }
    }
    return false;
  }

  toggleAdminPanel(): void {
    this.showAdminPanel = !this.showAdminPanel;
    this.showOptionsMenu = false;

    if (this.showAdminPanel) {
      this.wasMaximizedBeforeModal = this.isMaximized;
      this.setMaximize(true);
    } else {
      if (!this.wasMaximizedBeforeModal) {
        this.setMaximize(false);
      }
    }

  }

  toggleTenants(): void {
    this.showTenants = !this.showTenants;
    if (this.showTenants) {
      const userEmail = this.getUserEmailFromSession() || this.userEmail || this.authToken;
      if (userEmail) {
        console.log('🏢 Opening tenant management for:', userEmail);
      }
    }
  }

  // onTenantsClose(): void {
  //   this.showTenants = false;
  // }

  onTenantsClose(): void {
  this.showTenants = false;
  
  // Restore previous maximize state
  if (!this.wasMaximizedBeforeModal) {
    this.setMaximize(false);
  }

  // WE REMOVED the logic here that was calling sessionStorage.removeItem.
  // Now, the selection "stays" just as you requested.
}

  openChangePasswordModal(): void {
    this.showProfileMenu = false;
    this.showChangePasswordModal = true;
    this.oldPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.changePasswordError = '';
    this.changePasswordSuccess = '';
    this.isChangingPassword = false;
    this.wasMaximizedBeforeModal = this.isMaximized;
    this.setMaximize(true);
    this.pushModalState();
    this.showOldPassword = false;
  this.showNewPassword = false;
  this.showConfirmPassword = false;
  }

  closeChangePasswordModal(): void {
    this.showChangePasswordModal = false;

    if (!this.wasMaximizedBeforeModal) {
      this.setMaximize(false);
    }

  }

  handleChangePassword(form: NgForm): void {
    if (form.invalid) {
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.changePasswordError = 'New passwords do not match.';
      return;
    }

    this.isChangingPassword = true;
    this.changePasswordError = '';
    this.changePasswordSuccess = '';

    const request: ChangePasswordRequest = {
      email: this.userEmail!,
      oldPassword: this.oldPassword,
      newPassword: this.newPassword
    };

    this.chatService.changePassword(request).subscribe({
      next: (response) => {
        this.isChangingPassword = false;
        if (response.success) {
          this.changePasswordSuccess = response.message || 'Password changed successfully!';
          setTimeout(() => {
            this.closeChangePasswordModal();
          }, 2000);
        } else {
          this.changePasswordError = response.error || 'Failed to change password.';
        }
      },
      error: (err) => {
        this.isChangingPassword = false;
        this.changePasswordError = err.error?.detail || "An unexpected server error occurred.";
      }
    });
  }

  // --- MODIFICATION START ---
  // This function is updated to directly open the tenant management modal.
  handleSettingsClick(): void {
  this.showOptionsMenu = false;

  // 1. Simply get the ID and Name that was stored when you picked the tenant card
  const activeId = sessionStorage.getItem('TenantId');
  const activeName = sessionStorage.getItem('selectedTenantName');

  // 2. If an ID exists, open that specific workspace settings (Image 1)
  if (activeId) {
    this.selectedTenant = {
      tenant_id: activeId,
      tenant_name: activeName || 'Current Workspace',
      is_active: true,
      created_on: '',
      created_by: '',
      modified_on: null,
      modified_by: null
    };
  } 
  // 3. Only if NO tenant is selected (fresh login) and user is SuperAdmin, show Global view (Image 2)
  else if (this.isSuperAdmin) {
    this.selectedTenant = null;
  } 
  else {
    this.addMessage('KalpitaNexa', '❌ Please select a workspace first.');
    return;
  }

  this.showTenants = true;
  this.wasMaximizedBeforeModal = this.isMaximized;
  this.setMaximize(true);
  this.pushModalState();
}

  // --- MODIFICATION END ---

  private getUserRoleFromSession(): string | null {
    try {
      const userRole = sessionStorage.getItem('userRole');

      if (userRole) {
        console.log("Successfully found User Role in session storage:", userRole);
        return userRole;
      } else {
        console.warn("The key 'userRole' was not found in session storage.");
        return null;
      }
    } catch (e) {
      console.error("Could not read from session storage:", e);
      return null;
    }
  }

  public formatFileSize(bytes: number, decimals = 2): string {
    if (!+bytes) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  public removeSelectedFile(index: number): void {
    if (index > -1) {
      this.selectedFiles.splice(index, 1);
      this.fileNames.splice(index, 1);
    }
  }

  public onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.isDragging) {
      this.isDragging = true;
    }
  }

  public onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    setTimeout(() => {
      this.isDragging = false;
    }, 50);
  }

  public onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;

    if (event.dataTransfer && event.dataTransfer.files.length > 0) {
      this.handleFiles(event.dataTransfer.files);
    }
  }

  private handleFiles(files: FileList): void {
    const newFiles = Array.from(files);
    const errors: string[] = [];

    newFiles.forEach(file => {
      if (file.size > this.maxFileSize) {
        errors.push(`"${file.name}" exceeds the 10MB limit.`);
        return;
      }
      if (this.fileNames.includes(file.name)) {
        return;
      }
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      const allowedExtensions = ['pdf', 'docx', 'xlsx', 'xls', 'ppt', 'pptx', 'txt', 'png'];
      if (!fileExtension || !allowedExtensions.includes(fileExtension)) {
        errors.push(`"${file.name}": File type not supported.`);
        return;
      }

      this.selectedFiles.push(file);
      this.fileNames.push(file.name);
    });

    if (errors.length > 0) {
      this.addMessage('KalpitaNexa', `⚠️ File selection error:\n${errors.join('\n')}`);
    }
  }

  loadTenantApplications(tenantId: string): void {
    if (!tenantId) {
      console.error("[Chatbot] Cannot load applications: Tenant ID is missing.");
      return;
    }

    console.log(`[Chatbot] Loading context for tenant: ${tenantId}`);

    // We do NOT call getApplicationsForTenant here anymore.
    // Instead, we ensure we have an AppId (or use '0' to fetch defaults) and call the master load function.

    this.establishAppId(); // Sets this.appId from session if available

    // Trigger the master load function
    this.loadPermissionsAndPreferences();
  }

  initializeDataSourceSelections(): void {
  this.dataSourceSelections = {};
  this.expandedGroups = {};
  
  // Use the ID from defaults/session
  const defaultId = this.selectedAppIdForHistory || parseInt(this.appId || '0');

  this.tenantApplications.forEach((app) => {
    this.dataSourceSelections[app.app_id] = {};
    
    // Auto-expand the group for the default app
    this.expandedGroups[app.app_id] = false; 

    if (app.data_sources) {
      app.data_sources.forEach(ds => {
        // If this is the default app, check all its sources by default
        // Otherwise, leave them unchecked
        this.dataSourceSelections[app.app_id][ds.data_source_id] = (app.app_id === defaultId);
      });
    }
  });
}

  toggleDataGroup(appId: number): void {
    this.expandedGroups[appId] = !this.expandedGroups[appId];
  }

  // ++ ADD this new generalized onDataSourceChange method
  onDataSourceChange(appId: number, changedDsId: number, isChecked: boolean): void {
    const appSelections = this.dataSourceSelections[appId];
    if (!appSelections) return;

    if (changedDsId === -1) {
      // User clicked "All"
      const app = this.tenantApplications.find(a => a.app_id === appId);
      if (app && app.data_sources) {
        app.data_sources.forEach(ds => {
          appSelections[ds.data_source_id] = isChecked;
        });
      }
    } else {
      // User clicked an individual source
      if (!isChecked) {
        appSelections[-1] = false; // Uncheck "All"
      } else {
        // If checking, see if we should auto-check "All"
        const app = this.tenantApplications.find(a => a.app_id === appId);
        if (app) {
          const allOthersChecked = app.data_sources
            .filter(ds => ds.data_source_id !== -1)
            .every(ds => appSelections[ds.data_source_id]);
          if (allOthersChecked) appSelections[-1] = true;
        }
      }
    }
  }

  // ** MODIFY this method to use the new dynamic data structure
  applyDataSourceSelection(): void {
    // This method is mainly for updating the UI / Toast message now,
    // as processBackendQuery calculates the actual payload dynamically.

    const activeAppId = this.selectedAppIdForHistory || (this.appId ? parseInt(this.appId) : 0);

    // Update the main AppId based on radio selection
    if (activeAppId) {
      this.appId = activeAppId.toString();
      sessionStorage.setItem('appId', this.appId);

      const app = this.tenantApplications.find(a => a.app_id === activeAppId);
      if (app) {
        sessionStorage.setItem('appName', app.application_name);

        // Reload permissions if switching apps (optional, depending on your flow)
        // this.loadPermissionsAndPreferences(); 
      }
    }

    this.showOptionsMenu = false;
    this.addMessage('KalpitaNexa', `Settings updated. Active App: ${this.getSelectedDataSourceLabel()}`);
  }


  private loadAllAvailableModels(): void {
    this.isLoadingModels = true;
    this.chatService.getModels().subscribe({
      next: (response) => {
        if (response.success && response.models) {

          // this.availableModels = response.models;
          const sortedModels = response.models.sort((a, b) =>
            a.model_name.localeCompare(b.model_name)
          );
          this.availableModels = sortedModels;
          if (!this.availableModels.some(m => m.model_name === this.selectedModel)) {
            this.selectedModel = this.availableModels[0]?.model_name || 'o3-mini';
          }
        } else {
          console.error('[Chatbot] Failed to load models:', response.error);
        }
        this.isLoadingModels = false;
      },
      error: (err) => {
        console.error('[Chatbot] HTTP error loading models:', err);
        this.isLoadingModels = false;
      }
    });
  }

  private loadPersonalizedSettings(profile: UserProfile): void {
    this.personalizeLanguages(profile.languages);
    this.personalizeModels(profile.models);
  }


  private personalizeLanguages(userLanguages: UserProfileLanguage[]): void {
    // This method is now synchronous and efficient.
    this.availableLanguages = userLanguages.map(lang => ({
      language_id: lang.language_id,
      language_name: lang.language_name,
      language_code: this.languageCodeMap[lang.language_name] || 'en-US'
    })).sort((a, b) => a.language_name.localeCompare(b.language_name));

    console.log('✅ Personalized languages set for user:', this.availableLanguages);
  }
  private personalizeModels(userModels: UserProfileModel[]): void {
    // This method is now synchronous and efficient.
    this.availableModels = userModels.map(model => ({
      model_id: model.model_id,
      model_name: model.model_name
    })).sort((a, b) => a.model_name.localeCompare(b.model_name));

    if (!this.availableModels.some(m => m.model_name === this.selectedModel)) {
      this.selectedModel = this.availableModels[0]?.model_name || 'o3-mini';
    }
    console.log('✅ Personalized models set for user:', this.availableModels);
  }


  openSuperAdminDashboard(): void {
  // Clear the specific tenant so the component knows to show the Master List/Dashboard
  sessionStorage.removeItem('selectedTenantId');
  sessionStorage.removeItem('selectedTenantName');
  this.selectedTenant = null; 

  this.showTenants = true;
  this.showTenantSelection = false;
  this.wasMaximizedBeforeModal = this.isMaximized;
  this.setMaximize(true);
}


  // ADD THIS NEW METHOD
  private closeAllDropdowns(): void {
    this.showOptionsMenu = false;
    this.showLanguageDropdown = false;
    this.showModelDropdown = false;
    this.showAttachDropdown = false;
    this.showProfileMenu = false;
    this.showTenantDropdown = false;
  }

  onAppRadioChange(selectedAppId: number): void {
  // Iterate through all applications known to the tenant
  this.tenantApplications.forEach(app => {
    const isThisAppSelected = app.app_id === selectedAppId;
    
    // Check if we have an entry in our selection tracking object for this app
    if (this.dataSourceSelections[app.app_id]) {
      // Iterate through every data source (including the -1 "All" key)
      app.data_sources.forEach(ds => {
        // If this is the active app, check the box. If not, uncheck it.
        this.dataSourceSelections[app.app_id][ds.data_source_id] = isThisAppSelected;
      });
      
      // Explicitly handle the "All" key (-1) if it's not in the data_sources array
      this.dataSourceSelections[app.app_id][-1] = isThisAppSelected;
    }
  });

  console.log(`🎯 Context switched to App ID: ${selectedAppId}. Other apps cleared.`);
}

isApplyDisabled(): boolean {
  // 1. If no radio button is selected, disable Apply
  if (!this.selectedAppIdForHistory) return true;

  // 2. If radio is selected, check if at least one checkbox in that specific app is checked
  const currentAppSelections = this.dataSourceSelections[this.selectedAppIdForHistory];
  if (!currentAppSelections) return true;

  return !Object.values(currentAppSelections).some(val => val === true);
}

@HostListener('window:popstate', ['$event'])
  onPopState(event: any): void {
    console.log('🔙 Browser back button detected');

    // 1. Check if Admin Panel has internal modals open
    if (this.adminPanel && typeof this.adminPanel.hasOpenModal === 'function' && this.adminPanel.hasOpenModal()) {
      if (this.adminPanel.closeLatestModal()) {
        console.log('✅ Child modal closed');
        return; // Don't close the admin panel itself
      }
    }

    // 2. Main overlay layers
    if (this.showAdminPanel) {
      console.log('✅ Closing Admin Panel');
      this.showAdminPanel = false;
    } else if (this.showChatHistory) {
      console.log('✅ Closing Chat History');
      this.showChatHistory = false;
    } else if (this.showTenants) {
      console.log('✅ Closing Settings/Permissions');
      this.showTenants = false;
    } else if (this.showTenantSelection) {
      console.log('✅ Closing Tenant Selection');
      this.showTenantSelection = false;
    } else if (this.showChangePasswordModal) {
      console.log('✅ Closing Password Modal');
      this.showChangePasswordModal = false;
    } else if (this.showOptionsMenu) {
      console.log('✅ Closing Options Menu');
      this.showOptionsMenu = false;
    } else if (this.isOpen) {
      console.log('✅ Closing Chatbot');
      this.closeChatbot();
    } else {
      // Prevent navigation away from the page
      console.log('⚠️ Preventing navigation - staying on current page');
      history.pushState(null, '', window.location.href);
    }
  }

  private pushModalState(): void {
    history.pushState({ modalOpen: true }, '');
  }

}