#property copyright "Trading Analyzer"
#property version   "1.004"
#property strict
#property script_show_inputs

input string BackendUrl = "http://127.0.0.1:3001/market-data/economic-events/backfill";
input string CoverageUrl = "http://127.0.0.1:3001/market-data/economic-events/coverage";
input string BridgeApiKey = "replace-with-the-same-key-as-nestjs";
input string CurrenciesCsv = "USD,EUR,GBP,JPY,AUD,CHF,CAD";
input int DaysBack = 180;
input int ChunkDays = 7;
input int BatchSize = 50;
input int RequestDelayMs = 100;

struct EconomicCalendarRecord
  {
   MqlCalendarValue value;
   MqlCalendarEvent event;
   MqlCalendarCountry country;
  };

struct CachedCalendarDefinition
  {
   ulong event_id;
   MqlCalendarEvent event;
   MqlCalendarCountry country;
  };

CachedCalendarDefinition CachedDefinitions[];

void OnStart()
  {
   if(DaysBack < 1 || DaysBack > 730)
     {
      Print("DaysBack must be between 1 and 730");
      return;
     }

   if(ChunkDays < 1 || ChunkDays > 30)
     {
      Print("ChunkDays must be between 1 and 30");
      return;
     }

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

   string currencies[];
   int currency_count = StringSplit(CurrenciesCsv, ',', currencies);
   if(currency_count < 1)
     {
      Print("CurrenciesCsv must contain at least one ISO currency code");
      return;
     }

   int completed = 0;
   int failed = 0;
   int total_gaps = 0;
   for(int i = 0; i < currency_count; i++)
     {
      StringTrimLeft(currencies[i]);
      StringTrimRight(currencies[i]);
      StringToUpper(currencies[i]);
      if(StringLen(currencies[i]) != 3)
        {
         PrintFormat("Invalid currency code '%s'", currencies[i]);
         failed++;
         continue;
        }

      int currency_gaps = 0;
      if(BackfillCurrency(currencies[i], currency_gaps))
         completed++;
      else
         failed++;
      total_gaps += currency_gaps;
     }

   PrintFormat(
      "Economic calendar backfill finished. Completed currencies: %d, failed currencies: %d, open coverage gaps recorded: %d",
      completed,
      failed,
      total_gaps
   );
   if(total_gaps > 0)
      Print("Calendar import continued past explicit gaps. Quality must remain INVESTIGATE and gapped intervals must be excluded from backtests.");
  }

