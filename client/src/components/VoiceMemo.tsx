/**
 * Recording a voice memo, and playing one back.
 *
 * ── The recorder ──────────────────────────────────────────────────────────
 *
 * Press to start, press to stop, then send or discard. Deliberately not
 * hold-to-talk: hold-to-talk is fine for a two-second reaction and hostile for
 * a ninety-second thought, and this room is for the longer kind. A member
 * should be able to put the phone down mid-sentence.
 *
 * Nothing is uploaded until they choose to send. A recording they think better
 * of never leaves the device.
 *
 * ── The player is honest about what it cannot play ────────────────────────
 *
 * iOS cannot decode WebM, which is what Android records by default. Rather
 * than render a control that produces silence, the player checks the stored
 * mime against `canPlayType` and says so. See lib/audio.ts for why that
 * situation exists at all.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Trash2, Send, Play, Pause, AudioLines, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  VoiceRecorder,
  canRecord,
  canPlay,
  blobToBase64,
  formatDuration,
  type Recording,
} from "@/lib/audio";

// ─── Recorder ───────────────────────────────────────────────────────────────

export function VoiceRecorderControl({
  onSend,
  disabled,
}: {
  onSend: (a: { url: string; mime: string; durationSeconds: number }) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [held, setHeld] = useState<Recording | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<VoiceRecorder | null>(null);

  // The microphone is released on unmount as well as on stop. Navigating away
  // mid-recording would otherwise leave the indicator lit in the status bar,
  // which reads as an app still listening.
  useEffect(() => () => rec.current?.release(), []);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  if (!canRecord()) return null;

  const start = async () => {
    setError(null);
    try {
      rec.current = new VoiceRecorder();
      await rec.current.start();
      setElapsed(0);
      setRecording(true);
    } catch {
      // Almost always a denied permission. Said in those terms rather than as
      // a failure, because nothing is broken — they said no.
      setError("Microphone access is off. Turn it on in settings to record.");
      rec.current = null;
    }
  };

  const stop = async () => {
    if (!rec.current) return;
    const result = await rec.current.stop();
    rec.current = null;
    setRecording(false);
    setHeld(result);
  };

  const send = async () => {
    if (!held) return;
    setUploading(true);
    setError(null);
    try {
      const data = await blobToBase64(held.blob);
      const res = await fetch("/api/community/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ data, mime: held.mime, durationSeconds: held.durationSeconds }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "That didn't upload");
      const saved = await res.json();
      onSend(saved);
      setHeld(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't upload");
    } finally {
      setUploading(false);
    }
  };

  if (held) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[hsl(var(--gold))]/25 px-3 py-2">
        <AudioLines className="h-4 w-4 text-[hsl(var(--gold))] shrink-0" />
        <span className="text-sm flex-1">
          Recorded · {formatDuration(held.durationSeconds)}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setHeld(null)}
          disabled={uploading}
          aria-label="Discard recording"
          data-testid="button-discard-memo"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
        <Button
          size="sm"
          onClick={send}
          disabled={uploading}
          className="bg-gold border-gold-border text-white"
          data-testid="button-send-memo"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={recording ? "default" : "outline"}
          onClick={recording ? stop : start}
          disabled={disabled || uploading}
          className={cn(recording && "bg-destructive text-destructive-foreground")}
          data-testid="button-record-memo"
        >
          {recording ? (
            <>
              <Square className="h-3.5 w-3.5 mr-1.5" />
              Stop · {formatDuration(elapsed)}
            </>
          ) : (
            <>
              <Mic className="h-3.5 w-3.5 mr-1.5" />
              Record
            </>
          )}
        </Button>
        {recording && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
            Listening
          </span>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ─── Player ─────────────────────────────────────────────────────────────────

export function VoiceMemoPlayer({
  url,
  mime,
  durationSeconds,
}: {
  url: string;
  mime?: string | null;
  durationSeconds?: number | null;
}) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  const playable = canPlay(mime);

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const onEnd = () => setPlaying(false);
    const onError = () => {
      setFailed(true);
      setPlaying(false);
    };
    el.addEventListener("ended", onEnd);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("ended", onEnd);
      el.removeEventListener("error", onError);
    };
  }, []);

  // Said rather than shown as a broken control. `canPlayType` returning empty
  // is a definite no — most often an Android WebM recording opened on an
  // iPhone, which has no decoder for it.
  if (!playable || failed) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2">
        <AudioLines className="h-4 w-4 text-muted-foreground/50 shrink-0" />
        <span className="text-xs text-muted-foreground">
          This recording won't play on this device.
        </span>
        <a
          href={url}
          download
          className="text-xs text-[hsl(var(--gold))] hover:underline ml-auto shrink-0"
        >
          Download
        </a>
      </div>
    );
  }

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      void el.play().then(() => setPlaying(true)).catch(() => setFailed(true));
    }
  };

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-[hsl(var(--gold))]/20 bg-[hsl(var(--gold))]/5 px-3 py-2 max-w-xs">
      {/* preload="none" — a room of thirty memos should not fetch thirty audio
          files on scroll, especially on a phone paying for the data. */}
      <audio ref={audio} src={url} preload="none" />
      <button
        onClick={toggle}
        className="h-8 w-8 rounded-full bg-[hsl(var(--gold))] grid place-items-center shrink-0 tap-clean"
        aria-label={playing ? "Pause" : "Play recording"}
        data-testid="button-play-memo"
      >
        {playing ? (
          <Pause className="h-4 w-4 text-[hsl(var(--ink))]" />
        ) : (
          <Play className="h-4 w-4 text-[hsl(var(--ink))] ml-0.5" />
        )}
      </button>

      {/* A static waveform. It is decoration and does not claim to be the
          actual amplitude — drawing a real one means decoding every file on
          load, which is the exact cost preload="none" just avoided. */}
      <span className="flex items-center gap-[3px] flex-1 h-6" aria-hidden="true">
        {[6, 11, 8, 15, 10, 18, 12, 9, 14, 7, 12, 16, 9, 6, 11].map((h, i) => (
          <span
            key={i}
            className={cn(
              "flex-1 rounded-full",
              playing ? "bg-[hsl(var(--gold))]" : "bg-[hsl(var(--gold))]/40",
            )}
            style={{ height: `${h}px` }}
          />
        ))}
      </span>

      {durationSeconds ? (
        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
          {formatDuration(durationSeconds)}
        </span>
      ) : null}
    </div>
  );
}
