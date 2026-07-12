import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);

  return {
    metadataBase,
    title: "XRPFlow — FXRP treasury payments",
    description:
      "Schedule USD-denominated FXRP payments with transparent onchain settlement rules on Flare.",
    applicationName: "XRPFlow",
    keywords: ["Flare", "FXRP", "XRP", "treasury", "payments"],
    openGraph: {
      title: "XRPFlow — FXRP treasury payments",
      description:
        "A practical treasury workspace for scheduling and settling USD-denominated payments in FXRP.",
      type: "website",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "XRPFlow treasury payments" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "XRPFlow — FXRP treasury payments",
      description:
        "Schedule USD-denominated FXRP payments with clear settlement rules.",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
