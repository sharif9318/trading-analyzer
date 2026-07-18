#property copyright "Trading Analyzer"
#property version   "1.001"
#property strict

input string BackendUrl = "http://127.0.0.1:3001/market-data/snapshots";
input string BridgeApiKey = "replace-with-the-same-key-as-nestjs";
input string SymbolsCsv = "EURUSD,USDJPY,AUDUSD";
input ENUM_TIMEFRAMES AnalysisTimeframe = PERIOD_H1;
input int TimerSeconds = 10;

string Symbols[];
datetime LastSentBarTimes[];
datetime PendingBarTimes[];

int OnInit()
  {
   if(TimerSeconds < 1)
     {
      Print("TimerSeconds must be at least 1");
      return(INIT_PARAMETERS_INCORRECT);
     }

   int count = StringSplit(SymbolsCsv, ',', Symbols);
   if(count < 1)
     {
      Print("SymbolsCsv must contain at least one broker symbol");
      return(INIT_PARAMETERS_INCORRECT);
     }

   ArrayResize(LastSentBarTimes, count);
   ArrayResize(PendingBarTimes, count);
   ArrayInitialize(LastSentBarTimes, 0);
   ArrayInitialize(PendingBarTimes, 0);

   for(int i = 0; i < count; i++)
     {
      StringTrimLeft(Symbols[i]);
      StringTrimRight(Symbols[i]);
      if(!SymbolSelect(Symbols[i], true))
         PrintFormat("Could not select symbol '%s'. Error: %d", Symbols[i], GetLastError());
     }

   if(!EventSetTimer(TimerSeconds))
     {
      PrintFormat("EventSetTimer failed. Error: %d", GetLastError());
      return(INIT_FAILED);
     }

   PrintFormat("Read-only bridge initialized for %d symbol(s)", count);
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
  }

void OnTimer()
  {
   string payload = BuildPayload();
   if(payload == "")
      return;

   if(SendPayload(payload))
     {
      for(int i = 0; i < ArraySize(PendingBarTimes); i++)
        {
         if(PendingBarTimes[i] > 0)
            LastSentBarTimes[i] = PendingBarTimes[i];
        }
     }
  }

string BuildPayload()
  {
   string snapshots = "";
   int valid = 0;
   ArrayInitialize(PendingBarTimes, 0);

   for(int i = 0; i < ArraySize(Symbols); i++)
     {
      string symbol = Symbols[i];
      if(symbol == "")
         continue;

      MqlTick tick;
      if(!SymbolInfoTick(symbol, tick))
        {
         PrintFormat("SymbolInfoTick failed for '%s'. Error: %d", symbol, GetLastError());
         continue;
        }

      MqlRates rates[];
      ArraySetAsSeries(rates, true);
      int copied = CopyRates(symbol, AnalysisTimeframe, 0, 2, rates);
      if(copied < 2)
        {
         PrintFormat("CopyRates needs more history for '%s'. Copied: %d", symbol, copied);
         continue;
        }

      MqlRates closed = rates[1];
      if(closed.time <= LastSentBarTimes[i])
         continue;

      double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
      double spread_points = point > 0.0 ? (tick.ask - tick.bid) / point : 0.0;
      int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);

      string item = StringFormat(
         "{\"symbol\":\"%s\",\"bid\":%s,\"ask\":%s,\"spreadPoints\":%s,"
         "\"tickTime\":%I64d,\"closedBar\":{\"time\":%I64d,\"open\":%s,"
         "\"high\":%s,\"low\":%s,\"close\":%s,\"tickVolume\":%I64d}}",
         JsonEscape(symbol),
         DoubleToString(tick.bid, digits),
         DoubleToString(tick.ask, digits),
         DoubleToString(spread_points, 2),
         tick.time,
         closed.time,
         DoubleToString(closed.open, digits),
         DoubleToString(closed.high, digits),
         DoubleToString(closed.low, digits),
         DoubleToString(closed.close, digits),
         closed.tick_volume
      );

      if(valid > 0)
         snapshots += ",";
      snapshots += item;
      PendingBarTimes[i] = closed.time;
      valid++;
     }

   if(valid == 0)
      return("");

   return StringFormat(
      "{\"source\":\"XM-MT5\",\"server\":\"%s\",\"timeframe\":\"%s\","
      "\"generatedAt\":%I64d,\"snapshots\":[%s]}",
      JsonEscape(AccountInfoString(ACCOUNT_SERVER)),
      JsonEscape(EnumToString(AnalysisTimeframe)),
      TimeTradeServer(),
      snapshots
   );
  }

bool SendPayload(const string payload)
  {
   uchar utf8[];
   int copied = StringToCharArray(payload, utf8, 0, WHOLE_ARRAY, CP_UTF8);
   if(copied <= 1)
     {
      Print("Could not encode payload as UTF-8");
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
      5000,
      body,
      response,
      response_headers
   );

   if(status == -1)
     {
      PrintFormat(
         "WebRequest failed. Error: %d. Confirm the backend URL is allowed in MT5 settings.",
         GetLastError()
      );
      return(false);
     }

   if(status < 200 || status >= 300)
     {
      PrintFormat("Backend rejected snapshot batch with HTTP %d", status);
      return(false);
     }

   PrintFormat("Snapshot batch accepted with HTTP %d", status);
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
