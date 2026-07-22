#property copyright "Trading Analyzer"
#property version   "1.000"
#property strict
#property script_show_inputs

input string BackendUrl = "http://127.0.0.1:3001/market-data/instrument-catalog";
input string BridgeApiKey = "replace-with-the-same-key-as-nestjs";
input bool IncludeUnselectedSymbols = true;
input int BatchSize = 50;
input int RequestDelayMs = 100;

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
      string payload = BuildPayload(selected_only, sent, count);
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

string BuildPayload(const bool selected_only, const int start, const int count)
  {
   string items = "";
   int appended = 0;

   for(int i = start; i < start + count; i++)
     {
      string symbol = SymbolName(i, selected_only);
      if(symbol == "")
         continue;

      int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
      int precision = (int)MathMax(8, digits + 4);
      double bid = SymbolInfoDouble(symbol, SYMBOL_BID);
      double ask = SymbolInfoDouble(symbol, SYMBOL_ASK);
      if(bid <= 0.0 || ask < bid)
        {
         bid = 0.0;
         ask = 0.0;
        }

      string format = "{\"symbol\":\"%s\",\"path\":\"%s\",\"description\":\"%s\",";
      format += "\"currencyBase\":\"%s\",\"currencyProfit\":\"%s\",";
      format += "\"currencyMargin\":\"%s\",\"tradeMode\":%d,\"digits\":%d,";
      format += "\"point\":%s,\"contractSize\":%s,\"tickSize\":%s,\"tickValue\":%s,";
      format += "\"swapMode\":%d,\"swapLong\":%s,\"swapShort\":%s,";
      format += "\"swapRollover3Days\":%d,\"bid\":%s,\"ask\":%s}";
      string item = StringFormat(
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
         (int)SymbolInfoInteger(symbol, SYMBOL_SWAP_MODE),
         DoubleToString(SymbolInfoDouble(symbol, SYMBOL_SWAP_LONG), precision),
         DoubleToString(SymbolInfoDouble(symbol, SYMBOL_SWAP_SHORT), precision),
         (int)SymbolInfoInteger(symbol, SYMBOL_SWAP_ROLLOVER3DAYS),
         DoubleToString(bid, precision),
         DoubleToString(ask, precision)
      );

      if(appended > 0)
         items += ",";
      items += item;
      appended++;
     }

   if(appended == 0)
      return("");

   string payload_format = "{\"source\":\"XM-MT5\",\"server\":\"%s\",";
   payload_format += "\"generatedAt\":%I64d,\"instruments\":[%s]}";
   return StringFormat(
      payload_format,
      JsonEscape(AccountInfoString(ACCOUNT_SERVER)),
      TimeCurrent(),
      items
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
