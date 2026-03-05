import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PredefinedDashboardComponent } from './predefined-dashboard.component';

describe('PredefinedDashboardComponent', () => {
  let component: PredefinedDashboardComponent;
  let fixture: ComponentFixture<PredefinedDashboardComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [PredefinedDashboardComponent]
    });
    fixture = TestBed.createComponent(PredefinedDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
