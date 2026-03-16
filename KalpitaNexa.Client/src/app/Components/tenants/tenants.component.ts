import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { AdminDetailsResponse, CreateTenantAdminRequest, DeleteTenantAdminRequest, Feature, Role, TenantAdmin, TenantInfo, UpdateTenantAdminRequest, UserService, User, UserCreditInfo, DeleteTenantRequest, ApplicationDetailItem, DataSource, UpsertDataSourceRequest, DataSourceConfigItem, DataSourceType } from 'src/app/Services/user.service';
import { Subject, takeUntil, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ChatService } from 'src/app/Services/chat.service';

@Component({
  selector: 'app-tenants',
  templateUrl: './tenants.component.html',
  styleUrls: ['./tenants.component.css']
})
export class TenantsComponent implements OnInit, OnDestroy {
  @Input() userIdToken?: string;
  @Input() isOpen: boolean = false;
  @Input() selectedTenant?: TenantInfo | null = null;
  @Input() isDarkTheme: boolean = false;
  @Input() currentUserRole: number = 1;
  @Input() isSuperAdminMode: boolean = false;
  @Output() close = new EventEmitter<void>();
  @Output() tenantUpdated = new EventEmitter<void>();


  // +++ START OF NEW PROPERTIES FOR DATA SOURCES (SUPER ADMIN VIEW) +++
  allDataSources: DataSource[] = [];
  dataSourcesPaginated: DataSource[] = [];
  dataSourcesCurrentPage = 1;
  dataSourcesItemsPerPage = 5;
  dataSourcesTotalPages = 1;

  showCreateDataSourceModal = false;
  showEditDataSourceModal = false;
  showDeleteDataSourceModal = false;
  dataSourceToEdit: DataSource | null = null;
  dataSourceToDelete: DataSource | null = null;
  isDeletingDataSource = false;
  isSubmittingDataSource = false;
  dsConfigurations: DataSourceConfigItem[] = [];
  // +++ END OF NEW PROPERTIES +++

  // =============================================================================
  // COMPONENT STATE
  // =============================================================================
  isLoading = false;
  admins: TenantAdmin[] = [];
  roles: Role[] = [];
  features: Feature[] = [];
  activeTab: string = 'admins';
  showRolesTab = false;
  activeSection: string = 'admins';

  filteredApplications: ApplicationDetailItem[] = [];

  dataSourceForm: UpsertDataSourceRequest = {
    tenant_id: '',
    app_id: 0,
    data_source_id: 0,
    data_source_name: '',
    data_source_type: '',
    is_active: true,
    executing_user: '',
    configurations: []
  };

  // NEW: Users & Roles from admin-panel
  users: User[] = [];
  tenantRoles: Role[] = [];

  allTenants: TenantInfo[] = [];

  // Modal Management
  showCreateModal = false;
  showEditModal = false;
  showDeleteModal = false;
  isSubmitting = false;
  selectedAdminDetails: any = null;


  showAddTenantModal = false;
  showEditTenantModal = false;
  showDeleteTenantModal = false;
  tenantToDelete: TenantInfo | null = null;
  tenantToEdit: TenantInfo | null = null;
  showCreateTenantModal = false;
  selectedTenantForEdit: TenantInfo | null = null;

  isDeletingTenant = false;

  showAdminDetailsModal = false;
  isLoadingAdminDetails = false;
  tenantFeatures: Feature[] = [];

  // NEW: User & Role Modals
  showCreateUserModal = false;
  showEditUserModal = false;
  showDeleteUserModal = false;
  selectedUserForEdit: User | null = null;
  userToDelete: User | null = null;
  isDeleting = false;

  showCreateRoleModal = false;
  showEditRoleModal = false;
  showDeleteRoleModal = false;
  selectedRole: any = null;
  roleToDelete: Role | null = null;
  isDeletingRole = false;

  // NEW: Toast notification
  showToast = false;
  toastMessage = '';
  isErrorToast = false;

  // Form Data
  newAdmin: CreateTenantAdminRequest = {
    user_name: '',
    user_email: '',
    tenant_id: '',
    role_id: 0,
    feature_ids: [],
    created_by: 'system'
  };

  editingAdmin: TenantAdmin | null = null;
  deletingAdmin: TenantAdmin | null = null;

  // Messages
  showSuccessMessage = false;
  showErrorMessage = false;
  successMessage = '';
  errorMessage = '';
  generatedPassword = '';

  // Advanced Settings
  showAdvancedOptions = false;
  allowSystemRoleAssignment = true;
  bulkOperationMode = false;
  selectedAdminIds: string[] = [];

  userCredits: UserCreditInfo[] = [];

  appId: number | null = null;

  private destroy$ = new Subject<void>();
  showTenantSelectionForUsers: boolean = false;
  showTenantSelectionForRoles: boolean = false;

  loggedInUserEmail: string | null = null;

  itemsPerPageOptions: number[] = [5, 10, 20, 50];

  // For Tenants list
  tenantsPaginated: TenantInfo[] = [];
  tenantsCurrentPage = 1;
  tenantsItemsPerPage = 5;
  tenantsTotalPages = 1;

  // For Users list
  usersPaginated: User[] = [];
  usersCurrentPage = 1;
  usersItemsPerPage = 5;
  usersTotalPages = 1;

  // For Roles list
  tenantRolesPaginated: Role[] = [];
  rolesCurrentPage = 1;
  rolesItemsPerPage = 5;
  rolesTotalPages = 1;


  costingDateFilter: string = 'lastMonth';
  costingStartDate: string | null = null;
  costingEndDate: string | null = null;
  showCustomDateRange: boolean = false;


  allApplications: ApplicationDetailItem[] = [];
  applicationsPaginated: ApplicationDetailItem[] = [];
  applicationsCurrentPage = 1;
  applicationsItemsPerPage = 5;
  applicationsTotalPages = 1;

  showCreateApplicationModal = false;
  showEditApplicationModal = false;
  showDeleteApplicationModal = false;
  applicationToEdit: ApplicationDetailItem | null = null;
  applicationToDelete: ApplicationDetailItem | null = null;
  isDeletingApplication = false;

  selectedAppNameForHeader: string | null = null;

  allDataSourceTypes: DataSourceType[] = [];
  setupMode: 'existing' | 'new' = 'existing';
  newDsType: 'structured' | 'unstructured' = 'unstructured';
  automationConfig = {
      spo_endpoint: '',
      folder_path: '',
      fields: [
          { name: 'id', type: 'Edm.String', searchable: false, filterable: false, isKey: true }
      ]
  };
addStructuredField(): void {
    this.automationConfig.fields.push({
        name: '',
        type: 'Edm.String',
        searchable: true,
        filterable: true,
        isKey: false
    });
}

removeStructuredField(index: number): void {
    if (index > 0) { // Don't allow removing the ID key
        this.automationConfig.fields.splice(index, 1);
    }
}
  public get selectedAppName(): string | null {
    // Reads the application name that was stored in the session when the tenant was selected.
    return sessionStorage.getItem('appName');
  }

  public get canManageSettingsAndRoles(): boolean {
    // Get the user's role name directly from the session storage.
    const role = this.getUserRoleFromSession()?.toLowerCase().trim();

    // If the user is in Super Admin Mode, they can always manage settings.
    if (this.isSuperAdminMode) {
      return true;
    }

    // Otherwise, check if their role name is 'superadmin' or 'admin'.
    // This correctly identifies administrators and restricts standard users.
    return role === 'superadmin' || role === 'admin';
  }




  constructor(private userService: UserService, private chatService: ChatService) { }

  // =============================================================================
  // LIFECYCLE HOOKS
  // =============================================================================
  ngOnInit(): void {
    console.log('🟢 TenantsComponent initialized with tenant:', this.selectedTenant);
    console.log('👤 Current user role:', this.currentUserRole);
    console.log('👑 Super Admin Mode:', this.isSuperAdminMode);
    this.appId = this.getAppIdFromSession();

    // +++ START OF ADDED CODE +++
    // Get the current user's email from session storage and assign it to the new property
    this.loggedInUserEmail = this.getUserEmailFromSession();
    // +++ END OF ADDED CODE +++

    // --- RESTORE ACTIVE SECTION (Bug 2) ---
    const savedSection = sessionStorage.getItem('tenants_activeSection');

    if (this.isSuperAdminMode) {
      // Simplify: Just call selectSection for whatever should be active.
      // This avoids double-loading and race conditions with isLoading.
      this.selectSection(savedSection || 'tenants');
    } else if (this.selectedTenant) {
      // Use selectSection to properly initialize the view and trigger the correct data load
      this.selectSection(savedSection || 'users');

      // +++ START OF MODIFIED BLOCK +++
      // For regular admins, fetch the app name from session storage on initialization.
      this.selectedAppNameForHeader = this.selectedAppName;
      // +++ END OF MODIFIED BLOCK +++
    }
    this.loadDataSourceTypes();
  }

