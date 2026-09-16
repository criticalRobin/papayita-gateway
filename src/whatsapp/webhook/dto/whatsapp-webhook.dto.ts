import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class WhatsappTextBodyDto {
  @IsString()
  body: string;
}

export class WhatsappAudioMediaDto {
  @IsString()
  id: string;

  // Present on real payloads but unused by our logic — declared so the global
  // forbidNonWhitelisted ValidationPipe (main.ts) doesn't 400 the webhook on them.
  @IsOptional()
  @IsString()
  mime_type?: string;

  @IsOptional()
  @IsString()
  sha256?: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsBoolean()
  voice?: boolean;
}

export class WhatsappDocumentMediaDto {
  @IsString()
  id: string;

  // Present on real payloads but unused by our logic — declared so the global
  // forbidNonWhitelisted ValidationPipe (main.ts) doesn't 400 the webhook on them.
  @IsOptional()
  @IsString()
  mime_type?: string;

  @IsOptional()
  @IsString()
  sha256?: string;

  @IsOptional()
  @IsString()
  filename?: string;

  @IsOptional()
  @IsString()
  caption?: string;
}

// Meta sends many more message types (interactive, button, location, reaction, ...) we don't
// handle yet — only text/audio/document fields are modeled, everything else falls through as
// "unsupported".
export class WhatsappMessageDto {
  @IsString()
  from: string;

  @IsString()
  id: string;

  @IsString()
  type: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => WhatsappTextBodyDto)
  text?: WhatsappTextBodyDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WhatsappAudioMediaDto)
  audio?: WhatsappAudioMediaDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WhatsappDocumentMediaDto)
  document?: WhatsappDocumentMediaDto;

  // Present on real payloads but unused by our logic — declared so the global
  // forbidNonWhitelisted ValidationPipe (main.ts) doesn't 400 the webhook on them.
  @IsOptional()
  @IsString()
  from_user_id?: string;

  @IsOptional()
  @IsString()
  timestamp?: string;
}

export class WhatsappValueDto {
  // Status-only payloads (delivery/read receipts) have no `messages` — that's expected, not an error.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WhatsappMessageDto)
  messages?: WhatsappMessageDto[];

  @IsOptional()
  @IsArray()
  statuses?: unknown[];

  // Present on real payloads but unused by our logic — declared so the global
  // forbidNonWhitelisted ValidationPipe (main.ts) doesn't 400 the webhook on them.
  @IsOptional()
  @IsString()
  messaging_product?: string;

  @IsOptional()
  @IsObject()
  metadata?: object;

  @IsOptional()
  @IsArray()
  contacts?: unknown[];
}

export class WhatsappChangeDto {
  @ValidateNested()
  @Type(() => WhatsappValueDto)
  value: WhatsappValueDto;

  @IsString()
  field: string;
}

export class WhatsappEntryDto {
  @IsString()
  id: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WhatsappChangeDto)
  changes: WhatsappChangeDto[];
}

export class WhatsappWebhookPayloadDto {
  @IsString()
  object: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WhatsappEntryDto)
  entry: WhatsappEntryDto[];
}
