import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: 20 }}>
      <div
        style={{
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-primary)',
          background: 'var(--card-bg)',
          padding: 24,
          display: 'grid',
          gap: 10,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, color: 'var(--text-primary)' }}>404 - Route Not Found</h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>
          The requested route does not exist in the current Studio IA.
        </p>
        <div style={{ marginTop: 8 }}>
          <Link to="/administration?tab=overview" style={{ color: 'var(--color-primary)', fontWeight: 700, textDecoration: 'none' }}>
            Go to Administration
          </Link>
        </div>
      </div>
    </div>
  );
}
