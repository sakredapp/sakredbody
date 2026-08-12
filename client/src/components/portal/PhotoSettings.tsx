/**
 * Your photo, after onboarding.
 *
 * ── The gap this closes ───────────────────────────────────────────────────
 *
 * The photo could be set exactly once, on the third screen of onboarding, and
 * never again. PhotoStep was wired into Onboarding and nowhere else, so a
 * member who skipped it half-awake on their first morning — which the step
 * openly invites, "Skip for now" — had no way back, and one who chose a photo
 * they later disliked was stuck with it. Both server routes existed the whole
 * time: POST /api/profile/photo and DELETE /api/profile/photo. Only the door
 * was missing.
 *
 * Removal is offered next to replacement rather than buried, because the two
 * requests are the same request from the member's side: this is not the face I
 * want the room to see. Going back to initials is a legitimate answer to that,
 * not a failure state, so it reads as a plain choice rather than a warning.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { PhotoPicker } from "./PhotoStep";

/** Two letters, or one, or nothing — whatever the name actually gives. */
function initialsOf(first?: string | null, last?: string | null): string {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "·";
}

export function PhotoSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append("photo", file);
      // Not apiRequest: it sets a JSON content-type, and multipart needs the
      // browser to write its own boundary. apiFetch still adds the bearer.
      const res = await apiFetch("/api/profile/photo", { method: "POST", body });
      if (!res.ok) {
        throw new Error((await res.json().catch(() => ({}))).message ?? "That didn't upload.");
      }
      return res.json();
    },
    onSuccess: () => {
      // The header avatar and every post in the Room read the same user row.
      qc.invalidateQueries({ queryKey: ["/api/auth/user"] });
      qc.invalidateQueries({ queryKey: ["/api/community"] });
      toast({ title: "Photo updated" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/profile/photo", { method: "DELETE" });
      if (!res.ok) {
        throw new Error((await res.json().catch(() => ({}))).message ?? "Couldn't remove it.");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/auth/user"] });
      qc.invalidateQueries({ queryKey: ["/api/community"] });
      toast({ title: "Back to your initials" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const busy = save.isPending || remove.isPending;

  return (
    <PhotoPicker
      initials={initialsOf(user?.firstName, user?.lastName)}
      currentUrl={user?.profileImageUrl}
      saving={busy}
      error={save.error instanceof Error ? save.error.message : null}
      onUpload={(file) => save.mutate(file)}
      footer={(open, hasPhoto) => (
        <>
          <Button onClick={open} disabled={busy} data-testid="settings-photo-choose">
            {save.isPending ? "Uploading…" : hasPhoto ? "Change photo" : "Choose a photo"}
          </Button>
          {/*
            Only offered against a photo the server actually holds. `hasPhoto`
            from the picker also counts a local preview of something not yet
            uploaded, and "Remove photo" against an unsaved crop would delete
            the old one instead of cancelling the new one.
          */}
          {user?.profileImageUrl && (
            <Button
              variant="ghost"
              onClick={() => remove.mutate()}
              disabled={busy}
              className="text-muted-foreground"
              data-testid="settings-photo-remove"
            >
              {remove.isPending ? "Removing…" : "Remove photo"}
            </Button>
          )}
        </>
      )}
    />
  );
}
