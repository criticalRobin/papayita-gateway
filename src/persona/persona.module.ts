import { Module } from '@nestjs/common';
import { CoreApiModule } from '../core-api/core-api.module';
import { PersonaService } from './persona.service';

export const PERSONA_LOOKUP_CLIENT = 'PERSONA_LOOKUP_CLIENT';

@Module({
  imports: [CoreApiModule],
  providers: [{ provide: PERSONA_LOOKUP_CLIENT, useClass: PersonaService }],
  exports: [PERSONA_LOOKUP_CLIENT],
})
export class PersonaModule {}
