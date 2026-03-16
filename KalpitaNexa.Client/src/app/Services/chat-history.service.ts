import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { of } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface ChatMessage {
  id: string;
  user_id_token?: string;
  system_username?: string;
  client_id: string;
  timestamp: string;
  user_message: string;
  hashed_message?: string;
  ai_response: string;
  prompt_tokens: number;
  response_tokens: number;
  total_tokens?: number;
  is_favorited: boolean;
  is_pinned?: boolean;
  is_flagged: boolean;
  visibility: 'private' | 'public';
  is_deleted: boolean;
  file_id?: string;
  conversation_id?: string;
  tags?: string[];
  public_approval_status?: 'Pending' | 'Approved' | 'Rejected' | 'NotApplicable';
}

export interface MessageSummary {
  all_count: number;
  favourite_count: number;
  private_count: number;
  public_count: number;
  tagged_count: number;
}

export interface GetMessageSummaryResponse {
  success: boolean;
  summary?: MessageSummary;
  messages: ChatMessage[];
  total_messages: number;
  error?: string;
}

export interface UpdateMessageRequest {
  message_id: string;
  user_id_token: string;
  tenant_id: string;      // ADD THIS
  app_id: number;         // ADD THIS
  user_message?: string;
  is_favorited?: boolean;
  is_flagged?: boolean;
  visibility?: 'private' | 'public';
}

export interface UpdateMessageResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface DeleteMessageResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface GetAllMessagesResponse {
  success: boolean;
  messages: ChatMessage[];
  total_messages: number;
  limit?: number;
  offset?: number;
  error?: string;
}

export interface PopularTag {
  tag_name: string;
  usage_count: number;
}

export interface PopularTagsResponse {
  success: boolean;
  tags: PopularTag[];
  error?: string;
}

export interface MessagesByTagResponse {
  success: boolean;
  messages: ChatMessage[];
  tag: string;
  error?: string;
}
export interface UpdateMessageFlagsRequest {
  message_id: string;
  user_id_token?: string; 
  is_favorited?: boolean;
  is_pinned?: boolean;
  is_flagged?: boolean;
  visibility?: 'private' | 'public';
}

export interface ConversationHistoryResponse {
  success: boolean;
  conversation_history: { role: string; content: string }[];
  total_messages: number;
  error?: string;
}

export interface StoreMessageRequest {
  user_id_token: string;
  client_id: string;
  user_message: string;
  ai_response: string;
  prompt_tokens: number;
  response_tokens: number;
  is_favorited?: boolean;
  is_pinned?: boolean;
  is_flagged?: boolean;
  visibility?: 'private' | 'public';
}

export interface StoreMessageResponse {
  success: boolean;
  message_id?: string;
  message?: string;
  error?: string;
}

export interface TagSearchResponse {

  success: boolean;

  tags: PopularTag[];

  search_term: string;

  error?: string;

}


export interface GetUserChatHistoryResponse {
  success: boolean;
  total_chats: number;
  history: ChatMessage[];
  error?: string;
}

export interface GetPublicChatsResponse {
  success: boolean;
  total_public_chats: number;
  public_chats: ChatMessage[];
  error?: string;
}

export interface GetFavoriteChatsResponse {
  success: boolean;
  total_favorite_chats: number;
  favorite_chats: ChatMessage[];
  error?: string;
}

export interface GetAllUserTaggedChatsResponse {
  success: boolean;
  total_tagged_chats: number;
  tagged_chats: ChatMessage[];
  error?: string;
}

export interface InsertMessageRequest {
  user_id: string;      
  tenant_id: string; 
  user_id_token: string;   
  client_id: string;
  app_id: number;       
  user_message: string;
  ai_response: string;
  prompt_tokens: number;
  response_tokens: number;
  is_favorited: boolean;
  is_flagged: boolean;
  visibility: string;
  system_username?: string;
  file_id?: string | null;
}

