import { useEffect } from "react";

const DEFAULT_TITLE = "Sakred Body — Live in Harmony. Build Real Strength.";

/**
 * Sets the document title and meta description per route. This is a client-rendered
 * SPA, so without this every page would inherit index.html's tags.
 */
export function usePageMeta(title: string, description?: string) {
  useEffect(() => {
    document.title = title;

    if (description) {
      for (const selector of ['meta[name="description"]', 'meta[property="og:description"]']) {
        document.querySelector(selector)?.setAttribute("content", description);
      }
    }
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", title);

    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title, description]);
}
