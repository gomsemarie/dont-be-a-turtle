import React from "react";
import type { TurtleRank } from "@/stores/use-rank-store";

/** Global cache-bust counter; incremented when rank images are saved. */
let imageCacheBust = Date.now();
export function bumpImageCache() { imageCacheBust = Date.now(); }

interface RankImageProps {
  rank: TurtleRank;
  /** CSS size (e.g., "48px", "5rem"). Applied to both width and height. */
  size?: string;
  className?: string;
}

/**
 * Shows the stick-figure rank image if available, otherwise falls back to emoji.
 * The SVG files live in /public/ranks/ and are served by Vite at /ranks/*.
 */
export const RankImage: React.FC<RankImageProps> = ({
  rank,
  size = "48px",
  className = "",
}) => {
  if (rank.image) {
    return (
      <img
        src={`./ranks/${rank.image}?v=${imageCacheBust}`}
        alt={rank.name}
        className={className}
        style={{
          width: size,
          height: size,
          objectFit: "contain",
          imageRendering: "pixelated",
          filter: `drop-shadow(0 0 8px ${rank.color}40)`,
        }}
        draggable={false}
      />
    );
  }

  // Fallback: emoji text
  return (
    <span
      className={className}
      style={{
        fontSize: size,
        lineHeight: 1,
        filter: `drop-shadow(0 0 8px ${rank.color}40)`,
      }}
    >
      {rank.emoji}
    </span>
  );
};
