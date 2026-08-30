import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { CoreApiHttpService } from './core-api-http.service';

export const CORE_API_CLIENT = 'CORE_API_CLIENT';

@Module({
  imports: [HttpModule],
  providers: [{ provide: CORE_API_CLIENT, useClass: CoreApiHttpService }],
  exports: [CORE_API_CLIENT],
})
export class CoreApiModule {}
