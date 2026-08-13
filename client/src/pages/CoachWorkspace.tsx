/**
 * Coach.
 *
 * ── Why this is a separate place and not a mode on the member dashboard ───
 *
 * Nick is a member who also coaches. He has his own terrain, his own habits,
 * his own plan, and he is entitled to use Sakred for himself without his
 * client list on the screen. Turning his dashboard into a management console
 * the moment he was given the role would take his own practice away from him to
 * pay for the job.
 *
 * So: two doors. His member experience is untouched, and Coach is somewhere he
 * goes.
 *
 * ── Two sections, deliberately ────────────────────────────────────────────
 *
 * Clients, and the conversation inside a client. Not six tabs, four of which
 * would be empty — an empty destination reads as something broken or as
 * something the coach has failed to use, and there is no version of that a
 * label fixes. More sections when there is more to put in them.
 */

import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useAccess } from "@/hooks/use-access";
import { ClientRoster } from "@/components/coach/ClientRoster";
import { ClientWorkspace } from "@/components/coach/ClientWorkspace";

export default function CoachWorkspacePage() {
  const { user, isLoading } = useAuth();
  const access = useAccess();
  /**
   * The name comes along so the header has something to show while the
   * overview is still in flight. It is replaced by the server's answer the
   * moment that lands — the roster's copy is a placeholder, not a source.
   */
  const [openClient, setOpenClient] = useState<{ id: string; name: string } | null>(null);

  if (isLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">Sign in to continue.</p>
          <Link href="/login" className="text-sm text-[hsl(var(--gold))]">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  /**
   * Capability, not relationship.
   *
   * This gate answers "may this account do coach-shaped things at all", which
   * is the only question a *page* can answer. Which members they may open is
   * decided per request on the server, against `coach_relationships` — hiding a
   * screen is manners, not access control.
   */
  if (!access.atLeast("coach")) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <p className="text-sm">This area is for Sakred coaches.</p>
          <Link href="/member" className="text-sm text-[hsl(var(--gold))]">
            Back to Sakred
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Coach</p>
            {!openClient && <h1 className="text-xl mt-1">Clients</h1>}
          </div>
          {/* The way back to his own practice, always visible. */}
          <Link
            href="/member"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors tap-clean"
            data-testid="coach-exit"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            My Sakred
          </Link>
        </header>

        {openClient ? (
          <ClientWorkspace
            memberId={openClient.id}
            memberName={openClient.name}
            onBack={() => setOpenClient(null)}
          />
        ) : (
          <ClientRoster onOpen={(id, name) => setOpenClient({ id, name })} />
        )}
      </div>
    </div>
  );
}
