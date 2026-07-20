import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketCandleEntity } from '../market-data/entities/market-candle.entity';
import { SpreadObservationEntity } from '../market-data/entities/spread-observation.entity';
import { AnalysisController } from './analysis.controller';
import { BacktestController } from './backtest.controller';
import { BacktestService } from './backtest.service';
import { SpreadCalibrationService } from './spread-calibration.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MarketCandleEntity, SpreadObservationEntity]),
  ],
  controllers: [BacktestController, AnalysisController],
  providers: [BacktestService, SpreadCalibrationService],
})
export class AnalysisModule {}
