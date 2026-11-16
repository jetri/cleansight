import { useEffect, useId, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { ApiError, errorMessage, mediaUrl } from '../api/client';
import type { WorkbenchApi } from '../api/client';
import type { Camera, Configuration, Geometry, Point } from '../api/types';
import { normalizedPoint, validateGeometry } from '../geometry';
import { shortId, sourceSeconds } from '../format';
import type { previewOf } from './Sources';
import { Button, Empty, Facts, Modal, Notice, Select, TextInput } from './ui';

type Kind = 'zones' | 'exclusions';
type Reference = ReturnType<typeof previewOf>;
interface Draft { geometry: Geometry; base: string | null; reference: Reference; changed: boolean; version: number }
interface Attempt { geometry: Geometry; settings: Record<string, unknown>; base: string | null; version: number }
const emptyGeometry: Geometry = { zones: [], exclusions: [], boundary: 0 };
const clone = (geometry: Geometry): Geometry => structuredClone(geometry);

export function ZoneEditor({ api, camera, configuration, preview, open, onClose, onSaved }:
  { api: WorkbenchApi; camera: Camera; configuration: Configuration | null; preview: Reference; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [kind, setKind] = useState<Kind>('zones');
  const [polygonIndex, setPolygonIndex] = useState(0);
  const [vertex, setVertex] = useState(-1);
  const [coords, setCoords] = useState({ x: '50', y: '50' });
  const [boundaryText, setBoundaryText] = useState('0');
  const [drawing, setDrawing] = useState(false);
  const [moved, setMoved] = useState(false);
  const [checked, setChecked] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [error, setError] = useState('');
  const [acknowledgement, setAcknowledgement] = useState('');
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [checking, setChecking] = useState(false);
  const [match, setMatch] = useState<Configuration | null>(null);
  const [readMessage, setReadMessage] = useState('');
  const attempt = useRef<Attempt | null>(null);
  const [failedReference, setFailedReference] = useState('');
  const pendingRef = useRef(false);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; vertex: number; original: Point } | null>(null);
  const hatchId = `zone-hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descriptionId = useId();

  // Freeze the reference and revision on first open. Polling never overwrites it.
  useEffect(() => {
    if (!open || draft) return;
    const geometry = clone(configuration?.geometry ?? emptyGeometry);
    const point = geometry.zones[0]?.points[0];
    setDraft({ geometry, base: configuration?.id ?? null, reference: preview, changed: false, version: 0 });
    setVertex(point ? 0 : -1);
    setCoords({ x: point ? String(point[0] * 100) : '50', y: point ? String(point[1] * 100) : '50' });
    setBoundaryText(String(geometry.boundary * 100));
  }, [open, draft, configuration, preview]);

  useEffect(() => {
    if (!draft?.changed && !pending && !uncertain) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [draft?.changed, pending, uncertain]);

  const geometry = draft?.geometry ?? emptyGeometry;
  const polygon = geometry[kind][polygonIndex];
  const selectedPoint = polygon?.points[vertex];
  const invalid = validateGeometry(geometry);
  const staleBase = !!draft && draft.base !== camera.active_revision;
  const configurationUnavailable = !!camera.active_revision && !configuration;
  const reference = draft?.reference;
  const referenceFailed = !!reference && failedReference === reference.artifact;
  const boundaryValid = boundaryText.trim() !== '' && Number.isFinite(Number(boundaryText)) && Number(boundaryText) >= 0 && Number(boundaryText) <= 25;
  function mutate(change: (value: Geometry) => Geometry) {
    setDraft(previous => previous ? { ...previous, geometry: change(previous.geometry), changed: true, version: previous.version + 1 } : previous);
    setAcknowledgement(''); setError(''); setChecked(false);
  }
  function chooseVertex(index: number) {
    setVertex(index);
    const point = polygon?.points[index];
    setCoords({ x: point ? String(Number((point[0] * 100).toFixed(4))) : '50', y: point ? String(Number((point[1] * 100).toFixed(4))) : '50' });
  }
  function pointFromInputs(x: string, y: string): Point | null {
    if (!x.trim() || !y.trim()) return null;
    const values = [Number(x), Number(y)];
    return values.every(value => Number.isFinite(value) && value >= 0 && value <= 100) ? [values[0]! / 100, values[1]! / 100] : null;
  }
  function writePoint(index: number, point: Point) {
    mutate(value => ({ ...value, [kind]: value[kind].map((item, i) => i === polygonIndex ? { ...item, points: item.points.map((p, v) => v === index ? point : p) } : item) }));
    setCoords({ x: String(Number((point[0] * 100).toFixed(4))), y: String(Number((point[1] * 100).toFixed(4))) });
  }
  function coordinateEdit(axis: 'x' | 'y', value: string) {
    const next = { ...coords, [axis]: value };
    setCoords(next);
    const point = pointFromInputs(next.x, next.y);
    if (point && selectedPoint) {
      mutate(current => ({ ...current, [kind]: current[kind].map((item, i) => i === polygonIndex ? { ...item, points: item.points.map((p, v) => v === vertex ? point : p) } : item) }));
    }
  }
  function addVertex(point: Point) {
    if (!polygon || polygon.points.length >= 128) return;
    mutate(value => ({ ...value, [kind]: value[kind].map((item, i) => i === polygonIndex ? { ...item, points: [...item.points, point] } : item) }));
    setVertex(polygon.points.length);
    setCoords({ x: String(Number((point[0] * 100).toFixed(4))), y: String(Number((point[1] * 100).toFixed(4))) });
  }
  function pointerPoint(event: PointerEvent<HTMLDivElement>) {
    const viewport = event.currentTarget.querySelector('svg');
    return viewport ? normalizedPoint(event.clientX, event.clientY, viewport.getBoundingClientRect()) : null;
  }
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (pending || !polygon || event.button !== 0) return;
    const handle = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-vertex]') : null;
    if (handle) {
      const index = Number(handle.dataset.vertex);
      const original = polygon.points[index];
      if (!original) return;
      event.preventDefault(); handle.focus({ preventScroll: true });
      chooseVertex(index); drag.current = { pointer: event.pointerId, vertex: index, original };
      event.currentTarget.setPointerCapture(event.pointerId);
    } else if (drawing) {
      const point = pointerPoint(event);
      if (point) { event.preventDefault(); addVertex(point); }
    }
  }
  function reload() {
    if (pendingRef.current || uncertain || configurationUnavailable) return;
    setDraft({ geometry: clone(configuration?.geometry ?? emptyGeometry), base: configuration?.id ?? null, reference: preview, changed: false, version: 0 });
    const point = configuration?.geometry.zones[0]?.points[0];
    setKind('zones'); setPolygonIndex(0); setVertex(0);
    setCoords({ x: point ? String(point[0] * 100) : '50', y: point ? String(point[1] * 100) : '50' });
    setBoundaryText(String((configuration?.geometry.boundary ?? 0) * 100));
    setMoved(false); setChecked(false); setDrawing(false); setResetConfirm(false); setError(''); setAcknowledgement('');
  }
  async function save() {
    if (!draft || pendingRef.current || uncertain) return;
    if (invalid || moved || !checked || staleBase || configurationUnavailable || !boundaryValid || !draft.changed || !pointFromInputs(coords.x, coords.y)) { setError(invalid ?? 'Resolve reference, coordinate and revision checks before saving.'); return; }
    const normalized = clone(geometry);
    for (const polygon of [...normalized.zones, ...normalized.exclusions]) polygon.name = polygon.name.trim();
    const submitted: Attempt = { geometry: normalized, settings: structuredClone(configuration?.settings ?? {}), base: draft.base, version: draft.version };
    attempt.current = submitted;
    pendingRef.current = true; setPending(true); setError(''); setAcknowledgement(''); setReadMessage(''); setMatch(null);
    try {
      const value = await api.configure(camera.id, submitted.geometry, submitted.settings);
      setDraft(previous => previous ? { ...previous, geometry: previous.version === submitted.version ? clone(value.geometry) : previous.geometry, base: value.id, changed: previous.version !== submitted.version } : previous);
      setAcknowledgement(`Revision ${value.sequence} was saved and assigned by the server. Existing runs remain pinned to their original revisions.`);
      onSaved();
    } catch (failure) {
      setError(errorMessage(failure));
      if (failure instanceof ApiError && failure.uncertainWrite) setUncertain(true);
    } finally { pendingRef.current = false; setPending(false); }
  }
  async function recheck() {
    const submitted = attempt.current;
    if (pendingRef.current || !submitted) return;
    pendingRef.current = true; setChecking(true); setError(''); setMatch(null);
    try {
      const [cameras, revisions] = await Promise.all([api.cameras(), api.configurations(camera.id)]);
      const active = cameras.find(value => value.id === camera.id)?.active_revision;
      const found = revisions.find(value => value.id === active && value.id !== submitted.base && JSON.stringify(value.geometry) === JSON.stringify(submitted.geometry) && Object.entries(submitted.settings).every(([key, expected]) => JSON.stringify(value.settings[key]) === JSON.stringify(expected))) ?? null;
      setMatch(found);
      setReadMessage(found ? 'An active stored revision matches the submitted geometry/settings. Adopt it without a retry; any newer draft edits will be kept.' : 'No exact matching active revision was found. The acknowledgement remains unknown, the draft is retained, and no retry was sent.');
    } catch (failure) { setError(errorMessage(failure)); }
    finally { pendingRef.current = false; setChecking(false); }
  }
  function adopt() {
    const submitted = attempt.current;
    if (!match || !submitted || !draft) return;
    const newer = draft.version !== submitted.version;
    setDraft(previous => previous ? { ...previous, base: match.id, geometry: previous.version === submitted.version ? clone(match.geometry) : previous.geometry, changed: previous.version !== submitted.version } : previous);
    setUncertain(false); setMatch(null); setChecked(false);
    setAcknowledgement(`Active stored revision ${match.sequence} adopted by read; no retry was sent.${newer ? ' Any newer edits remain unsaved.' : ' Submitted geometry is present in the stored revision.'}`);
    onSaved();
  }
  return <Modal open={open} title={`Zones & exclusions / ${camera.name}`} wide onRequestClose={() => { if (!pendingRef.current) onClose(); }}
    actions={<><span className="small muted">{pending ? 'Saving new revision…' : draft?.changed ? 'Unsaved draft / retained when closed' : 'No unsaved geometry change'}</span>
      <Button disabled={pending || checking || uncertain || configurationUnavailable} onClick={() => setResetConfirm(true)}>Reload saved revision</Button>
      <Button variant="primary" disabled={pending || checking || uncertain || configurationUnavailable || !!invalid || moved || !checked || staleBase || !boundaryValid || !draft?.changed || !pointFromInputs(coords.x, coords.y)} onClick={() => { void save(); }}>{pending ? 'Saving…' : 'Save & assign new revision'}</Button></>}>
    <div className="stack">
      <Notice tone="info">Edit normalized source coordinates, not physical contact or identity. Exclusions take precedence; boundary contact stays uncertain. Server validation is authoritative. Production activation remains OFF.</Notice>
      {configurationUnavailable && <Notice tone="warning">Active revision details are unavailable. Capture settings cannot be safely preserved or reloaded yet. <Button onClick={onSaved}>Recheck revision metadata</Button></Notice>}
      {staleBase && !acknowledgement && <Notice tone="warning" title="Saved revision changed">Your draft is preserved, but its base no longer matches the active revision. Reload the saved revision before saving a correction.</Notice>}
      {resetConfirm && <Notice tone="warning" title="Replace this retained draft?">This discards unsaved vertices and freezes the latest reference. <div className="cluster"><Button onClick={() => setResetConfirm(false)}>Keep draft</Button><Button variant="danger" disabled={pending || checking || uncertain || configurationUnavailable} onClick={reload}>Discard draft & reload</Button></div></Notice>}
      <div className="zone-layout">
        <div className="stack">
          <div className="zone-reference"><div ref={stage} className={`zone-stage ${reference && !referenceFailed ? '' : 'zone-stage--empty'}`} aria-describedby={descriptionId}
            onPointerDown={pointerDown} onPointerMove={event => {
              if (!drag.current || drag.current.pointer !== event.pointerId || pending) return;
              const point = pointerPoint(event);
              if (point) writePoint(drag.current.vertex, point);
            }} onPointerUp={event => {
              drag.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            }} onPointerCancel={() => {
              if (drag.current) writePoint(drag.current.vertex, drag.current.original);
              drag.current = null;
            }} onLostPointerCapture={() => { drag.current = null; }}>
            {reference && !referenceFailed ? <img src={mediaUrl(reference.artifact)} alt="Frozen unredacted camera reference for zone editing" onError={() => setFailedReference(reference.artifact)} />
              : <Empty title="Reference image unavailable">Coordinate-only draft. No synthetic scene is substituted for this source. Recheck against the actual source before assigning geometry.</Empty>}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Ground polygons, boundary buffers and hatched exclusions">
              <defs><pattern id={hatchId} width="2" height="3" patternUnits="userSpaceOnUse"><path d="M-1 3 L2 0 M1 6 L4 3" stroke="var(--evidence-bg)" strokeWidth="0.6" /><path d="M-1 3 L2 0 M1 6 L4 3" stroke="var(--evidence-text)" strokeWidth="0.2" /></pattern></defs>
              {geometry.zones.map((item, index) => <g key={`ground-${index}`}>
                <polygon points={item.points.map(point => `${point[0] * 100},${point[1] * 100}`).join(' ')} className="zone-boundary" strokeWidth={geometry.boundary * 200} />
                <polygon points={item.points.map(point => `${point[0] * 100},${point[1] * 100}`).join(' ')} className="zone-outline" />
                <polygon points={item.points.map(point => `${point[0] * 100},${point[1] * 100}`).join(' ')} className="zone-ground"><title>Ground: {item.name}</title></polygon>
              </g>)}
              {geometry.exclusions.map((item, index) => <g key={`exclusion-${index}`}><polygon points={item.points.map(point => `${point[0] * 100},${point[1] * 100}`).join(' ')} className="zone-outline" /><polygon points={item.points.map(point => `${point[0] * 100},${point[1] * 100}`).join(' ')} fill={`url(#${hatchId})`} className="zone-exclusion"><title>Excluded: {item.name}</title></polygon></g>)}
            </svg>
            {polygon?.points.map((point, index) => <button type="button" key={index} className={`zone-vertex ${vertex === index ? 'zone-vertex--selected' : ''}`} data-vertex={index}
              style={{ left: `${point[0] * 100}%`, top: `${point[1] * 100}%` }} disabled={pending}
              aria-label={`Vertex ${index + 1}, X ${(point[0] * 100).toFixed(2)}%, Y ${(point[1] * 100).toFixed(2)}%. Arrow keys move; Shift increases step.`}
              onFocus={() => { if (vertex !== index) chooseVertex(index); }} onKeyDown={event => {
                const directions: Record<string, Point> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
                const direction = directions[event.key];
                if (!direction) return;
                event.preventDefault(); const step = event.shiftKey ? .01 : .001;
                writePoint(index, [Math.max(0, Math.min(1, point[0] + direction[0] * step)), Math.max(0, Math.min(1, point[1] + direction[1] * step))]);
              }}><span aria-hidden="true" /></button>)}
          </div></div>
          <p id={descriptionId} className="small muted">{drawing ? 'Drawing: click the reference to append vertices. Choose Finish drawing before dragging.' : 'Drag a vertex, use its arrow keys, or enter percentage coordinates. Shift + arrow moves 1%; arrow moves 0.1%.'} Full source frame is preserved, including hand/airborne context.</p>
          <div className="zone-legend"><span><i className="legend-mark" />Ground zone / boundary buffer</span><span><i className="legend-mark legend-mark--hatched" />Excluded / takes precedence</span></div>
          <Facts items={[
            ['Draft base', draft?.base ? <code>{shortId(draft.base)}</code> : 'New configuration'],
            ['Reference source time', reference ? sourceSeconds(reference.source_us) : null], ['Reference epoch', reference ? <code>{shortId(reference.epoch)}</code> : null],
          ]} />
        </div>
        <div className="stack zone-controls">
          <div className="stack">
            <Select label="Polygon" value={polygon ? `${kind}:${polygonIndex}` : ''} onChange={event => {
              const [nextKind, index] = event.target.value.split(':');
              const group = nextKind as Kind; const i = Number(index); const point = geometry[group][i]?.points[0];
              setKind(group); setPolygonIndex(i); setVertex(point ? 0 : -1); setCoords({ x: point ? String(point[0] * 100) : '50', y: point ? String(point[1] * 100) : '50' }); setDrawing(false);
            }} disabled={pending}><option value="" disabled>No polygon</option>{(['zones', 'exclusions'] as const).flatMap(group => geometry[group].map((item, index) => <option key={`${group}:${index}`} value={`${group}:${index}`}>{group === 'zones' ? 'Ground' : 'Exclude'} / {item.name}</option>))}</Select>
            <div className="cluster">{(['zones', 'exclusions'] as const).map(group => <Button key={group} disabled={pending || geometry[group].length >= 32} onClick={() => {
              const index = geometry[group].length;
              mutate(value => ({ ...value, [group]: [...value[group], { name: `${group === 'zones' ? 'Ground' : 'Exclusion'} ${index + 1}`, points: [] }] }));
              setKind(group); setPolygonIndex(index); setVertex(-1); setCoords({ x: '50', y: '50' }); setDrawing(true);
            }}>+ {group === 'zones' ? 'Ground' : 'Exclusion'}</Button>)}</div>
            {polygon && <><TextInput label="Polygon name" value={polygon.name} maxLength={80} disabled={pending} onChange={event => mutate(value => ({ ...value, [kind]: value[kind].map((item, index) => index === polygonIndex ? { ...item, name: event.target.value } : item) }))} />
              <Button disabled={pending} aria-pressed={drawing} onClick={() => setDrawing(value => !value)}>{drawing ? 'Finish drawing' : 'Draw vertices'}</Button>
              <Button variant="danger" disabled={pending} onClick={() => {
                const remaining = geometry[kind].filter((_, i) => i !== polygonIndex);
                const point = remaining[0]?.points[0];
                mutate(value => ({ ...value, [kind]: remaining }));
                setPolygonIndex(0); setVertex(point ? 0 : -1);
                setCoords({ x: point ? String(point[0] * 100) : '50', y: point ? String(point[1] * 100) : '50' });
              }}>Remove polygon</Button></>}
          </div>
          <div className="stack">
            <Select label="Selected vertex" hint="New vertex appends; numbered vertices edit in place." value={selectedPoint ? String(vertex) : 'new'} disabled={!polygon || pending} onChange={event => chooseVertex(event.target.value === 'new' ? -1 : Number(event.target.value))}>
              <option value="new">New vertex / append</option>{polygon?.points.map((_, index) => <option key={index} value={index}>Vertex {index + 1}</option>)}
            </Select>
            <div className="vertex-grid"><TextInput label="X (%)" type="number" min="0" max="100" step="any" value={coords.x} onChange={event => coordinateEdit('x', event.target.value)} disabled={!polygon || pending} />
              <TextInput label="Y (%)" type="number" min="0" max="100" step="any" value={coords.y} onChange={event => coordinateEdit('y', event.target.value)} disabled={!polygon || pending} /></div>
            {!pointFromInputs(coords.x, coords.y) && <Notice tone="error">Both coordinates must be finite numbers in 0-100%. Entered values are retained.</Notice>}
            <div className="cluster"><Button disabled={!polygon || pending || !!selectedPoint || !pointFromInputs(coords.x, coords.y) || polygon.points.length >= 128} onClick={() => {
              const point = pointFromInputs(coords.x, coords.y);
              if (point) { addVertex(point); setVertex(-1); }
            }}>Append vertex</Button>
              <Button disabled={!selectedPoint || pending} onClick={() => {
                const remaining = polygon?.points.filter((_, v) => v !== vertex) ?? [];
                const point = remaining[0];
                mutate(value => ({ ...value, [kind]: value[kind].map((item, i) => i === polygonIndex ? { ...item, points: remaining } : item) }));
                setVertex(point ? 0 : -1);
                setCoords({ x: point ? String(point[0] * 100) : '50', y: point ? String(point[1] * 100) : '50' });
              }}>Remove vertex</Button></div>
            <TextInput label="Boundary buffer (%)" type="number" min="0" max="25" step="any" value={boundaryText} disabled={pending} onChange={event => {
              const text = event.target.value;
              setBoundaryText(text); setChecked(false);
              if (text.trim() && Number.isFinite(Number(text)) && Number(text) >= 0 && Number(text) <= 25) mutate(value => ({ ...value, boundary: Number(text) / 100 }));
            }} />
            {!boundaryValid && <Notice tone="error">Boundary buffer must be a finite number in 0-25%. The input is retained; saving is blocked.</Notice>}
          </div>
        </div>
      </div>
      <label className="check"><input type="checkbox" checked={moved} disabled={pending} onChange={event => { setMoved(event.target.checked); setChecked(false); }} />Camera moved / reference geometry is unverified</label>
      <label className="check"><input type="checkbox" checked={checked} disabled={pending || moved} onChange={event => setChecked(event.target.checked)} />I checked this draft against the source reference and camera position.</label>
      {moved && <Notice tone="warning" title="Moved camera / save blocked">Reload a current stable reference and redraw or verify the polygons before assigning a revision.</Notice>}
      {invalid && <Notice tone="warning" title="Draft needs correction">{invalid} The draft remains editable.</Notice>}
      {uncertain && <Notice tone="warning" title="Revision acknowledgement unknown / no blind retry">The backend has no revision idempotency key. Resubmission is disabled; read the active stored revision instead. Local editing may continue, and adopting the submitted version will not erase newer edits.</Notice>}
      {uncertain && <Button disabled={pending || checking} onClick={() => { void recheck(); }}>{checking ? 'Checking stored revision…' : 'Recheck active stored revision'}</Button>}
      {readMessage && <Notice live>{readMessage}</Notice>}
      {match && <Button disabled={pending || checking} onClick={adopt}>Use matching active revision {match.sequence}</Button>}
      {error && <Notice tone="error" live title="Not confirmed saved">{error}</Notice>}
      {acknowledgement && <Notice tone="info" live>{acknowledgement}</Notice>}
    </div>
  </Modal>;
}
