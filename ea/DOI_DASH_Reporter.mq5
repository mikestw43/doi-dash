//+------------------------------------------------------------------+
//|                                          DOI_DASH_Reporter.mq5   |
//|                         DOI DASH MT5 Dashboard Reporter EA       |
//+------------------------------------------------------------------+
#property copyright "DOI DASH"
#property version   "1.0"
#property description "Sends trading data to DOI DASH Dashboard"

//--- Input Parameters
input string   ApiKey         = "";           // API Key * (get from Dashboard → Accounts)
input string   ServerURL      = "https://doi-dash-production.up.railway.app"; // Server URL
input int      UpdateInterval = 2;            // Update interval (seconds)

//--- Global
datetime g_lastSend = 0;
bool     g_initDone = false;

//+------------------------------------------------------------------+
int OnInit()
{
   if(ApiKey == "")
   {
      Alert("DOI DASH: กรุณาตั้งค่า API Key ก่อนใช้งาน");
      return INIT_PARAMETERS_INCORRECT;
   }
   EventSetTimer(1);
   Print("DOI DASH Reporter v1.0 started | Account: ", AccountInfoInteger(ACCOUNT_LOGIN));
   Print("  Server: ", ServerURL);
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("DOI DASH Reporter stopped.");
}

//+------------------------------------------------------------------+
void OnTimer()
{
   if(TimeCurrent() - g_lastSend < UpdateInterval) return;
   g_lastSend = TimeCurrent();
   SendData();
}

//+------------------------------------------------------------------+
string EscapeJson(string text)
{
   StringReplace(text, "\\", "\\\\");
   StringReplace(text, "\"", "\\\"");
   return text;
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
   double profit      = equity - balance;
   double marginLevel = 0;
   if(margin > 0)
      marginLevel = AccountInfoDouble(ACCOUNT_MARGIN_LEVEL);

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
      "\"orders\":[%s],"
      "\"pending\":[%s]"
      "}",
      ApiKey,
      acct_num, EscapeJson(broker), EscapeJson(server), currency, (int)leverage,
      balance, equity, margin, freeMargin, marginLevel, profit,
      orders_json, pending_json
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
         Print("✓ DOI DASH: Connected! Account online.");
         g_initDone = true;
      }
   }
   else if(res == 404)
      Print("✗ DOI DASH: Account not found — เพิ่ม account ใน Dashboard ก่อน (API Key: ", ApiKey, ")");
   else if(res == 400)
      Print("✗ DOI DASH: Bad request — ตรวจสอบ API Key");
   else if(res == -1)
   {
      Print("✗ DOI DASH: ไม่สามารถเชื่อมต่อได้ — เพิ่ม URL ใน MT5 WebRequest whitelist:");
      Print("  Tools → Options → Expert Advisors → Allow WebRequest for listed URL");
      Print("  URL: ", ServerURL);
   }
   else
      Print("✗ DOI DASH: HTTP error ", res);
}
//+------------------------------------------------------------------+
