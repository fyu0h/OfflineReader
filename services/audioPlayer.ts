// Audio playback engine - singleton service
// On Android: delegates to native ExoPlayer via MediaControl plugin
// On Web: uses HTMLAudioElement
import { getAudioBlob, getChapter, getBook, getChaptersByBook, saveProgress, getStat, saveStat } from './db';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import type { ProgressRecord } from './db';
import type { PluginListenerHandle } from '@capacitor/core';

interface MediaControlPlugin {
  loadPlaylist(opts: {
    paths: string[]; titles: string[]; ids: string[];
    artist: string; startIndex: number; startPosition: number; speed: number;
    coverImage?: string;
  }): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(opts: { position: number }): Promise<void>;
  setSpeed(opts: { speed: number }): Promise<void>;
  seekToChapter(opts: { index: number }): Promise<void>;
  getState(): Promise<{ isPlaying: boolean; position: number; duration: number; index: number }>;
  stopService(): Promise<void>;
  addListener(event: string, fn: (data: any) => void): Promise<PluginListenerHandle>;
}

export type VoiceCommandHandler = (query: string) => void;

const isNative = Capacitor.isNativePlatform();
const MediaControl = isNative
  ? registerPlugin<MediaControlPlugin>('MediaControl')
  : null;

export type PlayerState = 'idle' | 'loading' | 'playing' | 'paused';

export interface SkipSettings {
  enabled: boolean;
  introSeconds: number;
  outroSeconds: number;
}

export interface PlayerInfo {
  state: PlayerState;
  bookId: string | null;
  chapterId: string | null;
  chapterIndex: number;
  totalChapters: number;
  currentTime: number;
  duration: number;
  speed: number;
  sleepTimerEnd: number | null;
  skipSettings: SkipSettings;
}

type Listener = (info: PlayerInfo) => void;

class AudioPlayer {
  private audio: HTMLAudioElement;
  private objectUrl: string | null = null;
  private listeners: Set<Listener> = new Set();
  private sleepTimeout: number | null = null;
  private statInterval: number | null = null;
  private lastStatUpdate: number = 0;

  // Current state
  private _bookId: string | null = null;
  private _chapterId: string | null = null;
  private _chapterIndex: number = 0;
  private _totalChapters: number = 0;
  private _speed: number = 1.0;
  private _sleepTimerEnd: number | null = null;
  private _chapterIds: string[] = [];
  private _skipSettings: SkipSettings = { enabled: false, introSeconds: 30, outroSeconds: 15 };
  private _skipOutroTriggered: boolean = false; // prevent repeated triggers
  private _onChapterEnd: (() => void) | null = null;
  private _onVoiceCommand: VoiceCommandHandler | null = null;

  // Native state (synced from ExoPlayer)
  private _nativePosition: number = 0;
  private _nativeDuration: number = 0;
  private _nativePlaying: boolean = false;

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.loadSkipSettings();

