package com.audiobook.offline;

import android.app.SearchManager;
import android.content.Intent;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;

public class MainActivity extends BridgeActivity {

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent != null && MediaStore.INTENT_ACTION_MEDIA_PLAY_FROM_SEARCH.equals(intent.getAction())) {
            String query = intent.getStringExtra(SearchManager.QUERY);
            Log.d("VoiceAssistant", "Play from search intent received. Query: " + query);

            // Trigger play in the capacitor plugin which will in turn call JS
            // Or we can just start PlaybackService directly if we wanted, but Capacitor
            // messaging is safer for state sync
            JSObject data = new JSObject();
            data.put("query", query != null ? query : "");

            // We use MediaControlPlugin's notifyVoiceCommand by getting the plugin instance
            if (bridge != null) {
                com.getcapacitor.PluginHandle handle = bridge.getPlugin("MediaControl");
                if (handle != null) {
                    MediaControlPlugin plugin = (MediaControlPlugin) handle.getInstance();
                    if (plugin != null) {
                        plugin.notifyVoiceCommand(query != null ? query : "");
                    }
                }
            }
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DirectoryReaderPlugin.class);
        registerPlugin(MediaControlPlugin.class);
        super.onCreate(savedInstanceState);

        // Handle physical startup intent
        handleIntent(getIntent());

        // Enable high refresh rate
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                android.view.Window window = getWindow();
                android.view.WindowManager.LayoutParams params = window.getAttributes();
                android.view.Display display = getWindowManager().getDefaultDisplay();
                android.view.Display.Mode[] modes = display.getSupportedModes();

                android.view.Display.Mode maxMode = null;
                for (android.view.Display.Mode mode : modes) {
                    if (maxMode == null || mode.getRefreshRate() > maxMode.getRefreshRate()) {
                        maxMode = mode;
                    }
                }

                if (maxMode != null) {
                    params.preferredDisplayModeId = maxMode.getModeId();
                    window.setAttributes(params);
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
