import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SSC CGL Answer Key & Score Calculator",
  description:
    "Instant, accurate, and easy-to-use SSC CGL score calculator, section-wise analysis, and answer key analyzer.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="min-h-screen flex flex-col bg-slate-50 text-slate-900 antialiased selection:bg-blue-100 selection:text-blue-900"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
