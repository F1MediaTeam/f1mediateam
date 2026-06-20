// Site logo. Source is /public/logo.png — a square image with the F1 Media
// Team mark glowing on a soft gray field.
//
// Two presentations:
//   <Logo />          — full square art (use on login + splash surfaces)
//   <Logo compact />  — bg-image with center-crop so only the horizontal
//                       logo band shows. Good for headers/sidebars.

import Image from "next/image";
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
    // background-image with bg-size > container height lets us crop the
    // empty top/bottom of the square art and show only the logo band.
    const bgScale = Math.round(width * 1.0); // image width when scaled
    return (
      <div
        role="img"
        aria-label="F1 Media Team"
        className={cn("bg-no-repeat bg-center", className)}
        style={{
          width,
          height,
          backgroundImage: "url(/logo.png)",
          backgroundSize: `${bgScale}px auto`,
        }}
      />
    );
  }

  return (
    <Image
      src="/logo.png"
      alt="F1 Media Team"
      width={size}
      height={size}
      priority
      className={cn("select-none", className)}
    />
  );
}
