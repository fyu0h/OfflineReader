package com.audiobook.offline;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.audiofx.DynamicsProcessing;
import android.media.audiofx.Equalizer;
import android.os.Build;
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
    private Equalizer equalizer;
    private DynamicsProcessing dynamicsProcessing;
    private boolean isVoiceEnhanceEnabled = false;
    private boolean isVolumeNormalizationEnabled = false;

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

        // Create notification channel and call startForeground immediately
        // to prevent ForegroundServiceDidNotStartInTimeException
        createNotificationChannel();
        Notification placeholder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("静听")
                .setContentText("正在准备播放...")
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setSilent(true)
                .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, placeholder,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, placeholder);
        }

        ExoPlayer player = new ExoPlayer.Builder(this).build();
        androidx.media3.common.AudioAttributes audioAttributes = new androidx.media3.common.AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
                .build();
        player.setAudioAttributes(audioAttributes, true);
        player.setWakeMode(C.WAKE_MODE_NETWORK);

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
            public void onAudioSessionIdChanged(int audioSessionId) {
                setupEqualizer(audioSessionId);
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                if (stateListener != null)
                    stateListener.onPlayingChanged(isPlaying);
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

    private void setupEqualizer(int audioSessionId) {
        if (audioSessionId == C.AUDIO_SESSION_ID_UNSET)
            return;

        setupEqualizerInstance(audioSessionId);
        setupDynamicsProcessing(audioSessionId);
    }

    private void setupEqualizerInstance(int audioSessionId) {
        if (equalizer != null) {
            equalizer.release();
            equalizer = null;
        }

        try {
            equalizer = new Equalizer(0, audioSessionId);
            applyVoiceEnhance(isVoiceEnhanceEnabled);
        } catch (Exception e) {
            Log.e("PlaybackService", "Failed to init Equalizer: " + e.getMessage());
        }
    }

    public void setVoiceEnhanceEnabled(boolean enabled) {
        this.isVoiceEnhanceEnabled = enabled;
        applyVoiceEnhance(enabled);
    }

    public boolean isVoiceEnhanceEnabled() {
        return this.isVoiceEnhanceEnabled;
    }

    private void applyVoiceEnhance(boolean enabled) {
        if (equalizer == null)
            return;
        try {
            if (!enabled) {
                equalizer.setEnabled(false);
                return;
            }

            short bands = equalizer.getNumberOfBands();
            short maxEQLevel = equalizer.getBandLevelRange()[1];

            for (short i = 0; i < bands; i++) {
                int centerFreq = Math.abs(equalizer.getCenterFreq(i)); // in milliHertz
                // Human voice range ~ 300Hz to 4000Hz (300,000 mHz to 4,000,000 mHz)
                if (centerFreq >= 300000 && centerFreq <= 4000000) {
                    // Boost voice frequencies
                    equalizer.setBandLevel(i, maxEQLevel);
                } else {
                    // Keep others flat
                    equalizer.setBandLevel(i, (short) 0);
                }
            }
            equalizer.setEnabled(true);
        } catch (Exception e) {
            Log.e("PlaybackService", "Failed to apply Equalizer: " + e.getMessage());
        }
    }

    private void setupDynamicsProcessing(int audioSessionId) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P)
            return;

        if (dynamicsProcessing != null) {
            dynamicsProcessing.release();
            dynamicsProcessing = null;
        }

        try {
            // Build DynamicsProcessing Configuration
            DynamicsProcessing.Config.Builder builder = new DynamicsProcessing.Config.Builder(
                    DynamicsProcessing.VARIANT_FAVOR_FREQUENCY_RESOLUTION,
                    1, // 1 channel for global processing
                    true, // Enable PreEQ
                    1, // 1 band PreEQ
                    true, // Enable MBC
                    1, // 1 band MBC
                    true, // Enable PostEQ
                    1, // 1 band PostEQ
                    true // Enable Limiter
            );

            dynamicsProcessing = new DynamicsProcessing(0, audioSessionId, builder.build());

            // Configure MBC: Multiband Compressor
            DynamicsProcessing.MbcBand band = dynamicsProcessing.getMbcBandByChannelIndex(0, 0);
            if (band != null) {
                band.setThreshold(-30.0f); // voices below -30dB pushed up
                band.setRatio(4.0f); // 4:1 compression
                band.setPostGain(15.0f); // +15dB boost
                dynamicsProcessing.setMbcBandAllChannelsTo(0, band);
            }

            // Configure Limiter: absolute ceiling to prevent clipping from the +15dB boost
            DynamicsProcessing.Limiter limiter = dynamicsProcessing.getLimiterByChannelIndex(0);
            if (limiter != null) {
                limiter.setThreshold(-2.0f); // absolute ceiling at -2dBFS
                dynamicsProcessing.setLimiterAllChannelsTo(limiter);
            }

            applyVolumeNormalization(isVolumeNormalizationEnabled);
        } catch (Exception e) {
            Log.e("PlaybackService", "Failed to init DynamicsProcessing: " + e.getMessage());
        }
    }

    public void setVolumeNormalizationEnabled(boolean enabled) {
        this.isVolumeNormalizationEnabled = enabled;
        applyVolumeNormalization(enabled);
    }

    public boolean isVolumeNormalizationEnabled() {
        return this.isVolumeNormalizationEnabled;
    }

    private void applyVolumeNormalization(boolean enabled) {
        if (dynamicsProcessing == null)
            return;
        try {
            dynamicsProcessing.setEnabled(enabled);
        } catch (Exception e) {
            Log.e("PlaybackService", "Failed to apply VolumeNormalization: " + e.getMessage());
        }
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
