import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistration } from "@/components/sw-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Jimpitan", template: "%s · Jimpitan" },
  description: "Catat jimpitan ronda dengan scan QR per rumah.",
  applicationName: "Jimpitan",
  appleWebApp: { capable: true, title: "Jimpitan", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
