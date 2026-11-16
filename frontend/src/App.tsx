import { Component, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { WorkbenchApi } from './api/client';
import { usePreference, useResource } from './hooks';
import { EvidenceDesk } from './components/EvidenceDesk';
import { FrameRequests } from './components/FrameRequests';
import { Replay } from './components/Replay';
import { Sources } from './components/Sources';
import { Button, Notice, Status } from './components/ui';

const views = [
  ['evidence', 'Evidence desk'], ['sources', 'Sources & zones'], ['replay', 'Capture & replay'],
] as const;
type View = typeof views[number][0];
const themes = ['light', 'dark'] as const;
const densities = ['comfortable', 'compact'] as const;

function initialView(): View {
  const candidate = new URLSearchParams(window.location.search).get('view');
  return views.find(([view]) => view === candidate)?.[0] ?? 'evidence';
}

export class AppBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="workspace"><Notice tone="error" title="The workspace could not render">
      No save or capture status can be inferred from this screen. Reload and check stored records before repeating a write.
    </Notice><Button onClick={() => window.location.reload()}>Reload workspace</Button></main>;
  }
}

export function App({ api }: { api: WorkbenchApi }) {
  const [view, setView] = useState<View>(initialView);
  const [theme, setTheme] = usePreference('evidence-desk:theme', themes, window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const [density, setDensity] = usePreference('evidence-desk:density', densities, 'comfortable');
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const loadHealth = useCallback((signal: AbortSignal) => api.health(signal), [api]);
  const loadCameras = useCallback((signal: AbortSignal) => api.cameras(signal), [api]);
  const loadSessions = useCallback((signal: AbortSignal) => api.sessions(signal), [api]);
  const loadRuns = useCallback((signal: AbortSignal) => api.runs(signal), [api]);
  const health = useResource('backend-health', loadHealth, { interval: 5_000 });
  const cameras = useResource('cameras', loadCameras);
  const sessions = useResource('sessions', loadSessions, { interval: 3_000 });
  const runs = useResource('runs', loadRuns);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { document.documentElement.dataset.density = density; }, [density]);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', view);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, [view]);
  const unavailable = !!health.error || !!health.data?.supervisor;
  const connectionLabel = health.error ? 'Backend refresh failed' : health.loading ? 'Connecting to local backend' : unavailable ? 'Capture supervisor unavailable' : 'Local backend connected';

  return <>
    <a className="skip-link" href="#workspace-main">Skip to workspace</a>
    <header className="app-header"><div className="header-content">
      <div className="brand"><svg className="brand-mark" viewBox="0 0 36 36" fill="none" aria-hidden="true"><rect x="2" y="2" width="32" height="32" rx="8" stroke="currentColor" strokeWidth="2" /><path d="M10 12h16M10 18h10M10 24h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        <div><strong>Evidence Desk</strong><span className="small muted">Local inspection workbench</span></div></div>
      <div className="header-controls"><Status tone={unavailable ? 'error' : health.loading ? 'warning' : 'info'}>{connectionLabel}</Status>
        <label className="preference small">Theme <select aria-label="Theme" value={theme} onChange={event => setTheme(event.target.value as typeof theme)}><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <label className="preference small">Density <select aria-label="Density" value={density} onChange={event => setDensity(event.target.value as typeof density)}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
      </div>
    </div></header>
    <div className="workspace">
      <div className="safety-strip"><strong>LOCAL DEVELOPMENT / UNVALIDATED</strong><span>Unredacted footage · fixtures are not model or accuracy evidence · no production security</span><strong>Production OFF</strong></div>
      <nav className="nav-tabs" role="tablist" aria-label="Workbench views">{views.map(([key, label], index) => <button type="button" key={key} className="nav-tab"
        id={`tab-${key}`} role="tab" aria-selected={view === key} aria-controls={`panel-${key}`} tabIndex={view === key ? 0 : -1}
        ref={element => { tabs.current[index] = element; }} onClick={() => setView(key)} onKeyDown={event => {
          let next: number | null = null;
          if (event.key === 'ArrowRight') next = (index + 1) % views.length;
          if (event.key === 'ArrowLeft') next = (index + views.length - 1) % views.length;
          if (event.key === 'Home') next = 0;
          if (event.key === 'End') next = views.length - 1;
          if (next === null) return;
          event.preventDefault(); setView(views[next]![0]); tabs.current[next]?.focus();
        }}>{label}</button>)}</nav>
      {health.error && <div className="stack" style={{ marginBottom: '16px' }}><Notice tone="error" title="Local connection unavailable">{health.error} <Button onClick={() => { health.refresh(); cameras.refresh(); sessions.refresh(); runs.refresh(); }}>Refresh connection</Button></Notice></div>}
      {health.data?.supervisor && <div className="stack" style={{ marginBottom: '16px' }}><Notice tone="warning" title="Capture supervisor is not healthy">Capture acknowledgement is unavailable or degraded. Desired-state requests are not evidence of active recording; inspect each session.</Notice></div>}
      <FrameRequests api={api}><main id="workspace-main" tabIndex={-1}>
        <section id="panel-evidence" role="tabpanel" aria-labelledby="tab-evidence" hidden={view !== 'evidence'}><EvidenceDesk api={api} cameras={cameras} sessions={sessions} runs={runs} active={view === 'evidence'} onSources={() => setView('sources')} /></section>
        <section id="panel-sources" role="tabpanel" aria-labelledby="tab-sources" hidden={view !== 'sources'}><Sources api={api} cameras={cameras} sessions={sessions} /></section>
        <section id="panel-replay" role="tabpanel" aria-labelledby="tab-replay" hidden={view !== 'replay'}><Replay api={api} cameras={cameras} sessions={sessions} runs={runs} active={view === 'replay'} /></section>
      </main></FrameRequests>
      <footer className="app-footer"><span>M01 / capture, replay and observation-fixture plumbing. No detector or automatic alert implementation.</span><span>Targets, not measured: 95% alert precision · 70% supported bottle/cup recall. Configurable and frozen per evaluation.</span></footer>
    </div>
  </>;
}
