import './SpinningLogo.css';

interface SpinningLogoProps {
  /** Base path of the logo without extension, e.g. "/logo-96" (served as .webp and .png). */
  src: string;
  /** Intrinsic size in px (width = height). */
  size: number;
  /** Class put on the <img> (sizes the logo; the arm follows the image box). */
  imgClassName?: string;
  /** Class put on the wrapper. */
  className?: string;
}

/**
 * The vinyl Earth logo, played once on mount: a tonearm swings onto the
 * record, the record turns once, then the arm lifts away and disappears.
 *
 * Pure CSS animation (SpinningLogo.css), so it runs when the component mounts:
 * once per page load in the header, each time the About page opens.
 * Decorative only (alt="" and aria-hidden arm): the surrounding link or
 * heading names it. Skipped entirely with reduced motion.
 */
export function SpinningLogo({ src, size, imgClassName, className }: SpinningLogoProps) {
  return (
    <span className={className ? `spinning-logo ${className}` : 'spinning-logo'}>
      <picture>
        <source srcSet={`${src}.webp`} type="image/webp" />
        <img className={`spinning-logo__disc ${imgClassName ?? ''}`.trim()} src={`${src}.png`} width={size} height={size} alt="" />
      </picture>
      {/* Same 100x100 box as the logo: pivot in the empty top-right corner, needle on the ocean "grooves" */}
      <svg className="spinning-logo__arm" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <g className="spinning-logo__arm-swing">
          {/* Tube: pivot -> elbow -> headshell */}
          <path d="M94 6 L86 56 L77 70" className="spinning-logo__tube-outline" />
          <path d="M94 6 L86 56 L77 70" className="spinning-logo__tube" />
          {/* Headshell with the stylus */}
          <rect x="71" y="64" width="12" height="9" rx="2" transform="rotate(33 77 68.5)" className="spinning-logo__head" />
          {/* Pivot base */}
          <circle cx="94" cy="6" r="7" className="spinning-logo__head" />
          <circle cx="94" cy="6" r="2.5" className="spinning-logo__pin" />
        </g>
      </svg>
    </span>
  );
}

export default SpinningLogo;
