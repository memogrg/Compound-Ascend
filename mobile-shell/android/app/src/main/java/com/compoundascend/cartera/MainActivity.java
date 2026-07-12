package com.compoundascend.cartera;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registra el puente propio del widget ANTES de super.onCreate (patrón Capacitor 7).
        registerPlugin(WidgetBridge.class);
        super.onCreate(savedInstanceState);
    }
}
