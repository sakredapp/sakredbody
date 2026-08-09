/**
 * Recording and playing voice memos across two platforms that disagree.
 *
 * ── The problem, stated plainly ───────────────────────────────────────────
 *
 * `MediaRecorder` does not produce the same thing everywhere:
 *
 *   - iOS Safari records `audio/mp4` (AAC) and **cannot play `audio/webm` at
 *     all** — no codec, no fallback, silence.
 *   - Android Chrome records `audio/webm` (Opus) by default and plays both.
 *
 * Left alone, that means a memo recorded on Android is unplayable on every
 * iPhone in the community. It is not a rare edge case; it is half the users
 * failing to hear the other half, and it would look like the feature is broken
 * rather than like a codec mismatch.
 *
 * ── What this does about it ───────────────────────────────────────────────
 *
 * Records in the most widely playable format the device offers, preferring
 * MP4/AAC — which every browser and both native shells can play — and only
 * falling back to WebM when MP4 recording isn't available.
 *
 * The real recorded type is then stored with the file, so playback can check
 * `canPlayType` and say "this can't play on this device" rather than rendering
 * a control that produces nothing.
 *
 * ── The proper fix, for when the native shell lands ───────────────────────
 *
 * A Capacitor voice-recorder plugin records `.m4a` on both platforms and
 * removes the negotiation entirely. Until then this gets it right on iOS,
 * right on Android where Chrome supports MP4 recording, and honest everywhere
 * else.
 */

/** In order of preference. First is the one everything can play. */
const CANDIDATES = [
  "audio/mp4",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/aac",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
];

/**
 * The best mime this device can record.
 *
 * Returns undefined when nothing matches, which is a valid answer —
 * `MediaRecorder` then picks its own default, and we read back what it
 * actually chose rather than assuming.
 */
export function bestRecordingMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return CANDIDATES.find((m) => {
    try {
      return MediaRecorder.isTypeSupported(m);
    } catch {
      return false;
    }
  });
}

export function canRecord(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

/**
 * Can this device play a recording of this type?
 *
 * `canPlayType` answers "", "maybe" or "probably". Empty means definitely not,
 * and that is the only answer worth acting on — treating "maybe" as a failure
 * would hide recordings that play perfectly well.
 */
export function canPlay(mime: string | null | undefined): boolean {
  if (!mime) return true; // nothing claimed; let the element try
  if (typeof document === "undefined") return true;
  try {
    const el = document.createElement("audio");
    return el.canPlayType(mime) !== "";
  } catch {
    return true;
  }
}

export interface Recording {
  blob: Blob;
  mime: string;
  durationSeconds: number;
}

/**
 * A recorder that owns its microphone track.
 *
 * The stop handler releases every track explicitly. Without that the recording
 * indicator stays lit in the status bar after the member has finished, which
 * reads as an app still listening to them — the single most alarming thing a
 * wellness app can do.
 */
export class VoiceRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private startedAt = 0;

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = bestRecordingMime();

    this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.chunks = [];
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.startedAt = Date.now();
    // A timeslice, so a long recording arrives in pieces rather than as one
    // buffer the browser holds until the very end.
    this.recorder.start(1000);
  }

  async stop(): Promise<Recording> {
    const recorder = this.recorder;
    if (!recorder) throw new Error("Not recording");

    const finished = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.stop();
    await finished;

    this.release();

    // What the recorder actually produced, not what was asked for — the two
    // differ when the requested mime wasn't supported and it chose its own.
    const mime = recorder.mimeType || bestRecordingMime() || "audio/webm";
    const blob = new Blob(this.chunks, { type: mime });

    return {
      blob,
      mime,
      // Rounded up: a 0.4s tap is a real recording and a duration of 0 would
      // fail the server's minimum and lose it.
      durationSeconds: Math.max(1, Math.round((Date.now() - this.startedAt) / 1000)),
    };
  }

  /** Safe to call twice, and called on unmount as well as on stop. */
  release(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
  }

  get elapsedSeconds(): number {
    return this.startedAt ? Math.round((Date.now() - this.startedAt) / 1000) : 0;
  }
}

/** Base64 without the `data:` prefix, which the upload endpoint doesn't want. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  // Chunked: String.fromCharCode(...bytes) on a multi-megabyte array blows the
  // argument limit and throws a RangeError on exactly the long recordings this
  // is most needed for.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    // `apply` rather than spread: spreading a typed array needs
    // downlevelIteration under this tsconfig, and apply takes the same
    // argument list without it.
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + CHUNK)) as unknown as number[],
    );
  }
  return btoa(binary);
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
