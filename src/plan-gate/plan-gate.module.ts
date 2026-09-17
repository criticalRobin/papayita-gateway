import { Module } from '@nestjs/common';
import { CoreApiModule } from '../core-api/core-api.module';
import { AuthModule } from '../auth/auth.module';
import { EmisorModule } from '../emisor/emisor.module';
import { PlanGateHttpService } from './plan-gate-http.service';
import { PlanGateService } from './plan-gate.service';
import { PLAN_GATE_CLIENT } from './plan-gate-client.interface';

@Module({
  imports: [CoreApiModule, AuthModule, EmisorModule],
  providers: [
    { provide: PLAN_GATE_CLIENT, useClass: PlanGateHttpService },
    PlanGateService,
  ],
  exports: [PlanGateService],
})
export class PlanGateModule {}
