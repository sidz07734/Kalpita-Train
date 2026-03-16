import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
// import { CreateTenantPayload } from '../Components/create-tenant/create-tenant.component';
import { LanguageItem, ModelItem } from './chat.service';

export interface DataSource {
  data_source_id: number;      // WAS: dataSourceId
  data_source_name: string;    // WAS: dataSourceName
  data_source_type: string;    // WAS: dataSourceType

  // These are for the more detailed view, but it's okay to have them here as optional
  isActive?: boolean;
  appId?: number;
  applicationName?: string;
  tenantName?: string;
  tenant_id?: string;
}

export interface DataSourceConfigItem {
  configuration_name: string;
  config_key: string;
  config_value: string;
  category: string;
}

// Defines the payload for creating or updating a data source.
export interface UpsertDataSourceRequest {
  tenant_id: string;
  app_id: number;
  data_source_id: number; // Use 0 to create a new one
  data_source_name: string;
  data_source_type: string;
  is_active: boolean;
  executing_user: string;
  configurations: DataSourceConfigItem[];
}

export interface UserTenantResponse {
  UserEmail: string;
  UserId: string;
  TenantName: string;
  TenantId: string;
  IsSuperAdmin: number;
}

// Add this NEW response interface
export interface UserTenantsResponse {
  success: boolean;
  total_tenants: number;
  tenants: UserTenantResponse[];
  error: string | null;
}
// Describes a single user object in the list
export interface User {
  UserId: string;
  UserName: string;
  UserEmail: string;
  RoleName: string;
  IsActive: boolean;
  CreatedOn: string | null;
  CreatedBy: string | null;
  created_on?: string;
  created_by?: string;
  ModifiedOn?: string;
  ModifiedBy?: string;
}

// +++ ADD THESE NEW INTERFACES AT THE END OF THE INTERFACE DEFINITIONS +++


// +++ ADD THESE NEW INTERFACES +++
export interface UserDefaults {
  default_app_id: number | null;
  default_app_name: string | null;
  default_language_id: number | null;
  default_language_name: string | null;
  default_model_id: number | null;
  default_model_name: string | null;
}

export interface GetUserDefaultsResponse {
  success: boolean;
  defaults: UserDefaults | null;
  error?: string | null;
}

export interface CreateUserResponse {
  success: boolean;
  message: string;
  UserId: string;
  error?: string;
}
// Describes the entire response from the GET /api/users/tenant/{tenant_id} endpoint
export interface GetUsersResponse {
  success: boolean;
  users: User[];
  error?: string;
}

// Role Model
export interface Role {
  role_id: number;
  id?: number; // Alternative ID field name
  RoleName?: string;
  role_name?: string;
  description?: string;
  is_system_role?: boolean;
  Features?: string[]; // Adjust this type to match API response
  features?: string[];
  IsActive?: boolean;
  is_active?: boolean;
  CreatedOn?: string;
  created_on?: string;
}

// API response for roles
export interface GetRolesResponse {
  success: boolean;
  roles: Role[];
  error?: string;
}

// =============================================================================
// INTERFACES FOR FLEXIBLE TENANT ADMIN MANAGEMENT
// =============================================================================

export interface TenantInfo {
  tenant_id: string;
  tenant_name: string;
  name?: string;
  is_active: boolean;
  created_on?: string;
  created_by?: string;
  CreatedOn?: string;
  CreatedBy?: string;
  modified_on: string | null;
  modified_by: string | null;
  applications?: ApplicationDetailItem[];
  features?: Feature[];
  email_domain?: string;
}

export interface TenantsResponse {
  success: boolean;
  tenants: TenantInfo[];
  error: string | null;
  total_tenants: number;
}

export interface RolesResponse {
  success: boolean;
  roles: Role[];
  error?: string;
}

export interface Feature {
  FeatureId: number;
  FeatureName: string;
  IsActive: boolean;
  CreatedOn: string;
  CreatedBy: string;
  ModifiedOn?: string | null;
  ModifiedBy?: string | null;
}

export interface FeaturesResponse {
  success: boolean;
  features: Feature[];
  error?: string;
}

export interface CreateTenantAdminRequest {
  user_name: string;
  user_email: string;
  tenant_id: string;
  role_id: number;
  feature_ids: number[];
  created_by?: string;
}

export interface UpdateTenantAdminRequest {
  user_id: string;
  user_name: string;
  user_email: string;
  tenant_id: string;
  role_id: number;
  feature_ids: number[];
  modified_by?: string;
}

export interface DeleteTenantAdminRequest {
  user_id: string;
  tenant_id: string;
  modified_by?: string;
}

export interface AdminFeature {
  feature_id: number;
  feature_name: string;
  is_assigned: boolean;
}

export interface TenantAdmin {
  user_id: string;
  user_name: string;
  user_email: string;
  role_id: number;
  role_name?: string;
  features: AdminFeature[];
  is_active: boolean;
  created_on: string;
  created_by: string;
  is_superadmin?: boolean;
}

