'use client';

import { useEffect, useMemo, useState } from 'react';
import { type LevelImportPreview, type ParsedLevelRow, type UserLevel } from '../../domain/levels';
import { getLevels, importLevels } from '../../domain/api-client';
import { levelsToText, parseJsonLevels, parseLevelText } from '../../domain/level-import';
import { Nav } from '../../components/Nav';

function formatPrice(price: number) {
  return price.toLocaleString('en-US', { minimumFractionDigits: 2 });
}

function Stat({ label, value, detail, tone = '' }: { label: string; value: string; detail?: string; tone?: string }) {
  return <article className="card metric-card"><span className="card-label">{label}</span><strong className={`metric-value ${tone}`}>{value}</strong>{detail && <span className="metric-detail">{detail}</span>}</article>;
}

function PreviewRow({ row, onRemove }: { row: ParsedLevelRow; onRemove: (id: string) => void }) {
  const invalid = Boolean(row.error);
  return <tr className={invalid ? 'invalid-row' : ''}><td className="mono">{row.rowNumber}</td><td className="mono">{row.rawValue || '—'}</td><td><span className="level-designation">Level</span></td><td className="mono">{row.price === undefined ? '—' : formatPrice(row.price)}</td><td>{invalid ? <span className="validation-error">{row.error}</span> : row.duplicate ? <span className="validation-warning">Duplicate level</span> : <span className="validation-ok">Valid</span>}</td><td>{invalid && <button className="text-button" onClick={() => onRemove(row.id)}>Remove</button>}</td></tr>;
}

