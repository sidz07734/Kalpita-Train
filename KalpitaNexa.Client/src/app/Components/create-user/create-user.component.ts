// import { Component, OnInit, OnDestroy, Output, EventEmitter, HostListener, ElementRef, HostBinding, Input } from '@angular/core';
// import { FormBuilder, FormGroup, FormArray, Validators, FormControl, AbstractControl, ValidationErrors } from '@angular/forms';
// import { Subject, takeUntil } from 'rxjs';
// import { UserService, Role, CreateUserPayload, CreateUserResponse } from '../../Services/user.service';
// import { ToasterService } from 'src/app/Services/toaster.service';

// @Component({
//   selector: 'app-create-user',
//   templateUrl: './create-user.component.html',
//   styleUrls: ['./create-user.component.css']
// })
// export class CreateUserComponent implements OnInit, OnDestroy {
//   @Output() close = new EventEmitter<void>();
//   @Output() userCreated = new EventEmitter<void>();

//   createUserForm: FormGroup;
//   isLoading = false;
//   isSaving = false;
//   error = '';
  
//   roles: Role[] = [];
//   isRolesDropdownOpen = false;
  
//   tenantId: string | null = null;
//   appId: string | null = null;
//   appName: string | null = null;
  
//   private destroy$ = new Subject<void>();

//   // ++ NEW PROPERTIES FOR THE CONFIRMATION POPUP ++
//   showReactivationPrompt = false;
//   isReactivating = false;
//   reactivationMessage = '';
//   private reactivationPayload: CreateUserPayload | null = null;

//   @Input() isDarkTheme: boolean = false;
//   @HostBinding('class.dark-theme') get applyDarkTheme() {
//     return this.isDarkTheme;
//   }

//   constructor(
//     private fb: FormBuilder,
//     private userService: UserService,
//     private elementRef: ElementRef,
//     private toasterService: ToasterService
//   ) {
//     this.createUserForm = this.fb.group({
//       appName: [{ value: '', disabled: true }, Validators.required],
//       userName: ['', [Validators.required, Validators.minLength(3)]],
//       userEmail: ['', [Validators.required, Validators.email]],
//       roles: this.fb.array([], this.atLeastOneCheckboxCheckedValidator)
//     });
//   }

//   @HostListener('document:click', ['$event'])
//   onDocumentClick(event: MouseEvent): void {
//     if (this.isRolesDropdownOpen && !this.elementRef.nativeElement.contains(event.target)) {
//       this.isRolesDropdownOpen = false;
//     }
//   }

//   ngOnInit(): void {
//     this.tenantId = sessionStorage.getItem('selectedTenantId');
//     this.appId = sessionStorage.getItem('appId');
//     this.appName = sessionStorage.getItem('appName');

//     if (this.tenantId && this.appId && this.appName) {
//       this.createUserForm.patchValue({ appName: this.appName });
//       this.loadRolesForTenantAndApp(this.tenantId, this.appId);
//     } else {
//       this.error = "Session information is incomplete (Tenant, App). Cannot load roles.";
//       this.toasterService.error(this.error);
//     }
//   }

//   ngOnDestroy(): void {
//     this.destroy$.next();
//     this.destroy$.complete();
//   }

//   get rolesFormArray() {
//     return this.createUserForm.controls['roles'] as FormArray;
//   }
  
//   get selectedRolesText(): string {
//     const selectedRoles = this.createUserForm.value.roles
//       .map((checked: boolean, i: number) => checked ? this.roles[i] : null)
//       .filter((role: Role | null): role is Role => role !== null);

//     if (selectedRoles.length === 0) { return 'Select roles...'; }
//     if (selectedRoles.length === 1) { return selectedRoles[0].role_name!; }
//     return `${selectedRoles.length} roles selected`;
//   }

