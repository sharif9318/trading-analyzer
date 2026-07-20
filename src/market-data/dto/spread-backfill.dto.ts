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

export class HistoricalSpreadObservationDto {
  @IsInt()
  @Min(0)
  bucketOpenTime!: number;

  @IsInt()
  @Min(0)
  tickTimeMsc!: number;

  @IsNumber()
  @Min(Number.EPSILON)
  bid!: number;

  @IsNumber()
  @Min(Number.EPSILON)
  ask!: number;
}

export class SpreadBackfillDto {
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

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(250)
  @ValidateNested({ each: true })
  @Type(() => HistoricalSpreadObservationDto)
  observations!: HistoricalSpreadObservationDto[];
}
