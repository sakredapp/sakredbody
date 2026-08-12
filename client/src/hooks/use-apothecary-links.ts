/**
 * Does this piece of guidance have a product behind it?
 *
 * ── One resolver, every surface ───────────────────────────────────────────
 *
 * The same support primitive can appear on a sleep metric, in a Restore
 * recommendation, on Today, in the Apothecary and eventually on a habit. If
 * each of those asks the question its own way, they drift: one keeps showing a
 * product that was deactivated last week, another never learns about a link
 * that was added this morning, and a third hardcodes a sleep-specific lookup
 * that nothing else can use.
 *
 * So the primitive → product relationship is the single source of truth, and
 * this is the single way to read it. A surface asks `linkFor(id)` and gets
 * either a product or null. It never knows which table answered.
 *
 * ── Why the answer is allowed to be null ──────────────────────────────────
 *
 * Because most of the time it is, and that has to be a first-class outcome
 * rather than an error state. Guidance is primary and commerce is secondary:
 * "you slept badly, here is what to do tonight" must never become "you slept
 * badly, buy something". A primitive with no product renders its practice and
 * nothing else — no disabled button, no "coming soon", no empty shelf.
 *
 * That is what lets the engine recommend the *best* intervention rather than
 * whichever one happens to have something for sale. The ten-minute downshift
 * will never have a product and should never look poorer for it.
 *
 * ── Inactive products disappear on their own ──────────────────────────────
 *
 * The server filters on `products.is_active`, so deactivating a product in
 * admin removes the button everywhere without touching a single link row and
 * without altering the guidance. The two are separate layers on purpose.
 */

import { useQuery } from "@tanstack/react-query";

export type ApothecaryLink = {
  /** The link row id. Admin unlinks by this; the member UI ignores it. */
  id: string;
  supportId: string;
  note: string | null;
  productId: string;
  name: string;
  brand: string | null;
  priceCents: number | null;
  priceNote: string | null;
  imageUrl: string | null;
  linkLabel: string | null;
  url: string | null;
};

export function useApothecaryLinks() {
  const query = useQuery<ApothecaryLink[]>({
    queryKey: ["/api/apothecary/guidance-links"],
    queryFn: async () => {
      const r = await fetch("/api/apothecary/guidance-links", { credentials: "include" });
      if (!r.ok) throw new Error("links");
      return r.json();
    },
    // The catalogue changes when somebody in admin changes it, not by the
    // minute. Long enough not to refetch on every card, short enough that a
    // deactivated product stops being offered within a session.
    staleTime: 10 * 60 * 1000,
  });

  /**
   * The product for a primitive, or null.
   *
   * `sortOrder` decides which one wins when several are attached — the shape
   * already allows a primitive to carry a Sakred product and a vetted
   * alternative, while the member interface deliberately shows one. A second
   * call-to-action on a card about sleeping better is a shop.
   */
  const linkFor = (supportId: string): ApothecaryLink | null =>
    query.data?.find((l) => l.supportId === supportId && l.url) ??
    query.data?.find((l) => l.supportId === supportId) ??
    null;

  return { ...query, linkFor };
}
