import { Component, HostBinding, Input } from '@angular/core';
import { forkJoin, map } from 'rxjs';
import { ApplicationDetailItem, AppSettingsItem, GetAllApplicationsResponse, UpdateAppSettingsRequest, UserService } from 'src/app/Services/user.service';

@Component({
  selector: 'app-app-settings',
  templateUrl: './app-settings.component.html',
  styleUrls: ['./app-settings.component.css']
})
export class AppSettingsComponent {
  isLoading = false;
  applications: ApplicationDetailItem[] = [];
  errorMessage = '';
  showErrorMessage = false;
  showSuccessToast = false;
  successMessage = '';

  // State for managing the settings modal (for a future step)
  isSettingsModalOpen = false;
  selectedAppForEditing: ApplicationDetailItem | null = null;
  isModalLoading = false;
  isSubmitting = false;
  modalErrorMessage = '';

  // Catalogs of ALL available options for the modal
  allLanguages: AppSettingsItem[] = [];
  allModels: AppSettingsItem[] = [];
  allDataSources: AppSettingsItem[] = [];

  monthlyCredits: number | null = null;
  tokensPerCredit: number | null = null;
  chatHistoryInDays: number | null = null;
  xScore: number | null = null;

  // Arrays to hold the IDs of the selected items in the modal
  selectedLanguageIds: number[] = [];
  selectedModelIds: number[] = [];
  selectedDataSourceIds: number[] = [];
  currentPage = 1;
  pageSize = 10;
  isLanguagesDropdownOpen = false;
  isModelsDropdownOpen = false;
  isDataSourcesDropdownOpen = false;

  @HostBinding('class.dark-mode')
  @Input() isDarkMode: boolean = false;

  constructor(private userService: UserService) { }

  ngOnInit(): void {
    this.loadAllApplications();
    this.loadAllCatalogs();
  }

 loadAllApplications(): void {
    this.isLoading = true;
    this.showErrorMessage = false;
    
    // Retrieve Tenant ID from Session Storage
    const tenantId = sessionStorage.getItem('TenantId');

    if (!tenantId) {
      this.isLoading = false;
      this.showError('Tenant ID not found. Please log in again.');
      return;
    }

    // Pass tenantId to the service
    this.userService.getAllApplicationsWithSettings(tenantId).subscribe({
      next: (response: GetAllApplicationsResponse) => {
        this.isLoading = false;
        if (response.success) {
          this.applications = response.applications;
          this.currentPage = 1;
        } else {
          this.showError(response.error || 'Failed to load applications.');
        }
      },
      error: (err) => {
        this.isLoading = false;
        this.showError('A server error occurred while fetching applications.');
      }
    });
  }


  loadAllCatalogs(): void {
    forkJoin({
      languages: this.userService.getLanguages().pipe(
        map(res => res.languages.map((item: any) => ({ id: item.language_id, name: item.language_name } as AppSettingsItem)))
      ),
      models: this.userService.getModels().pipe(
        map(res => res.models.map((item: any) => ({ id: item.model_id, name: item.model_name } as AppSettingsItem)))
      ),
      dataSources: this.userService.getDataSources().pipe(
        map(res => res.data_sources.map((item: any) => ({ id: item.data_source_id, name: item.data_source_name } as AppSettingsItem)))
      )
    }).subscribe({
      next: ({ languages, models, dataSources }) => {
        this.allLanguages = languages;
        this.allModels = models;
        // This is the key change: It filters out the item named "All" from the data sources list.
        this.allDataSources = dataSources.filter((source: AppSettingsItem) => source.name.toLowerCase() !== 'all');
        console.log('✅ Catalogs loaded and cached for modal use.');
      },
      error: err => console.error('Failed to load catalogs', err)
    });
}



  openManageSettingsModal(app: ApplicationDetailItem): void {
    this.selectedAppForEditing = app;
    this.isSettingsModalOpen = true;
    this.loadAssignedSettingsForModal();
  }

  loadAssignedSettingsForModal(): void {
    if (!this.selectedAppForEditing) return;

    this.isModalLoading = true;
    this.modalErrorMessage = '';

    // Call the specific App Settings API (e.g., /api/applications/19/settings)
    this.userService.getApplicationSettings(this.selectedAppForEditing.app_id).subscribe({
      next: (res: any) => {
        if (res.success) {
          // 1. Update the "Dropdown Lists" (Available Options) 
          // Instead of using global lists, we use the specific items allowed for this app/tenant
          this.allLanguages = res.languages || [];
          this.allModels = res.models || [];
          // Filter out "All" just in case it's in the data_sources response
          this.allDataSources = (res.data_sources || []).filter(
            (source: any) => source.name.toLowerCase() !== 'all'
          );

          // 2. Update the "Selected Checkmarks"
          // We mark them as selected if they are currently active/assigned
          this.selectedLanguageIds = res.languages.filter((l: any) => l.is_active).map((l: any) => l.id);
          this.selectedModelIds = res.models.filter((m: any) => m.is_active).map((m: any) => m.id);
          this.selectedDataSourceIds = res.data_sources.filter((d: any) => d.is_active).map((d: any) => d.id);

          // 3. Update General Settings
          this.monthlyCredits = res.monthlyCredits ?? 0;
          this.tokensPerCredit = res.tokensPerCredit ?? 0;
          this.chatHistoryInDays = res.chatHistoryInDays ?? 0;
          this.xScore = res.xScore ?? 0.0;
        }
        this.isModalLoading = false;
      },
      error: (err) => {
        this.modalErrorMessage = 'Failed to load specific settings for this application.';
        this.isModalLoading = false;
      }
    });
}

closeManageSettingsModal(): void {
    this.isSettingsModalOpen = false;
    this.selectedAppForEditing = null;
    this.selectedLanguageIds = [];
    this.selectedModelIds = [];
    this.selectedDataSourceIds = [];
    this.modalErrorMessage = '';
    // NEW: Close all dropdowns when modal closes
    this.closeAllDropdowns();

    this.monthlyCredits = null;
    this.tokensPerCredit = null;
    this.chatHistoryInDays = null;
    this.xScore = null;
  }

