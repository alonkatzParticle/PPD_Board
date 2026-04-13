import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/NavBar";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "PPD Marketing Dashboard",
  description: "Track upcoming marketing tasks from Monday.com boards for the PPD team",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased bg-zinc-950 text-zinc-100 min-h-screen`}>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
