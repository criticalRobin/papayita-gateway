import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum InboundMessageType {
  TEXT = 'text',
  AUDIO = 'audio',
  DOCUMENT = 'document',
  UNSUPPORTED = 'unsupported',
}

export class InboundMessageJobDto {
  @IsString()
  phoneNumber: string;

  @IsString()
  whatsappMessageId: string;

  @IsEnum(InboundMessageType)
  type: InboundMessageType;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  mediaId?: string;

  @IsOptional()
  @IsString()
  fileName?: string;
}
