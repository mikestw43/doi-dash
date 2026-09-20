//+------------------------------------------------------------------+
//|                                          DOI_DASH_Reporter.mq4   |
//|                       OnlyFunds MT4 Dashboard Reporter EA         |
//|                                                                  |
//| v1.3 (MT4 port) — feature parity with MT5 v1.3                   |
//|   • Compute today_pl directly from MT4 history (closed orders   |
//|     for the broker's current day).                              |
//|   • Filter to trading-only orders (OP_BUY / OP_SELL) — skip      |
//|     balance/credit/bonus operations.                            |
//|   • Floating P/L = equity - balance - credit.                    |
//|   • Push closedDeals[] for the trade-history page.               |
//|   • Backend endpoint identical to MT5 (/api/mt5/push) so MT4 +   |
//|     MT5 accounts coexist in the same dashboard.                  |
//+------------------------------------------------------------------+
#property copyright "OnlyFunds"
#property version   "1.30"
#property strict
#property description "Sends MT4 trading data + EA-computed today_pl to OnlyFunds Dashboard"

//--- Input Parameters
extern string  ApiKey         = "";           // API Key * (get from Dashboard → Accounts)
extern string  ServerURL      = "https://onlyfunds.duckdns.org"; // Server URL
extern int     UpdateInterval = 2;            // Update interval (seconds)

//--- Globals
datetime g_lastSend       = 0;
bool     g_initDone       = false;
datetime g_lastDealTime   = 0;
int      g_backfillCount  = 0;

#define BACKFILL_PUSHES 5

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
   Print("OnlyFunds Reporter v1.3 (MT4) started | Account: ", AccountNumber());
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

datetime BrokerMidnight()
{
   return StringToTime(TimeToString(TimeCurrent(), TIME_DATE) + " 00:00:00");
}

long BrokerTimeOffsetSec()
{
   return (long)(TimeCurrent() - TimeGMT());
}

//+------------------------------------------------------------------+
//  Compute today's net P/L from MT4 history.
//  Iterates closed orders dated today; only BUY/SELL count.
//+------------------------------------------------------------------+
double ComputeTodayPl(int &closedCount)
{
   closedCount = 0;
   double todayPl = 0;

   datetime todayStart = BrokerMidnight();
   int total = OrdersHistoryTotal();

   for(int i = 0; i < total; i++)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_HISTORY)) continue;

      int type = OrderType();
      if(type != OP_BUY && type != OP_SELL) continue;            // Skip BALANCE / pending
      if(OrderCloseTime() < todayStart) continue;

      todayPl += OrderProfit() + OrderSwap() + OrderCommission();
      closedCount++;
   }

   return todayPl;
}

