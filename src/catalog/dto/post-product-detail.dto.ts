import { ProductoDetalleRequestItem } from '../catalog-search.interface';

export interface PostProductDetailDto {
  emisorId: string;
  whatsapp: string;
  items: ProductoDetalleRequestItem[];
}