bool BackfillCurrency(const string currency, int &gap_count)
  {
   const long DAY_SECONDS = 86400;
   const int CALENDAR_TIMEOUT_ERROR = 5401;
   datetime range_to = TimeTradeServer();
   datetime raw_range_from = range_to - (datetime)((long)DaysBack * DAY_SECONDS);
   datetime range_from = StringToTime(TimeToString(raw_range_from, TIME_DATE));
   long chunk_seconds = (long)ChunkDays * DAY_SECONDS;
   datetime chunk_from = range_from;
   int total_values = 0;
   int total_sent = 0;
   int unresolved = 0;
   gap_count = 0;

   while(chunk_from <= range_to)
     {
      datetime chunk_to = chunk_from + (datetime)chunk_seconds - 1;
      if(chunk_to > range_to)
         chunk_to = range_to;

      MqlCalendarValue values[];
      ulong failed_event_ids[];
      int failed_event_errors[];
      int count = -1;
      int last_error = 0;
      bool aggregate_attempted = false;
      bool per_event_attempted = false;
      bool partial_event_coverage = false;
      while(true)
        {
         count = -1;
         last_error = 0;
         for(int attempt = 1; attempt <= 1; attempt++)
           {
            ResetLastError();
            aggregate_attempted = true;
            count = CalendarValueHistory(
               values,
               chunk_from,
               chunk_to,
               NULL,
               currency
            );
            if(count >= 0)
               break;

            last_error = GetLastError();
            PrintFormat(
               "Calendar history retry for %s from %s to %s. Attempt %d, error: %d",
               currency,
               TimeToString(chunk_from, TIME_DATE|TIME_MINUTES),
               TimeToString(chunk_to, TIME_DATE|TIME_MINUTES),
               attempt,
               last_error
            );
            Sleep(1000);
           }

         if(count >= 0)
            break;

         long window_seconds = (long)chunk_to - (long)chunk_from + 1;
         if(last_error == CALENDAR_TIMEOUT_ERROR && window_seconds > DAY_SECONDS)
           {
            long reduced_seconds = window_seconds / 2;
            if(reduced_seconds < DAY_SECONDS)
               reduced_seconds = DAY_SECONDS;

            datetime reduced_to = chunk_from + (datetime)reduced_seconds - 1;
            PrintFormat(
               "Calendar timeout for %s. Reducing request window from %d to %d hours (%s to %s)",
               currency,
               (int)(window_seconds / 3600),
               (int)(reduced_seconds / 3600),
               TimeToString(chunk_from, TIME_DATE|TIME_MINUTES),
               TimeToString(reduced_to, TIME_DATE|TIME_MINUTES)
            );
            chunk_to = reduced_to;
            ArrayFree(values);
            continue;
           }

         if(last_error == CALENDAR_TIMEOUT_ERROR && window_seconds <= DAY_SECONDS)
           {
            PrintFormat(
               "Aggregate calendar request still timed out for %s. Trying per-event fallback for %s to %s",
               currency,
               TimeToString(chunk_from, TIME_DATE|TIME_MINUTES),
               TimeToString(chunk_to, TIME_DATE|TIME_MINUTES)
            );
            per_event_attempted = true;
            int fallback_error = 0;
            if(LoadCalendarValuesByEvent(
               currency,
               chunk_from,
               chunk_to,
               values,
               failed_event_ids,
               failed_event_errors,
               fallback_error
            ))
              {
               count = ArraySize(values);
               partial_event_coverage = ArraySize(failed_event_ids) > 0;
               last_error = 0;
               break;
              }

            last_error = fallback_error;
           }

         break;
        }

      if(count < 0)
        {
         if(last_error == CALENDAR_TIMEOUT_ERROR && per_event_attempted)
           {
            if(!SendCoverageStatus(
               currency,
               chunk_from,
               chunk_to,
               "gap",
               last_error,
               aggregate_attempted,
               per_event_attempted,
               "",
               failed_event_ids
            ))
               return(false);

            gap_count++;
            PrintFormat(
               "Recorded unretrievable calendar coverage gap for %s from %s to %s (error %d). Continuing with the next interval.",
               currency,
               TimeToString(chunk_from, TIME_DATE|TIME_MINUTES),
               TimeToString(chunk_to, TIME_DATE|TIME_MINUTES),
               last_error
            );
            if(chunk_to == range_to)
               break;
            chunk_from = chunk_to + 1;
            continue;
           }

         PrintFormat(
            "CalendarValueHistory failed for %s from %s to %s. Error: %d",
            currency,
            TimeToString(chunk_from, TIME_DATE|TIME_MINUTES),
            TimeToString(chunk_to, TIME_DATE|TIME_MINUTES),
            last_error
         );
         return(false);
        }

      total_values += count;
      EconomicCalendarRecord records[];
      int record_count = 0;
      for(int i = 0; i < count; i++)
        {
         if(values[i].id == 0 || values[i].event_id == 0 || values[i].time <= 0)
            continue;

         MqlCalendarEvent event;
         MqlCalendarCountry country;
         if(!ResolveDefinition(values[i].event_id, event, country))
           {
            unresolved++;
            continue;
           }

         int resized = ArrayResize(records, record_count + 1);
         if(resized != record_count + 1)
           {
            PrintFormat("Could not allocate calendar record array for %s", currency);
            return(false);
           }

         records[record_count].value = values[i];
         records[record_count].event = event;
         records[record_count].country = country;
         record_count++;
        }

      int sent = 0;
      while(sent < record_count)
        {
         int batch_count = MathMin(BatchSize, record_count - sent);
         string payload = BuildPayload(currency, records, sent, batch_count);
         if(!SendPayload(payload, currency, total_sent, batch_count))
            return(false);

         sent += batch_count;
         total_sent += batch_count;
         if(RequestDelayMs > 0)
            Sleep(RequestDelayMs);
        }

      if(partial_event_coverage)
        {
         int failed_count = ArraySize(failed_event_ids);
         for(int i = 0; i < failed_count; i++)
           {
            string failed_event_id = StringFormat("%I64u", failed_event_ids[i]);
            if(!SendCoverageStatus(
               currency,
               chunk_from,
               chunk_to,
               "gap",
               failed_event_errors[i],
               aggregate_attempted,
               per_event_attempted,
               failed_event_id,
               failed_event_ids
            ))
               return(false);
           }

         if(!SendCoverageStatus(
            currency,
            chunk_from,
            chunk_to,
            "partial",
            0,
            aggregate_attempted,
            per_event_attempted,
            "",
            failed_event_ids
         ))
            return(false);

         gap_count += failed_count;
         PrintFormat(
            "Imported retrievable %s calendar events for %s to %s and recorded %d event-specific gaps",
            currency,
            TimeToString(chunk_from, TIME_DATE|TIME_MINUTES),
            TimeToString(chunk_to, TIME_DATE|TIME_MINUTES),
            failed_count
         );
        }
      else
        {
         if(!SendCoverageStatus(
            currency,
            chunk_from,
            chunk_to,
            "complete",
            0,
            aggregate_attempted,
            per_event_attempted,
            "",
            failed_event_ids
         ))
            return(false);
        }

      if(chunk_to == range_to)
         break;
      chunk_from = chunk_to + 1;
     }

   PrintFormat(
      "Economic calendar loaded %d values and sent %d records for %s; unresolved definitions: %d; open coverage gaps: %d",
      total_values,
      total_sent,
      currency,
      unresolved,
      gap_count
   );
   return(true);
  }