//   private loadRolesForTenantAndApp(tenantId: string, appId: string): void {
//     this.isLoading = true;
//     this.userService.getRolesByTenantAndApp(tenantId, appId)
//       .pipe(takeUntil(this.destroy$))
//       .subscribe({
//         next: (response) => {
//           if (response.success && response.roles) {
//             this.roles = response.roles.sort((a, b) => (a.role_name ?? '').localeCompare(b.role_name ?? ''));
//             this.roles.forEach(() => this.rolesFormArray.push(new FormControl(false)));
//           } else {
//             this.error = response.error || 'Failed to load roles for dropdown.';
//             this.toasterService.error(this.error);
//           }
//           this.isLoading = false;
//         },
//         error: (err) => {
//           this.error = 'An error occurred while fetching roles.';
//           this.isLoading = false;
//           this.toasterService.error(this.error);
//           console.error(err);
//         }
//       });
//   }

//   onSubmit(): void {
//     if (this.createUserForm.invalid) {
//       this.createUserForm.markAllAsTouched();
//       this.error = 'Please fill all required fields and select at least one role.';
//       return;
//     }
    
//     this.isSaving = true;
//     this.error = '';

//     const executingUserEmail = sessionStorage.getItem('userEmail');
//     if (!this.tenantId || !executingUserEmail || !this.appName) {
//       this.error = 'Session information is missing. Please log in again.';
//       this.isSaving = false; return;
//     }

//     const selectedRoleNames: string[] = this.createUserForm.value.roles
//       .map((checked: boolean, i: number) => checked ? this.roles[i].role_name : null)
//       .filter((name: string | null): name is string => name !== null);

//     const formValue = this.createUserForm.getRawValue();
//     const payload: CreateUserPayload = {
//       executing_user_email: executingUserEmail,
//       tenant_id: this.tenantId,
//       new_user_name: formValue.userName,
//       new_user_email: formValue.userEmail,
//       app_name: this.appName,
//       role_names: selectedRoleNames
//     };

//     this.userService.createUser(payload)
//       .pipe(takeUntil(this.destroy$))
//       .subscribe({
//         next: (response: CreateUserResponse) => {
//           if (response.success) {
//             this.toasterService.success(response.message || 'User created successfully!');
//             this.userCreated.emit();
//             this.closeModal();
//           } else {
//             this.error = response.error || 'An unknown error occurred.';
//             this.toasterService.error(this.error);
//           }
//           this.isSaving = false;
//         },
//         error: (err) => {
//           // --- THIS IS THE KEY LOGIC CHANGE ---
//           if (err.error?.status === 'USER_INACTIVE') {
//             // Store the necessary data and show the custom confirmation popup
//             this.reactivationPayload = payload;
//             this.reactivationMessage = err.error.error; // This holds the question
//             this.showReactivationPrompt = true;
//             this.isSaving = false; // Stop the spinner on the main form
//           } else {
//             // Handle all other errors by displaying them on the main form
//             this.error = err.error?.detail || err.error?.error || 'Failed to create user due to a server error.';
//             this.toasterService.error(this.error);
//             this.isSaving = false;
//           }
//         }
//       });
//   }

//   // ++ NEW METHOD: Called when the "Reactivate" button on the popup is clicked
//   confirmReactivation(): void {
//     if (!this.reactivationPayload) { return; }

//     this.isReactivating = true;
    
//     this.userService.reactivateUser(this.reactivationPayload)
//       .pipe(takeUntil(this.destroy$))
//       .subscribe({
//         next: (response) => {
//           if (response.success) {
//             this.toasterService.success(response.message || 'User reactivated successfully!');
//             this.userCreated.emit();
//             this.closeModal(); // This will close the main form
//           } else {
//             this.error = response.error || 'An unknown error occurred during reactivation.';
//             this.toasterService.error(this.error);
//           }
//           this.closeReactivationPrompt();
//         },
//         error: (err) => {
//           this.error = err.error?.detail || err.error?.error || 'Failed to reactivate user due to a server error.';
//           this.toasterService.error(this.error);
//           this.closeReactivationPrompt();
//         }
//       });
//   }
  
//   // ++ NEW METHOD: Called when the "Cancel" button on the popup is clicked
//   cancelReactivation(): void {
//     this.closeReactivationPrompt();
//   }
  
