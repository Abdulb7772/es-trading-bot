'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { defaultStrategyConfig, strategyConfigSchema, type StrategyConfigForm, type StrategyMode } from '../../domain/strategy-config';
import { getConfig, updateConfig } from '../../domain/api-client';
import { Nav } from '../../components/Nav';

type FormKey = 'timeframe' | 'emaFastPeriod' | 'emaSlowPeriod' | 'stopPoints' | 'targetPoints' | 'minimumBreathingRoomPoints' | 'quantity' | 'tradingTimezone' | 'noNewTradesAtOrAfter';
type Errors = Partial<Record<FormKey | 'levels', string>>;

function sameConfig(left: StrategyConfigForm, right: StrategyConfigForm) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return <label className="form-field"><span className="form-label">{label}</span>{children}{hint && <span className="form-hint">{hint}</span>}{error && <span className="form-error">{error}</span>}</label>;
}

function NumberField({ label, value, onChange, error, step = '1', min = '0', suffix }: { label: string; value: number; onChange: (value: number) => void; error?: string; step?: string; min?: string; suffix?: string }) {
  return <Field label={label} error={error}><div className="input-with-suffix"><input className={`form-input ${error ? 'input-invalid' : ''}`} type="number" min={min} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />{suffix && <span>{suffix}</span>}</div></Field>;
}

