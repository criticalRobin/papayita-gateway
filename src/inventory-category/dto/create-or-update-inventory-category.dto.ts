import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

// emisorId is never accepted from the client — it's derived from the
// webview session, never trusted from the request body.
export class CreateOrUpdateInventoryCategoryDto {
  @IsString()
  @IsOptional()
  categoriaPadreId: string | null;

  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsOptional()
  descripcion: string;
}