export interface ChatFilterRequest {
  user_id: string;
  tenant_id: string;
  app_id?: number;
  category: string;
  tag_name?: string;
  date_filter?: string;
  // THE FIX: Add the custom date fields
  start_date?: string;
  end_date?: string;
}

// =============================================
// ADD THESE NEW INTERFACES FOR THE APPROVAL WORKFLOW
// =============================================
export interface ApprovalQueueItem {
  ApprovalId: string;
  ChatId: string;
  RequestDate: string;
  RequesterUserId: string;
  UserMessage: string;
}

export interface GetPendingApprovalsResponse {
  success: boolean;
  pending_approvals: ApprovalQueueItem[];
  total_pending: number;
  error?: string;
}

export interface GetQuestionManagerResponse {
  success: boolean;
  total_chats: number;
  chats: ChatMessage[];
  error?: string;
}


@Injectable({
  providedIn: 'root'
})
export class ChatHistoryService {
  private apiUrl =`${environment.apiUrl}/prompts`;
  private messagesSubject = new BehaviorSubject<ChatMessage[]>([]);
  private summarySubject = new BehaviorSubject<MessageSummary | null>(null);
  private allMessagesSubject = new BehaviorSubject<ChatMessage[]>([]);
  private allMessagesSummarySubject = new BehaviorSubject<MessageSummary | null>(null);
  private userIdTokenSubject = new BehaviorSubject<string | null>(null);

  public messages$ = this.messagesSubject.asObservable();
  public summary$ = this.summarySubject.asObservable();
  public allMessages$ = this.allMessagesSubject.asObservable();
  public allMessagesSummary$ = this.allMessagesSummarySubject.asObservable();
  public userIdToken$ = this.userIdTokenSubject.asObservable();

  constructor(private http: HttpClient) {}

 private getHeaders(): HttpHeaders {
  const headersConfig: any = {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };

  // Retreive the token we stored during Login
  const token = sessionStorage.getItem('access_token');
  if (token) {
    headersConfig['Authorization'] = `Bearer ${token}`;
  }

  return new HttpHeaders(headersConfig);
}

  

  // Get all messages and summary for a user
  getMessagesAndSummary(userIdToken: string): Observable<GetMessageSummaryResponse> {
    const request = { user_id_token: userIdToken };
    
    return this.http.post<GetMessageSummaryResponse>(
      `${this.apiUrl}/messages/summary`, 
      request, 
      { headers: this.getHeaders() }
    ).pipe(
      tap(response => {
        console.log('Get messages and summary response:', response);
        if (response.success) {
          this.messagesSubject.next(response.messages);
          this.summarySubject.next(response.summary || null);
        }
      }),
      catchError(error => {
        console.error('Error fetching messages:', error);
        return of({
          success: false,
          error: error.message || 'Failed to fetch messages',
          messages: [],
          total_messages: 0
        });
      })
    );
  }

  // Get all public messages plus current user's private messages
  getAllMessages(limit: number = 100, offset: number = 0, currentUserToken?: string): Observable<GetAllMessagesResponse> {
    let url = `${this.apiUrl}/messages/all?limit=${limit}&offset=${offset}`;
    if (currentUserToken) {
      url += `&current_user_token=${currentUserToken}`;
    }

    return this.http.get<GetAllMessagesResponse>(
      url,
      { headers: this.getHeaders() }
    ).pipe(
      tap(response => {
        console.log('Get all messages response:', response);
        if (response.success) {
          this.allMessagesSubject.next(response.messages);
        }
      }),
      catchError(error => {
        console.error('Error fetching all messages:', error);
        return of({
          success: false,
          error: error.message || 'Failed to fetch all messages',
          messages: [],
          total_messages: 0
        });
      })
    );
  }

