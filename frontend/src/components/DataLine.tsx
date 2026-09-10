import type { ReactNode } from 'react';

export function DataLine({ label, value }: { label: string; value: ReactNode }) {
  return <div className="inspector-line"><span>{label}</span><strong>{value}</strong></div>;
}
