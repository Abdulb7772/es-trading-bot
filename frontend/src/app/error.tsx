'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Something went wrong</h1>
        <p>{error.message}</p>
        <button onClick={() => reset()} style={{ color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>Try again</button>
      </div>
    </div>
  );
}
