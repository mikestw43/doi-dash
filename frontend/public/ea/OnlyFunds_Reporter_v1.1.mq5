//+------------------------------------------------------------------+
//|                                      OnlyFunds_Reporter_v1.1.mq5 |
//|                         OnlyFunds MT5 Dashboard Reporter EA      |
//|                                                                  |
//| v1.1 — all clock reads moved from TimeCurrent() to the terminal's|
//|        server clock. See ServerNow() below: with the market shut |
//|        TimeCurrent() stops moving, which silently stopped the    |
//|        EA from pushing and skewed the broker offset by ~40h.     |
//|                                                                  |
//| v1.0 — first release under the OnlyFunds name. Numbering starts  |
//|        over here; the reporter logic is the one that shipped as  |
//|        v1.3 of the previous EA:                                  |
//|                                                                  |
//|   • today_pl is computed on the EA side and sent as one trusted  |
//|     number, so the backend never reconstructs TODAY P/L from     |
//|     stored deals — that used to miss trades closed while the EA  |
//|     was offline. Matches MT5 history exactly.                    |
//|   • Only BUY/SELL deals count toward today_pl; BALANCE, CREDIT   |
//|     and BONUS operations are excluded so they cannot inflate it. |
//|   • Floating P/L = equity - balance - credit, subtracting credit |
//|     explicitly so promotional bonuses don't leak through.        |
//|   • Pushes closedDeals[] for the trade-history page, plus        |
//|     brokerTimeOffset.                                            |
//+------------------------------------------------------------------+
#property copyright "OnlyFunds"
#property version   "1.1"
#property description "Sends trading data + EA-computed today_pl to OnlyFunds Dashboard"

//--- Input Parameters
input string   ApiKey         = "";           // API Key * (get from Dashboard → Accounts)
input string   ServerURL      = "https://onlyfunds.duckdns.org"; // Server URL
input int      UpdateInterval = 2;            // Update interval (seconds)

//--- Globals
datetime g_lastSend       = 0;
bool     g_initDone       = false;
datetime g_lastDealTime   = 0;   // Watermark for closedDeals push
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
   if(ServerNow() - g_lastSend < UpdateInterval) return;
   g_lastSend = ServerNow();
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

//+------------------------------------------------------------------+
//  Current server time.
//
//  TimeCurrent() is the timestamp of the LAST TICK, so it freezes solid
//  whenever the market is closed — over a weekend it can sit ~40 hours
//  behind. That broke two things at once: the send throttle below never
//  saw time move, so the EA pushed once and then went quiet (the
//  dashboard marked the account offline after 30s), and the broker
//  offset came out as nonsense like -142329s.
//
//  TimeTradeServer() is the terminal's own running clock for the server,
//  so it keeps ticking with no quotes. Fall back to TimeCurrent() on the
//  rare startup where the terminal has not resolved the offset yet.
//+------------------------------------------------------------------+
datetime ServerNow()
{
   datetime t = TimeTradeServer();
   return (t > 0) ? t : TimeCurrent();
}

datetime BrokerMidnight()
{
   return StringToTime(TimeToString(ServerNow(), TIME_DATE) + " 00:00:00");
}

long BrokerTimeOffsetSec()
{
   return (long)(ServerNow() - TimeGMT());
}

bool IsClosingEntry(long entry)
{
   return entry == DEAL_ENTRY_OUT
       || entry == DEAL_ENTRY_OUT_BY
       || entry == DEAL_ENTRY_INOUT;
}

//+------------------------------------------------------------------+
//  Compute today's net P/L directly from MT5 deal history.
//  Returns the same number MT5's "History" view shows under "Profit"
//  for today's deals (excluding balance/credit/bonus operations).
//+------------------------------------------------------------------+
double ComputeTodayPl(int &closedCount)
{
   closedCount = 0;
   double todayPl = 0;

   datetime todayStart = BrokerMidnight();
   if(!HistorySelect(todayStart, ServerNow() + 1)) return 0;

   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;

      long dealType  = HistoryDealGetInteger(ticket, DEAL_TYPE);
      long dealEntry = HistoryDealGetInteger(ticket, DEAL_ENTRY);

      // Trading-only deals (skip BALANCE, CREDIT, BONUS, INTEREST, etc.)
      if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL) continue;

      // Only closing entries contribute realized P/L
      if(!IsClosingEntry(dealEntry)) continue;

      todayPl += HistoryDealGetDouble(ticket, DEAL_PROFIT)
              +  HistoryDealGetDouble(ticket, DEAL_SWAP)
              +  HistoryDealGetDouble(ticket, DEAL_COMMISSION);
      closedCount++;
   }

   return todayPl;
}

