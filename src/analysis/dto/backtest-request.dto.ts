import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class BacktestRequestDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCHF', 'USDCAD'];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(20000)
  maxM15Bars = 10000;

  @IsOptional()
  @IsIn(['fixed', 'historical-spread'])
  costModel: 'fixed' | 'historical-spread' = 'fixed';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(20)
  costBps = 2;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(50)
  @Max(100)
  minimumSpreadMatchPercent = 95;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(5)
  stopAtr = 1.5;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(5)
  rewardRisk = 2;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(4)
  @Max(192)
  maxHoldingBars = 48;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(0.9)
  trainFraction = 0.7;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(2)
  riskPerTradePercent = 1;
}
