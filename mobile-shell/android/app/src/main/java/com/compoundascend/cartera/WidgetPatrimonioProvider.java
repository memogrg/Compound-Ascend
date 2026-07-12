package com.compoundascend.cartera;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Widget "Patrimonio neto" (RemoteViews, NO Glance/Compose). Lee el snapshot que la app
 * escribe en SharedPreferences "cartera_widget"/"snapshot" y se repinta. Sin snapshot,
 * invita a abrir la app. El tap abre CARTERA+ (extra opcional para navegar a /m/patrimonio).
 */
public class WidgetPatrimonioProvider extends AppWidgetProvider {

    private static final int GREEN = 0xFF378451;
    private static final int RED = 0xFFC0392B;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            renderWidget(context, manager, id);
        }
    }

    private static void renderWidget(Context context, AppWidgetManager manager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_patrimonio);

        SharedPreferences prefs =
                context.getSharedPreferences(WidgetBridge.PREFS, Context.MODE_PRIVATE);
        String data = prefs.getString(WidgetBridge.KEY_SNAPSHOT, null);

        if (data == null) {
            views.setTextViewText(R.id.tv_valor, "—");
            views.setTextViewText(R.id.tv_trend, "Abre CARTERA+ para ver tu patrimonio");
            views.setTextColor(R.id.tv_trend, GREEN);
            views.setTextViewText(R.id.tv_updated, "");
        } else {
            try {
                JSONObject o = new JSONObject(data);
                double neto = o.optDouble("patrimonioNeto", 0);
                String currency = o.optString("currency", "CRC");
                views.setTextViewText(R.id.tv_valor, formatMoney(neto, currency));

                if (o.isNull("trendPct")) {
                    views.setTextViewText(R.id.tv_trend, "");
                } else {
                    double pct = o.optDouble("trendPct", 0);
                    boolean up = pct >= 0;
                    String arrow = up ? "▲" : "▼";
                    String pctStr = String.format(Locale.US, "%.1f", Math.abs(pct));
                    views.setTextViewText(R.id.tv_trend, arrow + " " + pctStr + "% vs mes");
                    views.setTextColor(R.id.tv_trend, up ? GREEN : RED);
                }

                String updatedAt = o.optString("updatedAt", "");
                String hhmm = formatTime(updatedAt);
                views.setTextViewText(R.id.tv_updated, hhmm.isEmpty() ? "" : "Actualizado " + hhmm);
            } catch (Exception e) {
                views.setTextViewText(R.id.tv_valor, "—");
                views.setTextViewText(R.id.tv_trend, "Abre CARTERA+ para ver tu patrimonio");
                views.setTextColor(R.id.tv_trend, GREEN);
                views.setTextViewText(R.id.tv_updated, "");
            }
        }

        // Tap → abre la app. Extra opcional para que la app navegue a /m/patrimonio (futuro).
        Intent open = new Intent(context, MainActivity.class);
        open.putExtra("cartera.route", "/m/patrimonio");
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(
                context,
                0,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, pending);

        manager.updateAppWidget(appWidgetId, views);
    }

    /** ₡ para CRC, $ para USD (y algunos comunes) + separadores de miles, sin decimales. */
    private static String formatMoney(double value, String currency) {
        String symbol;
        switch (currency) {
            case "USD":
            case "MXN":
            case "COP":
                symbol = "$";
                break;
            case "EUR":
                symbol = "€";
                break;
            case "GBP":
                symbol = "£";
                break;
            default:
                symbol = "₡";
                break;
        }
        NumberFormat nf = NumberFormat.getIntegerInstance(new Locale("es", "CR"));
        return symbol + nf.format(Math.round(value));
    }

    /** ISO 8601 (UTC) → "HH:mm" en hora local del dispositivo. Vacío si no parsea. */
    private static String formatTime(String iso) {
        if (iso == null || iso.length() < 19) return "";
        try {
            SimpleDateFormat in = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
            in.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date d = in.parse(iso.substring(0, 19));
            SimpleDateFormat out = new SimpleDateFormat("HH:mm", Locale.getDefault());
            return d != null ? out.format(d) : "";
        } catch (Exception e) {
            return "";
        }
    }
}
