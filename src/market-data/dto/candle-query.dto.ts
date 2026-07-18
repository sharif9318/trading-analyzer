import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CandleQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  symbol?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  timeframe?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit = 200;
}
