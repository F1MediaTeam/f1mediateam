// Site logo. Theme-aware via the --logo-img CSS variable (see globals.css):
//   dark theme  → /logo.png       (light mark on a soft gray field)
//   light theme → /logo-light.png (dark mark, reads on light backgrounds)
//
// Two presentations:
//   <Logo />          — full square art (login + splash surfaces)
//   <Logo compact />  — center-cropped so only the horizontal logo band shows
//                       (headers / sidebars).

import { cn } from "@/lib/utils";

interface Props {
  compact?: boolean;
  className?: string;
  size?: number;     // for full mode, width in px
  height?: number;   // for compact mode, container height
  width?: number;    // for compact mode, container width
}

export default function Logo({ compact, className, size = 360, height = 52, width = 200 }: Props) {
  if (compact) {
    // background-image with bg-size > container height crops the empty
    // top/bottom of the square art so only the logo band shows.
    const bgScale = Math.round(width * 1.0);
    return (
      <div
        role="img"
        aria-label="F1 Media Team"
        className={cn("bg-no-repeat bg-center", className)}
        style={{
          width,
          height,
          backgroundImage: "var(--logo-img)",
          backgroundSize: `${bgScale}px auto`,
        }}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label="F1 Media Team"
      className={cn("select-none bg-center bg-no-repeat", className)}
      style={{
        width: size,
        height: size,
        backgroundImage: "var(--logo-img)",
        backgroundSize: "contain",
      }}
    />
  );
}
