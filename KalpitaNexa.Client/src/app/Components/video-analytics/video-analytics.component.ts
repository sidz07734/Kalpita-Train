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
  processed_at: string | null;
  summary_exists: boolean;
  qa_exists: boolean;
}

type ActionState = 'idle' | 'loading' | 'success' | 'error' | 'already_exists';

interface RowActionState {
  summary: ActionState;
  qa: ActionState;
  audio: ActionState;
  summaryMessage: string;
  qaMessage: string;
  audioMessage: string;
}

// Add interface at top (after RowActionState)
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
  activeTab: 'videos' | 'quiz' = 'videos';
  quizResults: QuizResult[] = [];
  isLoadingQuiz: boolean = false;
  quizError: string = '';

  get processedCount(): number {
    return this.folders.filter(f => f.phase1_completed).length;
  }

  get audioCount(): number {
    return this.folders.filter(f => f.audio_exists).length;
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
                summaryMessage: '',
                qaMessage: '',
                audioMessage: '',
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
      summary: 'idle', qa: 'idle', audio: 'idle',
      summaryMessage: '', qaMessage: '', audioMessage: ''
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

  loadQuizResults(): void {
    this.isLoadingQuiz = true;
    this.quizError = '';
    const token = sessionStorage.getItem('jwtToken') || sessionStorage.getItem('token') || '';
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    const tenantId = sessionStorage.getItem('TenantId') || '';

    this.http
      .get<{ success: boolean; results: QuizResult[] }>(
        `${environment.apiUrl}/training/quiz-results${tenantId ? '?tenant_id=' + tenantId : ''}`,
        { headers }
      )
      .subscribe({
        next: (res) => {
          this.quizResults = res.success ? res.results : [];
          if (!res.success) this.quizError = 'Failed to load quiz results.';
          this.isLoadingQuiz = false;
        },
        error: () => {
          this.quizError = 'Could not load quiz results.';
          this.isLoadingQuiz = false;
        }
      });
  }

  switchTab(tab: 'videos' | 'quiz'): void {
    this.activeTab = tab;
    if (tab === 'quiz' && this.quizResults.length === 0) {
      this.loadQuizResults();
    }
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