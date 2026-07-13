package com.compoundascend.cartera;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.Locale;

/**
 * Widget "Indicador económico" (RemoteViews, robusto para EMUI). Lee el mismo snapshot
 * ("cartera_widget"/"snapshot") y muestra un indicador macro destacado: nombre, valor (bitmap
 * Space Mono vía {@link WidgetRender}; el valor viene ya formateado desde el server) y variación
 * (▲/▼ %, verde si sube / rojo si baja). Sin datos → invita a abrir la app. Tap → /m/indicadores.
 */
public class WidgetIndicadorProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            renderWidget(context, manager, id);
        }
    }

    private static void renderWidget(Context context, AppWidgetManager manager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_indicador);

        final int ink = context.getColor(R.color.widget_text);
        final int muted = context.getColor(R.color.widget_muted);
        final int accent = context.getColor(R.color.widget_accent);
        final int danger = context.getColor(R.color.widget_danger);

        SharedPreferences prefs =
                context.getSharedPreferences(WidgetBridge.PREFS, Context.MODE_PRIVATE);
        String data = prefs.getString(WidgetBridge.KEY_SNAPSHOT, null);

        boolean painted = false;
        if (data != null) {
            try {
                JSONObject o = new JSONObject(data);
                if (!o.isNull("indicatorName") && !o.isNull("indicatorValue")) {
                    String name = o.optString("indicatorName", "");
                    String value = o.optString("indicatorValue", "");
                    if (!name.isEmpty() && !value.isEmpty()) {
                        views.setTextViewText(R.id.tv_ind_name, name);
                        views.setImageViewBitmap(
                                R.id.iv_amount, WidgetRender.amount(context, "", value, ink, muted));

                        if (o.isNull("indicatorChange")) {
                            views.setTextViewText(R.id.tv_change, "");
                        } else {
                            double change = o.optDouble("indicatorChange", 0);
                            boolean up = change >= 0;
                            String pct = String.format(Locale.US, "%.1f", Math.abs(change));
                            views.setTextViewText(R.id.tv_change, (up ? "▲ " : "▼ ") + pct + "%");
                            views.setTextColor(R.id.tv_change, up ? accent : danger);
                        }

                        String hhmm = WidgetRender.formatTime(o.optString("updatedAt", ""));
                        views.setTextViewText(R.id.tv_updated, hhmm.isEmpty() ? "" : "Actualizado " + hhmm);
                        painted = true;
                    }
                }
            } catch (Exception e) {
                painted = false;
            }
        }

        if (!painted) {
            renderEmpty(context, views, ink, muted, accent);
        }

        Intent open = new Intent(context, MainActivity.class);
        open.putExtra("cartera.route", "/m/indicadores");
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(
                context, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, pending);

        manager.updateAppWidget(appWidgetId, views);
    }

    /** Sin indicador (o sin snapshot): invita a abrir la app. */
    private static void renderEmpty(Context context, RemoteViews views, int ink, int muted, int accent) {
        views.setTextViewText(R.id.tv_ind_name, "Sin datos");
        views.setImageViewBitmap(R.id.iv_amount, WidgetRender.amount(context, "", "—", ink, muted));
        views.setTextViewText(R.id.tv_change, "Abre CARTERA+ para ver indicadores");
        views.setTextColor(R.id.tv_change, accent);
        views.setTextViewText(R.id.tv_updated, "");
    }
}
