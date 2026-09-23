import { CoreApiUserToken } from '../core-api/core-api-token';
import { InventoryProduct } from './domain/inventory-product';
import { CreateOrUpdateInventoryProductDto } from './dto/create-or-update-inventory-product.dto';

export interface InventoryProductClient {
  findAll(
    token: CoreApiUserToken,
    emisorId: string,
  ): Promise<InventoryProduct[]>;
  create(
    token: CoreApiUserToken,
    emisorId: string,
    data: CreateOrUpdateInventoryProductDto,
  ): Promise<InventoryProduct>;
  update(
    token: CoreApiUserToken,
    emisorId: string,
    productId: string,
    data: CreateOrUpdateInventoryProductDto,
  ): Promise<InventoryProduct>;
  delete(
    token: CoreApiUserToken,
    emisorId: string,
    productId: string,
  ): Promise<InventoryProduct>;
}