    if (!isNative) {
      // Web-only: use HTMLAudioElement events
      this.audio.addEventListener('timeupdate', () => {
        this.checkOutroSkip();
        this.recordListeningTime(); // Hook stats update to playback heartbeat
        this.notify();
      });
      this.audio.addEventListener('loadedmetadata', () => this.notify());
      this.audio.addEventListener('play', () => this.notify());
      this.audio.addEventListener('pause', () => this.notify());
      this.audio.addEventListener('ended', () => {
        if (this._onChapterEnd) this._onChapterEnd();
      });
    } else {
      this.setupNativeListeners();
    }
  }

  private loadSkipSettings() {
    try {
      const saved = localStorage.getItem('skipSettings');
      if (saved) {
        const parsed = JSON.parse(saved);
        this._skipSettings = {
          enabled: !!parsed.enabled,
          introSeconds: typeof parsed.introSeconds === 'number' ? parsed.introSeconds : 30,
          outroSeconds: typeof parsed.outroSeconds === 'number' ? parsed.outroSeconds : 15,
        };
      }
    } catch { }
  }

  private saveSkipSettings() {
    localStorage.setItem('skipSettings', JSON.stringify(this._skipSettings));
  }

  private checkOutroSkip() {
    if (!this._skipSettings.enabled || this._skipSettings.outroSeconds <= 0) return;
    if (this._skipOutroTriggered) return;

    const duration = isNative ? this._nativeDuration : (this.audio.duration || 0);
    const currentTime = isNative ? this._nativePosition : (this.audio.currentTime || 0);
    if (duration <= 0) return;

    const remaining = duration - currentTime;
    if (remaining <= this._skipSettings.outroSeconds && remaining > 0) {
      this._skipOutroTriggered = true;
      if (this._onChapterEnd) {
        this._onChapterEnd();
      }
    }
  }

  private async setupNativeListeners() {
    if (!MediaControl) return;

    await MediaControl.addListener('playingChanged', (data: { isPlaying: boolean }) => {
      this._nativePlaying = data.isPlaying;
      if (data.isPlaying) this.startStatTracking();
      else { this.stopStatTracking(); this.persistProgress(); }
      this.notify();
    });

    await MediaControl.addListener('positionUpdate', (data: { position: number; duration: number }) => {
      this._nativePosition = data.position;
      this._nativeDuration = data.duration;
      this.checkOutroSkip();
      this.recordListeningTime(); // Hook stats update to playback heartbeat
      this.notify();
    });

    await MediaControl.addListener('chapterChanged', (data: { index: number; mediaId: string }) => {
      // Protect from ExoPlayer's synthetic `onMediaItemTransition` wiping positions initially
      if (this._chapterId !== data.mediaId) {
        this._chapterIndex = data.index;
        this._chapterId = data.mediaId;
        this._nativePosition = 0;
        this.persistProgress();
        this.notify();
      }
    });

    await MediaControl.addListener('completed', () => {
      this._nativePlaying = false;
      if (this._onChapterEnd) this._onChapterEnd();
      this.notify();
    });

    await MediaControl.addListener('playerError', (data: { message: string }) => {
      console.error('[AudioPlayer] Native player error:', data.message);
      this._nativePlaying = false;
      this.notify();
    });

    await MediaControl.addListener('voicePlayCommand', (data: { query: string }) => {
      console.log('[AudioPlayer] Native voice play command:', data.query);
      if (this._onVoiceCommand) {
        this._onVoiceCommand(data.query || '');
      }
    });

    // Service was killed by the system (e.g. during lock screen) and restarted.
    // Reload the playlist into the fresh ExoPlayer instance so the next play() works.
    await MediaControl.addListener('serviceReset', async () => {
      console.warn('[AudioPlayer] Native service was reset, reloading playlist...');
      this._nativePlaying = false;
      this._nativePosition = 0;
      this._nativeDuration = 0;
      this.notify();

      // Reload the playlist into the new ExoPlayer instance (without auto-playing)
      if (this._bookId && this._chapterId && this._chapterIds.length > 0) {
        await this._reloadNativePlaylist(/* autoPlay */ false);
      }
    });

    // When App comes back to foreground, check if the service is still alive.
    // If not, reload the playlist so the next play() works.
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('appStateChange', async ({ isActive }) => {
        if (!isActive) return; // going to background, ignore
        if (!this._bookId || !this._chapterId) return;

        // Give the service a moment to settle, then check
        setTimeout(async () => {
          if (!MediaControl) return;
          try {
            const state = await MediaControl.getState();
            // If position and duration are both 0 and not playing, the service
            // may have been killed. Reload to ensure next play() works.
            if (!state.isPlaying && state.duration === 0 && this._bookId && this._chapterId) {
              console.warn('[AudioPlayer] Service appears dead after resume, reloading playlist...');
              await this._reloadNativePlaylist(/* autoPlay */ false);
            }
          } catch (e) {
            console.warn('[AudioPlayer] getState failed on resume:', e);
          }
        }, 500);
      });
    }
  }

  /** Reload the current playlist into ExoPlayer without changing JS state.
   *  If autoPlay is true, starts playback immediately after loading. */
  private async _reloadNativePlaylist(autoPlay: boolean) {
    if (!MediaControl || !this._bookId || !this._chapterId) return;
    try {
      const chapters = await getChaptersByBook(this._bookId);
      chapters.sort((a, b) => a.order - b.order);
      const book = await getBook(this._bookId);

      const paths: string[] = [];
      const titles: string[] = [];
      const ids: string[] = [];
      for (const ch of chapters) {
        if (ch.audioPath) {
          paths.push(ch.audioPath);
          titles.push(ch.title);
          ids.push(ch.id);
        }
      }
      if (paths.length === 0) return;

      const startIdx = ids.indexOf(this._chapterId);
      const resumePosition = this._nativePosition;

      await MediaControl.loadPlaylist({
        paths, titles, ids,
        artist: book?.title || '静听',
        startIndex: startIdx >= 0 ? startIdx : 0,
        startPosition: resumePosition,
        speed: this._speed,
        coverImage: book?.coverImage || '',
      });

      if (!autoPlay) {
        // loadPlaylist always starts playing in ExoPlayer; pause immediately
        await MediaControl.pause();
      }
    } catch (e) {
      console.error('[AudioPlayer] _reloadNativePlaylist failed:', e);
    }
  }


  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    const info = this.getInfo();
    this.listeners.forEach(fn => fn(info));
  }

  getInfo(): PlayerInfo {
    let state: PlayerState = 'idle';
    if (this._bookId) {
      if (isNative) {
        state = this._nativePlaying ? 'playing' : 'paused';
      } else {
        if (this.audio.readyState < 2) state = 'loading';
        else if (!this.audio.paused) state = 'playing';
        else state = 'paused';
      }
    }
    return {
      state,
      bookId: this._bookId,
      chapterId: this._chapterId,
      chapterIndex: this._chapterIndex,
      totalChapters: this._totalChapters,
      currentTime: isNative ? this._nativePosition : (this.audio.currentTime || 0),
      duration: isNative ? this._nativeDuration : (this.audio.duration || 0),
      speed: this._speed,
      sleepTimerEnd: this._sleepTimerEnd,
      skipSettings: { ...this._skipSettings },
    };
  }

  async loadChapter(bookId: string, chapterId: string, chapterIds: string[], startPosition: number = 0) {
    this._bookId = bookId;
    this._chapterId = chapterId;
    this._chapterIds = chapterIds;
    this._chapterIndex = chapterIds.indexOf(chapterId);
    this._totalChapters = chapterIds.length;
    this._skipOutroTriggered = false;

    // Auto-skip intro: if enabled and startPosition is 0 (fresh chapter start)
    if (this._skipSettings.enabled && this._skipSettings.introSeconds > 0 && startPosition === 0) {
      startPosition = this._skipSettings.introSeconds;
    }

    if (isNative && MediaControl) {
      // Load full playlist into ExoPlayer
      const chapters = await getChaptersByBook(bookId);
      chapters.sort((a, b) => a.order - b.order);

      const paths: string[] = [];
      const titles: string[] = [];
      const ids: string[] = [];
      const book = await getBook(bookId);

      for (const ch of chapters) {
        if (ch.audioPath) {
          paths.push(ch.audioPath);
          titles.push(ch.title);
          ids.push(ch.id);
        }
      }

      if (paths.length === 0) {
        // Fallback: no native paths, can't use ExoPlayer
        console.warn('No native audio paths, cannot use ExoPlayer');
        return;
      }

      // Find the index in the filtered list
      const startIdx = ids.indexOf(chapterId);
      this._chapterIndex = startIdx >= 0 ? startIdx : 0;
      this._chapterIds = ids;
      this._totalChapters = ids.length;

      // Synchronously tell React about our intended start position so UI doesn't flicker to 00:00
      this._nativePosition = startPosition;
      this._nativeDuration = 0;
      this.notify();

      await MediaControl.loadPlaylist({
        paths, titles, ids,
        artist: book?.title || '静听',
        startIndex: this._chapterIndex,
        startPosition,
        speed: this._speed,
        coverImage: book?.coverImage || '',
      });
    } else {
      // Web fallback
      this.audio.pause();
      if (this.objectUrl) {
        URL.revokeObjectURL(this.objectUrl);
        this.objectUrl = null;
      }

      const chapter = await getChapter(chapterId);
      if (chapter?.audioPath) {
        this.audio.src = Capacitor.convertFileSrc(chapter.audioPath);
      } else {
        const record = await getAudioBlob(chapterId);
        if (!record) { console.error('Audio blob not found:', chapterId); return; }
        this.objectUrl = URL.createObjectURL(record.blob);
        this.audio.src = this.objectUrl;
      }
      this.audio.playbackRate = this._speed;
      this.audio.currentTime = startPosition;
    }

    this.lastStatUpdate = Date.now(); // Reset stats tracking when changing chapters
    this.notify();
  }

  async play() {
    if (isNative && MediaControl) {
      const state = await MediaControl.getState();
      if (!state.isPlaying && state.duration === 0 && this._bookId && this._chapterId) {
        console.warn('[AudioPlayer] play() called but service is idle, reloading before play...');
        await this._reloadNativePlaylist(true);
      } else {
        await MediaControl.play();
      }
    } else {
      if (!this.audio.src) return;
      await this.audio.play();
      this.startStatTracking();
    }
    this.notify();
  }

  pause() {
    if (isNative && MediaControl) {
      MediaControl.pause();
    } else {
      this.audio.pause();
      this.stopStatTracking();
      this.persistProgress();
    }
    this.notify();
  }

  async togglePlay() {
    if (isNative) {
      if (this._nativePlaying) this.pause();
      else await this.play();
    } else {
      if (this.audio.paused) await this.play();
      else this.pause();
    }
  }

  seek(time: number) {
    if (isNative && MediaControl) {
      MediaControl.seekTo({ position: time });
      this._nativePosition = time;
      this.persistProgress();
    } else {
      if (!isNaN(this.audio.duration)) {
        this.audio.currentTime = Math.max(0, Math.min(time, this.audio.duration));
        this.persistProgress();
      }
    }
    this.notify();
  }

  seekRelative(delta: number) {
    const cur = isNative ? this._nativePosition : this.audio.currentTime;
    this.seek(cur + delta);
  }

  setSpeed(speed: number) {
    this._speed = speed;
    if (isNative && MediaControl) {
      MediaControl.setSpeed({ speed });
    } else {
      this.audio.playbackRate = speed;
    }
    this.notify();
  }

  setOnChapterEnd(fn: () => void) { this._onChapterEnd = fn; }
  setOnVoiceCommand(fn: VoiceCommandHandler) { this._onVoiceCommand = fn; }
  canGoPrev() { return this._chapterIndex > 0; }
  canGoNext() { return this._chapterIndex < this._totalChapters - 1; }
  getChapterIds() { return this._chapterIds; }

  // Skip settings
  getSkipSettings(): SkipSettings { return { ...this._skipSettings }; }

  setSkipSettings(settings: Partial<SkipSettings>) {
    this._skipSettings = { ...this._skipSettings, ...settings };
    this.saveSkipSettings();
    this.notify();
  }

  // Sleep timer
  setSleepTimer(minutes: number | null) {
    if (this.sleepTimeout) { clearTimeout(this.sleepTimeout); this.sleepTimeout = null; }
    if (minutes === null) {
      this._sleepTimerEnd = null;
    } else {
      this._sleepTimerEnd = Date.now() + minutes * 60 * 1000;
      this.sleepTimeout = window.setTimeout(() => {
        this.pause();
        this._sleepTimerEnd = null;
        this.sleepTimeout = null;
        this.notify();
      }, minutes * 60 * 1000);
    }
    this.notify();
  }

  async persistProgress() {
    if (!this._bookId || !this._chapterId) return;
    const pos = isNative ? this._nativePosition : (this.audio.currentTime || 0);
    const p: ProgressRecord = {
      bookId: this._bookId,
      chapterId: this._chapterId,
      position: pos,
      speed: this._speed,
      updatedAt: Date.now(),
    };
    await saveProgress(p);
  }

  private startStatTracking() {
    this.lastStatUpdate = Date.now();
  }

  private stopStatTracking() {
    this.recordListeningTime();
  }

  private async recordListeningTime() {
    const now = Date.now();
    const elapsed = (now - this.lastStatUpdate) / 1000 / 60;

    // Only update if at least 0.1 minutes (6 seconds) have passed
    if (elapsed > 0.1) {
      this.lastStatUpdate = now;
      if (elapsed > 300) return; // Ignore crazy jumps > 5 hours
      const today = new Date().toISOString().split('T')[0];
      const existing = await getStat(today);
      const current = existing?.minutes || 0;
      await saveStat({ date: today, minutes: Math.round((current + elapsed) * 10) / 10 });
    }
  }

  stop() {
    this.pause();
    if (!isNative) {
      this.audio.src = '';
      if (this.objectUrl) { URL.revokeObjectURL(this.objectUrl); this.objectUrl = null; }
    }
    MediaControl?.stopService().catch(() => { });
    this._bookId = null;
    this._chapterId = null;
    this._chapterIds = [];
    this._chapterIndex = 0;
    this._totalChapters = 0;
    this._sleepTimerEnd = null;
    this._nativePosition = 0;
    this._nativeDuration = 0;
    this._nativePlaying = false;
    if (this.sleepTimeout) { clearTimeout(this.sleepTimeout); this.sleepTimeout = null; }
    this.notify();
  }

  destroy() {
    this.stop();
    this.listeners.clear();
    if (this.statInterval) clearInterval(this.statInterval);
  }
}

// Singleton
export const audioPlayer = new AudioPlayer();
