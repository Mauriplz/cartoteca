import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cartoteca — precios e inversión en cartas Pokémon",
  description:
    "Precios de todas las cartas Pokémon de todas las ediciones, y el ranking de las que presentan mayor desajuste de valoración.",
};

const NAV = [
  { href: "/", label: "Ranking" },
  { href: "/cartas", label: "Cartas" },
  { href: "/ilustradores", label: "Ilustradores" },
  { href: "/metodologia", label: "Metodología" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <nav className="nav">
          <div className="wrap nav-inner">
            <a href="/" className="brand">
              Carto<span>teca</span>
            </a>
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="link">
                {n.label}
              </a>
            ))}
          </div>
        </nav>
        <main className="wrap" style={{ padding: "28px 20px 80px" }}>{children}</main>
      </body>
    </html>
  );
}
