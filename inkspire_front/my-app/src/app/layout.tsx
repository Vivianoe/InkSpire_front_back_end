import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import "@/app/ui/ui.module.css";
// import MswInit from "@/components/MswInit"; // MSW disabled - connecting to FastAPI backend
// PDF.js CSS is loaded via CDN in <head> below - local import causes image path resolution issues

export const metadata: Metadata = {
  title: "My App",
  description: "Figma → Next.js Quick Skeleton",
};


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* globals.css is imported at the top, so it loads before PDF.js CSS */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/web/pdf_viewer.css"
        />
        <Script
          src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.min.js"
          strategy="beforeInteractive"
        />
        <Script id="pdfjs-worker-src" strategy="beforeInteractive">
          {`
            if (window['pdfjsLib']) {
              window['pdfjsLib'].GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.worker.min.js';
            }
          `}
        </Script>
      </head>
      <body>
        {/* MSW disabled - connecting to FastAPI backend */}
        {/* {process.env.NODE_ENV === 'development' ? <MswInit /> : null} */}
        <main>{children}</main>
      </body>
    </html>
  );
}