  // Update message (including content, flags, and visibility)
  updateMessage(request: UpdateMessageRequest): Observable<UpdateMessageResponse> {
    return this.http.put<UpdateMessageResponse>(
      `${this.apiUrl}/messages`, 
      request, 
      { headers: this.getHeaders() }
    ).pipe(
      tap(response => {
        console.log('Update message response:', response);
        if (response.success) {
          this.updateLocalMessage(request);
        }
      }),
      catchError(error => {
        console.error('Error updating message:', error);
        return of({
          success: false,
          error: error.message || 'Failed to update message'
        });
      })
    );
  }

  // Delete a message
  deleteMessage(messageId: string, userIdToken: string): Observable<DeleteMessageResponse> {
    const request = { 
      message_id: messageId,
      user_id_token: userIdToken 
    };
    
    return this.http.request<DeleteMessageResponse>('delete', `${this.apiUrl}/messages`, {
      headers: this.getHeaders(),
      body: request
    }).pipe(
      tap(response => {
        console.log('Delete message response:', response);
        if (response.success) {
          this.removeLocalMessage(messageId);
        }
      }),
      catchError(error => {
        console.error('Error deleting message:', error);
        return of({
          success: false,
          error: error.message || 'Failed to delete message'
        });
      })
    );
  }

  // Get messages by tag
  getMessagesByTag(tagName: string, userIdToken: string): Observable<MessagesByTagResponse> {
    return this.http.get<MessagesByTagResponse>(
      `${this.apiUrl}/messages/tags/${tagName}?user_id_token=${userIdToken}`,
      { headers: this.getHeaders() }
    ).pipe(
      tap(response => {
        console.log('Get messages by tag response:', response);
      }),
      catchError(error => {
        console.error('Error fetching messages by tag:', error);
        return of({
          success: false,
          error: error.message || 'Failed to fetch messages by tag',
          messages: [],
          tag: tagName
        });
      })
    );
  }

  // Get popular tags
  getPopularTags(userIdToken?: string, limit: number = 10): Observable<PopularTagsResponse> {
    let url = `${this.apiUrl}/tags/popular?limit=${limit}`;
    if (userIdToken) {
      url += `&user_id_token=${userIdToken}`;
    }

    return this.http.get<PopularTagsResponse>(
      url,
      { headers: this.getHeaders() }
    ).pipe(
      tap(response => {
        console.log('Get popular tags response:', response);
      }),
      catchError(error => {
        console.error('Error fetching popular tags:', error);
        return of({
          success: false,
          error: error.message || 'Failed to fetch popular tags',
          tags: []
        });
      })
    );
  }

  // Store a new message
  storeMessage(request: StoreMessageRequest): Observable<StoreMessageResponse> {
    console.log('Storing message via API:', request);
    
    return this.http.post<StoreMessageResponse>(
      `${this.apiUrl}/messages/insert`,
      request,
      { headers: this.getHeaders() }
    ).pipe(
      map(response => {
        console.log('Store message API response:', response);
        if (response.success && response.message_id) {
          this.addMessageToLocalState({
            id: response.message_id,
            user_id_token: request.user_id_token,
            client_id: request.client_id,
            user_message: request.user_message,
            ai_response: request.ai_response,
            prompt_tokens: request.prompt_tokens,
            response_tokens: request.response_tokens,
            total_tokens: request.prompt_tokens + request.response_tokens,
            is_favorited: request.is_favorited || false,
            is_pinned: request.is_pinned || false,
            is_flagged: request.is_flagged || false,
            visibility: request.visibility || 'private',
            is_deleted: false,
            timestamp: new Date().toISOString(),
            system_username: '',
            hashed_message: ''
          });
        }
        return response;
      }),
      catchError(error => {
        console.error('Store message API error:', error);
        return of({
          success: false,
          error: error.message || 'Failed to store message'
        });
      })
    );
  }

