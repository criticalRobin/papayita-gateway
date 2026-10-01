import { CandidateResolution } from './types';
import { mergeCatalogResults } from './merge-catalog-results';

describe('mergeCatalogResults', () => {
  it('fills the detalle from the auto-selected candidate', () => {
    const items = [
      {
        idCliente: 'item-1',
        textoConsulta: 'play station 5',
        cantidad: 1,
        precioMencionado: null,
      },
    ];
    const candidate = {
      id: 'c1',
      codigoPrincipal: 'CONS-PS5-01',
      codigoAuxiliar: 'SONY-001',
      nombre: 'Consola PlayStation 5',
      descripcion: 'desc',
      unidadMedida: 'Unidad',
      precioUnitario: 499.99,
      impuestoId: null,
      impuestoDescripcion: 'IVA 15%',
      impuestoPorcentaje: 15,
    };
    const resolutions = new Map<string, CandidateResolution>([
      [
        'item-1',
        {
          status: 'auto_selected',
          candidates: [candidate],
          selectedCandidateId: 'c1',
        },
      ],
    ]);

    const [result] = mergeCatalogResults(items, resolutions);

    expect(result.resolutionStatus).toBe('auto_selected');
    expect(result.selectedCandidateId).toBe('c1');
    expect(result.detalle).toEqual({
      codigoPrincipal: 'CONS-PS5-01',
      codigoAuxiliar: 'SONY-001',
      descripcion: 'Consola PlayStation 5',
      unidadMedida: 'Unidad',
      cantidad: 1,
      precioUnitario: 499.99,
      impuestoPorcentaje: 15,
      descuento: 0,
    });
  });

  it('leaves nulls and falls back to textoConsulta for a needs_choice item', () => {
    const items = [
      {
        idCliente: 'item-2',
        textoConsulta: 'funko pop naruto',
        cantidad: 2,
        precioMencionado: null,
      },
    ];
    const candidates = [
      {
        id: 'c1',
        codigoPrincipal: 'A',
        codigoAuxiliar: null,
        nombre: 'Funko A',
        descripcion: null,
        unidadMedida: 'Unidad',
        precioUnitario: 15.99,
        impuestoId: null,
        impuestoDescripcion: 'IVA 15%',
        impuestoPorcentaje: 15,
      },
      {
        id: 'c2',
        codigoPrincipal: 'B',
        codigoAuxiliar: null,
        nombre: 'Funko B',
        descripcion: null,
        unidadMedida: 'Unidad',
        precioUnitario: 21.99,
        impuestoId: null,
        impuestoDescripcion: 'IVA 15%',
        impuestoPorcentaje: 15,
      },
    ];
    const resolutions = new Map<string, CandidateResolution>([
      ['item-2', { status: 'needs_choice', candidates }],
    ]);

    const [result] = mergeCatalogResults(items, resolutions);

    expect(result.resolutionStatus).toBe('needs_choice');
    expect(result.selectedCandidateId).toBeNull();
    expect(result.detalle).toEqual({
      codigoPrincipal: null,
      codigoAuxiliar: null,
      descripcion: 'funko pop naruto',
      unidadMedida: null,
      cantidad: 2,
      precioUnitario: null,
      impuestoPorcentaje: null,
      descuento: 0,
    });
  });

  it('produces the same null-filled shape for an unresolved item', () => {
    const items = [
      {
        idCliente: 'item-3',
        textoConsulta: 'algo raro',
        cantidad: 1,
        precioMencionado: 5,
      },
    ];
    const resolutions = new Map<string, CandidateResolution>();

    const [result] = mergeCatalogResults(items, resolutions);

    expect(result.resolutionStatus).toBe('unresolved');
    expect(result.candidates).toEqual([]);
    expect(result.detalle.precioUnitario).toBeNull();
    expect(result.detalle.impuestoPorcentaje).toBeNull();
  });
});
