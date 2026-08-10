import type { Metadata, Viewport } from "next";
import { getDefaultTheme } from "@/lib/app-settings";
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

// Standard responsive viewport — surfaces stack cleanly on phone widths and
// use the full desktop layout at md: and above. Pinch-zoom stays enabled.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The install-wide default, set from Settings → Preferences. Only used when
  // this browser has no theme of its own; a personal choice always wins.
  // getAppSetting swallows its own failures, so a missing table or an
  // unreachable database renders the built-in default rather than a 500.
  const fallback = await getDefaultTheme();

  return (
    <html
      lang="en"
      data-theme="studio"
      data-mode="light"
      suppressHydrationWarning
      className={`${dmSans.variable} h-full antialiased`}
    >
      <head>
        {/* Apply the saved theme before paint to avoid a flash of the wrong one.
            Kept as a hand-written string rather than importing the registry:
            this has to run before any bundle loads. The id → mode map is the
            only thing duplicated from src/lib/themes.ts. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{" +
              "var m={studio:'light',chalk:'light','chalk-panel':'light',fog:'light','graphite-panel':'light',graphite:'dark','graphite-deep':'dark',charcoal:'dark','obsidian-panel':'dark',obsidian:'dark'};" +
              "var g={dark:'charcoal',light:'fog',carbon:'charcoal',paper:'chalk',ink:'obsidian',redline:'charcoal','redline-dark':'charcoal'};" +
              "var t=localStorage.getItem('theme');t=g[t]||t;" +
              "if(!m[t])t=" + JSON.stringify(fallback) + ";" +
              "if(!m[t])t='studio';" +
              "var d=document.documentElement;" +
              "d.setAttribute('data-theme',t);d.setAttribute('data-mode',m[t]);" +
              "}catch(e){}})();",
          }}
        />
      </head>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
