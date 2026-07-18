import { Body, Controller, Post } from '@nestjs/common';
import { BacktestService } from './backtest.service';
import { BacktestRequestDto } from './dto/backtest-request.dto';

@Controller('backtests')
export class BacktestController {
  constructor(private readonly backtests: BacktestService) {}

  @Post('trend-pullback')
  run(@Body() request: BacktestRequestDto) {
    return this.backtests.run(request);
  }
}
