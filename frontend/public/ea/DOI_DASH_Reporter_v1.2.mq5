//+------------------------------------------------------------------+
//|                                          OnlyFunds_Reporter.mq5   |
//|                         OnlyFunds MT5 Dashboard Reporter EA       |
//|                                                                  |
//| v1.2                                                             |
//|   • Accept all closing deal entry types: DEAL_ENTRY_OUT,         |
//|     DEAL_ENTRY_OUT_BY (close-by), DEAL_ENTRY_INOUT (netting      |
//|     reversal). Earlier versions only handled OUT, which silently  |
//|     dropped trades on netting accounts or close-by closures.     |
//|   • Robust iteration: gather closing deal tickets first, then    |
//|     resolve each one. Prevents HistorySelectByPosition() inside  |
//|     the outer loop from shifting the deal index.                 |
//|   • Print a one-line per push summary so it's obvious in the     |
//|     Experts tab how many deals are being sent.                   |
//|                                                                  |
//| v1.1                                                             |
//|   • Push today's closed deals + brokerTimeOffset.                |
//|   • profit field uses ACCOUNT_PROFIT (was equity-balance).       |
//+------------------------------------------------------------------+
#property copyright "OnlyFunds"
#property version   "1.2"
#property description "Sends trading data + closed-deal history to OnlyFunds Dashboard"

//--- Input Parameters
input string   ApiKey         = "";           // API Key * (get from Dashboard → Accounts)
input string   ServerURL      = "https://doi-dash-production.up.railway.app"; // Server URL
input int      UpdateInterval = 2;            // Update interval (seconds)

//--- Globals
datetime g_lastSend       = 0;
bool     g_initDone       = false;
datetime g_lastDealTime   = 0;   // Highest DEAL_TIME we've already pushed
int      g_backfillCount  = 0;   // Counter for early pushes that resend today's full history

#define BACKFILL_PUSHES 5        // First N pushes after EA start: send all of today's deals

//+------------------------------------------------------------------+
int OnInit()
{
   if(ApiKey == "")
   {
      Alert("OnlyFunds: กรุณาตั้งค่า API Key ก่อนใช้งาน");
      return INIT_PARAMETERS_INCORRECT;
   }

   g_lastDealTime = BrokerMidnight();

   EventSetTimer(1);
   Print("OnlyFunds Reporter v1.2 started | Account: ", AccountInfoInteger(ACCOUNT_LOGIN));
   Print("  Server: ", ServerURL);
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("OnlyFunds Reporter stopped.");
}

//+------------------------------------------------------------------+
void OnTimer()
{
   if(TimeCurrent() - g_lastSend < UpdateInterval) return;
   g_lastSend = TimeCurrent();
   SendData();
}

//+------------------------------------------------------------------+
//  Helpers
//+------------------------------------------------------------------+
string EscapeJson(string text)
{
   StringReplace(text, "\\", "\\\\");
   StringReplace(text, "\"", "\\\"");
   StringReplace(text, "\n", "\\n");
   StringReplace(text, "\r", "\\r");
   return text;
}

// Broker-local midnight (today 00:00:00 in broker server time)
datetime BrokerMidnight()
{
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   dt.hour = 0; dt.min = 0; dt.sec = 0;
   return StructToTime(dt);
}

// Difference between broker time and UTC in seconds (e.g. GMT+2 → 7200)
long BrokerTimeOffsetSec()
{
   return (long)(TimeCurrent() - TimeGMT());
}

// Is this deal entry one of the closing types?
bool IsClosingEntry(long entry)
{
   return entry == DEAL_ENTRY_OUT
       || entry == DEAL_ENTRY_OUT_BY
       || entry == DEAL_ENTRY_INOUT;
}

