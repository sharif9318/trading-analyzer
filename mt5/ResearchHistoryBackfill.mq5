#property copyright "Trading Analyzer"
#property version   "1.001"
#property strict
#property script_show_inputs

input string BackendUrl = "http://127.0.0.1:3001/market-data/backfill";
input string BridgeApiKey = "replace-with-the-same-key-as-nestjs";
input datetime StartTime = D'2020.01.01 00:00';
input datetime EndTime = 0;
input int BatchSize = 200;
input int RequestDelayMs = 50;
input bool IncludeM15 = true;
input bool IncludeH1 = true;
input bool IncludeD1 = true;

const string RESEARCH_SYMBOLS = "EURUSD#,GBPUSD#,USDJPY#,USDCHF#,USDCAD#,AUDUSD#,NZDUSD#,EURJPY#,GBPJPY#,EURGBP#,AUDJPY#,EURAUD#,GOLD#,SILVER#,OILCash#,NGASCash#,BRENTCash#,US500Cash#,US100Cash#,US30Cash#,UK100Cash#,GER40Cash#,EU50Cash#,JP225Cash#,AUS200Cash#,FRA40Cash#,HK50Cash#";

void OnStart()
  {
   if(StartTime != D'2020.01.01 00:00')
     {
      Print("StartTime must remain at the preregistered 2020-01-01 boundary");
      return;
     }
   datetime effective_end = EndTime == 0 ? TimeTradeServer() : EndTime;
   if(effective_end <= StartTime)
     {
      Print("EndTime must be later than StartTime");
      return;
     }
   if(BatchSize < 1 || BatchSize > 250)
     {
      Print("BatchSize must be between 1 and 250");
      return;
     }
   if(RequestDelayMs < 0 || RequestDelayMs > 5000)
     {
      Print("RequestDelayMs must be between 0 and 5000");
      return;
     }

   long terminal_max_bars = TerminalInfoInteger(TERMINAL_MAXBARS);
   long conservative_m15_bars =
      ((long)effective_end - (long)StartTime) / PeriodSeconds(PERIOD_M15) + 1;
   if(IncludeM15 && terminal_max_bars < conservative_m15_bars)
     {
      PrintFormat(
         "TERMINAL_MAXBARS is %I64d but this fixed M15 range may require up to %I64d bars. Set Tools > Options > Charts > Max bars in chart to Unlimited, restart MT5, and rerun",
         terminal_max_bars,
         conservative_m15_bars
      );
      return;
     }

   ENUM_TIMEFRAMES timeframes[3];
   int timeframe_count = 0;
   if(IncludeM15)
      timeframes[timeframe_count++] = PERIOD_M15;
   if(IncludeH1)
      timeframes[timeframe_count++] = PERIOD_H1;
   if(IncludeD1)
      timeframes[timeframe_count++] = PERIOD_D1;
   if(timeframe_count == 0)
     {
      Print("Enable at least one research timeframe");
      return;
     }

   string symbols[];
   int symbol_count = StringSplit(RESEARCH_SYMBOLS, ',', symbols);
   int completed = 0;
   int failed = 0;
   for(int i = 0; i < symbol_count; i++)
     {
      if(!SymbolSelect(symbols[i], true))
        {
         PrintFormat("Could not select frozen symbol '%s'. Error: %d", symbols[i], GetLastError());
         failed += timeframe_count;
         continue;
        }
      for(int j = 0; j < timeframe_count; j++)
        {
         if(BackfillSeries(symbols[i], timeframes[j], StartTime, effective_end))
            completed++;
         else
            failed++;
        }
     }

   PrintFormat(
      "Research history backfill finished. Completed series: %d, failed series: %d",
      completed,
      failed
   );
  }

