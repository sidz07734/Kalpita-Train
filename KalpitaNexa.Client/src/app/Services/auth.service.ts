// Create a new file: src/app/Services/auth.service.ts

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { UserService, UserProfile, UserProfileLanguage, UserProfileModel } from './user.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // A BehaviorSubject holds the current user profile and emits it to any subscribers.
  private userProfileSubject = new BehaviorSubject<UserProfile | null>(null);
  
  // Public observable that components can subscribe to.
  public userProfile$ = this.userProfileSubject.asObservable();

  constructor(private userService: UserService) { }
  

  /**
   * Called after a successful login. It fetches the user's complete profile
   * and stores it in the BehaviorSubject, making it available app-wide.
   * @param email The email of the logged-in user.
   */
  loadUserProfile(email: string): Observable<any> {
    return this.userService.getUserProfile(email).pipe(
      tap(response => {
        if (response.success && response.profile) {
          console.log("AuthService: User profile loaded and stored in memory.", response.profile);
          this.userProfileSubject.next(response.profile);
        } else {
          console.error("AuthService: Failed to load user profile.", response.error);
          this.userProfileSubject.next(null); // Clear profile on failure
        }
      })
    );
  }

  isAuthenticated(): boolean {
    const token = sessionStorage.getItem('access_token');
    return !!token; 
  }
  /**
   * Logs the user out by clearing the stored profile.
   */
  logout(): void {
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('userIdToken');
    sessionStorage.clear();
    localStorage.clear();
    this.userProfileSubject.next(null);
  }

  /**
   * A getter to easily access the current user's assigned languages.
   */
  getAssignedLanguages(): UserProfileLanguage[] | null {
    const profile = this.userProfileSubject.getValue();
    return profile ? profile.languages : null;
  }

  /**
   * A getter to easily access the current user's assigned models.
   */
  getAssignedModels(): UserProfileModel[] | null {
    const profile = this.userProfileSubject.getValue();
    return profile ? profile.models : null;
  }

  /**
   * A synchronous getter for the current user's profile.
   */
  getCurrentUserProfile(): UserProfile | null {
    return this.userProfileSubject.getValue();
  }
}