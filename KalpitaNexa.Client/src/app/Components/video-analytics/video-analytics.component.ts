// video-analytics.component.ts
// Place at: KalpitaNexa.Client/src/app/Components/video-analytics/video-analytics.component.ts

import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface FolderStatus {
  day_folder_name: string;
  phase1_completed: boolean;
  phase2_completed: boolean;
  audio_exists: boolean;
  shorts_exists: boolean;
  processed_at: string | null;
  summary_exists: boolean;
  qa_exists: boolean;
}

type ActionState = 'idle' | 'loading' | 'success' | 'error' | 'already_exists';

interface RowActionState {
  summary: ActionState;
  qa: ActionState;
  audio: ActionState;
  shorts: ActionState;
  summaryMessage: string;
  qaMessage: string;
  audioMessage: string;
  shortsMessage: string;
}

interface QuizResult {
  id: number;
  user_email: string;
  topic: string;
  score: number;
  total_questions: number;
  taken_at: string;
}

@Component({
  selector: 'app-video-analytics',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './video-analytics.component.html',
  styleUrls: ['./video-analytics.component.css'],
})
export class VideoAnalyticsComponent implements OnInit {
  @Input() isDarkTheme: boolean = false;

  folders: FolderStatus[] = [];
  isLoading: boolean = false;
  error: string = '';

  actionStates: Map<string, RowActionState> = new Map();
  activeTab: 'videos' | 'quiz' | 'content' = 'videos';
  selectedFolder: FolderStatus | null = null;
  quizResults: QuizResult[] = [];
  isLoadingQuiz: boolean = false;
  quizError: string = '';
  expandedEmails: Set<string> = new Set();

  // Content viewer
  contentFolder: string = '';
  contentSummary: string = '';
  contentQA: string = '';
  contentAudioList: { filename: string; topic: string; url: string }[] = [];
  contentShortsList: { filename: string; title: string; topic: string; duration_seconds: number; url: string }[] = [];
  isLoadingContent: boolean = false;
  contentError: string = '';
  // Pagination
  foldersCurrentPage: number = 1;
  foldersItemsPerPage: number = 5;

  // Filters
  folderDateFilter: string = 'all';
  folderNameFilter: string = '';
  folderInstructorFilter: string = '';
  showCustomDateRange: boolean = false;
  folderStartDate: string | null = null;
  folderEndDate: string | null = null;


  get processedCount(): number {
    return this.folders.filter(f => f.phase1_completed).length;
  }

  get audioCount(): number {
    return this.folders.filter(f => f.audio_exists).length;
  }

  get filteredFolders(): FolderStatus[] {
    let result = [...this.folders];

  // Date filter
    const now = new Date();
    if (this.folderDateFilter !== 'all' && this.folderDateFilter !== 'custom') {
      const cutoff = new Date();
      if (this.folderDateFilter === '1week') cutoff.setDate(now.getDate() - 7);
      else if (this.folderDateFilter === '1month') cutoff.setMonth(now.getMonth() - 1);
      else if (this.folderDateFilter === '6months') cutoff.setMonth(now.getMonth() - 6);
      else if (this.folderDateFilter === '1year') cutoff.setFullYear(now.getFullYear() - 1);
      result = result.filter(f => f.processed_at && new Date(f.processed_at) >= cutoff);
    } else if (this.folderDateFilter === 'custom' && this.folderStartDate && this.folderEndDate) {
      const start = new Date(this.folderStartDate);
      const end = new Date(this.folderEndDate);
      end.setHours(23, 59, 59);
      result = result.filter(f => f.processed_at && new Date(f.processed_at) >= start && new Date(f.processed_at) <= end);
    }

  // Instructor/name filter
    if (this.folderInstructorFilter.trim()) {
      const q = this.folderInstructorFilter.trim().toLowerCase();
      result = result.filter(f => f.day_folder_name.toLowerCase().includes(q));
    }

    return result;
  }

  get foldersTotalPages(): number {
    return Math.max(1, Math.ceil(this.filteredFolders.length / this.foldersItemsPerPage));
  }

  get paginatedFolders(): FolderStatus[] {
    const start = (this.foldersCurrentPage - 1) * this.foldersItemsPerPage;
    return this.filteredFolders.slice(start, start + this.foldersItemsPerPage);
  }