  // Get conversation history for chat context
  getConversationHistory(userIdToken: string, limit: number = 10): Observable<ConversationHistoryResponse> {
    return this.http.get<ConversationHistoryResponse>(
      `${this.apiUrl}/messages/history/${userIdToken}?limit=${limit}`,
      { headers: this.getHeaders() }
    ).pipe(
      catchError(error => {
        console.error('Error fetching conversation history:', error);
        return of({
          success: false,
          error: error.message || 'Failed to fetch conversation history',
          conversation_history: [],
          total_messages: 0
        });
      })
    );
  }

  // Helper method to update local message
  private updateLocalMessage(request: UpdateMessageRequest): void {
    const currentMessages = this.messagesSubject.value;
    const updatedMessages = currentMessages.map(msg => {
      if (msg.id === request.message_id) {
        return {
          ...msg,
          user_message: request.user_message !== undefined ? request.user_message : msg.user_message,
          is_favorited: request.is_favorited !== undefined ? request.is_favorited : msg.is_favorited,
          is_flagged: request.is_flagged !== undefined ? request.is_flagged : msg.is_flagged,
          visibility: request.visibility !== undefined ? request.visibility : msg.visibility
        };
      }
      return msg;
    });
    this.messagesSubject.next(updatedMessages);
    this.updateSummaryFromMessages(updatedMessages);

    // Also update in all messages if loaded
    const currentAllMessages = this.allMessagesSubject.value;
    if (currentAllMessages.length > 0) {
      const updatedAllMessages = currentAllMessages.map(msg => {
        if (msg.id === request.message_id) {
          return {
            ...msg,
            user_message: request.user_message !== undefined ? request.user_message : msg.user_message,
            is_favorited: request.is_favorited !== undefined ? request.is_favorited : msg.is_favorited,
            is_flagged: request.is_flagged !== undefined ? request.is_flagged : msg.is_flagged,
            visibility: request.visibility !== undefined ? request.visibility : msg.visibility
          };
        }
        return msg;
      });
      this.allMessagesSubject.next(updatedAllMessages);
      this.updateSummaryFromMessages(updatedAllMessages, true);
    }
  }

  // Helper method to remove local message
  private removeLocalMessage(messageId: string): void {
    const currentMessages = this.messagesSubject.value;
    const updatedMessages = currentMessages.filter(msg => msg.id !== messageId);
    this.messagesSubject.next(updatedMessages);
    this.updateSummaryFromMessages(updatedMessages);

    // Also remove from all messages if loaded
    const currentAllMessages = this.allMessagesSubject.value;
    if (currentAllMessages.length > 0) {
      const updatedAllMessages = currentAllMessages.filter(msg => msg.id !== messageId);
      this.allMessagesSubject.next(updatedAllMessages);
      this.updateSummaryFromMessages(updatedAllMessages, true);
    }
  }

  // Helper method to add message to local state
  private addMessageToLocalState(message: ChatMessage): void {
    const currentMessages = this.messagesSubject.value;
    this.messagesSubject.next([...currentMessages, message]);
    this.updateSummaryFromMessages([...currentMessages, message]);
  }

  // Helper method to update summary from current messages
  private updateSummaryFromMessages(messages: ChatMessage[], isAllMessages: boolean = false): void {
    const summary: MessageSummary = {
      all_count: messages.length,
      favourite_count: messages.filter(m => m.is_favorited).length,
      private_count: messages.filter(m => m.visibility === 'private').length,
      public_count: messages.filter(m => m.visibility === 'public').length,
      tagged_count: messages.filter(m => m.tags && m.tags.length > 0).length
    };
    
    if (isAllMessages) {
      this.allMessagesSummarySubject.next(summary);
    } else {
      this.summarySubject.next(summary);
    }
  }

