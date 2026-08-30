import { CatalogProduct } from '../../catalog/catalog-search.interface';
import { resolveCandidates } from './resolve-candidates';

function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: 'p1',
    codigoPrincipal: 'COD-1',
    codigoAuxiliar: null,
    nombre: 'Producto',
    descripcion: null,
    unidadMedida: 'Unidad',
    precioUnitario: 10,
    impuestoId: null,
    ...overrides,
  };
}

describe('resolveCandidates', () => {
  it('returns unresolved with no candidates for zero results', () => {
    expect(resolveCandidates([])).toEqual({
      status: 'unresolved',
      candidates: [],
    });
  });

  it('returns auto_selected with the single candidate pre-selected', () => {
    const p = product({ id: 'p1' });
    expect(resolveCandidates([p])).toEqual({
      status: 'auto_selected',
      candidates: [p],
      selectedCandidateId: 'p1',
    });
  });

  it('returns needs_choice with none pre-selected for two or more results', () => {
    const p1 = product({ id: 'p1' });
    const p2 = product({ id: 'p2' });
    expect(resolveCandidates([p1, p2])).toEqual({
      status: 'needs_choice',
      candidates: [p1, p2],
    });
  });
});
