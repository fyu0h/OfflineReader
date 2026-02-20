package com.audiobook.offline;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DirectoryReaderPlugin.class);
        registerPlugin(MediaControlPlugin.class);
        super.onCreate(savedInstanceState);

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
