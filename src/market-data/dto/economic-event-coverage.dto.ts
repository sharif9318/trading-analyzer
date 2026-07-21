import {
  IsBoolean,
  IsIn,
  IsInt,
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
  @IsIn(['complete', 'gap'])
  status!: 'complete' | 'gap';

  @IsOptional()
  @IsInt()
  @Min(1)
  errorCode?: number;

  @IsBoolean()
  aggregateAttempted!: boolean;

  @IsBoolean()
  perEventAttempted!: boolean;
}
