package com.compoundascend.cartera;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.util.DisplayMetrics;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Widget "Patrimonio neto" — versión ROBUSTA para RemoteViews (EMUI/Android 10).
 *
 * El launcher de EMUI no infla fuentes @font ni vector drawables dentro de RemoteViews, así que:
 *  - el MONTO grande se dibuja como Bitmap con Space Mono real (Typeface.createFromAsset) y se
 *    coloca con setImageViewBitmap en un ImageView (100% fiable, look premium);
 *  - los textos chicos usan fuentes del sistema (definido en el layout);
 *  - el logo es un PNG y el fondo un gradiente lineal simple (sin radial).
 *
 * Lee el snapshot de SharedPreferences "cartera_widget"/"snapshot". Sin snapshot, invita a abrir
 * la app. El tap abre CARTERA+. Los colores se resuelven por recurso (claro/oscuro automático).
 */
public class WidgetPatrimonioProvider extends AppWidgetProvider {

    private static final String AMOUNT_FONT = "fonts/space_mono_bold.ttf";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            renderWidget(context, manager, id);
        }
    }

    private static void renderWidget(Context context, AppWidgetManager manager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_patrimonio);

        // Colores del design system, sensibles a claro/oscuro (el context lleva el uiMode actual).
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
                String symbol = currencySymbol(currency);

                views.setImageViewBitmap(
                        R.id.iv_amount,
                        renderAmount(context, symbol, formatNumber(neto), ink, muted));

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
                renderEmpty(context, views, ink, muted, accent);
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

    /** Estado sin datos: monto "—" e invitación a abrir la app; oculta la fila de flujo. */
    private static void renderEmpty(Context context, RemoteViews views, int ink, int muted, int accent) {
        views.setImageViewBitmap(R.id.iv_amount, renderAmount(context, "", "—", ink, muted));
        views.setTextViewText(R.id.tv_trend, "Abre CARTERA+ para ver tu patrimonio");
        views.setTextColor(R.id.tv_trend, accent);
        views.setTextViewText(R.id.tv_updated, "");
        views.setViewVisibility(R.id.flow_row, View.GONE);
    }

    /**
     * Dibuja "símbolo + número" en un Bitmap con Space Mono Bold (símbolo más pequeño y alineado
     * arriba, número grande). Tamaños en px según la densidad del dispositivo, con antialias.
     */
    private static Bitmap renderAmount(Context context, String symbol, String number,
                                       int inkColor, int mutedColor) {
        DisplayMetrics m = context.getResources().getDisplayMetrics();
        float d = m.density;

        Typeface tf;
        try {
            tf = Typeface.createFromAsset(context.getAssets(), AMOUNT_FONT);
        } catch (Exception e) {
            tf = Typeface.create("monospace", Typeface.BOLD);
        }

        Paint num = new Paint(Paint.ANTI_ALIAS_FLAG);
        num.setTypeface(tf);
        num.setColor(inkColor);
        num.setTextSize(30f * d);

        Paint sym = new Paint(Paint.ANTI_ALIAS_FLAG);
        sym.setTypeface(tf);
        sym.setColor(mutedColor);
        sym.setTextSize(17f * d);

        float gap = symbol.isEmpty() ? 0f : 3f * d;
        float symW = symbol.isEmpty() ? 0f : sym.measureText(symbol);
        float numW = num.measureText(number);
        Paint.FontMetrics nm = num.getFontMetrics();
        int pad = (int) Math.ceil(2f * d);

        int w = Math.max(1, (int) Math.ceil(symW + gap + numW) + pad * 2);
        int h = Math.max(1, (int) Math.ceil(nm.descent - nm.ascent) + pad * 2);

        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        // Ambos alineados por su TOP: como el símbolo es más chico, queda "levantado".
        if (!symbol.isEmpty()) {
            c.drawText(symbol, pad, pad - sym.getFontMetrics().ascent, sym);
        }
        c.drawText(number, pad + symW + gap, pad - nm.ascent, num);
        return bmp;
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
            String mm = String.format(Locale.US, "%.1f", abs / 1_000_000);
            if (mm.endsWith(".0")) mm = mm.substring(0, mm.length() - 2);
            return sign + symbol + mm + "M";
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
            Date dt = in.parse(iso.substring(0, 19));
            SimpleDateFormat out = new SimpleDateFormat("HH:mm", Locale.getDefault());
            return dt != null ? out.format(dt) : "";
        } catch (Exception e) {
            return "";
        }
    }
}