//+------------------------------------------------------------------+
//  Build closedDeals JSON for the trade-history page.
//+------------------------------------------------------------------+
string BuildClosedDealsJson()
{
   bool     isBackfill     = g_backfillCount < BACKFILL_PUSHES;
   datetime brokerMidnight = BrokerMidnight();

   string   json    = "[";
   bool     first   = true;
   datetime maxSeen = g_lastDealTime;
   int      total   = OrdersHistoryTotal();

   for(int i = 0; i < total; i++)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_HISTORY)) continue;

      int type = OrderType();
      if(type != OP_BUY && type != OP_SELL) continue;

      datetime closeTime = OrderCloseTime();
      if(isBackfill) {
         if(closeTime < brokerMidnight) continue;
      } else {
         if(closeTime <= g_lastDealTime) continue;
      }

      long ticket = OrderTicket();

      if(!first) json += ",";
      first = false;
      json += StringFormat(
         "{\"positionId\":%d,\"ticket\":%d,\"symbol\":\"%s\",\"type\":%d,"
         "\"lots\":%.2f,\"openPrice\":%.5f,\"closePrice\":%.5f,"
         "\"profit\":%.2f,\"swap\":%.2f,\"commission\":%.2f,"
         "\"openTime\":\"%s\",\"closeTime\":\"%s\"}",
         (int)ticket, (int)ticket, EscapeJson(OrderSymbol()), type,
         OrderLots(), OrderOpenPrice(), OrderClosePrice(),
         OrderProfit(), OrderSwap(), OrderCommission(),
         TimeToString(OrderOpenTime(), TIME_DATE|TIME_SECONDS),
         TimeToString(closeTime,       TIME_DATE|TIME_SECONDS)
      );

      if(closeTime > maxSeen) maxSeen = closeTime;
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
   long   acct_num    = AccountNumber();
   string broker      = AccountCompany();
   string server      = AccountServer();
   string currency    = AccountCurrency();
   long   leverage    = AccountLeverage();
   double balance     = AccountBalance();
   double equity      = AccountEquity();
   double margin      = AccountMargin();
   double freeMargin  = AccountFreeMargin();
   double credit      = AccountCredit();
   double profit      = equity - balance - credit;
   double marginLevel = (margin > 0) ? equity / margin * 100.0 : 0;

   long   brokerOffsetSec = BrokerTimeOffsetSec();

   //--- Today's realized P/L
   int    closedToday = 0;
   double todayPl     = ComputeTodayPl(closedToday);

   //--- Open Positions + Pending Orders (split by OrderType)
   string orders_json  = "";
   string pending_json = "";
   int total = OrdersTotal();
   for(int i = 0; i < total; i++)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;

      int      type      = OrderType();
      long     ticket    = OrderTicket();
      string   sym       = OrderSymbol();
      double   lots      = OrderLots();
      double   openPrice = OrderOpenPrice();
      double   sl        = OrderStopLoss();
      double   tp        = OrderTakeProfit();
      double   swap      = OrderSwap();
      double   comm      = OrderCommission();
      double   pProfit   = OrderProfit();
      double   curPrice  = OrderClosePrice();   // current market close for the position
      datetime openTime  = OrderOpenTime();
      datetime expiry    = OrderExpiration();

      if(type == OP_BUY || type == OP_SELL)
      {
         if(orders_json != "") orders_json += ",";
         orders_json += StringFormat(
            "{\"ticket\":%d,\"symbol\":\"%s\",\"type\":%d,"
            "\"lots\":%.2f,\"openPrice\":%.5f,\"currentPrice\":%.5f,"
            "\"sl\":%.5f,\"tp\":%.5f,"
            "\"swap\":%.2f,\"commission\":%.2f,\"profit\":%.2f,"
            "\"openTime\":\"%s\"}",
            (int)ticket, EscapeJson(sym), type,
            lots, openPrice, curPrice,
            sl, tp, swap, comm, pProfit,
            TimeToString(openTime, TIME_DATE|TIME_SECONDS)
         );
      }
      else
      {
         if(pending_json != "") pending_json += ",";
         pending_json += StringFormat(
            "{\"ticket\":%d,\"symbol\":\"%s\",\"type\":%d,"
            "\"lots\":%.2f,\"openPrice\":%.5f,"
            "\"sl\":%.5f,\"tp\":%.5f,\"expiration\":\"%s\"}",
            (int)ticket, EscapeJson(sym), type,
            lots, openPrice,
            sl, tp,
            expiry > 0 ? TimeToString(expiry, TIME_DATE|TIME_SECONDS) : ""
         );
      }
   }

   //--- Today's closed deals (for trade-history archival)
   string closed_deals_json = BuildClosedDealsJson();

   //--- Build JSON (adds "platform":"MT4" so backend/UI can distinguish MT4 vs MT5)
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
      "\"todayPnl\":%.2f,"
      "\"closedOrdersToday\":%d,"
      "\"brokerTimeOffset\":%d,"
      "\"orders\":[%s],"
      "\"pending\":[%s],"
      "\"closedDeals\":%s,"
      "\"platform\":\"MT4\""
      "}",
      ApiKey,
      acct_num, EscapeJson(broker), EscapeJson(server), currency, (int)leverage,
      balance, equity, margin, freeMargin, marginLevel, profit,
      todayPl, closedToday,
      (int)brokerOffsetSec,
      orders_json, pending_json, closed_deals_json
   );

   //--- Send to /api/mt5/push  (shared endpoint for MT4 + MT5)
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
         Print("✓ OnlyFunds: Connected! v1.3 (MT4) | broker offset ", (int)brokerOffsetSec, "s | today P/L: ", DoubleToString(todayPl, 2), " (", closedToday, " deals)");
         g_initDone = true;
      }
   }
   else if(res == 404)
      Print("✗ OnlyFunds: Account not found — เพิ่ม account ใน Dashboard ก่อน (API Key: ", ApiKey, ")");
   else if(res == 400)
      Print("✗ OnlyFunds: Bad request — ตรวจสอบ API Key");
   else if(res == -1)
   {
      Print("✗ OnlyFunds: ไม่สามารถเชื่อมต่อได้ — เพิ่ม URL ใน MT4 WebRequest whitelist:");
      Print("  Tools → Options → Expert Advisors → Allow WebRequest for listed URL");
      Print("  URL: ", ServerURL);
   }
   else
      Print("✗ OnlyFunds: HTTP error ", res);
}
//+------------------------------------------------------------------+