  get uniqueInstructors(): string[] {
    const names = new Set<string>();
    this.folders.forEach(f => {
    // Extract instructor name — folders follow "Day X - ... - InstructorName"
      const parts = f.day_folder_name.split(' - ');
      if (parts.length >= 3) names.add(parts[parts.length - 1].trim());
    });
    return Array.from(names).sort();
  }


  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadStatuses();
  }

  loadStatuses(): void {
    this.isLoading = true;
    this.error = '';

    const token = sessionStorage.getItem('jwtToken') || sessionStorage.getItem('token') || '';
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });

    this.http
      .get<{ success: boolean; data: { folders: FolderStatus[]; total: number } }>(
        `${environment.apiUrl}/training/all-status`,
        { headers }
      )
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.folders = res.data.folders;
            this.folders.forEach(f => {
              this.actionStates.set(f.day_folder_name, {
                summary: 'idle',
                qa: 'idle',
                audio: 'idle',
                shorts: 'idle',
                summaryMessage: '',
                qaMessage: '',
                audioMessage: '',
                shortsMessage: '',
              });
            });
          } else {
            this.error = 'Failed to load training statuses.';
          }
          this.isLoading = false;
        },
        error: (err) => {
          console.error('VideoAnalytics error:', err);
          this.error = 'Could not connect to the training service. Check that the backend is running.';
          this.isLoading = false;
        },
      });
  }

  getActionState(folderName: string): RowActionState {
    return this.actionStates.get(folderName) ?? {
      summary: 'idle', qa: 'idle', audio: 'idle', shorts: 'idle',
      summaryMessage: '', qaMessage: '', audioMessage: '', shortsMessage: ''
    };
  }

  generateSummary(folder: FolderStatus): void {
    if (folder.summary_exists) {
      const state = this.getActionState(folder.day_folder_name);
      state.summary = 'already_exists';
      state.summaryMessage = 'Summary already generated.';
      return;
    }

    const state = this.getActionState(folder.day_folder_name);
    state.summary = 'loading';
    state.summaryMessage = '';

    const token = sessionStorage.getItem('jwtToken') || sessionStorage.getItem('token') || '';
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });

    this.http
      .post<{ success: boolean; data: any }>(
        `${environment.apiUrl}/training/generate-summary`,
        { day_folder_name: folder.day_folder_name },
        { headers }
      )
      .subscribe({
        next: (res) => {
          if (res.success) {
            const msg: string = res.data?.message || '';
            if (msg.toLowerCase().includes('already')) {
              state.summary = 'already_exists';
              state.summaryMessage = 'Summary already generated.';
            } else {
              state.summary = 'success';
              state.summaryMessage = 'Summary generated successfully.';
              folder.summary_exists = true;
              if (folder.qa_exists) folder.phase1_completed = true;
            }
          } else {
            state.summary = 'error';
            state.summaryMessage = 'Generation failed. Try again.';
          }
        },
        error: (err) => {
          state.summary = 'error';
          state.summaryMessage = err?.error?.detail || 'Generation failed. Try again.';
        },
      });
  }

  generateQA(folder: FolderStatus): void {
    if (folder.qa_exists) {
      const state = this.getActionState(folder.day_folder_name);
      state.qa = 'already_exists';
      state.qaMessage = 'Q&A already generated.';
      return;
    }

    const state = this.getActionState(folder.day_folder_name);
    state.qa = 'loading';
    state.qaMessage = '';

    const token = sessionStorage.getItem('jwtToken') || sessionStorage.getItem('token') || '';
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });

    this.http
      .post<{ success: boolean; data: any }>(
        `${environment.apiUrl}/training/generate-qa`,
        { day_folder_name: folder.day_folder_name },
        { headers }
      )
      .subscribe({
        next: (res) => {
          if (res.success) {
            const msg: string = res.data?.message || '';
            if (msg.toLowerCase().includes('already')) {
              state.qa = 'already_exists';
              state.qaMessage = 'Q&A already generated.';
            } else {
              state.qa = 'success';
              state.qaMessage = 'Q&A generated successfully.';
              folder.qa_exists = true;
              if (folder.summary_exists) folder.phase1_completed = true;
            }
          } else {
            state.qa = 'error';
            state.qaMessage = 'Generation failed. Try again.';
          }
        },
        error: (err) => {
          state.qa = 'error';
          state.qaMessage = err?.error?.detail || 'Generation failed. Try again.';
        },
      });
  }

  generateAudio(folder: FolderStatus): void {
    if (folder.audio_exists) {
      const state = this.getActionState(folder.day_folder_name);
      state.audio = 'already_exists';
      state.audioMessage = 'Audio already generated.';
      return;
    }

    const state = this.getActionState(folder.day_folder_name);
    state.audio = 'loading';
    state.audioMessage = '';

    const token = sessionStorage.getItem('jwtToken') || sessionStorage.getItem('token') || '';
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });

    this.http
      .post<{ success: boolean; data: any }>(
        `${environment.apiUrl}/training/process-audio`,
        { day_folder_name: folder.day_folder_name },
        { headers }
      )
      .subscribe({
        next: (res) => {
          if (res.success) {
            const msg: string = res.data?.message || '';
            if (msg.toLowerCase().includes('already')) {
              state.audio = 'already_exists';
              state.audioMessage = 'Audio already generated.';
            } else {
              state.audio = 'success';
              state.audioMessage = `${res.data?.audio_files_created || 0} audio files generated.`;
              folder.audio_exists = true;
            }
          } else {
            state.audio = 'error';
            state.audioMessage = 'Generation failed. Try again.';
          }
        },
        error: (err) => {
          state.audio = 'error';
          state.audioMessage = err?.error?.detail || 'Generation failed. Try again.';
        },
      });
  }

  generateShorts(folder: FolderStatus): void {
    const state = this.getActionState(folder.day_folder_name);
    if (folder.shorts_exists) {
      state.shorts = 'already_exists';
      state.shortsMessage = 'Shorts already generated.';
      return;
    }

    state.shorts = 'loading';
    state.shortsMessage = '';

    const token = sessionStorage.getItem('jwtToken') || sessionStorage.getItem('token') || '';
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });

    this.http
      .post<{ success: boolean; data: any }>(
        `${environment.apiUrl}/training/generate-shorts`,
        { day_folder_name: folder.day_folder_name },
        { headers }
      )
      .subscribe({
        next: (res) => {
          if (res.success) {
            const msg: string = res.data?.message || '';
            if (msg.toLowerCase().includes('already')) {
              state.shorts = 'already_exists';
              state.shortsMessage = 'Shorts already generated.';
            } else {
              state.shorts = 'success';
              state.shortsMessage = `${res.data?.shorts_generated ?? ''} shorts generated.`;
              folder.shorts_exists = true;
            }
          } else {
            state.shorts = 'error';
            state.shortsMessage = 'Generation failed. Try again.';
          }
        },
        error: (err) => {
          state.shorts = 'error';
          state.shortsMessage = err?.error?.detail || 'Generation failed. Try again.';
        },
      });
  }

  onDateFilterChange(value: string): void {
    this.folderDateFilter = value;
    this.showCustomDateRange = value === 'custom';
    if (!this.showCustomDateRange) {
      this.folderStartDate = null;
      this.folderEndDate = null;
    }
    this.foldersCurrentPage = 1;
  }

  applyFilters(): void {
    this.foldersCurrentPage = 1;
  }

  clearFilters(): void {
    this.folderDateFilter = 'all';
    this.folderNameFilter = '';
    this.folderInstructorFilter = '';
    this.showCustomDateRange = false;
    this.folderStartDate = null;
    this.folderEndDate = null;
    this.foldersCurrentPage = 1;
  }

  onStartDateChange(event: Event): void {
    this.folderStartDate = (event.target as HTMLInputElement).value;
  }

  onEndDateChange(event: Event): void {
    this.folderEndDate = (event.target as HTMLInputElement).value;
  }

  onInstructorFilterChange(event: Event): void {
    this.folderInstructorFilter = (event.target as HTMLSelectElement).value;
    this.applyFilters();
  }







  previousFoldersPage(): void {
    if (this.foldersCurrentPage > 1) this.foldersCurrentPage--;
  }

  nextFoldersPage(): void {
    if (this.foldersCurrentPage < this.foldersTotalPages) this.foldersCurrentPage++;
  }


  loadQuizResults(): void {
    this.isLoadingQuiz = true;
    this.quizError = '';
    const token = sessionStorage.getItem('jwtToken') || sessionStorage.getItem('token') || '';
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    const tenantId = sessionStorage.getItem('TenantId') || '';

    this.http
      .get<{ success: boolean; data: { results: QuizResult[] } }>(
        `${environment.apiUrl}/training/quiz-results${tenantId ? '?tenant_id=' + tenantId : ''}`,
        { headers }
      )
      .subscribe({
        next: (res) => {
          this.quizResults = res?.data?.results ?? [];
          if (!res?.success) this.quizError = 'Failed to load quiz results.';
          this.isLoadingQuiz = false;
        },
        error: () => {
          this.quizError = 'Could not load quiz results.';
          this.isLoadingQuiz = false;
        }
      });
  }


  get groupedQuizResults(): { email: string; results: QuizResult[] }[] {
    const map = new Map<string, QuizResult[]>();
    for (const r of this.quizResults) {
      if (!map.has(r.user_email)) map.set(r.user_email, []);
      map.get(r.user_email)!.push(r);
    }
    return Array.from(map.entries()).map(([email, results]) => ({ email, results }));
  }

  toggleEmail(email: string): void {
    this.expandedEmails.has(email) ? this.expandedEmails.delete(email) : this.expandedEmails.add(email);
  }

  loadContent(folderName: string): void {
    this.contentFolder = folderName;
    this.isLoadingContent = true;
    this.contentError = '';
    this.contentSummary = '';
    this.contentQA = '';
    this.contentAudioList = [];
    this.contentShortsList = [];
    this.activeTab = 'content';

    const token = sessionStorage.getItem('jwtToken') || sessionStorage.getItem('token') || '';
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    const encoded = encodeURIComponent(folderName);

    this.http.get<{ success: boolean; data: any }>(
      `${environment.apiUrl}/training/content?day_folder_name=${encoded}&type=summary`, { headers }
    ).subscribe({ next: (r) => { this.contentSummary = r.data?.text || ''; }, error: () => {} });

    this.http.get<{ success: boolean; data: any }>(
      `${environment.apiUrl}/training/content?day_folder_name=${encoded}&type=qa`, { headers }
    ).subscribe({ next: (r) => { this.contentQA = r.data?.text || ''; }, error: () => {} });

    this.http.get<{ success: boolean; data: any }>(
      `${environment.apiUrl}/training/audio/${encoded}`, { headers }
    ).subscribe({
      next: (r) => {
        this.contentAudioList = (r.data?.audio_files || []).map((a: any) => ({
          filename: a.filename,
          topic: a.topic,
          url: `/api/training/audio/stream?day_folder_name=${encoded}&filename=${encodeURIComponent(a.filename)}`
        }));
        this.isLoadingContent = false;
      },
      error: () => { this.isLoadingContent = false; }
    });

    this.http.get<{ success: boolean; data: any }>(
      `${environment.apiUrl}/training/shorts-metadata?day_folder_name=${encoded}`, { headers }
    ).subscribe({
      next: (r) => {
        this.contentShortsList = (r.data?.shorts || []).map((s: any) => ({
          filename: s.filename,
          title: s.title,
          topic: s.topic,
          duration_seconds: s.duration_seconds,
          url: `/api/training/shorts/stream?day_folder_name=${encoded}&filename=${encodeURIComponent(s.filename)}`
        }));
      },
      error: () => {}
    });
  }

  switchTab(tab: 'videos' | 'quiz' | 'content'): void {
    this.activeTab = tab;
    if (tab === 'quiz' && (!this.quizResults || this.quizResults.length === 0)) {
      this.loadQuizResults();
    }
  }
  
  viewFolder(folder: FolderStatus): void {
    this.selectedFolder = folder;
    this.switchTab('content');
  }

  formatQuizDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  }

  formatDate(isoString: string): string {
    if (!isoString) return '—';
    const d = new Date(isoString);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }
}