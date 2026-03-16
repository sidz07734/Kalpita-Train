import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ChatbotComponent } from './Components/chatbot/chatbot.component';
import { CreateRoleByTenantComponent } from './Components/create-role-by-tenant/create-role-by-tenant.component';
import { EditRoleByTenantComponent } from './Components/edit-role-by-tenant/edit-role-by-tenant.component';

const routes: Routes = [
  {path:'chat',component:ChatbotComponent},
  {path:'create-role',component:CreateRoleByTenantComponent},
  {path:'edit-role',component:EditRoleByTenantComponent}
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
