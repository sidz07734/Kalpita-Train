// In src/app/Components/login/login.component.ts
import { NgForm } from '@angular/forms';
import { Component, OnInit, Output, EventEmitter, Input } from '@angular/core';
import { ChatService } from 'src/app/Services/chat.service';
import { MsalService } from '@azure/msal-angular';
import { AuthenticationResult } from '@azure/msal-browser';
import { UserService } from 'src/app/Services/user.service';
import * as microsoftTeams from "@microsoft/teams-js"
// import { UserService } from 'src/app/Services/user.service';


@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {
  // State property to control which form is visible
  currentView: 'login' | 'forgotPassword' | 'resetPassword' | 'success' = 'login';
  isSsoAuthenticating = false;
  // Login Properties
  isLoggingIn = false;
  email = '';
  password = '';
  loginError = '';
  @Output() loginSuccess = new EventEmitter<{ userEmail: string; userRole: string; userId: string; userName: string; TenantId: string; }>();
  @Output() cancelLogin = new EventEmitter<void>();

   @Input() isDarkTheme: boolean = false;
isCheckingTeams = true;
  submitted: boolean = false;


  // Forgot Password Properties
  forgotEmail = '';
  otp = '';
  newPassword = '';
  confirmPassword = '';
  otpError = '';
  otpMessage = '';
  resetMessage = '';
  isOtpSending = false;
  isResetting = false;
  constructor(private chatService: ChatService, private authService: MsalService, private userService: UserService) { }

   ngOnInit(): void {
    this.checkAndExecuteTeamsSso();
    // this.isSsoAuthenticating = this.isMsalRedirectInProgress();

    // if (this.isSsoAuthenticating) {
    //   console.log("SSO redirect detected, button state set to 'Authenticating'. Waiting for MSAL...");
    // }
if (this.isRedirectingFromMsal()) {
      this.isSsoAuthenticating = true;
      console.log("SSO redirect detected from URL hash. Setting button to 'Authenticating'.");
    }
    this.authService.handleRedirectObservable().subscribe({
      next: (result: AuthenticationResult) => {
        if (result && result.idToken) {
          // Token received, now send it to our backend for validation
          this.validateSsoToken(result.idToken);
        }else {
          // This can happen if the user cancels the login at Microsoft's page
          this.isSsoAuthenticating = false;
        }
      },
      error: (error) => {
        this.loginError = 'Microsoft login failed. Please try again.';
        this.isSsoAuthenticating = false; 
        console.error(error);
      }
    });
  }
  /**
   * Central function to change the view and reset states.
   * @param view The view to switch to.
   * @param event The mouse event to prevent default link behavior.
   */
  setView(view: 'login' | 'forgotPassword' | 'resetPassword' | 'success', event?: Event): void {
    if (event) {
      event.preventDefault();
    }
    this.currentView = view;
    // Clear all errors and messages when the view changes
    this.loginError = '';
    this.otpError = '';
    this.otpMessage = '';

    // If we are returning to the login screen, clear all forgot password fields
    if (view === 'login') {
      this.forgotEmail = '';
      this.otp = '';
      this.newPassword = '';
      this.confirmPassword = '';
      this.resetMessage = '';
    }
  }
   isFilled(): boolean {
  return !!this.email && !!this.password;
}

 onSubmit(form: NgForm): void {
     this.submitted = true;
    // Prevent submission if form is invalid (an extra safeguard)
    if (form.invalid) {
      return;
    }

    this.loginError = '';
    this.isLoggingIn = true; // Start spinner and disable button

    this.chatService.login(this.email, this.password).subscribe({
      next: (response) => {
        this.isLoggingIn = false; // Stop spinner
        if (response.success && response.userEmail && response.userRole && response.userId && response.userName && response.TenantId) {
          //  this.performPostLoginTasks(response.userId);
          if (response.access_token) {
            
            sessionStorage.setItem('access_token', response.access_token);
          }
          this.loginSuccess.emit({
            userEmail: response.userEmail,
            userRole: response.userRole,
            userId: response.userId,
            userName: response.userName,
            TenantId: response.TenantId,
          });
        } else {
          this.loginError = response.error || 'Login failed. Please check your credentials.';
        }
      },
      error: (err) => {
        this.isLoggingIn = false; // Stop spinner on error
        this.loginError = "Login failed due to a server error. Please try again.";
        console.error('Login error:', err);
      }
    });
  }

  onCancel(): void {
    this.cancelLogin.emit();
  }

  // --- Forgot Password Logic ---

 // FIX: Accept 'form' as a parameter
handleSendOtp(form: NgForm): void {
  // FIX: Stop execution if the form is invalid
  if (form.invalid) {
    return;
  }

  this.isOtpSending = true;
  this.otpError = '';
  this.otpMessage = '';

  this.chatService.sendOtp(this.forgotEmail).subscribe({
    next: (response) => {
      this.isOtpSending = false;
      if (response.success) {
        this.otpMessage = response.message || 'OTP sent successfully!';
        // Wait 1 second before switching views so user sees the success message
        setTimeout(() => this.setView('resetPassword'), 1000);
      } else {
        this.otpError = response.message || 'Failed to send OTP. Check if email is registered.';
      }
    },
    error: (err) => {
      this.isOtpSending = false;
      this.otpError = err.error?.detail || 'An unexpected error occurred.';
    }
  });
}

  handleResetPassword(form: NgForm): void {
    if (form.invalid) return;
    if (!this.otp || !this.newPassword || !this.confirmPassword) {
      this.otpError = "Please fill in all fields.";
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.otpError = "Passwords do not match.";
      return;
    }

    this.isResetting = true;
    this.otpError = '';
    this.otpMessage = '';

    // IMPORTANT: In a real app, hash this password before sending.
    const newPasswordHash = this.newPassword;

    this.chatService.resetPassword(this.forgotEmail, this.otp, newPasswordHash).subscribe({
      next: (response) => {
        this.isResetting = false;
        if (response.success) {
          this.resetMessage = response.message || 'Password reset successfully!';
          this.setView('success'); // Switch to the final success message view
        } else {
          this.otpError = response.message || 'Failed to reset password.';
        }
      },
      error: (err) => {
        this.isResetting = false;
        this.otpError = err.error?.detail || 'An unexpected error occurred.';
      }
    });
  }

//  @Output() ssoLoginStarted = new EventEmitter<void>();
  @Output() ssoLoginFinished = new EventEmitter<void>(); // To hide the parent spinner

// ACTION: Replace loginWithMicrosoft
  loginWithMicrosoft(): void {
    this.loginError = '';
    // No need to emit 'started' here anymore. The parent component detects the redirect itself.
    this.authService.loginRedirect({
      scopes: ['user.read', 'email', 'openid', 'profile']
    });
  }


private validateSsoToken(token: string): void {
      this.chatService.ssoLogin(token).subscribe({
          next: (response) => {
              // This will run on success OR backend-side failure (e.g., user not in DB)
              this.isSsoAuthenticating = false; // Stop the spinner
              if (response.success && response.userEmail && response.userRole && response.userId && response.userName && response.TenantId) {
                  if (response.access_token) {
                    sessionStorage.setItem('access_token', response.access_token);
                  }
                  this.loginSuccess.emit({
                      userEmail: response.userEmail,
                      userRole: response.userRole,
                      userId: response.userId,
                      userName: response.userName,
                      TenantId: response.TenantId,
                  });
              } else {
                  this.loginError = response.error || 'SSO validation failed. Access denied.';
              }
          },
          error: (err) => {
              // This will run on network/server errors
              this.isSsoAuthenticating = false; // Stop the spinner on error
              this.loginError = err.error?.detail || "SSO validation failed due to a server error.";
              console.error('SSO backend validation error:', err);
          }
      });
  }


  private isRedirectingFromMsal(): boolean {
    const hash = window.location.hash;
    // MSAL redirects include specific parameters in the hash
    return hash.includes('code=') || hash.includes('id_token=') || hash.includes('error=');
  }
  private checkAndExecuteTeamsSso(): void {
    microsoftTeams.app.initialize().then(() => {
      // SDK Initialized -> Check context
      microsoftTeams.app.getContext().then((context) => {
        console.log("✅ Teams context detected. Staying in loading state...");
        
        // We are in Teams. Keep isCheckingTeams = true to hide the form.
        this.isSsoAuthenticating = true; 
        sessionStorage.setItem('isTeamsMode', 'true');
        // Get token silently
        microsoftTeams.authentication.getAuthToken().then((token) => {
          this.validateSsoToken(token);
        }).catch((error) => {
          console.error("❌ Teams silent auth failed:", error);
          // If silent login fails, reveal the form so they can login manually
          this.isCheckingTeams = false; 
          this.isSsoAuthenticating = false;
          
        });

      }).catch(() => {
        // SDK worked but no context (rare). Reveal form.
        console.log("No Teams Context.");
        this.isCheckingTeams = false;
      });
    }).catch(() => {
      // 3. BROWSER DETECTED: Reveal the form immediately
      console.log("ℹ️ Standard Browser detected. Showing Login Form.");
      this.isCheckingTeams = false;
      sessionStorage.removeItem('isTeamsMode');
      this.isCheckingTeams = false;
    });
  }

  // private initiateHistoryCleanup(userId: string): void {
  //   // To get the AppId, we first fetch the user's default settings.
  //   this.userService.getUserDefaults(userId).subscribe({
  //     next: (defaultsResponse) => {
  //       if (defaultsResponse.success && defaultsResponse.defaults?.default_app_id) {
  //         const appId = defaultsResponse.defaults.default_app_id;
  //         console.log(`[LoginComponent] Initiating background chat history cleanup for App ID: ${appId}`);

  //         // This is a "fire-and-forget" call. We subscribe so the HTTP request is made,
  //         // but we don't wait for it, allowing the UI to proceed without delay.
  //         this.userService.cleanupChatHistory(userId, appId).subscribe({
  //           next: () => console.log('[LoginComponent] Cleanup request sent successfully.'),
  //           error: (err) => console.error('[LoginComponent] Failed to send cleanup request:', err)
  //         });
  //       } else {
  //         console.warn('[LoginComponent] Could not get default app ID for cleanup.', defaultsResponse.error);
  //       }
  //     },
  //     error: (err) => {
  //       console.error('[LoginComponent] Failed to get user defaults for cleanup:', err);
  //     }
  //   });
  // }

  // private performPostLoginTasks(userId: string): void {
  //   this.userService.getTenants().subscribe({
  //     next: (tenantsResponse) => {
  //       if (tenantsResponse.success && tenantsResponse.tenants && tenantsResponse.tenants.length > 0) {
  //         let appId: number | null = null;
  //         // Find the first application ID available from the tenants list
  //         const tenantWithApps = tenantsResponse.tenants.find(t => t.applications && t.applications.length > 0);
  //         if (tenantWithApps && tenantWithApps.applications) {
  //           appId = tenantWithApps.applications[0].app_id;
  //         }

  //         if (appId) {
  //           console.log(`[LoginComponent] Initiating background chat history cleanup for App ID: ${appId}`);
  //           // This is a "fire-and-forget" call. We subscribe so the HTTP request is made,
  //           // but we don't wait for it, allowing the UI to proceed without delay.

  //           // Use the 'userId' directly
  //           this.userService.cleanupChatHistory(userId, appId).subscribe({
  //             next: () => console.log('[LoginComponent] Cleanup request sent successfully.'),
  //             error: (err) => console.error('[LoginComponent] Failed to send cleanup request:', err)
  //           });
  //         } else {
  //           console.warn('[LoginComponent] Could not find an App ID from tenants response for cleanup.');
  //         }
  //       } else {
  //         console.warn('[LoginComponent] Could not get tenant information for cleanup task.', tenantsResponse.error);
  //       }
  //     },
  //     error: (err) => {
  //       console.error('[LoginComponent] Failed to get tenants for cleanup task:', err);
  //     }
  //   });
  // }
}