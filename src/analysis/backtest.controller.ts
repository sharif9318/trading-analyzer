import { Body, Controller, Post } from '@nestjs/common';
import { BacktestService } from './backtest.service';
import { BacktestRequestDto } from './dto/backtest-request.dto';
import { ConfirmationBacktestRequestDto } from './dto/confirmation-backtest-request.dto';
import { GoldSessionBreakoutRequestDto } from './dto/gold-session-breakout-request.dto';

@Controller('backtests')
export class BacktestController {
  constructor(private readonly backtests: BacktestService) {}

  @Post('trend-pullback')
  run(@Body() request: BacktestRequestDto) {
    return this.backtests.run(request);
  }

  @Post('trend-pullback-confirmation')
  runConfirmation(@Body() request: ConfirmationBacktestRequestDto) {
    return this.backtests.runConfirmation(request);
  }

  @Post('gold-session-breakout')
  runGoldSessionBreakout(@Body() request: GoldSessionBreakoutRequestDto) {
    return this.backtests.runGoldSessionBreakout(request);
  }
}
