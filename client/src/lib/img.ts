/**
 * Responsive sources for the retreat photography.
 *
 * Every photograph in /images is stored twice: the original at 1500px and a
 * -800 variant. Before this, a phone downloaded the 1500px file — around four
 * times the pixels a 390px screen can show even at 2× density, across 4.3MB of
 * images. The 800px set is 1.4MB and indistinguishable on the device it is
 * for.
 *
 * `sizes` is the part that actually decides which file the browser fetches,
 * and it has to describe the *layout*, not the image. A full-bleed band is
 * 100vw; a plate in a two-column grid is 100vw on a phone and about half a
 * container on a desktop. Getting it wrong costs more than having no srcset at
 * all, because the browser will confidently pick the larger file.
 */

/** Widths we actually have on disk. Keep in step with script/images. */
const SMALL_SUFFIX = "-800";
const SMALL_WIDTH = 800;
const FULL_WIDTH = 1500;

export interface ResponsiveImage {
  src: string;
  srcSet: string;
  sizes: string;
}

/**
 * @param src   Path under /images, e.g. "/images/stone-villa.webp".
 * @param sizes A CSS `sizes` value describing how wide the image renders.
 */
export function responsive(src: string, sizes: string): ResponsiveImage {
  // Anything that isn't one of our own /images/*.webp files is passed through
  // untouched — there is no -800 twin for a remote or generated URL, and a
  // srcset pointing at a 404 is worse than none.
  const isOurs = src.startsWith("/images/") && src.endsWith(".webp");
  if (!isOurs) return { src, srcSet: "", sizes: "" };

  const small = src.replace(/\.webp$/, `${SMALL_SUFFIX}.webp`);
  return {
    src,
    srcSet: `${small} ${SMALL_WIDTH}w, ${src} ${FULL_WIDTH}w`,
    sizes,
  };
}

/** Full-bleed band: the image is the width of the viewport. */
export const SIZES_FULL_BLEED = "100vw";

/**
 * A plate inside a centred container — the diagonal stack, a two-column
 * section. Full width on a phone, roughly half a 1152px container above that.
 */
export const SIZES_HALF = "(min-width: 1024px) 560px, 100vw";

/** A card in a deck: fixed at 19–21rem, so it never needs the large file. */
export const SIZES_CARD = "336px";
