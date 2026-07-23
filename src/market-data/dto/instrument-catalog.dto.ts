import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class InstrumentCatalogItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  symbol!: string;

  @IsString()
  @MaxLength(256)
  path!: string;

  @IsString()
  @MaxLength(256)
  description!: string;

  @IsString()
  @MaxLength(16)
  currencyBase!: string;

  @IsString()
  @MaxLength(16)
  currencyProfit!: string;

  @IsString()
  @MaxLength(16)
  currencyMargin!: string;

  @IsInt()
  @Min(0)
  tradeMode!: number;

  @IsInt()
  @Min(0)
  digits!: number;

  @IsNumber()
  @Min(0)
  point!: number;

  @IsNumber()
  @Min(0)
  contractSize!: number;

  @IsNumber()
  @Min(0)
  tickSize!: number;

  @IsNumber()
  @Min(0)
  tickValue!: number;

  @IsInt()
  @Min(0)
  calculationMode!: number;

  @IsNumber()
  @Min(0)
  volumeMin!: number;

  @IsNumber()
  @Min(0)
  volumeMax!: number;

  @IsNumber()
  @Min(0)
  volumeStep!: number;

  @IsNumber()
  @Min(0)
  volumeLimit!: number;

  @IsNumber()
  @Min(0)
  marginInitial!: number;

  @IsNumber()
  @Min(0)
  marginMaintenance!: number;

  @IsNumber()
  @Min(0)
  minimumMarginBuy!: number;

  @IsNumber()
  @Min(0)
  minimumMarginSell!: number;

  @IsNumber()
  @Min(0)
  minimumOnePercentLossBuy!: number;

  @IsNumber()
  @Min(0)
  minimumOnePercentLossSell!: number;

  @IsInt()
  @Min(0)
  tradeStopsLevel!: number;

  @IsInt()
  @Min(0)
  tradeFreezeLevel!: number;

  @IsInt()
  @Min(0)
  swapMode!: number;

  @IsNumber()
  swapLong!: number;

  @IsNumber()
  swapShort!: number;

  @IsInt()
  @Min(0)
  swapRollover3Days!: number;

  @IsNumber()
  @Min(0)
  bid!: number;

  @IsNumber()
  @Min(0)
  ask!: number;
}

export class InstrumentCatalogBatchDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  source!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  server!: string;

  @IsInt()
  @Min(0)
  generatedAt!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  accountCurrency!: string;

  @IsInt()
  @Min(1)
  accountLeverage!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InstrumentCatalogItemDto)
  instruments!: InstrumentCatalogItemDto[];
}
