#property copyright "Trading Analyzer"
#property version   "1.100"
#property strict
#property script_show_inputs

input string BackendUrl = "http://127.0.0.1:3001/market-data/backfill";
input string BridgeApiKey = "replace-with-the-same-key-as-nestjs";
input string SymbolsCsv = "EURUSD,USDJPY,AUDUSD";
input int BarsPerTimeframe = 2000;
input int BatchSize = 100;
input int RequestDelayMs = 100;
input bool IncludeM15 = true;
input bool IncludeH1 = true;
input bool IncludeH4 = true;
input bool IncludeD1 = false;

void OnStart()
  {
   if(BarsPerTimeframe < 1 || BarsPerTimeframe > 10000)
     {
      Print("BarsPerTimeframe must be between 1 and 10000");
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

   ENUM_TIMEFRAMES timeframes[4];
   int timeframe_count = 0;
   if(IncludeM15)
      timeframes[timeframe_count++] = PERIOD_M15;
   if(IncludeH1)
      timeframes[timeframe_count++] = PERIOD_H1;
   if(IncludeH4)
      timeframes[timeframe_count++] = PERIOD_H4;
   if(IncludeD1)
      timeframes[timeframe_count++] = PERIOD_D1;

   if(timeframe_count == 0)
     {
      Print("Enable at least one timeframe");
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

      for(int j = 0; j < timeframe_count; j++)
        {
         if(BackfillSeries(symbols[i], timeframes[j]))
            completed++;
         else
            failed++;
        }
     }

   PrintFormat(
      "Historical backfill finished. Completed series: %d, failed series: %d",
      completed,
      failed
   );
  }

bool BackfillSeries(const string symbol, const ENUM_TIMEFRAMES timeframe)
  {
   MqlRates rates[];
   ArraySetAsSeries(rates, false);
   int copied = 0;
   for(int attempt = 1; attempt <= 5; attempt++)
     {
      ResetLastError();
      copied = CopyRates(symbol, timeframe, 1, BarsPerTimeframe, rates);
      if(copied >= BarsPerTimeframe)
         break;

      if(attempt < 5)
        {
         PrintFormat(
            "History is loading for %s %s. Attempt %d copied %d of %d",
            symbol,
            EnumToString(timeframe),
            attempt,
            copied,
            BarsPerTimeframe
         );
         Sleep(1000);
        }
     }

   if(copied < 1)
     {
      PrintFormat(
         "CopyRates failed for %s %s. Copied: %d, error: %d",
         symbol,
         EnumToString(timeframe),
         copied,
         GetLastError()
      );
      return(false);
     }

   PrintFormat(
      "Loaded %d closed candles for %s %s",
      copied,
      symbol,
      EnumToString(timeframe)
   );

   int sent = 0;
   while(sent < copied)
     {
      int count = MathMin(BatchSize, copied - sent);
      string payload = BuildPayload(symbol, timeframe, rates, sent, count);
      if(!SendPayload(payload, symbol, timeframe, sent, count))
         return(false);

      sent += count;
      if(RequestDelayMs > 0)
         Sleep(RequestDelayMs);
     }

   PrintFormat(
      "Backfilled %d candles for %s %s",
      sent,
      symbol,
      EnumToString(timeframe)
   );
   return(true);
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

   for(int i = start; i < start + count; i++)
     {
      string item = StringFormat(
         "{\"time\":%I64d,\"open\":%s,\"high\":%s,\"low\":%s,"
         "\"close\":%s,\"tickVolume\":%I64d}",
         rates[i].time,
         DoubleToString(rates[i].open, digits),
         DoubleToString(rates[i].high, digits),
         DoubleToString(rates[i].low, digits),
         DoubleToString(rates[i].close, digits),
         rates[i].tick_volume
      );

      if(i > start)
         candles += ",";
      candles += item;
     }

   return StringFormat(
      "{\"source\":\"XM-MT5\",\"server\":\"%s\",\"symbol\":\"%s\","
      "\"timeframe\":\"%s\",\"generatedAt\":%I64d,\"candles\":[%s]}",
      JsonEscape(AccountInfoString(ACCOUNT_SERVER)),
      JsonEscape(symbol),
      JsonEscape(EnumToString(timeframe)),
      TimeCurrent(),
      candles
   );
  }

bool SendPayload(
   const string payload,
   const string symbol,
   const ENUM_TIMEFRAMES timeframe,
   const int start,
   const int count
)
  {
   uchar utf8[];
   int copied = StringToCharArray(payload, utf8, 0, WHOLE_ARRAY, CP_UTF8);
   if(copied <= 1)
     {
      Print("Could not encode backfill payload as UTF-8");
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
         "WebRequest failed for %s %s at offset %d. Error: %d",
         symbol,
         EnumToString(timeframe),
         start,
         GetLastError()
      );
      return(false);
     }

   if(status < 200 || status >= 300)
     {
      PrintFormat(
         "Backend rejected %s %s offset %d count %d with HTTP %d",
         symbol,
         EnumToString(timeframe),
         start,
         count,
         status
      );
      return(false);
     }

   PrintFormat(
      "Accepted %s %s candles %d-%d with HTTP %d",
      symbol,
      EnumToString(timeframe),
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
