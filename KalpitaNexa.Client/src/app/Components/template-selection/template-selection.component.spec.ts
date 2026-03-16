import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TemplateSelectionComponent } from './template-selection.component';

describe('TemplateSelectionComponent', () => {
  let component: TemplateSelectionComponent;
  let fixture: ComponentFixture<TemplateSelectionComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [TemplateSelectionComponent]
    });
    fixture = TestBed.createComponent(TemplateSelectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
