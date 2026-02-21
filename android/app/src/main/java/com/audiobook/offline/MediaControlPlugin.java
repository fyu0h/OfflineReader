package com.audiobook.offline;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.common.Player;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "MediaControl")
public class MediaControlPlugin extends Plugin {

    private Handler mainHandler;
    private Runnable positionRunnable;

    @Override
    public void load() {
        mainHandler = new Handler(Looper.getMainLooper());

        PlaybackService.setStateListener(new PlaybackService.StateListener() {
            @Override
            public void onPlayingChanged(boolean isPlaying) {
                JSObject data = new JSObject();
                data.put("isPlaying", isPlaying);
                notifyListeners("playingChanged", data);
                if (isPlaying)
                    startPositionUpdates();
                else
                    stopPositionUpdates();
            }

            @Override
            public void onPositionUpdate(long posMs, long durMs) {
            }

            @Override
            public void onChapterChanged(int index, String mediaId) {
                JSObject data = new JSObject();
                data.put("index", index);
                data.put("mediaId", mediaId);
                notifyListeners("chapterChanged", data);
            }

            @Override
            public void onCompleted() {
                notifyListeners("completed", new JSObject());
            }

            @Override
            public void onError(String message) {
                JSObject data = new JSObject();
                data.put("message", message != null ? message : "Unknown error");
                notifyListeners("playerError", data);
            }

            @Override
            public void onServiceReset() {
                // Service was recreated (e.g. killed by system during lock screen).
                // Notify JS layer so it can reload the playlist and resume.
                notifyListeners("serviceReset", new JSObject());
            }
        });
    }

    // Called from MainActivity to forward Voice Assistant commands to JS
    public void notifyVoiceCommand(String query) {
        JSObject data = new JSObject();
        data.put("query", query != null ? query : "");
        notifyListeners("voicePlayCommand", data);
    }

    private void startPositionUpdates() {
        stopPositionUpdates();
        positionRunnable = new Runnable() {
            @Override
            public void run() {
                PlaybackService svc = PlaybackService.getInstance();
                if (svc != null && svc.getPlayer() != null) {
                    Player p = svc.getPlayer();
                    JSObject data = new JSObject();
                    data.put("position", p.getCurrentPosition() / 1000.0);
                    data.put("duration", p.getDuration() / 1000.0);
                    notifyListeners("positionUpdate", data);
                }
                mainHandler.postDelayed(this, 1000);
            }
        };
        mainHandler.postDelayed(positionRunnable, 1000);
    }

    private void stopPositionUpdates() {
        if (positionRunnable != null) {
            mainHandler.removeCallbacks(positionRunnable);
            positionRunnable = null;
        }
    }

