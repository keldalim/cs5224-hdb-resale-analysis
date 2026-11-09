import { Component, type ErrorInfo, type ReactNode } from "react";

/** Last line of defence: show a way out instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[resale-evidence] render error", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="crash" role="alert">
        <h1>Something went wrong on this page</h1>
        <p>Reloading usually fixes it. If it keeps happening, clearing this site's saved shortlist will reset the page.</p>
        <p className="crash-actions">
          <button type="button" className="btn-primary" onClick={() => window.location.assign(window.location.pathname)}>Reload</button>
          <button
            type="button"
            className="btn-quiet"
            onClick={() => {
              try { localStorage.removeItem("hdb-resale-evidence.shortlist.v1"); } catch { /* ignore */ }
              window.location.assign(window.location.pathname);
            }}
          >
            Clear saved shortlist and reload
          </button>
        </p>
      </main>
    );
  }
}
