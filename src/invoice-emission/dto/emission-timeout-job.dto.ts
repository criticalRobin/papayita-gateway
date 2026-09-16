// Internal-only job payload — never crosses an HTTP boundary (unlike
// CoreApiWebhookDto/InboundMessageJobDto), assembled entirely from values
// the gateway already trusts (emisorId/phoneNumber from AuthService,
// correlationId from randomUUID()), so no class-validator DTO here.
export interface EmissionTimeoutJobDto {
  emisorId: string;
  phoneNumber: string;
  correlationId: string;
  tipoComprobante: string;
}
