import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsPositive,
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

export class SelectedCreditNoteItemDto {
  // Position into the draft's `detalles` array returned by
  // GET /webview/credit-note/:claveAcceso — not a product id.
  @IsInt()
  index: number;

  // Quantity of that line to credit. Client clamps this to the original
  // invoiced quantity, but that's not a security boundary — the server
  // re-validates cantidad <= detalles[index].cantidad itself, see
  // credit-note.service.ts.
  @IsPositive()
  cantidad: number;
}

export class ConfirmCreditNoteDto {
  @IsString()
  claveAcceso: string;

  // Server rebuilds every money field from a freshly re-fetched XML, never
  // from client-submitted values — see credit-note.service.ts.
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SelectedCreditNoteItemDto)
  selectedItems: SelectedCreditNoteItemDto[];

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
