interface YinYangProps {
  className?: string;
  /** Rotation in degrees — lets the mark sit differently in different sections. */
  rotate?: number;
  /**
   * Colour of the "empty" half. Must be opaque and match the surface behind the
   * mark, otherwise the light half disappears into the dark half.
   */
  voidColor?: string;
}

/**
 * Yin-yang mark drawn from the brand's gold tokens rather than an image asset,
 * so it stays crisp and recolors with the theme. The filled half uses
 * currentColor; the empty half uses `voidColor`.
 */
export function YinYang({ className, rotate = 0, voidColor = "hsl(var(--background))" }: YinYangProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
      role="presentation"
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="49" fill={voidColor} />
      <path
        d="M50,1 A49,49 0 0 1 50,99 A24.5,24.5 0 0 1 50,50 A24.5,24.5 0 0 0 50,1 Z"
        fill="currentColor"
      />
      <circle cx="50" cy="25.5" r="7.5" fill={voidColor} />
      <circle cx="50" cy="74.5" r="7.5" fill="currentColor" />
      <circle cx="50" cy="50" r="49" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
    </svg>
  );
}