export interface TenantAdminsResponse {
  success: boolean;
  admins: TenantAdmin[];
  error?: string;
}

export interface TenantAdminActionResponse {
  success: boolean;
  message?: string;
  user_id?: string;
  generated_password?: string;
  assigned_features: number[];
  error?: string;
}

export interface ResetAdminPasswordRequest {
  user_email: string;
  modified_by?: string;
}

export interface AdminDetailsResponse {
  success: boolean;
  admin_details: {
    user_id: string;
    user_name: string;
    user_email: string;
    role_id: number;
    role_name: string;
    is_active: boolean;
    created_on: string;
    created_by: string;
    modified_on: string | null;
    modified_by: string | null;
    features: Array<{
      feature_id: number;
      feature_name: string;
    }>;
  };
  error?: string | null;
}

// Interface for delete role response
export interface DeleteRoleResponse {
  success: boolean;
  message?: string;
  error?: string;
}
export interface UserUpdateRequest {
  executing_user_email: string;
  tenant_id: string;
  user_id_to_update: string;
  new_user_name: string;
  new_user_email: string;
  new_role_name: string;
}
export interface UserDeleteRequest {
  executing_user_email: string;
  tenant_id: string;
  user_id_to_delete: string;
}
export interface UserActionResponse {
  success: boolean;
  message: string;
  error?: string;
}
export interface ApplicationDetailItem {
  app_id: number;
  tenant_id: string;
  tenant_name: string;
  client_id: string;
  application_name: string;
  is_active: boolean;
  created_on?: string;
  created_by?: string;
  CreatedOn?: string;
  CreatedBy?: string;
  modified_on?: string | null;
  modified_by?: string | null;
  assigned_languages: string | null;
  assigned_language_ids: string | null;
  assigned_models: string | null;
  assigned_model_ids: string | null;
  assigned_data_sources: string | null;
  assigned_data_source_ids: string | null;
}

export interface GetAllApplicationsResponse {
  success: boolean;
  applications: ApplicationDetailItem[];
  total_applications: number;
  error?: string;
}

export interface AppSettingsItem {
  id: number;
  name: string;
  is_default: boolean;
  is_active: boolean;
}

export interface GetAppSettingsResponse {
  success: boolean;
  languages: AppSettingsItem[];
  models: AppSettingsItem[];
  data_sources: AppSettingsItem[];
  error?: string;

  monthlyCredits?: number;
  tokensPerCredit?: number;
  chatHistoryInDays?: number;
  xScore?: number;
}

export interface UpdateAppSettingsRequest {
  language_ids: number[];
  model_ids: number[];
  data_source_ids: number[];
  modified_by: string;

  monthlyCredits?: number | null;
  tokensPerCredit?: number | null;
  chatHistoryInDays?: number | null;
  xScore?: number | null;
}

export interface UpdateAppSettingsResponse {
  success: boolean;
  message: string;
  error?: string;
}

export interface UpdateRoleWithFeaturesRequest {
  role_id: number;
  role_name: string;
  app_id: number;
  modified_by: string;
  tenant_id: string;
  feature_ids: string; // Comma-separated string
}



export interface CreateUserPayload {
  executing_user_email: string;
  tenant_id: string;
  new_user_name: string;
  new_user_email: string;
  app_name: string;
  role_names: string[];
}

export interface UserUpdateAssignmentsRequest {
  executing_user_email: string;
  tenant_id: string;
  user_id_to_update: string;
  new_user_name: string;
  new_user_email: string;
  // app_name: string;
  // role_names: string[];
  // language_name: string | null; // Changed from language_names: string[]
  // model_name: string | null;    // Changed from model_names: string[]
  app_id: number;              // Changed from app_name: string
  role_names: string[];
  language_id: number | null;  // Changed from language_name: string | null
  model_id: number | null;
}

// NEW: Interfaces for the data catalogs
export interface Language {
  language_id: number;
  language_name: string;
}

export interface Model {
  model_id: number;
  model_name: string;
}

export interface GetLanguagesResponse {
  success: boolean;
  languages: Language[];
  error?: string;
}

export interface GetModelsResponse {
  success: boolean;
  models: Model[];
  error?: string;
}
export interface UserProfileLanguage {
  language_id: number;
  language_name: string;
}

export interface UserProfileModel {
  model_id: number;
  model_name: string;
}

export interface UserProfile {
  userId: string;
  userName: string;
  userEmail: string;
  isSuperAdmin: boolean;
  roles: string[];
  languages: UserProfileLanguage[];
  models: UserProfileModel[];
  CreatedOn?: string;
  CreatedBy?: string;
  created_on?: string;
  created_by?: string;
}

export interface GetUserProfileResponse {
  success: boolean;
  profile?: UserProfile;
  error?: string;
}

