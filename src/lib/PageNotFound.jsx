import { Link, useLocation } from 'react-router-dom';

export default function PageNotFound() {
  const location = useLocation();
  const pageName = location.pathname.substring(1);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-7xl font-light text-muted-foreground/40">404</h1>
          <div className="h-0.5 w-16 bg-border mx-auto" />
        </div>

        <div className="space-y-3">
          <h2 className="font-display text-2xl font-medium">Page not found</h2>
          <p className="text-muted-foreground leading-relaxed">
            {pageName
              ? <>There is nothing at <span className="font-mono text-foreground">/{pageName}</span>.</>
              : 'That page does not exist.'}
          </p>
        </div>

        <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
          <Link
            to="/"
            className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Go home
          </Link>
          <Link
            to="/docs"
            className="inline-flex items-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
          >
            Read the docs
          </Link>
        </div>
      </div>
    </div>
  );
}
