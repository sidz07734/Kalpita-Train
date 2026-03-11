import { Component, OnInit, OnDestroy, Output, EventEmitter, HostListener, ElementRef, HostBinding, Input } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators, FormControl } from '@angular/forms';
import { Subject, forkJoin, of } from 'rxjs';
import { takeUntil,startWith, catchError } from 'rxjs/operators';
// ✅ FIX: Import ApplicationDetailItem and alias it as Application for local use.
import { UserService, Feature, ApplicationDetailItem as Application, TenantActionResponse,CreateTenantPayload, GetAllApplicationsResponse, FeaturesResponse, UpsertTenantRequest } from '../../Services/user.service';
import { ToasterService } from 'src/app/Services/toaster.service';

// Payload interface to match the backend `CreateTenantRequest` model


@Component({
  selector: 'app-create-tenant',
  templateUrl: './create-tenant.component.html',
  styleUrls: ['./create-tenant.component.css']
})
export class CreateTenantComponent implements OnInit, OnDestroy {
  @Output() close = new EventEmitter<void>();
  @Output() tenantCreated = new EventEmitter<void>();

  createTenantForm: FormGroup;
  isLoading = true;
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
    this.createTenantForm = this.fb.group({
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

  ngOnInit(): void {
    this.loadInitialData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get applicationsFormArray(): FormArray {
    return this.createTenantForm.get('applications') as FormArray;
  }

  get featuresFormArray(): FormArray {
    return this.createTenantForm.get('features') as FormArray;
  }

  get selectedAppsText(): string {
    const selectedCount = this.createTenantForm.value.applications.filter(Boolean).length;
    if (selectedCount === 0) return 'Select applications...';
    if (selectedCount === 1) {
        // ✅ FIX: Added explicit 'boolean' type for the 'checked' parameter
        const index = this.createTenantForm.value.applications.findIndex((checked: boolean) => checked);
        return this.allApplications[index]?.application_name || '1 application selected';
    }
    return `${selectedCount} applications selected`;
  }

  get selectedFeaturesText(): string {
    const selectedCount = this.createTenantForm.value.features.filter(Boolean).length;
     if (selectedCount === 0) return 'Select features...';
    if (selectedCount === 1) {
        // ✅ FIX: Added explicit 'boolean' type for the 'checked' parameter
        const index = this.createTenantForm.value.features.findIndex((checked: boolean) => checked);
        return this.allFeatures[index]?.feature_name || '1 feature selected';
    }
    return `${selectedCount} features selected`;
  }


  private loadInitialData(): void {
  this.isLoading = true;

  const tenantId = sessionStorage.getItem('TenantId') || '';

    // FIX: Pass tenantId to the service call
    this.userService.getAllApplicationsWithSettings(tenantId)
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (resp) => {
        console.log('Applications API response:', resp);

        if (resp?.success && Array.isArray(resp.applications)) {
          this.allApplications = resp.applications.sort((a: any, b: any) =>
            (a.application_name || '').localeCompare(b.application_name || '')
          );

          // Critical: Clear and rebuild FormArray
          while (this.applicationsFormArray.length) {
            this.applicationsFormArray.removeAt(0);
          }
          this.allApplications.forEach(() => {
            this.applicationsFormArray.push(this.fb.control(false));
          });

          // Sync "Select All"
          this.applicationsFormArray.valueChanges
            .pipe(startWith(this.applicationsFormArray.value), takeUntil(this.destroy$))
            .subscribe(() => this.updateAllApplicationsSelectedState());
        } else {
          console.warn('Invalid applications response:', resp);
        }
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load applications:', err);
        this.error = 'Could not load applications.';
        this.isLoading = false;
      }
    });

  // Features separately
  this.userService.getFeatures()
    .pipe(takeUntil(this.destroy$))
    .subscribe(resp => {
      if (resp?.success) {
        this.allFeatures = (resp.features || []).sort((a: any, b: any) =>
          (a.feature_name || '').localeCompare(b.feature_name || '')
        );
        while (this.featuresFormArray.length) this.featuresFormArray.removeAt(0);
        this.allFeatures.forEach(() => this.featuresFormArray.push(this.fb.control(false)));
      }
    });
}
  onSubmit(): void {
  if (this.createTenantForm.invalid) { return; }
  const executingUserEmail = sessionStorage.getItem('userEmail');
  if (!executingUserEmail) { return; }

  this.isSaving = true;
  this.error = '';

  const payload: UpsertTenantRequest = {
    tenant_id: null, 
    tenant_name: this.createTenantForm.value.tenantName,
    
    // 1. MAP APPLICATIONS TO IDs
    application_ids: this.createTenantForm.value.applications
      .map((checked: boolean, i: number) => {
        // Ensure we handle both casing possibilities just to be safe
        const app = this.allApplications[i];
        return checked ? (app.app_id || (app as any).AppId) : null;
      })
      .filter((id: any) => id !== null && id !== undefined),

    // 2. MAP FEATURES TO IDs (Fixing the [null] error)
    feature_ids: this.createTenantForm.value.features
      .map((checked: boolean, i: number) => {
        const feat = this.allFeatures[i];
        // CHECK: Your interface says 'FeatureId', but API might return 'feature_id'.
        // This logic handles both to prevent nulls.
        return checked ? (feat.FeatureId || (feat as any).feature_id) : null;
      })
      .filter((id: any) => id !== null && id !== undefined),
      
    requesting_user_email: executingUserEmail
  };

  this.userService.upsertTenant(payload)
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (response) => {
        if (response.success) {
          this.toasterService.success('Tenant created successfully!');
          this.tenantCreated.emit();
          this.closeModal();
        } else {
          this.error = response.error || 'An error occurred';
          this.toasterService.error(this.error);
        }
        this.isSaving = false;
      },
      error: (err) => {
        this.error = err.error?.message || 'Server connection failed';
        this.toasterService.error(this.error);
        this.isSaving = false;
      }
    });
}

  closeModal(): void {
    this.close.emit();
  }

  toggleAppsDropdown(): void {
    this.isFeaturesDropdownOpen = false;
    this.isAppsDropdownOpen = !this.isAppsDropdownOpen;
  }

  toggleFeaturesDropdown(): void {
    this.isAppsDropdownOpen = false;
    this.isFeaturesDropdownOpen = !this.isFeaturesDropdownOpen;
  }

  
  toggleAllApplications(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.allApplicationsSelected = checked;
    this.applicationsFormArray.controls.forEach(control => {
      control.setValue(checked, { emitEvent: false });
    });
    this.applicationsFormArray.updateValueAndValidity({ emitEvent: true });
  }

  toggleAllFeatures(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.allFeaturesSelected = checked;
    this.featuresFormArray.controls.forEach(control => {
      control.setValue(checked, { emitEvent: false });
    });
    this.featuresFormArray.updateValueAndValidity({ emitEvent: true });
  }

  private updateAllApplicationsSelectedState(): void {
    const allSelected = this.applicationsFormArray.length > 0 && this.applicationsFormArray.controls.every(control => control.value);
    if (this.allApplicationsSelected !== allSelected) {
      this.allApplicationsSelected = allSelected;
    }
  }

  private updateAllFeaturesSelectedState(): void {
    const allSelected = this.featuresFormArray.length > 0 && this.featuresFormArray.controls.every(control => control.value);
    if (this.allFeaturesSelected !== allSelected) {
      this.allFeaturesSelected = allSelected;
    }
  }
}