//+------------------------------------------------------------------+
//  Build closedDeals JSON for today.
//   - Backfill mode (first BACKFILL_PUSHES pushes): every closed deal
//     since broker midnight.
//   - Steady mode: only deals newer than g_lastDealTime.
//
//  Robust pattern: gather all closing deal tickets + their basic data
//  in pass 1 (one HistorySelect, no nested re-selects), then resolve
//  each position's entry deal in pass 2.
//+------------------------------------------------------------------+
string BuildClosedDealsJson()
{
   bool     isBackfill     = g_backfillCount < BACKFILL_PUSHES;
   datetime brokerMidnight = BrokerMidnight();
   datetime fromTime       = isBackfill ? brokerMidnight : (datetime)(g_lastDealTime - 5);
   datetime toTime         = TimeCurrent();

   if(!HistorySelect(fromTime, toTime)) return "[]";

   //--- Pass 1: collect closing deals into local arrays ----------------
   ulong    out_ticket[];
   long     out_posId[];
   string   out_sym[];
   double   out_lots[];
   double   out_closePrice[];
   double   out_profit[];
   double   out_swap[];
   double   out_commission[];
   datetime out_time[];

   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;

      long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if(!IsClosingEntry(entry)) continue;

      datetime dealTime = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);

      if(isBackfill) {
         if(dealTime < brokerMidnight) continue;
      } else {
         if(dealTime <= g_lastDealTime) continue;
      }

      int n = ArraySize(out_ticket);
      ArrayResize(out_ticket,     n + 1);
      ArrayResize(out_posId,      n + 1);
      ArrayResize(out_sym,        n + 1);
      ArrayResize(out_lots,       n + 1);
      ArrayResize(out_closePrice, n + 1);
      ArrayResize(out_profit,     n + 1);
      ArrayResize(out_swap,       n + 1);
      ArrayResize(out_commission, n + 1);
      ArrayResize(out_time,       n + 1);

      out_ticket[n]     = ticket;
      out_posId[n]      = (long)HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
      out_sym[n]        = HistoryDealGetString(ticket, DEAL_SYMBOL);
      out_lots[n]       = HistoryDealGetDouble(ticket, DEAL_VOLUME);
      out_closePrice[n] = HistoryDealGetDouble(ticket, DEAL_PRICE);
      out_profit[n]     = HistoryDealGetDouble(ticket, DEAL_PROFIT);
      out_swap[n]       = HistoryDealGetDouble(ticket, DEAL_SWAP);
      out_commission[n] = HistoryDealGetDouble(ticket, DEAL_COMMISSION);
      out_time[n]       = dealTime;
   }

   //--- Pass 2: resolve each position's entry deal --------------------
   string  json    = "[";
   int     count   = ArraySize(out_ticket);
   datetime maxSeen = g_lastDealTime;

   for(int i = 0; i < count; i++)
   {
      long     positionId = out_posId[i];
      double   openPrice  = 0;
      datetime openTime   = 0;
      double   entryComm  = 0;
      int      posType    = 0;

      if(HistorySelectByPosition(positionId)) {
         int n = HistoryDealsTotal();
         for(int d = 0; d < n; d++) {
            ulong dt = HistoryDealGetTicket(d);
            if(dt == 0) continue;
            long entry = HistoryDealGetInteger(dt, DEAL_ENTRY);
            if(entry != DEAL_ENTRY_IN) continue;

            openPrice   = HistoryDealGetDouble(dt, DEAL_PRICE);
            openTime    = (datetime)HistoryDealGetInteger(dt, DEAL_TIME);
            entryComm  += HistoryDealGetDouble(dt, DEAL_COMMISSION);
            long entryT = HistoryDealGetInteger(dt, DEAL_TYPE);
            posType     = (entryT == DEAL_TYPE_BUY) ? 0 : 1;
         }
      }

      double totalCommission = entryComm + out_commission[i];

      if(i > 0) json += ",";
      json += StringFormat(
         "{\"positionId\":%d,\"ticket\":%d,\"symbol\":\"%s\",\"type\":%d,"
         "\"lots\":%.2f,\"openPrice\":%.5f,\"closePrice\":%.5f,"
         "\"profit\":%.2f,\"swap\":%.2f,\"commission\":%.2f,"
         "\"openTime\":\"%s\",\"closeTime\":\"%s\"}",
         (int)positionId, (int)out_ticket[i], EscapeJson(out_sym[i]), posType,
         out_lots[i], openPrice, out_closePrice[i],
         out_profit[i], out_swap[i], totalCommission,
         TimeToString(openTime,     TIME_DATE|TIME_SECONDS),
         TimeToString(out_time[i],  TIME_DATE|TIME_SECONDS)
      );

      if(out_time[i] > maxSeen) maxSeen = out_time[i];
   }

   if(maxSeen > g_lastDealTime) g_lastDealTime = maxSeen;
   if(isBackfill) g_backfillCount++;

   json += "]";

   // Visibility: log how many deals we're sending each push.
   if(count > 0 || isBackfill) {
      Print("[OnlyFunds] Pushing ", count, " closed deal(s)",
            isBackfill ? " (backfill " + IntegerToString(g_backfillCount) + "/" + IntegerToString(BACKFILL_PUSHES) + ")" : "");
   }

   return json;
}

