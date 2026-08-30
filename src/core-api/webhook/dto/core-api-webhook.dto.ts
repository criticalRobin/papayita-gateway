import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';

// Comprobante events the gateway currently acts on: comprobante.autorizado (fetch RIDE, send
// PDF) and comprobante.rechazado (tell the customer why). Core API's `eventos` catalog has more
// (comprobante.creado, .enviado, .anulado, .persistencia_fallida, certificado.*) — those are
// accepted here (whitelist tolerant, like the WhatsApp webhook DTO) but ignored by the service.
export class ComprobanteRechazoMensajeDto {
  @IsString()
  identificador: string;

  @IsString()
  mensaje: string;

  @IsOptional()
  @IsString()
  informacionAdicional?: string;

  @IsString()
  tipo: string;
}

export class CoreApiWebhookPayloadDto {
  @IsString()
  emisorId: string;

  @IsOptional()
  @IsString()
  claveAcceso?: string;

  @IsOptional()
  @IsString()
  tipoComprobante?: string;

  @IsOptional()
  @IsString()
  secuencial?: string;

  @IsOptional()
  @IsString()
  fechaAutorizacion?: string;

  @IsOptional()
  @IsString()
  numeroAutorizacion?: string;

  @IsOptional()
  @IsString()
  estado?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComprobanteRechazoMensajeDto)
  mensajes?: ComprobanteRechazoMensajeDto[];
}

export class CoreApiWebhookDto {
  @IsString()
  evento: string;

  @ValidateNested()
  @Type(() => CoreApiWebhookPayloadDto)
  payload: CoreApiWebhookPayloadDto;

  @IsOptional()
  @IsString()
  timestamp?: string;
}
