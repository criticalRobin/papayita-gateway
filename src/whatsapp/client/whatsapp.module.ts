import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

export const WHATSAPP_CLIENT = 'WHATSAPP_CLIENT';

@Module({
  imports: [HttpModule],
  providers: [{ provide: WHATSAPP_CLIENT, useClass: WhatsappService }],
  exports: [WHATSAPP_CLIENT],
})
export class WhatsappClientModule {}
