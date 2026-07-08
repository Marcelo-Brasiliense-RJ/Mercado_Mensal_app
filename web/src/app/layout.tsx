import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppStoreProvider } from "@/lib/store";
import { Toast } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: "Dispensa",
  description: "Controle da dispensa e das compras do mes, por voz no Telegram.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Dispensa", statusBarStyle: "default" },
  icons: { apple: "/icon-180.png" },
};

export const viewport: Viewport = {
  themeColor: "#C15F3C",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const themeInit = `(function(){try{var t=localStorage.getItem('dispensa-theme')||'light';document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <AppStoreProvider>
          {children}
          <Toast />
        </AppStoreProvider>
      </body>
    </html>
  );
}
