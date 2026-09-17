import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { WebviewAuthModule } from '../webview-auth/webview-auth.module';
import { WebviewSessionModule } from '../webview-session/webview-session.module';
import { CatalogModule } from '../catalog/catalog.module';
import { PersonaModule } from '../persona/persona.module';
import { EmisorModule } from '../emisor/emisor.module';
import { InvoiceEmissionModule } from '../invoice-emission/invoice-emission.module';
import { ConversationStateModule } from '../conversation-state/conversation-state.module';
import { PlanGateModule } from '../plan-gate/plan-gate.module';
import { DraftBuilderService } from './draft-builder.service';
import { DraftBuilderController } from './draft-builder.controller';
import { AuthExchangeController } from './auth-exchange.controller';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    WebviewAuthModule,
    WebviewSessionModule,
    CatalogModule,
    PersonaModule,
    EmisorModule,
    InvoiceEmissionModule,
    ConversationStateModule,
    PlanGateModule,
  ],
  controllers: [DraftBuilderController, AuthExchangeController],
  providers: [DraftBuilderService],
  exports: [DraftBuilderService],
})
export class DraftBuilderModule {}
