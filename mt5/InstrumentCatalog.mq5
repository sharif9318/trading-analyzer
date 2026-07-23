#property copyright "Trading Analyzer"
#property version   "1.100"
#property strict
#property script_show_inputs

input string BackendUrl = "http://127.0.0.1:3001/market-data/instrument-catalog";
input string BridgeApiKey = "replace-with-the-same-key-as-nestjs";
input bool ResearchUniverseOnly = true;
input bool IncludeUnselectedSymbols = true;
input int BatchSize = 50;
input int RequestDelayMs = 100;

const string RESEARCH_SYMBOLS = "EURUSD#,GBPUSD#,USDJPY#,USDCHF#,USDCAD#,AUDUSD#,NZDUSD#,EURJPY#,GBPJPY#,EURGBP#,AUDJPY#,EURAUD#,GOLD#,SILVER#,OILCash#,NGASCash#,BRENTCash#,US500Cash#,US100Cash#,US30Cash#,UK100Cash#,GER40Cash#,EU50Cash#,JP225Cash#,AUS200Cash#,FRA40Cash#,HK50Cash#";

void OnStart()
  {
   if(BatchSize < 1 || BatchSize > 100)
     {
      Print("BatchSize must be between 1 and 100");
      return;
     }
   if(RequestDelayMs < 0 || RequestDelayMs > 5000)
     {
      Print("RequestDelayMs must be between 0 and 5000");
      return;
     }

   if(ResearchUniverseOnly)
     {
      UploadResearchUniverse();
      return;
     }

   bool selected_only = !IncludeUnselectedSymbols;
   int total = SymbolsTotal(selected_only);
   if(total < 1)
     {
      Print("No MT5 instruments are available");
      return;
     }

   int sent = 0;
   while(sent < total)
     {
      int count = MathMin(BatchSize, total - sent);
      string payload = BuildTerminalPayload(selected_only, sent, count);
      if(payload == "" || !SendPayload(payload, sent, count))
        {
         PrintFormat("Instrument catalog stopped at offset %d", sent);
         return;
        }
      sent += count;
      if(RequestDelayMs > 0)
         Sleep(RequestDelayMs);
     }

   PrintFormat("Instrument catalog finished. Uploaded symbols: %d", sent);
  }

void UploadResearchUniverse()
  {
   string symbols[];
   int total = StringSplit(RESEARCH_SYMBOLS, ',', symbols);
   if(total < 1)
     {
      Print("Frozen research universe is empty");
      return;
     }

   int sent = 0;
   while(sent < total)
     {
      int count = MathMin(BatchSize, total - sent);
      string payload = BuildResearchPayload(symbols, sent, count);
      if(payload == "" || !SendPayload(payload, sent, count))
        {
         PrintFormat("Research instrument specification upload stopped at offset %d", sent);
         return;
        }
      sent += count;
      if(RequestDelayMs > 0)
         Sleep(RequestDelayMs);
     }

   PrintFormat("Research instrument specifications finished. Uploaded symbols: %d", sent);
  }

string BuildResearchPayload(const string &symbols[], const int start, const int count)
  {
   string items = "";
   int appended = 0;
   for(int i = start; i < start + count; i++)
     {
      string item = BuildInstrumentItem(symbols[i]);
      if(item == "")
         continue;
      if(appended > 0)
         items += ",";
      items += item;
      appended++;
     }
   return BuildBatch(items, appended);
  }

string BuildTerminalPayload(const bool selected_only, const int start, const int count)
  {
   string items = "";
   int appended = 0;
   for(int i = start; i < start + count; i++)
     {
      string item = BuildInstrumentItem(SymbolName(i, selected_only));
      if(item == "")
         continue;
      if(appended > 0)
         items += ",";
      items += item;
      appended++;
     }
   return BuildBatch(items, appended);
  }

string BuildBatch(const string items, const int count)
  {
   if(count == 0)
      return("");
   string format = "{\"source\":\"XM-MT5\",\"server\":\"%s\",";
   format += "\"generatedAt\":%I64d,\"accountCurrency\":\"%s\",";
   format += "\"accountLeverage\":%I64d,\"instruments\":[%s]}";
   return StringFormat(
      format,
      JsonEscape(AccountInfoString(ACCOUNT_SERVER)),
      TimeCurrent(),
      JsonEscape(AccountInfoString(ACCOUNT_CURRENCY)),
      AccountInfoInteger(ACCOUNT_LEVERAGE),
      items
   );
  }

