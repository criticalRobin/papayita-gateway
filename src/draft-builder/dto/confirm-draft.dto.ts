import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { FormaPago } from '../domain/types';

export class ConfirmCompradorDto {
  @IsOptional()
  @IsString()
  tipoIdentificacion?: string;

  @IsOptional()
  @IsString()
  identificacion?: string;

  @IsOptional()
  @IsString()
  razonSocial?: string;

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

export class ConfirmDetalleDto {
  @IsString()
  idCliente: string;

  @IsOptional()
  @IsString()
  selectedCandidateId?: string;

  @IsNumber()
  cantidad: number;

  @IsOptional()
  @IsNumber()
  precioUnitarioOverride?: number;

  @IsOptional()
  @IsNumber()
  descuento?: number;
}

export class ConfirmDraftDto {
  @ValidateNested()
  @Type(() => ConfirmCompradorDto)
  comprador: ConfirmCompradorDto;

  @ValidateNested({ each: true })
  @Type(() => ConfirmDetalleDto)
  @ArrayMinSize(1)
  detalles: ConfirmDetalleDto[];

  @IsOptional()
  @IsEnum(FormaPago)
  formaPago?: FormaPago;
}
