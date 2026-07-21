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
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class HistoricalEconomicEventDto {
  @IsString()
  @Matches(/^\d+$/)
  valueId!: string;

  @IsString()
  @Matches(/^\d+$/)
  eventId!: string;

  @IsString()
  @Matches(/^\d+$/)
  countryId!: string;

  @IsInt()
  @Min(1)
  eventTime!: number;

  @IsInt()
  @Min(0)
  periodTime!: number;

  @IsInt()
  @Min(0)
  revision!: number;

  @IsOptional()
  @IsNumber()
  actualValue!: number | null;

  @IsOptional()
  @IsNumber()
  previousValue!: number | null;

  @IsOptional()
  @IsNumber()
  revisedPreviousValue!: number | null;

  @IsOptional()
  @IsNumber()
  forecastValue!: number | null;

  @IsInt()
  @Min(0)
  @Max(10)
  impactType!: number;

  @IsString()
  @MaxLength(8)
  countryCode!: string;

  @IsString()
  @MaxLength(128)
  countryName!: string;

  @IsInt()
  @Min(0)
  @Max(100)
  eventType!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  sector!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  frequency!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  timeMode!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  unit!: number;

  @IsInt()
  @Min(0)
  @Max(10)
  importance!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  multiplier!: number;

  @IsInt()
  @Min(0)
  @Max(20)
  digits!: number;

  @IsString()
  @MaxLength(2048)
  sourceUrl!: string;

  @IsString()
  @MaxLength(128)
  eventCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  name!: string;
}

export class EconomicEventBackfillDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  source!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  server!: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsInt()
  @Min(1)
  generatedAt!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => HistoricalEconomicEventDto)
  events!: HistoricalEconomicEventDto[];
}
