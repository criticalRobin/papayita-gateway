import { Module } from '@nestjs/common';
import { CoreApiModule } from '../core-api/core-api.module';
import { AuthModule } from '../auth/auth.module';
import { EmisorModule } from '../emisor/emisor.module';
import { PersonaModule } from '../persona/persona.module';
import { ConversationStateModule } from '../conversation-state/conversation-state.module';
import { WebviewSessionModule } from '../webview-session/webview-session.module';
import { WebviewAuthModule } from '../webview-auth/webview-auth.module';
import { InvoiceEmissionModule } from '../invoice-emission/invoice-emission.module';
import { CreditNoteApiService } from './credit-note-api.service';
import { CreditNoteService } from './credit-note.service';
import { CreditNoteController } from './credit-note.controller';
import { CREDIT_NOTE_CLIENT } from './credit-note-client.interface';

@Module({
  imports: [
    CoreApiModule,
    AuthModule,
    EmisorModule,
    PersonaModule,
    ConversationStateModule,
    WebviewSessionModule,
    WebviewAuthModule,
    InvoiceEmissionModule,
  ],
  controllers: [CreditNoteController],
  providers: [
    { provide: CREDIT_NOTE_CLIENT, useClass: CreditNoteApiService },
    CreditNoteService,
  ],
  exports: [CreditNoteService],
})
export class CreditNoteModule {}
