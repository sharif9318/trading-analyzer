import { BacktestRequestDto } from './backtest-request.dto';

export class ConfirmationBacktestRequestDto extends BacktestRequestDto {
  costModel: 'historical-spread' = 'historical-spread';
}
