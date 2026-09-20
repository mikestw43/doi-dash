//+------------------------------------------------------------------+
//|                                          OnlyFunds_Reporter.mq5   |
//|                         OnlyFunds MT5 Dashboard Reporter EA       |
//|                                                                  |
//| v1.1                                                             |
//|   • profit field now uses ACCOUNT_PROFIT (was equity-balance,    |
//|     which incorrectly included credit bonus).                    |
//|   • Pushes today's closed deals (positionId, profit, swap,       |
//|     commission, open/close prices + times) so the dashboard      |
//|     "TODAY P/L" is accurate even after EA restarts.              |
//|   • Reports brokerTimeOffset so the backend can match            |
//|     broker-local "today" to UTC correctly.                       |
//+------------------------------------------------------------------+
#property copyright "OnlyFunds"
#property version   "1.1"
#property description "Sends trading data + closed-deal history to OnlyFunds Dashboard"

//--- Input Parameters
input string   ApiKey         = "";           // API Key * (get from Dashboard → Accounts)
input string   ServerURL      = "https://onlyfunds.duckdns.org"; // Server URL
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

   // Initialize last-deal-time tracking to broker midnight, so the first push
   // backfills every closed deal from today.
   g_lastDealTime = BrokerMidnight();

   EventSetTimer(1);
   Print("OnlyFunds Reporter v1.1 started | Account: ", AccountInfoInteger(ACCOUNT_LOGIN));
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

// Difference between broker time and UTC in seconds (e.g. GMT+2 → 7200).
// Backend uses this to compute "today" in broker time correctly.
long BrokerTimeOffsetSec()
{
   return (long)(TimeCurrent() - TimeGMT());
}

// Resolve the opening details (open price, open time, commission, type) of a
// position from its history. Returns true if found.
bool FindEntryDeal(long positionId, double &openPrice, datetime &openTime,
                   double &entryCommission, int &posType)
{
   openPrice       = 0;
   openTime        = 0;
   entryCommission = 0;
   posType         = 0;

   if(!HistorySelectByPosition(positionId)) return false;

   int total = HistoryDealsTotal();
   for(int d = 0; d < total; d++)
   {
      ulong ticket = HistoryDealGetTicket(d);
      if(ticket == 0) continue;
      long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_IN) continue;

      openPrice        = HistoryDealGetDouble(ticket, DEAL_PRICE);
      openTime         = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
      entryCommission += HistoryDealGetDouble(ticket, DEAL_COMMISSION);
      long entryType   = HistoryDealGetInteger(ticket, DEAL_TYPE);
      posType          = (entryType == DEAL_TYPE_BUY) ? 0 : 1;
   }
   return openTime > 0;
}

//+------------------------------------------------------------------+
//  Build closedDeals JSON for today.
//   - Backfill mode (first BACKFILL_PUSHES pushes after start): always
//     include every closed deal since broker midnight.
//   - Steady mode: only deals newer than g_lastDealTime, so we don't
//     resend stuff the backend already stored.
//+------------------------------------------------------------------+
string BuildClosedDealsJson()
{
   bool     isBackfill     = g_backfillCount < BACKFILL_PUSHES;
   datetime brokerMidnight = BrokerMidnight();
   datetime fromTime       = isBackfill ? brokerMidnight : (datetime)(g_lastDealTime - 5);
   datetime toTime         = TimeCurrent();

   if(!HistorySelect(fromTime, toTime)) return "[]";

   string  json        = "[";
   int     count       = 0;
   datetime maxSeen    = g_lastDealTime;

   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;

      // Closing deals only — entry deals (DEAL_ENTRY_IN) are aggregated when
      // we resolve the position later.
      long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT) continue;

      datetime dealTime = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);

      if(isBackfill) {
         if(dealTime < brokerMidnight) continue;
      } else {
         if(dealTime <= g_lastDealTime) continue;
      }

      long   positionId  = (long)HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
      string sym         = HistoryDealGetString(ticket, DEAL_SYMBOL);
      double lots        = HistoryDealGetDouble(ticket, DEAL_VOLUME);
      double closePrice  = HistoryDealGetDouble(ticket, DEAL_PRICE);
      double dealProfit  = HistoryDealGetDouble(ticket, DEAL_PROFIT);
      double dealSwap    = HistoryDealGetDouble(ticket, DEAL_SWAP);
      double exitCommi   = HistoryDealGetDouble(ticket, DEAL_COMMISSION);

      // Look up the entry deal for openPrice / openTime / commission / side
      double   openPrice = 0;
      datetime openTime  = 0;
      double   entryComm = 0;
      int      posType   = 0;
      FindEntryDeal(positionId, openPrice, openTime, entryComm, posType);

      // FindEntryDeal calls HistorySelectByPosition which replaces the loop's
      // selection; restore it so the next iteration's HistoryDealGetTicket(i)
      // still references the time-range list we started with.
      HistorySelect(fromTime, toTime);

      double totalCommission = entryComm + exitCommi;

      if(count > 0) json += ",";
      json += StringFormat(
         "{\"positionId\":%d,\"ticket\":%d,\"symbol\":\"%s\",\"type\":%d,"
         "\"lots\":%.2f,\"openPrice\":%.5f,\"closePrice\":%.5f,"
         "\"profit\":%.2f,\"swap\":%.2f,\"commission\":%.2f,"
         "\"openTime\":\"%s\",\"closeTime\":\"%s\"}",
         (int)positionId, (int)ticket, EscapeJson(sym), posType,
         lots, openPrice, closePrice,
         dealProfit, dealSwap, totalCommission,
         TimeToString(openTime,  TIME_DATE|TIME_SECONDS),
         TimeToString(dealTime,  TIME_DATE|TIME_SECONDS)
      );
      count++;

      if(dealTime > maxSeen) maxSeen = dealTime;
   }

   if(maxSeen > g_lastDealTime) g_lastDealTime = maxSeen;
   if(isBackfill) g_backfillCount++;

   json += "]";
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
         Print("✓ OnlyFunds: Connected! Account online (v1.1, broker offset ", (int)brokerOffsetSec, "s)");
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
