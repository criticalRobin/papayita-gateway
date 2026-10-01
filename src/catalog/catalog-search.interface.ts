import type { CoreApiUserToken } from '../core-api/core-api-token';
import { PostBatchCatalogProductDto } from './dto/post-batch-catalog.dto';
import { PostProductDetailDto } from './dto/post-product-detail.dto';

export interface CatalogProduct {
  id: string;
  codigoPrincipal: string;
  codigoAuxiliar: string | null;
  nombre: string;
  descripcion: string | null;
  unidadMedida: string;
  precioUnitario: number;
  impuestoId: string | null;
  // Display-only (webview shows price with IVA). Final invoice impuestos
  // still come from getDetalles at confirm time, never from these.
  impuestoDescripcion: string | null;
  impuestoPorcentaje: number | null;
}

export interface CatalogSearchResultGroup {
  termino: string;
  productos: CatalogProduct[];
}

export interface ProductoDetalleRequestItem {
  productoId: string;
  cantidad: number;
  descuento?: number;
  precioModificado?: number;
}

export interface ImpuestoDetalle {
  codigo: string;
  codigoPorcentaje: string;
  tarifa: number;
  baseImponible: number;
  valor: number;
}

export interface ProductoDetalle {
  codigoPrincipal: string;
  codigoAuxiliar: string | null;
  descripcion: string;
  unidadMedida: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  impuestos: ImpuestoDetalle[];
}

export interface CatalogSearchClient {
  // Real Core API contract is batched: one call carries every item's search
  // term for a billing attempt (POST /inventario/productos/buscar, keyed by
  // whatsapp number, not emisorId). See project-info.md's stale draft for
  // the superseded unbatched/emisorId-keyed shape — don't build against that.
  searchBatch(
    token: CoreApiUserToken,
    body: PostBatchCatalogProductDto,
  ): Promise<CatalogSearchResultGroup[]>;

  // POST /inventario/productos/detalles — given confirmed productoId+cantidad,
  // returns the full SRI-standard detalle shape INCLUDING computed impuestos
  // (baseImponible/valor). This is the single source of truth at confirm time:
  // an invalid productoId surfaces as a Core API error, so this call also
  // replaces the need for a separate re-validation search.
  getDetalles(
    token: CoreApiUserToken,
    body: PostProductDetailDto,
  ): Promise<ProductoDetalle[]>;
}
