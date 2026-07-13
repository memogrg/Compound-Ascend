package com.compoundascend.cartera;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.util.DisplayMetrics;

import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Helpers compartidos por los widgets de pantalla de inicio (Patrimonio, Presupuesto, …).
 *
 * La tipografía de marca (Space Mono) se dibuja como Bitmap porque EMUI no infla fuentes @font
 * dentro de RemoteViews. Aquí viven el render del monto y los formateadores de moneda/fecha,
 * para no duplicarlos entre providers.
 */
final class WidgetRender {

    private static final String AMOUNT_FONT = "fonts/space_mono_bold.ttf";

    private WidgetRender() {}

    private static Typeface typeface(Context ctx) {
        try {
            return Typeface.createFromAsset(ctx.getAssets(), AMOUNT_FONT);
        } catch (Exception e) {
            return Typeface.create("monospace", Typeface.BOLD);
        }
    }

    /**
     * Dibuja "símbolo + número" con Space Mono Bold (símbolo más pequeño y alineado arriba,
     * número grande). Tamaños en px según densidad, con antialias. `symbol` puede ir vacío.
     */
    static Bitmap amount(Context ctx, String symbol, String number, int inkColor, int mutedColor) {
        float d = ctx.getResources().getDisplayMetrics().density;
        Typeface tf = typeface(ctx);

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
        if (!symbol.isEmpty()) {
            c.drawText(symbol, pad, pad - sym.getFontMetrics().ascent, sym);
        }
        c.drawText(number, pad + symW + gap, pad - nm.ascent, num);
        return bmp;
    }

    /**
     * Dibuja "gastado / presupuestado": `main` grande (ink) y `sub` más pequeño (muted) con un
     * separador " / ", alineados por la misma baseline (el sub queda como denominador). Space Mono.
     */
    static Bitmap budgetAmount(Context ctx, String main, String sub, int inkColor, int mutedColor) {
        float d = ctx.getResources().getDisplayMetrics().density;
        Typeface tf = typeface(ctx);

        Paint big = new Paint(Paint.ANTI_ALIAS_FLAG);
        big.setTypeface(tf);
        big.setColor(inkColor);
        big.setTextSize(26f * d);

        Paint small = new Paint(Paint.ANTI_ALIAS_FLAG);
        small.setTypeface(tf);
        small.setColor(mutedColor);
        small.setTextSize(15f * d);

        String tail = "  /  " + sub;
        float bigW = big.measureText(main);
        float tailW = small.measureText(tail);
        Paint.FontMetrics bm = big.getFontMetrics();
        int pad = (int) Math.ceil(2f * d);

        int w = Math.max(1, (int) Math.ceil(bigW + tailW) + pad * 2);
        int h = Math.max(1, (int) Math.ceil(bm.descent - bm.ascent) + pad * 2);

        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        float baseline = pad - bm.ascent;
        c.drawText(main, pad, baseline, big);
        c.drawText(tail, pad + bigW, baseline, small);
        return bmp;
    }

    /** ₡ para CRC, $ para USD (y algunos comunes), €, £. */
    static String currencySymbol(String currency) {
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
    static String formatNumber(double value) {
        NumberFormat nf = NumberFormat.getIntegerInstance(new Locale("es", "CR"));
        return nf.format(Math.round(value));
    }

    /** Monto compacto: ₡1.2M / ₡234k / ₡850, con signo. */
    static String compactMoney(double value, String symbol) {
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
    static String formatTime(String iso) {
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
