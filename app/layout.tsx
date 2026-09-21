import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZYNERA 2K26 · VERIDEX",
  description:
    "Participant and presentation management for the VERIDEX Paper Presentation event.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