    private void ensureService(Runnable onReady) {
        if (PlaybackService.getInstance() != null) {
            mainHandler.post(onReady);
            return;
        }
        Intent intent = new Intent(getContext(), PlaybackService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        final int[] attempts = { 0 };
        mainHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (PlaybackService.getInstance() != null) {
                    onReady.run();
                } else if (attempts[0]++ < 30) {
                    mainHandler.postDelayed(this, 100);
                }
            }
        }, 100);
    }

    @PluginMethod
    public void loadPlaylist(PluginCall call) {
        JSArray paths = call.getArray("paths");
        JSArray titles = call.getArray("titles");
        JSArray ids = call.getArray("ids");
        String artist = call.getString("artist", "静听");
        int startIndex = call.getInt("startIndex", 0);
        double startPos = call.getDouble("startPosition", 0.0);
        float speed = call.getFloat("speed", 1.0f);
        String coverImage = call.getString("coverImage", "");

        byte[] artworkData = null;
        if (coverImage != null && !coverImage.isEmpty()) {
            try {
                String base64Content = coverImage;
                if (coverImage.contains(",")) {
                    base64Content = coverImage.split(",")[1];
                }
                artworkData = Base64.decode(base64Content, Base64.DEFAULT);
            } catch (Exception e) {
                // Ignore parse errors
            }
        }

        List<MediaItem> items = new ArrayList<>();
        try {
            for (int i = 0; i < paths.length(); i++) {
                String path = paths.getString(i);
                String title = i < titles.length() ? titles.getString(i) : "";
                String id = i < ids.length() ? ids.getString(i) : "";
                MediaMetadata.Builder metaBuilder = new MediaMetadata.Builder()
                        .setTitle(title).setArtist(artist)
                        .setAlbumTitle(artist);

                if (artworkData != null) {
                    metaBuilder.setArtworkData(artworkData, MediaMetadata.PICTURE_TYPE_FRONT_COVER);
                }

                MediaMetadata meta = metaBuilder.build();
                items.add(new MediaItem.Builder()
                        .setMediaId(id)
                        .setUri(Uri.fromFile(new File(path)))
                        .setMediaMetadata(meta).build());
            }
        } catch (JSONException e) {
            call.reject("Invalid data: " + e.getMessage());
            return;
        }

        ensureService(() -> {
            PlaybackService svc = PlaybackService.getInstance();
            if (svc == null || svc.getPlayer() == null) {
                call.reject("Player not ready");
                return;
            }
            svc.loadPlaylist(items, startIndex, (long) (startPos * 1000));
            svc.getPlayer().setPlaybackParameters(
                    new PlaybackParameters(speed));
            call.resolve();
        });
    }

    @PluginMethod
    public void play(PluginCall call) {
        PlaybackService svc = PlaybackService.getInstance();
        if (svc != null && svc.getPlayer() != null) {
            // Service is alive — just play
            mainHandler.post(() -> {
                PlaybackService svc2 = PlaybackService.getInstance();
                if (svc2 != null && svc2.getPlayer() != null)
                    svc2.getPlayer().play();
                call.resolve();
            });
        } else {
            // Service was killed (e.g. by system during lock screen).
            // Restart it and notify JS layer to reload the playlist.
            ensureService(() -> {
                // Service is now running. Notify JS to reload playlist.
                // The JS layer will call loadPlaylist then play again.
                notifyListeners("serviceReset", new JSObject());
                call.resolve();
            });
        }
    }

    @PluginMethod
    public void pause(PluginCall call) {
        mainHandler.post(() -> {
            PlaybackService svc = PlaybackService.getInstance();
            if (svc != null && svc.getPlayer() != null)
                svc.getPlayer().pause();
            call.resolve();
        });
    }

    @PluginMethod
    public void seekTo(PluginCall call) {
        double pos = call.getDouble("position", 0.0);
        mainHandler.post(() -> {
            PlaybackService svc = PlaybackService.getInstance();
            if (svc != null && svc.getPlayer() != null)
                svc.getPlayer().seekTo((long) (pos * 1000));
            call.resolve();
        });
    }

    @PluginMethod
    public void setSpeed(PluginCall call) {
        float speed = call.getFloat("speed", 1.0f);
        mainHandler.post(() -> {
            PlaybackService svc = PlaybackService.getInstance();
            if (svc != null && svc.getPlayer() != null)
                svc.getPlayer().setPlaybackParameters(
                        new PlaybackParameters(speed, 1.0f));
            call.resolve();
        });
    }

    @PluginMethod
    public void seekToChapter(PluginCall call) {
        int index = call.getInt("index", 0);
        mainHandler.post(() -> {
            PlaybackService svc = PlaybackService.getInstance();
            if (svc != null && svc.getPlayer() != null)
                svc.getPlayer().seekTo(index, 0);
            call.resolve();
        });
    }

    @PluginMethod
    public void setVoiceEnhance(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        mainHandler.post(() -> {
            PlaybackService svc = PlaybackService.getInstance();
            if (svc != null) {
                svc.setVoiceEnhanceEnabled(enabled);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void setVolumeNormalization(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        mainHandler.post(() -> {
            PlaybackService svc = PlaybackService.getInstance();
            if (svc != null) {
                svc.setVolumeNormalizationEnabled(enabled);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void getState(PluginCall call) {
        mainHandler.post(() -> {
            JSObject result = new JSObject();
            PlaybackService svc = PlaybackService.getInstance();
            if (svc != null && svc.getPlayer() != null) {
                Player p = svc.getPlayer();
                result.put("isPlaying", p.isPlaying());
                long pos = p.getCurrentPosition();
                long dur = p.getDuration();
                result.put("position", pos < 0 ? 0.0 : pos / 1000.0);
                result.put("duration", dur < 0 ? 0.0 : dur / 1000.0);
                result.put("index", p.getCurrentMediaItemIndex());
            } else {
                result.put("isPlaying", false);
                result.put("position", 0);
                result.put("duration", 0);
                result.put("index", 0);
            }
            call.resolve(result);
        });
    }

    @PluginMethod
    public void stopService(PluginCall call) {
        stopPositionUpdates();
        mainHandler.post(() -> {
            PlaybackService svc = PlaybackService.getInstance();
            if (svc != null && svc.getPlayer() != null) {
                svc.getPlayer().pause();
            }
            Intent intent = new Intent(getContext(), PlaybackService.class);
            getContext().stopService(intent);
            call.resolve();
        });
    }

    @PluginMethod
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        boolean isIgnoring = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                isIgnoring = pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
            }
        } else {
            // Below M, there is no such rigorous optimization, assume effectively true
            isIgnoring = true;
        }
        JSObject ret = new JSObject();
        ret.put("isIgnoring", isIgnoring);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
                if (pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName())) {
                    // Already ignoring, return true immediately
                    JSObject ret = new JSObject();
                    ret.put("isIgnoring", true);
                    call.resolve(ret);
                    return;
                }

                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                startActivityForResult(call, intent, "batteryOptResult");
            } catch (Exception e) {
                call.reject("Failed to request battery optimization ignore", e);
            }
        } else {
            JSObject ret = new JSObject();
            ret.put("isIgnoring", true);
            call.resolve(ret);
        }
    }

    @ActivityCallback
    private void batteryOptResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        boolean isIgnoring = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                isIgnoring = pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
            }
        }
        JSObject ret = new JSObject();
        ret.put("isIgnoring", isIgnoring);
        call.resolve(ret);
    }
}