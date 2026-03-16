import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, HostBinding } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { UpsertRoleRequest, UserService } from '../../Services/user.service';

@Component({
  selector: 'app-edit-role-by-tenant',
  templateUrl: './edit-role-by-tenant.component.html',
  styleUrls: ['./edit-role-by-tenant.component.css']
})
export class EditRoleByTenantComponent implements OnInit, OnDestroy {
  @Input() roleData: any = null;
  @Output() close = new EventEmitter<void>();
  @Output() roleUpdated = new EventEmitter<void>();

  editRoleForm: FormGroup;
  tenantId: string | null;
  appId: number | null;
  modifiedBy: string;
  featuresList: { id: number, name: string }[] = [];
  
  error: string = '';
  successMessage: string = '';
  isSubmitting: boolean = false;
  isFeaturesDropdownOpen: boolean = false;

  @Input() isDarkTheme: boolean = false;
  @HostBinding('class.dark-theme') get applyDarkTheme() {
    return this.isDarkTheme;
  }

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private cdr: ChangeDetectorRef
  ) {
    this.tenantId = this.getTenantIdFromSession();
    this.appId = this.getAppIdFromSession();
    this.modifiedBy = this.getUserNameFromSession();

    this.editRoleForm = this.fb.group({
      roleName: ['', Validators.required],
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
    if (!this.modifiedBy) {
      this.error = 'User name not found in session. Please log in again.';
      return;
    }

    console.log('Edit Role - Received roleData:', this.roleData);
    console.log('Edit Role - roleData.feature_ids:', this.roleData?.feature_ids);
    console.log('Edit Role - roleData.features:', this.roleData?.features);
    console.log('Edit Role - roleData.Features:', this.roleData?.Features);
    
    this.loadFeatures();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private getTenantIdFromSession(): string | null {
    try {
      const tenantId = sessionStorage.getItem('TenantId');
      if (tenantId) {
        console.log("Successfully found Tenant ID in session storage:", tenantId);
        return tenantId;
      } else {
        console.error("The key 'TenantId' was not found in session storage.");
        return null;
      }
    } catch (e) {
      console.error("Could not read from session storage:", e);
      return null;
    }
  }

private getAppIdFromSession(): number | null {
    try {
      // FIX: Changed 'AppId' to 'appId' to match the key used in other components.
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
          console.log('Features API response:', response);
          
          if (!response || !response.success || !response.features) {
            this.error = 'Unexpected response format from features API.';
            return;
          }

          // Map available features
          this.featuresList = response.features.map((f: any) => ({
            id: f.id || f.FeatureId || f.feature_id,
            name: f.name || f.FeatureName || f.feature_name || f.displayName,
          }));

          console.log('Mapped available features:', this.featuresList);

          // Pre-fill form AFTER features are loaded
          this.prefillFormWithRoleData();
        },
        error: (err) => {
          console.error('Error fetching features:', err);
          this.error = 'An error occurred while fetching features. Please try again.';
        }
      });
  }

  prefillFormWithRoleData(): void {
    if (!this.roleData) {
      this.error = 'Role data is missing. Cannot pre-fill form.';
      return;
    }

    console.log('=== PREFILL DEBUG START ===');
    console.log('Full roleData object:', JSON.stringify(this.roleData, null, 2));
    console.log('roleData keys:', Object.keys(this.roleData));

    // Set role name
    const roleName = this.roleData.role_name || this.roleData.RoleName || '';
    this.editRoleForm.patchValue({
      roleName: roleName
    });

    console.log('Set role name to:', roleName);

    // Extract assigned feature IDs from various possible formats
    let assignedFeatureIds: number[] = [];
    
    // Log all possible feature-related properties
    console.log('roleData.feature_ids:', this.roleData.feature_ids);
    console.log('roleData.features:', this.roleData.features);
    console.log('roleData.Features:', this.roleData.Features);
    console.log('roleData.assigned_features:', this.roleData.assigned_features);
    
    // Try different possible data structures
    if (this.roleData.feature_ids !== undefined && this.roleData.feature_ids !== null) {
      console.log('Processing feature_ids, type:', typeof this.roleData.feature_ids);
      
      if (Array.isArray(this.roleData.feature_ids)) {
        assignedFeatureIds = this.roleData.feature_ids.map((id: any) => {
          const numId = typeof id === 'number' ? id : parseInt(String(id), 10);
          return numId;
        }).filter((id: number) => !isNaN(id));
        console.log('Processed as array:', assignedFeatureIds);
      } else if (typeof this.roleData.feature_ids === 'string') {
        assignedFeatureIds = this.roleData.feature_ids
          .split(',')
          .map((id: string) => parseInt(id.trim(), 10))
          .filter((id: number) => !isNaN(id));
        console.log('Processed as comma-separated string:', assignedFeatureIds);
      } else if (typeof this.roleData.feature_ids === 'number') {
        assignedFeatureIds = [this.roleData.feature_ids];
        console.log('Processed as single number:', assignedFeatureIds);
      }
    } 
    
    if (assignedFeatureIds.length === 0 && this.roleData.features) {
      console.log('Trying features property, type:', typeof this.roleData.features);
      
      if (Array.isArray(this.roleData.features)) {
        console.log('features is array, length:', this.roleData.features.length);
        console.log('First feature:', this.roleData.features[0]);
        
        if (this.roleData.features.length > 0) {
          const firstFeature = this.roleData.features[0];
          
          if (typeof firstFeature === 'object' && firstFeature !== null) {
            console.log('Features are objects. Sample keys:', Object.keys(firstFeature));
            assignedFeatureIds = this.roleData.features
              .map((f: any) => {
                const id = f.feature_id || f.FeatureId || f.id || f.Id || f.featureId;
                console.log('Extracting ID from feature:', f, '-> ID:', id);
                return id;
              })
              .filter((id: any) => id !== undefined && id !== null)
              .map((id: any) => typeof id === 'number' ? id : parseInt(String(id), 10))
              .filter((id: number) => !isNaN(id));
          } else if (typeof firstFeature === 'string') {
            console.log('Features are strings (names)');
            assignedFeatureIds = this.featuresList
              .filter(af => {
                const included = this.roleData.features.includes(af.name);
                console.log('Checking if', af.name, 'is in assigned features:', included);
                return included;
              })
              .map(af => af.id);
          } else if (typeof firstFeature === 'number') {
            console.log('Features are already numbers');
            assignedFeatureIds = this.roleData.features;
          }
        }
      }
    }
    
    if (assignedFeatureIds.length === 0 && this.roleData.Features) {
      console.log('Trying Features property (capital F)');
      if (Array.isArray(this.roleData.Features)) {
        assignedFeatureIds = this.roleData.Features
          .map((f: any) => {
            if (typeof f === 'object' && f !== null) {
              return f.id || f.FeatureId || f.feature_id || f.Id;
            }
            return f;
          })
          .filter((id: any) => id !== undefined && id !== null)
          .map((id: any) => typeof id === 'number' ? id : parseInt(String(id), 10))
          .filter((id: number) => !isNaN(id));
      }
    }

    console.log('Final extracted feature IDs:', assignedFeatureIds);
    console.log('Available features in list:', this.featuresList);
    console.log('Available feature IDs:', this.featuresList.map(f => f.id));

    // Validate that assigned features exist in the available features list
    const validFeatureIds = assignedFeatureIds.filter(id => {
      const exists = this.featuresList.some(f => f.id === id);
      console.log('Checking if feature ID', id, 'exists in list:', exists);
      return exists;
    });

    console.log('Valid feature IDs to set:', validFeatureIds);

    if (validFeatureIds.length !== assignedFeatureIds.length) {
      console.warn('⚠️ Some assigned features are not in the available features list');
      console.warn('Valid IDs:', validFeatureIds);
      console.warn('Invalid IDs:', assignedFeatureIds.filter(id => !validFeatureIds.includes(id)));
    }

    // Set the features in the form using setTimeout to ensure DOM is ready
    setTimeout(() => {
      this.editRoleForm.get('features')?.setValue(validFeatureIds);
      this.editRoleForm.get('features')?.updateValueAndValidity();
      
      // Force change detection
      this.cdr.detectChanges();
      
      console.log('✓ Form features value after setting:', this.editRoleForm.get('features')?.value);
      console.log('✓ Selected features count:', this.selectedFeaturesCount);
      console.log('✓ Form valid:', this.editRoleForm.valid);
      
      // Log each feature's selection status
      this.featuresList.forEach(feature => {
        console.log(`Feature "${feature.name}" (ID: ${feature.id}) selected:`, this.isFeatureSelected(feature.id));
      });
      console.log('=== PREFILL DEBUG END ===');
    }, 100); // Increased timeout slightly
  }

  onFeatureChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const featureId = parseInt(input.value, 10);
    const selectedFeatures = this.editRoleForm.get('features')?.value as number[] || [];

    console.log('Feature change - ID:', featureId, 'Checked:', input.checked);
    console.log('Current selected features:', selectedFeatures);

    let newFeatures: number[];

    if (input.checked) {
      if (!selectedFeatures.includes(featureId)) {
        newFeatures = [...selectedFeatures, featureId];
        console.log('Adding feature. New selection:', newFeatures);
      } else {
        newFeatures = selectedFeatures;
      }
    } else {
      newFeatures = selectedFeatures.filter(id => id !== featureId);
      console.log('Removing feature. New selection:', newFeatures);
    }

    // Update form value
    this.editRoleForm.get('features')?.setValue(newFeatures);
    this.editRoleForm.get('features')?.markAsTouched();
    this.editRoleForm.get('features')?.updateValueAndValidity();
    
    // Force change detection to update the view
    this.cdr.detectChanges();
    
    console.log('Updated form features value:', this.editRoleForm.get('features')?.value);
    console.log('Selected count:', this.selectedFeaturesCount);
  }

  isFeatureSelected(featureId: number): boolean {
    const selectedFeatures = this.editRoleForm.get('features')?.value as number[] || [];
    const isSelected = selectedFeatures.includes(featureId);
    return isSelected;
  }

  get selectedFeaturesCount(): number {
    const selectedFeatures = this.editRoleForm.get('features')?.value as number[] || [];
    return selectedFeatures.length;
  }

  toggleFeaturesDropdown(): void {
    this.isFeaturesDropdownOpen = !this.isFeaturesDropdownOpen;
  }

  trackByFeatureId(index: number, feature: any): number {
    return feature.id;
  }

  onSubmit(): void {
    if (!this.tenantId || this.appId === null || !this.modifiedBy) {
      this.error = 'Critical session information is missing. Please log out and log back in.';
      return;
    }

    if (!this.roleData || !this.roleData.role_id) {
      this.error = 'Original role data is missing. Cannot perform update.';
      return;
    }
    this.editRoleForm.markAllAsTouched();
    if (this.editRoleForm.invalid) {
      this.error = 'Please provide a valid role name and select at least one feature.';
      return;
    }

    const payload: UpsertRoleRequest = {
      role_id: this.roleData.role_id, 
      role_name: this.editRoleForm.value.roleName.trim(),
      tenant_id: this.tenantId,
      app_id: this.appId,
      user_id: this.modifiedBy,
      feature_ids: this.editRoleForm.value.features as number[]
    };

    this.isSubmitting = true;
    this.error = '';
    this.successMessage = '';

    console.log('Updating role with upsert payload:', payload);

    this.userService.upsertRole(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          console.log('Update role (upsert) response:', response);
          this.isSubmitting = false;
          
          if (response.success) {
            this.successMessage = response.message || 'Role updated successfully!';
            
            // Emit success and close the modal after a short delay
            setTimeout(() => {
              this.roleUpdated.emit();
            }, 1500);
          } else {
            this.error = response.error || 'Failed to update role.';
          }
        },
        error: (err) => {
          console.error('Error updating role via upsert:', err);
          this.isSubmitting = false;
          this.error = err.error?.detail || err.error?.error || 'A server error occurred while updating the role.';
        }
      });
  }

  onCancel(): void {
    this.close.emit();
  }

  closeModal(): void {
    this.close.emit();
  }
}