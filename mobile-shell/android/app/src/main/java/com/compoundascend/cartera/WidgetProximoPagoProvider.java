package com.compoundascend.cartera;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/**
 * Widget "Próximo pago de deuda" (RemoteViews, robusto para EMUI). Lee el mismo snapshot
 * ("cartera_widget"/"snapshot") y muestra el próximo pago: nombre de la deuda, monto (bitmap
 * Space Mono vía {@link WidgetRender}) y fecha ("Vence el 15 jul · en 3 días" / "· vencido" /
 * "· hoy"), en rojo si urgente. Sin próximos pagos → invita a abrir la app. Tap → /m/deudas.
 */
public class WidgetProximoPagoProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            renderWidget(context, manager, id);
        }
    }

    private static void renderWidget(Context context, AppWidgetManager manager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_proximo_pago);

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
                if (!o.isNull("nextDebtName") && !o.isNull("nextDebtDue")) {
                    String name = o.optString("nextDebtName", "");
                    String due = o.optString("nextDebtDue", "");
                    if (!name.isEmpty() && due.length() >= 10) {
                        String symbol = WidgetRender.currencySymbol(o.optString("currency", "CRC"));

                        views.setTextViewText(R.id.tv_debt, name);

                        if (!o.isNull("nextDebtAmount")) {
                            double amount = o.optDouble("nextDebtAmount", 0);
                            views.setImageViewBitmap(
                                    R.id.iv_amount,
                                    WidgetRender.amount(context, symbol, WidgetRender.formatNumber(amount), ink, muted));
                        } else {
                            views.setImageViewBitmap(
                                    R.id.iv_amount, WidgetRender.amount(context, "", "—", ink, muted));
                        }

                        int days = daysUntilLocal(due);
                        String when;
                        boolean urgent;
                        if (days < 0) {
                            when = " · vencido";
                            urgent = true;
                        } else if (days == 0) {
                            when = " · hoy";
                            urgent = true;
                        } else if (days == 1) {
                            when = " · mañana";
                            urgent = true;
                        } else if (days <= 3) {
                            when = " · en " + days + " días";
                            urgent = true;
                        } else {
                            when = " · en " + days + " días";
                            urgent = false;
                        }
                        views.setTextViewText(R.id.tv_due, "Vence el " + formatDueDate(due) + when);
                        views.setTextColor(R.id.tv_due, urgent ? danger : accent);

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
        open.putExtra("cartera.route", "/m/deudas");
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(
                context, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, pending);

        manager.updateAppWidget(appWidgetId, views);
    }

    /** Sin próximos pagos (o sin snapshot): invita a abrir la app. */
    private static void renderEmpty(Context context, RemoteViews views, int ink, int muted, int accent) {
        views.setTextViewText(R.id.tv_debt, "Sin pagos próximos");
        views.setImageViewBitmap(R.id.iv_amount, WidgetRender.amount(context, "", "—", ink, muted));
        views.setTextViewText(R.id.tv_due, "Abre CARTERA+ para ver tus deudas");
        views.setTextColor(R.id.tv_due, accent);
        views.setTextViewText(R.id.tv_updated, "");
    }

    /** Días desde HOY (local) hasta la fecha yyyy-mm-dd. Negativo si ya pasó. */
    private static int daysUntilLocal(String ymd) {
        try {
            String[] p = ymd.substring(0, 10).split("-");
            Calendar due = Calendar.getInstance();
            due.set(Integer.parseInt(p[0]), Integer.parseInt(p[1]) - 1, Integer.parseInt(p[2]), 0, 0, 0);
            due.set(Calendar.MILLISECOND, 0);
            Calendar today = Calendar.getInstance();
            today.set(Calendar.HOUR_OF_DAY, 0);
            today.set(Calendar.MINUTE, 0);
            today.set(Calendar.SECOND, 0);
            today.set(Calendar.MILLISECOND, 0);
            return (int) Math.round((due.getTimeInMillis() - today.getTimeInMillis()) / 86_400_000.0);
        } catch (Exception e) {
            return 0;
        }
    }

    /** yyyy-mm-dd → "15 jul" (es-CR). Vacío si no parsea. */
    private static String formatDueDate(String ymd) {
        try {
            String[] p = ymd.substring(0, 10).split("-");
            Calendar due = Calendar.getInstance();
            due.set(Integer.parseInt(p[0]), Integer.parseInt(p[1]) - 1, Integer.parseInt(p[2]));
            return new SimpleDateFormat("d MMM", new Locale("es", "CR")).format(due.getTime());
        } catch (Exception e) {
            return "";
        }
    }
}