bool BackfillSeries(
   const string symbol,
   const ENUM_TIMEFRAMES timeframe,
   const datetime range_from,
   const datetime range_to
)
  {
   datetime chunk_from = range_from;
   int total_candles = 0;
   int total_spread_bars = 0;
   int chunk_days = ChunkDays(timeframe);
   datetime current_bar_open = iTime(symbol, timeframe, 0);
   datetime first_imported_time = 0;
   bool history_started = false;

   long server_first_date = 0;
   for(int metadata_attempt = 1; metadata_attempt <= 100 && !IsStopped(); metadata_attempt++)
     {
      ResetLastError();
      if(SeriesInfoInteger(
         symbol,
         PERIOD_M1,
         SERIES_SERVER_FIRSTDATE,
         server_first_date
      ) && server_first_date > 0)
         break;
      Sleep(50);
     }
   if(server_first_date <= 0)
     {
      PrintFormat(
         "Could not read the broker's first server date for %s %s. Error: %d",
         symbol,
         EnumToString(timeframe),
         GetLastError()
      );
      return(false);
     }
   if(server_first_date > (long)chunk_from)
     {
      chunk_from = (datetime)server_first_date;
      PrintFormat(
         "Broker history for %s %s starts at %s; requested start was %s",
         symbol,
         EnumToString(timeframe),
         TimeToString(chunk_from, TIME_DATE|TIME_MINUTES),
         TimeToString(range_from, TIME_DATE|TIME_MINUTES)
      );
     }

   while(chunk_from <= range_to)
     {
      datetime chunk_to = chunk_from + chunk_days * 86400 - 1;
      if(chunk_to > range_to)
         chunk_to = range_to;

      MqlRates rates[];
      ArraySetAsSeries(rates, false);
      int copied = -1;
      int last_error = 0;
      for(int attempt = 1; attempt <= 5; attempt++)
        {
         ResetLastError();
         copied = CopyRates(symbol, timeframe, chunk_from, chunk_to, rates);
         if(copied >= 0)
            break;
         last_error = GetLastError();
         PrintFormat(
            "History synchronizing for %s %s at %s. Attempt %d, error: %d",
            symbol,
            EnumToString(timeframe),
            TimeToString(chunk_from, TIME_DATE),
            attempt,
            last_error
         );
         Sleep(1000);
        }

      if(copied < 0)
        {
         PrintFormat(
            "CopyRates failed for %s %s from %s to %s. Error: %d",
            symbol,
            EnumToString(timeframe),
            TimeToString(chunk_from, TIME_DATE),
            TimeToString(chunk_to, TIME_DATE),
            last_error
         );
         return(false);
        }

      if(copied == 0)
        {
         PrintFormat(
            "Unexpected empty history chunk for %s %s from %s to %s",
            symbol,
            EnumToString(timeframe),
            TimeToString(chunk_from, TIME_DATE),
            TimeToString(chunk_to, TIME_DATE)
         );
         return(false);
        }

      if(current_bar_open <= 0)
         current_bar_open = iTime(symbol, timeframe, 0);

      int closed_count = copied;
      while(closed_count > 0 && rates[closed_count - 1].time >= current_bar_open)
         closed_count--;

      if(closed_count == 0)
        {
         chunk_from = chunk_to + 1;
         continue;
        }

      if(!history_started)
        {
         history_started = true;
         first_imported_time = rates[0].time;
         PrintFormat(
            "First available broker candle for %s %s is %s",
            symbol,
            EnumToString(timeframe),
            TimeToString(first_imported_time, TIME_DATE|TIME_MINUTES)
         );
        }

      int sent = 0;
      while(sent < closed_count)
        {
         int count = MathMin(BatchSize, closed_count - sent);
         string payload = BuildPayload(symbol, timeframe, rates, sent, count);
         if(!SendPayload(payload, symbol, timeframe, total_candles + sent, count))
            return(false);
         for(int k = sent; k < sent + count; k++)
            if(rates[k].spread > 0)
               total_spread_bars++;
         sent += count;
         if(RequestDelayMs > 0)
            Sleep(RequestDelayMs);
        }
      total_candles += closed_count;
      chunk_from = chunk_to + 1;
     }

   if(!history_started || total_candles == 0)
     {
      PrintFormat(
         "No closed broker candles found for %s %s between %s and %s",
         symbol,
         EnumToString(timeframe),
         TimeToString(range_from, TIME_DATE),
         TimeToString(range_to, TIME_DATE)
      );
      return(false);
     }

   PrintFormat(
      "Backfilled %d candles with %d bar spreads for %s %s. Actual start: %s",
      total_candles,
      total_spread_bars,
      symbol,
      EnumToString(timeframe),
      TimeToString(first_imported_time, TIME_DATE|TIME_MINUTES)
   );
   return(true);
  }

