import { Component, OnInit, Output, EventEmitter, OnDestroy, HostBinding, Input } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators } from '@angular/forms';
import { UpsertRoleRequest, UserService } from '../../Services/user.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-create-role-by-tenant',
  templateUrl: './create-role-by-tenant.component.html',
  styleUrls: ['./create-role-by-tenant.component.css']
})
export class CreateRoleByTenantComponent implements OnInit, OnDestroy {
  @Output() close = new EventEmitter<void>();
  @Output() roleCreated = new EventEmitter<void>();

  createRoleForm: FormGroup;
  tenantId: string | null;
  appId: number | null;
  createdBy: string;
  featuresList: { id: number, name: string }[] = [];
  error: string = '';
  successMessage: string = '';
  isSubmitting: boolean = false;
  isFeaturesDropdownOpen: boolean = false;

  private destroy$ = new Subject<void>();

  @Input() isDarkTheme: boolean = false;
  @HostBinding('class.dark-theme') get applyDarkTheme() {
    return this.isDarkTheme;
  }

  constructor(private fb: FormBuilder, private userService: UserService) {
    this.tenantId = this.getTenantIdFromSession();
    this.appId = this.getAppIdFromSession();
    this.createdBy = this.getUserNameFromSession();

    this.createRoleForm = this.fb.group({
      roleName: ['', [
        Validators.required,
        // This pattern allows: Letters, Numbers, Spaces, Underscores, and Hyphens ONLY
        Validators.pattern(/^[a-zA-Z0-9 _-]+$/)
      ]],
      features: new FormControl([], [Validators.required, Validators.minLength(1)])
    });
  }

  ngOnInit(): void {
    if (!this.tenantId) {
      this.error = 'Tenant ID not found in session. Please log in again.';
      return;
    }
    if (this.appId === null) {
      this.error = 'App ID not found in session. Please log in again.';
      return;
    }
    if (!this.createdBy) {
      // Hide the created by field but still require it for the payload
      this.error = 'User name not found in session. Please log in again.';
      return;
    }
    this.loadFeatures();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private getTenantIdFromSession(): string | null {
    try {
      return sessionStorage.getItem('TenantId') || null;
    } catch {
      return null;
    }
  }


  private getAppIdFromSession(): number | null {
    try {
      // FIX: Change 'AppId' to 'appId' to match the key used elsewhere.
      const appId = sessionStorage.getItem('appId');
      return appId ? parseInt(appId, 10) : null;
    } catch {
      return null;
    }
  }

  private getUserNameFromSession(): string {
    try {
      return sessionStorage.getItem('UserName') ||
        sessionStorage.getItem('userName') ||
        sessionStorage.getItem('Username') ||
        sessionStorage.getItem('username') ||
        '';
    } catch {
      return '';
    }
  }

  loadFeatures(): void {
    if (!this.tenantId || this.appId === null) return;

    this.userService.getFeaturesByTenantAndApp(this.tenantId, this.appId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          if (!response || !response.success || !response.features) {
            this.error = 'Unexpected response format from features API.';
            return;
          }

          this.featuresList = response.features.map((f: any) => ({
            id: f.id || f.FeatureId || f.feature_id,
            name: f.name || f.FeatureName || f.feature_name || f.displayName,
          }));

          if (this.featuresList.length === 0) {
            this.error = 'No features available for this tenant and app.';
          }
        },
        error: (err) => {
          console.error('Error loading features:', err);
          this.error = 'Error loading features. Please try again.';
        }
      });
  }

  onFeatureChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const featureId = parseInt(input.value, 10);
    const selectedFeatures = this.createRoleForm.get('features')?.value as number[] || [];

    if (input.checked) {
      if (!selectedFeatures.includes(featureId)) {
        this.createRoleForm.get('features')?.setValue([...selectedFeatures, featureId]);
      }
    } else {
      this.createRoleForm.get('features')?.setValue(selectedFeatures.filter(id => id !== featureId));
    }
  }

  isFeatureSelected(featureId: number): boolean {
    const selectedFeatures = this.createRoleForm.get('features')?.value as number[] || [];
    return selectedFeatures.includes(featureId);
  }

  get selectedFeaturesCount(): number {
    const selectedFeatures = this.createRoleForm.get('features')?.value as number[] || [];
    return selectedFeatures.length;
  }

  toggleFeaturesDropdown(): void {
    this.isFeaturesDropdownOpen = !this.isFeaturesDropdownOpen;
    if (!this.isFeaturesDropdownOpen) {
      this.createRoleForm.get('features')?.markAsTouched();
    }
  }

onSubmit(): void {
    if (!this.tenantId || this.appId === null || !this.createdBy) {
      this.error = 'Critical session information is missing. Please log out and log back in.';
      return;
    }
    this.createRoleForm.markAllAsTouched();
    if (this.createRoleForm.invalid) {
      this.error = 'Please provide a valid role name and select at least one feature.';
      return;
    }
    
    const payload: UpsertRoleRequest = {
      role_id: null,
      role_name: this.createRoleForm.value.roleName.trim(),
      tenant_id: this.tenantId,
      app_id: this.appId,
      user_id: this.createdBy,
      feature_ids: this.createRoleForm.value.features as number[]
    };
    
    this.error = '';
    this.successMessage = '';
    this.isSubmitting = true;

    this.userService.upsertRole(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.isSubmitting = false;
          
          // Check if the request was actually successful
          if (res && res.success) {
            this.successMessage = res.message || 'Role created successfully!';
            this.error = ''; // Clear any errors
            this.createRoleForm.reset({ features: [] });
            
            setTimeout(() => {
              this.roleCreated.emit();
              this.onClose();
            }, 1500);
          } else {
            // If success is false, display the error in the main alert box
            // The handleError function in UserService puts the backend detail in res.error
            this.error = res?.error || 'A role with this name already exists for this tenant and application.';
            this.successMessage = ''; 
          }
        },
        error: (err) => {
          // Fallback just in case an error bypasses the service's handleError
          this.isSubmitting = false;
          this.error = err?.error?.detail || err?.error?.message || 'Unknown error occurred';
        }
      });
  }

  onClose(): void {
    this.close.emit();
  }
  //   onKeyPress(event: KeyboardEvent) {
  //   // Allow only alphanumeric, space, hyphen, and underscore
  //   const charCode = event.key;
  //   const pattern = /[a-zA-Z0-9 _-]/;
  //   if (!pattern.test(charCode)) {
  //     event.preventDefault();
  //   }
  // }
}