export default function StrategyPage() {
  const [savedConfig, setSavedConfig] = useState<StrategyConfigForm>(defaultStrategyConfig);
  const [config, setConfig] = useState<StrategyConfigForm>(defaultStrategyConfig);
  const [mode, setMode] = useState<StrategyMode>('SIMULATION');
  const [savedMode, setSavedMode] = useState<StrategyMode>('SIMULATION');
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => {
    getConfig().then((nextConfig) => { setConfig(nextConfig); setSavedConfig(nextConfig); }).catch(() => setLoadError(true)).finally(() => setLoading(false));
  }, []);

  const unsaved = !sameConfig(config, savedConfig) || mode !== savedMode;

  function update<K extends FormKey>(key: K, value: StrategyConfigForm[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
    setSavedMessage('');
  }

  function validate(): boolean {
    const result = strategyConfigSchema.safeParse(config);
    if (result.success) { setErrors({}); return true; }
    const nextErrors: Errors = {};
    result.error.issues.forEach((issue) => { const key = issue.path[0] as FormKey | 'levels'; if (!nextErrors[key]) nextErrors[key] = issue.message; });
    setErrors(nextErrors);
    return false;
  }

  async function save() {
    if (!validate()) return;
    try { const saved = await updateConfig(config); setConfig(saved); setSavedConfig(saved); setSavedMode(mode); setSavedMessage('Configuration saved to the backend.'); } catch { setLoadError(true); }
  }

  function reset() {
    setConfig(savedConfig);
    setMode(savedMode);
    setErrors({});
    setSavedMessage('Unsaved changes reset.');
  }

  function updateLevels(key: 'minimumCount' | 'maximumCount', value: number) {
    setConfig((current) => ({ ...current, levels: { ...current.levels, [key]: value } }));
    setSavedMessage('');
  }

  return (
    <div className="dashboard-shell">
      <Nav activeLabel="Strategy" />
      <div className="main-area">
        <header className="topbar">
          <span className="topbar-title">OPERATIONS / STRATEGY</span>
          <div className="topbar-status">
            <span className="status-chip"><span className="status-dot" /> Engine online</span>
            <span>Practice account</span>
            <span className="mono">/ES</span>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div><div className="eyebrow">Configuration surface</div><h1>Strategy configuration</h1><p className="page-subtitle">Adjust the runtime contract without changing source code.</p></div>
            <div className="action-row">
              <button className="button button-secondary" onClick={reset} disabled={!unsaved}>Reset</button>
              <button className="button button-primary" onClick={save} disabled={!unsaved}>Save configuration</button>
            </div>
          </div>
          {unsaved && <div className="unsaved-banner"><span className="status-dot" /> Unsaved changes <span>Review the configuration before saving.</span></div>}
          {loadError ? <div className="card error-state">Configuration could not be loaded from local mock storage.</div>
            : loading ? <div className="card loading-state">Loading strategy configuration...</div>
            : <form onSubmit={(event) => { event.preventDefault(); save(); }}>
                <section className="config-grid">
                  <article className="card config-card">
                    <div className="card-header"><div><h2 className="card-title">Market input</h2><p className="card-caption">Instrument and timeframe contract</p></div></div>
                    <div className="panel-body form-stack">
                      <div className="two-column-form">
                        <Field label="Symbol" hint="Fixed to /ES">
                          <input className="form-input" value="/ES" readOnly />
                        </Field>
                        <Field label="Timeframe" hint="Candle aggregation window">
                          <select className="form-input" value={config.timeframe} onChange={(event) => update('timeframe', event.target.value as StrategyConfigForm['timeframe'])}>
                            <option value="1m">1 minute</option><option value="5m">5 minutes</option><option value="15m">15 minutes</option>
                          </select>
                        </Field>
                      </div>
                      <div className="two-column-form">
                        <NumberField label="Fast EMA period" value={config.emaFastPeriod} onChange={(value) => update('emaFastPeriod', value)} error={errors.emaFastPeriod} suffix="bars" />
                        <NumberField label="Slow EMA period" value={config.emaSlowPeriod} onChange={(value) => update('emaSlowPeriod', value)} error={errors.emaSlowPeriod} suffix="bars" />
                      </div>
                    </div>
                  </article>
                  <article className="card config-card">
                    <div className="card-header"><div><h2 className="card-title">Risk and execution</h2><p className="card-caption">Stop, target, and position sizing</p></div></div>
                    <div className="panel-body form-stack">
                      <div className="two-column-form">
                        <NumberField label="Stop points" value={config.stopPoints} onChange={(value) => update('stopPoints', value)} error={errors.stopPoints} suffix="pts" />
                        <NumberField label="Target points" value={config.targetPoints} onChange={(value) => update('targetPoints', value)} error={errors.targetPoints} suffix="pts" />
                      </div>
                      <NumberField label="Minimum breathing room" value={config.minimumBreathingRoomPoints} onChange={(value) => update('minimumBreathingRoomPoints', value)} error={errors.minimumBreathingRoomPoints} suffix="pts" />
                      <div className="two-column-form">
                        <NumberField label="Quantity" value={config.quantity} onChange={(value) => update('quantity', value)} error={errors.quantity} suffix="lots" />
                        <Field label="Trading timezone">
                          <input className="form-input" value={config.tradingTimezone} readOnly />
                        </Field>
                      </div>
                      <Field label="No new trades at or after" error={errors.noNewTradesAtOrAfter}><input className={`form-input ${errors.noNewTradesAtOrAfter ? 'input-invalid' : ''}`} type="time" value={config.noNewTradesAtOrAfter} onChange={(event) => update('noNewTradesAtOrAfter', event.target.value)} /></Field>
                    </div>
                  </article>
                  <article className="card config-card">
                    <div className="card-header"><div><h2 className="card-title">Level settings</h2><p className="card-caption">How many levels to prepare</p></div></div>
                    <div className="panel-body form-stack">
                      <div className="two-column-form">
                        <NumberField label="Minimum levels" value={config.levels.minimumCount} onChange={(value) => updateLevels('minimumCount', value)} error={errors.levels} suffix="count" />
                        <NumberField label="Maximum levels" value={config.levels.maximumCount} onChange={(value) => updateLevels('maximumCount', value)} error={errors.levels} suffix="count" />
                      </div>
                      <div className="mode-grid">
                        <button type="button" className={`mode-option ${mode === 'SIMULATION' ? 'mode-selected' : ''}`} onClick={() => setMode('SIMULATION')}>Simulation</button>
                        <button type="button" className={`mode-option ${mode === 'PRACTICE' ? 'mode-selected' : ''}`} onClick={() => setMode('PRACTICE')}>Practice</button>
                      </div>
                    </div>
                  </article>
                </section>
                
              </form>}
          {savedMessage && <div className="unsaved-banner" style={{ color: 'var(--green)', borderColor: 'var(--green)', background: 'var(--green-soft)' }}><span className="status-dot" /> {savedMessage}</div>}
        </main>
      </div>
    </div>
  );
}
