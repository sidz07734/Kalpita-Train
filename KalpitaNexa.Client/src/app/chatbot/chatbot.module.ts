import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ChatService } from 'src/app/Services/chat.service';
import { ChatbotComponent } from '../Components/chatbot/chatbot.component';
import { ChartComponent } from '../Components/chart/chart.component'; 


@NgModule({
  declarations: [
    ChatbotComponent,
    ChartComponent
  ],
  imports: [
    CommonModule,
    HttpClientModule,
    FormsModule
  ],
  providers: [
    ChatService
  ],
  exports: [
    ChatbotComponent
  ],
  bootstrap: [ChatbotComponent] // For standalone testing
})
export class ChatbotModule { }