import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, SimpleChanges, OnChanges } from '@angular/core';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { ChatFilterRequest, ChatHistoryService, ApprovalQueueItem, GetPendingApprovalsResponse, ChatMessage, GetFavoriteChatsResponse, GetMessageSummaryResponse, GetPublicChatsResponse, GetAllUserTaggedChatsResponse, GetUserChatHistoryResponse, MessageSummary, GetQuestionManagerResponse, InsertMessageRequest } from '../../Services/chat-history.service';
import { animate, style, transition, trigger } from '@angular/animations';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

interface Question {
  id: string;
  question: string;
  answer?: string;
  tags: string[];
  visibility: 'public' | 'private';
  is_favorited: boolean;
  is_pinned: boolean;
  is_flagged: boolean;
  timestamp: string;
  user_id?: string;
  prompt_tokens: number;
  response_tokens: number;
  isExpanded?: boolean;
  public_approval_status?: 'Pending' | 'Approved' | 'Rejected' | 'NotApplicable';

  is_approved: boolean;
}

interface Tag {
  name: string;
  count: number;
}

@Component({
  selector: 'app-chat-history',
  templateUrl: './chat-history.component.html',
  styleUrls: ['./chat-history.component.css'],
  animations: [
    trigger('expandCollapse', [
      transition(':enter', [
        style({ height: 0, opacity: 0 }),
        animate('300ms ease-out', style({ height: '*', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('300ms ease-in', style({ height: 0, opacity: 0 }))
      ])
    ])
  ]
})
export class ChatHistoryComponent implements OnInit, OnDestroy, OnChanges {
  @Input() userId?: string;
  @Input() tenantId?: string;
  @Input() appId?: number;
  @Input() isDarkTheme: boolean = false;
  @Input() isOpen: boolean = false;
  @Output() close = new EventEmitter<void>();
  @Output() messageSelected = new EventEmitter<ChatMessage>();

  // UI State
  selectedCategory: string = 'myhistory';
  selectedTag: string = '';
  searchQuery: string = '';
  sortBy: string = 'all';
  isLoading: boolean = false;
  showActionMenu: boolean = false;
  actionMenuPosition = { top: 0, left: 0 };
  selectedQuestion: Question | null = null;
  showPregenerated: boolean = false;
  error: string = '';

  dateFilter: string = 'all';
  customStartDate: string = '';
  customEndDate: string = '';
  filterBy: string = 'all';
  tenantName: string = '';
  appName: string = '';

  // Edit dialog state
  showEditDialog: boolean = false;
  editingMessage: string = '';
  editingQuestion: Question | null = null;

  // Data
  questions: Question[] = [];
  filteredQuestions: Question[] = [];
  popularTags: Tag[] = [];
  pregeneratedQuestions: Question[] = [];
  messages: ChatMessage[] = [];
  summary: MessageSummary | null = null;

  showAddQuestionDialog: boolean = false;
  newQuestionText: string = '';

  isCurrentUserAdmin: boolean = false;

  pendingApprovals: ApprovalQueueItem[] = [];
  newQuestionVisibility: 'private' | 'public' = 'private';
  newQuestionFavorited: boolean = false;
  newQuestionFlagged: boolean = false;
  isSaving: boolean = false;
  detectedTags: string[] = [];

  // Toast notifications
  showSuccessToast: boolean = false;
  showErrorToast: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';

  // Counts
  categoryCounts = {
    myhistory: 0,
    public: 0,
    favorites: 0,
    tags: 0,
    approvals: 0,
    summary: 0
  };

  // REMOVED: User ID prompt related properties
  viewMode: 'user' | 'all' = 'user';
  isAllMessagesView: boolean = false;

  // Pagination for all messages
  currentPage: number = 0;
  pageSize: number = 50;
  totalMessages: number = 0;

  showDeleteConfirmDialog: boolean = false;
  questionToDelete: Question | null = null;
  isDeleting: boolean = false;

  filteredApprovals: ApprovalQueueItem[] = [];

  todayStr: string = '';

  private allTaggedQuestions: Question[] = [];
  private subscriptions = new Subscription();
  private destroy$ = new Subject<void>();
  private hasInitialized = false;
  constructor(private chatHistoryService: ChatHistoryService, private sanitizer: DomSanitizer) { }

  // ADD THIS SINGLE, CORRECT HELPER METHOD

  private getGuidUserIdFromSession(): string | null {

    try {

      const userId = sessionStorage.getItem('userId');

      if (userId) {

        console.log('✅ Retrieved GUID userId from session:', userId);

        return userId;

      }

      console.warn('⚠️ No GUID userId found in session storage');

      return null;

    } catch (error) {

      console.error('Error accessing session storage for userId:', error);

      return null;

    }

  }


  private userIdForOps: string | undefined;

    private isValidGuid(guid: string | null | undefined): boolean {
    if (!guid) { return false; }
    const guidRegex = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
    return guidRegex.test(guid.trim());
  }

  ngOnInit(): void {

        //  lines to get names from session storage
    this.tenantName = sessionStorage.getItem('selectedTenantName') || '';
    this.appName = sessionStorage.getItem('appName') || ''; // Corrected this line
    this.todayStr = new Date().toISOString().split('T')[0];

    // 1. Get BOTH the email (for history) and the GUID (for operations) from session

    this.userId = this.getUserEmailFromSession() || undefined; // For fetching chat history

    this.userIdForOps = this.getGuidUserIdFromSession() || undefined; // For approvals, etc.



    // 2. Get Tenant ID

    if (!this.tenantId) {

      this.tenantId = this.getUserFromSession('TenantId') || undefined;

    }

    if (!this.appId) {
      const appIdFromSession = sessionStorage.getItem('appId');
      if (appIdFromSession) {
        const parsedAppId = parseInt(appIdFromSession, 10);
        if (!isNaN(parsedAppId)) {
          this.appId = Number(parsedAppId);
          console.log('✅ App ID loaded from session storage:', this.appId);
        }
      }
    }

    // 3. Set Admin status

    const userRole = sessionStorage.getItem('userRole');

    this.isCurrentUserAdmin = userRole === 'Admin' || userRole === 'SuperAdmin';

    console.log(`🚀 ChatHistoryComponent initialized. Email: ${this.userId}, GUID: ${this.userIdForOps}, IsAdmin: ${this.isCurrentUserAdmin}`);

 // --- THIS IS THE FIX ---
    // We now use isValidGuid() to ensure we only proceed if a REAL tenant is selected.
    // This will correctly block the component from loading data in the global Super Admin context.
    if (!this.isValidGuid(this.tenantId)) {
        this.showError('A specific tenant must be selected to view chat history.');
        console.error('CRITICAL: Invalid or missing TenantId. History disabled.');
        this.isLoading = false;
        return; // STOP execution here to prevent the crash.
    }

    // 4. Check for essential IDs before proceeding. History needs the email.

    if (!this.userId || !this.tenantId) {

      this.showError('User Email or Tenant ID is missing. Cannot load chat history.');

      console.error('CRITICAL: Missing userEmail or tenantId. History disabled.');

      this.isLoading = false;

      return;

    }



    // 5. Initialize the component

    if (!this.hasInitialized) {

      this.chatHistoryService.setUserIdToken(this.userId);

      this.selectCategory('myhistory'); // Load initial data

      this.loadSidebarCounts();        // Load counts for other categories
      this.loadAllUserTaggedChats();

      this.hasInitialized = true;

    }

  }

  ngOnChanges(changes: SimpleChanges): void {
    // Check if the 'appId' input has changed and the component has been initialized
    if (changes['appId'] && !changes['appId'].firstChange && this.hasInitialized) {
      console.log(`[ChatHistory] AppId changed to: ${this.appId}. Refreshing view.`);
      // Re-fetch the data for the current category with the new appId
      this.fetchDataForCategory(this.selectedCategory);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSortChange(): void {

    this.applyFilters();

  }


  onFilterChange(): void {
  // If the user selects any filter OTHER than 'custom', clear the stored dates
  if (this.dateFilter !== 'custom') {
    this.customStartDate = '';
    this.customEndDate = '';
    
    // Automatically refresh data with the new standard filter (e.g., 'all', 'lastWeek')
    this.refreshCurrentCategory();
  }
}

 private getFormattedDateRange(): { start: string | undefined, end: string | undefined } {
    if (this.dateFilter === 'all') return { start: undefined, end: undefined };

    if (this.dateFilter === 'custom') {
      if (this.customStartDate && this.customEndDate) {
        return { start: this.customStartDate, end: this.customEndDate };
      }
      return { start: undefined, end: undefined };
    } else {
      const endDate = new Date();
      const startDate = new Date();
      if (this.dateFilter === 'lastWeek') startDate.setDate(endDate.getDate() - 7);
      else if (this.dateFilter === 'lastMonth') startDate.setMonth(endDate.getMonth() - 1);
      else if (this.dateFilter === 'last6Months') startDate.setMonth(endDate.getMonth() - 6);
      else if (this.dateFilter === 'lastYear') startDate.setFullYear(endDate.getFullYear() - 1);
      startDate.setHours(0, 0, 0, 0);

      // Return local dates in YYYY-MM-DD format manually to avoid timezone shifts from toISOString
      const format = (d: Date) => d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');

      return {
        start: format(startDate),
        end: format(endDate)
      };
    }
  }

   private refreshCurrentCategory(): void {
    if (!this.selectedCategory || this.selectedCategory === 'approvals'||this.selectedCategory === 'tags') {
      // Approvals: now use server-side refresh like other categories

      if (this.selectedCategory === 'tags') {
      // FIX: Ensure we restore the master list of tagged questions
      this.questions = [...this.allTaggedQuestions];
      console.log('Resetting tags view to master list, count:', this.questions.length);
      this.applyFilters();
    }
      if (this.selectedCategory === 'approvals') {
        this.loadPendingApprovals();
      }
      return;
    }

  // Validate essentials
  if (!this.tenantId || !this.appId) {
    this.showError("Tenant ID or Application ID is missing.");
    return;
  }

   if (['myhistory', 'favorites', 'tags'].includes(this.selectedCategory) && !this.userId) {
    this.showError("User session is missing.");
    return;
  }

  // Re-use exact same request structure
  const request: ChatFilterRequest = {
    user_id: this.userId || '',
    tenant_id: this.tenantId!,
    app_id: this.appId,
    category: this.selectedCategory as any,
     tag_name: this.selectedCategory === 'tags' ? (this.selectedTag || undefined) : undefined,
    date_filter: this.dateFilter, // Pass the current dropdown value ('all', 'lastWeek', or 'custom')
    // Only send dates if the current mode is actually 'custom'
    start_date: this.dateFilter === 'custom' ? this.customStartDate : undefined,
    end_date: this.dateFilter === 'custom' ? this.customEndDate : undefined,
  };

  this.isLoading = true;

  const subscription = this.chatHistoryService.getChats(request).subscribe({
    next: (data) => this.handleResponse(data),
    error: (err) => {
      console.error(`Error refreshing ${this.selectedCategory}:`, err);
      this.showError("Failed to refresh chats.");
      this.isLoading = false;
    },
    complete: () => {
      this.isLoading = false;
    }
  });

  this.subscriptions.add(subscription);
}


  applyCustomDateFilter(): void {

    this.refreshCurrentCategory();

  }


  selectCategory(category: string): void {
    this.selectedCategory = category;
    this.isLoading = true;
    this.error = '';
    this.selectedTag = ''; // Reset selected tag when changing category
    if (category === 'approvals') {
      if (this.isCurrentUserAdmin && this.tenantId) {
        this.loadPendingApprovals();
      } else {
        this.showError("You are not authorized to view approvals.");
        this.isLoading = false;
      }
      return; // Exit the function here for approvals
    }
    this.fetchDataForCategory(category);

  }



  // ADD THESE FOUR NEW METHODS
  private loadPendingApprovals(): void {
    if (!this.tenantId) return;
    this.isLoading = true;

    const range = this.getFormattedDateRange();

    this.chatHistoryService.getPendingApprovals(this.tenantId, range.start, range.end)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.pendingApprovals = response.pending_approvals;
            this.categoryCounts.approvals = response.total_pending;
            this.applyFilters(); // Client-side search and final date check
          } else {
            this.showError(response.error || 'Failed to load pending approvals.');
            this.pendingApprovals = [];
            this.filteredApprovals = [];
          }
          this.isLoading = false;
        },
        error: (err) => {
          this.showError('An error occurred while fetching approvals.');
          this.isLoading = false;
        }
      });
  }

  approveRequest(approvalId: string, event: Event): void {
    event.stopPropagation();
    this.processApproval(approvalId, 'Approved');
  }

  rejectRequest(approvalId: string, event: Event): void {
  event.stopPropagation();
  
  // The prompt returns a string if OK is clicked, and null if CANCEL is clicked
  const comments = prompt("Optional: Provide a reason for rejection.");

  if (comments === null) {
    console.log('Rejection action aborted by user.');
    return; 
  }
  
  // If the user clicked 'OK', we proceed (even if the string is empty)
  this.processApproval(approvalId, 'Rejected', comments.trim() || undefined);
}

  private processApproval(approvalId: string, status: 'Approved' | 'Rejected', comments?: string): void {
    // THE FIX: Use the GUID from userIdForOps for this operation.
    const approverGuid = this.userIdForOps;
    if (!approverGuid) {
      this.showError("Admin user ID (GUID) not found. Cannot process request.");
      return;
    }

    this.chatHistoryService.processPublicApproval(approvalId, approverGuid, status, comments)
  .pipe(takeUntil(this.destroy$))
  .subscribe({
    next: (response) => {
      if (response.success) {
        // 1. Remove from the current list
        this.pendingApprovals = this.pendingApprovals.filter(item => item.ApprovalId !== approvalId);
        
        // 2. THE FIX: Decrement the sidebar count immediately
        if (this.categoryCounts.approvals > 0) {
           this.categoryCounts.approvals--;
        }

        // 3. If approved, refresh the public tab count
        if (status === 'Approved') {
          this.refreshPublicCount();
        }
        this.showSuccess(`Request ${status}.`);
      }
    }
  });
  }

  selectTag(tag: string): void {
    this.selectedTag = tag;
    this.selectedCategory = 'tags';

    this.questions = [...this.allTaggedQuestions];

    this.applyFilters();
  }

  private getUserEmailFromSession(): string | null {
    try {
      const userEmail = sessionStorage.getItem('userEmail');
      if (userEmail) {
        console.log('✅ Retrieved user email from session:', userEmail);
        return userEmail;
      }


      const msalKeys = Object.keys(sessionStorage).filter(key =>
        key.includes('msal') && key.includes('account')
      );

      if (msalKeys.length > 0) {
        try {
          const accountData = sessionStorage.getItem(msalKeys[0]);
          if (accountData) {
            const parsed = JSON.parse(accountData);
            const email = parsed.username || parsed.preferred_username || parsed.email;
            if (email) {
              console.log('✅ Retrieved user email from MSAL:', email);
              return email;
            }
          }
        } catch (e) {
          console.error('Error parsing MSAL account data:', e);
        }
      }

      console.warn('⚠️ No user email found in session storage');
      return null;
    } catch (error) {
      console.error('Error accessing session storage:', error);
      return null;
    }
  }

  private getUserFromSession(key: 'userId' | 'TenantId' | 'userEmail'): string | null {
    try {
      return sessionStorage.getItem(key);
    } catch (error) {
      console.error('Error accessing session storage:', error);
      return null;
    }
  }


  loadAllMessages(): void {
    this.isLoading = true;
    this.error = '';
    this.isAllMessagesView = true;
    this.viewMode = 'all';

    const offset = this.currentPage * this.pageSize;
    const userEmail = this.getUserEmailFromSession() || this.userId;

    console.log('📚 Loading all messages with user context:', userEmail);

    this.chatHistoryService.getAllMessages(this.pageSize, offset, userEmail)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isLoading = false;
          console.log('📚 All messages response:', response);

          if (response.success) {
            this.totalMessages = response.total_messages;
            this.loadPopularTags();
          } else {
            this.error = response.error || 'Failed to load all messages';
          }
        },
        error: (error) => {
          this.isLoading = false;
          this.error = 'Failed to load all messages';
          console.error('Error loading all messages:', error);
        }
      });
  }

  loadPopularTags(): void {
    this.chatHistoryService.getPopularTags(this.userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.popularTags = response.tags.map(tag => ({
              name: tag.tag_name,
              count: tag.usage_count
            }));
          }
        },
        error: (error) => {
          console.error('Error loading popular tags:', error);
        }
      });
  }

  switchToAllMessagesView(): void {
    this.viewMode = 'all';
    this.isAllMessagesView = true;
    this.currentPage = 0;
    this.loadAllMessages();
  }

  switchToUserView(): void {
    const userEmail = this.getUserEmailFromSession();

    if (userEmail || this.userId) {
      this.userId = userEmail || this.userId;
      this.viewMode = 'user';
      this.isAllMessagesView = false;
      if (this.userId) {
        this.chatHistoryService.setUserIdToken(this.userId);
      }
    } else {
      console.warn('Cannot switch to user view - no user email available');
      this.switchToAllMessagesView();
    }
  }


  convertMessagesToQuestions(messages: any[]): Question[] {
    if (!messages || messages.length === 0) return [];

    return messages.map(msg => {
      const question: Question = {
        id: msg.ChatId,
        question: msg.UserMessage,
        answer: msg.AIResponse || undefined,
        tags: msg.Tags ? msg.Tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
        // visibility: (msg.Visibility || 'private').toLowerCase(),
        visibility: this.selectedCategory === 'public'
          ? 'public'
          : (msg.Visibility || 'private').toLowerCase() as 'public' | 'private',

        is_favorited: msg.IsFavorited || false,
        timestamp: msg.Timestamp,
        user_id: msg.UserId,
        is_pinned: false,
        is_flagged: false,
        prompt_tokens: msg.PromptTokens || 0,
        response_tokens: msg.ResponseTokens || 0,
        public_approval_status: msg.PublicApprovalStatus || 'NotApplicable',
        is_approved: msg.IsApproved || false // <-- ADD THIS LINE
      };

      if (this.selectedCategory === 'favorites') {
        question.is_favorited = true;
      }
      return question;
    });
  }


  extractTags(text: string): string[] {
    const hashtags = text.match(/#\w+/g) || [];
    const keywords = this.extractKeywords(text);
    return [...new Set([...hashtags.map(h => h.substring(1)), ...keywords])];
  }

  extractKeywords(text: string): string[] {
    const commonWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'what', 'how', 'when', 'where', 'why'];
    const words = text.toLowerCase().split(/\s+/)
      .filter(word => word.length > 3 && !commonWords.includes(word));

    const categories = {
      'Tech': ['technology', 'computer', 'software', 'hardware', 'programming', 'code', 'app', 'mobile', 'web', 'ai', 'chart', 'visualization'],
      'Career': ['career', 'job', 'work', 'interview', 'resume', 'salary', 'promotion', 'office'],
      'Personal': ['personal', 'life', 'health', 'family', 'relationship', 'hobby'],
      '2025': ['2025', 'future', 'prediction', 'trend'],
      'Data': ['data', 'database', 'sql', 'sharepoint', 'analysis', 'report']
    };

    const tags: string[] = [];
    for (const [tag, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => text.toLowerCase().includes(keyword))) {
        tags.push(tag);
      }
    }

    return tags.slice(0, 3);
  }

  // private loadUserTags(): void {
  //     if (!this.userId) return;
  //     this.chatHistoryService.getUserTags(this.userId).subscribe({
  //       next: (response: any) => {
  //         if (response.success && response.tags) {
  //           this.popularTags = response.tags.map((tag: any) => ({ name: tag.tag_name, count: tag.count || 0 }));
  //           this.categoryCounts.tags = response.tags.length;
  //         }
  //       }
  //     });
  //   }

  getUserDisplayName(userId: string): string {
    if (!userId) return 'Anonymous';

    if (userId.includes('@')) {
      return userId.split('@')[0];
    }

    return userId;
  }

  private handleResponse(response: GetUserChatHistoryResponse | GetPublicChatsResponse | GetFavoriteChatsResponse | GetAllUserTaggedChatsResponse | GetQuestionManagerResponse): void {
    this.isLoading = false;
    if (response.success) {
      // This logic now handles the 'chats' property from the new response
      const messages = 'history' in response ? response.history :
        'public_chats' in response ? response.public_chats :
          'favorite_chats' in response ? response.favorite_chats :
            'tagged_chats' in response ? response.tagged_chats :
              'chats' in response ? response.chats : []; // Added support for 'chats'

      this.questions = this.convertMessagesToQuestions(messages);
      this.applyFilters();

      if ('total_chats' in response) {
        this.categoryCounts.myhistory = response.total_chats;
      } else if ('total_public_chats' in response) {
        this.categoryCounts.public = response.total_public_chats;
      } else if ('total_favorite_chats' in response) {
        this.categoryCounts.favorites = response.total_favorite_chats;
      }
    } else {
      this.showError(response.error || 'Failed to load chats.');
    }
  }

   applyFilters(): void {
    const query = this.searchQuery.trim().toLowerCase();


    let filtered = [...this.questions];

    console.log('🔍 Applying filters - Total questions:', filtered.length);
    console.log('🔍 Selected category:', this.selectedCategory);

    // Apply category filter
    switch (this.selectedCategory) {
      case 'all':
        // Show all messages
        console.log('📋 Showing all messages');
        break;
      case 'public':
        filtered = filtered.filter(q => q.visibility === 'public');
        console.log('📋 Filtered to public questions:', filtered.length);
        break;
      case 'private':
        filtered = filtered.filter(q => q.visibility === 'private');
        console.log('📋 Filtered to private questions:', filtered.length);
        break;
      case 'favorites':
        filtered = filtered.filter(q => q.is_favorited);
        console.log('📋 Filtered to favorite questions:', filtered.length);
        break;
      case 'tags':
        if (this.selectedTag) {
          filtered = filtered.filter(q => q.tags.includes(this.selectedTag));
        } else {
          filtered = filtered.filter(q => q.tags.length > 0);
        }
        console.log('📋 Filtered to tagged questions:', filtered.length);
        break;
      case 'summary':
        filtered = filtered.filter(q => q.is_pinned || q.is_favorited);
        console.log('📋 Filtered to summary questions:', filtered.length);
        break;
      case 'approvals':
        // Approvals are handled separately above, but for consistency if reached:
        filtered = (this.pendingApprovals as any[]).map(a => ({
          ...a,
          id: a.ApprovalId,
          question: a.UserMessage,
          timestamp: a.RequestDate
        }));
        break;
    }

    // --- NEW: Client-side Date Filtering for Approvals and fallback for Tags ---
    if (this.dateFilter !== 'all') {
      let startDate: Date;
      let endDate: Date;

      if (this.dateFilter === 'custom') {
        if (this.customStartDate && this.customEndDate) {
          startDate = new Date(this.customStartDate);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(this.customEndDate);
          endDate.setHours(23, 59, 59, 999);
        } else {
          // If custom but no dates, don't filter (or maybe filter all)
          startDate = new Date(0);
          endDate = new Date();
        }
      } else {
        endDate = new Date();
        startDate = new Date();
        if (this.dateFilter === 'lastWeek') startDate.setDate(endDate.getDate() - 7);
        else if (this.dateFilter === 'lastMonth') startDate.setMonth(endDate.getMonth() - 1);
        else if (this.dateFilter === 'last6Months') startDate.setMonth(endDate.getMonth() - 6);
        else if (this.dateFilter === 'lastYear') startDate.setFullYear(endDate.getFullYear() - 1);
        startDate.setHours(0, 0, 0, 0);
      }

      if (this.selectedCategory === 'approvals') {
        this.filteredApprovals = this.pendingApprovals.filter(item => {
          const itemDate = new Date(item.RequestDate);
          const matchesDate = itemDate >= startDate && itemDate <= endDate;
          const matchesQuery = !query || item.UserMessage.toLowerCase().includes(query);
          return matchesDate && matchesQuery;
        });
        return; // Exit early for approvals
      } else {
        filtered = filtered.filter(q => {
          const qDate = new Date(q.timestamp);
          return qDate >= startDate && qDate <= endDate;
        });
      }
    } else if (this.selectedCategory === 'approvals') {
      // If all time and approvals, just apply search query
      this.filteredApprovals = !query
        ? [...this.pendingApprovals]
        : this.pendingApprovals.filter(item => item.UserMessage.toLowerCase().includes(query));
      return;
    }

    // Apply search filter
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(q =>
        q.question.toLowerCase().includes(query) ||
        q.answer?.toLowerCase().includes(query) ||
        q.tags.some(tag => tag.toLowerCase().includes(query))
      );
      console.log('🔍 After search filter:', filtered.length);
    }

    // Apply sort
    switch (this.sortBy) {
      case 'recent':
        filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        break;
      case 'popular':
        filtered.sort((a, b) => {
          const scoreA = (a.is_favorited ? 2 : 0) + (a.is_pinned ? 1 : 0);
          const scoreB = (b.is_favorited ? 2 : 0) + (b.is_pinned ? 1 : 0);
          return scoreB - scoreA;
        });
        break;
      case 'unanswered':
        filtered = filtered.filter(q => !q.answer || q.answer.trim() === '');
        break;
    }

    this.filteredQuestions = filtered;
    console.log('✅ Final filtered questions:', this.filteredQuestions.length);
  }

  onSearchChange(): void {
  // If we are in tags, we must ensure we have the data before searching
  if (this.selectedCategory === 'tags') {
    this.questions = [...this.allTaggedQuestions];
  }
  this.applyFilters();
}


  selectQuestion(question: Question): void {
    // This is the updated and corrected method
    const messageToEmit: ChatMessage = {
      id: question.id,
      user_message: question.question,
      ai_response: question.answer || '',
      timestamp: question.timestamp,
      visibility: question.visibility,
      is_favorited: question.is_favorited,
      is_pinned: question.is_pinned,
      is_flagged: question.is_flagged,
      client_id: 'web-client', // Or derive this if available
      prompt_tokens: question.prompt_tokens,
      response_tokens: question.response_tokens,
      is_deleted: false
    };

    console.log('📝 Emitting message for input field population:', messageToEmit.user_message);
    this.messageSelected.emit(messageToEmit);
  }


  toggleVisibility(question: Question, event: Event): void {
    event.stopPropagation();

    // 1. Validation: Get GUID for approval workflow and Email for direct updates
    const requesterGuid = this.userIdForOps; // The GUID needed for Approvals Table
    const userEmail = this.userId;         // The Email needed for Messages Table update

    if (!requesterGuid || !this.tenantId || !userEmail) {
      this.showError('Session expired. Please log in again.');
      return;
    }

    const isCurrentlyPrivate = question.visibility === 'private';
    const newVisibility = isCurrentlyPrivate ? 'public' : 'private';

    if (newVisibility === 'public') {
  this.chatHistoryService.requestPublicApproval(question.id, this.tenantId, requesterGuid)
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (response) => {
        if (response.success) {
          // 1. Update the local question status
          question.public_approval_status = 'Pending';
          
          // 2. THE FIX: Immediately increment the count in the sidebar
          if (this.isCurrentUserAdmin) {
            this.categoryCounts.approvals++; 
          }

          this.showSuccess('Request submitted for approval.');
        } else {
          this.showError(response.error || 'Failed to submit.');
        }
      }
    });
} else {
      // --- ACTION: SWITCH BACK TO PRIVATE (Instant, no approval needed) ---
      if (!this.appId) {
        this.showError('Application context is missing.');
        return;
      }

      this.chatHistoryService.updateMessage({
        message_id: question.id,
        user_id_token: userEmail, // Use Email here for the standard update API
        tenant_id: this.tenantId,
        app_id: this.appId,
        visibility: 'private'
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        if (response.success) {
          // 1. Update the local question object properties
          question.visibility = 'private';
          question.public_approval_status = 'NotApplicable';

          // 2. CRITICAL: If the user is currently looking at the "Public" tab, 
          // remove the item from the list immediately.
          if (this.selectedCategory === 'public') {
            this.questions = this.questions.filter(q => q.id !== question.id);
            this.filteredQuestions = this.filteredQuestions.filter(q => q.id !== question.id);

            // 3. Manually decrement the public count in the sidebar for an instant feel
            if (this.categoryCounts.public > 0) {
              this.categoryCounts.public--;
            }
          }

          this.showSuccess('Chat has been made private.');
          
          // Background sync to ensure counts match server perfectly
          this.refreshPublicCount(); 
        } else {
          this.showError(response.error || 'Failed to update visibility.');
        }
      },
      error: (error) => this.showError('An error occurred. Please try again.')
    });
  }
}

  togglePin(question: Question, event: Event): void {
    event.stopPropagation();

    if (!this.userId || !this.tenantId || !this.appId) {
      this.showError('Cannot update favorite status. Session details are missing.');
      return;
    }

    const newFavoriteState = !question.is_favorited;

    // FIX: Add the required tenant_id and app_id to the request payload
    this.chatHistoryService.updateMessage({
      message_id: question.id,
      user_id_token: this.userId,
      tenant_id: this.tenantId,
      app_id: this.appId,
      is_favorited: newFavoriteState
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        if (response.success) {
          question.is_favorited = newFavoriteState;
          this.refreshFavoritesCount();
          this.applyFilters();
          const message = newFavoriteState ? '⭐ Added to favorites!' : '⭐ Removed from favorites!';
          this.showSuccess(message);
        } else {
          this.showError(response.error || 'Failed to update favorite status.');
        }
      },
      error: (error) => {
        console.error('Error updating favorite status:', error);
        this.showError('Failed to update favorites. Please try again.');
      }
    });
  }

  editQuestion(question: Question | null, event: Event | null): void {
    if (event) event.stopPropagation();

    if (!question || !this.userId) {
      console.error('No question selected or no user ID token');
      return;
    }

    this.editingQuestion = question;
    this.editingMessage = question.question;
    this.showEditDialog = true;
    this.showActionMenu = false;
  }

  cancelEdit(): void {
    this.showEditDialog = false;
    this.editingMessage = '';
    this.editingQuestion = null;
  }

  saveEdit(): void {
    if (!this.editingQuestion || !this.userId || !this.tenantId || !this.appId || !this.editingMessage.trim()) {
      return;
    }

    if (this.editingMessage === this.editingQuestion.question) {
      this.cancelEdit();
      return;
    }

    const updatedMessage = this.editingMessage.trim();

    // FIX: Add the required tenant_id and app_id to the request payload
    this.chatHistoryService.updateMessage({
      message_id: this.editingQuestion.id,
      user_id_token: this.userId,
      tenant_id: this.tenantId,
      app_id: this.appId,
      user_message: updatedMessage
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        if (response.success) {
          this.refreshTagsCount();
          this.loadPopularTags();
          if (this.editingQuestion) {
            this.editingQuestion.question = updatedMessage;
            this.editingQuestion.tags = this.extractTags(updatedMessage);
          }
          this.loadPopularTags();
          this.cancelEdit();
          this.showSuccess('Prompt updated successfully!');
        } else {
          this.showError(response.error || 'Failed to update prompt.');
        }
      },
      error: (error) => {
        console.error('Error updating message:', error);
        this.showError('An error occurred while updating the prompt.');
      }
    });
  }

  deleteQuestion(question: Question | null, event: Event | null): void {
    if (event) event.stopPropagation();
    if (!question) { return; }

    // Instead of confirm(), we now store the question and show our custom modal
    this.questionToDelete = question;
    this.showDeleteConfirmDialog = true;
    this.showActionMenu = false; // Hide action menu if it was open
  }




  private closeActionMenu = (): void => {
    this.showActionMenu = false;
    document.removeEventListener('click', this.closeActionMenu);
  }

  closeOnOverlayClick(event: Event): void {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }

  usePregenerated(question: Question): void {
    const message: ChatMessage = {
      id: question.id,
      client_id: 'web-client',
      timestamp: question.timestamp,
      user_message: question.question,
      ai_response: '',
      prompt_tokens: 0,
      response_tokens: 0,
      is_favorited: false,
      is_pinned: false,
      is_flagged: false,
      visibility: 'private',
      is_deleted: false
    };

    console.log('📝 Emitting pregenerated question for input field:', message.user_message);
    this.messageSelected.emit(message);
  }

  formatTimeAgo(timestamp: string): string {
    if (!timestamp) {
      return 'recently';
    }
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      return 'recently'; // Return a default string if the date is invalid
    }
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) {
      return 'today';
    } else if (diffInDays === 1) {
      return '1 day ago';
    } else if (diffInDays < 7) {
      return `${diffInDays} days ago`;
    } else if (diffInDays < 30) {
      const weeks = Math.floor(diffInDays / 7);
      return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    } else {
      const months = Math.floor(diffInDays / 30);
      return `${months} month${months > 1 ? 's' : ''} ago`;
    }
  }

  getCategoryCount(category: string): number {
    return this.categoryCounts[category as keyof typeof this.categoryCounts] || 0;
  }

  getContentTitle(): string {
    switch (this.selectedCategory) {
      case 'myhistory': return 'My Chat History';
      case 'public': return 'Public Chats';
      case 'favorites': return 'Favorite Chats';
      case 'tags': return this.selectedTag ? `Chats tagged #${this.selectedTag}` : 'Tagged Chats';
      case 'summary': return 'Chat Summary';
      default: return 'Chats';
    }
  }

  getContentSubtitle(): string {
    const userEmail = this.userId || this.getUserEmailFromSession();

    switch (this.selectedCategory) {
      case 'myhistory': return `Your private and public chats`;
      case 'public': return 'Chats from all users marked as public';
      case 'favorites': return 'Your starred chats';
      case 'tags': return 'Browse chats by tags';
      case 'summary': return 'Overview and statistics';
      default: return 'Browse and manage your chats';
    }
  }


  getEmptyStateMessage(): string {
    if (this.searchQuery) {
      return 'Try adjusting your search terms or clear the search.';
    }

    switch (this.selectedCategory) {
      case 'favorites': return 'Star questions to add them to your favorites.';
      case 'private': return 'No private questions yet. Make a question private to see it here.';
      case 'public': return 'No public questions yet. Make a question public to share it.';
      case 'tagged': return 'No tagged questions found.';
      case 'approvals': return 'No pending approval requests yet.';
      default: return 'Start asking questions to see them here.';
    }
  }

  // Pagination methods
  nextPage(): void {
    if ((this.currentPage + 1) * this.pageSize < this.totalMessages) {
      this.currentPage++;
      this.loadAllMessages();
    }
  }

  previousPage(): void {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.loadAllMessages();
    }
  }

  get totalPages(): number {
    return Math.ceil(this.totalMessages / this.pageSize);
  }

  get currentPageDisplay(): number {
    return this.currentPage + 1;
  }

  private scrollToTop(): void {
    const questionsList = document.querySelector('.questions-list');
    if (questionsList) {
      questionsList.scrollTop = 0;
    }
  }

  addNewQuestion(): void {
    // Instead of closing, open the add question dialog
    this.showAddQuestionDialog = true;
    this.resetNewQuestionForm();
    this.detectedTags = [];
  }

  // Add these new methods
  resetNewQuestionForm(): void {
    this.newQuestionText = '';

    this.newQuestionVisibility = 'private';
    this.newQuestionFavorited = false;
    this.newQuestionFlagged = false;
    this.detectedTags = [];
    this.isSaving = false;
  }

  cancelAddQuestion(): void {
    if (this.isSaving) return;

    // Simplified check - only check for question text
    if (this.newQuestionText.trim()) {
      if (!confirm('Are you sure you want to cancel? Your changes will be lost.')) {
        return;
      }
    }

    this.showAddQuestionDialog = false;
    this.resetNewQuestionForm();
  }
  updateCharacterCount(): void {
    // Extract tags as user types
    this.detectedTags = this.extractTags(this.newQuestionText);
  }

  async submitNewQuestion(): Promise<void> {
    if (!this.newQuestionText.trim() || this.isSaving) {
      return;
    }

    this.isSaving = true;

    // --- START: ROBUST ID RETRIEVAL ---
    // Actively get all required IDs right now, with fallbacks to session storage.
    const userId = this.userId || this.getUserEmailFromSession();
    const tenantId = this.tenantId || sessionStorage.getItem('TenantId');

    let appId: number | undefined = this.appId;
    if (!appId) {
      const appIdFromSession = sessionStorage.getItem('appId');
      if (appIdFromSession) {
        const parsedAppId = parseInt(appIdFromSession, 10);
        if (!isNaN(parsedAppId)) {
          appId = parsedAppId;
        }
      }
    }

    // Perform the validation check on the variables we just retrieved.
    if (!userId || !tenantId || !appId) {
      this.showError('User session or App ID is invalid. Cannot add question.');
      this.isSaving = false;
      return;
    }
    // --- END: ROBUST ID RETRIEVAL ---

    try {
      const aiResponse = await this.generateAIResponse(this.newQuestionText);

      // Build the request object using the validated local variables
      const request: InsertMessageRequest = {
        user_id: userId,
        tenant_id: tenantId,
        user_id_token: userId, // The user's email is used for both
        app_id: appId,         // Use the locally validated appId
        client_id: this.getClientId(),
        user_message: this.newQuestionText.trim(),
        ai_response: aiResponse,
        prompt_tokens: this.countTokens(this.newQuestionText),
        response_tokens: this.countTokens(aiResponse),
        is_favorited: this.newQuestionFavorited,
        is_flagged: this.newQuestionFlagged,
        visibility: this.newQuestionVisibility,
        system_username: userId,
        file_id: null
      };

      console.log('📝 Submitting new question:', request);

      this.chatHistoryService.insertMessage(request)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            if (response && response.success) {

              const responseId = response.message_id || (response as any).id || (response as any).ChatId || (response as any).Id;

              console.log('✅ Question added. Server returned ID:', responseId);

              if (!responseId) {
                console.warn('⚠️ ID missing in response. Refreshing list from server to get correct data.');
                this.showSuccess('Question added successfully!');
                this.showAddQuestionDialog = false;
                this.resetNewQuestionForm();
                this.isSaving = false;
                
               
                this.refreshCurrentCategory(); 
                return;
              }

              // If we have the ID, proceed with the optimistic UI update
              const newQuestion: Question = {
                id: responseId, // Use the detected ID
                question: this.newQuestionText.trim(),
                answer: aiResponse,
                tags: this.detectedTags,
                visibility: this.newQuestionVisibility,
                is_favorited: this.newQuestionFavorited,
                is_pinned: false,
                is_flagged: this.newQuestionFlagged,
                timestamp: new Date().toISOString(),
                user_id: userId,
                prompt_tokens: this.countTokens(this.newQuestionText),
                response_tokens: this.countTokens(aiResponse),
                public_approval_status: 'NotApplicable',
                is_approved: false
              };
              this.questions.unshift(newQuestion);

              if (newQuestion.tags && newQuestion.tags.length > 0) {
                this.allTaggedQuestions.unshift(newQuestion);
              }

              this.applyFilters();
              this.refreshTagsCount();
              if (newQuestion.is_favorited) {
                this.refreshFavoritesCount();
              }
              this.showSuccess('Question added successfully!');
              this.showAddQuestionDialog = false;
              this.resetNewQuestionForm();
            } else if (response) {
              this.showError(response.error || 'Failed to add question');
            }
            this.isSaving = false;
          },
          error: (error) => {
            console.error('❌ Error adding question:', error);
            this.showError('Failed to add question. Please try again.');
            this.isSaving = false;
          }
        });
    } catch (error) {
      console.error('❌ Error in submitNewQuestion:', error);
      this.showError('An unexpected error occurred');
      this.isSaving = false;
    }
  }

  private async generateAIResponse(question: string): Promise<string> {
    return `Thank you for your question: "${question}". This response was automatically generated. The system will analyze and provide detailed insights based on available data.`;

  }


  private loadSidebarCounts(): void {
    if (!this.tenantId) return;

    // Fetch Public Chats Count
    this.chatHistoryService.getPublicChats(this.tenantId, this.appId).subscribe(res => {
      if (res.success) this.categoryCounts.public = res.total_public_chats;
    });

    if (this.isCurrentUserAdmin) {

      this.chatHistoryService.getPendingApprovals(this.tenantId).subscribe(res => {

        if (res.success) this.categoryCounts.approvals = res.total_pending;

      });

    }

    if (!this.userId) return;

    // Fetch Favorites Count
    this.chatHistoryService.getFavoriteChats(this.userId, this.tenantId, this.appId).subscribe(res => {
      if (res.success) this.categoryCounts.favorites = res.total_favorite_chats;
    });

    // Fetch Tags Count
    // this.chatHistoryService.getUserTags(this.userId).subscribe({
    //   next: (response: any) => {
    //     if (response.success && response.tags) {
    //       this.categoryCounts.tags = response.tags.length;
    //     }
    //   }
    // });
  }
  private countTokens(text: string): number {
    return Math.ceil((text || '').length / 4);
  }

  private getClientId(): string {
    // Get client ID from session or use default
    return sessionStorage.getItem('clientId') || 'web-client';
  }

  private showSuccess(message: string): void {
    this.successMessage = message; // Set the dynamic message
    this.showSuccessToast = true;
    setTimeout(() => {
      this.showSuccessToast = false;
      // It's good practice to clear the message after the toast hides
      this.successMessage = '';
    }, 3000);
  }

  private showError(message: string): void {
    this.errorMessage = message;
    this.showErrorToast = true;
    setTimeout(() => {
      this.showErrorToast = false;
      this.errorMessage = '';
    }, 4000);
  }
  toggleNewQuestionVisibility(): void {
    this.newQuestionVisibility = this.newQuestionVisibility === 'private' ? 'public' : 'private';
  }

  toggleNewQuestionFavorite(): void {
    this.newQuestionFavorited = !this.newQuestionFavorited;
  }

  toggleResponse(question: Question, event: Event): void {
    event.stopPropagation();
    question.isExpanded = !question.isExpanded;
  }

  getResponsePreview(answer: string): string {
    if (!answer) return '';
    const plainText = answer.replace(/<[^>]*>/g, ''); // Strip HTML
    const wordCount = plainText.split(/\s+/).length;
    return `(${wordCount} words)`;
  }
  sanitizeHtml(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }


  private refreshPublicCount(): void {
    if (!this.tenantId) return;
    this.chatHistoryService.getPublicChats(this.tenantId, this.appId).subscribe(res => {
      if (res.success) {
        this.categoryCounts.public = res.total_public_chats;
      }
    });
  }

  private refreshFavoritesCount(): void {
    if (!this.userId || !this.tenantId) return;
    this.chatHistoryService.getFavoriteChats(this.userId, this.tenantId, this.appId).subscribe(res => {
      if (res.success) {
        this.categoryCounts.favorites = res.total_favorite_chats;
      }
    });
  }

  // private refreshTagsCount(): void {
  //   if (!this.userId) return;
  //   this.chatHistoryService.getUserTags(this.userId).subscribe({
  //     next: (response: any) => {
  //       if (response.success && response.tags) {
  //         this.categoryCounts.tags = response.tags.length;
  //       }
  //     }
  //   });
  // }
  private refreshTagsCount(): void {
    if (!this.userId) return;
    // Calling this will re-fetch all tagged chats and update the count correctly.
    this.loadAllUserTaggedChats();
  }

  private loadAllUserTaggedChats(): void {
    if (!this.userId || !this.tenantId) {
      return; // Can't load without essential IDs
    }

    this.chatHistoryService.getAllUserTaggedChats(this.userId, this.tenantId, this.appId)
      .pipe(takeUntil(this.destroy$))
      .subscribe((response: GetAllUserTaggedChatsResponse) => {
        if (response.success) {
          // Store the master list of tagged questions
          this.allTaggedQuestions = this.convertMessagesToQuestions(response.tagged_chats);
          // Update the count for the "Tags" category in the sidebar
          this.categoryCounts.tags = response.total_tagged_chats;
        } else {
          console.error('Failed to pre-load tagged chats:', response.error);
        }
      });
  }

  private fetchDataForCategory(category: string): void {
    this.isLoading = true;
    this.error = '';

    if (!this.tenantId) {
      this.showError("Tenant ID is missing.");
      this.isLoading = false;
      return;
    }

    if (!this.appId) {
      this.showError("Application ID is missing.");
      this.isLoading = false;
      return;
    }

    switch (category) {
      case 'myhistory':
        if (!this.userId) { this.showError("User ID is missing."); this.isLoading = false; return; }
        // Use the new service method
        this.chatHistoryService.getQuestionManagerChats(this.tenantId, this.userId, this.appId).subscribe(this.handleResponse.bind(this));
        break;

      case 'public':
        this.chatHistoryService.getPublicChats(this.tenantId, this.appId).subscribe(this.handleResponse.bind(this));
        break;

      case 'favorites':
        if (!this.userId) { this.showError("User ID is missing."); this.isLoading = false; return; }
        this.chatHistoryService.getFavoriteChats(this.userId, this.tenantId, this.appId).subscribe(this.handleResponse.bind(this));
        break;

      case 'tags':
        this.questions = [...this.allTaggedQuestions];
        this.applyFilters();
        this.isLoading = false;
        break;

      default:
        this.isLoading = false;
        break;
    }
  }




  // confirmDelete(): void {
  //   if (!this.questionToDelete || !this.userId) {
  //     this.cancelDelete();
  //     return;
  //   }

  //   // Keep a reference to the question being deleted, as this.questionToDelete will be cleared.
  //   const questionToDeleteId = this.questionToDelete.id;

  //   this.chatHistoryService.deleteMessage(questionToDeleteId, this.userId)
  //     .pipe(takeUntil(this.destroy$))
  //     .subscribe({
  //       next: (response) => {
  //         if (response.success) {
  //           // Now, filter the arrays using the stored ID. this.questionToDelete is no longer needed here.
  //           this.questions = this.questions.filter(q => q.id !== questionToDeleteId);
  //           this.filteredQuestions = this.filteredQuestions.filter(q => q.id !== questionToDeleteId);

  //           // Refresh counts and show success message
  //           // this.loadPopularTags(); // Or a more specific count refresh if you have one
  //           this.showSuccess('Prompt deleted successfully.');
  //         } else {
  //           this.showError(response.error || 'Failed to delete prompt.');
  //         }
  //         // --- THE FIX ---
  //         // Close the dialog only AFTER the server has responded successfully.
  //         this.cancelDelete();
  //       },
  //       error: (error) => {
  //         this.showError('An error occurred while deleting the prompt.');
  //         // --- THE FIX ---
  //         // Also close the dialog if there was an error.
  //         this.cancelDelete();
  //       }
  //     });
  // }

  confirmDelete(): void {
    if (!this.questionToDelete || !this.userId) {
      this.cancelDelete();
      return;
    }

    // 1. Show the user that the process has started
    this.isDeleting = true;
    const questionToDeleteId = this.questionToDelete.id;
    const categoryOfDeletedItem = this.selectedCategory;

    this.chatHistoryService.deleteMessage(questionToDeleteId, this.userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            // Remove the question from the main and filtered lists
            this.questions = this.questions.filter(q => q.id !== questionToDeleteId);
            this.filteredQuestions = this.filteredQuestions.filter(q => q.id !== questionToDeleteId);

            // 2. THE FIX: Immediately update the relevant sidebar count
            if (this.categoryCounts[categoryOfDeletedItem as keyof typeof this.categoryCounts] > 0) {
              this.categoryCounts[categoryOfDeletedItem as keyof typeof this.categoryCounts]--;
            }
            // Also refresh other potentially affected counts (like tags or favorites)
            this.refreshFavoritesCount();
            this.refreshTagsCount();

            this.showSuccess('Prompt deleted successfully.');
          } else {
            this.showError(response.error || 'Failed to delete prompt.');
          }
          // 3. IMPORTANT: Always close the dialog and reset state after completion
          this.cancelDelete();
        },
        error: (error) => {
          this.showError('An error occurred while deleting the prompt.');
          // Also close the dialog and reset state on error
          this.cancelDelete();
        }
      });
  }


  /**
   * Closes the delete confirmation modal and clears the selected question.
   */
  cancelDelete(): void {
    this.showDeleteConfirmDialog = false;
    this.questionToDelete = null;
    this.isDeleting = false;
  }

  highlightText(text: string | undefined): SafeHtml {
  if (!text) return '';
  
  // If no search query, return original text safely sanitized
  if (!this.searchQuery || !this.searchQuery.trim()) {
    return this.sanitizer.bypassSecurityTrustHtml(text);
  }

  const query = this.searchQuery.trim();
  
  // Escape special regex characters to prevent errors
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Create a case-insensitive regex
  const regex = new RegExp(`(${escapedQuery})`, 'gi');

  // Wrap the matching text in a span with a highlight class
  // We use $1 to preserve the original casing of the text
  const highlighted = text.replace(regex, '<mark class="search-highlight">$1</mark>');
  
  return this.sanitizer.bypassSecurityTrustHtml(highlighted);
}

isDateRangeValid(): boolean {
  // 1. Check if both fields have values
  if (!this.customStartDate || !this.customEndDate) {
    return false;
  }

  // 2. Convert string values to Date objects for comparison
  const start = new Date(this.customStartDate);
  const end = new Date(this.customEndDate);

  // 3. Ensure the end date is not before the start date
  // getTime() is used for reliable numeric comparison
  return end.getTime() >= start.getTime();
}
clearCustomDates(): void {
  this.customStartDate = '';
  this.customEndDate = '';
  console.log('🧹 Custom dates cleared by background click');
}

}