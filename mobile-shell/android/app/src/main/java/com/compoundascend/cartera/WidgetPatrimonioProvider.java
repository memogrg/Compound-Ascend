package com.compoundascend.cartera;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.Locale;

/**
 * Widget "Patrimonio neto" (RemoteViews, robusto para EMUI). Lee el snapshot de SharedPreferences
 * "cartera_widget"/"snapshot" y se repinta: monto grande (bitmap Space Mono), tendencia y fila
 * Ingresos·Gastos·Flujo. Sin snapshot, invita a abrir la app. El tap abre CARTERA+ en /m/patrimonio.
 * Los helpers de bitmap/formato son compartidos ({@link WidgetRender}).
 */
public class WidgetPatrimonioProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            renderWidget(context, manager, id);
        }
    }

    private static void renderWidget(Context context, AppWidgetManager manager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_patrimonio);

        final int ink = context.getColor(R.color.widget_text);
        final int muted = context.getColor(R.color.widget_muted);
        final int accent = context.getColor(R.color.widget_accent);
        final int danger = context.getColor(R.color.widget_danger);

        SharedPreferences prefs =
                context.getSharedPreferences(WidgetBridge.PREFS, Context.MODE_PRIVATE);
        String data = prefs.getString(WidgetBridge.KEY_SNAPSHOT, null);

        if (data == null) {
            renderEmpty(context, views, ink, muted, accent);
        } else {
            try {
                JSONObject o = new JSONObject(data);
                double neto = o.optDouble("patrimonioNeto", 0);
                String currency = o.optString("currency", "CRC");
                String symbol = WidgetRender.currencySymbol(currency);

                views.setImageViewBitmap(
                        R.id.iv_amount,
                        WidgetRender.amount(context, symbol, WidgetRender.formatNumber(neto), ink, muted));

                if (o.isNull("trendPct")) {
                    views.setTextViewText(R.id.tv_trend, "");
                } else {
                    double pct = o.optDouble("trendPct", 0);
                    boolean up = pct >= 0;
                    String pctStr = String.format(Locale.US, "%.1f", Math.abs(pct));
                    views.setTextViewText(R.id.tv_trend, (up ? "▲ " : "▼ ") + pctStr + "%");
                    views.setTextColor(R.id.tv_trend, up ? accent : danger);
                }

                if (!o.isNull("incomeMonthly") && !o.isNull("expenseMonthly")
                        && !o.isNull("freeCashflow")) {
                    double income = o.optDouble("incomeMonthly", 0);
                    double expense = o.optDouble("expenseMonthly", 0);
                    double flow = o.optDouble("freeCashflow", 0);
                    views.setTextViewText(R.id.tv_income, WidgetRender.compactMoney(income, symbol));
                    views.setTextViewText(R.id.tv_expense, WidgetRender.compactMoney(expense, symbol));
                    views.setTextViewText(R.id.tv_flow, WidgetRender.compactMoney(flow, symbol));
                    views.setTextColor(R.id.tv_income, accent);
                    views.setTextColor(R.id.tv_expense, danger);
                    views.setTextColor(R.id.tv_flow, flow >= 0 ? accent : danger);
                    views.setViewVisibility(R.id.flow_row, View.VISIBLE);
                } else {
                    views.setViewVisibility(R.id.flow_row, View.GONE);
                }

                String hhmm = WidgetRender.formatTime(o.optString("updatedAt", ""));
                views.setTextViewText(R.id.tv_updated, hhmm.isEmpty() ? "" : "Actualizado " + hhmm);
            } catch (Exception e) {
                renderEmpty(context, views, ink, muted, accent);
            }
        }

        Intent open = new Intent(context, MainActivity.class);
        open.putExtra("cartera.route", "/m/patrimonio");
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(
                context, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, pending);

        manager.updateAppWidget(appWidgetId, views);
    }

    /** Estado sin datos: monto "—" e invitación a abrir la app; oculta la fila de flujo. */
    private static void renderEmpty(Context context, RemoteViews views, int ink, int muted, int accent) {
        views.setImageViewBitmap(R.id.iv_amount, WidgetRender.amount(context, "", "—", ink, muted));
        views.setTextViewText(R.id.tv_trend, "Abre CARTERA+ para ver tu patrimonio");
        views.setTextColor(R.id.tv_trend, accent);
        views.setTextViewText(R.id.tv_updated, "");
        views.setViewVisibility(R.id.flow_row, View.GONE);
    }
}