string BuildInstrumentItem(const string symbol)
  {
   if(symbol == "")
      return("");
   if(!SymbolSelect(symbol, true))
     {
      PrintFormat("Could not select research symbol '%s'. Error: %d", symbol, GetLastError());
      return("");
     }

   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   int precision = (int)MathMax(10, digits + 5);
   MqlTick tick;
   double bid = 0.0;
   double ask = 0.0;
   if(SymbolInfoTick(symbol, tick) && tick.bid > 0.0 && tick.ask >= tick.bid)
     {
      bid = tick.bid;
      ask = tick.ask;
     }

   double volume_min = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
   double minimum_margin_buy = 0.0;
   double minimum_margin_sell = 0.0;
   double minimum_loss_buy = 0.0;
   double minimum_loss_sell = 0.0;
   if(volume_min > 0.0 && bid > 0.0 && ask > 0.0)
     {
      if(!OrderCalcMargin(ORDER_TYPE_BUY, symbol, volume_min, ask, minimum_margin_buy))
         minimum_margin_buy = 0.0;
      if(!OrderCalcMargin(ORDER_TYPE_SELL, symbol, volume_min, bid, minimum_margin_sell))
         minimum_margin_sell = 0.0;

      double profit = 0.0;
      if(OrderCalcProfit(ORDER_TYPE_BUY, symbol, volume_min, ask, ask * 0.99, profit))
         minimum_loss_buy = MathAbs(profit);
      if(OrderCalcProfit(ORDER_TYPE_SELL, symbol, volume_min, bid, bid * 1.01, profit))
         minimum_loss_sell = MathAbs(profit);
     }

   string format = "{\"symbol\":\"%s\",\"path\":\"%s\",\"description\":\"%s\",";
   format += "\"currencyBase\":\"%s\",\"currencyProfit\":\"%s\",\"currencyMargin\":\"%s\",";
   format += "\"tradeMode\":%d,\"digits\":%d,\"point\":%s,";
   format += "\"contractSize\":%s,\"tickSize\":%s,\"tickValue\":%s,";
   format += "\"calculationMode\":%d,\"volumeMin\":%s,\"volumeMax\":%s,";
   format += "\"volumeStep\":%s,\"volumeLimit\":%s,";
   format += "\"marginInitial\":%s,\"marginMaintenance\":%s,";
   format += "\"minimumMarginBuy\":%s,\"minimumMarginSell\":%s,";
   format += "\"minimumOnePercentLossBuy\":%s,\"minimumOnePercentLossSell\":%s,";
   format += "\"tradeStopsLevel\":%d,\"tradeFreezeLevel\":%d,";
   format += "\"swapMode\":%d,\"swapLong\":%s,\"swapShort\":%s,";
   format += "\"swapRollover3Days\":%d,\"bid\":%s,\"ask\":%s}";

   return StringFormat(
      format,
      JsonEscape(symbol),
      JsonEscape(SymbolInfoString(symbol, SYMBOL_PATH)),
      JsonEscape(SymbolInfoString(symbol, SYMBOL_DESCRIPTION)),
      JsonEscape(SymbolInfoString(symbol, SYMBOL_CURRENCY_BASE)),
      JsonEscape(SymbolInfoString(symbol, SYMBOL_CURRENCY_PROFIT)),
      JsonEscape(SymbolInfoString(symbol, SYMBOL_CURRENCY_MARGIN)),
      (int)SymbolInfoInteger(symbol, SYMBOL_TRADE_MODE),
      digits,
      DoubleToString(SymbolInfoDouble(symbol, SYMBOL_POINT), precision),
      DoubleToString(SymbolInfoDouble(symbol, SYMBOL_TRADE_CONTRACT_SIZE), precision),
      DoubleToString(SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE), precision),
      DoubleToString(SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE), precision),
      (int)SymbolInfoInteger(symbol, SYMBOL_TRADE_CALC_MODE),
      DoubleToString(volume_min, precision),
      DoubleToString(SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX), precision),
      DoubleToString(SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP), precision),
      DoubleToString(SymbolInfoDouble(symbol, SYMBOL_VOLUME_LIMIT), precision),
      DoubleToString(SymbolInfoDouble(symbol, SYMBOL_MARGIN_INITIAL), precision),
      DoubleToString(SymbolInfoDouble(symbol, SYMBOL_MARGIN_MAINTENANCE), precision),
      DoubleToString(minimum_margin_buy, precision),
      DoubleToString(minimum_margin_sell, precision),
      DoubleToString(minimum_loss_buy, precision),
      DoubleToString(minimum_loss_sell, precision),
      (int)SymbolInfoInteger(symbol, SYMBOL_TRADE_STOPS_LEVEL),
      (int)SymbolInfoInteger(symbol, SYMBOL_TRADE_FREEZE_LEVEL),
      (int)SymbolInfoInteger(symbol, SYMBOL_SWAP_MODE),
      DoubleToString(SymbolInfoDouble(symbol, SYMBOL_SWAP_LONG), precision),
      DoubleToString(SymbolInfoDouble(symbol, SYMBOL_SWAP_SHORT), precision),
      (int)SymbolInfoInteger(symbol, SYMBOL_SWAP_ROLLOVER3DAYS),
      DoubleToString(bid, precision),
      DoubleToString(ask, precision)
   );
  }

bool SendPayload(const string payload, const int start, const int count)
  {
   uchar utf8[];
   int copied = StringToCharArray(payload, utf8, 0, WHOLE_ARRAY, CP_UTF8);
   if(copied <= 1)
     {
      Print("Could not encode instrument catalog as UTF-8");
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
   int status = WebRequest("POST", BackendUrl, headers, 30000, body, response, response_headers);
   if(status == -1)
     {
      PrintFormat("Instrument catalog WebRequest failed at offset %d. Error: %d", start, GetLastError());
      return(false);
     }
   if(status < 200 || status >= 300)
     {
      PrintFormat("Backend rejected instrument catalog offset %d count %d with HTTP %d", start, count, status);
      return(false);
     }

   PrintFormat("Accepted instrument catalog symbols %d-%d with HTTP %d", start + 1, start + count, status);
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
