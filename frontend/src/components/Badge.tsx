import type { ReactNode } from 'react';

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'green' | 'orange' | 'muted' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