export default function LevelsPage() {
  const [activeLevels, setActiveLevels] = useState<UserLevel[]>([]);
  const [draftLevels, setDraftLevels] = useState<UserLevel[]>([]);
  const [preview, setPreview] = useState<LevelImportPreview | null>(null);
  const [pasteValue, setPasteValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => { getLevels().then((levelSet) => { const levels = levelSet.levels.map((level) => ({ id: level.id, price: level.price })); setActiveLevels(levels); setDraftLevels(levels); }).catch(() => setError(true)).finally(() => setLoading(false)); }, []);

  const sortedLevels = useMemo(() => [...draftLevels].sort((a, b) => a.price - b.price), [draftLevels]);
  const duplicateCount = useMemo(() => { const counts = new Map<number, number>(); draftLevels.forEach((level) => counts.set(level.price, (counts.get(level.price) ?? 0) + 1)); return [...counts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0); }, [draftLevels]);
  const invalidCount = preview?.invalidCount ?? 0;
  const unsaved = levelsToText(activeLevels) !== levelsToText(draftLevels) || Boolean(preview);

  function applyPreview(nextPreview: LevelImportPreview) {
    setPreview(nextPreview);
    setDraftLevels(nextPreview.validLevels);
    setSavedMessage('');
  }

  function handlePaste() {
    applyPreview(parseLevelText(pasteValue));
  }

  function handleFile(event: unknown) {
    const input = event as { target: { files: { 0?: { name: string; text: () => Promise<string> } } | null; value: string } };
    const file = input.target.files?.[0];
    if (!file) return;
    file.text().then((text) => applyPreview(file.name.toLowerCase().endsWith('.json') ? parseJsonLevels(text) : parseLevelText(text))).catch(() => setError(true));
    input.target.value = '';
  }

  function removeInvalid(id: string) {
    if (!preview) return;
    const rows = preview.rows.filter((row) => row.id !== id);
    const next = parseLevelText(rows.map((row) => row.rawValue).join('\n'));
    setPreview(next);
    setDraftLevels(next.validLevels);
  }

  function resetDraft() {
    setDraftLevels(activeLevels);
    setPreview(null);
    setPasteValue('');
    setSavedMessage('Draft reset to active levels.');
  }

  function cancelChanges() {
    setDraftLevels(activeLevels);
    setPreview(null);
    setPasteValue('');
    setSavedMessage('Unsaved changes discarded.');
  }

  function save() {
    if (unsaved) setConfirmReplace(true);
  }

  async function confirmSave() {
    try {
      const saved = await importLevels(levelsToText(sortedLevels), 'text');
      const nextLevels = saved.levels.map((level) => ({ id: level.id, price: level.price }));
      setActiveLevels(nextLevels);
      setDraftLevels(nextLevels);
      setPreview(null);
      setConfirmReplace(false);
      setSavedMessage('Active level set saved to the backend.');
    } catch { setError(true); }
  }

  return (
    <div className="dashboard-shell">
      <Nav activeLabel="Levels" />
      <div className="main-area">
        <header className="topbar">
          <span className="topbar-title">OPERATIONS / LEVELS</span>
          <div className="topbar-status">
            <span className="status-chip"><span className="status-dot" /> Engine online</span>
            <span>Practice account</span>
            <span className="mono">/ES</span>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div><div className="eyebrow">Market structure input</div><h1>Levels</h1><p className="page-subtitle">Manage user-supplied /ES prices. Context is assigned by the backend later.</p></div>
            <div className="action-row">
              <button className="button button-secondary" onClick={resetDraft}>Reset</button>
              <button className="button button-secondary" onClick={cancelChanges}>Cancel</button>
              <button className="button button-primary" disabled={!unsaved || invalidCount > 0} onClick={save}>Save changes</button>
            </div>
          </div>
          {unsaved && <div className="unsaved-banner"><span className="status-dot" /> Unsaved changes <span>Review the preview before replacing the active level set.</span></div>}
          {error ? <div className="card error-state">Levels could not be loaded from the local mock service.</div>
            : loading ? <div className="card loading-state">Loading current /ES levels...</div>
            : <>
                <section className="grid metric-grid">
                  <Stat label="Total levels" value={String(draftLevels.length)} detail="Current draft" />
                  <Stat label="Duplicates" value={String(duplicateCount)} detail="Repeated prices" tone={duplicateCount ? 'negative' : 'positive'} />
                  <Stat label="Invalid levels" value={String(invalidCount)} detail="Preview only" tone={invalidCount ? 'negative' : 'positive'} />
                  <Stat label="Lowest level" value={formatPrice(sortedLevels[0]?.price ?? 0)} detail="Ascending set" />
                  <Stat label="Highest level" value={formatPrice(sortedLevels.at(-1)?.price ?? 0)} detail="Ascending set" />
                </section>
                <section className="levels-layout">
                  <article className="card import-card">
                    <div className="card-header"><div><h2 className="card-title">Import levels</h2><p className="card-caption">One price per line, CSV first column, or JSON array. Tick size: 0.25.</p></div><span className="badge badge-muted">Local only</span></div>
                    <div className="panel-body">
                      <textarea className="levels-textarea" value={pasteValue} onChange={(event) => setPasteValue(event.target.value)} placeholder="Paste prices here, for example:\n5642.25\n5638.00\n5624.75" aria-label="Paste levels" />
                      <div className="import-actions">
                        <button className="button button-primary" onClick={handlePaste} disabled={!pasteValue.trim()}>Preview pasted levels</button>
                        <label className="button button-secondary file-button">Upload file<input type="file" accept=".txt,.csv,.json,text/plain,text/csv,application/json" onChange={handleFile} aria-label="Upload levels file" /></label>
                      </div>
                      <p className="input-note">Accepted formats: TXT, CSV, JSON. Invalid rows remain visible for review.</p>
                    </div>
                  </article>
                  <article className="card guidance-card">
                    <div className="card-header"><div><h2 className="card-title">Validation rules</h2><p className="card-caption">Neutral prices only</p></div></div>
                    <div className="panel-body validation-list">
                      <div><span className="rule-mark">01</span><span>Prices must be numeric.</span></div>
                      <div><span className="rule-mark">02</span><span>Every price must use a 0.25 tick.</span></div>
                      <div><span className="rule-mark">03</span><span>Duplicate prices are flagged, not classified.</span></div>
                    </div>
                  </article>
                </section>
                <section className="card table-card">
                  <div className="card-header">
                    <div><h2 className="card-title">{preview ? 'Import preview' : 'Current /ES levels'}</h2><p className="card-caption">{preview ? `${preview.rows.length} imported rows · ${preview.invalidCount} invalid · ${preview.duplicateCount} duplicate` : 'Sorted ascending · neutral Level designation'}</p></div>
                    {preview && <button className="button button-secondary" onClick={() => { setPreview(null); setDraftLevels(activeLevels); }}>Discard preview</button>}
                  </div>
                  {preview ? <div className="table-wrap"><table><thead><tr><th>Row</th><th>Input</th><th>Designation</th><th>Parsed price</th><th>Validation</th><th>Action</th></tr></thead><tbody>{preview.rows.map((row) => <PreviewRow key={row.id} row={row} onRemove={removeInvalid} />)}</tbody></table></div>
                  : <div className="table-wrap"><table><thead><tr><th>#</th><th>Designation</th><th>Price</th><th>Tick</th></tr></thead><tbody>{sortedLevels.map((level, index) => <tr key={level.id}><td className="mono">{index + 1}</td><td><span className="level-designation">Level</span></td><td className="mono">{formatPrice(level.price)}</td><td className="mono">0.25</td></tr>)}</tbody></table></div>}
                </section>
              </>}
          {confirmReplace && <div className="modal-backdrop" role="presentation" onKeyDown={(event) => { if (event.key === 'Escape') setConfirmReplace(false); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="replace-title"><div className="eyebrow">Confirm replacement</div><h2 id="replace-title">Replace active levels?</h2><p>This will replace the current local level set with {draftLevels.length} draft levels. No backend or trading connection is involved.</p><div className="modal-actions"><button className="button button-secondary" onClick={() => setConfirmReplace(false)}>Keep current set</button><button className="button button-primary" onClick={confirmSave}>Replace active levels</button></div></div></div>}
          {savedMessage && <div className="toast" role="status">{savedMessage}</div>}
        </main>
      </div>
    </div>
  );
}
