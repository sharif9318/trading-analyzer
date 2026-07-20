import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketCandleEntity } from './entities/market-candle.entity';
import { SpreadObservationEntity } from './entities/spread-observation.entity';
import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';
import { DataQualityService } from './quality/data-quality.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MarketCandleEntity, SpreadObservationEntity]),
  ],
  controllers: [MarketDataController],
  providers: [MarketDataService, DataQualityService],
})
export class MarketDataModule {}
