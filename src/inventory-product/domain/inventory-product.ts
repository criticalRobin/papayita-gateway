export enum TipoProducto {
  BIEN = 'BIEN',
  SERVICIO = 'SERVICIO',
}

export interface InventoryProduct {
  id: string;
  emisorId: string;
  categoriaId: string | null;
  categoriaNombre: string | null;
  tipo: TipoProducto;
  codigoPrincipal: string;
  codigoAuxiliar: string | null;
  nombre: string;
  descripcion: string | null;
  palabrasParecidas: string[];
  unidadMedidaId: string | null;
  unidadMedidaTexto: string | null;
  manejaInventario: boolean;
  requiereLote: boolean;
  precioUnitario: number | null;
  costoReferencial: number | null;
  aplicaIva: boolean;
  codigoPorcentajeIva: string;
  aplicaIce: boolean;
  codigoIce: string | null;
  impuestoId: string | null;
  stockMinimo: number | null;
  estado: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryProductPage {
  data: InventoryProduct[];
  nextCursor: string | null;
  hasMore: boolean;
}