//+------------------------------------------------------------------+
void SendData()
{
   //--- Account Info
   long   acct_num    = AccountInfoInteger(ACCOUNT_LOGIN);
   string broker      = AccountInfoString(ACCOUNT_COMPANY);
   string server      = AccountInfoString(ACCOUNT_SERVER);
   string currency    = AccountInfoString(ACCOUNT_CURRENCY);
   long   leverage    = AccountInfoInteger(ACCOUNT_LEVERAGE);
   double balance     = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity      = AccountInfoDouble(ACCOUNT_EQUITY);
   double margin      = AccountInfoDouble(ACCOUNT_MARGIN);
   double freeMargin  = AccountInfoDouble(ACCOUNT_FREEMARGIN);
   // Floating P/L of open positions. ACCOUNT_PROFIT is the safe value —
   // the older `equity - balance` formula incorrectly includes credit bonus.
   double profit      = AccountInfoDouble(ACCOUNT_PROFIT);
   double marginLevel = 0;
   if(margin > 0)
      marginLevel = AccountInfoDouble(ACCOUNT_MARGIN_LEVEL);

   long   brokerOffsetSec = BrokerTimeOffsetSec();

   //--- Open Positions (numeric type: 0=BUY, 1=SELL)
   string orders_json = "";
   for(int i = 0; i < PositionsTotal(); i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;

      int      ptype      = (int)PositionGetInteger(POSITION_TYPE);
      string   sym        = PositionGetString(POSITION_SYMBOL);
      double   lots       = PositionGetDouble(POSITION_VOLUME);
      double   open_price = PositionGetDouble(POSITION_PRICE_OPEN);
      double   cur_price  = PositionGetDouble(POSITION_PRICE_CURRENT);
      double   sl         = PositionGetDouble(POSITION_SL);
      double   tp         = PositionGetDouble(POSITION_TP);
      double   swap       = PositionGetDouble(POSITION_SWAP);
      double   pos_profit = PositionGetDouble(POSITION_PROFIT);
      datetime open_time  = (datetime)PositionGetInteger(POSITION_TIME);

      if(orders_json != "") orders_json += ",";
      orders_json += StringFormat(
         "{\"ticket\":%d,\"symbol\":\"%s\",\"type\":%d,"
         "\"lots\":%.2f,\"openPrice\":%.5f,\"currentPrice\":%.5f,"
         "\"sl\":%.5f,\"tp\":%.5f,"
         "\"swap\":%.2f,\"commission\":0,\"profit\":%.2f,"
         "\"openTime\":\"%s\"}",
         (int)ticket, EscapeJson(sym), ptype,
         lots, open_price, cur_price,
         sl, tp, swap, pos_profit,
         TimeToString(open_time, TIME_DATE|TIME_SECONDS)
      );
   }

   //--- Pending Orders (type: 2=BUY_LIMIT, 3=SELL_LIMIT, 4=BUY_STOP, 5=SELL_STOP)
   string pending_json = "";
   for(int i = 0; i < OrdersTotal(); i++)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0) continue;

      int      otype  = (int)OrderGetInteger(ORDER_TYPE);
      string   sym    = OrderGetString(ORDER_SYMBOL);
      double   lots   = OrderGetDouble(ORDER_VOLUME_CURRENT);
      double   price  = OrderGetDouble(ORDER_PRICE_OPEN);
      double   sl     = OrderGetDouble(ORDER_SL);
      double   tp     = OrderGetDouble(ORDER_TP);
      datetime expiry = (datetime)OrderGetInteger(ORDER_TIME_EXPIRATION);

      if(pending_json != "") pending_json += ",";
      pending_json += StringFormat(
         "{\"ticket\":%d,\"symbol\":\"%s\",\"type\":%d,"
         "\"lots\":%.2f,\"openPrice\":%.5f,"
         "\"sl\":%.5f,\"tp\":%.5f,\"expiration\":\"%s\"}",
         (int)ticket, EscapeJson(sym), otype,
         lots, price, sl, tp,
         expiry > 0 ? TimeToString(expiry, TIME_DATE|TIME_SECONDS) : ""
      );
   }

   //--- Today's closed deals
   string closed_deals_json = BuildClosedDealsJson();

   //--- Build JSON (camelCase — matches backend MT5PushPayload)
   string json = StringFormat(
      "{"
      "\"apiKey\":\"%s\","
      "\"accountNumber\":\"%d\","
      "\"broker\":\"%s\","
      "\"server\":\"%s\","
      "\"currency\":\"%s\","
      "\"leverage\":%d,"
      "\"balance\":%.2f,"
      "\"equity\":%.2f,"
      "\"margin\":%.2f,"
      "\"freeMargin\":%.2f,"
      "\"marginLevel\":%.2f,"
      "\"profit\":%.2f,"
      "\"brokerTimeOffset\":%d,"
      "\"orders\":[%s],"
      "\"pending\":[%s],"
      "\"closedDeals\":%s"
      "}",
      ApiKey,
      acct_num, EscapeJson(broker), EscapeJson(server), currency, (int)leverage,
      balance, equity, margin, freeMargin, marginLevel, profit,
      (int)brokerOffsetSec,
      orders_json, pending_json, closed_deals_json
   );

   //--- Send to /api/mt5/push with Content-Type header
   string url     = ServerURL + "/api/mt5/push";
   string headers = "Content-Type: application/json\r\n";
   char   post[], result[];
   string result_headers;
   StringToCharArray(json, post, 0, StringLen(json));

   int res = WebRequest("POST", url, headers, 5000, post, result, result_headers);

   if(res == 200)
   {
      if(!g_initDone)
      {
         Print("✓ OnlyFunds: Connected! Account online (v1.2, broker offset ", (int)brokerOffsetSec, "s)");
         g_initDone = true;
      }
   }
   else if(res == 404)
      Print("✗ OnlyFunds: Account not found — เพิ่ม account ใน Dashboard ก่อน (API Key: ", ApiKey, ")");
   else if(res == 400)
      Print("✗ OnlyFunds: Bad request — ตรวจสอบ API Key");
   else if(res == -1)
   {
      Print("✗ OnlyFunds: ไม่สามารถเชื่อมต่อได้ — เพิ่ม URL ใน MT5 WebRequest whitelist:");
      Print("  Tools → Options → Expert Advisors → Allow WebRequest for listed URL");
      Print("  URL: ", ServerURL);
   }
   else
      Print("✗ OnlyFunds: HTTP error ", res);
}
//+------------------------------------------------------------------+
