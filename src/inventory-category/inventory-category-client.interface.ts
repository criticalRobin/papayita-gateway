import { CoreApiUserToken } from '../core-api/core-api-token';
import { InventoryCategory } from './domain/inventory-category';
import { CreateOrUpdateInventoryCategoryDto } from './dto/create-or-update-inventory-category.dto';

export interface InventoryCategoryClient {
  findAll(
    token: CoreApiUserToken,
    emisorId: string,
  ): Promise<InventoryCategory[]>;
  create(
    token: CoreApiUserToken,
    emisorId: string,
    data: CreateOrUpdateInventoryCategoryDto,
  ): Promise<InventoryCategory>;
  update(
    token: CoreApiUserToken,
    emisorId: string,
    categoryId: string,
    data: CreateOrUpdateInventoryCategoryDto,
  ): Promise<InventoryCategory>;
  delete(
    token: CoreApiUserToken,
    emisorId: string,
    categoryId: string,
  ): Promise<InventoryCategory>;
}
