export interface InventoryCategory {
  id: string;
  emisorId: string;
  categoriaPadreId: string | null;
  nombre: string;
  activo: boolean;
  createdAt: string;
  totalProductos: number;
  totalSubcategorias: number;
}
