import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PISTA — Meet Someone New (18+)",
  description:
    "PISTA is a premium, secure 18+ random 1-to-1 video and text chat platform. Connect with strangers instantly, safely, and privately.",
  keywords: ["chat", "video chat", "text chat", "random chat", "1-to-1 video chat", "meet strangers", "PISTA"],
  authors: [{ name: "PISTA Team" }],
  metadataBase: new URL(process.env.NEXT_PUBLIC_WEB_APP_ORIGIN || "http://localhost:3000"),
  openGraph: {
    title: "PISTA — Meet Someone New (18+)",
    description:
      "PISTA is a premium, secure 18+ random 1-to-1 video and text chat platform. Connect with strangers instantly, safely, and privately.",
    url: "/",
    siteName: "PISTA",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PISTA — Meet Someone New (18+)",
    description: "PISTA is a premium, secure 18+ random 1-to-1 video and text chat platform.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <body className={`${inter.className} bg-zinc-950 text-zinc-100 antialiased`}>
        {children}
      </body>
    </html>
  );
}
