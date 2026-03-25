import type { Metadata } from "next";
import { rubik } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Liftygo CRM",
  description: "CRM MVP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={rubik.variable}>
      <body>{children}</body>
    </html>
  );
}

