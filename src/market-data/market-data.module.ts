import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketCandleEntity } from './entities/market-candle.entity';
import { SpreadObservationEntity } from './entities/spread-observation.entity';
import { EconomicEventDefinitionEntity } from './entities/economic-event-definition.entity';
import { EconomicEventReleaseEntity } from './entities/economic-event-release.entity';
import { EconomicEventCoverageGapEntity } from './entities/economic-event-coverage-gap.entity';
import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';
import { DataQualityService } from './quality/data-quality.service';
import { EconomicEventQualityService } from './quality/economic-event-quality.service';
import { TradingEconomicsService } from './providers/trading-economics.service';
import { InstrumentCatalogEntity } from './entities/instrument-catalog.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MarketCandleEntity,
      SpreadObservationEntity,
      EconomicEventDefinitionEntity,
      EconomicEventReleaseEntity,
      EconomicEventCoverageGapEntity,
      InstrumentCatalogEntity,
    ]),
  ],
  controllers: [MarketDataController],
  providers: [
    MarketDataService,
    DataQualityService,
    EconomicEventQualityService,
    TradingEconomicsService,
  ],
})
export class MarketDataModule {}
