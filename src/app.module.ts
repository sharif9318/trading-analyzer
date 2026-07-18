import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalysisModule } from './analysis/analysis.module';
import { AddHistoricalIngestion1784343600000 } from './database/migrations/1784343600000-add-historical-ingestion';
import { CreateMarketCandles1784340000000 } from './database/migrations/1784340000000-create-market-candles';
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