//   // ++ NEW HELPER METHOD: To hide the popup and reset its state
//   private closeReactivationPrompt(): void {
//     this.showReactivationPrompt = false;
//     this.isReactivating = false;
//     this.reactivationMessage = '';
//     this.reactivationPayload = null;
//   }

//   closeModal(): void {
//     this.close.emit();
//   }
  
//   toggleRolesDropdown(): void {
//     this.isRolesDropdownOpen = !this.isRolesDropdownOpen;
//   }

//   atLeastOneCheckboxCheckedValidator(control: AbstractControl): ValidationErrors | null {
//     const formArray = control as FormArray;
//     const hasAtLeastOne = formArray.controls.some(c => c.value);
//     return hasAtLeastOne ? null : { 'required': true };
//   }
// }
















// src/app/Components/create-user/create-user.component.ts

import { Component, OnInit, OnDestroy, Output, EventEmitter, HostListener, ElementRef, HostBinding, Input } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators, FormControl, AbstractControl, ValidationErrors } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { UserService, Role, CreateUserPayload, CreateUserResponse } from '../../Services/user.service';
import { ToasterService } from 'src/app/Services/toaster.service';

@Component({
  selector: 'app-create-user',
  templateUrl: './create-user.component.html',
  styleUrls: ['./create-user.component.css']
})
export class CreateUserComponent implements OnInit, OnDestroy {
  @Output() close = new EventEmitter<void>();
  @Output() userCreated = new EventEmitter<void>();

  createUserForm: FormGroup;
  isLoading = false;
  isSaving = false;
  error = '';
  
  roles: Role[] = [];
  isRolesDropdownOpen = false;
  
  tenantId: string | null = null;
  appId: string | null = null;
  appName: string | null = null;
  
  private destroy$ = new Subject<void>();

  // ++ NEW PROPERTIES FOR THE CONFIRMATION POPUP ++
  showReactivationPrompt = false;
  isReactivating = false;
  reactivationMessage = '';
  private reactivationPayload: CreateUserPayload | null = null;

