import type { Metadata } from "next";
import { Montserrat, Open_Sans } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-montserrat",
});

const openSans = Open_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
  variable: "--font-open-sans",
});

export const metadata: Metadata = {
  title: "Shane Hall | Elite Mentorship, Fitness & Entrepreneurship",
  description: "Transform your life through fitness, art, and entrepreneurial success with guidance from Shane Hall.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${montserrat.variable} ${openSans.variable}`}>
      <body className="bg-black text-white antialiased selection:bg-[#00a2ed] selection:text-white">
        {children}
      </body>
    </html>
  );
}
