// app.module.ts for the chatbot application
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ToastrModule } from 'ngx-toastr';
import { MsalModule, MsalRedirectComponent, MsalGuard, MsalInterceptor } from '@azure/msal-angular';
import { PublicClientApplication, InteractionType } from '@azure/msal-browser';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { AppComponent } from './app.component';
import { ChatbotComponent } from './Components/chatbot/chatbot.component';
import { ChatService } from './Services/chat.service';
import { ChartComponent } from './Components/chart/chart.component';
import { MaximizedChartComponent } from './Components/maximized-chart/maximized-chart.component';
import { DashboardComponent } from './Components/dashboard/dashboard.component';
import { PredefinedDashboardComponent } from './Components/predefined-dashboard/predefined-dashboard.component';
import { TemplateSelectionComponent } from './Components/template-selection/template-selection.component';
import { ChatHistoryComponent } from './Components/chat-history/chat-history.component';
import { LoginComponent } from './Components/login/login.component';
import { ReactiveFormsModule } from '@angular/forms';
import { AppRoutingModule } from './app-routing.module';
import { AdminPanelComponent } from './Components/admin-panel/admin-panel.component';
import { CreateRoleByTenantComponent } from './Components/create-role-by-tenant/create-role-by-tenant.component';
import { EditRoleByTenantComponent } from './Components/edit-role-by-tenant/edit-role-by-tenant.component';
import { TenantsComponent } from './Components/tenants/tenants.component';
import { CreateUserComponent } from './Components/create-user/create-user.component';
import { EditUserComponent } from './Components/edit-user/edit-user.component';
import { AppSettingsComponent } from './Components/app-settings/app-settings.component';
import { CreateTenantComponent } from './Components/create-tenant/create-tenant.component';
import { EditTenantComponent } from './Components/edit-tenant/edit-tenant.component';
import { CreateApplicationComponent } from './Components/create-application/create-application.component';
import { VideoAnalyticsComponent } from './Components/video-analytics/video-analytics.component';

@NgModule({
  declarations: [
    AppComponent,
    ChatbotComponent,
    ChartComponent,
    MaximizedChartComponent,
    DashboardComponent,
    PredefinedDashboardComponent,
    TemplateSelectionComponent,
    ChatHistoryComponent,
    LoginComponent,
    AdminPanelComponent,
    CreateRoleByTenantComponent,
    EditRoleByTenantComponent,
    TenantsComponent,
    CreateUserComponent,
    EditUserComponent,
    AppSettingsComponent,
    CreateTenantComponent,
    EditTenantComponent
    // CreateApplicationComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    HttpClientModule,
    FormsModule,
    CommonModule,
    ToastrModule.forRoot(),
    AppRoutingModule,
    ReactiveFormsModule,
    CreateApplicationComponent,
    VideoAnalyticsComponent,
     MsalModule.forRoot(new PublicClientApplication(environment.msalConfig),
        {
            interactionType: InteractionType.Redirect, 
            authRequest: {
                scopes: ['user.read']
            }
        },
        {
            interactionType: InteractionType.Redirect, // MSAL Interceptor
            protectedResourceMap: new Map([
                // You can protect your API calls here if needed, but for now we'll handle it manually
            ])
        }
    )
  ],
  providers: [
    ChatService,
    {
        provide: HTTP_INTERCEPTORS,
        useClass: MsalInterceptor,
        multi: true
    },
    MsalGuard
  ],
  bootstrap: [AppComponent,MsalRedirectComponent]
})
export class AppModule { }