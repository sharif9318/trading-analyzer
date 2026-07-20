import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class SpreadQueryDto {
  @IsOptional()
  @IsIn(['PERIOD_M15', 'PERIOD_H1'])
  timeframe = 'PERIOD_M15';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(20)
  @Max(50000)
  minimumSamples = 100;
}
