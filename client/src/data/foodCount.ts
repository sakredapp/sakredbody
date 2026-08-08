/**
 * The one fact the marketing pages need about the chart.
 *
 * Kept apart from `foodChart.ts` on purpose: importing the count used to drag
 * all 197 entries into the entry bundle so the homepage could print a number.
 * Asserted against the real data in the chart module.
 */
export const TOTAL_FOODS = 197;
