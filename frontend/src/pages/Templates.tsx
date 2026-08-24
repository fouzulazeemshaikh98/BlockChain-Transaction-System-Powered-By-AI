import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createTemplate, deleteTemplate, fetchTemplates, ProtocolTemplateResponse } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const NETWORKS = ["Ethereum", "Arbitrum", "Optimism", "Polygon"];

const EMPTY_FORM = {
  name: "",
  network: "Ethereum",
  description: "",
  expectedFunctions: "",
  expectedContracts: "",
};

export default function Templates() {
  const { isAdmin } = useAuth();
  const [templates, setTemplates] = useState<ProtocolTemplateResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    fetchTemplates()
      .then(setTemplates)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createTemplate({
        name: form.name,
        network: form.network,
        description: form.description || undefined,
        expectedFunctions: form.expectedFunctions.split(",").map((s) => s.trim()).filter(Boolean),
        expectedContracts: form.expectedContracts.split(",").map((s) => s.trim()).filter(Boolean),
        expectedRoutingPath: [],
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Delete this protocol template?")) return;
    await deleteTemplate(id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Protocol Templates</h1>
          <p className="text-sm text-slate-500 mt-1">
            Institutional transaction patterns the AI engine matches against.
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowForm((v) => !v)} className="btn-primary">
            <Plus className="h-4 w-4" />
            New Template
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="surface-card p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Template Name</label>
              <input
                className="field"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Blockchain Network</label>
              <select className="field" value={form.network} onChange={(e) => setForm({ ...form, network: e.target.value })}>
                {NETWORKS.map((n) => (
                  <option key={n} value={n} className="bg-ink-800">{n}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Description</label>
              <input
                className="field"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Expected Functions (comma-separated)
              </label>
              <input
                className="field"
                placeholder="transfer(address,uint256), approve(address,uint256)"
                value={form.expectedFunctions}
                onChange={(e) => setForm({ ...form, expectedFunctions: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Expected Contract Addresses (comma-separated, optional)
              </label>
              <input
                className="field"
                value={form.expectedContracts}
                onChange={(e) => setForm({ ...form, expectedContracts: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving..." : "Create Template"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {templates.map((t) => (
            <div key={t.id} className="surface-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{t.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{t.network}</p>
                </div>
                {isAdmin && (
                  <button onClick={() => handleDelete(t.id)} className="text-slate-500 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              {t.description && <p className="text-sm text-slate-500 mt-2">{t.description}</p>}
              {t.expectedFunctions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {t.expectedFunctions.map((f) => (
                    <span key={f} className="text-[11px] font-mono bg-slate-100 border border-line rounded-md px-2 py-1 text-slate-600">
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
