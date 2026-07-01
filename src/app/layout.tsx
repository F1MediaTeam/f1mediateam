import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

// Single typeface site-wide. Three weights drive the whole hierarchy:
//   800 → page titles / display headings (h1)
//   700 → section headings, card titles, eyebrow labels, primary buttons
//   400 → body, captions, inputs, anything not above
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "F1 Media Team — Client Portal",
  description: "SEO & marketing reporting platform.",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

// Force desktop-width rendering on mobile: the browser lays out at 1280 CSS
// pixels and scales the whole page down to fit the physical screen. That
// means every sm:/md:/lg:/xl: breakpoint activates the same way it does on a
// laptop — the customer sees the same layout on a phone, no shrunk-to-single-
// column responsive fallback. Pinch-zoom stays enabled so a customer can zoom
// in to read small text or interact with tightly-packed controls.
export const viewport: Viewport = {
  width: 1280,
  initialScale: 0.28,   // 360 / 1280 ≈ 0.28 — fits a typical phone width
  minimumScale: 0.1,
  maximumScale: 4,
  userScalable: true,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${dmSans.variable} h-full antialiased`}
    >
      <head>
        {/* Apply the saved theme before paint to avoid a flash of the wrong theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark')t='dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();",
          }}
        />
      </head>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
