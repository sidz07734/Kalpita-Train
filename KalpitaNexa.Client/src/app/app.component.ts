// In your chatbot project's app.component.ts or main component

import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Toast, ToasterService } from './Services/toaster.service';
import { Subject, takeUntil } from 'rxjs';
import { ChatService } from './Services/chat.service';

@Component({
  selector: 'app-root',
  template: `
    <app-chatbot 
      [userEmail]="userEmail"
      [appName]="appName"
      [isIntegrated]="isIntegrated"
      [preAuthenticated]="preAuthenticated"
      [theme]="theme"
      [position]="position"
      [autoOpen]="autoOpen"
      [appId]="appId"
      [authToken]="authToken"
      [userInfo]="userInfo">
    </app-chatbot>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100vh;
      margin: 0;
      padding: 0;
      overflow: hidden;
    }
  `]
})
export class AppComponent implements OnInit {
  userEmail: string = ''; // No default email
  appName: string = '';
  isIntegrated: boolean = false;
  preAuthenticated: boolean = false;
  theme: 'light' | 'dark' = 'light';
  position: 'bottom-right' | 'bottom-left' = 'bottom-right';
  autoOpen: boolean = false;
  appId: string = '';
  authToken: string | undefined;
  userInfo: any = null;

  toasts: Toast[] = [];
  private destroy$ = new Subject<void>();

  constructor(private toasterService: ToasterService,
    private chatService: ChatService
  ) { }

  ngOnInit(): void {

    this.toasterService.toasts$
      .pipe(takeUntil(this.destroy$))
      .subscribe(toast => {
        this.toasts.push(toast);
        if (toast.duration) {
          setTimeout(() => this.removeToast(toast.id), toast.duration);
        }
      });
    // Parse URL parameters
    const urlParams = new URLSearchParams(window.location.search);

    this.userEmail = urlParams.get('userEmail') || '';
    this.appName = urlParams.get('appName') || this.appName;
    this.isIntegrated = urlParams.get('isIntegrated') === 'true';
    this.preAuthenticated = urlParams.get('preAuthenticated') === 'true';
    this.theme = (urlParams.get('theme') as 'light' | 'dark') || this.theme;
    this.position = (urlParams.get('position') as 'bottom-right' | 'bottom-left') || this.position;
    this.autoOpen = urlParams.get('autoOpen') === 'true';
    this.authToken = urlParams.get('authToken') || undefined;

    // 3. Capture Security & Context Parameters
    const timestamp = urlParams.get('ts');
    const signature = urlParams.get('sig');
    const userName = urlParams.get('userName') || '';
    const userRole = urlParams.get('userRole') || '';
    const urlTenantId = urlParams.get('TenantId') || undefined;

    // Prioritize AppID from URL (for context), fallback to session
    const urlAppId = urlParams.get('appId');
    if (urlAppId) {
      this.appId = urlAppId;
      sessionStorage.setItem('appId', urlAppId);
    } else {
      this.appId = sessionStorage.getItem('appId') || '1'; // Default
    }

    console.log('Chatbot initialized with params:', {
      userEmail: this.userEmail,
      isIntegrated: this.isIntegrated,
      appId: this.appId,
      TenantId: urlTenantId
    });

    // ============================================================
    // 4. SECURE HANDSHAKE LOGIC (The New Implementation)
    // ============================================================
    if (this.isIntegrated && this.userEmail && signature) {
      console.log('🔒 Secure Handshake Initiated...');

      this.chatService.externalLogin(
        this.userEmail,
        userName,
        userRole,
        // timestamp, 
        signature,
        this.appId,
        urlTenantId
      ).subscribe({
        next: (response) => {
          if (response.success && response.access_token) {
            console.log('✅ Handshake Success. Token acquired.');

            // A. Store Critical Session Data
            sessionStorage.setItem('access_token', response.access_token);
            sessionStorage.setItem('userEmail', this.userEmail);
            sessionStorage.setItem('userName', userName);
            sessionStorage.setItem('userRole', response.userRole || 'User'); // Use verified role from backend
            sessionStorage.setItem('userId', response.userId || this.userEmail);
            sessionStorage.setItem('isIntegrated', 'true');
            if (response.TenantId) {
              sessionStorage.setItem('TenantId', response.TenantId);
            }

            // B. Update Component State
            this.preAuthenticated = true;
            this.authToken = response.access_token;

            this.userInfo = {
              email: this.userEmail,
              name: userName,
              role: userRole,
              id: response.userId
            };

            // C. Notify Parent Window (Optional)
            if (window.parent !== window) {
              window.parent.postMessage({ type: 'CHATBOT_READY', status: 'authenticated' }, '*');
            }
          } else {
            console.error('❌ Handshake Failed:', response.error);
            this.toasterService.show('error', 'Authentication Failed');
          }
        },
        error: (err) => {
          console.error('❌ Handshake API Error:', err);
          this.toasterService.show('error', 'Connection Error');
        }
      });
    } else {
      // 5. Fallback/Standard Logic (If not integrated or missing security params)

      // Parse userInfo from URL if provided (Legacy/Insecure method)
      const userInfoParam = urlParams.get('userInfo');
      if (userInfoParam) {
        try {
          this.userInfo = JSON.parse(decodeURIComponent(userInfoParam));
        } catch (e) {
          console.error('Failed to parse userInfo:', e);
        }
      }

      // Send ready message to parent if integrated (even if handshake didn't happen)
      if (this.isIntegrated && window.parent !== window) {
        setTimeout(() => {
          window.parent.postMessage({ type: 'CHATBOT_READY' }, '*');
        }, 100);
      }
    }

    // Listen for messages from parent window
    window.addEventListener('message', (event) => {
      console.log('Received message from origin:', event.origin, event.data);

      if (event.origin !== 'http://localhost:4200' && !event.origin.includes('kalpitatechnologies.com')) {
        return;
      }

      const { type, data } = event.data;

      switch (type) {
        case 'SET_USER_DATA':
          // Handle user data from parent
          if (data) {
            console.log('Received user data from parent:', data);

            // Update user email if provided
            if (data.userEmail && data.userEmail !== this.userEmail) {
              this.userEmail = data.userEmail;
              console.log('Updated user email:', this.userEmail);
            }

            // Set sessionStorage with received data
            sessionStorage.setItem('userEmail', data.userEmail || '');
            sessionStorage.setItem('userRole', data.userRole || 'User');
            sessionStorage.setItem('userRoleName', data.userRole || 'User');
            sessionStorage.setItem('userId', data.userId || data.userEmail || '');
            sessionStorage.setItem('userName', data.userName || '');

            // If token is provided, set it (adjust key if needed for msal/auth)
            if (data.token) {
              sessionStorage.setItem('msal.idtoken', data.token);
            }

            console.log('Integrated mode: Session storage set from postMessage', sessionStorage);

            // Update userInfo with role
            this.userInfo = {
              ...this.userInfo,
              email: data.userEmail,
              name: data.userName,
              role: data.userRole,
              id: data.userId
            };
            console.log('Updated userInfo with role:', this.userInfo);

            // Trigger update
            this.updateAccessBasedOnRole(data.userRole || 'User');

            // You can emit events or update component state here if needed
          }
          break;

        case 'UPDATE_AUTHENTICATION':
          // Handle authentication updates
          if (data && data.userEmail) {
            this.userEmail = data.userEmail;
            this.authToken = data.authToken || undefined;
            this.userInfo = data.userInfo || null;
            this.preAuthenticated = true;
            console.log('Authentication updated from parent');
          }
          break;

        case 'CLEAR_AUTHENTICATION':
          // Handle logout
          this.userEmail = '';
          this.authToken = undefined;
          this.userInfo = null;
          this.preAuthenticated = false;
          console.log('Authentication cleared from parent');
          break;

        case 'OPEN_CHATBOT':
          // Handle open request
          this.autoOpen = true;
          break;

        case 'CLOSE_CHATBOT':
          // Handle close request - notify parent
          window.parent.postMessage({ type: 'CHATBOT_CLOSED' }, '*');
          break;

        case 'ADMIN_CONFIG_UPDATE':
          // Handle explicit admin config from parent
          if (data) {
            console.log('Received admin config from parent:', data);

            // Update sessionStorage
            sessionStorage.setItem('userRole', data.userRole || 'User');
            sessionStorage.setItem('userRoleName', data.userRole || 'User');

            // Update userInfo
            this.userInfo = {
              ...this.userInfo,
              role: data.userRole
            };
            console.log('Updated userInfo from admin config:', this.userInfo);

            // Use explicit flags if your app supports them
            // e.g., this.enableSettings = data.enableSettings;

            this.updateAccessBasedOnRole(data.userRole || 'User');
          }
          break;
      }
    });
  }