  // Filter messages by type
  getFilteredMessages(filter: 'all' | 'private' | 'public' | 'favorites' | 'pinned' | 'flagged', isAllMessages: boolean = false): ChatMessage[] {
    const messages = isAllMessages ? this.allMessagesSubject.value : this.messagesSubject.value;
    
    switch (filter) {
      case 'all':
        return messages;
      case 'private':
        return messages.filter(m => m.visibility === 'private');
      case 'public':
        return messages.filter(m => m.visibility === 'public');
      case 'favorites':
        return messages.filter(m => m.is_favorited);
      case 'pinned':
        return messages.filter(m => m.is_pinned);
      case 'flagged':
        return messages.filter(m => m.is_flagged);
      default:
        return messages;
    }
  }

  // Get current messages without server call
  getCurrentMessages(isAllMessages: boolean = false): ChatMessage[] {
    return isAllMessages ? this.allMessagesSubject.value : this.messagesSubject.value;
  }

  // Get current summary without server call
  getCurrentSummary(isAllMessages: boolean = false): MessageSummary | null {
    return isAllMessages ? this.allMessagesSummarySubject.value : this.summarySubject.value;
  }

  // Clear local state
  clearState(): void {
    this.messagesSubject.next([]);
    this.summarySubject.next(null);
    this.allMessagesSubject.next([]);
    this.allMessagesSummarySubject.next(null);
    this.userIdTokenSubject.next(null);
  }



private get currentUserIdToken(): string {
    return this.userIdTokenSubject.value || '';
  }

   setUserIdToken(token: string): void {
    this.userIdTokenSubject.next(token);
  }


searchTags(searchTerm: string, userIdToken?: string, limit: number = 10): Observable<TagSearchResponse> {

  let url = `${this.apiUrl}/tags/search?search_term=${encodeURIComponent(searchTerm)}&limit=${limit}`;

  if (userIdToken) {

    url += `&user_id_token=${userIdToken}`;

  }



  return this.http.get<TagSearchResponse>(

    url,

    { headers: this.getHeaders() }

  ).pipe(

    tap(response => {

      console.log('Tag search response:', response);

    }),

    catchError(error => {

      console.error('Error searching tags:', error);

      return of({

        success: false,

        error: error.message || 'Failed to search tags',

        tags: [],

        search_term: searchTerm

      });

    })

  );

}



insertMessage(request: InsertMessageRequest): Observable<StoreMessageResponse> {
    const apiUrl = `${this.apiUrl}/messages`;
    
    return this.http.post<StoreMessageResponse>(apiUrl, request, {
      headers: this.getHeaders()
    }).pipe(
      tap((response: StoreMessageResponse) => {
        console.log('Insert message response:', response);
        if (response.success && request.user_id) {
          // You might want to refresh the history here
        }
      }),
      catchError(this.handleError<StoreMessageResponse>('insertMessage'))
    );
  }
private handleError<T>(operation = 'operation', result?: T) {
  return (error: any): Observable<T> => {
    console.error(`${operation} failed:`, error);
    return of(result as T);
  };
}


getMyChatHistory(userId: string, tenantId: string, appId?: number): Observable<GetUserChatHistoryResponse> {
    let url = `${this.apiUrl}/chats/my-history?user_id=${userId}&tenant_id=${tenantId}`;
    if (appId) {
      url += `&app_id=${appId}`;
    }
    return this.http.get<GetUserChatHistoryResponse>(url, { headers: this.getHeaders() })
      .pipe(catchError(this.handleError('getMyChatHistory', { success: false, total_chats: 0, history: [] })));
  }

getPublicChats(tenantId: string, appId?: number): Observable<GetPublicChatsResponse> {
    let url = `${this.apiUrl}/chats/public?tenant_id=${tenantId}`;
    if (appId) {
      url += `&app_id=${appId}`;
    }
    return this.http.get<GetPublicChatsResponse>(url, { headers: this.getHeaders() })
      .pipe(catchError(this.handleError('getPublicChats', { success: false, total_public_chats: 0, public_chats: [] })));
  }

// Get user's favorite messages
getFavoriteChats(userId: string, tenantId: string, appId?: number): Observable<GetFavoriteChatsResponse> {
    let url = `${this.apiUrl}/chats/favorites?user_id=${userId}&tenant_id=${tenantId}`;
    if (appId) {
      url += `&app_id=${appId}`;
    }
    return this.http.get<GetFavoriteChatsResponse>(url, { headers: this.getHeaders() })
      .pipe(catchError(this.handleError('getFavoriteChats', { success: false, total_favorite_chats: 0, favorite_chats: [] })));
  }

