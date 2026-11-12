import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AppStoreProvider } from "@/lib/store";
import { Toast } from "@/components/ui/Toast";
import { AutoAtualizar } from "@/components/AutoAtualizar";
import { AvisoIcone } from "@/components/AvisoIcone";
import { LimparCampo } from "@/components/ui/LimparCampo";
import { Teclado } from "@/components/ui/Teclado";

// Fonte do visual novo: geometrica e encorpada nos titulos, servida pelo proprio app.
const fonte = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--fonte-app", display: "swap" });

export const metadata: Metadata = {
  title: "Despensa",
  description: "Controle da despensa e das compras do mês, por voz no Telegram.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Despensa", statusBarStyle: "default" },
  icons: { apple: "/icone-cesta-180.png" },
};

export const viewport: Viewport = {
  themeColor: "#EFEEE9",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const themeInit = `(function(){try{var t=localStorage.getItem('dispensa-theme')||'light';document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={fonte.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <AppStoreProvider>
          {children}
          <Toast />
          <AutoAtualizar />
          <AvisoIcone />
          <LimparCampo />
          <Teclado />
        </AppStoreProvider>
      </body>
    </html>
  );
}