  private updateAccessBasedOnRole(role: string): void {
    // Your existing logic for settings & permissions accessibility
    const isAdmin = role.toLowerCase().includes('admin') || role.toLowerCase().includes('manager'); // Adjust patterns as needed
    // Example: Update config or state for settings/permissions visibility
    // If you have a service or child component method, call it here
    // e.g., this.configService.setAdminAccess(isAdmin);
    console.log('Access updated based on role:', { role, isAdmin });
    // If needed, force change detection or emit an event to child
    // this.cdRef.detectChanges(); // If injected ChangeDetectorRef
  }
  private performAutoLogin(token: string, urlTenantId: string | null) {
    this.chatService.ssoLogin(token).subscribe({
      next: (response) => {
        if (response.success && response.access_token) {
          console.log('✅ Auto-login successful!');

          // 3. SAVE THE TOKEN (This fixes the 401 error)
          sessionStorage.setItem('access_token', response.access_token);

          // 4. SAVE THE TENANT ID (Use response or fallback to URL)
          const finalTenantId = response.TenantId || urlTenantId;
          if (finalTenantId) {
            sessionStorage.setItem('TenantId', finalTenantId);
          }

          // 5. UPDATE LOCAL STATE
          this.authToken = response.access_token;

          if (response.userEmail) this.userEmail = response.userEmail;
          if (response.userId) sessionStorage.setItem('userId', response.userId);
          if (response.userRole) sessionStorage.setItem('userRole', response.userRole);

        } else {
          console.error('❌ Auto-login failed:', response.error);
        }
      },
      error: (err) => {
        console.error('❌ Auto-login network error:', err);
      }
    });
  }
  removeToast(id: number): void {
    this.toasts = this.toasts.filter(t => t.id !== id);
  }

  // ✅ Add ngOnDestroy
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

}