int ChunkDays(const ENUM_TIMEFRAMES timeframe)
  {
   if(timeframe == PERIOD_M15)
      return(30);
   if(timeframe == PERIOD_H1)
      return(120);
   return(730);
  }

string BuildPayload(
   const string symbol,
   const ENUM_TIMEFRAMES timeframe,
   const MqlRates &rates[],
   const int start,
   const int count
)
  {
   string candles = "";
   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   int precision = (int)MathMax(10, digits + 5);
   for(int i = start; i < start + count; i++)
     {
      string item = StringFormat(
         "{\"time\":%I64d,\"open\":%s,\"high\":%s,\"low\":%s,"
         "\"close\":%s,\"tickVolume\":%I64d,\"spreadPoints\":%d}",
         rates[i].time,
         DoubleToString(rates[i].open, digits),
         DoubleToString(rates[i].high, digits),
         DoubleToString(rates[i].low, digits),
         DoubleToString(rates[i].close, digits),
         rates[i].tick_volume,
         rates[i].spread
      );
      if(i > start)
         candles += ",";
      candles += item;
     }

   return StringFormat(
      "{\"source\":\"XM-MT5\",\"server\":\"%s\",\"symbol\":\"%s\","
      "\"timeframe\":\"%s\",\"generatedAt\":%I64d,\"point\":%s,\"candles\":[%s]}",
      JsonEscape(AccountInfoString(ACCOUNT_SERVER)),
      JsonEscape(symbol),
      JsonEscape(EnumToString(timeframe)),
      TimeTradeServer(),
      DoubleToString(SymbolInfoDouble(symbol, SYMBOL_POINT), precision),
      candles
   );
  }

bool SendPayload(
   const string payload,
   const string symbol,
   const ENUM_TIMEFRAMES timeframe,
   const int offset,
   const int count
)
  {
   uchar utf8[];
   int copied = StringToCharArray(payload, utf8, 0, WHOLE_ARRAY, CP_UTF8);
   if(copied <= 1)
      return(false);
   int body_size = copied - 1;
   char body[];
   ArrayResize(body, body_size);
   for(int i = 0; i < body_size; i++)
      body[i] = (char)utf8[i];

   char response[];
   string response_headers;
   string headers = "Content-Type: application/json\r\nX-Bridge-Key: " + BridgeApiKey + "\r\n";
   ResetLastError();
   int status = WebRequest("POST", BackendUrl, headers, 30000, body, response, response_headers);
   if(status == -1)
     {
      PrintFormat("WebRequest failed for %s %s at offset %d. Error: %d", symbol, EnumToString(timeframe), offset, GetLastError());
      return(false);
     }
   if(status < 200 || status >= 300)
     {
      PrintFormat("Backend rejected %s %s offset %d count %d with HTTP %d", symbol, EnumToString(timeframe), offset, count, status);
      return(false);
     }
   return(true);
  }

string JsonEscape(string value)
  {
   StringReplace(value, "\\", "\\\\");
   StringReplace(value, "\"", "\\\"");
   StringReplace(value, "\r", "\\r");
   StringReplace(value, "\n", "\\n");
   StringReplace(value, "\t", "\\t");
   return(value);
  }
