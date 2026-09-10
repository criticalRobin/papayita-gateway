export interface TarifaImpuesto {
  codigoPorcentaje: string;
  descripcion: string;
  porcentaje: number;
}

export interface Impuesto {
  codigo: string;
  nombre: string;
  tarifas: TarifaImpuesto[];
}

export function hasCodigoPorcentaje(
  impuestos: Impuesto[],
  codigoImpuesto: string,
  codigoPorcentaje: string,
): boolean {
  const impuesto = impuestos.find((i) => i.codigo === codigoImpuesto);
  if (!impuesto) return false;
  return impuesto.tarifas.some(
    (tarifa) => tarifa.codigoPorcentaje === codigoPorcentaje,
  );
}
