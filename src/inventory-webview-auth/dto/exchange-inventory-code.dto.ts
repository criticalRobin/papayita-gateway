import { IsString } from 'class-validator';

export class ExchangeInventoryCodeDto {
  @IsString()
  code: string;
}
