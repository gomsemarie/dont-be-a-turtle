import React, { useRef, useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const ScrollArea: React.FC<ScrollAreaProps> = ({
  className,
  children,
  ...props
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumbHeight, setThumbHeight] = useState(0);
  const [thumbTop, setThumbTop] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const dragStart = useRef({ y: 0, scrollTop: 0 });

  const updateThumb = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const { scrollHeight, clientHeight, scrollTop } = el;
    if (scrollHeight <= clientHeight) {
      setThumbHeight(0);
      return;
    }
    const ratio = clientHeight / scrollHeight;
    const tH = Math.max(ratio * clientHeight, 28);
    const tT = (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - tH);
    setThumbHeight(tH);
    setThumbTop(tT);
  }, []);

  const showScrollbar = useCallback(() => {
    setIsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!isDragging) setIsVisible(false);
    }, 1200);
  }, [isDragging]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onScroll = () => {
      updateThumb();
      showScrollbar();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => updateThumb());
    ro.observe(el);
    updateThumb();
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [updateThumb, showScrollbar]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      dragStart.current = {
        y: e.clientY,
        scrollTop: viewportRef.current?.scrollTop ?? 0,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    []
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      const el = viewportRef.current;
      if (!el) return;
      const { scrollHeight, clientHeight } = el;
      const delta = e.clientY - dragStart.current.y;
      const scrollRatio = scrollHeight / clientHeight;
      el.scrollTop = dragStart.current.scrollTop + delta * scrollRatio;
    },
    [isDragging]
  );

  const onPointerUp = useCallback(() => {
    setIsDragging(false);
    hideTimer.current = setTimeout(() => setIsVisible(false), 1200);
  }, []);

  const onTrackClick = useCallback(
    (e: React.MouseEvent) => {
      const el = viewportRef.current;
      const track = trackRef.current;
      if (!el || !track) return;
      const rect = track.getBoundingClientRect();
      const clickRatio = (e.clientY - rect.top) / rect.height;
      el.scrollTop = clickRatio * (el.scrollHeight - el.clientHeight);
    },
    []
  );

  return (
    <div className={cn("relative overflow-hidden", className)} {...props}>
      <div
        ref={viewportRef}
        className="h-full w-full overflow-y-auto overflow-x-hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {children}
      </div>
      {thumbHeight > 0 && (
        <div
          ref={trackRef}
          className={cn(
            "absolute top-0 right-0 w-2.5 h-full transition-opacity duration-300 z-50",
            isVisible || isDragging ? "opacity-100" : "opacity-0"
          )}
          onClick={onTrackClick}
        >
          <div
            ref={thumbRef}
            className={cn(
              "absolute right-0.5 w-1.5 rounded-full transition-colors duration-150",
              isDragging
                ? "bg-foreground/40"
                : "bg-foreground/20 hover:bg-foreground/30"
            )}
            style={{
              height: `${thumbHeight}px`,
              transform: `translateY(${thumbTop}px)`,
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        </div>
      )}
    </div>
  );
};