  isItemSelected(id: number, selectedArray: number[]): boolean {
    return selectedArray.includes(id);
  }

  toggleSelection(id: number, selectedArray: number[]): void {
    const index = selectedArray.indexOf(id);
    if (index > -1) {
      selectedArray.splice(index, 1);
    } else {
      selectedArray.push(id);
    }
  }

  saveSettings(): void {
    if (!this.selectedAppForEditing) return;

    this.isSubmitting = true;
    this.modalErrorMessage = '';

    const payload: UpdateAppSettingsRequest = {
      language_ids: this.selectedLanguageIds,
      model_ids: this.selectedModelIds,
      data_source_ids: this.selectedDataSourceIds,
      modified_by: 'superadmin', // Replace with actual user later

      monthlyCredits: this.monthlyCredits,
      tokensPerCredit: this.tokensPerCredit,
      chatHistoryInDays: this.chatHistoryInDays,
      xScore: this.xScore
    };

    this.userService.updateApplicationSettings(this.selectedAppForEditing.app_id, payload).subscribe({
      next: (response) => {
        this.isSubmitting = false;
        if (response.success) {
          this.showSuccess(`Settings for "${this.selectedAppForEditing?.application_name}" updated successfully!`);
          this.closeManageSettingsModal();
          this.loadAllApplications(); // Refresh the main list
        } else {
          this.modalErrorMessage = response.error || 'An unknown error occurred while saving.';
        }
      },
      error: (err) => {
        this.isSubmitting = false;
        this.modalErrorMessage = 'A server error occurred. Please try again.';
      }
    });
  }


  // --- Utility & Message Handling ---
  private showError(message: string): void {
    this.errorMessage = message;
    this.showErrorMessage = true;
  }

  private showSuccess(message: string): void {
    this.successMessage = message;
    this.showSuccessToast = true;
    setTimeout(() => this.showSuccessToast = false, 5000);
  }
    toggleDropdown(type: 'language' | 'model' | 'dataSource'): void {
    if (type === 'language') {
      this.isLanguagesDropdownOpen = !this.isLanguagesDropdownOpen;
      this.isModelsDropdownOpen = false;
      this.isDataSourcesDropdownOpen = false;
    } else if (type === 'model') {
      this.isModelsDropdownOpen = !this.isModelsDropdownOpen;
      this.isLanguagesDropdownOpen = false;
      this.isDataSourcesDropdownOpen = false;
    } else if (type === 'dataSource') {
      this.isDataSourcesDropdownOpen = !this.isDataSourcesDropdownOpen;
      this.isLanguagesDropdownOpen = false;
      this.isModelsDropdownOpen = false;
    }
  }

  closeAllDropdowns(): void {
    this.isLanguagesDropdownOpen = false;
    this.isModelsDropdownOpen = false;
    this.isDataSourcesDropdownOpen = false;
  }

  getSelectedItemsText(type: 'language' | 'model' | 'dataSource'): string {
    let count = 0;
    if (type === 'language') count = this.selectedLanguageIds.length;
    if (type === 'model') count = this.selectedModelIds.length;
    if (type === 'dataSource') count = this.selectedDataSourceIds.length;

    if (count === 0) {
      // Be specific for better UX
      if (type === 'language') return 'Select languages...';
      if (type === 'model') return 'Select models...';
      if (type === 'dataSource') return 'Select data sources...';
    }
    if (count === 1) {
      return '1 item selected';
    }
    return `${count} items selected`;
  }

  areAllSelected(type: 'language' | 'model' | 'dataSource'): boolean {
    if (type === 'language') {
      return this.allLanguages.length > 0 && this.selectedLanguageIds.length === this.allLanguages.length;
    }
    if (type === 'model') {
      return this.allModels.length > 0 && this.selectedModelIds.length === this.allModels.length;
    }
    if (type === 'dataSource') {
      return this.allDataSources.length > 0 && this.selectedDataSourceIds.length === this.allDataSources.length;
    }
    return false;
  }

  toggleSelectAll(type: 'language' | 'model' | 'dataSource'): void {
    const allSelected = this.areAllSelected(type);

    if (type === 'language') {
      this.selectedLanguageIds = allSelected ? [] : this.allLanguages.map(item => item.id);
    } else if (type === 'model') {
      this.selectedModelIds = allSelected ? [] : this.allModels.map(item => item.id);
    } else if (type === 'dataSource') {
      this.selectedDataSourceIds = allSelected ? [] : this.allDataSources.map(item => item.id);
    }
  }
  get paginatedApplications(): ApplicationDetailItem[] {
  const startIndex = (this.currentPage - 1) * this.pageSize;
  return this.applications.slice(startIndex, startIndex + this.pageSize);
}

get totalPages(): number {
  return Math.ceil(this.applications.length / this.pageSize);
}

setPage(page: number): void {
  if (page >= 1 && page <= this.totalPages) {
    this.currentPage = page;
    // Optional: Scroll table to top
    document.querySelector('.grid-container')?.scrollTo(0, 0);
  }
}
}
