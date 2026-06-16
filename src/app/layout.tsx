import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sans = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-display", display: "swap", weight: ["400", "500", "600", "700"] });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Light Chat",
  description: "轻量化 OpenAI-compatible Web Chat",
  icons: {
    icon: [
      {
        url: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect width='24' height='24' rx='5' fill='%23c96442'/><g fill='none' stroke='%23ffffff' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='m12 5 1.2 3.8L17 10l-3.8 1.2L12 15l-1.2-3.8L7 10l3.8-1.2L12 5Z'/><path d='m17 13 .6 1.6L19.2 15.4l-1.6.6L17 17.6l-.6-1.6L14.8 15.4l1.6-.6L17 13ZM6 5l.5 1.3L7.8 6.8 6.5 7.3 6 8.6l-.5-1.3L4.2 6.8l1.3-.5L6 5Z'/></g></svg>",
        type: "image/svg+xml"
      }
    ]
  }
};

// 首屏渲染前同步应用主题，避免深色/浅色闪烁
const themeScript = `(function(){try{var s=localStorage.getItem('theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var d=s?s==='dark':m;var e=document.documentElement;if(d){e.classList.add('dark');}e.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN" className={`${sans.variable} ${display.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
