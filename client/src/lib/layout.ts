/**
 * One column width for the whole portal.
 *
 * The header was `max-w-6xl`, the sub-nav `max-w-6xl`, and the eleven tab
 * panes were a mix of `3xl`, `4xl` and `6xl` chosen a tab at a time. The
 * effect is the thing you actually notice: the nav is wider than the content
 * under it, so nothing lines up down the left edge, and switching tabs shifts
 * the column sideways. It reads as "some of this is centred and some isn't"
 * because the centre of a narrow column and the centre of a wide one are the
 * same point — it's the *edges* that disagree.
 *
 * So: one constant, used by the header, the sub-nav and every pane. A pane
 * that genuinely needs a narrower measure for prose constrains it *inside*
 * the column rather than by shrinking the column, which keeps the left edge
 * fixed no matter what you're looking at.
 *
 * 5xl (64rem) rather than 6xl: wide enough for the ten-item top nav, narrow
 * enough that a paragraph doesn't run to a hundred characters.
 */
export const PORTAL_COLUMN = "container max-w-5xl mx-auto px-4";
