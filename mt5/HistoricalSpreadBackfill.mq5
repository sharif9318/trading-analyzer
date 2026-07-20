#property copyright "Trading Analyzer"
#property version   "1.000"
#property strict
#property script_show_inputs

input string BackendUrl = "http://127.0.0.1:3001/market-data/spread-backfill";
input string BridgeApiKey = "replace-with-the-same-key-as-nestjs";
input string SymbolsCsv = "EURUSD,GBPUSD,USDJPY,AUDUSD,USDCHF,USDCAD";
input int DaysBack = 30;
input int ChunkHours = 6;
input int BatchSize = 200;
input int RequestDelayMs = 100;

struct SpreadSample
  {
   long bucket_open_time;
   long tick_time_msc;
   double bid;
   double ask;
  };

void OnStart()
  {
   if(DaysBack < 1 || DaysBack > 180)
     {
      Print("DaysBack must be between 1 and 180");
      return;
     }

   if(ChunkHours < 1 || ChunkHours > 24)
     {
      Print("ChunkHours must be between 1 and 24");
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

   string symbols[];
   int symbol_count = StringSplit(SymbolsCsv, ',', symbols);
   if(symbol_count < 1)
     {
      Print("SymbolsCsv must contain at least one broker symbol");
      return;
     }

   int completed = 0;
   int failed = 0;
   for(int i = 0; i < symbol_count; i++)
     {
      StringTrimLeft(symbols[i]);
      StringTrimRight(symbols[i]);
      if(symbols[i] == "")
         continue;

      if(!SymbolSelect(symbols[i], true))
        {
         PrintFormat("Could not select symbol '%s'. Error: %d", symbols[i], GetLastError());
         failed++;
         continue;
        }

      if(BackfillSymbol(symbols[i]))
         completed++;
      else
         failed++;
     }

   PrintFormat(
      "Historical spread backfill finished. Completed symbols: %d, failed symbols: %d",
      completed,
      failed
   );
  }

bool BackfillSymbol(const string symbol)
  {
   const ulong DAY_MSC = 86400000;
   const long BUCKET_SECONDS = 900;
   ulong to_msc = (ulong)TimeTradeServer() * 1000;
   ulong from_msc = to_msc - (ulong)DaysBack * DAY_MSC;
   ulong chunk_msc = (ulong)ChunkHours * 60 * 60 * 1000;
   ulong chunk_from = from_msc;
   long last_bucket = -1;
   int total_ticks = 0;
   int total_samples = 0;

   while(chunk_from <= to_msc)
     {
      ulong chunk_to = chunk_from + chunk_msc - 1;
      if(chunk_to > to_msc)
         chunk_to = to_msc;

      MqlTick ticks[];
      int copied = -1;
      for(int attempt = 1; attempt <= 5; attempt++)
        {
         ResetLastError();
         copied = CopyTicksRange(
            symbol,
            ticks,
            COPY_TICKS_INFO,
            chunk_from,
            chunk_to
         );

         if(copied >= 0)
            break;

         PrintFormat(
            "Tick history is synchronizing for %s. Attempt %d, error: %d",
            symbol,
            attempt,
            GetLastError()
         );
         Sleep(1000);
        }

      if(copied < 0)
        {
         PrintFormat(
            "CopyTicksRange failed for %s from %I64u to %I64u. Error: %d",
            symbol,
            chunk_from,
            chunk_to,
            GetLastError()
         );
         return(false);
        }

      total_ticks += copied;
      SpreadSample samples[];
      int sample_count = 0;

      for(int i = 0; i < copied; i++)
        {
         if(ticks[i].bid <= 0.0 || ticks[i].ask < ticks[i].bid)
            continue;

         long bucket = (ticks[i].time / BUCKET_SECONDS) * BUCKET_SECONDS;
         if(bucket == last_bucket)
            continue;

         int next = ArrayResize(samples, sample_count + 1);
         if(next != sample_count + 1)
           {
            PrintFormat("Could not allocate spread sample array for %s", symbol);
            return(false);
           }

         samples[sample_count].bucket_open_time = bucket;
         samples[sample_count].tick_time_msc = ticks[i].time_msc;
         samples[sample_count].bid = ticks[i].bid;
         samples[sample_count].ask = ticks[i].ask;
         sample_count++;
         last_bucket = bucket;
        }

      int sent = 0;
      while(sent < sample_count)
        {
         int count = MathMin(BatchSize, sample_count - sent);
         string payload = BuildPayload(symbol, samples, sent, count);
         if(!SendPayload(payload, symbol, sent, count))
            return(false);

         sent += count;
         total_samples += count;
         if(RequestDelayMs > 0)
            Sleep(RequestDelayMs);
        }

      if(chunk_to == to_msc)
         break;
      chunk_from = chunk_to + 1;
     }

   PrintFormat(
      "Historical spread backfill loaded %d ticks and sent %d M15 samples for %s",
      total_ticks,
      total_samples,
      symbol
   );
   return(true);
  }

string BuildPayload(
   const string symbol,
   const SpreadSample &samples[],
   const int start,
   const int count
)
  {
   string observations = "";
   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);

   for(int i = start; i < start + count; i++)
     {
      string item = StringFormat(
         "{\"bucketOpenTime\":%I64d,\"tickTimeMsc\":%I64d,"
         "\"bid\":%s,\"ask\":%s}",
         samples[i].bucket_open_time,
         samples[i].tick_time_msc,
         DoubleToString(samples[i].bid, digits),
         DoubleToString(samples[i].ask, digits)
      );

      if(i > start)
         observations += ",";
      observations += item;
     }

   return StringFormat(
      "{\"source\":\"XM-MT5\",\"server\":\"%s\",\"symbol\":\"%s\","
      "\"timeframe\":\"PERIOD_M15\",\"generatedAt\":%I64d,"
      "\"observations\":[%s]}",
      JsonEscape(AccountInfoString(ACCOUNT_SERVER)),
      JsonEscape(symbol),
      TimeTradeServer(),
      observations
   );
  }

bool SendPayload(
   const string payload,
   const string symbol,
   const int start,
   const int count
)
  {
   uchar utf8[];
   int copied = StringToCharArray(payload, utf8, 0, WHOLE_ARRAY, CP_UTF8);
   if(copied <= 1)
     {
      Print("Could not encode spread payload as UTF-8");
      return(false);
     }

   int body_size = copied - 1;
   char body[];
   ArrayResize(body, body_size);
   for(int i = 0; i < body_size; i++)
      body[i] = (char)utf8[i];

   char response[];
   string response_headers;
   string headers = "Content-Type: application/json\r\nX-Bridge-Key: " + BridgeApiKey + "\r\n";
   ResetLastError();
   int status = WebRequest(
      "POST",
      BackendUrl,
      headers,
      15000,
      body,
      response,
      response_headers
   );

   if(status == -1)
     {
      PrintFormat(
         "WebRequest failed for %s at sample offset %d. Error: %d",
         symbol,
         start,
         GetLastError()
      );
      return(false);
     }

   if(status < 200 || status >= 300)
     {
      PrintFormat(
         "Backend rejected %s samples %d-%d with HTTP %d",
         symbol,
         start + 1,
         start + count,
         status
      );
      return(false);
     }

   PrintFormat(
      "Accepted %s spread samples %d-%d with HTTP %d",
      symbol,
      start + 1,
      start + count,
      status
   );
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
