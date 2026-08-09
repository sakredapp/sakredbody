/**
 * What's on.
 *
 * Retreats, masterminds, webinars, talks — one catalogue, because to a member
 * they are the same question: *what can I go to, and can I get in?*
 *
 * Three views: what's coming up (the calendar), the catalogue (browse by kind),
 * and one offering's page. Mobile first — this is read on a phone, standing up,
 * so a card says the four things that decide it (when, where, who, can I get
 * in) and the page carries the rest behind disclosure rather than in a wall.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  Users,
  Video,
  ChevronDown,
  ExternalLink,
  Check,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/portal/Panel";
import {
  OFFERING_KIND_LABELS,
  OFFERING_FORMAT_LABELS,
  type Offering,
  type OfferingSession,
  type Host,
  type RegistrationStatus,
  type OfferingKind,
} from "@shared/schema";

type HostWithRole = Host & { role: string };

interface OfferingCard extends Offering {
  myStatus: RegistrationStatus | null;
  seatsRemaining: number | null;
  hosts: HostWithRole[];
}

interface OfferingDetail extends OfferingCard {
  myNote: string | null;
  sessions: (OfferingSession & { guests: Host[] })[];
}

interface UpcomingSession extends OfferingSession {
  guests: Host[];
  offering: Pick<Offering, "id" | "slug" | "name" | "kind" | "format" | "timezone">;
  myStatus: RegistrationStatus | null;
}

/** What each standing means, in the member's own terms. */
const STANDING: Record<RegistrationStatus, string> = {
  applied: "Applied",
  invited: "Invited",
  confirmed: "You're in",
  waitlist: "Waitlisted",
  declined: "Not this time",
  withdrawn: "Withdrawn",
};