  ngOnDestroy(): void {
    this.hideMessages();
    this.destroy$.next();
    this.destroy$.complete();
  }


  private loadAllDataSources(): void {
    this.isLoading = true;
    this.errorMessage = '';
    // Assumes a new service method `getAllDataSources` exists to fetch all sources.
    this.userService.getAllDataSources().pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        if (response.success) {
          this.allDataSources = response.data_sources || [];
          this.updateDataSourcesPagination();
        } else {
          this.errorMessage = response.error || 'Failed to load data sources.';
          this.allDataSources = [];
        }
        this.isLoading = false;
      },
      error: (err) => {
        console.error('❌ Error loading all data sources:', err);
        this.errorMessage = 'A server error occurred while fetching data sources.';
        this.isLoading = false;
      }
    });
  }

  updateDataSourcesPagination(): void {
    this.dataSourcesTotalPages = Math.ceil(this.allDataSources.length / this.dataSourcesItemsPerPage);
    if (this.dataSourcesCurrentPage > this.dataSourcesTotalPages) {
      this.dataSourcesCurrentPage = 1;
    }
    const start = (this.dataSourcesCurrentPage - 1) * this.dataSourcesItemsPerPage;
    const end = start + this.dataSourcesItemsPerPage;
    this.dataSourcesPaginated = this.allDataSources.slice(start, end);
  }

  onDataSourcesItemsPerPageChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.dataSourcesItemsPerPage = Number(select.value);
    this.dataSourcesCurrentPage = 1;
    this.updateDataSourcesPagination();
  }

  previousDataSourcesPage(): void {
    if (this.dataSourcesCurrentPage > 1) {
      this.dataSourcesCurrentPage--;
      this.updateDataSourcesPagination();
    }
  }

  nextDataSourcesPage(): void {
    if (this.dataSourcesCurrentPage < this.dataSourcesTotalPages) {
      this.dataSourcesCurrentPage++;
      this.updateDataSourcesPagination();
    }
  }

 onTenantSelectionChange(shouldResetAppId: boolean = true): void {
    const selectedId = this.dataSourceForm.tenant_id;
    console.log('🎯 Filtering applications for Tenant ID:', selectedId);

    if (!selectedId) {
        this.filteredApplications = [];
        return;
    }

    // Filter the allApplications array that we loaded in step 1
    this.filteredApplications = this.allApplications.filter(
        app => app.tenant_id === selectedId
    );

    console.log(`📊 Found ${this.filteredApplications.length} matching applications`);

    // Reset the application selection only if we are creating a new one
    if (shouldResetAppId) {
        this.dataSourceForm.app_id = 0;
    }
}

  addConfigRow(): void {
    this.dsConfigurations.push({
      configuration_name: '',
      config_key: '',
      config_value: '',
      category: 'General'
    });
  }

  // 2. Add this method to handle removing rows
  removeConfigRow(index: number): void {
    this.dsConfigurations.splice(index, 1);
  }

  openCreateDataSourceModal(): void {
    const userEmail = this.getUserEmailFromSession();
    if (!userEmail) {
      this.showToastMessage('User session not found. Please log in again.', true);
      return;
    }

    this.dataSourceToEdit = null;

    // Reset Form
    this.dataSourceForm = {
      tenant_id: '',
      app_id: 0,
      data_source_id: 0,
      data_source_name: '',
      data_source_type: '',
      is_active: true,
      executing_user: userEmail,
      configurations: [] // <--- Ensure this is initialized
    };

    // Reset UI Config Table
    this.dsConfigurations = [];
    this.addConfigRow(); // Add one empty row by default

    // Load dropdown data if missing
    if (this.allTenants.length === 0) this.loadAllTenants();
    if (this.allApplications.length === 0) this.loadAllApplications();

    this.showCreateDataSourceModal = true;
    this.showEditDataSourceModal = false;
  }

  closeCreateDataSourceModal(): void {
    this.showCreateDataSourceModal = false;
  }

  openEditDataSourceModal(dataSource: DataSource): void {
    const userEmail = this.getUserEmailFromSession();
    if (!userEmail) return;

    this.dataSourceToEdit = { ...dataSource };

    // 1. Populate the shared form object
    this.dataSourceForm = {
      data_source_id: dataSource.data_source_id,
      data_source_name: dataSource.data_source_name,
      data_source_type: dataSource.data_source_type,
      // Handle both isActive (camelCase from interface) and is_active (snake_case from possible API response)
      is_active: dataSource.isActive !== undefined ? dataSource.isActive : ((dataSource as any).is_active !== undefined ? (dataSource as any).is_active : true),
      // Handle both tenant_id and tenantId
      tenant_id: (dataSource as any).tenant_id || (dataSource as any).tenantId || '',
      // Handle both app_id and appId
      app_id: (dataSource as any).app_id || (dataSource as any).appId || 0,
      executing_user: userEmail,
      configurations: []
    };

    // 2. Populate configurations if the dataSource has them, 
    // otherwise start with one empty row like the create form
    // (Assuming 'configurations' exists on your DataSource model)
    if ((dataSource as any).configurations && (dataSource as any).configurations.length > 0) {
      this.dsConfigurations = [...(dataSource as any).configurations];
    } else {
      this.dsConfigurations = [];
      this.addConfigRow();
    }

    // 3. Trigger the "Create" modal variable for both actions
    this.showCreateDataSourceModal = true;
    this.showEditDataSourceModal = false;

    // 4. Ensure master lists are loaded
    if (this.allTenants.length === 0) this.loadAllTenants();
    if (this.allApplications.length === 0) this.loadAllApplications();

    // 5. Important: Trigger the tenant selection change to populate the app dropdown
    // Pass false to avoid resetting the app_id we just populated
    this.onTenantSelectionChange(false);
  }

  closeEditDataSourceModal(): void {
    this.showEditDataSourceModal = false;
    this.dataSourceToEdit = null;
  }

 onDataSourceSaved(): void {
    const userEmail = this.getUserEmailFromSession();
    if (!userEmail) return;

    this.isSubmittingDataSource = true;

    if (this.setupMode === 'new') {
        // CASE: AUTOMATED INDEX CREATION
        const payload = {
            type: this.newDsType,
            data_source_name: this.dataSourceForm.data_source_name,
            data_source_type: this.dataSourceForm.data_source_type,
            app_id: this.dataSourceForm.app_id,
            executing_user: userEmail,
            config: {
                spo_endpoint: this.automationConfig.spo_endpoint,
                folder_path: this.automationConfig.folder_path
            },
            fields: this.newDsType === 'structured' ? this.automationConfig.fields : []
        };

        this.userService.automateDataSource(payload).subscribe({
            next: (res: any) => {
                this.showToastMessage('Azure resources created and synced successfully!', false);
                this.closeCreateDataSourceModal();
                this.loadAllDataSources();
                this.isSubmittingDataSource = false;
            },
            error: (err: any) => {
                this.showToastMessage(err.error?.detail || 'Automation failed.', true);
                this.isSubmittingDataSource = false;
            }
        });
    } else {
        // CASE: MANUAL UPSERT (Existing Index)
        this.dataSourceForm.executing_user = userEmail;
        this.dataSourceForm.configurations = this.dsConfigurations;

        this.userService.upsertDataSource(this.dataSourceForm).subscribe({
            next: (res) => {
                this.showToastMessage('Data source saved successfully!', false);
                this.closeCreateDataSourceModal();
                this.loadAllDataSources();
                this.isSubmittingDataSource = false;
            },
            error: (err) => {
                this.showToastMessage('Failed to save data source.', true);
                this.isSubmittingDataSource = false;
            }
        });
    }
}

  openDeleteDataSourceModal(dataSource: DataSource): void {
    console.log('Data source to delete:', dataSource);
    this.dataSourceToDelete = dataSource;
    this.showDeleteDataSourceModal = true;
  }

  closeDeleteDataSourceModal(): void {
    this.showDeleteDataSourceModal = false;
    this.dataSourceToDelete = null;
  }

  confirmDeleteDataSource(): void {
    // FIX: Check for the correct properties: 'appId' and 'data_source_id'
    if (!this.dataSourceToDelete?.appId || !this.dataSourceToDelete?.data_source_id) {
      this.errorMessage = "Cannot delete: Application ID or Data Source ID is missing.";
      console.error("Delete failed due to missing IDs on dataSourceToDelete:", this.dataSourceToDelete);
      return;
    }

    this.isDeletingDataSource = true;
    this.errorMessage = '';

    // FIX: Call the service with the correct camelCase properties that the service method expects
    this.userService.deleteDataSource(this.dataSourceToDelete.appId, this.dataSourceToDelete.data_source_id).subscribe({
      next: (res) => {
        if (res.success) {
          this.allDataSources = this.allDataSources.filter(
            // Use the correct snake_case property for filtering the local array
            ds => ds.data_source_id !== this.dataSourceToDelete!.data_source_id
          );
          this.updateDataSourcesPagination();
          this.closeDeleteDataSourceModal();
          this.showToastMessage('Data source deleted successfully!', false);
        } else {
          this.errorMessage = res.error || 'Failed to delete data source.';
        }
        this.isDeletingDataSource = false;
      },
      error: (err) => {
        console.error('Delete failed:', err);
        this.errorMessage = err.error?.detail || err.error?.error || 'A server error occurred during deletion.';
        this.isDeletingDataSource = false;
      }
    });
  }
  // =============================================================================
  // SESSION STORAGE HELPERS (NEW & REFINED METHODS)
  // =============================================================================

  /**
   * Reads the SuperAdmin status from session storage. Returns true only if the value is 'true'.
   */
  private getIsSuperAdminFromSession(): boolean {
    return sessionStorage.getItem('isSuperAdmin') === 'true';
  }

  /**
   * Reads the user's role from session storage using the 'userRole' key.
   */
  private getUserRoleFromSession(): string | null {
    return sessionStorage.getItem('userRole');
  }

  /**
   * Reads the user's email from session storage.
   */
  private getUserEmailFromSession(): string | null {
    return sessionStorage.getItem('userEmail');
  }


  private canViewAllUsers(): boolean {
    const isSuperAdminSession = this.getIsSuperAdminFromSession();
    const role = this.getUserRoleFromSession();

    // --- START OF FIX ---
    // The previous logic only checked for 'admin'. This new logic correctly
    // identifies both 'admin' and 'superadmin' as roles with rights to view all users.
    const normalizedRole = role?.trim().toLowerCase();
    const isAdminOrSuperAdmin = normalizedRole === 'admin' || normalizedRole === 'superadmin';

    console.log(`[Auth Check] isSuperAdminFromSession: ${isSuperAdminSession}, Role from Session: '${role}', HasAdminRights: ${isAdminOrSuperAdmin}`);

    return isSuperAdminSession || isAdminOrSuperAdmin;
    // --- END OF FIX ---
  }




  private loadAllTenants(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.userService.getTenants()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.allTenants = response.tenants;
            console.log('✅ Loaded all tenants for Super Admin:', this.allTenants);
            console.log('🔍 First tenant CreatedOn check:', this.allTenants[0]?.created_on, this.allTenants[0]?.CreatedOn);
            this.updateTenantsPagination();
          } else {
            this.errorMessage = response.error || 'Failed to load tenants.';
            this.allTenants = [];
          }
          this.isLoading = false;
        },
        error: (err) => {
          console.error('❌ Error loading all tenants:', err);
          this.errorMessage = 'An error occurred while fetching tenants.';
          this.isLoading = false;
        }
      });
  }

  private loadTenantAdmins(): void {
    if (!this.selectedTenant?.tenant_id) {
      this.isLoading = false;
      return;
    }
    this.userService.getTenantAdmins(this.selectedTenant.tenant_id).subscribe({
      next: (response) => {
        this.admins = response.success ? response.admins : [];
        this.errorMessage = response.success ? '' : (response.error || 'Failed to load administrators');
        this.isLoading = false;
      },
      error: (error) => {
        this.errorMessage = 'Failed to load administrators';
        this.admins = [];
        this.isLoading = false;
      }
    });
  }

  // =============================================================================
  // MODIFIED METHOD: `loadUsers` now contains the specific fix for SuperAdmin
  // =============================================================================
  private loadUsers(): void {
    const tenantId = this.selectedTenant?.tenant_id;
    const appId = sessionStorage.getItem('appId');
    const userEmail = this.getUserEmailFromSession();

    console.log('[Tenants Component] Preparing to load users with session info:', { tenantId, appId, userEmail });

    if (!tenantId || !appId || !userEmail) {
      this.errorMessage = "Cannot load users: Critical session information (Tenant ID, App ID, or User Email) is missing.";
      console.error(this.errorMessage, { tenantId, appId, userEmail });
      this.isLoading = false;
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    // Check if the current user is a SuperAdmin for the special logic
    const isSuperAdmin = this.getIsSuperAdminFromSession();

    if (this.canViewAllUsers()) {
      // SCENARIO 1: The user is a SuperAdmin.
      if (isSuperAdmin) {
        console.log('▶️ Loading all users + self-profile (SuperAdmin privileges detected).');

        // Define the two API calls to be made
        const tenantUsers$ = this.userService.getUsersByTenant(tenantId, appId);
        const superAdminProfile$ = this.userService.getUserProfile(userEmail);

        // Use forkJoin to run them in parallel
        forkJoin([tenantUsers$, superAdminProfile$])
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: ([usersResponse, profileResponse]) => {
              let tenantUsers: User[] = [];
              // Handle the response for the tenant users list
              // if (usersResponse.success) {
              //     tenantUsers = usersResponse.users;
              if (usersResponse.success) {
                // =========================================================
                // ++ THIS IS THE FIX ++
                // =========================================================
                // Filter the user list to only include users with the 'Admin' role.
                tenantUsers = usersResponse.users.filter(user =>
                  user.RoleName && user.RoleName.trim().toLowerCase() === 'admin'
                );
                console.log(`✅ SuperAdmin View: Filtered ${usersResponse.users.length} total users down to ${tenantUsers.length} admins.`);
              } else {
                // Still show an error but continue processing the profile
                this.errorMessage = usersResponse.error || 'Failed to load the user list.';
              }

              // Handle the response for the SuperAdmin's own profile
              if (profileResponse.success && profileResponse.profile) {
                const superAdminProfile = profileResponse.profile;
                // Check if the SuperAdmin is already in the tenant user list
                const isAlreadyInList = tenantUsers.some(u => u.UserId === superAdminProfile.userId);

                const superAdminRoleIsAdmin = superAdminProfile.roles?.some(r => r.toLowerCase().trim() === 'admin');
                if (!isAlreadyInList && superAdminRoleIsAdmin) {
                  // If not present, create a User object for the SuperAdmin
                  const superAdminUser: User = {
                    UserId: superAdminProfile.userId,
                    UserName: superAdminProfile.userName,
                    UserEmail: superAdminProfile.userEmail,
                    RoleName: superAdminProfile.roles?.[0] || 'SuperAdmin',
                    IsActive: true,
                    // CreatedOn: 'N/A', // Data not available from this endpoint
                    // CreatedBy: 'N/A',
                    CreatedOn: superAdminProfile.CreatedOn || superAdminProfile.created_on || 'N/A',
                    CreatedBy: superAdminProfile.CreatedBy || superAdminProfile.created_by || 'N/A',
                  };
                  // Add the SuperAdmin's record to the start of the array
                  tenantUsers.unshift(superAdminUser);
                  console.log(`✅ Merged SuperAdmin profile into user list.`);
                }
              }
              // Assign the final, combined list to the component's user array
              this.users = tenantUsers;
              this.users.sort((a, b) => a.UserName.localeCompare(b.UserName));
              this.updateUsersPagination();
              this.isLoading = false;
            },
            error: (err) => {
              console.error('❌ Error fetching combined user data for SuperAdmin:', err);
              this.errorMessage = 'A server error occurred while fetching user data.';
              this.isLoading = false;
              this.users = [];
            }
          });


      } else {
        // SCENARIO 2: The user is a regular Admin (not a SuperAdmin).
        console.log('▶️ Loading all users (Admin privileges detected).');
        this.userService.getUsersByTenant(tenantId, appId)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (response) => {
              if (response.success) {
                this.users = response.users;
                this.users.sort((a, b) => a.UserName.localeCompare(b.UserName));
                console.log(`✅ Loaded ${this.users.length} users successfully.`);
                this.updateUsersPagination();
              } else {
                this.errorMessage = response.error || 'Failed to load user list.';
                this.users = [];
              }
              this.isLoading = false;
            },
            error: (err) => {
              console.error('❌ Error fetching all users:', err);
              this.errorMessage = 'A server error occurred while fetching the user list.';
              this.isLoading = false;
              this.users = [];
            }
          });
      }
    } else {
      // SCENARIO 3: Regular User -> Load ONLY their own profile
      console.log('▶️ Loading single user profile (Standard user privileges detected).');
      this.userService.getUserProfile(userEmail)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            if (response.success && response.profile) {
              const profile = response.profile;

              // Map the UserProfile object to the User[] array structure for display consistency
              const user: User = {
                UserId: profile.userId,
                UserName: profile.userName,
                UserEmail: profile.userEmail,
                RoleName: profile.roles?.[0] || 'User', // Display the first role
                IsActive: true, // A logged-in user is always considered active
                CreatedOn: profile.CreatedOn || profile.created_on || 'N/A',
                CreatedBy: profile.CreatedBy || profile.created_by || 'N/A',
              };
              this.users = [user]; // Create an array with the single user object
              this.updateUsersPagination();
              console.log(`✅ Loaded self-profile for: ${profile.userName}.`);
            } else {
              this.errorMessage = response.error || 'Failed to load your user profile.';
              this.users = [];
            }
            this.isLoading = false;
          },
          error: (err) => {
            console.error('❌ Error fetching user profile:', err);
            this.errorMessage = 'A server error occurred while fetching your profile.';
            this.isLoading = false;
            this.users = [];
          }
        });
    }
  }

  private loadRoles(): void {
    this.userService.getRoles().subscribe({
      next: (response) => {
        if (response.success) {
          this.roles = response.roles;
          console.log('✅ Loaded ALL roles (flexible mode):', this.roles);
        } else {
          console.error('❌ Failed to load roles:', response.error);
        }
      },
      error: (error) => {
        console.error('❌ Error loading roles:', error);
      }
    });
  }

  private loadFeatures(): void {
    this.userService.getFeatures().subscribe({
      next: (response) => {
        if (response.success) {
          this.features = response.features.filter(f => f.IsActive);
          console.log('✅ Loaded features:', this.features);
        } else {
          console.error('❌ Failed to load features:', response.error);
        }
      },
      error: (error) => {
        console.error('❌ Error loading features:', error);
      }
    });
  }

  private loadTenantRoles(): void {
    if (!this.selectedTenant?.tenant_id || this.appId === null) {
      this.errorMessage = 'Tenant ID or App ID not found.';
      this.isLoading = false;
      return;
    }
    this.userService.getRolesByTenantAndApp(this.selectedTenant.tenant_id, this.appId.toString()).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        this.tenantRoles = response.success ? response.roles : [];
        this.updateRolesPagination();
        this.errorMessage = response.success ? '' : (response.error || 'Failed to load roles.');
        this.isLoading = false;
      },
      error: (err) => {
        this.errorMessage = 'An error occurred while fetching roles.';
        this.tenantRoles = [];
        this.isLoading = false;
      }
    });
  }

  private getAppIdFromSession(): number | null {
    try {
      const appId = sessionStorage.getItem('appId');
      return appId ? parseInt(appId, 10) : null;  // convert string to number
    } catch {
      return null;
    }
  }



  handleUsersClick(): void {
    if (this.isSuperAdminMode) {
      this.showTenantSelectionForUsers = true;
      if (!this.allTenants || this.allTenants.length === 0) {
        this.loadAllTenants();
      }
    } else {
      this.selectSection('users');
    }
  }


  onTenantSelectedForUserManagement(tenant: TenantInfo): void {
    console.log(`[Action] Super Admin selected tenant: '${tenant.tenant_name}'`);
    this.selectedTenant = tenant;
    this.activeSection = 'users';
    this.showTenantSelectionForUsers = false;
    this.isLoading = true;
    this.users = [];
    this.errorMessage = '';
    this.chatService.getApplicationsForTenant(tenant.tenant_id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.applications && response.applications.length > 0) {
            const primaryApp = response.applications[0];
            this.selectedAppNameForHeader = primaryApp.application_name;

            sessionStorage.setItem('appId', primaryApp.app_id.toString());
            sessionStorage.setItem('appName', primaryApp.application_name);
            sessionStorage.setItem('selectedTenantId', tenant.tenant_id);
            sessionStorage.setItem('TenantId', tenant.tenant_id); // Sync this key for consistency
            sessionStorage.setItem('selectedTenantName', tenant.tenant_name);

            console.log(`✅ Session context updated successfully for '${tenant.tenant_name}'.`);
            this.loadUsers();

          } else {
            this.errorMessage = `Cannot manage users. No applications are configured for the tenant "${tenant.tenant_name}". Please assign an application to this tenant first.`;
            this.isLoading = false; // Stop the loading spinner to show the error.
            console.warn(this.errorMessage);

            sessionStorage.setItem('selectedTenantId', tenant.tenant_id);
            sessionStorage.setItem('TenantId', tenant.tenant_id);
            sessionStorage.setItem('selectedTenantName', tenant.tenant_name);

            this.selectedAppNameForHeader = null;
            sessionStorage.removeItem('appId');
            sessionStorage.removeItem('appName');
            // =========================================================
          }
        },
        error: (err) => {
          // FAILURE: A server error occurred.
          this.errorMessage = `A server error occurred while retrieving settings for "${tenant.tenant_name}".`;
          this.isLoading = false;
          this.selectedAppNameForHeader = null;
          console.error('Error fetching applications for tenant:', err);
        }
      });
  }


  closeTenantSelectionForUsersModal(): void {
    this.showTenantSelectionForUsers = false;
  }

  selectSection(section: string): void {
    if (this.isLoading) return;

    if (this.isSuperAdminMode && section === 'tenants') {
      this.selectedTenant = null;
      this.selectedAppNameForHeader = null;

    }

    this.activeSection = section;
    sessionStorage.setItem('tenants_activeSection', section);
    this.errorMessage = '';

    this.isLoading = true;

    this.admins = [];
    this.users = [];
    this.tenantRoles = [];
    this.tenantFeatures = [];
    this.userCredits = [];
    this.allApplications = [];
    this.allDataSources = [];

    if (section === 'admins') {
      this.loadTenantAdmins();
    } else if (section === 'users') {
      this.loadUsers();
    } else if (section === 'roles') {
      this.loadTenantRoles();
    } else if (section === 'features') {
      this.loadTenantFeatures();
    } else if (section === 'applications') {
      this.loadAllApplications();
    }
    else if (section === 'dataSources') {
      this.loadAllDataSources();
    }
    else if (section === 'tenants') {
      this.loadAllTenants();
    }
    else if (section === 'costing') {
      this.loadUserCredits();
    } else if (section === 'appSettings') {
      this.isLoading = false;
      this.errorMessage = 'App Settings section is not yet implemented.';
    }
  }


  manageTenant(tenant: TenantInfo): void {
    console.log('Switching to manage tenant:', tenant.tenant_name);
    this.selectedTenant = tenant;
    this.isSuperAdminMode = false; // Exit super admin tenant list view
    this.activeSection = 'users'; // Default to users view for the selected tenant
    this.selectSection('users'); // Reload data for the specific tenant
  }



  private loadTenantFeatures(): void {
    if (!this.selectedTenant?.tenant_id || this.appId === null) {
      this.isLoading = false;
      this.errorMessage = 'Tenant or App information is missing.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    this.userService.getFeaturesByTenant(this.selectedTenant.tenant_id, this.appId).subscribe({
      next: (response) => {
        // ✅ FIX: Map the lowercase "isactive" from JSON to "IsActive" for the HTML template
        if (response.success && response.features) {
          this.tenantFeatures = response.features.map((f: any) => ({
            ...f,
            IsActive: f.isactive // This matches the "isactive": true in your JSON
          }));
        } else {
          this.tenantFeatures = [];
        }

        this.errorMessage = response.success ? '' : (response.error || 'Failed to load tenant features');
        this.isLoading = false;
      }
    });
  }

  private hideError(): void {
    this.showErrorMessage = false;
    this.errorMessage = '';
  }

  // =============================================================================
  // ADMIN OPERATIONS (Existing code remains the same)
  // =============================================================================
  getAdminById(id: string): TenantAdmin | null {
    return this.admins.find(admin => admin.user_id === id) || null;
  }

  editSelectedAdmin(): void {
    const admin = this.getAdminById(this.selectedAdminDetails.userId);
    if (admin) {
      this.closeAdminDetailsModal();
      this.openEditAdminModal(admin);
    }
  }

  resetSelectedAdminPassword(): void {
    const admin = this.getAdminById(this.selectedAdminDetails.userId);
    if (admin) {
      this.resetAdminPassword(admin);
    }
  }

  confirmDeleteSelectedAdmin(): void {
    const admin = this.getAdminById(this.selectedAdminDetails.userId);
    if (admin) {
      this.closeAdminDetailsModal();
      this.openDeleteAdminModal(admin);
    }
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
    this.showRolesTab = tab === 'roles';
  }

  closeOnOverlayClick(event: Event): void {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }

  openCreateAdminModal(): void {
    console.log('👤 Opening create admin modal for tenant:', this.selectedTenant?.tenant_name);
    this.showCreateModal = true;
    this.resetForm();
  }

  openEditAdminModal(admin: TenantAdmin): void {
    console.log('✏️ Opening edit admin modal for:', admin.user_name);
    this.editingAdmin = admin;
    this.showEditModal = true;
    this.populateEditForm(admin);
  }

  openDeleteAdminModal(admin: TenantAdmin): void {
    console.log('🗑️ Opening delete confirmation for:', admin.user_name);
    this.deletingAdmin = admin;
    this.showDeleteModal = true;
  }

  closeCreateModal(event?: Event): void {
    if (event && event.target !== event.currentTarget) return;
    this.showCreateModal = false;
    this.resetForm();
  }

  closeEditModal(event?: Event): void {
    if (event && event.target !== event.currentTarget) return;
    this.showEditModal = false;
    this.editingAdmin = null;
  }

  closeDeleteModal(event?: Event): void {
    if (event && event.target !== event.currentTarget) return;
    this.showDeleteModal = false;
    this.deletingAdmin = null;
  }

  private resetForm(): void {
    const adminRole = this.roles.find(role => role.role_name?.toLowerCase() === 'admin');
    const defaultRoleId = adminRole ? adminRole.role_id : 0;

    if (defaultRoleId === 0) {
      console.warn("Could not find a role named 'Admin' to set as the default.");
    }

    this.newAdmin = {
      user_name: '',
      user_email: '',
      tenant_id: this.selectedTenant?.tenant_id || '',
      role_id: defaultRoleId,
      feature_ids: [],
      created_by: 'system'
    };
  }

  private populateEditForm(admin: TenantAdmin): void {
    this.newAdmin = {
      user_name: admin.user_name,
      user_email: admin.user_email,
      tenant_id: this.selectedTenant?.tenant_id || '',
      role_id: admin.role_id,
      feature_ids: admin.features?.filter(f => f.is_assigned).map(f => f.feature_id) || [],
      created_by: 'system'
    };
  }

  toggleFeature(event: Event, featureId: number): void {
    const checkbox = event.target as HTMLInputElement;
    if (checkbox.checked) {
      if (!this.newAdmin.feature_ids.includes(featureId)) {
        this.newAdmin.feature_ids.push(featureId);
      }
    } else {
      this.newAdmin.feature_ids = this.newAdmin.feature_ids.filter(id => id !== featureId);
    }
    console.log('🎛️ Updated feature selection:', this.newAdmin.feature_ids);
  }

  selectAllFeatures(): void {
    this.newAdmin.feature_ids = this.features.map(f => f.feature_id);
    console.log('✅ Selected all features');
  }

  deselectAllFeatures(): void {
    this.newAdmin.feature_ids = [];
    console.log('❌ Deselected all features');
  }

  isFeatureSelected(featureId: number): boolean {
    return this.newAdmin.feature_ids.includes(featureId);
  }

  createAdmin(): void {
    if (!this.selectedTenant?.tenant_id) {
      this.showError('No tenant selected');
      return;
    }

    if (!this.validateForm()) {
      return;
    }

    this.isSubmitting = true;
    this.newAdmin.role_id = Number(this.newAdmin.role_id);
    this.newAdmin.tenant_id = this.selectedTenant.tenant_id;

    console.log('🚀 Creating admin with flexible role assignment:', this.newAdmin);

    this.userService.createTenantAdmin(this.newAdmin).subscribe({
      next: (response) => {
        console.log('✅ Admin created response:', response);

        if (response.success) {
          this.generatedPassword = response.generated_password || '';
          this.showSuccess(`Administrator "${this.newAdmin.user_name}" created successfully with role: ${this.getRoleName(this.newAdmin.role_id)}!`);
          this.closeCreateModal();
          this.loadTenantAdmins();
        } else {
          this.showError(response.error || 'Failed to create administrator');
        }

        this.isSubmitting = false;
      },
      error: (error) => {
        console.error('❌ Error creating admin:', error);
        this.showError(error.error?.error || 'Failed to create administrator');
        this.isSubmitting = false;
      }
    });
  }

  updateAdmin(): void {
    if (!this.editingAdmin || !this.selectedTenant?.tenant_id) {
      this.showError('Invalid edit operation');
      return;
    }

    if (!this.validateForm()) {
      return;
    }

    this.isSubmitting = true;

    const updateRequest: UpdateTenantAdminRequest = {
      user_id: this.editingAdmin.user_id,
      user_name: this.newAdmin.user_name,
      user_email: this.newAdmin.user_email,
      tenant_id: this.selectedTenant.tenant_id,
      role_id: Number(this.newAdmin.role_id),
      feature_ids: this.newAdmin.feature_ids,
      modified_by: 'system'
    };

    console.log('🔄 Updating admin:', updateRequest);

    this.userService.updateTenantAdmin(updateRequest).subscribe({
      next: (response) => {
        if (response.success) {
          this.showSuccess(`Administrator "${updateRequest.user_name}" updated successfully!`);
          this.closeEditModal();
          this.loadTenantAdmins();
        } else {
          this.showError(response.error || 'Failed to update administrator');
        }
        this.isSubmitting = false;
      },
      error: (error) => {
        console.error('❌ Error updating admin:', error);
        this.showError(error.error?.error || 'Failed to update administrator');
        this.isSubmitting = false;
      }
    });
  }

  deleteAdmin(): void {
    if (!this.deletingAdmin || !this.selectedTenant?.tenant_id) {
      this.showError('Invalid delete operation');
      return;
    }

    this.isSubmitting = true;

    const deleteRequest: DeleteTenantAdminRequest = {
      user_id: this.deletingAdmin.user_id,
      tenant_id: this.selectedTenant.tenant_id,
      modified_by: 'system'
    };

    console.log('🗑️ Deleting admin:', deleteRequest);

    this.userService.deleteTenantAdmin(deleteRequest).subscribe({
      next: (response) => {
        if (response.success) {
          this.showSuccess(`Administrator "${this.deletingAdmin?.user_name}" deleted successfully!`);
          this.closeDeleteModal();
          this.loadTenantAdmins();
        } else {
          this.showError(response.error || 'Failed to delete administrator');
        }
        this.isSubmitting = false;
      },
      error: (error) => {
        console.error('❌ Error deleting admin:', error);
        this.showError(error.error?.error || 'Failed to delete administrator');
        this.isSubmitting = false;
      }
    });
  }

  resetAdminPassword(admin: TenantAdmin): void {
    if (confirm(`Reset password for ${admin.user_name}?`)) {
      this.userService.resetTenantAdminPassword({
        user_email: admin.user_email,
        modified_by: 'system'
      }).subscribe({
        next: (response) => {
          if (response.success) {
            this.generatedPassword = response.generated_password || '';
            this.showSuccess(`Password reset for ${admin.user_name}`);
          } else {
            this.showError(response.error || 'Failed to reset password');
          }
        },
        error: (error) => {
          console.error('❌ Error resetting password:', error);
          this.showError('Failed to reset password');
        }
      });
    }
  }

  // =============================================================================
  // NEW: USER OPERATIONS
  // =============================================================================
  openCreateUserModal(): void {
    this.showCreateUserModal = true;
  }

  closeCreateUserModal(): void {
    this.showCreateUserModal = false;
  }

  onUserCreated(): void {
    this.closeCreateUserModal();
    this.loadUsers();
    this.showToaster('User created successfully!');
  }

  openEditUserModal(user: User): void {
    this.selectedUserForEdit = user;
    this.showEditUserModal = true;
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

  openDeleteUserModal(user: User): void {
    this.userToDelete = user;
    this.showDeleteUserModal = true;
    this.errorMessage = '';
  }

  closeDeleteUserModal(): void {
    this.showDeleteUserModal = false;
    this.userToDelete = null;
  }

  confirmDeleteUser(): void {
    if (!this.userToDelete || !this.selectedTenant?.tenant_id) return;

    this.isDeleting = true;
    this.errorMessage = '';

    const executingUserEmail = sessionStorage.getItem('userEmail');
    if (!executingUserEmail) {
      this.showToaster('Session information is missing. Please log in again.', true);
      this.isDeleting = false;
      return;
    }

    const payload = {
      executing_user_email: executingUserEmail,
      tenant_id: this.selectedTenant.tenant_id,
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
            this.errorMessage = response.error || 'Failed to delete user.';
          }
          this.isDeleting = false;
        },
        error: (err) => {
          this.errorMessage = err.error?.detail || 'A server error occurred.';
          this.isDeleting = false;
        }
      });
  }


  onAddRole(): void {
    this.showCreateRoleModal = true;
  }

  closeCreateRoleModal(): void {
    this.showCreateRoleModal = false;
  }

  onRoleCreated(): void {
    this.closeCreateRoleModal();
    this.loadTenantRoles();
    this.showToaster('Role created successfully!');
  }

  onEditRole(role: any): void {
    console.log('🔄 Opening edit role for:', role);

    if (!this.selectedTenant?.tenant_id) {
      this.showToaster('Tenant ID not found', true);
      return;
    }

    const roleId = role.role_id?.toString() ||
      role.id?.toString() ||
      role.RoleId?.toString() ||
      role.roleId?.toString();

    if (!roleId) {
      this.showToaster('Role ID not found in the role object. Cannot edit.', true);
      console.error('❌ Could not extract a valid ID from the role object:', role);
      this.isLoading = false;
      return;
    }

    this.userService.getRoleWithFeaturesByTenant(this.selectedTenant.tenant_id, roleId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isLoading = false;

          if (response && response.success) {
            console.log('✅ Role details with features:', response);

            const roleDetails = response.role || response;

            let featureIds: number[] = [];

            if (roleDetails.features && Array.isArray(roleDetails.features)) {
              featureIds = roleDetails.features
                .map((feature: any) => {
                  if (typeof feature === 'number') {
                    return feature;
                  } else if (feature && typeof feature === 'object') {
                    return feature.feature_id || feature.id || feature.FeatureId;
                  }
                  return null;
                })
                .filter((id: any) => id !== null && id !== undefined && !isNaN(Number(id)))
                .map((id: any) => Number(id));
            }

            if (featureIds.length === 0 && roleDetails.feature_ids) {
              if (Array.isArray(roleDetails.feature_ids)) {
                featureIds = roleDetails.feature_ids.map((id: any) => Number(id));
              } else if (typeof roleDetails.feature_ids === 'string') {
                featureIds = roleDetails.feature_ids.split(',').map((id: string) => Number(id.trim()));
              }
            }

            console.log('🎯 Extracted feature IDs:', featureIds);

            this.selectedRole = {
              role_id: Number(roleDetails.role_id || role.role_id || role.id),
              role_name: roleDetails.role_name || role.role_name || role.RoleName || role.name,
              features: roleDetails.features || [],
              feature_ids: featureIds,
              is_active: roleDetails.is_active !== undefined ? roleDetails.is_active : true,
              created_on: roleDetails.created_on || role.created_on || role.CreatedOn || ''
            };

            console.log('📤 Prepared role data for edit:', this.selectedRole);

            this.showEditRoleModal = true;
          } else {
            console.warn('⚠️ API returned unsuccessful response or error, using basic role data');
            this.showToaster(response.error || 'Could not fetch role details.', true);
            this.fallbackToBasicRoleData(role);
          }
        },
        error: (err) => {
          this.isLoading = false;
          console.error('❌ Error fetching role details:', err);
          this.showToaster('A critical error occurred while fetching role details.', true);

          this.fallbackToBasicRoleData(role);
        }
      });
  }

  private fallbackToBasicRoleData(role: any): void {
    let featureIds: number[] = [];

    if (role.feature_ids && Array.isArray(role.feature_ids)) {
      featureIds = role.feature_ids.map((id: any) => Number(id));
    } else if (role.features && Array.isArray(role.features)) {
      featureIds = role.features
        .map((f: any) => f.feature_id || f.id || f.FeatureId)
        .filter((id: any) => id !== null && id !== undefined)
        .map((id: any) => Number(id));
    }

    this.selectedRole = {
      role_id: Number(role.role_id || role.id || role.RoleId),
      role_name: role.role_name || role.RoleName || role.name,
      features: role.features || [],
      feature_ids: featureIds,
      is_active: role.is_active !== undefined ? role.is_active : true,
      created_on: role.created_on || role.CreatedOn || ''
    };

    console.log('📄 Using fallback role data:', this.selectedRole);
    this.showEditRoleModal = true;
  }
  closeEditRoleModal(): void {
    this.showEditRoleModal = false;
    this.selectedRole = null;
  }

  onRoleUpdated(): void {
    this.closeEditRoleModal();
    this.loadTenantRoles();
    this.showToaster('Role updated successfully!');
  }

  openDeleteRoleModal(role: any): void {
    this.roleToDelete = role;
    this.showDeleteRoleModal = true;
    this.isDeletingRole = false;
  }

  closeDeleteRoleModal(): void {
    this.showDeleteRoleModal = false;
    this.roleToDelete = null;
    this.isDeletingRole = false;
  }

  confirmDeleteRole(): void {
    if (!this.roleToDelete || !this.selectedTenant?.tenant_id) {
      this.errorMessage = 'Missing tenant information.';
      console.error('Cannot delete role - missing data:', {
        hasRole: !!this.roleToDelete,
        hasTenantId: !!this.selectedTenant?.tenant_id
      });
      return;
    }

    if (this.appId === null) {
      this.errorMessage = 'App ID not found in session. Please log in again.';
      console.error('Cannot delete role - missing appId');
      return;
    }

    this.isDeletingRole = true;
    this.errorMessage = '';

    const roleId = this.roleToDelete.role_id?.toString() ||
      this.roleToDelete.id?.toString() ||
      this.roleToDelete.role_id?.toString();

    if (!roleId) {
      this.errorMessage = 'Role ID not found. Cannot delete role.';
      this.isDeletingRole = false;
      console.error('Role ID extraction failed from:', this.roleToDelete);
      return;
    }

    console.log('Deleting role with params:', {
      roleId,
      tenantId: this.selectedTenant.tenant_id,
      appId: this.appId
    });

    this.userService.deleteRole(roleId, this.selectedTenant.tenant_id, this.appId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          console.log('Delete role response:', response);
          this.isDeletingRole = false;

          if (response.success) {
            this.closeDeleteRoleModal();
            this.loadTenantRoles();
            this.showToaster('Role deleted successfully!');
          } else {
            this.errorMessage = response.error || 'Failed to delete role.';
          }
        },
        error: (err) => {
          console.error('Error deleting role:', err);
          this.isDeletingRole = false;
          this.errorMessage = err.error?.error || err.error?.message || err.message || 'An error occurred while deleting the role.';
        }
      });
  }


  private validateForm(): boolean {
    if (!this.newAdmin.user_name?.trim()) {
      this.showError('User name is required');
      return false;
    }

    if (!this.newAdmin.user_email?.trim()) {
      this.showError('Email is required');
      return false;
    }

    if (!this.newAdmin.role_id) {
      this.showError('Role selection is required');
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.newAdmin.user_email)) {
      this.showError('Invalid email format');
      return false;
    }

    return true;
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  }

  getRoleName(roleId: number): string {
    const role = this.roles.find(r => r.role_id === roleId);
    return role?.role_name || 'Unknown Role';
  }

  getFeatureName(featureId: number): string {
    const feature = this.features.find(f => f.feature_id === featureId);
    return feature?.feature_name || 'Unknown Feature';
  }

  getRoleBadgeClass(roleId: number): string {
    switch (roleId) {
      case 1: return 'role-superadmin';
      case 2: return 'role-system-admin';
      case 3: return 'role-admin';
      default: return 'role-standard';
    }
  }

  isSystemRole(roleId: number): boolean {
    return this.userService.isSystemRole(roleId);
  }

  canAssignRole(roleId: number): boolean {
    return this.userService.canAssignRole(this.currentUserRole, roleId);
  }

  toggleBulkMode(): void {
    this.bulkOperationMode = !this.bulkOperationMode;
    if (!this.bulkOperationMode) {
      this.selectedAdminIds = [];
    }
  }

  toggleAdminSelection(adminId: string): void {
    const index = this.selectedAdminIds.indexOf(adminId);
    if (index > -1) {
      this.selectedAdminIds.splice(index, 1);
    } else {
      this.selectedAdminIds.push(adminId);
    }
  }

  isAdminSelected(adminId: string): boolean {
    return this.selectedAdminIds.includes(adminId);
  }

  private showSuccess(message: string): void {
    this.successMessage = message;
    this.showSuccessMessage = true;
    this.hideMessages();
  }

  private showError(message: string): void {
    this.errorMessage = message;
    this.showErrorMessage = true;
    this.hideMessages();
  }

  private hideMessages(): void {
    setTimeout(() => {
      this.showSuccessMessage = false;
      this.showErrorMessage = false;
      this.generatedPassword = '';
    }, 5000);
  }

  private showToaster(message: string, isError: boolean = false): void {
    this.toastMessage = message;
    this.isErrorToast = isError;
    this.showToast = true;

    setTimeout(() => {
      this.showToast = false;
    }, 4000);
  }

  onTenantAdminClick(admin: TenantAdmin): void {
    console.log('👤 Admin clicked:', admin.user_name);
    this.loadTenantAdminDetails(admin);
  }

  getStatusText(isActive: boolean): string {
    return isActive ? 'Active' : 'Inactive';
  }

  formatDate(dateString: string | null): string {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  }

  getAssignedFeatureCount(admin: TenantAdmin): number {
    return admin.features?.filter(f => f.is_assigned).length || 0;
  }

  loadTenantAdminDetails(admin: TenantAdmin): void {
    if (!this.selectedTenant?.tenant_id) return;

    this.isLoadingAdminDetails = true;
    this.showAdminDetailsModal = true;
    this.selectedAdminDetails = null;

    this.userService.getTenantAdminDetails(this.selectedTenant.tenant_id, admin.user_id).subscribe({
      next: (response: AdminDetailsResponse) => {
        if (response.success) {
          this.selectedAdminDetails = {
            tenantName: this.selectedTenant?.tenant_name,
            userId: response.admin_details.user_id,
            userName: response.admin_details.user_name,
            userEmail: response.admin_details.user_email,
            roleId: response.admin_details.role_id,
            roleName: response.admin_details.role_name,
            isActive: response.admin_details.is_active,
            createdOn: response.admin_details.created_on,
            createdBy: response.admin_details.created_by,
            modifiedOn: response.admin_details.modified_on,
            modifiedBy: response.admin_details.modified_by,
            features: response.admin_details.features
          };
        } else {
          this.showError(response.error || 'Failed to load admin details');
          this.showAdminDetailsModal = false;
        }
        this.isLoadingAdminDetails = false;
      },
      error: (error) => {
        console.error('❌ Error loading admin details:', error);
        this.showError('Failed to load admin details');
        this.isLoadingAdminDetails = false;
        this.showAdminDetailsModal = false;
      }
    });
  }

  closeAdminDetailsModal(event?: Event): void {
    if (event && event.target !== event.currentTarget) return;
    this.showAdminDetailsModal = false;
    this.selectedAdminDetails = null;
  }

  private loadUserCredits(): void {
    const executingUserEmail = sessionStorage.getItem('userEmail');
    if (!executingUserEmail) {
      this.errorMessage = 'Your user session is invalid. Please log in again.';
      this.isLoading = false;
      return;
    }
    this.isLoading = true;
    this.errorMessage = '';
    this.userService.getUserCredits(
      executingUserEmail,
      this.costingDateFilter,
      this.costingStartDate,
      this.costingEndDate
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        this.userCredits = response.success ? response.credits : [];
        this.errorMessage = response.success ? '' : (response.error || 'Failed to load credit information.');
        this.isLoading = false;
      },
      error: (err) => {
        this.errorMessage = 'A server error occurred while fetching credit data.';
        this.userCredits = [];
        this.isLoading = false;
      }
    });
  }

  getConsumptionPercentage(credit: UserCreditInfo): number {
    const totalTokens = credit.MonthlyCredits * credit.TokensPerCredit;
    if (totalTokens <= 0) {
      return 0; // Avoid division by zero and handle cases with no allotment
    }
    const percentage = (credit.ConsumedTokens / totalTokens) * 100;
    return Math.min(percentage, 100); // Cap at 100%
  }

  openCreateTenantModal(): void {
    this.showCreateTenantModal = true;
  }
  closeCreateTenantModal(): void {
    this.showCreateTenantModal = false;
  }
  onTenantCreated(): void {
    this.closeCreateTenantModal();
    this.showToaster('Tenant created successfully!');
    this.loadAllTenants();

  }


  openEditTenantModal(tenant: TenantInfo): void {
    this.selectedTenantForEdit = null; // Clear any previous data
    this.showEditTenantModal = true;   // Show the modal immediately (it has its own loading spinner)

    // Call the new service method to get the full details
    this.userService.getTenantById(tenant.tenant_id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            // Once data arrives, assign it. The child component will pick up the change.
            this.selectedTenantForEdit = response.tenant;
          } else {
            this.showToaster(response.error || 'Failed to load tenant details.', true);
            this.closeEditTenantModal(); // Close modal if details can't be fetched
          }
        },
        error: (err) => {
          console.error('Error fetching tenant details:', err);
          this.showToaster('A server error occurred while loading tenant data.', true);
          this.closeEditTenantModal();
        }
      });
  }

  closeEditTenantModal(): void {
    this.showEditTenantModal = false;
    this.selectedTenantForEdit = null;
  }



  onTenantUpdated(): void {
    this.showToaster('Tenant updated successfully!');
    this.closeEditTenantModal();
    this.loadAllTenants(); // Refresh the main tenant list
  }



  openDeleteTenantModal(tenant: TenantInfo): void {
    console.log('Opening Delete Tenant modal for:', tenant.tenant_name);
    this.tenantToDelete = tenant;
    this.showDeleteTenantModal = true;
    this.errorMessage = ''; // Clear previous errors
  }
  closeDeleteTenantModal(): void {
    this.showDeleteTenantModal = false;
    this.tenantToDelete = null;
  }

  confirmDeleteTenant(): void {
    if (!this.tenantToDelete) {
      this.showToaster('No tenant selected for deletion.', true);
      return;
    }
    const userEmail = sessionStorage.getItem('userEmail');
    if (!userEmail) {
      this.showToaster('User session not found. Please log in again.', true);
      return;
    }

    this.isDeletingTenant = true;
    this.errorMessage = '';

    const payload: DeleteTenantRequest = {
      tenant_id: this.tenantToDelete.tenant_id,
      requesting_user_email: userEmail
    };

    this.userService.deleteTenant(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.showToaster('Tenant deleted successfully!');
            this.closeDeleteTenantModal();
            this.loadAllTenants(); // Refresh the list
          } else {
            this.errorMessage = response.error || 'An unknown error occurred.';
            this.showToaster(this.errorMessage, true);
          }
          this.isDeletingTenant = false;
        },
        error: (err) => {
          console.error('Error deleting tenant:', err);
          this.errorMessage = err.error?.error || err.error?.message || 'A server error occurred during deletion.';
          this.showToaster(this.errorMessage, true);
          this.isDeletingTenant = false;
        }
      });
  }
  handleRolesClick(): void {
    if (this.isSuperAdminMode) {
      this.showTenantSelectionForRoles = true;
      if (!this.allTenants || this.allTenants.length === 0) {
        this.loadAllTenants();
      }
    } else {
      this.selectSection('roles');
    }
  }

  onTenantSelectedForRoleManagement(tenant: TenantInfo): void {
    console.log(`[Action] Super Admin selected tenant for ROLES: '${tenant.tenant_name}'`);

    this.selectedTenant = tenant;
    this.activeSection = 'roles';
    this.showTenantSelectionForRoles = false;
    this.isLoading = true;
    this.tenantRoles = [];
    this.errorMessage = '';

    this.chatService.getApplicationsForTenant(tenant.tenant_id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.applications && response.applications.length > 0) {
            const primaryApp = response.applications[0];

            // Set the component's internal appId property (THIS IS THE FIX)
            this.appId = primaryApp.app_id;

            // Update session storage for other components
            sessionStorage.setItem('appId', primaryApp.app_id.toString());
            sessionStorage.setItem('appName', primaryApp.application_name);
            sessionStorage.setItem('selectedTenantId', tenant.tenant_id);
            sessionStorage.setItem('TenantId', tenant.tenant_id);
            sessionStorage.setItem('selectedTenantName', tenant.tenant_name);

            console.log(`✅ Session context updated successfully for '${tenant.tenant_name}'.`);

            // Now load the roles with the correct appId
            this.loadTenantRoles();

          } else {
            this.errorMessage = `Cannot manage roles. No applications are configured for the tenant "${tenant.tenant_name}".`;
            this.isLoading = false;
            console.warn(this.errorMessage);

            // Clear session data but keep tenant context
            sessionStorage.setItem('selectedTenantId', tenant.tenant_id);
            sessionStorage.setItem('TenantId', tenant.tenant_id);
            sessionStorage.setItem('selectedTenantName', tenant.tenant_name);
            sessionStorage.removeItem('appId');
            sessionStorage.removeItem('appName');
          }
        },
        error: (err) => {
          this.errorMessage = `A server error occurred while retrieving settings for "${tenant.tenant_name}".`;
          this.isLoading = false;
          console.error('Error fetching applications for tenant:', err);
        }
      });
  }

  closeTenantSelectionForRolesModal(): void {
    this.showTenantSelectionForRoles = false;
  }

  updateTenantsPagination(): void {
    this.tenantsTotalPages = Math.ceil(this.allTenants.length / this.tenantsItemsPerPage);
    if (this.tenantsCurrentPage > this.tenantsTotalPages) {
      this.tenantsCurrentPage = 1;
    }
    const startIndex = (this.tenantsCurrentPage - 1) * this.tenantsItemsPerPage;
    const endIndex = startIndex + this.tenantsItemsPerPage;
    this.tenantsPaginated = this.allTenants.slice(startIndex, endIndex);
  }

  onTenantsItemsPerPageChange(event: Event): void {
    const selectElement = event.target as HTMLSelectElement;
    this.tenantsItemsPerPage = Number(selectElement.value);
    this.tenantsCurrentPage = 1;
    this.updateTenantsPagination();
  }

  previousTenantsPage(): void {
    if (this.tenantsCurrentPage > 1) {
      this.tenantsCurrentPage--;
      this.updateTenantsPagination();
    }
  }

  nextTenantsPage(): void {
    if (this.tenantsCurrentPage < this.tenantsTotalPages) {
      this.tenantsCurrentPage++;
      this.updateTenantsPagination();
    }
  }

  // --- Users Pagination ---
  updateUsersPagination(): void {
    this.usersTotalPages = Math.ceil(this.users.length / this.usersItemsPerPage);
    if (this.usersCurrentPage > this.usersTotalPages) {
      this.usersCurrentPage = 1;
    }
    const startIndex = (this.usersCurrentPage - 1) * this.usersItemsPerPage;
    const endIndex = startIndex + this.usersItemsPerPage;
    this.usersPaginated = this.users.slice(startIndex, endIndex);
  }

  onUsersItemsPerPageChange(event: Event): void {
    const selectElement = event.target as HTMLSelectElement;
    this.usersItemsPerPage = Number(selectElement.value);
    this.usersCurrentPage = 1;
    this.updateUsersPagination();
  }

  previousUsersPage(): void {
    if (this.usersCurrentPage > 1) {
      this.usersCurrentPage--;
      this.updateUsersPagination();
    }
  }

  nextUsersPage(): void {
    if (this.usersCurrentPage < this.usersTotalPages) {
      this.usersCurrentPage++;
      this.updateUsersPagination();
    }
  }

  // --- Roles Pagination ---
  updateRolesPagination(): void {
    this.rolesTotalPages = Math.ceil(this.tenantRoles.length / this.rolesItemsPerPage);
    if (this.rolesCurrentPage > this.rolesTotalPages) {
      this.rolesCurrentPage = 1;
    }
    const startIndex = (this.rolesCurrentPage - 1) * this.rolesItemsPerPage;
    const endIndex = startIndex + this.rolesItemsPerPage;
    this.tenantRolesPaginated = this.tenantRoles.slice(startIndex, endIndex);
  }

  onRolesItemsPerPageChange(event: Event): void {
    const selectElement = event.target as HTMLSelectElement;
    this.rolesItemsPerPage = Number(selectElement.value);
    this.rolesCurrentPage = 1;
    this.updateRolesPagination();
  }

  previousRolesPage(): void {
    if (this.rolesCurrentPage > 1) {
      this.rolesCurrentPage--;
      this.updateRolesPagination();
    }
  }

  nextRolesPage(): void {
    if (this.rolesCurrentPage < this.rolesTotalPages) {
      this.rolesCurrentPage++;
      this.updateRolesPagination();
    }
  }
  onDateFilterChange(event: Event): void {
    const selectElement = event.target as HTMLSelectElement;
    this.costingDateFilter = selectElement.value;
    this.showCustomDateRange = this.costingDateFilter === 'custom';
    if (!this.showCustomDateRange) {
      this.costingStartDate = null;
      this.costingEndDate = null;
    }
  }

  applyDateFilter(): void {
    this.loadUserCredits(); // Reload data with the selected filters
  }


 private loadAllApplications(): void {
    this.isLoading = true;
    
    // Pass an empty string to get ALL applications across ALL tenants
    this.userService.getAllApplicationsWithSettings('') 
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.allApplications = response.applications || [];
            console.log('✅ Master Application list loaded:', this.allApplications);
            this.updateApplicationsPagination();
            
            // If the user already has a tenant selected in the form (like during an Edit),
            // filter the applications immediately.
            if (this.dataSourceForm.tenant_id) {
              this.onTenantSelectionChange(false);
            }
          }
          this.isLoading = false;
        },
        error: (err) => {
          this.isLoading = false;
          console.error('❌ Error loading master applications:', err);
        }
      });
}
  updateApplicationsPagination(): void {
    this.applicationsTotalPages = Math.ceil(this.allApplications.length / this.applicationsItemsPerPage);
    if (this.applicationsCurrentPage > this.applicationsTotalPages) {
      this.applicationsCurrentPage = 1;
    }
    const start = (this.applicationsCurrentPage - 1) * this.applicationsItemsPerPage;
    const end = start + this.applicationsItemsPerPage;
    this.applicationsPaginated = this.allApplications.slice(start, end);
  }

  onApplicationsItemsPerPageChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.applicationsItemsPerPage = Number(select.value);
    this.applicationsCurrentPage = 1;
    this.updateApplicationsPagination();
  }

  previousApplicationsPage(): void {
    if (this.applicationsCurrentPage > 1) {
      this.applicationsCurrentPage--;
      this.updateApplicationsPagination();
    }
  }

  nextApplicationsPage(): void {
    if (this.applicationsCurrentPage < this.applicationsTotalPages) {
      this.applicationsCurrentPage++;
      this.updateApplicationsPagination();
    }
  }

  openCreateApplicationModal(): void {
    this.applicationToEdit = null;
    this.showCreateApplicationModal = true;
    this.showEditApplicationModal = false;
  }

  closeCreateApplicationModal(): void {
    this.showCreateApplicationModal = false;
  }

  openEditApplicationModal(app: ApplicationDetailItem): void {
    this.applicationToEdit = { ...app };
    this.showEditApplicationModal = true;
  }

  closeEditApplicationModal(): void {
    this.showEditApplicationModal = false;
    this.applicationToEdit = null;
  }

  openDeleteApplicationModal(app: ApplicationDetailItem): void {
    this.applicationToDelete = app;
    this.showDeleteApplicationModal = true;
  }

  closeDeleteApplicationModal(): void {
    this.showDeleteApplicationModal = false;
    this.applicationToDelete = null;
  }
  onApplicationSaved(): void {
    this.loadAllApplications(); // Refresh list
    this.showToastMessage('Application saved successfully!', false);
  }

  confirmDeleteApplication(): void {
    if (!this.applicationToDelete?.app_id) return;

    this.isDeletingApplication = true;
    this.errorMessage = '';

    this.userService.deleteApplication(this.applicationToDelete.app_id).subscribe({
      next: (res) => {
        // Remove from local array
        this.allApplications = this.allApplications.filter(
          app => app.app_id !== this.applicationToDelete!.app_id
        );
        this.updateApplicationsPagination();

        // Close modal
        this.closeDeleteApplicationModal();

        // Success toast
        this.showToastMessage('Application deleted successfully!', false);

        this.isDeletingApplication = false;
      },
      error: (err) => {
        console.error('Delete failed:', err);
        this.errorMessage = err.error?.message || 'Failed to delete application.';
        this.isDeletingApplication = false;
      }
    });
  }

  showToastMessage(message: string, isError: boolean = false): void {
    this.toastMessage = message;
    this.isErrorToast = isError;
    this.showToast = true;
    setTimeout(() => this.showToast = false, 4000);
  }

  private loadDataSourceTypes(): void {
    this.userService.getDataSourceTypes().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        if (res.success) {
          this.allDataSourceTypes = res.data_types;
        }
      },
      error: (err) => console.error('Error loading data source types', err)
    });
  }
  processDataSource(ds: DataSource): void {
    const userEmail = this.getUserEmailFromSession();
    if (!userEmail) return;

    this.showToastMessage(`Initiating processing for ${ds.data_source_name}...`, false);

    const payload = {
        data_source_id: ds.data_source_id,
        app_id: ds.appId,
        executing_user: userEmail
    };

    // Explicitly add types to 'res' and 'err' here:
    this.userService.runIndexer(payload).subscribe({
        next: (res: any) => { 
            if (res.success) {
                this.showToastMessage('Processing started! Azure Indexer is now running.', false);
            } else {
                this.showToastMessage(res.error || 'Could not start processing.', true);
            }
        },
        error: (err: any) => {
            console.error('Indexer trigger error:', err);
            this.showToastMessage('Failed to trigger Azure Indexer.', true);
        }
    });
}

