package com.audiobook.offline;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.annotation.OptIn;
import androidx.core.app.NotificationCompat;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

import java.util.ArrayList;
import java.util.List;

@OptIn(markerClass = UnstableApi.class)
public class PlaybackService extends MediaSessionService {
    private static final String CHANNEL_ID = "playback_channel";
    private static final int NOTIFICATION_ID = 1;
    private MediaSession mediaSession = null;
    private static PlaybackService instance;
    private PowerManager.WakeLock wakeLock;

    public interface StateListener {
        void onPlayingChanged(boolean isPlaying);

        void onPositionUpdate(long positionMs, long durationMs);

        void onChapterChanged(int index, String mediaId);

        void onCompleted();

        void onError(String message);

        default void onServiceReset() {
        }
    }

    private static StateListener stateListener;

    public static void setStateListener(StateListener l) {
        stateListener = l;
    }

    public static PlaybackService getInstance() {
        return instance;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;

        // Initialize WakeLock to prevent CPU from sleeping
        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "OfflineReader:PlaybackWakeLock");
            wakeLock.acquire();
        }

        // Create notification channel and call startForeground immediately
        // to prevent ForegroundServiceDidNotStartInTimeException
        createNotificationChannel();
        Notification placeholder = createNotification("正在准备播放...", false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, placeholder,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, placeholder);
        }

        ExoPlayer player = new ExoPlayer.Builder(this).build();
        player.setWakeMode(C.WAKE_MODE_LOCAL);

        // Build pending intent for notification tap — with null safety
        Intent intent = getPackageManager()
                .getLaunchIntentForPackage(getPackageName());
        if (intent == null) {
            intent = new Intent(this, getClass());
        }
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        mediaSession = new MediaSession.Builder(this, player)
                .setSessionActivity(pi)
                .build();

        player.addListener(new Player.Listener() {
            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                if (stateListener != null)
                    stateListener.onPlayingChanged(isPlaying);

                // Force maintain foreground status even when paused
                updateForegroundNotification(isPlaying);
            }

            @Override
            public void onMediaItemTransition(
                    @Nullable MediaItem item, int reason) {
                if (stateListener != null && item != null) {
                    stateListener.onChapterChanged(
                            player.getCurrentMediaItemIndex(),
                            item.mediaId);
                }
            }

            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_ENDED && stateListener != null) {
                    stateListener.onCompleted();
                }
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                Log.e("PlaybackService", "ExoPlayer error: " + error.getMessage(), error);
                if (stateListener != null) {
                    stateListener.onError(error.getMessage());
                }
            }
        });
    }

    private void updateForegroundNotification(boolean isPlaying) {
        // Media3 handles some notification logic, but we want to ensure
        // the service stays as a foreground service during pause on Android 12+
        Notification notification = createNotification(isPlaying ? "正在播放" : "已暂停", isPlaying);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private Notification createNotification(String contentText, boolean isOngoing) {
        Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("静听")
                .setContentText(contentText)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setOngoing(true) // Force ongoing to prevent swipe-to-dismiss even when paused
                .setContentIntent(pi)
                .setSilent(true)
                .build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        super.onStartCommand(intent, flags, startId);
        return START_STICKY;
    }

    @Nullable
    @Override
    public MediaSession onGetSession(
            MediaSession.ControllerInfo controllerInfo) {
        return mediaSession;
    }

    @Override
    public void onDestroy() {
        instance = null;
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        if (mediaSession != null) {
            mediaSession.getPlayer().release();
            mediaSession.release();
            mediaSession = null;
        }
        super.onDestroy();
    }

    public Player getPlayer() {
        return mediaSession != null ? mediaSession.getPlayer() : null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "音频播放",
                    NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("音频播放控制");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null)
                nm.createNotificationChannel(channel);
        }
    }

    public void loadPlaylist(List<MediaItem> items, int startIndex,
            long startPositionMs) {
        Player p = getPlayer();
        if (p == null)
            return;
        p.setMediaItems(items, startIndex, startPositionMs);
        p.prepare();
        p.play(); // must start immediately so Media3 shows foreground notification
    }
}
