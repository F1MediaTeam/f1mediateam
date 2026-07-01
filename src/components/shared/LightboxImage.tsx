"use client";

// Fixed-size image thumbnail that opens a full-screen ImageLightbox on click
// instead of navigating away. Used inside server components (admin thread) so
// they can drop in an interactive preview without becoming client themselves.

import { useState } from "react";
import ImageLightbox from "@/components/shared/ImageLightbox";

interface Props {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

export default function LightboxImage({ src, alt, width = 260, height = 200 }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Preview ${alt}`}
        className="block rounded-xl overflow-hidden border border-[var(--color-border)] hover:opacity-90 transition cursor-zoom-in checker-bg"
        style={{ width, height }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="w-full h-full object-contain" />
      </button>
      {open ? <ImageLightbox src={src} alt={alt} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
