import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, HostBinding, ElementRef, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormArray, FormControl, AbstractControl, ValidationErrors } from '@angular/forms';
import { Subject, takeUntil, forkJoin, filter, switchMap, tap } from 'rxjs';
import { UserService, User, Role, Language, Model, UserUpdateAssignmentsRequest, ApplicationDetailItem } from '../../Services/user.service';
import { ToasterService } from 'src/app/Services/toaster.service';

@Component({
  selector: 'app-edit-user',
  templateUrl: './edit-user.component.html',
  styleUrls: ['./edit-user.component.css']
})
export class EditUserComponent implements OnInit, OnDestroy {
  @Input() userData!: User;
  @Output() close = new EventEmitter<void>();
  @Output() userUpdated = new EventEmitter<void>();

  editUserForm: FormGroup;
  isSaving = false;
  error = '';

  // Data stores
  allApplications: ApplicationDetailItem[] = [];
  allRoles: Role[] = [];
  allLanguages: Language[] = [];
  allModels: Model[] = [];

  // State management
  isLoading = { applications: true, roles: true, languages: true, models: true, userDefaults: true };
  isDropdownOpen = { roles: false, languages: false, models: false };

  // Session data
  tenantId: string | null = null;
  appId: string | null = null;

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
    this.editUserForm = this.fb.group({
      userName: ['', [Validators.required, Validators.minLength(3),Validators.pattern('^[a-zA-Z0-9 ]*$')]],
      userEmail: ['', [Validators.required, Validators.email]],
      application: [null, Validators.required],
      roles: this.fb.array([], this.atLeastOneCheckboxCheckedValidator),
      language: [null],
      model: [null]
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isDropdownOpen = { roles: false, languages: false, models: false };
    }
  }

  ngOnInit(): void {
    this.tenantId = sessionStorage.getItem('selectedTenantId');
    this.appId = sessionStorage.getItem('appId');

    if (!this.tenantId || !this.appId) {
      this.error = "Session information is incomplete. Cannot load required data.";
      Object.keys(this.isLoading).forEach(k => (this.isLoading as any)[k] = false);
      return;
    }

    this.editUserForm.patchValue({
      userName: this.userData.UserName,
      userEmail: this.userData.UserEmail,
    });

    this.loadInitialData();
    this.handleApplicationChanges();
    this.checkUserRoleAndRestrictForm();
  }

  private checkUserRoleAndRestrictForm(): void {
    const role = sessionStorage.getItem('userRole')?.toLowerCase().trim();
    const isSuperAdmin = sessionStorage.getItem('isSuperAdmin') === 'true';

    // Allow editing if user is SuperAdmin or Admin
    if (isSuperAdmin || role === 'superadmin' || role === 'admin') {
      return;
    }

    // Otherwise, restrict fields for regular users
    const fieldsToDisable = ['userEmail', 'application', 'roles', 'language', 'model'];
    fieldsToDisable.forEach(field => {
      this.editUserForm.get(field)?.disable();
    });
  }