bool SendCoverageStatus(
   const string currency,
   const datetime range_from,
   const datetime range_to,
   const string status_name,
   const int error_code,
   const bool aggregate_attempted,
   const bool per_event_attempted,
   const string event_id,
   const ulong &failed_event_ids[]
)
  {
   string error_field = "null";
   if(error_code > 0)
      error_field = IntegerToString(error_code);

   string event_field = "";
   if(StringLen(event_id) > 0)
      event_field = ",\"eventId\":\"" + JsonEscape(event_id) + "\"";

   string failed_events_field = "";
   if(status_name == "partial")
      failed_events_field = ",\"failedEventIds\":" + BuildEventIdArrayJson(failed_event_ids);

   string payload = StringFormat(
      "{\"source\":\"MetaQuotes-Calendar\",\"server\":\"%s\",\"currency\":\"%s\",\"rangeFrom\":%I64d,\"rangeTo\":%I64d,\"status\":\"%s\",\"errorCode\":%s,\"aggregateAttempted\":%s,\"perEventAttempted\":%s%s%s}",
      JsonEscape(AccountInfoString(ACCOUNT_SERVER)),
      JsonEscape(currency),
      (long)range_from,
      (long)range_to,
      JsonEscape(status_name),
      error_field,
      aggregate_attempted ? "true" : "false",
      per_event_attempted ? "true" : "false",
      event_field,
      failed_events_field
   );

   uchar utf8[];
   int copied = StringToCharArray(payload, utf8, 0, WHOLE_ARRAY, CP_UTF8);
   if(copied <= 1)
     {
      Print("Could not encode economic calendar coverage payload as UTF-8");
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
   int http_status = WebRequest(
      "POST",
      CoverageUrl,
      headers,
      20000,
      body,
      response,
      response_headers
   );

   if(http_status == -1)
     {
      PrintFormat("Coverage WebRequest failed for %s. Error: %d", currency, GetLastError());
      return(false);
     }
   if(http_status < 200 || http_status >= 300)
     {
      PrintFormat("Backend rejected %s coverage status '%s' with HTTP %d", currency, status_name, http_status);
      return(false);
     }

   PrintFormat(
      "Accepted %s coverage status '%s' for %s to %s with HTTP %d",
      currency,
      status_name,
      TimeToString(range_from, TIME_DATE|TIME_MINUTES),
      TimeToString(range_to, TIME_DATE|TIME_MINUTES),
      http_status
   );
   return(true);
  }

string BuildEventIdArrayJson(const ulong &event_ids[])
  {
   string items = "";
   int count = ArraySize(event_ids);
   for(int i = 0; i < count; i++)
     {
      if(i > 0)
         items += ",";
      items += StringFormat("\"%I64u\"", event_ids[i]);
     }
   return("[" + items + "]");
  }

bool LoadCalendarValuesByEvent(
   const string currency,
   const datetime range_from,
   const datetime range_to,
   MqlCalendarValue &values[],
   ulong &failed_event_ids[],
   int &failed_event_errors[],
   int &last_error
)
  {
   const int CALENDAR_TIMEOUT_ERROR = 5401;
   ArrayFree(values);
   ArrayFree(failed_event_ids);
   ArrayFree(failed_event_errors);
   MqlCalendarEvent events[];
   int event_count = -1;
   last_error = 0;
   for(int attempt = 1; attempt <= 3; attempt++)
     {
      ResetLastError();
      event_count = CalendarEventByCurrency(currency, events);
      if(event_count >= 0)
         break;

      last_error = GetLastError();
      PrintFormat(
         "CalendarEventByCurrency retry for %s. Attempt %d, error: %d",
         currency,
         attempt,
         last_error
      );
      Sleep(1000);
     }

   if(event_count < 0)
      return(false);

   int total = 0;
   for(int i = 0; i < event_count; i++)
     {
      MqlCalendarValue event_values[];
      int value_count = -1;
      for(int attempt = 1; attempt <= 2; attempt++)
        {
         ResetLastError();
         value_count = CalendarValueHistoryByEvent(
            events[i].id,
            event_values,
            range_from,
            range_to
         );
         if(value_count >= 0)
            break;

         last_error = GetLastError();
         PrintFormat(
            "CalendarValueHistoryByEvent retry for %s event %I64u. Attempt %d, error: %d",
            currency,
            events[i].id,
            attempt,
            last_error
         );
         Sleep(500);
        }

      if(value_count < 0)
        {
         if(last_error != CALENDAR_TIMEOUT_ERROR)
            return(false);

         int failed_count = ArraySize(failed_event_ids);
         int next_failed_count = failed_count + 1;
         if(ArrayResize(failed_event_ids, next_failed_count) != next_failed_count ||
            ArrayResize(failed_event_errors, next_failed_count) != next_failed_count)
           {
            last_error = 4004;
            return(false);
           }

         failed_event_ids[failed_count] = events[i].id;
         failed_event_errors[failed_count] = last_error;
         PrintFormat(
            "Skipping timed-out %s event %I64u for this interval; other events will continue",
            currency,
            events[i].id
         );
         continue;
        }
      if(value_count == 0)
         continue;

      int next_total = total + value_count;
      if(ArrayResize(values, next_total) != next_total)
        {
         last_error = 4004;
         return(false);
        }

      int copied = ArrayCopy(values, event_values, total, 0, value_count);
      if(copied != value_count)
        {
         last_error = 4004;
         return(false);
        }
      total = next_total;
     }

   PrintFormat(
      "Per-event fallback recovered %d calendar values for %s from %s to %s; failed event IDs: %d",
      total,
      currency,
      TimeToString(range_from, TIME_DATE|TIME_MINUTES),
      TimeToString(range_to, TIME_DATE|TIME_MINUTES),
      ArraySize(failed_event_ids)
   );
   return(true);
  }

bool ResolveDefinition(
   const ulong event_id,
   MqlCalendarEvent &event,
   MqlCalendarCountry &country
)
  {
   int cached = ArraySize(CachedDefinitions);
   for(int i = 0; i < cached; i++)
     {
      if(CachedDefinitions[i].event_id == event_id)
        {
         event = CachedDefinitions[i].event;
         country = CachedDefinitions[i].country;
         return(true);
        }
     }

   ResetLastError();
   if(!CalendarEventById(event_id, event))
     {
      PrintFormat("CalendarEventById failed for %I64u. Error: %d", event_id, GetLastError());
      return(false);
     }

   ResetLastError();
   if(!CalendarCountryById((long)event.country_id, country))
     {
      PrintFormat(
         "CalendarCountryById failed for %I64u. Error: %d",
         event.country_id,
         GetLastError()
      );
      return(false);
     }

   int next = cached + 1;
   if(ArrayResize(CachedDefinitions, next) != next)
     {
      Print("Could not allocate economic calendar definition cache");
      return(false);
     }

   CachedDefinitions[cached].event_id = event_id;
   CachedDefinitions[cached].event = event;
   CachedDefinitions[cached].country = country;
   return(true);
  }

string BuildPayload(
   const string currency,
   const EconomicCalendarRecord &records[],
   const int start,
   const int count
)
  {
   string items = "";
   for(int i = start; i < start + count; i++)
     {
      MqlCalendarValue value = records[i].value;
      MqlCalendarEvent event = records[i].event;
      MqlCalendarCountry country = records[i].country;
      string item = StringFormat(
         "{\"valueId\":\"%I64u\",\"eventId\":\"%I64u\","
         "\"countryId\":\"%I64u\",\"eventTime\":%I64d,\"periodTime\":%I64d,"
         "\"revision\":%d,\"actualValue\":%s,\"previousValue\":%s,"
         "\"revisedPreviousValue\":%s,\"forecastValue\":%s,\"impactType\":%d,"
         "\"countryCode\":\"%s\",\"countryName\":\"%s\",\"eventType\":%d,"
         "\"sector\":%d,\"frequency\":%d,\"timeMode\":%d,\"unit\":%d,"
         "\"importance\":%d,\"multiplier\":%d,\"digits\":%d,"
         "\"sourceUrl\":\"%s\",\"eventCode\":\"%s\",\"name\":\"%s\"}",
         value.id,
         value.event_id,
         country.id,
         (long)value.time,
         (long)value.period,
         value.revision,
         JsonNullableValue(value.actual_value),
         JsonNullableValue(value.prev_value),
         JsonNullableValue(value.revised_prev_value),
         JsonNullableValue(value.forecast_value),
         (int)value.impact_type,
         JsonEscape(country.code),
         JsonEscape(country.name),
         (int)event.type,
         (int)event.sector,
         (int)event.frequency,
         (int)event.time_mode,
         (int)event.unit,
         (int)event.importance,
         (int)event.multiplier,
         (int)event.digits,
         JsonEscape(event.source_url),
         JsonEscape(event.event_code),
         JsonEscape(event.name)
      );

      if(i > start)
         items += ",";
      items += item;
     }

   return StringFormat(
      "{\"source\":\"MetaQuotes-Calendar\",\"server\":\"%s\","
      "\"currency\":\"%s\",\"generatedAt\":%I64d,\"events\":[%s]}",
      JsonEscape(AccountInfoString(ACCOUNT_SERVER)),
      JsonEscape(currency),
      (long)TimeTradeServer(),
      items
   );
  }

string JsonNullableValue(const long raw_value)
  {
   if(raw_value == LONG_MIN)
      return("null");
   return(DoubleToString((double)raw_value / 1000000.0, 10));
  }

bool SendPayload(
   const string payload,
   const string currency,
   const int offset,
   const int count
)
  {
   uchar utf8[];
   int copied = StringToCharArray(payload, utf8, 0, WHOLE_ARRAY, CP_UTF8);
   if(copied <= 1)
     {
      Print("Could not encode economic calendar payload as UTF-8");
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
      20000,
      body,
      response,
      response_headers
   );

   if(status == -1)
     {
      PrintFormat(
         "WebRequest failed for %s at release offset %d. Error: %d",
         currency,
         offset,
         GetLastError()
      );
      return(false);
     }

   if(status < 200 || status >= 300)
     {
      PrintFormat(
         "Backend rejected %s releases %d-%d with HTTP %d",
         currency,
         offset + 1,
         offset + count,
         status
      );
      return(false);
     }

   PrintFormat(
      "Accepted %s economic releases %d-%d with HTTP %d",
      currency,
      offset + 1,
      offset + count,
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
