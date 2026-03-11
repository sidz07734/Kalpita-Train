import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ElementRef, HostListener, SimpleChanges, HostBinding } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators, FormControl } from '@angular/forms';
import { Subject, forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { UserService, Feature, TenantInfo, TenantActionResponse, ApplicationDetailItem as Application, UpsertTenantRequest } from '../../Services/user.service';
import { ToasterService } from 'src/app/Services/toaster.service';

// Interface for the PUT request payload
export interface UpdateTenantRequest {
  tenant_id: string;
  tenant_name: string;
  application_names: string[];
  feature_names: string[];
  requesting_user_email: string;
}

@Component({
  selector: 'app-edit-tenant',
  templateUrl: './edit-tenant.component.html',
  styleUrls: ['./edit-tenant.component.css']
})
export class EditTenantComponent implements OnInit, OnDestroy {
  @Output() close = new EventEmitter<void>();
  @Output() tenantUpdated = new EventEmitter<void>();
  @Input() tenantData: TenantInfo | null = null;
  editTenantForm: FormGroup;
  isLoading = true; // *** FIX: Default to true to show spinner initially ***
  isSaving = false;
  error = '';

  allApplications: Application[] = [];
  allFeatures: Feature[] = [];

  isAppsDropdownOpen = false;
  isFeaturesDropdownOpen = false;

  allApplicationsSelected = false;
  allFeaturesSelected = false;

  @Input() isDarkTheme: boolean = false;
  @HostBinding('class.dark-theme') get applyDarkTheme() {
    return this.isDarkTheme;
  }

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private elementRef: ElementRef,
    private toasterService: ToasterService
  ) {
    this.editTenantForm = this.fb.group({
       tenantName: ['', [Validators.required, Validators.minLength(3), Validators.pattern(/^[a-zA-Z\s]+$/)]],
      applications: this.fb.array([]),
      features: this.fb.array([])
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isAppsDropdownOpen = false;
      this.isFeaturesDropdownOpen = false;
    }
  }

  // *** FIX: ngOnInit should be empty. ngOnChanges will handle all input changes. ***
  ngOnInit(): void {}

  // *** FIX: Centralize all initialization logic here. ***
  ngOnChanges(changes: SimpleChanges): void {
    // Check if the 'tenantData' input property has changed and is not null
    if (changes['tenantData'] && this.tenantData) {
      console.log('Tenant data received in OnChanges:', this.tenantData);
      
      // Reset state before loading new data
      this.error = '';
      this.isLoading = true;
      this.applicationsFormArray.clear(); // Clear previous form controls
      this.featuresFormArray.clear();     // Clear previous form controls
      this.editTenantForm.reset();        // Reset form values
      
      this.loadCatalogsAndInitializeForm();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get applicationsFormArray() { return this.editTenantForm.get('applications') as FormArray; }
  get featuresFormArray() { return this.editTenantForm.get('features') as FormArray; }

  get selectedAppsText(): string {
    const selectedCount = this.editTenantForm.value.applications?.filter(Boolean).length ?? 0;
    if (selectedCount === 0) return 'Select applications...';
    if (selectedCount === 1) {
      const index = this.editTenantForm.value.applications.findIndex((c: boolean) => c);
      return this.allApplications[index]?.application_name || '1 selected';
    }
    return `${selectedCount} applications selected`;
  }

  get selectedFeaturesText(): string {
    const selectedCount = this.editTenantForm.value.features?.filter(Boolean).length ?? 0;
    if (selectedCount === 0) return 'Select features...';
    if (selectedCount === 1) {
      const index = this.editTenantForm.value.features.findIndex((c: boolean) => c);
      return this.allFeatures[index]?.feature_name || '1 selected';
    }
    return `${selectedCount} features selected`;
  }

   toggleAllApplications(event: Event): void {
    const isChecked = (event.target as HTMLInputElement).checked;
    this.allApplicationsSelected = isChecked;
    // Update all controls without firing individual change events for performance
    this.applicationsFormArray.controls.forEach(control => {
      control.setValue(isChecked, { emitEvent: false });
    });
    // Manually trigger value update
    this.editTenantForm.updateValueAndValidity();
  }

  toggleAllFeatures(event: Event): void {
    const isChecked = (event.target as HTMLInputElement).checked;
    this.allFeaturesSelected = isChecked;
    this.featuresFormArray.controls.forEach(control => {
      control.setValue(isChecked, { emitEvent: false });
    });
    this.editTenantForm.updateValueAndValidity();
  }

  // Helpers to sync the "Select All" box when individual items are clicked
  private updateAllAppsSelectedState(): void {
    const controls = this.applicationsFormArray.controls;
    this.allApplicationsSelected = controls.length > 0 && controls.every(c => c.value);
  }

  private updateAllFeaturesSelectedState(): void {
    const controls = this.featuresFormArray.controls;
    this.allFeaturesSelected = controls.length > 0 && controls.every(c => c.value);
  }

  private loadCatalogsAndInitializeForm(): void {
    // 1. Guard clause to ensure tenantData exists before proceeding.
    if (!this.tenantData) {
      this.error = 'Cannot load form data because tenant data is missing.';
      this.isLoading = false;
      return;
    }

    // Assign to a local constant so TypeScript knows it's not null within this scope.
    const currentTenant = this.tenantData;
    this.isLoading = true;
    const tenantId = sessionStorage.getItem('TenantId') || '';
    // 2. Fetch all applications and features from the backend concurrently.
    forkJoin({
      apps: this.userService.getAllApplicationsWithSettings(tenantId),
      feats: this.userService.getFeatures()
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ apps, feats }) => {
        // 3. Set the tenant name in the form.
        this.editTenantForm.patchValue({ tenantName: currentTenant.tenant_name });

        // ============================================================
        // PROCESS APPLICATIONS
        // ============================================================
        if (apps.success) {
          // De-duplicate and Sort Applications
          this.allApplications = [
            ...new Map(apps.applications.map(app => [app.application_name, app])).values()
          ].sort((a, b) => (a.application_name ?? '').localeCompare(b.application_name ?? ''));

          // Get names of apps currently assigned to this tenant
          const assignedAppNames = currentTenant.applications?.map((a: any) => a.application_name) || [];

          // Clear and rebuild FormArray
          this.applicationsFormArray.clear();
          this.allApplications.forEach(app => {
            this.applicationsFormArray.push(new FormControl(assignedAppNames.includes(app.application_name)));
          });

          // NEW: Initialize "Select All" state based on loaded data
          this.updateAllAppsSelectedState();

          // NEW: Listen for changes to keep "Select All" in sync if user manually unchecks items
          this.applicationsFormArray.valueChanges
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => this.updateAllAppsSelectedState());

        } else {
          this.error = 'Failed to load applications.';
        }

        // ============================================================
        // PROCESS FEATURES
        // ============================================================
        if (feats.success) {
          const rawFeatures = feats.features || [];

          // 1. Normalize data: Convert API response (PascalCase or mixed) to UI format (snake_case)
          this.allFeatures = rawFeatures.map((f: any) => {
            return {
              // Check for both casings: feature_id vs FeatureId
              feature_id: f.feature_id || f.FeatureId,
              // Check for both casings: feature_name vs FeatureName (Fixes empty rows)
              feature_name: f.feature_name || f.FeatureName,
              // Check for both casings: is_active vs IsActive
              is_active: f.is_active !== undefined ? f.is_active : f.IsActive
            };
          }).sort((a: any, b: any) =>
            (a.feature_name || '').localeCompare(b.feature_name || '')
          ) as any[]; // Cast as any[] to prevent Interface strictness errors

          // 2. Get names of features currently assigned to this tenant
          const assignedFeatureNames = currentTenant.features?.map((f: any) => f.feature_name) || [];

          // Clear and rebuild FormArray
          this.featuresFormArray.clear();
          this.allFeatures.forEach((feat: any) => {
            this.featuresFormArray.push(new FormControl(assignedFeatureNames.includes(feat.feature_name)));
          });

          // NEW: Initialize "Select All" state based on loaded data
          this.updateAllFeaturesSelectedState();

          // NEW: Listen for changes to keep "Select All" in sync
          this.featuresFormArray.valueChanges
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => this.updateAllFeaturesSelectedState());

        } else {
          this.error += ' Failed to load features.';
        }
      },
      error: (err) => {
        this.error = 'An error occurred while loading catalog data.';
        console.error('Error fetching catalogs for edit modal:', err);
        this.isLoading = false;
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }
  onSubmit(): void {
    if (this.editTenantForm.invalid) { return; }
    if (!this.tenantData) { return; }

    this.isSaving = true;
    this.error = '';
    const executingUserEmail = sessionStorage.getItem('userEmail');
    if (!executingUserEmail) { return; }
    const payload: UpsertTenantRequest = {
      tenant_id: this.tenantData.tenant_id, 
      tenant_name: this.editTenantForm.value.tenantName,
      application_ids: this.editTenantForm.value.applications
        .map((checked: boolean, i: number) => checked ? this.allApplications[i].app_id : null)
        .filter((id: number | null): id is number => id !== null),
      feature_ids: this.editTenantForm.value.features
        .map((checked: boolean, i: number) => checked ? this.allFeatures[i].feature_id : null)
        .filter((id: number | null): id is number => id !== null),
      requesting_user_email: executingUserEmail
    };
    this.userService.upsertTenant(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: TenantActionResponse) => {
          if (response.success) {
            this.toasterService.success('Tenant updated successfully!');
            this.tenantUpdated.emit();
          } else {
            this.error = response.error || 'An unknown error occurred.';
            this.toasterService.error(this.error)
          }
        },
        error: (err) => {
          this.error = err.error?.detail || 'A server error occurred.';
          this.toasterService.error(this.error); 
          this.isSaving = false;
        },
        complete: () => this.isSaving = false
      });
  }

  closeModal(): void {
    this.close.emit();
  }

  toggleAppsDropdown = () => this.isAppsDropdownOpen = !this.isAppsDropdownOpen;
  toggleFeaturesDropdown = () => this.isFeaturesDropdownOpen = !this.isFeaturesDropdownOpen;
}