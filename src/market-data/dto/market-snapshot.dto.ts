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

export class ClosedBarDto {
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
}

export class MarketSnapshotDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  symbol!: string;

  @IsNumber()
  bid!: number;

  @IsNumber()
  ask!: number;

  @IsNumber()
  @Min(0)
  spreadPoints!: number;

  @IsInt()
  @Min(0)
  tickTime!: number;

  @ValidateNested()
  @Type(() => ClosedBarDto)
  closedBar!: ClosedBarDto;
}

export class MarketSnapshotBatchDto {
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
  @MaxLength(32)
  timeframe!: string;

  @IsInt()
  @Min(0)
  generatedAt!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => MarketSnapshotDto)
  snapshots!: MarketSnapshotDto[];
}
