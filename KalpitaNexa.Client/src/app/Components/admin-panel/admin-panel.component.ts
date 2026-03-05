
import { Component, OnInit, OnDestroy, Input, Output, EventEmitter,HostListener  } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { UserService, User, Role } from '../../Services/user.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-admin-panel',
  templateUrl: './admin-panel.component.html',
  styleUrls: ['./admin-panel.component.css']
})

export class AdminPanelComponent implements OnInit, OnDestroy {
  @Input() isOpen: boolean = false;
  @Input() isDarkTheme: boolean = false;
  @Output() close = new EventEmitter<void>();

  // Component State
  isLoading: boolean = false;
  error: string = '';
  activeSection: string = 'users'; // Default to the 'users' section

  // Role Management Modals
  showCreateRoleModal: boolean = false;
  showEditRoleModal: boolean = false;
  selectedRole: any = null; // Store the selected role for editing
  
  // Delete Role Modal Properties
  showDeleteRoleModal: boolean = false;
  roleToDelete: Role | null = null;
  isDeletingRole: boolean = false;

  // User Management Modals & State
  showCreateUserModal = false;
  showEditUserModal = false;
  showDeleteUserModal = false;
  selectedUserForEdit: User | null = null;
  userToDelete: User | null = null;
  isDeleting = false;

  // Toaster/Notification Properties
  showToast = false;
  toastMessage = '';
  isErrorToast = false;

  // Data
  users: User[] = [];
  tenantId: string | null = null;
  roles: Role[] = [];

  appId: number | null = null;

  private destroy$ = new Subject<void>();

  constructor(private userService: UserService, private router: Router) { }

  
  public hasOpenModal(): boolean {
    return !!(this.showCreateRoleModal || this.showEditRoleModal ||
      this.showDeleteRoleModal || this.showCreateUserModal ||
      this.showEditUserModal || this.showDeleteUserModal);
  }

  // RBAC Helpers
  private getIsSuperAdminFromSession(): boolean {
    return sessionStorage.getItem('isSuperAdmin') === 'true';
  }

  private getUserRoleFromSession(): string | null {
    return sessionStorage.getItem('userRole');
  }

  public get canManageSettingsAndRoles(): boolean {
    const role = this.getUserRoleFromSession()?.toLowerCase().trim();
    const isSuperAdmin = this.getIsSuperAdminFromSession();

    if (isSuperAdmin) {
      return true;
    }
    return role === 'superadmin' || role === 'admin';
  }

  public closeLatestModal(): boolean {
    if (this.showCreateRoleModal) {
      this.showCreateRoleModal = false;
      return true;
    }
    if (this.showEditRoleModal) {
      this.showEditRoleModal = false;
      return true;
    }
    if (this.showDeleteRoleModal) {
      this.showDeleteRoleModal = false;
      return true;
    }
    if (this.showCreateUserModal) {
      this.showCreateUserModal = false;
      return true;
    }
    if (this.showEditUserModal) {
      this.showEditUserModal = false;
      return true;
    }
    if (this.showDeleteUserModal) {
      this.showDeleteUserModal = false;
      return true;
    }
    return false;
  }

  private pushModalState(): void {
    history.pushState({ adminModalOpen: true }, '');
  }

