import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { Toaster } from "@/components/ui/toast";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Metademic — Scholarly Publishing Platform",
    template: "%s | Metademic",
  },
  description:
    "Metademic is a modern, open scholarly journal management and publishing platform — submission, peer review, editorial workflow, APC, production, DOI and publication.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  openGraph: {
    title: "Metademic — Scholarly Publishing Platform",
    description: "Submission to publication — peer review, editorial, production, and DOI in one platform.",
    type: "website",
    siteName: "Metademic",
  },
  twitter: {
    card: "summary_large_image",
    title: "Metademic — Scholarly Publishing Platform",
    description: "Submission to publication — peer review, editorial, production, and DOI.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} h-full antialiased`}>
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <QueryProvider>
          <Toaster>{children}</Toaster>
        </QueryProvider>
      </body>
    </html>
  );
}