  private loadInitialData(): void {
    forkJoin({
    applications: this.userService.getAllApplicationsWithSettings(this.tenantId!),
      roles: this.userService.getRolesByTenantAndApp(this.tenantId!, this.appId!),
      userDefaults: this.userService.getUserDefaults(this.userData.UserId, this.tenantId!) 
  }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ applications, roles, userDefaults }) => {
        // Populate Applications
        if (applications.success) {
          this.allApplications = applications.applications;
        }
        this.isLoading.applications = false;

        // Populate Roles
        if (roles.success) {
          this.allRoles = roles.roles.sort((a, b) => (a.role_name ?? '').localeCompare(b.role_name ?? ''));
          this.rolesFormArray.clear();
          this.allRoles.forEach(role => {
            const isAssigned = this.userData.RoleName.includes(role.role_name!);
            this.rolesFormArray.push(new FormControl(isAssigned));
          });
        }
        this.isLoading.roles = false;
        
        // Set default application, which triggers loading of languages/models via valueChanges
        if (userDefaults.success && userDefaults.defaults?.default_app_id) {
            this.editUserForm.get('application')?.setValue(userDefaults.defaults.default_app_id);
        } else if (this.allApplications.length > 0) {
            this.editUserForm.get('application')?.setValue(this.allApplications[0].app_id);
        }
        this.isLoading.userDefaults = false;
      },
      error: err => {
        this.error = 'Failed to load necessary data for editing.';
        console.error(err);
        Object.keys(this.isLoading).forEach(k => (this.isLoading as any)[k] = false);
      }
    });
  }

  private handleApplicationChanges(): void {
    this.editUserForm.get('application')?.valueChanges.pipe(
      filter((appId): appId is number => appId !== null),
      tap(() => {
        this.isLoading.languages = true;
        this.isLoading.models = true;
        this.allLanguages = [];
        this.allModels = [];
        this.editUserForm.get('language')?.reset(null, { emitEvent: false });
        this.editUserForm.get('model')?.reset(null, { emitEvent: false });
      }),
      switchMap(appId => 
        forkJoin({
          languages: this.userService.getLanguagesByApp(appId),
          models: this.userService.getModelsByApp(appId),
          userDefaults: this.userService.getUserDefaults(this.userData.UserId, this.tenantId!)
        })
      ),
      takeUntil(this.destroy$)
    ).subscribe(({ languages, models, userDefaults }) => {
      if (languages.success) {
        this.allLanguages = languages.languages;
      }
      this.isLoading.languages = false;

      if (models.success) {
        this.allModels = models.models;
      }
      this.isLoading.models = false;
      
      const defaultLangId = userDefaults.defaults?.default_language_id;
      const defaultModelId = userDefaults.defaults?.default_model_id;
      
      if (defaultLangId && this.allLanguages.some(l => l.language_id === defaultLangId)) {
        this.editUserForm.get('language')?.setValue(defaultLangId);
      }
      if (defaultModelId && this.allModels.some(m => m.model_id === defaultModelId)) {
        this.editUserForm.get('model')?.setValue(defaultModelId);
      }
    });
  }
  
  get rolesFormArray() { return this.editUserForm.get('roles') as FormArray; }

 

   onSubmit(): void {
    if (this.editUserForm.invalid) {
      this.editUserForm.markAllAsTouched();
      this.error = 'Please fill all required fields.';
      return;
    }
    this.isSaving = true;
    this.error = '';

    const executingUserEmail = sessionStorage.getItem('userEmail');
    // The formValue now contains the correct IDs from the <select> dropdowns
    const formValue = this.editUserForm.getRawValue();

    if (!this.tenantId || !formValue.application || !executingUserEmail) {
      this.error = 'Session information or Application selection is missing.';
      this.isSaving = false;
      return;
    }
    
    const selectedRoleNames = this.mapFormArrayToNames(this.rolesFormArray, this.allRoles, 'role_name');
    
    // --- THIS IS THE CORE FIX ---
    // The payload is now built directly from the form's raw values (which are IDs)
    const payload: UserUpdateAssignmentsRequest = {
      executing_user_email: executingUserEmail,
      tenant_id: this.tenantId,
      user_id_to_update: this.userData.UserId,
      new_user_name: formValue.userName,
      new_user_email: formValue.userEmail,
      
      // Send the IDs directly
      app_id: formValue.application,
      role_names: selectedRoleNames,
      language_id: formValue.language, // This is the numeric ID or null
      model_id: formValue.model,       // This is the numeric ID or null
    };

    // This part remains the same
    this.userService.adminUpdateUser(payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        if (response.success) {
           this.toasterService.success('User updated successfully!');
          this.userUpdated.emit();
          this.closeModal();
        } else {
          this.error = response.error || 'An unknown error occurred.';
          this.toasterService.error(this.error);
        }
        this.isSaving = false;
      },
      error: (err) => {
        this.error = err.error?.detail || err.error?.error || 'Failed to update user due to a server error.';
        this.toasterService.error(this.error);
        this.isSaving = false;
      }
    });
  }

  closeModal(): void {
    this.close.emit();
  }

  toggleDropdown(type: 'roles' | 'languages' | 'models') {
    if (type === 'roles') {
      this.isDropdownOpen.roles = !this.isDropdownOpen.roles;
    }
  }

  getSelectedItemsText(allItems: any[], formArrayName: string, nameKey: string): string {
    const formArray = this.editUserForm.get(formArrayName) as FormArray;
    if (!formArray) return `Select...`;

    const selectedCount = formArray.controls.filter(control => control.value).length;

    if (selectedCount === 0) return `Select...`;
    if (selectedCount === 1) {
      const selectedIndex = formArray.controls.findIndex(c => c.value);
      return allItems[selectedIndex]?.[nameKey] || '1 item selected';
    }
    return `${selectedCount} items selected`;
  }
  
  private mapFormArrayToNames(formArray: FormArray, sourceArray: any[], nameKey: string): string[] {
     return formArray.value
      .map((checked: boolean, i: number) => checked ? sourceArray[i][nameKey] : null)
      .filter((name: string | null): name is string => name !== null);
  }

  atLeastOneCheckboxCheckedValidator(control: AbstractControl): ValidationErrors | null {
    const formArray = control as FormArray;
    const hasAtLeastOne = formArray.controls.some(c => c.value);
    return hasAtLeastOne ? null : { 'required': true };
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}