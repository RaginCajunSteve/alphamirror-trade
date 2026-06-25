"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletConnectButton } from "./WalletConnectButton";

const links = [
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/pricing", label: "Pricing" },
  { href: "/support", label: "Support" },
  { href: "/status", label: "Status" },
  { href: "/how-it-works", label: "How it works" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="border-b border-border/60 bg-surface/80 backdrop-blur-md sticky top-0 z-40">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20 text-accent text-sm">
            α
          </span>
          <span>Alpha Mirror</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                pathname === link.href
                  ? "text-accent"
                  : "text-muted hover:text-foreground transition-colors"
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <WalletConnectButton />
      </div>
    </header>
  );
}