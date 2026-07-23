import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class HistoricalCandleDto {
  @IsInt()
  @Min(0)
  time!: number;

  @IsNumber()
  open!: number;

  @IsNumber()
  high!: number;

  @IsNumber()
  low!: number;

  @IsNumber()
  close!: number;

  @IsInt()
  @Min(0)
  tickVolume!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  spreadPoints?: number;
}

export class HistoricalBackfillDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  source!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  server!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  symbol!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  timeframe!: string;

  @IsInt()
  @Min(0)
  generatedAt!: number;

  @IsOptional()
  @IsNumber()
  @Min(Number.EPSILON)
  point?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(250)
  @ValidateNested({ each: true })
  @Type(() => HistoricalCandleDto)
  candles!: HistoricalCandleDto[];
}
