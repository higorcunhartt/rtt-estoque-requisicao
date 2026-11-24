import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { Shell } from "@/components/Shell";
import "./globals.css";

const barlow = Barlow({ weight: ["400", "500", "600"], subsets: ["latin"], variable: "--font-barlow" });
const barlowCond = Barlow_Condensed({ weight: ["500", "600", "700"], subsets: ["latin"], variable: "--font-barlow-cond" });

export const metadata: Metadata = {
  title: "Controle de estoque na requisição | RTT",
  description: "Parâmetros de reposição e requisição de compra com saldo de estoque na tela.",
  icons: { icon: "/logo.png" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${barlow.variable} ${barlowCond.variable}`}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