export interface UserCreditInfo {
  UserId: string;
  UserName: string;
  UserEmail: string;
  MonthlyCredits: number;         // <<< ADDED
  RemainingCredits: number;
  TokensPerCredit: number;
  ConsumedInputTokens: number;
  ConsumedOutputTokens: number;
  ConsumedTokens: number;
  AvailableTokens: number;
  TenantName: string;
  AppId: number;
}

export interface GetUserCreditsResponse {
  success: boolean;
  credits: UserCreditInfo[];
  error?: string;
}


export interface TenantWithApplications {
  TenantId: string;
  TenantName: string;
  IsActive: boolean;
  CreatedOn: string;
  CreatedBy: string;
  Applications: string;
}

export interface GetTenantsWithApplicationsResponse {
  success: boolean;
  tenants: TenantWithApplications[];
  error?: string;
}
export interface Application {
  app_id: number;
  application_name: string;
  // include other properties from your backend model if needed
}
export interface Feature {
  feature_id: number;
  feature_name: string;
  created_on: string;
  created_by: string;
  is_active?: boolean;
  modified_on?: string | null;
  modified_by?: string | null;
  // include other properties from your backend model if needed
}

export interface GetAllApplicationsResponse {
  success: boolean;
  applications: ApplicationDetailItem[];
  total_applications: number;
  error?: string;
}


export interface GetFeaturesResponse {
  success: boolean;
  features: Feature[];
  error?: string;
}

export interface TenantActionResponse {
  success: boolean;
  message: string;
  tenant_id?: string;
  error?: string;
}
export interface UpdateTenantRequest {
  tenant_id: string;
  tenant_name: string;
  application_names: string[];
  feature_names: string[];
  requesting_user_email: string;
}

export interface GetTenantResponse {
  success: boolean;
  tenant: TenantInfo;
  error?: string;
}
export interface DeleteTenantRequest {
  tenant_id: string;
  requesting_user_email: string;
}

// +++ ADD THESE NEW INTERFACES +++

export interface UserLanguage {

  LanguageID: number;

  LanguageName: string;

}



export interface UserModel {

  ModelID: number;

  ModelName: string;

}



export interface UserPreferences {

  AppID: number | null;

  LanguageID: number | null; // Corrected to match backend JSON

  ModelID: number | null;    // Corrected to match backend JSON

}


export interface PermissionApplication {
  app_id: number;
  application_name: string;
  data_sources: PermissionDataSource[];
}

export interface PermissionLanguage {
  LanguageID: number;
  LanguageName: string;
  IsDefault: boolean;
}

export interface PermissionModel {
  ModelID: number;
  ModelName: string;
  IsDefault: boolean;
}

export interface PermissionDataSource {
  data_source_id: number;
  data_source_name: string;
  is_default: boolean;
}


export interface UserPermissions {
  applications: PermissionApplication[];
  features: string[];
  languages: PermissionLanguage[];
  models: PermissionModel[];
  data_sources?: any[];
}




export interface GetUserPermissionsResponse {

  success: boolean;

  permissions: UserPermissions | null;

  preferences: UserPreferences | null;

  error?: string;

}



export interface SuccessResponse {

  success: boolean;

  message: string;

  error?: string;

}


export interface LanguageByApp {
  language_id: number;
  language_name: string;
}

export interface GetLanguagesByAppResponse {
  success: boolean;
  languages: LanguageByApp[];
  error?: string;
}

export interface ModelByApp {
  model_id: number;
  model_name: string;
}

export interface GetModelsByAppResponse {
  success: boolean;
  models: ModelByApp[];
  error?: string;
}


export interface CreateTenantPayload {
  tenant_name: string;
  application_ids: number[]; // <<< CHANGE HERE
  feature_names: string[];
  requesting_user_email: string;
}

export interface UpsertTenantRequest {
  tenant_id: string | null; // NULL for create, provide ID for update
  tenant_name: string;
  application_ids: number[];
  feature_ids: number[];
  email_domain: string | null;
  requesting_user_email: string;
}

export interface UpsertRoleRequest {
  role_id: number | null; // NULL for CREATE, provide ID for UPDATE
  role_name: string;
  tenant_id: string;
  app_id: number;
  user_id: string; // Consolidated from created_by/modified_by
  feature_ids: number[];
}

export interface DataSourceType {
  data_type_id: number;
  data_type_name: string;
}

export interface GetDataSourceTypesResponse {
  success: boolean;
  data_types: DataSourceType[];
  error?: string;
}


