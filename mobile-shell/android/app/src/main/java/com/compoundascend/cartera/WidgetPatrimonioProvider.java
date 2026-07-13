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

import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Widget "Patrimonio neto" PREMIUM (RemoteViews, NO Glance/Compose). Lee el snapshot que la app
 * escribe en SharedPreferences "cartera_widget"/"snapshot" y se repinta como la tarjeta hero de
 * /m: monto grande (símbolo + número), tendencia y fila Ingresos·Gastos·Flujo. Sin snapshot,
 * invita a abrir la app. El tap abre CARTERA+ (extra opcional para navegar a /m/patrimonio).
 * Los colores se resuelven por recurso (context.getColor) para respetar el modo claro/oscuro.
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

        // Colores del design system, sensibles a claro/oscuro (el context lleva el uiMode actual).
        final int accent = context.getColor(R.color.widget_accent);
        final int danger = context.getColor(R.color.widget_danger);

        SharedPreferences prefs =
                context.getSharedPreferences(WidgetBridge.PREFS, Context.MODE_PRIVATE);
        String data = prefs.getString(WidgetBridge.KEY_SNAPSHOT, null);

        if (data == null) {
            renderEmpty(views, accent);
        } else {
            try {
                JSONObject o = new JSONObject(data);
                double neto = o.optDouble("patrimonioNeto", 0);
                String currency = o.optString("currency", "CRC");
                String symbol = currencySymbol(currency);

                views.setTextViewText(R.id.tv_cur, symbol);
                views.setTextViewText(R.id.tv_valor, formatNumber(neto));

                // Tendencia (% vs mes). Oculta el texto si no hay base previa.
                if (o.isNull("trendPct")) {
                    views.setTextViewText(R.id.tv_trend, "");
                } else {
                    double pct = o.optDouble("trendPct", 0);
                    boolean up = pct >= 0;
                    String pctStr = String.format(Locale.US, "%.1f", Math.abs(pct));
                    views.setTextViewText(R.id.tv_trend, (up ? "▲ " : "▼ ") + pctStr + "%");
                    views.setTextColor(R.id.tv_trend, up ? accent : danger);
                }

                // Fila Ingresos·Gastos·Flujo: solo si el snapshot trae los tres (mismos valores
                // que el hero del dashboard). Si falta alguno, se mantiene oculta.
                if (!o.isNull("incomeMonthly") && !o.isNull("expenseMonthly")
                        && !o.isNull("freeCashflow")) {
                    double income = o.optDouble("incomeMonthly", 0);
                    double expense = o.optDouble("expenseMonthly", 0);
                    double flow = o.optDouble("freeCashflow", 0);
                    views.setTextViewText(R.id.tv_income, compactMoney(income, symbol));
                    views.setTextViewText(R.id.tv_expense, compactMoney(expense, symbol));
                    views.setTextViewText(R.id.tv_flow, compactMoney(flow, symbol));
                    views.setTextColor(R.id.tv_income, accent);
                    views.setTextColor(R.id.tv_expense, danger);
                    views.setTextColor(R.id.tv_flow, flow >= 0 ? accent : danger);
                    views.setViewVisibility(R.id.flow_row, View.VISIBLE);
                } else {
                    views.setViewVisibility(R.id.flow_row, View.GONE);
                }

                String hhmm = formatTime(o.optString("updatedAt", ""));
                views.setTextViewText(R.id.tv_updated, hhmm.isEmpty() ? "" : "Actualizado " + hhmm);
            } catch (Exception e) {
                renderEmpty(views, accent);
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

    /** Estado sin datos: invita a abrir la app y oculta lo que depende del snapshot. */
    private static void renderEmpty(RemoteViews views, int accent) {
        views.setTextViewText(R.id.tv_cur, "");
        views.setTextViewText(R.id.tv_valor, "—");
        views.setTextViewText(R.id.tv_trend, "Abre CARTERA+ para ver tu patrimonio");
        views.setTextColor(R.id.tv_trend, accent);
        views.setTextViewText(R.id.tv_updated, "");
        views.setViewVisibility(R.id.flow_row, View.GONE);
    }

    /** ₡ para CRC, $ para USD (y algunos comunes), €, £. */
    private static String currencySymbol(String currency) {
        switch (currency) {
            case "USD":
            case "MXN":
            case "COP":
                return "$";
            case "EUR":
                return "€";
            case "GBP":
                return "£";
            default:
                return "₡";
        }
    }

    /** Entero con separadores de miles (es-CR), sin decimales ni símbolo. */
    private static String formatNumber(double value) {
        NumberFormat nf = NumberFormat.getIntegerInstance(new Locale("es", "CR"));
        return nf.format(Math.round(value));
    }

    /** Monto compacto para la fila de flujo: ₡1.2M / ₡234k / ₡850, con signo. */
    private static String compactMoney(double value, String symbol) {
        double abs = Math.abs(value);
        String sign = value < 0 ? "-" : "";
        if (abs >= 1_000_000) {
            String m = String.format(Locale.US, "%.1f", abs / 1_000_000);
            if (m.endsWith(".0")) m = m.substring(0, m.length() - 2);
            return sign + symbol + m + "M";
        }
        if (abs >= 1_000) {
            return sign + symbol + Math.round(abs / 1_000) + "k";
        }
        return sign + symbol + Math.round(abs);
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
