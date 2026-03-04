import "./globals.css";
import type { Metadata, Viewport } from "next";
import PwaRegister from "@/components/pwa-register";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#050505",
};

export const metadata: Metadata = {
  title: "Aura Comm-Link",
  description: "Secure Encrypted Communication",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "CommLink",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/window.svg",
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Next.js 14+ handles viewport via the exported viewport object, but keeping this fallback just in case */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
      </head>
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
