import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SSC CGL Answer Key & Score Calculator (HN Edition)",
  description:
    "Instant, minimal, and high-performance SSC CGL score calculator and answer key analyzer.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">{children}</body>
    </html>
  );
}
