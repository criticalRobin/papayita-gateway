import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { TipoProducto } from '../domain/inventory-product';

// emisorId is never accepted from the client — it's derived from the
// webview session, never trusted from the request body. One shared DTO for
// both create and PUT-as-full-replace update, matching inventory-category.
export class CreateOrUpdateInventoryProductDto {
  @IsOptional()
  @IsString()
  categoriaId?: string | null;

  @IsEnum(TipoProducto)
  tipo: TipoProducto;

  @IsString()
  @IsNotEmpty()
  codigoPrincipal: string;

  @IsOptional()
  @IsString()
  codigoAuxiliar?: string | null;

  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsOptional()
  @IsString()
  descripcion?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  palabrasParecidas?: string[];

  @IsOptional()
  @IsString()
  unidadMedidaId?: string | null;

  @IsOptional()
  @IsString()
  unidadMedidaTexto?: string | null;

  @IsBoolean()
  manejaInventario: boolean;

  @IsOptional()
  @IsBoolean()
  requiereLote?: boolean;

  @IsOptional()
  @IsNumber()
  precioUnitario?: number;

  @IsOptional()
  @IsNumber()
  costoReferencial?: number;

  @IsBoolean()
  aplicaIva: boolean;

  @IsString()
  @IsNotEmpty()
  codigoPorcentajeIva: string;

  @IsBoolean()
  aplicaIce: boolean;

  @IsOptional()
  @IsString()
  codigoIce?: string | null;

  @IsOptional()
  @IsString()
  impuestoId?: string | null;

  @IsOptional()
  @IsNumber()
  stockMinimo?: number;
}
