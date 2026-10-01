import { CandidateResolution, DraftItem } from './types';

export interface ExtractedItem {
  idCliente: string;
  textoConsulta: string;
  cantidad: number;
}

export function mergeCatalogResults(
  items: ExtractedItem[],
  resolutionByIdCliente: Map<string, CandidateResolution>,
): DraftItem[] {
  return items.map((item) => {
    const resolution = resolutionByIdCliente.get(item.idCliente) ?? {
      status: 'unresolved' as const,
      candidates: [] as const,
    };
    const selected =
      resolution.status === 'auto_selected' ? resolution.candidates[0] : null;

    return {
      idCliente: item.idCliente,
      textoConsulta: item.textoConsulta,
      resolutionStatus: resolution.status,
      candidates: resolution.candidates,
      selectedCandidateId: selected?.id ?? null,
      detalle: {
        codigoPrincipal: selected?.codigoPrincipal ?? null,
        codigoAuxiliar: selected?.codigoAuxiliar ?? null,
        // Falls back to the customer's own words until a candidate is chosen.
        descripcion: selected?.nombre ?? item.textoConsulta,
        unidadMedida: selected?.unidadMedida ?? null,
        cantidad: item.cantidad,
        precioUnitario: selected?.precioUnitario ?? null,
        impuestoPorcentaje: selected?.impuestoPorcentaje ?? null,
        descuento: 0,
      },
    };
  });
}
