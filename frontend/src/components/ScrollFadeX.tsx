import { useEffect, useRef, useState } from "react";

const FADE_PX = 28;

/**
 * Drop-in replacement for a plain `overflow-x-auto` div. When the content
 * actually overflows, it fades the scrolled-past edge(s) to transparent via
 * a dynamically computed mask - the only reliable way to signal "there's
 * more to scroll" for horizontally-clipped nav strips and tables (the admin
 * sub-tabs and most data tables here have no other affordance, so content
 * past the viewport edge is silently undiscoverable, especially on mobile).
 * No mask is applied when content fits, so nothing changes in that case.
 */
export default function ScrollFadeX({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mask, setMask] = useState<string | undefined>(undefined);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function update() {
      if (!el) return;
      const canScrollLeft = el.scrollLeft > 2;
      const canScrollRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
      if (!canScrollLeft && !canScrollRight) {
        setMask(undefined);
        return;
      }
      const leftStop = canScrollLeft ? `${FADE_PX}px` : "0px";
      const rightStop = canScrollRight ? `calc(100% - ${FADE_PX}px)` : "100%";
      setMask(`linear-gradient(to right, transparent, black ${leftStop}, black ${rightStop}, transparent)`);
    }

    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`overflow-x-auto ${className}`}
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
    >
      {children}
    </div>
  );
}