  ngOnInit(): void {
    this.appId = this.getAppIdFromSession();
    this.loadUsers();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private getAppIdFromSession(): number | null {
  try {
    const appId = sessionStorage.getItem('AppId');
    if (appId) {
      console.log("Successfully found App ID in session storage:", appId);
      return parseInt(appId, 10);
    } else {
      console.error("The key 'AppId' was not found in session storage.");
      return null;
    }
  } catch (e) {
    console.error("Could not read App ID from session storage:", e);
    return null;
  }
}
  private loadUsers(): void {
    this.isLoading = true;
    
    // THE FIX: Change errorMessage to error
    this.error = ''; 
    this.users = [];

    const appId = sessionStorage.getItem('appId');

    if (!this.tenantId || !appId) {
      // THE FIX: Change errorMessage to error
      this.error = 'Tenant ID or App ID is missing from session. Cannot load users.';
      // THE FIX: Change errorMessage to error
      console.error(this.error, { tenantId: this.tenantId, appId: appId });
      this.isLoading = false;
      return;
    }

    this.userService.getUsersByTenant(this.tenantId, appId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.users = response.users;
          } else {
            // THE FIX: Change errorMessage to error
            this.error = response.error || 'Failed to load users.';
          }
          this.isLoading = false;
        },
        error: (err) => {
          // THE FIX: Change errorMessage to error
          this.error = 'An error occurred while fetching users. Please try again.';
          this.isLoading = false;
          console.error(err);
        }
      });
  }

  loadRoles(): void {
    this.tenantId = this.getTenantIdFromSession();
    if (!this.tenantId) {
      this.error = 'Tenant ID not found in session. Please log in again.';
      return;
    }
    this.isLoading = true;
    this.error = '';
    this.roles = [];
    this.userService.getRolesByTenant(this.tenantId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.roles = response.roles;
          } else {
            this.error = response.error || 'Failed to load roles.';
          }
          this.isLoading = false;
        },
        error: (err) => {
          console.error('Error fetching roles', err);
          this.error = 'An error occurred while fetching roles. Please try again.';
          this.isLoading = false;
        }
      });
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

  selectSection(section: string): void {
    this.activeSection = section;
    if (section === 'roles') {
      this.loadRoles();
    } else if (section === 'users') {
      this.loadUsers();
    }
  }

  closePanel(): void {
    this.showCreateRoleModal = false;
    this.showEditRoleModal = false;
    this.showDeleteRoleModal = false;
    this.selectedRole = null;
    this.roleToDelete = null;
    this.isDeletingRole = false;
    this.close.emit();
  }

  // Role Creation Methods
  onAddRole(): void {
    this.showCreateRoleModal = true;
    this.pushModalState();
  }

  closeCreateRoleModal(): void {
    this.showCreateRoleModal = false;
  }

  onRoleCreated(): void {
    this.closeCreateRoleModal();
    if (this.activeSection === 'roles') {
      this.loadRoles();
    }
  }

  // Role Editing Methods
  onEditRole(role: any): void {
    console.log('Edit role:', role);
    this.tenantId = this.getTenantIdFromSession();
    
    if (!this.tenantId) {
      this.error = 'Tenant ID not found in session. Please log in again.';
      return;
    }

    this.isLoading = true;
    
    this.userService.getRolesWithFeaturesByTenant(this.tenantId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            const roleDetails = response.roles.find((r: any) => r.role_id === role.role_id || r.role_name === role.role_name);
            
            if (roleDetails) {
              this.selectedRole = roleDetails;
              this.showEditRoleModal = true;
              this.pushModalState();
            } else {
              this.error = 'Role details not found.';
            }
          } else {
            this.error = response.error || 'Failed to load role details.';
          }
          this.isLoading = false;
        },
        error: (err) => {
          console.error('Error fetching role details:', err);
          this.error = 'An error occurred while fetching role details. Please try again.';
          this.isLoading = false;
        }
      });
  }

  closeEditRoleModal(): void {
    this.showEditRoleModal = false;
    this.selectedRole = null;
  }

  onRoleUpdated(): void {
    this.closeEditRoleModal();
    if (this.activeSection === 'roles') {
      this.loadRoles();
    }
  }

  // Role Deletion Methods
  openDeleteRoleModal(role: any): void {
    console.log('Opening delete modal for role:', role);
    this.roleToDelete = role;
    this.showDeleteRoleModal = true;
    this.isDeletingRole = false;
    this.pushModalState();
  }

  closeDeleteRoleModal(): void {
    this.showDeleteRoleModal = false;
    this.roleToDelete = null;
    this.isDeletingRole = false;
  }

 confirmDeleteRole(): void {
  if (!this.roleToDelete) {
    console.error('No role selected for deletion');
    return;
  }

  this.tenantId = this.getTenantIdFromSession();
  
  if (!this.tenantId) {
    this.error = 'Tenant ID not found in session. Please log in again.';
    this.closeDeleteRoleModal();
    return;
  }

  if (this.appId === null) {
    this.error = 'App ID not found in session. Please log in again.';
    this.closeDeleteRoleModal();
    return;
  }

  this.isDeletingRole = true;
  this.error = ''; 

  const roleId = this.roleToDelete.role_id?.toString() || this.roleToDelete.id?.toString();
  
  if (!roleId) {
    this.error = 'Role ID not found. Cannot delete role.';
    this.isDeletingRole = false;
    return;
  }

  console.log(`Attempting to delete role with ID: ${roleId} for tenant: ${this.tenantId} and app: ${this.appId}`);

  this.userService.deleteRole(roleId, this.tenantId, this.appId)
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (response) => {
        console.log('Delete role response:', response);
        this.isDeletingRole = false;
        
        if (response.success) {
          console.log('Role deleted successfully');
          this.closeDeleteRoleModal();
          this.loadRoles();
          this.showToaster('Role deleted successfully!');
        } else {
          this.error = response.error || 'Failed to delete role.';
        }
      },
      error: (err) => {
        console.error('Error deleting role:', err);
        this.isDeletingRole = false;
        this.error = err.error?.error || err.error?.message || err.message || 'An error occurred while deleting the role.';
      }
    });
}
onDeleteRole(role: any): void {
  console.log('Delete role:', role);
  
  const confirmDelete = confirm(`Are you sure you want to delete the role "${role.role_name}"?`);
  
  if (confirmDelete) {
    this.tenantId = this.getTenantIdFromSession();
    
    if (!this.tenantId) {
      this.error = 'Tenant ID not found in session. Please log in again.';
      return;
    }

    if (this.appId === null) {
      this.error = 'App ID not found in session. Please log in again.';
      return;
    }

    this.userService.deleteRole(role.role_id, this.tenantId, this.appId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            console.log('Role deleted successfully');
            this.loadRoles();
            this.showToaster('Role deleted successfully!');
          } else {
            this.error = response.error || 'Failed to delete role.';
          }
        },
        error: (err) => {
          console.error('Error deleting role:', err);
          this.error = err.error?.error || err.error?.message || 'An error occurred while deleting the role.';
        }
      });
  }
}

  // User Creation Methods
  openCreateUserModal(): void {
    this.showCreateUserModal = true;
    this.pushModalState();
  }

  closeCreateUserModal(): void {
    this.showCreateUserModal = false;
  }

  onUserCreated(): void {
    this.closeCreateUserModal();
    this.loadUsers();
  }

  // User Editing Methods
  openEditUserModal(user: User): void {
    this.selectedUserForEdit = user;
    this.showEditUserModal = true;
    this.pushModalState();
  }

  closeEditUserModal(): void {
    this.showEditUserModal = false;
    this.selectedUserForEdit = null;
  }

  onUserUpdated(): void {
    this.closeEditUserModal();
    this.showToaster('User updated successfully!');
    this.loadUsers();
  }

  // User Deletion Methods
  openDeleteUserModal(user: User): void {
    this.userToDelete = user;
    this.showDeleteUserModal = true;
    this.error = '';
    this.pushModalState();
  }

  closeDeleteUserModal(): void {
    this.showDeleteUserModal = false;
    this.userToDelete = null;
  }

  confirmDeleteUser(): void {
    if (!this.userToDelete) return;

    this.isDeleting = true;
    this.error = '';

    const executingUserEmail = sessionStorage.getItem('userEmail');
    if (!this.tenantId || !executingUserEmail) {
      this.showToaster('Session information is missing. Please log in again.', true);
      this.isDeleting = false;
      return;
    }

    const payload = {
      executing_user_email: executingUserEmail,
      tenant_id: this.tenantId,
      user_id_to_delete: this.userToDelete.UserId
    };

    this.userService.deleteUser(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.showToaster('User deleted successfully!');
            this.closeDeleteUserModal();
            this.loadUsers();
          } else {
            this.error = response.error || 'Failed to delete user.';
          }
          this.isDeleting = false;
        },
        error: (err) => {
          this.error = err.error?.detail || 'A server error occurred.';
          this.isDeleting = false;
        }
      });
  }

  // Toaster/Notification Method
  private showToaster(message: string, isError: boolean = false): void {
    this.toastMessage = message;
    this.isErrorToast = isError;
    this.showToast = true;

    setTimeout(() => {
      this.showToast = false;
    }, 4000);
  }


}