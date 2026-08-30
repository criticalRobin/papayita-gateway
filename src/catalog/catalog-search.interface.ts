import type { CoreApiUserToken } from '../core-api/core-api-token';

export interface CatalogProduct {
  id: string;
  codigoPrincipal: string;
  codigoAuxiliar: string | null;
  nombre: string;
  descripcion: string | null;
  unidadMedida: string;
  precioUnitario: number;
  impuestoId: string | null;
}

export interface CatalogSearchResultGroup {
  termino: string;
  productos: CatalogProduct[];
}

export interface ProductoDetalleRequestItem {
  productoId: string;
  cantidad: number;
  descuento: number;
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
    whatsapp: string,
    terminos: string[],
  ): Promise<CatalogSearchResultGroup[]>;

  // POST /inventario/productos/detalles — given confirmed productoId+cantidad,
  // returns the full SRI-standard detalle shape INCLUDING computed impuestos
  // (baseImponible/valor). This is the single source of truth at confirm time:
  // an invalid productoId surfaces as a Core API error, so this call also
  // replaces the need for a separate re-validation search.
  getDetalles(
    token: CoreApiUserToken,
    whatsapp: string,
    items: ProductoDetalleRequestItem[],
  ): Promise<ProductoDetalle[]>;
}