  @Input() isDarkTheme: boolean = false;
  @HostBinding('class.dark-theme') get applyDarkTheme() {
    return this.isDarkTheme;
  }

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private elementRef: ElementRef,
    private toasterService: ToasterService
  ) {
    this.createUserForm = this.fb.group({
      appName: [{ value: '', disabled: true }, Validators.required],
      userName: ['', [Validators.required, Validators.minLength(3),Validators.pattern('^[a-zA-Z0-9 ]*$')]],
      userEmail: ['', [Validators.required, Validators.email,Validators.pattern('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$')]],
      roles: this.fb.array([], this.atLeastOneCheckboxCheckedValidator)
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.isRolesDropdownOpen && !this.elementRef.nativeElement.contains(event.target)) {
      this.isRolesDropdownOpen = false;
    }
  }

  ngOnInit(): void {
    this.tenantId = sessionStorage.getItem('selectedTenantId');
    this.appId = sessionStorage.getItem('appId');
    this.appName = sessionStorage.getItem('appName');

    if (this.tenantId && this.appId && this.appName) {
      this.createUserForm.patchValue({ appName: this.appName });
      this.loadRolesForTenantAndApp(this.tenantId, this.appId);
    } else {
      this.error = "Session information is incomplete (Tenant, App). Cannot load roles.";
      this.toasterService.error(this.error);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get rolesFormArray() {
    return this.createUserForm.controls['roles'] as FormArray;
  }
  
  get selectedRolesText(): string {
    const selectedRoles = this.createUserForm.value.roles
      .map((checked: boolean, i: number) => checked ? this.roles[i] : null)
      .filter((role: Role | null): role is Role => role !== null);

    if (selectedRoles.length === 0) { return 'Select roles...'; }
    if (selectedRoles.length === 1) { return selectedRoles[0].role_name!; }
    return `${selectedRoles.length} roles selected`;
  }

  private loadRolesForTenantAndApp(tenantId: string, appId: string): void {
    this.isLoading = true;
    this.userService.getRolesByTenantAndApp(tenantId, appId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.roles) {
            this.roles = response.roles.sort((a, b) => (a.role_name ?? '').localeCompare(b.role_name ?? ''));
            this.roles.forEach(() => this.rolesFormArray.push(new FormControl(false)));
          } else {
            this.error = response.error || 'Failed to load roles for dropdown.';
            this.toasterService.error(this.error);
          }
          this.isLoading = false;
        },
        error: (err) => {
          this.error = 'An error occurred while fetching roles.';
          this.isLoading = false;
          this.toasterService.error(this.error);
          console.error(err);
        }
      });
  }

  onSubmit(): void {
    if (this.createUserForm.invalid) {
      this.createUserForm.markAllAsTouched();
      this.error = 'Please fill all required fields and select at least one role.';
      return;
    }
    
    this.isSaving = true;
    this.error = '';

    const executingUserEmail = sessionStorage.getItem('userEmail');
    if (!this.tenantId || !executingUserEmail || !this.appName) {
      this.error = 'Session information is missing. Please log in again.';
      this.isSaving = false; return;
    }

    const selectedRoleNames: string[] = this.createUserForm.value.roles
      .map((checked: boolean, i: number) => checked ? this.roles[i].role_name : null)
      .filter((name: string | null): name is string => name !== null);

    const formValue = this.createUserForm.getRawValue();
    const payload: CreateUserPayload = {
      executing_user_email: executingUserEmail,
      tenant_id: this.tenantId,
      new_user_name: formValue.userName,
      new_user_email: formValue.userEmail,
      app_name: this.appName,
      role_names: selectedRoleNames
    };

    this.userService.createUser(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: CreateUserResponse) => {
          if (response.success) {
            this.toasterService.success(response.message || 'User created successfully!');
            this.userCreated.emit();
            this.closeModal();
          } else {
            this.error = response.error || 'An unknown error occurred.';
            this.toasterService.error(this.error);
          }
          this.isSaving = false;
        },
        error: (err) => {
          // --- THIS IS THE KEY LOGIC CHANGE ---
          if (err.error?.status === 'USER_INACTIVE') {
            // Store the necessary data and show the custom confirmation popup
            this.reactivationPayload = payload;
            this.reactivationMessage = err.error.error; // This holds the question
            this.showReactivationPrompt = true;
            this.isSaving = false; // Stop the spinner on the main form
          } else {
            // Handle all other errors by displaying them on the main form
            this.error = err.error?.detail || err.error?.error || 'Failed to create user due to a server error.';
            this.toasterService.error(this.error);
            this.isSaving = false;
          }
        }
      });
  }

  // ++ NEW METHOD: Called when the "Reactivate" button on the popup is clicked
  confirmReactivation(): void {
    if (!this.reactivationPayload) { return; }

    this.isReactivating = true;
    
    this.userService.reactivateUser(this.reactivationPayload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.toasterService.success(response.message || 'User reactivated successfully!');
            this.userCreated.emit();
            this.closeModal(); // This will close the main form
          } else {
            this.error = response.error || 'An unknown error occurred during reactivation.';
            this.toasterService.error(this.error);
          }
          this.closeReactivationPrompt();
        },
        error: (err) => {
          this.error = err.error?.detail || err.error?.error || 'Failed to reactivate user due to a server error.';
          this.toasterService.error(this.error);
          this.closeReactivationPrompt();
        }
      });
  }
  
  // ++ NEW METHOD: Called when the "Cancel" button on the popup is clicked
  cancelReactivation(): void {
    this.closeReactivationPrompt();
  }
  
  // ++ NEW HELPER METHOD: To hide the popup and reset its state
  private closeReactivationPrompt(): void {
    this.showReactivationPrompt = false;
    this.isReactivating = false;
    this.reactivationMessage = '';
    this.reactivationPayload = null;
  }

  closeModal(): void {
    this.close.emit();
  }
  
  toggleRolesDropdown(): void {
    this.isRolesDropdownOpen = !this.isRolesDropdownOpen;
  }

  atLeastOneCheckboxCheckedValidator(control: AbstractControl): ValidationErrors | null {
    const formArray = control as FormArray;
    const hasAtLeastOne = formArray.controls.some(c => c.value);
    return hasAtLeastOne ? null : { 'required': true };
  }
}