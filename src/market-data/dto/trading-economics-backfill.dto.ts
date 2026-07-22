import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export const TRADING_ECONOMICS_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'AUD',
  'CHF',
  'CAD',
] as const;

export type TradingEconomicsCurrency =
  (typeof TRADING_ECONOMICS_CURRENCIES)[number];

export class TradingEconomicsBackfillDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsIn(TRADING_ECONOMICS_CURRENCIES, { each: true })
  currencies: TradingEconomicsCurrency[] = [
    ...TRADING_ECONOMICS_CURRENCIES,
  ];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3)
  minimumImportance = 0;
}
