import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

export class ResearchPreflightQueryDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(10_000_000)
  accountBalance: number = 60;
}