  getAllUserTaggedChats(userId: string, tenantId: string, appId?: number): Observable<GetAllUserTaggedChatsResponse> {
    let url = `${this.apiUrl}/chats/tagged?user_id=${userId}&tenant_id=${tenantId}`;
    if (appId) {
      url += `&app_id=${appId}`;
    }
    return this.http.get<GetAllUserTaggedChatsResponse>(url, { headers: this.getHeaders() })
      .pipe(catchError(this.handleError('getAllUserTaggedChats', { success: false, total_tagged_chats: 0, tagged_chats: [] })));
  }

  getChats(request: ChatFilterRequest): Observable<GetUserChatHistoryResponse> {
    const url = `${this.apiUrl}/chats/filter`;
    return this.http.post<GetUserChatHistoryResponse>(url, request, { headers: this.getHeaders() })
      .pipe(catchError(this.handleError('getChats', { success: false, total_chats: 0, history: [] })));
  }

  // =============================================
  // ADD THESE THREE NEW METHODS FOR THE APPROVAL WORKFLOW
  // =============================================

  /**
   * Submits a user's chat to an admin for public approval.
   */
 requestPublicApproval(chatId: string, tenantId: string, requesterUserId: string): Observable<{success: boolean, message: string, error?: string}> {
    const body = {
      chat_id: chatId,
      tenant_id: tenantId,
      requester_user_id: requesterUserId
    };
    // FIX: Corrected the endpoint URL to remove the extra '/database'
    const url = `${this.apiUrl}/approvals/request`;
    return this.http.post<{success: boolean, message: string, error?: string}>(url, body,{ headers: this.getHeaders() });
  }

  /**
   * Retrieves the queue of chats pending approval (for admins).
   */
  getPendingApprovals(tenantId: string, startDate?: string, endDate?: string): Observable<GetPendingApprovalsResponse> {
    // FIX: Corrected the endpoint URL to remove the extra '/database'
    let url = `${this.apiUrl}/approvals/pending/${tenantId}`;
    if (startDate || endDate) {
      const params = new URLSearchParams();
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);
      url += `?${params.toString()}`;
    }
    return this.http.get<GetPendingApprovalsResponse>(url, { headers: this.getHeaders() });
  }

  /**
   * Allows an admin to approve or reject a pending request.
   */
  processPublicApproval(approvalId: string, approverUserId: string, newStatus: 'Approved' | 'Rejected', adminComments?: string): Observable<{success: boolean, message: string, error?: string}> {
    const body = {
      approval_id: approvalId,
      approver_user_id: approverUserId,
      new_status: newStatus,
      admin_comments: adminComments || null
    };
    // FIX: Corrected the endpoint URL to remove the extra '/database'
    const url = `${this.apiUrl}/approvals/process`;
    return this.http.put<{success: boolean, message: string, error?: string}>(url, body,{ headers: this.getHeaders() });
  }

  getQuestionManagerChats(tenantId: string, userId: string, appId: number): Observable<GetQuestionManagerResponse> {
    const url = `${this.apiUrl}/chats/my-history?tenant_id=${tenantId}&user_id=${encodeURIComponent(userId)}&app_id=${appId}`;
    return this.http.get<GetQuestionManagerResponse>(url, { headers: this.getHeaders() })
      .pipe(catchError(this.handleError('getQuestionManagerChats', { success: false, total_chats: 0, chats: [] })));
  }

}

