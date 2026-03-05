import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditRoleByTenantComponent } from './edit-role-by-tenant.component';

describe('EditRoleByTenantComponent', () => {
  let component: EditRoleByTenantComponent;
  let fixture: ComponentFixture<EditRoleByTenantComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [EditRoleByTenantComponent]
    });
    fixture = TestBed.createComponent(EditRoleByTenantComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
