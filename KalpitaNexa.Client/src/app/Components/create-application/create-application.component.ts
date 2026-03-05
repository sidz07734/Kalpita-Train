import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService, TenantInfo } from 'src/app/Services/user.service';

@Component({
  selector: 'app-create-application',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-application.component.html',
  styleUrls: ['./create-application.component.css']
})
export class CreateApplicationComponent implements OnInit {
  @Input() isDarkTheme: boolean = false;
  @Input() applicationData: any = null; // For edit mode
  @Output() close = new EventEmitter<void>();
  @Output() applicationSaved = new EventEmitter<void>();

  tenants: TenantInfo[] = [];
  isLoading = false;
  isSubmitting = false;
  errorMessage = '';

  // Form Model
  form = {
  application_name: '',
  tenant_ids: [] as string[],   // ← CHANGED: now array
  tenant_name: ''              // ← we don't need this anymore
};
dropdownOpen = false;

  get isEditMode(): boolean {
    return !!this.applicationData;
  }

  get modalTitle(): string {
    return this.isEditMode ? 'Edit Application' : 'Create New Application';
  }

  constructor(private userService: UserService) {}

  ngOnInit(): void {
  this.loadTenants();

  if (this.isEditMode && this.applicationData) {
    this.form.application_name = this.applicationData.application_name;
    // Assuming your app has only one tenant right now — adjust if multi
    this.form.tenant_ids = [this.applicationData.tenant_id];
  }
}

  loadTenants(): void {
    this.isLoading = true;
    this.userService.getTenants() // Make sure you have this method in user.service.ts
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.tenants = response.tenants || [];
          } else {
            this.errorMessage = 'Failed to load tenants.';
          }
          this.isLoading = false;
        },
        error: () => {
          this.errorMessage = 'Error loading tenants.';
          this.isLoading = false;
        }
      });
  }

  onTenantChange(event: any): void {
    const selectedTenant = this.tenants.find(t => t.tenant_id === event.target.value);
    if (selectedTenant) {
      this.form.tenant_name = selectedTenant.tenant_name;
    }
  }

submit(): void {
  if (!this.form.application_name.trim()) {
    this.errorMessage = 'Application name is required.';
    return;
  }

  if (this.form.tenant_ids.length === 0) {
    this.errorMessage = 'Please select at least one tenant.';
    return;
  }

  const namePattern = /^[a-zA-Z\s]+$/;
    if (!namePattern.test(this.form.application_name.trim())) {
      this.errorMessage = 'Application name should only contain letters and spaces (no numbers or special characters).';
      return;
    }

  this.isSubmitting = true;
  this.errorMessage = '';

  const payload = {
    app_id: this.isEditMode ? this.applicationData.app_id : 0,
    tenant_id: this.form.tenant_ids[0],         // ← Only first tenant
    application_name: this.form.application_name.trim(),
    is_active: true,
    executing_user: 'SuperAdmin'
  };

  this.userService.upsertApplication(payload).subscribe({
    next: () => {
      this.applicationSaved.emit();
      this.close.emit();
    },
    error: (err) => {
      this.errorMessage = err.error?.message || 'Failed to save application.';
      this.isSubmitting = false;
    }
  });
}

  closeModal(): void {
    this.close.emit();
  }
  toggleDropdown(): void {
  this.dropdownOpen = !this.dropdownOpen;
}

toggleTenant(tenantId: string): void {
  const index = this.form.tenant_ids.indexOf(tenantId);
  if (index === -1) {
    this.form.tenant_ids.push(tenantId);
  } else {
    this.form.tenant_ids.splice(index, 1);
  }
}

getSelectedTenantNames(): string {
  if (this.form.tenant_ids.length === 0) return 'Select tenant(s)';
  const selected = this.tenants.filter(t => this.form.tenant_ids.includes(t.tenant_id));
  return selected.map(t => t.tenant_name).join(', ');
}
}