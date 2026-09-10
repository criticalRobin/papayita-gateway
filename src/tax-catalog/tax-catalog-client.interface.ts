import { CoreApiUserToken } from '../core-api/core-api-token';
import { Impuesto } from './domain/tax';

export interface TaxCatalogClient {
  findAll(token: CoreApiUserToken): Promise<Impuesto[]>;
}
