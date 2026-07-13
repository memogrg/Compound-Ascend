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

/**
 * Widget "Presupuesto del mes" (RemoteViews, robusto para EMUI). Lee el mismo snapshot que el
 * widget de Patrimonio ("cartera_widget"/"snapshot") y muestra gastado vs presupuestado del mes:
 * monto "₡gastado / ₡presupuestado" (bitmap Space Mono), barra de progreso del % usado, y una
 * línea con el % y el restante (verde) o el exceso (rojo). Sin presupuesto → invita a abrir la app.
 * El tap abre CARTERA+ en /m/gastos. Reutiliza {@link WidgetRender} (sin duplicar helpers).
 */
public class WidgetPresupuestoProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            renderWidget(context, manager, id);
        }
    }

    private static void renderWidget(Context context, AppWidgetManager manager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_presupuesto);

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
                if (!o.isNull("budgetExpense") && !o.isNull("realExpense")) {
                    double budget = o.optDouble("budgetExpense", 0);
                    double real = o.optDouble("realExpense", 0);
                    if (budget > 0) {
                        String symbol = WidgetRender.currencySymbol(o.optString("currency", "CRC"));

                        // Monto: gastado grande / presupuestado pequeño (bitmap Space Mono).
                        views.setImageViewBitmap(
                                R.id.iv_amount,
                                WidgetRender.budgetAmount(
                                        context,
                                        WidgetRender.compactMoney(real, symbol),
                                        WidgetRender.compactMoney(budget, symbol),
                                        ink, muted));

                        int pctExact = (int) Math.round(real / budget * 100);
                        int pctBar = Math.max(0, Math.min(100, pctExact));
                        views.setProgressBar(R.id.pb_budget, 100, pctBar, false);
                        views.setViewVisibility(R.id.pb_budget, View.VISIBLE);

                        boolean over = real > budget;
                        String line;
                        if (over) {
                            line = pctExact + "% · te pasaste "
                                    + WidgetRender.compactMoney(real - budget, symbol);
                        } else {
                            line = pctExact + "% usado · quedan "
                                    + WidgetRender.compactMoney(budget - real, symbol);
                        }
                        views.setTextViewText(R.id.tv_pct, line);
                        views.setTextColor(R.id.tv_pct, over ? danger : accent);

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
            renderNoBudget(context, views, ink, muted, accent);
        }

        Intent open = new Intent(context, MainActivity.class);
        open.putExtra("cartera.route", "/m/gastos");
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(
                context, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, pending);

        manager.updateAppWidget(appWidgetId, views);
    }

    /** Sin presupuesto este mes (o sin snapshot): oculta la barra e invita a abrir la app. */
    private static void renderNoBudget(Context context, RemoteViews views, int ink, int muted, int accent) {
        views.setImageViewBitmap(R.id.iv_amount, WidgetRender.amount(context, "", "—", ink, muted));
        views.setViewVisibility(R.id.pb_budget, View.GONE);
        views.setTextViewText(R.id.tv_pct, "Sin presupuesto este mes · abre CARTERA+");
        views.setTextColor(R.id.tv_pct, accent);
        views.setTextViewText(R.id.tv_updated, "");
    }
}
