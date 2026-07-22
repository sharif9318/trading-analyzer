import {
  ArrayMaxSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class EconomicEventCoverageDto {
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
  rangeFrom!: number;

  @IsInt()
  @Min(1)
  rangeTo!: number;

  @IsString()
  @IsIn(['complete', 'partial', 'gap'])
  status!: 'complete' | 'partial' | 'gap';

  @IsOptional()
  @IsString()
  @Matches(/^\d+$/)
  @MaxLength(32)
  eventId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  @Matches(/^\d+$/, { each: true })
  failedEventIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  errorCode?: number;

  @IsBoolean()
  aggregateAttempted!: boolean;

  @IsBoolean()
  perEventAttempted!: boolean;
}
