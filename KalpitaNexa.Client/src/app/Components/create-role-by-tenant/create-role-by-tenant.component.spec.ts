import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateRoleByTenantComponent } from './create-role-by-tenant.component';

describe('CreateRoleByTenantComponent', () => {
  let component: CreateRoleByTenantComponent;
  let fixture: ComponentFixture<CreateRoleByTenantComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [CreateRoleByTenantComponent]
    });
    fixture = TestBed.createComponent(CreateRoleByTenantComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