async function get<T>(url: string, label: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load ${label}`);
  return res.json();
}

// ─── Time ──────────────────────────────────────────────────────────────────

/**
 * Session times are absolute (timestamptz), so they render in the reader's own
 * zone — which is what someone wants when deciding whether they can be there.
 * The offering's canonical zone is appended so "7pm ET" stays recognisable to
 * anyone who saw it announced that way.
 */
function sessionTime(iso: string | null, timezone: string): string {
  if (!iso) return "Time to come";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Time to come";

  const local = d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (mine === timezone) return local;

  const there = d.toLocaleTimeString(undefined, {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return `${local} · ${there}`;
}

function dateRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const from = new Date(`${start}T00:00:00`).toLocaleDateString(undefined, opts);
  if (!end || end === start) return from;
  const to = new Date(`${end}T00:00:00`).toLocaleDateString(undefined, {
    ...opts,
    year: "numeric",
  });
  return `${from} – ${to}`;
}

function priceLabel(o: Offering): string {
  if (o.priceCents == null) return o.priceNote ?? "";
  if (o.priceCents === 0) return "Free";
  return `$${(o.priceCents / 100).toLocaleString()}${o.priceNote ? ` ${o.priceNote}` : ""}`;
}

// ─── Small pieces ──────────────────────────────────────────────────────────

function HostRow({ people, size = "sm" }: { people: (Host & { role?: string })[]; size?: "sm" | "md" }) {
  if (people.length === 0) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex -space-x-2">
        {people.slice(0, 4).map((h) => (
          <Avatar
            key={h.id}
            className={cn(
              "ring-2 ring-background",
              size === "md" ? "h-9 w-9" : "h-6 w-6",
            )}
          >
            {h.avatarUrl && <AvatarImage src={h.avatarUrl} alt="" />}
            <AvatarFallback className="text-[9px]">
              {h.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        {people.map((h) => h.name).join(", ")}
      </span>
    </div>
  );
}

function StandingBadge({ status }: { status: RegistrationStatus | null }) {
  if (!status || status === "withdrawn") return null;
  const good = status === "confirmed";
  return (
    <Badge
      variant={good ? "default" : "outline"}
      className={cn("text-[10px] gap-1", good && "bg-[hsl(var(--gold))] text-background")}
      data-testid={`standing-${status}`}
    >
      {good && <Check className="h-2.5 w-2.5" />}
      {STANDING[status]}
    </Badge>
  );
}

/** The four facts that decide whether someone can come. */
function Facts({ offering, className }: { offering: Offering; className?: string }) {
  const range = dateRange(offering.startDate, offering.endDate);
  const online = offering.format !== "in_person";

  return (
    <div className={cn("flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-muted-foreground", className)}>
      {range && (
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-3 w-3" /> {range}
        </span>
      )}
      <span className="inline-flex items-center gap-1.5">
        {online ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
        {offering.format === "in_person"
          ? offering.location || "In person"
          : OFFERING_FORMAT_LABELS[offering.format as keyof typeof OFFERING_FORMAT_LABELS]}
      </span>
      {priceLabel(offering) && <span>{priceLabel(offering)}</span>}
    </div>
  );
}

// ─── Card ──────────────────────────────────────────────────────────────────

function Card({ offering, onOpen }: { offering: OfferingCard; onOpen: () => void }) {
  const nearlyFull =
    offering.seatsRemaining !== null && offering.seatsRemaining > 0 && offering.seatsRemaining <= 3;

  return (
    <button
      onClick={onOpen}
      className="w-full text-left border border-border/60 rounded-lg overflow-hidden hover:border-[hsl(var(--gold))]/40 transition-colors"
      data-testid={`offering-card-${offering.slug}`}
    >
      {offering.coverUrl && (
        <img src={offering.coverUrl} alt="" className="w-full h-36 object-cover" />
      )}

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-[10px]">
                {OFFERING_KIND_LABELS[offering.kind as OfferingKind] ?? offering.kind}
              </Badge>
              <StandingBadge status={offering.myStatus} />
            </div>
            <h3 className="font-display text-lg leading-tight">{offering.name}</h3>
          </div>
        </div>

        {offering.summary && (
          <p className="text-sm text-muted-foreground line-clamp-2">{offering.summary}</p>
        )}

        <Facts offering={offering} />
        <HostRow people={offering.hosts} />

        {/* Scarcity only when it's true. "12 seats left" on a webinar with
            unlimited capacity is noise that trains people to ignore it. */}
        {nearlyFull && (
          <p className="text-xs text-[hsl(var(--gold))] inline-flex items-center gap-1.5">
            <Users className="h-3 w-3" />
            {offering.seatsRemaining} {offering.seatsRemaining === 1 ? "place" : "places"} left
          </p>
        )}
      </div>
    </button>
  );
}

// ─── One offering ──────────────────────────────────────────────────────────

function SessionRow({
  session,
  timezone,
  confirmed,
}: {
  session: OfferingSession & { guests: Host[] };
  timezone: string;
  confirmed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasMore = !!session.agenda || session.guests.length > 0;

  return (
    <div className="border-b border-border/40 last:border-0 py-3">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">{session.title}</p>
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              {sessionTime(session.startsAt ? String(session.startsAt) : null, timezone)}
              {session.durationMinutes ? ` · ${session.durationMinutes} min` : ""}
            </p>
          </div>

          {hasMore && (
            <CollapsibleTrigger asChild>
              <button
                className="text-muted-foreground/60 hover:text-foreground shrink-0 p-1"
                aria-label={open ? "Less" : "More"}
              >
                <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
              </button>
            </CollapsibleTrigger>
          )}
        </div>

        <CollapsibleContent className="pt-3 space-y-3">
          {session.agenda && (
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {session.agenda}
            </p>
          )}
          {session.guests.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
                Guest
              </p>
              <HostRow people={session.guests} />
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* The link only exists in the payload once you're confirmed — this is
          rendering what the server chose to send, not hiding what it sent. */}
      {confirmed && session.meetingUrl && (
        <a
          href={session.meetingUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-xs text-[hsl(var(--gold))] hover:underline"
          data-testid="link-session-join"
        >
          <Video className="h-3 w-3" /> Join <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

function Detail({ id, onBack }: { id: string; onBack: () => void }) {
  const { toast } = useToast();
  const [note, setNote] = useState("");

  const offering = useQuery<OfferingDetail>({
    queryKey: ["/api/offerings", id],
    queryFn: () => get(`/api/offerings/${id}`, "this offering"),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/offerings", id] });
    queryClient.invalidateQueries({ queryKey: ["/api/offerings"], exact: true });
    queryClient.invalidateQueries({ queryKey: ["/api/offerings/mine"] });
    queryClient.invalidateQueries({ queryKey: ["/api/offerings/upcoming"] });
  };

  const register = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/offerings/${id}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ note: note.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "That didn't go through");
      return res.json();
    },
    onSuccess: (r: { status: RegistrationStatus }) => {
      refresh();
      setNote("");
      toast({
        title:
          r.status === "confirmed"
            ? "You're in."
            : r.status === "waitlist"
              ? "You're on the waitlist."
              : "Application sent.",
      });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const withdraw = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/offerings/${id}/withdraw`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "That didn't go through");
      return res.json();
    },
    onSuccess: refresh,
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (offering.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!offering.data) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <p className="text-sm text-muted-foreground py-12 text-center">
          This isn't here any more.
        </p>
      </div>
    );
  }

  const o = offering.data;
  const confirmed = o.myStatus === "confirmed";
  const joined = !!o.myStatus && o.myStatus !== "withdrawn" && o.myStatus !== "declined";
  const full = o.seatsRemaining !== null && o.seatsRemaining <= 0;
  const closed = !["open", "running"].includes(o.status);

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
        data-testid="button-back-to-offerings"
      >
        <ArrowLeft className="h-4 w-4" /> What's on
      </button>

      {o.coverUrl && (
        <img src={o.coverUrl} alt="" className="w-full h-48 sm:h-60 object-cover rounded-lg" />
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-[10px]">
            {OFFERING_KIND_LABELS[o.kind as OfferingKind] ?? o.kind}
          </Badge>
          <StandingBadge status={o.myStatus} />
        </div>
        <h2 className="font-display text-2xl sm:text-3xl leading-tight">{o.name}</h2>
        {o.summary && <p className="text-[15px] text-muted-foreground">{o.summary}</p>}
        <Facts offering={o} />
      </div>

      {o.hosts.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
            Led by
          </p>
          <HostRow people={o.hosts} size="md" />
        </div>
      )}

      {/* The long copy sits behind a disclosure. Someone deciding needs the
          facts above; someone already interested opens this. */}
      {o.description && (
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between gap-3 border-t border-border/50 pt-4 text-left group">
              <span className="text-sm font-medium">What this is</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground group-data-[state=open]:rotate-180 transition-transform" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {o.description}
            </p>
          </CollapsibleContent>
        </Collapsible>
      )}

      {o.sessions.length > 0 && (
        <div className="border-t border-border/50 pt-4">
          <p className="text-sm font-medium mb-1">
            {o.sessions.length === 1 ? "When" : `${o.sessions.length} sessions`}
          </p>
          <div>
            {o.sessions.map((s) => (
              <SessionRow key={s.id} session={s} timezone={o.timezone} confirmed={confirmed} />
            ))}
          </div>
        </div>
      )}

      {/* The door, once it's open to you. */}
      {confirmed && o.meetingUrl && (
        <a
          href={o.meetingUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 w-full rounded-md bg-[hsl(var(--gold))] text-background py-3 text-sm font-medium"
          data-testid="link-offering-join"
        >
          <Video className="h-4 w-4" /> Join the room
        </a>
      )}

      <div className="border-t border-border/50 pt-5 space-y-3">
        {joined ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground">
              {o.myStatus === "confirmed"
                ? "You have a place."
                : o.myStatus === "applied"
                  ? "Your application is with the host."
                  : o.myStatus === "waitlist"
                    ? "We'll be in touch if a place opens."
                    : "You've been invited — take your place below."}
            </p>
            <Button variant="ghost" size="sm" onClick={() => withdraw.mutate()}>
              {o.myStatus === "applied" ? "Withdraw application" : "Leave"}
            </Button>
          </div>
        ) : closed ? (
          <p className="text-sm text-muted-foreground">
            {o.status === "complete" ? "This has already happened." : "Not open yet."}
          </p>
        ) : o.registrationMode === "invite" ? (
          <p className="text-sm text-muted-foreground">This one is by invitation.</p>
        ) : (
          <>
            {o.registrationMode === "application" && (
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  A line about why — the host reads this.
                </label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  className="resize-none"
                  data-testid="input-application-note"
                />
              </div>
            )}
            <Button
              onClick={() => register.mutate()}
              disabled={register.isPending}
              className="w-full bg-gold border-gold-border text-white"
              data-testid="button-register"
            >
              {o.registrationMode === "application"
                ? "Apply"
                : full
                  ? "Join the waitlist"
                  : "Take a place"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Upcoming ──────────────────────────────────────────────────────────────

function Upcoming({ onOpen }: { onOpen: (id: string) => void }) {
  const sessions = useQuery<UpcomingSession[]>({
    queryKey: ["/api/offerings/upcoming"],
    queryFn: () => get("/api/offerings/upcoming", "the calendar"),
  });

  if (sessions.isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!sessions.data || sessions.data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-12 text-center">
        Nothing on the calendar yet.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border/40">
      {sessions.data.map((s) => (
        <button
          key={s.id}
          onClick={() => onOpen(s.offering.slug)}
          className="w-full text-left py-4 flex items-start justify-between gap-3 hover:bg-muted/30 px-2 -mx-2 rounded-md"
          data-testid={`upcoming-${s.id}`}
        >
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">{s.title}</p>
            <p className="text-xs text-muted-foreground">
              {s.offering.name} ·{" "}
              {sessionTime(s.startsAt ? String(s.startsAt) : null, s.offering.timezone)}
            </p>
            {s.guests.length > 0 && <HostRow people={s.guests} />}
          </div>
          <StandingBadge status={s.myStatus} />
        </button>
      ))}
    </div>
  );
}

// ─── The tab ───────────────────────────────────────────────────────────────

const VIEWS = [
  { key: "upcoming" as const, label: "Coming up" },
  { key: "all" as const, label: "Everything" },
  { key: "mine" as const, label: "Mine" },
];

export function OfferingsTab() {
  const [view, setView] = useState<"upcoming" | "all" | "mine">("upcoming");
  const [openId, setOpenId] = useState<string | null>(null);
  const [kind, setKind] = useState<string | null>(null);

  const all = useQuery<OfferingCard[]>({
    queryKey: ["/api/offerings"],
    queryFn: () => get("/api/offerings", "what's on"),
    enabled: view === "all",
  });

  const mine = useQuery<OfferingCard[]>({
    queryKey: ["/api/offerings/mine"],
    queryFn: () => get("/api/offerings/mine", "yours"),
    enabled: view === "mine",
  });

  if (openId) {
    return <Detail id={openId} onBack={() => setOpenId(null)} />;
  }

  const list = view === "mine" ? mine : all;
  const rows = (list.data ?? []).filter((o) => !kind || o.kind === kind);

  // Only offer filters that would actually return something.
  const kinds = Array.from(new Set((list.data ?? []).map((o) => o.kind)));

  return (
    <div className="space-y-6">
      <SectionHeading
        title="What's on"
        subtitle="Retreats, masterminds, and the people we bring in to talk."
      />

      <div className="flex gap-1 overflow-x-auto scrollbar-thin">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => {
              setView(v.key);
              setKind(null);
            }}
            className={cn(
              "px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition-colors",
              view === v.key
                ? "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))] font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
            data-testid={`offerings-view-${v.key}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >
          {view === "upcoming" ? (
            <Upcoming onOpen={setOpenId} />
          ) : list.isLoading ? (
            <div className="grid sm:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-56 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              {view === "mine" ? "You haven't joined anything yet." : "Nothing here yet."}
            </p>
          ) : (
            <div className="space-y-4">
              {kinds.length > 1 && (
                <div className="flex gap-1 overflow-x-auto scrollbar-thin pb-1">
                  <button
                    onClick={() => setKind(null)}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded-full whitespace-nowrap border transition-colors",
                      kind === null
                        ? "border-[hsl(var(--gold))] text-[hsl(var(--gold))]"
                        : "border-border/60 text-muted-foreground",
                    )}
                  >
                    All
                  </button>
                  {kinds.map((k) => (
                    <button
                      key={k}
                      onClick={() => setKind(k)}
                      className={cn(
                        "px-2.5 py-1 text-xs rounded-full whitespace-nowrap border transition-colors",
                        kind === k
                          ? "border-[hsl(var(--gold))] text-[hsl(var(--gold))]"
                          : "border-border/60 text-muted-foreground",
                      )}
                    >
                      {OFFERING_KIND_LABELS[k as OfferingKind] ?? k}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                {rows.map((o) => (
                  <Card key={o.id} offering={o} onOpen={() => setOpenId(o.slug)} />
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
