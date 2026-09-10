'use client';

import { useState } from 'react';
import Link from 'next/link';

const navItems = [
  ['▦', 'Dashboard', '/'],
  ['⌁', 'Levels', '/levels'],
  ['◈', 'Strategy', '/strategy'],
  ['◎', 'Evaluations', '/evaluations'],
  ['↗', 'Trades', '/trades'],
  ['◫', 'Simulator', '/simulator'],
  ['≡', 'Logs', '/logs'],
  ['⚙', 'System', '/system'],
] as const;

export function Nav({ activeLabel }: { activeLabel: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <>
      <button className="mobile-menu" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} onClick={() => setMenuOpen(!menuOpen)}>☰</button>
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand"><div className="brand-mark">ES / 01</div><div className="brand-name">Control room</div></div>
        <div className="nav-label">Workspace</div>
        <nav className="nav-list" aria-label="Main navigation">
          {navItems.map(([icon, label, href]) => (
            <Link
              key={label}
              href={href}
              className={`nav-item ${label === activeLabel ? 'active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              <span className="nav-icon">{icon}</span>{label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer"><strong>Local practice environment</strong><br />Execution is isolated and disabled by default.</div>
      </aside>
    </>
  );
}