//+------------------------------------------------------------------+
//  Build closedDeals JSON for the trade-history page (separate from
//  today_pl, which is the authoritative number for "TODAY" display).
//  Uses the same robust two-pass pattern as v1.2.
//+------------------------------------------------------------------+
string BuildClosedDealsJson()
{
   bool     isBackfill     = g_backfillCount < BACKFILL_PUSHES;
   datetime brokerMidnight = BrokerMidnight();
   datetime fromTime       = isBackfill ? brokerMidnight : (datetime)(g_lastDealTime - 5);
   datetime toTime         = ServerNow();

   if(!HistorySelect(fromTime, toTime)) return "[]";

   // Pass 1: collect closing deals
   ulong    a_ticket[];
   long     a_posId[];
   string   a_sym[];
   double   a_lots[], a_closePrice[], a_profit[], a_swap[], a_commission[];
   datetime a_time[];

   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;

      long dealType  = HistoryDealGetInteger(ticket, DEAL_TYPE);
      long dealEntry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL) continue;
      if(!IsClosingEntry(dealEntry)) continue;

      datetime dealTime = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
      if(isBackfill) {
         if(dealTime < brokerMidnight) continue;
      } else {
         if(dealTime <= g_lastDealTime) continue;
      }

      int n = ArraySize(a_ticket);
      ArrayResize(a_ticket,     n + 1);
      ArrayResize(a_posId,      n + 1);
      ArrayResize(a_sym,        n + 1);
      ArrayResize(a_lots,       n + 1);
      ArrayResize(a_closePrice, n + 1);
      ArrayResize(a_profit,     n + 1);
      ArrayResize(a_swap,       n + 1);
      ArrayResize(a_commission, n + 1);
      ArrayResize(a_time,       n + 1);

      a_ticket[n]     = ticket;
      a_posId[n]      = (long)HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
      a_sym[n]        = HistoryDealGetString(ticket, DEAL_SYMBOL);
      a_lots[n]       = HistoryDealGetDouble(ticket, DEAL_VOLUME);
      a_closePrice[n] = HistoryDealGetDouble(ticket, DEAL_PRICE);
      a_profit[n]     = HistoryDealGetDouble(ticket, DEAL_PROFIT);
      a_swap[n]       = HistoryDealGetDouble(ticket, DEAL_SWAP);
      a_commission[n] = HistoryDealGetDouble(ticket, DEAL_COMMISSION);
      a_time[n]       = dealTime;
   }

   // Pass 2: resolve each position's entry deal
   string  json    = "[";
   int     count   = ArraySize(a_ticket);
   datetime maxSeen = g_lastDealTime;

   for(int i = 0; i < count; i++)
   {
      long     positionId = a_posId[i];
      double   openPrice  = 0;
      datetime openTime   = 0;
      double   entryComm  = 0;
      int      posType    = 0;

      if(HistorySelectByPosition(positionId)) {
         int n = HistoryDealsTotal();
         for(int d = 0; d < n; d++) {
            ulong dt = HistoryDealGetTicket(d);
            if(dt == 0) continue;
            if(HistoryDealGetInteger(dt, DEAL_ENTRY) != DEAL_ENTRY_IN) continue;

            openPrice  = HistoryDealGetDouble(dt, DEAL_PRICE);
            openTime   = (datetime)HistoryDealGetInteger(dt, DEAL_TIME);
            entryComm += HistoryDealGetDouble(dt, DEAL_COMMISSION);
            posType    = (HistoryDealGetInteger(dt, DEAL_TYPE) == DEAL_TYPE_BUY) ? 0 : 1;
         }
      }

      double totalCommission = entryComm + a_commission[i];

      if(i > 0) json += ",";
      json += StringFormat(
         "{\"positionId\":%d,\"ticket\":%d,\"symbol\":\"%s\",\"type\":%d,"
         "\"lots\":%.2f,\"openPrice\":%.5f,\"closePrice\":%.5f,"
         "\"profit\":%.2f,\"swap\":%.2f,\"commission\":%.2f,"
         "\"openTime\":\"%s\",\"closeTime\":\"%s\"}",
         (int)positionId, (int)a_ticket[i], EscapeJson(a_sym[i]), posType,
         a_lots[i], openPrice, a_closePrice[i],
         a_profit[i], a_swap[i], totalCommission,
         TimeToString(openTime,    TIME_DATE|TIME_SECONDS),
         TimeToString(a_time[i],   TIME_DATE|TIME_SECONDS)
      );

      if(a_time[i] > maxSeen) maxSeen = a_time[i];
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
   double credit      = AccountInfoDouble(ACCOUNT_CREDIT);
   // Floating P/L of open positions only — explicitly subtract credit so
   // promotional bonuses don't leak through.
   double profit      = equity - balance - credit;
   double marginLevel = 0;
   if(margin > 0)
      marginLevel = AccountInfoDouble(ACCOUNT_MARGIN_LEVEL);

   long   brokerOffsetSec = BrokerTimeOffsetSec();

   //--- Today's realized P/L (computed here, single trusted number)
   int    closedToday = 0;
   double todayPl     = ComputeTodayPl(closedToday);

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

   //--- Pending Orders
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

   //--- Today's closed deals (for trade-history archival)
   string closed_deals_json = BuildClosedDealsJson();

   //--- Build JSON
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
      "\"closedDeals\":%s"
      "}",
      ApiKey,
      acct_num, EscapeJson(broker), EscapeJson(server), currency, (int)leverage,
      balance, equity, margin, freeMargin, marginLevel, profit,
      todayPl, closedToday,
      (int)brokerOffsetSec,
      orders_json, pending_json, closed_deals_json
   );

   //--- Send to /api/mt5/push
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
         Print("✓ OnlyFunds: Connected! v1.1 | broker offset ", (int)brokerOffsetSec, "s | today P/L: ", DoubleToString(todayPl, 2), " (", closedToday, " deals)");
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
