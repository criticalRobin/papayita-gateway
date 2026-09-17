import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { EMISOR_CLIENT } from '../emisor/emisor.module';
import type { EmisorClient } from '../emisor/emisor-client.interface';
import { PLAN_GATE_CLIENT } from './plan-gate-client.interface';
import type { PlanGateClient } from './plan-gate-client.interface';
import { evaluateBillingGate } from './domain/evaluate-billing-gate';
import { evaluateFeatureTierGate } from './domain/evaluate-feature-tier-gate';
import { UseCase } from './domain/types';
import { PlanGateBlockedError } from './plan-gate.errors';

@Injectable()
export class PlanGateService {
  constructor(
    private readonly authService: AuthService,
    @Inject(EMISOR_CLIENT) private readonly emisorClient: EmisorClient,
    @Inject(PLAN_GATE_CLIENT) private readonly planGateClient: PlanGateClient,
  ) {}

  // Full SRI-readiness + quota gate. Throws PlanGateBlockedError when
  // blocked (reason PLAN_LIMIT or NOT_READY) — see domain/evaluate-billing-gate.
  async assertBillingAllowed(phoneNumber: string): Promise<void> {
    const preflight = await this.fetchPreflight(phoneNumber);
    const decision = evaluateBillingGate(preflight);
    if (!decision.allowed) {
      throw new PlanGateBlockedError(decision.reason, decision.detalle);
    }
  }

  // Tier-only gate for Credit Notes / Product Management / Purchase
  // Registration — only planInfo.nombre is consulted, readiness/quota fields
  // are ignored (see plan-gate/domain/evaluate-feature-tier-gate.ts).
  async assertFeatureAllowed(
    phoneNumber: string,
    useCase: UseCase,
  ): Promise<void> {
    const preflight = await this.fetchPreflight(phoneNumber);
    const decision = evaluateFeatureTierGate(
      preflight.planInfo.nombre,
      useCase,
    );
    if (!decision.allowed) {
      throw new PlanGateBlockedError(
        decision.reason,
        `Plan actual: ${decision.planName}.`,
      );
    }
  }

  private async fetchPreflight(phoneNumber: string) {
    const token = await this.authService.getValidToken(phoneNumber);
    const emisorId = await this.authService.getEmisorId(phoneNumber);
    if (!token || !emisorId) {
      throw new UnauthorizedException('not authenticated');
    }

    const { ruc, establecimiento, puntoEmision } =
      await this.emisorClient.getProfile(token, emisorId);

    return this.planGateClient.checkPreflight(
      token,
      ruc,
      establecimiento,
      puntoEmision,
    );
  }
}
