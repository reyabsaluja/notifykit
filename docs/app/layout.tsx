import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { NotifyKitProvider } from "@notifykitjs/react";
import {
  GITHUB_URL,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from "../lib/site";
import { CopyButtonScript } from "./_components/copy-button-script";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: {
    default: SITE_TITLE,
    template: "%s — NotifyKit Docs",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: "Reyab Saluja", url: GITHUB_URL }],
  creator: "Reyab Saluja",
  publisher: SITE_NAME,
  category: "developer tools",
  keywords: [
    "TypeScript notifications",
    "notification infrastructure",
    "in-app notifications",
    "notification framework",
    "Next.js notifications",
    "React notification inbox",
    "open source notifications",
  ],
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.png", type: "image/png", sizes: "32x32" }],
    shortcut: ["/icon.png"],
    apple: [{ url: "/logo.png", type: "image/png", sizes: "1254x1254" }],
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    siteName: SITE_NAME,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  referrer: "origin-when-cross-origin",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
  themeColor: "#000000",
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL.origin}/#website`,
      name: SITE_NAME,
      url: SITE_URL.origin,
      description: SITE_DESCRIPTION,
      inLanguage: "en-US",
    },
    {
      "@type": "SoftwareSourceCode",
      "@id": `${SITE_URL.origin}/#software`,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      url: SITE_URL.origin,
      codeRepository: GITHUB_URL,
      license: "https://opensource.org/license/mit",
      programmingLanguage: "TypeScript",
      runtimePlatform: "Node.js",
      isAccessibleForFree: true,
      author: {
        "@type": "Person",
        name: "Reyab Saluja",
        url: "https://reyabsaluja.com",
      },
    },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Tomorrow:wght@400;500&family=Geist:wght@300;400;450;500;600&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <NotifyKitProvider options={{ baseUrl: "/api/notifykit" }}>
          {children}
        </NotifyKitProvider>
        <CopyButtonScript />
      </body>
    </html>
  );
}
