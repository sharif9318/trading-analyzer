import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalysisModule } from './analysis/analysis.module';
import { AddHistoricalIngestion1784343600000 } from './database/migrations/1784343600000-add-historical-ingestion';
import { CreateMarketCandles1784340000000 } from './database/migrations/1784340000000-create-market-candles';
import { CreateSpreadObservations1784682000000 } from './database/migrations/1784682000000-create-spread-observations';
import { CreateEconomicEvents1784768400000 } from './database/migrations/1784768400000-create-economic-events';
import { AddEconomicEventCoverageGaps1784772000000 } from './database/migrations/1784772000000-add-economic-event-coverage-gaps';
import { AddEventSpecificEconomicEventGaps1784775600000 } from './database/migrations/1784775600000-add-event-specific-economic-event-gaps';
import { CreateInstrumentCatalog1784862000000 } from './database/migrations/1784862000000-create-instrument-catalog';
import { MarketDataModule } from './market-data/market-data.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: false,
        migrationsRun: true,
        migrations: [
          CreateMarketCandles1784340000000,
          AddHistoricalIngestion1784343600000,
          CreateSpreadObservations1784682000000,
          CreateEconomicEvents1784768400000,
          AddEconomicEventCoverageGaps1784772000000,
          AddEventSpecificEconomicEventGaps1784775600000,
          CreateInstrumentCatalog1784862000000,
        ],
        retryAttempts: 10,
        retryDelay: 3000,
      }),
    }),
    MarketDataModule,
    AnalysisModule,
  ],
})
export class AppModule {}