@Injectable({
  providedIn: 'root'
})
export class UserService {
  // Replace with your actual backend URL
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  private getAuthHeaders(): HttpHeaders {
    // CHANGED: We now use 'access_token' instead of 'userIdToken'
    const token = sessionStorage.getItem('access_token');

    if (!token) {
      console.warn('Authentication token not found in session storage.');
      return new HttpHeaders({ 'Content-Type': 'application/json' });
    }

    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}` // Standard Bearer format
    });
  }

  getUserDefaults(userId: string, TenantId: string): Observable<GetUserDefaultsResponse> {

    const url = `${this.apiUrl}/users/${userId}/defaults/${TenantId}`;

    return this.http.get<GetUserDefaultsResponse>(url, { headers: this.getAuthHeaders() }).pipe(

      catchError(this.handleError<GetUserDefaultsResponse>('getUserDefaults', {

        success: false,

        defaults: null,

        error: 'Failed to fetch user defaults.'

      }))

    );

  }



  getUsersByTenant(tenantId: string, appId: string): Observable<GetUsersResponse> {
    // The new endpoint requires appId as a query parameter
    const url = `${this.apiUrl}/users/tenant/${tenantId}?app_id=${appId}`;
    console.log(`[UserService] Fetching users from: ${url}`);
    return this.http.get<GetUsersResponse>(url, { headers: this.getAuthHeaders() }).pipe(
      catchError(this.handleError<GetUsersResponse>('getUsersByTenant', { success: false, users: [] }))
    );
  }

  getRolesByTenant(tenantId: string): Observable<GetRolesResponse> {
    return this.http.get<GetRolesResponse>(`${this.apiUrl}/roles/tenant/${tenantId}`, { headers: this.getAuthHeaders() });
  }

  getTenants(): Observable<TenantsResponse> {
    return this.http.get<TenantsResponse>(`${this.apiUrl}/tenants`, { headers: this.getAuthHeaders() });
  }

  getTenantAdmins(tenantId: string): Observable<TenantAdminsResponse> {
    return this.http.get<TenantAdminsResponse>(`${this.apiUrl}/tenants/${tenantId}/admins`, { headers: this.getAuthHeaders() });
  }

  /**
   * Create a new tenant admin with flexible role assignment
   */
  createTenantAdmin(request: CreateTenantAdminRequest): Observable<TenantAdminActionResponse> {
    return this.http.post<TenantAdminActionResponse>(`${this.apiUrl}/tenants/admins`, request, { headers: this.getAuthHeaders() });
  }

  /**
   * Update an existing tenant admin
   */
  updateTenantAdmin(request: UpdateTenantAdminRequest): Observable<TenantAdminActionResponse> {
    return this.http.put<TenantAdminActionResponse>(`${this.apiUrl}/tenants/admins`, request, { headers: this.getAuthHeaders() });
  }

  /**
   * Delete a tenant admin
   */
  deleteTenantAdmin(request: DeleteTenantAdminRequest): Observable<TenantAdminActionResponse> {
    return this.http.delete<TenantAdminActionResponse>(`${this.apiUrl}/tenants/admins`, {
      body: request,
      headers: this.getAuthHeaders() // <--- ADDED
    });
  }

  /**
   * Reset tenant admin password
   */
  resetTenantAdminPassword(request: ResetAdminPasswordRequest): Observable<TenantAdminActionResponse> {
    return this.http.post<TenantAdminActionResponse>(`${this.apiUrl}/tenants/admins/reset-password`, request, { headers: this.getAuthHeaders() });
  }

  /**
   * Get ALL available features in the system
   */
  getFeatures(): Observable<FeaturesResponse> {
    return this.http.get<FeaturesResponse>(`${this.apiUrl}/catalog/features`, { headers: this.getAuthHeaders() });
  }

  /**
   * Get ALL available roles in the system (including SuperAdmin)
   */
  getRoles(): Observable<RolesResponse> {
    return this.http.get<RolesResponse>(`${this.apiUrl}/roles/all`, { headers: this.getAuthHeaders() });
  }

  /**
   * Check if a role is a system-level role (like SuperAdmin)
   */
  isSystemRole(roleId: number): boolean {
    // You can define system roles here
    const systemRoles = [1, 2]; // Example: 1 = SuperAdmin, 2 = System Admin
    return systemRoles.includes(roleId);
  }

  /**
   * Check if user has permission to assign a specific role
   */
  canAssignRole(currentUserRole: number, targetRole: number): boolean {
    // SuperAdmins can assign any role
    if (currentUserRole === 1) return true;

    // System Admins can assign most roles except SuperAdmin
    if (currentUserRole === 2 && targetRole !== 1) return true;

    // Regular admins can only assign lower-level roles
    return targetRole > currentUserRole;
  }
  getTenantAdminDetails(tenantId: string, adminId: string): Observable<AdminDetailsResponse> {
    return this.http.get<AdminDetailsResponse>(`${this.apiUrl}/tenants/${tenantId}/admins/${adminId}`, { headers: this.getAuthHeaders() });
  }

  getFeaturesByTenant(tenantId: string, appId: number): Observable<FeaturesResponse> {
    const url = `${this.apiUrl}/tenants/${tenantId}/features?app_id=${appId}`;
    console.log(`[UserService] Fetching features from: ${url}`);
    return this.http.get<FeaturesResponse>(url, { headers: this.getAuthHeaders() }).pipe(
      catchError(this.handleError<FeaturesResponse>('getFeaturesByTenant', { success: false, features: [] }))
    );
  }


  getRolesWithFeaturesByTenant(tenantId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/roles/tenant/${tenantId}`, { headers: this.getAuthHeaders() });
  }


  getRoleWithFeaturesByTenant(tenantId: string, roleId: string): Observable<any> {
    const url = `${this.apiUrl}/roles/tenant/${tenantId}/role/${roleId}`; // Keep this for now, but verify it's correct on your backend.

    console.log(`[UserService] Attempting to fetch role details from: ${url}`);

    return this.http.get<any>(url, { headers: this.getAuthHeaders() }).pipe(
      catchError(this.handleError<any>('getRoleWithFeaturesByTenant', { success: false, error: 'Role details could not be loaded.' }))
    );
  }

  getRoleDetails(roleId: string, tenantId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/roles/${roleId}?tenantId=${tenantId}`, { headers: this.getAuthHeaders() }).pipe(
      catchError(this.handleError<any>('getRoleDetails', { success: false }))
    );
  }


  deleteRoleByTenant(roleId: string, tenantId: string): Observable<DeleteRoleResponse> {
    // Construct the URL as per your API endpoint structure
    const url = `${this.apiUrl}/database/roles/${roleId}?tenant_id=${tenantId}`;

    console.log(`Making DELETE request to: ${url}`);

    return this.http.delete<DeleteRoleResponse>(url, { headers: this.getAuthHeaders() }).pipe(
      catchError((error: HttpErrorResponse) => {
        console.error('Delete role error:', error);

        // Handle different types of errors
        let errorMessage = 'An error occurred while deleting the role.';

        if (error.status === 404) {
          errorMessage = 'Role not found or may have already been deleted.';
        } else if (error.status === 403) {
          errorMessage = 'You do not have permission to delete this role.';
        } else if (error.status === 400) {
          errorMessage = error.error?.message || 'Invalid request. Please check the role ID and tenant ID.';
        } else if (error.status === 500) {
          errorMessage = 'Server error occurred while deleting the role. Please try again later.';
        } else if (error.error?.message) {
          errorMessage = error.error.message;
        }

        return throwError(() => ({
          success: false,
          error: errorMessage,
          status: error.status
        }));
      })
    );
  }

  deleteRole(roleId: string, tenantId: string, appId: number): Observable<DeleteRoleResponse> {
    return this.deleteRoleByTenantAndApp(roleId, tenantId, appId);
  }
  deleteRoleByTenantAndApp(roleId: string, tenantId: string, appId: number): Observable<DeleteRoleResponse> {
    const url = `${this.apiUrl}/roles/${roleId}?tenant_id=${tenantId}&app_id=${appId}`;

    console.log(`Making DELETE request to: ${url}`);

    return this.http.delete<DeleteRoleResponse>(url, { headers: this.getAuthHeaders() }).pipe(
      catchError((error: HttpErrorResponse) => {
        console.error('Delete role error:', error);

        let errorMessage = 'An error occurred while deleting the role.';

        if (error.status === 404) {
          errorMessage = 'Role not found or may have already been deleted.';
        } else if (error.status === 403) {
          errorMessage = 'You do not have permission to delete this role.';
        } else if (error.status === 400) {
          errorMessage = error.error?.message || error.error?.error || 'Invalid request parameters.';
        } else if (error.status === 500) {
          errorMessage = 'Server error occurred. Please try again later.';
        } else if (error.error?.error) {
          errorMessage = error.error.error;
        } else if (error.error?.message) {
          errorMessage = error.error.message;
        }

        return throwError(() => ({
          success: false,
          error: errorMessage,
          status: error.status
        }));
      })
    );
  }

  /**
   * DEPRECATED: Old delete method using request body - keeping for backward compatibility
   */
  deleteRoleWithBody(roleId: string, tenantId: string): Observable<any> {
    const url = `${this.apiUrl}/database/roles/delete`;
    const payload = {
      role_id: parseInt(roleId),
      tenant_id: tenantId,
      modified_by: sessionStorage.getItem('username') || 'system' // You can adjust this based on your session structure
    };

    return this.http.delete(url, { body: payload, headers: this.getAuthHeaders() }).pipe(
      catchError(this.handleError<any>('deleteRoleWithBody', { success: false }))
    );
  }

  /**
   * Update an existing role (legacy method - keeping for compatibility)
   */
  updateRole(roleData: any): Observable<any> {
    const url = `${this.apiUrl}/roles/update`; // Adjust the endpoint as needed
    return this.http.put(url, roleData, { headers: this.getAuthHeaders() }).pipe(
      catchError(this.handleError<any>('updateRole', { success: false }))
    );
  }

  /**
   * Get available features for role assignment (legacy method)
   */
  getAvailableFeatures(): Observable<any> {
    const url = `${this.apiUrl}/features`; // Adjust the endpoint as needed
    return this.http.get(url, { headers: this.getAuthHeaders() }).pipe(
      catchError(this.handleError<any>('getAvailableFeatures', { success: false }))
    );
  }

  createUser(payload: CreateUserPayload): Observable<CreateUserResponse> {
    return this.http.post<CreateUserResponse>(`${this.apiUrl}/users/create`, payload, { headers: this.getAuthHeaders() });
  }

  reactivateUser(payload: CreateUserPayload): Observable<CreateUserResponse> {
    // This calls the new PUT endpoint for reactivation
    return this.http.put<CreateUserResponse>(`${this.apiUrl}/users/reactivate`, payload, { headers: this.getAuthHeaders() });
  }

  updateUser(payload: UserUpdateRequest): Observable<UserActionResponse> {
    return this.http.put<UserActionResponse>(`${this.apiUrl}/users/update`, payload, { headers: this.getAuthHeaders() });
  }

  deleteUser(payload: UserDeleteRequest): Observable<UserActionResponse> {
    // Note: HTTP DELETE with a body requires this special syntax
    return this.http.delete<UserActionResponse>(`${this.apiUrl}/users/delete`, { body: payload, headers: this.getAuthHeaders() });
  }
  getUserPermissions(userEmail: string, appId: number, tenantId: string): Observable<GetUserPermissionsResponse> {
    // Append tenant_id to the query string
    const url = `${this.apiUrl}/users/permissions?user_email=${encodeURIComponent(userEmail)}&app_id=${appId}&tenant_id=${tenantId}`;
    return this.http.get<GetUserPermissionsResponse>(url, { headers: this.getAuthHeaders() }).pipe(
      catchError(this.handleError<GetUserPermissionsResponse>('getUserPermissions', { success: false, permissions: null, preferences: null }))
    );
  }


  /**
   * Handle HTTP errors
   */
  private handleError<T>(operation = 'operation', result?: T) {
    return (error: any): Observable<T> => {
      console.error(`${operation} failed:`, error);

      let errorMessage = 'An error occurred';
      if (error.error instanceof ErrorEvent) {
        errorMessage = error.error.message;
      } else {
        errorMessage = error.error?.detail || error.error?.error || error.message || 'An unknown server error occurred.';
      }

      const errorResult = result as T;
      if (typeof errorResult === 'object' && errorResult !== null) {
        (errorResult as any).error = errorMessage;
      }

      return of(errorResult);
    };
  }
  // You can add other methods here later (updateUser, deleteUser, etc.)

  getAllApplicationsWithSettings(tenantId: string | null | undefined): Observable<GetAllApplicationsResponse> {
    // If tenantId is null, undefined, or the string "None", send an EMPTY string to the backend
    const cleanId = (tenantId && tenantId !== 'None' && tenantId !== 'null') ? tenantId : '';
    
    const url = `${this.apiUrl}/applications/all?tenant_id=${encodeURIComponent(cleanId)}`;
    
    return this.http.get<GetAllApplicationsResponse>(url, { headers: this.getAuthHeaders() }).pipe(
      catchError(this.handleError<GetAllApplicationsResponse>('getAllApplicationsWithSettings', { 
        success: false, 
        applications: [], 
        total_applications: 0 
      }))
    );
}

  getApplicationSettings(appId: number): Observable<GetAppSettingsResponse> {
    return this.http.get<GetAppSettingsResponse>(`${this.apiUrl}/applications/${appId}/settings`, { headers: this.getAuthHeaders() }).pipe(
      catchError(this.handleError<GetAppSettingsResponse>('getApplicationSettings', { success: false, languages: [], models: [], data_sources: [] }))
    );
  }

  /**
   * Updates (replaces) the settings for a specific application.
   */
  updateApplicationSettings(appId: number, payload: UpdateAppSettingsRequest): Observable<UpdateAppSettingsResponse> {
    return this.http.put<UpdateAppSettingsResponse>(`${this.apiUrl}/applications/${appId}/settings`, payload, { headers: this.getAuthHeaders() }).pipe(
      catchError(this.handleError<UpdateAppSettingsResponse>('updateApplicationSettings'))
    );
  }

  // --- Also add/confirm you have these catalog methods ---
  getLanguages(): Observable<any> { return this.http.get<any>(`${this.apiUrl}/catalog/languages`, { headers: this.getAuthHeaders() }); }
  getModels(): Observable<any> { return this.http.get<any>(`${this.apiUrl}/catalog/models`, { headers: this.getAuthHeaders() }); }
  getDataSources(): Observable<any> { return this.http.get<any>(`${this.apiUrl}/catalog/datasources`, { headers: this.getAuthHeaders() }); }
  getTenantsByEmail(userEmail: string): Observable<UserTenantsResponse> {
    const encodedEmail = encodeURIComponent(userEmail);
    return this.http.get<UserTenantsResponse>(
      `${this.apiUrl}/users/tenants?user_email=${encodedEmail}`, { headers: this.getAuthHeaders() }
    ).pipe(
      catchError(this.handleError<UserTenantsResponse>('getTenantsByEmail', { success: false, total_tenants: 0, tenants: [], error: 'Failed' }))
    );
  }


  getFeaturesByTenantAndApp(tenantId: string, appId: number): Observable<FeaturesResponse> {
    // REVERT: The API expects the app_id as a query parameter for this endpoint.
    const url = `${this.apiUrl}/tenants/${tenantId}/features?app_id=${appId}`; // <--- THIS IS THE CORRECT URL
    console.log(`[UserService] Fetching features from: ${url}`);
    return this.http.get<FeaturesResponse>(url, { headers: this.getAuthHeaders() }).pipe(
      catchError(this.handleError<FeaturesResponse>('getFeaturesByTenantAndApp', { success: false, features: [] }))
    );
  }

  getRolesByTenantAndApp(tenantId: string, appId: string): Observable<GetRolesResponse> {
    const url = `${this.apiUrl}/roles/tenant/${tenantId}/app/${appId}`;
    console.log(`[UserService] Fetching roles from: ${url}`);
    return this.http.get<GetRolesResponse>(url, { headers: this.getAuthHeaders() }).pipe(
      catchError(this.handleError<GetRolesResponse>('getRolesByTenantAndApp', { success: false, roles: [] }))
    );
  }
  adminUpdateUser(payload: UserUpdateAssignmentsRequest): Observable<UserActionResponse> {
    const url = `${this.apiUrl}/admin/users/assignments`;
    return this.http.put<UserActionResponse>(url, payload, { headers: this.getAuthHeaders() }).pipe(
      catchError(this.handleError<UserActionResponse>('adminUpdateUser', { success: false, message: '' }))
    );
  }

  getUserProfile(email: string): Observable<GetUserProfileResponse> {
    const url = `${this.apiUrl}/users/profile/me?user_email=${encodeURIComponent(email)}`;
    console.log(`[UserService] Fetching user profile from: ${url}`);
    return this.http.get<GetUserProfileResponse>(url, { headers: this.getAuthHeaders() }).pipe(
      catchError(this.handleError<GetUserProfileResponse>('getUserProfile'))
    );
  }


  getUserCredits(
    executingUserEmail: string,
    dateFilter: string = 'all',
    startDate: string | null = null,
    endDate: string | null = null
  ): Observable<GetUserCreditsResponse> {
    // Start with the base URL and required parameter
    let url = `${this.apiUrl}/users/credits?executing_user_email=${encodeURIComponent(executingUserEmail)}`;

    // Append the date_filter parameter
    url += `&date_filter=${dateFilter}`;

    // Append custom dates only if the filter is 'custom' and dates are provided
    if (dateFilter === 'custom' && startDate && endDate) {
      url += `&start_date=${startDate}`;
      url += `&end_date=${endDate}`;
    }

    console.log(`[UserService] Fetching user credits from: ${url}`);

    return this.http.get<GetUserCreditsResponse>(url, { headers: this.getAuthHeaders() }).pipe(
      catchError(this.handleError<GetUserCreditsResponse>('getUserCredits', { success: false, credits: [] }))
    );
  }

  getTenantsWithApplications(requestingUserEmail: string): Observable<GetTenantsWithApplicationsResponse> {
    const url = `${this.apiUrl}/tenants/with-applications?requesting_user_email=${encodeURIComponent(requestingUserEmail)}`;
    return this.http.get<GetTenantsWithApplicationsResponse>(url, { headers: this.getAuthHeaders() }).pipe(
      catchError(this.handleError<GetTenantsWithApplicationsResponse>('getTenantsWithApplications', { success: false, tenants: [] }))
    );
  }
  getAllApplications(): Observable<GetAllApplicationsResponse> {
    // The endpoint should match what's in your main.py
    return this.http.get<GetAllApplicationsResponse>(`${this.apiUrl}/applications/all`, { headers: this.getAuthHeaders() });
  }

  getTenantById(tenantId: string): Observable<GetTenantResponse> {
    // This assumes you have an endpoint like GET /api/tenants/{id}
    // Adjust the URL if your endpoint is different.
    return this.http.get<GetTenantResponse>(`${this.apiUrl}/tenants/${tenantId}`, { headers: this.getAuthHeaders() });
  }

  deleteTenant(payload: DeleteTenantRequest): Observable<TenantActionResponse> {
    // FIX: Append payload.tenant_id to the URL because the backend route is "/tenants/{tenant_id}"
    const url = `${this.apiUrl}/tenants/${payload.tenant_id}`;

    // Note: HTTP DELETE with a body requires this special options object
    return this.http.delete<TenantActionResponse>(url, {
      body: payload,
      headers: this.getAuthHeaders()
    }).pipe(
      // Optional: Add a default return value to prevent 'undefined' crash on error
      catchError(this.handleError<TenantActionResponse>('deleteTenant', {
        success: false,
        message: 'Delete failed',
        error: 'Server error'
      }))
    );
  }

  getLanguagesByApp(appId: number): Observable<GetLanguagesByAppResponse> {
    const url = `${this.apiUrl}/applications/${appId}/languages`;
    return this.http.get<GetLanguagesByAppResponse>(url, { headers: this.getAuthHeaders() }).pipe(
      catchError(this.handleError<GetLanguagesByAppResponse>('getLanguagesByApp', { success: false, languages: [] }))
    );
  }


  getModelsByApp(appId: number): Observable<GetModelsByAppResponse> {
    const url = `${this.apiUrl}/applications/${appId}/models`;
    return this.http.get<GetModelsByAppResponse>(url, { headers: this.getAuthHeaders() }).pipe(
      catchError(this.handleError<GetModelsByAppResponse>('getModelsByApp', { success: false, models: [] }))
    );
  }

  cleanupChatHistory(userId: string, appId: number): Observable<any> {
    const url = `${this.apiUrl}/users/history/cleanup`;
    const body = { user_id: userId, app_id: appId };
    // This is a "fire-and-forget" call. We don't need a specific response model.
    return this.http.post(url, body, { headers: this.getAuthHeaders() }).pipe(
      catchError(this.handleError<any>('cleanupChatHistory', { success: false, error: 'Failed to initiate cleanup.' }))
    );
  }

  getAllDataSources(): Observable<{ success: boolean, data_sources: DataSource[], error?: string }> {
    const headers = this.getAuthHeaders();
    // This URL is now CORRECT and matches your existing backend API endpoint.
    return this.http.get<{ success: boolean, data_sources: DataSource[], error?: string }>(`${this.apiUrl}/catalog/datasources`, { headers });
  }

  upsertDataSource(payload: UpsertDataSourceRequest): Observable<{ success: boolean, message?: string, error?: string }> {
    const headers = this.getAuthHeaders();
    return this.http.post<{ success: boolean, message?: string, error?: string }>(`${this.apiUrl}/catalog/datasources/upsert`, payload, { headers });
  }

  deleteDataSource(appId: number, dataSourceId: number): Observable<{ success: boolean, message?: string, error?: string }> {
    const headers = this.getAuthHeaders();
    return this.http.delete<{ success: boolean, message?: string, error?: string }>(`${this.apiUrl}/applications/${appId}/datasources/${dataSourceId}`, { headers });
  }

  upsertApplication(payload: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/applications`, payload, { headers: this.getAuthHeaders() });
  }
  deleteApplication(appId: number): Observable<any> {
    const payload = {
      executing_user: 'SuperAdmin'
    };

    return this.http.delete(`${this.apiUrl}/applications/${appId}`, {
      body: payload,                    // This sends the JSON body
      headers: this.getAuthHeaders()
    });
  }

  upsertTenant(payload: UpsertTenantRequest): Observable<TenantActionResponse> {
    const url = `${this.apiUrl}/tenants`;
    return this.http.post<TenantActionResponse>(url, payload, { headers: this.getAuthHeaders() }).pipe(
      catchError(this.handleError<TenantActionResponse>('upsertTenant'))
    );
  }

  upsertRole(payload: UpsertRoleRequest): Observable<any> {
    const url = `${this.apiUrl}/roles/upsert`;
    console.log(`[UserService] Upserting role with payload:`, payload);

    return this.http.post<any>(url, payload, { headers: this.getAuthHeaders() }).pipe(
      // FIX: Add { success: false } so handleError can attach the error message
      catchError(this.handleError<any>('upsertRole', { success: false }))
    );
  }


  getUserPermissionsForIntegratedApp(userRole: string, appId: number, tenantId: string): Observable<GetUserPermissionsResponse> {
    // Construct URL with query parameters
    const url = `${this.apiUrl}/users/permissions/integrated?user_role=${encodeURIComponent(userRole)}&app_id=${appId}&tenant_id=${encodeURIComponent(tenantId)}`;

    console.log(`[UserService] Fetching integrated permissions from: ${url}`);

    return this.http.get<GetUserPermissionsResponse>(url, { headers: this.getAuthHeaders() }).pipe(
      catchError(this.handleError<GetUserPermissionsResponse>('getUserPermissionsForIntegratedApp', { success: false, permissions: null, preferences: null }))
    );
  }

  getDataSourceTypes(): Observable<GetDataSourceTypesResponse> {
    return this.http.get<GetDataSourceTypesResponse>(`${this.apiUrl}/catalog/datasourcetypes`, {
      headers: this.getAuthHeaders()
    });
  }
  automateDataSource(payload: any): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.post(`${this.apiUrl}/catalog/datasources/automate`, payload, { headers });
}

runIndexer(payload: { data_source_id: number, app_id: number | undefined, executing_user: string }): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.post(`${this.apiUrl}/catalog/indexers/run`, payload, { headers }).pipe(
      catchError(this.handleError<any>('runIndexer', { success: false, error: 'Failed to trigger indexer.' }))
    );
}


}