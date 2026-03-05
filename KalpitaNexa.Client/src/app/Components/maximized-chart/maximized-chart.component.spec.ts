import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MaximizedChartComponent } from './maximized-chart.component';

describe('MaximizedChartComponent', () => {
  let component: MaximizedChartComponent;
  let fixture: ComponentFixture<MaximizedChartComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [MaximizedChartComponent]
    });
    fixture = TestBed.createComponent(MaximizedChartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
