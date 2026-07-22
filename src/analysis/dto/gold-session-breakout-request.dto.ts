import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * Only sample-size and reporting controls are exposed. Strategy rules are
 * deliberately frozen in code so a failed result cannot be tuned through the
 * request body.
 */
export class GoldSessionBreakoutRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5000)
  @Max(20000)
  maxM15Bars = 10000;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(95)
  @Max(100)
  minimumSpreadMatchPercent = 95;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.7)
  @Max(0.7)
  trainFraction = 0.7;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(1)
  riskPerTradePercent = 1;
}
