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

// Lock the viewport: no pinch-zoom, no double-tap zoom. The layout is
// designed to fit phone widths natively; pinch-zoom on a webapp UX makes
// fixed elements (header, modals, hamburger drawer) drift off-screen.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
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
