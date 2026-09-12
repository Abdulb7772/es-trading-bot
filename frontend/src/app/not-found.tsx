export default function NotFound() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>404</h1>
        <p>Page not found.</p>
        <a href="/" style={{ color: '#3b82f6' }}>Back to dashboard</a>
      </div>
    </div>
  );
}