isDataSourceFormValid(): boolean {
    const f = this.dataSourceForm;
    
    // 1. Basic Core Validation (Must always be filled)
    const isBaseValid = !!(
        f.data_source_name && f.data_source_name.trim() !== '' &&
        !this.isDsNameInvalid() &&
        f.data_source_type && 
        f.tenant_id && 
        f.app_id !== 0 && f.app_id !== null
    );

    if (!isBaseValid) return false;

    // 2. Validation for Automation Mode
    if (this.setupMode === 'new') {
        // Site and Folder are now mandatory for BOTH categories
        const isSharePointConfigValid = !!(this.automationConfig.spo_endpoint && this.automationConfig.folder_path);
        if (!isSharePointConfigValid) return false;

        // If Structured, also ensure column builder is valid
        if (this.newDsType === 'structured') {
            return this.automationConfig.fields.length > 0 && 
                   this.automationConfig.fields.every(field => field.name.trim() !== '');
        }
        
        return true; // Unstructured is valid if SharePoint config is filled
    }

    // 3. Validation for Existing Mode
    return this.dsConfigurations.every(c => c.config_key && c.config_value);
}

isDsNameInvalid(): boolean {
    const name = this.dataSourceForm.data_source_name;
    if (!name) return false;
    
    // Azure Search requirements: lowercase, numbers, and hyphens only. 
    // No spaces, no capitals, no special characters.
    const pattern = /^[a-z0-9-]+$/;
    return !pattern.test(name);
}



}