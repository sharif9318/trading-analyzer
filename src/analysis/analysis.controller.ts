import { Controller, Get, Query } from '@nestjs/common';
import { SpreadQueryDto } from './dto/spread-query.dto';
import { SpreadCalibrationService } from './spread-calibration.service';

@Controller('analysis')
export class AnalysisController {
  constructor(private readonly spreads: SpreadCalibrationService) {}

  @Get('spreads')
  spreadReport(@Query() query: SpreadQueryDto) {
    return this.spreads.report(query.timeframe, query.minimumSamples);
  }
}
