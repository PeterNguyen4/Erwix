"use client";

import type { BacktestConfig, BacktestRule } from "@/lib/api";

interface ConfigEditorProps {
  config: BacktestConfig;
  onChange: (config: BacktestConfig) => void;
}

function RuleRow({
  rule,
  onChange,
  onRemove,
}: {
  rule: BacktestRule;
  onChange: (rule: BacktestRule) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        value={rule.indicator}
        onChange={(e) => onChange({ ...rule, indicator: e.target.value })}
        placeholder="rsi_14 / sma_50 / close"
        className="w-28 rounded-md border border-border bg-field px-2 py-1 text-xs text-fg outline-none focus:border-violet-400"
      />
      <select
        value={rule.comparator}
        onChange={(e) => onChange({ ...rule, comparator: e.target.value as BacktestRule["comparator"] })}
        className="rounded-md border border-border bg-field px-1 py-1 text-xs text-fg outline-none focus:border-violet-400"
      >
        {["<", "<=", ">", ">=", "==", "crosses_above", "crosses_below"].map((c) => (
          <option key={c} value={c} className="bg-panel">
            {c}
          </option>
        ))}
      </select>
      <input
        type="number"
        value={rule.value}
        onChange={(e) => onChange({ ...rule, value: Number(e.target.value) })}
        className="w-16 rounded-md border border-border bg-field px-2 py-1 text-xs text-fg outline-none focus:border-violet-400"
      />
      <button onClick={onRemove} className="text-xs text-muted hover:text-down">
        ✕
      </button>
    </div>
  );
}

function RuleList({
  rules,
  onChange,
}: {
  rules: BacktestRule[];
  onChange: (rules: BacktestRule[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      {rules.map((rule, i) => (
        <RuleRow
          key={i}
          rule={rule}
          onChange={(r) => onChange(rules.map((existing, idx) => (idx === i ? r : existing)))}
          onRemove={() => onChange(rules.filter((_, idx) => idx !== i))}
        />
      ))}
      {rules.length === 0 && <div className="text-xs text-muted">No rules yet. Add one from the hint library.</div>}
    </div>
  );
}

export default function ConfigEditor({ config, onChange }: ConfigEditorProps) {
  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-3 text-fg">
      <div className="flex items-center gap-2">
        <input
          value={config.name}
          onChange={(e) => onChange({ ...config, name: e.target.value })}
          className="flex-1 rounded-md border border-border bg-field px-2 py-1 text-sm font-semibold outline-none focus:border-violet-400"
        />
        <select
          value={config.direction}
          onChange={(e) => onChange({ ...config, direction: e.target.value as BacktestConfig["direction"] })}
          className="rounded-md border border-border bg-field px-2 py-1 text-xs outline-none focus:border-violet-400"
        >
          <option value="long" className="bg-panel">Long</option>
          <option value="short" className="bg-panel">Short</option>
          <option value="both" className="bg-panel">Both</option>
        </select>
      </div>

      <div>
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Entry rules</div>
        <RuleList rules={config.entry_rules} onChange={(rules) => onChange({ ...config, entry_rules: rules })} />
      </div>

      <div>
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Exit rules</div>
        <RuleList rules={config.exit_rules} onChange={(rules) => onChange({ ...config, exit_rules: rules })} />
      </div>

      <div>
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Position sizing</div>
        <div className="flex items-center gap-1.5">
          <select
            value={config.position_sizing.mode}
            onChange={(e) =>
              onChange({
                ...config,
                position_sizing: { ...config.position_sizing, mode: e.target.value as BacktestConfig["position_sizing"]["mode"] },
              })
            }
            className="rounded-md border border-border bg-field px-2 py-1 text-xs outline-none focus:border-violet-400"
          >
            <option value="fixed_qty" className="bg-panel">Fixed qty</option>
            <option value="pct_equity" className="bg-panel">% of equity</option>
            <option value="pct_risk" className="bg-panel">% risk</option>
          </select>
          <input
            type="number"
            value={config.position_sizing.value}
            onChange={(e) =>
              onChange({ ...config, position_sizing: { ...config.position_sizing, value: Number(e.target.value) } })
            }
            className="w-20 rounded-md border border-border bg-field px-2 py-1 text-xs outline-none focus:border-violet-400"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Stop loss %</div>
          <input
            type="number"
            value={config.stop_loss?.value ?? ""}
            onChange={(e) =>
              onChange({
                ...config,
                stop_loss: e.target.value === "" ? null : { value: Number(e.target.value) },
              })
            }
            className="w-full rounded-md border border-border bg-field px-2 py-1 text-xs outline-none focus:border-violet-400"
          />
        </div>
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Take profit %</div>
          <input
            type="number"
            value={config.take_profit?.value ?? ""}
            onChange={(e) =>
              onChange({
                ...config,
                take_profit: e.target.value === "" ? null : { value: Number(e.target.value) },
              })
            }
            className="w-full rounded-md border border-border bg-field px-2 py-1 text-xs outline-none focus:border-violet-400"
          />
        </div>
      </div>
    </div>
  );
}
