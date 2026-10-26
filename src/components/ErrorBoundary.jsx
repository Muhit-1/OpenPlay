// src/components/ErrorBoundary.jsx
import { Component } from 'react';
import { EmptyState } from './ui';
import { AlertTriangle } from 'lucide-react';

/** Keeps one broken page from blanking the whole app; navigating away resets it. */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ui]', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <EmptyState
        icon={AlertTriangle}
        title="Something went wrong on this page"
        hint="The rest of OpenPlay is still fine. Reload to try again, or head back to Home."
        action={
          <div className="flex gap-3">
            <button className="btn-accent" onClick={() => window.location.reload()}>Reload</button>
            <a className="btn-accent" href={import.meta.env.BASE_URL}>Home</a>
          </div>
        }
      />
    );
  }
}
