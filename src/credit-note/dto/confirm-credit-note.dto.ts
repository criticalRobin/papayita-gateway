import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ConfirmCreditNoteCompradorDto {
  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsString()
  email?: string;
}

export class ConfirmCreditNoteDto {
  @IsString()
  claveAcceso: string;

  // Positions into the draft's `detalles` array returned by
  // GET /webview/credit-note/:claveAcceso — server rebuilds every money
  // field from a freshly re-fetched XML, never from client-submitted values.
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  selectedIndexes: number[];

  @IsString()
  motivo: string;

  @IsOptional()
  @IsString()
  razonSocial?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConfirmCreditNoteCompradorDto)
  comprador?: ConfirmCreditNoteCompradorDto;
}
