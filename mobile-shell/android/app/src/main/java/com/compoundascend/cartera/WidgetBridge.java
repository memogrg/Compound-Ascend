package com.compoundascend.cartera;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Puente nativo propio (sin plugins de terceros) para los widgets de pantalla de inicio.
 * La app (WebView /m) llama setSnapshot con un JSON de métricas cuando está abierta con
 * sesión; se guarda en SharedPreferences "cartera_widget"/"snapshot" y se fuerza el
 * repintado de los widgets ya colocados. Andamiaje reutilizable por los próximos widgets.
 */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridge extends Plugin {

    public static final String PREFS = "cartera_widget";
    public static final String KEY_SNAPSHOT = "snapshot";

    @PluginMethod
    public void setSnapshot(PluginCall call) {
        String data = call.getString("data");
        Context ctx = getContext();

        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_SNAPSHOT, data).apply();

        // Fuerza el repintado de los widgets ya colocados (si los hay).
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        ComponentName provider = new ComponentName(ctx, WidgetPatrimonioProvider.class);
        int[] ids = mgr.getAppWidgetIds(provider);
        if (ids != null && ids.length > 0) {
            Intent intent = new Intent(ctx, WidgetPatrimonioProvider.class);
            intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            ctx.sendBroadcast(intent);
        }

        call.resolve();
    }
}
