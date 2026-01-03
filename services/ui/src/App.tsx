import { useCallback, useEffect, useMemo, useState } from "react";
import "./styles.css";

const navItems = [
  { id: "generate", label: "Generate" },
  { id: "models", label: "Models" },
  { id: "history", label: "History" },
  { id: "system", label: "System" }
];

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  `http://${window.location.hostname}:4100`;

const GENERATE_STORAGE_KEY = "framecreate.generate.form.v1";
const CURRENT_JOB_KEY = "framecreate.generate.current_job_id";
const RATIO_OPTIONS = [
  "704x1408 | 1:2",
  "704x1344 | 11:21",
  "768x1344 | 4:7",
  "768x1280 | 3:5",
  "832x1216 | 13:19",
  "832x1152 | 13:18",
  "896x1152 | 7:9",
  "896x1088 | 14:17",
  "960x1088 | 15:17",
  "960x1024 | 15:16",
  "1024x1024 | 1:1",
  "1024x960 | 16:15",
  "1088x960 | 17:15",
  "1088x896 | 17:14",
  "1152x896 | 9:7",
  "1152x832 | 18:13",
  "1216x832 | 19:13",
  "1280x768 | 5:3",
  "1344x768 | 7:4",
  "1344x704 | 21:11",
  "1408x704 | 2:1",
  "1472x704 | 23:11",
  "1536x640 | 12:5",
  "1600x640 | 5:2",
  "1664x576 | 26:9",
  "1728x576 | 3:1"
];

type ModelAsset = {
  id: number;
  kind: string;
  name: string;
  path: string;
  is_active: boolean;
};

type OutputItem = {
  id: number;
  job_id: number;
  file_name: string;
  url: string;
  width: number;
  height: number;
  seed: number | null;
  prompt: string;
  negative_prompt: string;
  steps: number;
  cfg_scale: number;
  sampler: string | null;
  scheduler: string | null;
  created_at: string;
};

type AppSettings = {
  default_sampler: string;
  default_scheduler: string;
  preview_enabled: boolean;
  preview_interval: number;
};

type PresetStyle = {
  id: string;
  name: string;
};

function useRoute() {
  const initial = window.location.hash.replace("#", "") || "generate";
  const [route, setRoute] = useState(initial);

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash.replace("#", "") || "generate");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return route;
}

const loadCurrentJobId = () => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = localStorage.getItem(CURRENT_JOB_KEY);
    const value = raw ? Number(raw) : NaN;
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
};

function GeneratePage() {
  const loadStored = () => {
    try {
      const raw = localStorage.getItem(GENERATE_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  };
  const stored = loadStored();
  const [prompt, setPrompt] = useState(typeof stored.prompt === "string" ? stored.prompt : "");
  const [negativePrompt, setNegativePrompt] = useState(typeof stored.negativePrompt === "string" ? stored.negativePrompt : "");
  const [ratio, setRatio] = useState(typeof stored.ratio === "string" ? stored.ratio : "1024x1024 | 1:1");
  const [steps, setSteps] = useState(typeof stored.steps === "string" ? stored.steps : "30");
  const [cfg, setCfg] = useState(typeof stored.cfg === "string" ? stored.cfg : "7.5");
  const [batchCount, setBatchCount] = useState(typeof stored.batchCount === "string" ? stored.batchCount : "1");
  const [seed, setSeed] = useState(typeof stored.seed === "string" ? stored.seed : "0");
  const [status, setStatus] = useState<string | null>(null);
  const [models, setModels] = useState<ModelAsset[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>(typeof stored.selectedModelId === "string" ? stored.selectedModelId : "");
  const [loraOptions, setLoraOptions] = useState<ModelAsset[]>([]);
  const [loraSlots, setLoraSlots] = useState(() => {
    if (Array.isArray(stored.loraSlots) && stored.loraSlots.length === 3) {
      return stored.loraSlots.map((slot) => {
        const record = slot as { id?: string; weight?: number };
        return {
          id: typeof record.id === "string" ? record.id : "",
          weight: typeof record.weight === "number" ? record.weight : 1
        };
      });
    }
    return [
      { id: "", weight: 1 },
      { id: "", weight: 1 },
      { id: "", weight: 1 }
    ];
  });
  const [showLoras, setShowLoras] = useState(false);
  const [presetStyles, setPresetStyles] = useState<PresetStyle[]>([]);
  const [selectedPresets, setSelectedPresets] = useState(() => {
    if (Array.isArray(stored.selectedPresets)) {
      return stored.selectedPresets.filter((value) => typeof value === "string");
    }
    return [];
  });
  const [showPresets, setShowPresets] = useState(false);
  const [latestOutput, setLatestOutput] = useState<OutputItem | null>(null);
  const [livePreviewUrl, setLivePreviewUrl] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<number | null>(() => loadCurrentJobId());
  const [progress, setProgress] = useState(0);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const ratioOptions = RATIO_OPTIONS;

  const toDimensions = (ratioValue: string) => {
    const sizePart = ratioValue.split("|")[0]?.trim() ?? ratioValue;
    const [w, h] = sizePart.split("x").map((value) => Number(value));
    if (!w || !h) {
      return { width: 1024, height: 1024 };
    }
    return { width: w, height: h };
  };

  const handleSubmit = async () => {
    setStatus("Submitting job...");
    try {
      const { width, height } = toDimensions(ratio);
      const parsedSeed = Number(seed);
      const activeLoras = loraSlots.filter((slot) => slot.id);
      const response = await fetch(`${API_BASE}/api/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          negative_prompt: negativePrompt,
          width,
          height,
          steps: Number(steps || 30),
          cfg_scale: Number(cfg || 7.5),
          seed: Number.isFinite(parsedSeed) && parsedSeed > 0 ? parsedSeed : null,
          batch_count: Number(batchCount || 1),
          model_asset_id: selectedModelId ? Number(selectedModelId) : null,
          lora_asset_ids: activeLoras.length > 0 ? activeLoras.map((slot) => Number(slot.id)) : null,
          lora_weights: activeLoras.length > 0 ? activeLoras.map((slot) => slot.weight) : null,
          preset_style_ids: selectedPresets
        })
      });
      if (!response.ok) {
        throw new Error("Job creation failed");
      }
      const job = (await response.json()) as { id: number };
      setCurrentJobId(job.id);
      localStorage.setItem(CURRENT_JOB_KEY, String(job.id));
      setProgress(0);
      setJobStatus("queued");
      setLivePreviewUrl(null);
      setStatus("Job queued.");
    } catch (error) {
      setStatus("Failed to queue job.");
    }
  };

  useEffect(() => {
    fetch(`${API_BASE}/api/models?kind=checkpoint`)
      .then((res) => res.json())
      .then((data: ModelAsset[]) => {
        const active = data.filter((item) => item.is_active);
        setModels(active);
        if (active.length > 0) {
          const storedId = typeof stored.selectedModelId === "string" ? stored.selectedModelId : "";
          const match = active.find((item) => String(item.id) === storedId);
          setSelectedModelId(match ? String(match.id) : String(active[0].id));
        }
      })
      .catch(() => {
        setModels([]);
      });
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/styles`)
      .then((res) => res.json())
      .then((data: PresetStyle[]) => setPresetStyles(data))
      .catch(() => setPresetStyles([]));
  }, []);

  useEffect(() => {
    const payload = {
      prompt,
      negativePrompt,
      ratio,
      steps,
      cfg,
      batchCount,
      seed,
      selectedModelId,
      loraSlots,
      selectedPresets
    };
    localStorage.setItem(GENERATE_STORAGE_KEY, JSON.stringify(payload));
  }, [prompt, negativePrompt, ratio, steps, cfg, batchCount, seed, selectedModelId, loraSlots, selectedPresets]);

  useEffect(() => {
    fetch(`${API_BASE}/api/models?kind=lora`)
      .then((res) => res.json())
      .then((data: ModelAsset[]) => {
        setLoraOptions(data.filter((item) => item.is_active));
      })
      .catch(() => {
        setLoraOptions([]);
      });
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/outputs`)
      .then((res) => res.json())
      .then((data: OutputItem[]) => setLatestOutput(data[0] ?? null))
      .catch(() => setLatestOutput(null));
  }, []);

  useEffect(() => {
    if (!currentJobId) {
      return;
    }
    const source = new EventSource(`${API_BASE}/api/events`);
    const onProgress = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { jobId?: number; progress?: number };
        if (data.jobId !== currentJobId) {
          return;
        }
        setProgress(Math.round(((data.progress ?? 0) * 100)));
        setJobStatus("running");
        setLivePreviewUrl(`${API_BASE}/api/jobs/${currentJobId}/preview?t=${Date.now()}`);
      } catch {
        // ignore malformed payloads
      }
    };
    const onCompleted = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { jobId?: number };
        if (data.jobId !== currentJobId) {
          return;
        }
        setProgress(100);
        setJobStatus("completed");
        fetch(`${API_BASE}/api/outputs`)
          .then((res) => res.json())
          .then((outputs: OutputItem[]) => setLatestOutput(outputs[0] ?? null))
          .catch(() => setLatestOutput(null));
        setLivePreviewUrl(null);
        localStorage.removeItem(CURRENT_JOB_KEY);
        setCurrentJobId(null);
        source.close();
      } catch {
        // ignore malformed payloads
      }
    };
    const onError = () => {
      source.close();
    };
    source.addEventListener("progress", onProgress);
    source.addEventListener("completed", onCompleted);
    source.addEventListener("error", onError as EventListener);

    return () => {
      source.removeEventListener("progress", onProgress);
      source.removeEventListener("completed", onCompleted);
      source.removeEventListener("error", onError as EventListener);
      source.close();
    };
  }, [currentJobId]);

  useEffect(() => {
    if (!currentJobId) {
      return;
    }
    const interval = setInterval(() => {
      fetch(`${API_BASE}/api/jobs/${currentJobId}`)
        .then((res) => res.json())
        .then((data: { progress?: number; status?: string }) => {
          setProgress(Math.round(((data.progress ?? 0) * 100)));
          setJobStatus(data.status ?? null);
          if (data.status === "running") {
            setLivePreviewUrl(`${API_BASE}/api/jobs/${currentJobId}/preview?t=${Date.now()}`);
          }
          if (data.status === "completed") {
            fetch(`${API_BASE}/api/outputs`)
              .then((res) => res.json())
              .then((outputs: OutputItem[]) => setLatestOutput(outputs[0] ?? null))
              .catch(() => setLatestOutput(null));
            setLivePreviewUrl(null);
            localStorage.removeItem(CURRENT_JOB_KEY);
            setCurrentJobId(null);
            clearInterval(interval);
          }
          if (data.status === "failed" || data.status === "cancelled") {
            localStorage.removeItem(CURRENT_JOB_KEY);
            setCurrentJobId(null);
            clearInterval(interval);
          }
        })
        .catch(() => {
          clearInterval(interval);
      });
    }, 1500);
    return () => clearInterval(interval);
  }, [currentJobId]);

  return (
    <section className="grid gap-6 md:grid-cols-[1.35fr,1fr]">
      <div className="relative rounded-2xl bg-panel p-6 shadow-panel panel-sheen">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl tracking-[0.08em] text-stroke">FrameCreate Generator</h1>
            <p className="mt-2 max-w-xl text-sm text-muted">Prompt, tune, and ship. Keep the surface calm and the output fast.</p>
          </div>
        </div>
        <div className="mt-6 grid gap-4">
          <div className="rounded-xl border border-white/10 bg-panelAlt p-4">
            <button
              className="flex w-full items-center justify-between text-xs uppercase tracking-[0.2em] text-muted"
              onClick={() => setShowPresets((prev) => !prev)}
              type="button"
            >
              <span>Preset Styles</span>
              <span>{selectedPresets.length > 0 ? `${selectedPresets.length} selected` : showPresets ? "Hide" : "Show"}</span>
            </button>
            {showPresets ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {presetStyles.length === 0 ? (
                  <span className="text-xs uppercase tracking-[0.2em] text-muted">No preset styles found</span>
                ) : (
                  presetStyles.map((style) => (
                    <label key={style.id} className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted">
                      <input
                        type="checkbox"
                        checked={selectedPresets.includes(style.id)}
                        onChange={() =>
                          setSelectedPresets((prev) =>
                            prev.includes(style.id) ? prev.filter((id) => id !== style.id) : [...prev, style.id]
                          )
                        }
                      />
                      <span>{style.name}</span>
                    </label>
                  ))
                )}
              </div>
            ) : null}
          </div>
          <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-muted">
            Prompt
            <textarea
              className="min-h-[140px] rounded-xl border border-white/10 bg-panelAlt p-3 text-sm text-text"
              placeholder="A cinematic macro of..."
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>
          <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-muted">
            Negative Prompt
            <textarea
              className="min-h-[110px] rounded-xl border border-white/10 bg-panelAlt p-3 text-sm text-text"
              placeholder="lowres, artifacts"
              value={negativePrompt}
              onChange={(event) => setNegativePrompt(event.target.value)}
            />
          </label>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-muted">
              Aspect Ratio
              <select
                className="rounded-xl border border-white/10 bg-panelAlt px-3 py-2 text-sm text-text"
                value={ratio}
                onChange={(event) => setRatio(event.target.value)}
              >
                {ratioOptions.map((ratio) => (
                  <option key={ratio} value={ratio}>
                    {ratio}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-muted">
              Base Model
              <select
                className="w-full rounded-xl border border-white/10 bg-panelAlt px-3 py-2 text-sm text-text"
                value={selectedModelId}
                onChange={(event) => setSelectedModelId(event.target.value)}
              >
                {models.length === 0 ? <option value="">No models found</option> : null}
                {models.map((model) => (
                  <option key={model.id} value={String(model.id)}>
                    {model.name}
                  </option>
                ))}
              </select>
            </label>
            {["Steps", "CFG"].map((label) => (
              <label key={label} className="grid gap-2 text-xs uppercase tracking-[0.2em] text-muted">
                {label}
                <input
                  className="w-full max-w-[140px] rounded-xl border border-white/10 bg-panelAlt px-3 py-2 text-sm text-text"
                  value={label === "Steps" ? steps : cfg}
                  onChange={(event) => (label === "Steps" ? setSteps(event.target.value) : setCfg(event.target.value))}
                />
              </label>
            ))}
            <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-muted">
              Series Count
              <input
                className="w-full max-w-[140px] rounded-xl border border-white/10 bg-panelAlt px-3 py-2 text-sm text-text"
                value={batchCount}
                onChange={(event) => setBatchCount(event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-muted">
              Seed (-0 = random)
              <input
                className="w-full max-w-[180px] rounded-xl border border-white/10 bg-panelAlt px-3 py-2 text-sm text-text"
                value={seed}
                onChange={(event) => setSeed(event.target.value)}
              />
            </label>
          </div>
          <div className="rounded-xl border border-white/10 bg-panelAlt p-4">
            <button
              className="flex w-full items-center justify-between text-xs uppercase tracking-[0.2em] text-muted"
              onClick={() => setShowLoras((prev) => !prev)}
              type="button"
            >
              <span>LoRA Stack</span>
              <span>{showLoras ? "Hide" : "Show"}</span>
            </button>
            {showLoras ? (
              <div className="mt-4 grid gap-3">
                {loraSlots.map((slot, index) => (
                  <div key={`lora-${index}`} className="grid gap-2 md:grid-cols-[1.2fr,1fr]">
                    <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-muted">
                      LoRA {index + 1}
                      <select
                        className="rounded-xl border border-white/10 bg-panel px-3 py-2 text-sm text-text"
                        value={slot.id}
                        onChange={(event) =>
                          setLoraSlots((prev) =>
                            prev.map((current, slotIndex) =>
                              slotIndex === index ? { ...current, id: event.target.value } : current
                            )
                          )
                        }
                      >
                        <option value="">None</option>
                        {loraOptions.map((lora) => (
                          <option key={lora.id} value={String(lora.id)}>
                            {lora.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-muted">
                      Strength
                      <div className="flex items-center gap-3">
                        <input
                          className="w-full"
                          type="range"
                          min="0.1"
                          max="1.0"
                          step="0.05"
                          value={slot.weight}
                          disabled={!slot.id}
                          onChange={(event) =>
                            setLoraSlots((prev) =>
                              prev.map((current, slotIndex) =>
                                slotIndex === index ? { ...current, weight: Number(event.target.value) } : current
                              )
                            )
                          }
                        />
                        <span className="text-xs text-muted">{slot.weight.toFixed(2)}</span>
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-xl border border-accent bg-accent/10 px-5 py-3 text-xs uppercase tracking-[0.3em] text-accent hover:bg-accent/20"
              onClick={handleSubmit}
              type="button"
            >
              Launch Generation
            </button>
            <button
              className="rounded-xl border border-white/10 bg-panelAlt px-5 py-3 text-xs uppercase tracking-[0.3em] text-text/80 hover:border-accent disabled:opacity-50"
              disabled={!currentJobId || !jobStatus || (jobStatus !== "queued" && jobStatus !== "running")}
              onClick={() => {
                if (!currentJobId) {
                  return;
                }
                fetch(`${API_BASE}/api/jobs/${currentJobId}/cancel`, { method: "POST" })
                  .then(() => {
                    setJobStatus("cancelled");
                    setStatus("Job cancelled.");
                  })
                  .catch(() => setStatus("Failed to cancel job."));
              }}
              type="button"
            >
              Stop
            </button>
            <button
              className="rounded-xl border border-white/10 bg-panelAlt px-5 py-3 text-xs uppercase tracking-[0.3em] text-text/80 hover:border-accent"
              onClick={() => {
                fetch(`${API_BASE}/api/runtime/reload`, { method: "POST" })
                  .then((res) => {
                    if (!res.ok) {
                      throw new Error("reload_failed");
                    }
                    setStatus("Runtime reloaded.");
                  })
                  .catch(() => setStatus("Failed to reload runtime."));
              }}
              type="button"
            >
              Reload
            </button>
            {status ? <span className="text-xs uppercase tracking-[0.2em] text-muted">{status}</span> : null}
          </div>
          {jobStatus ? (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-muted">
                <span>Status: {jobStatus}</span>
                <span>{progress}%</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-panelAlt">
                <div className="h-2 rounded-full bg-accent" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4">
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-panelAlt p-4">
          <div className="text-xs uppercase tracking-[0.3em] text-muted">Preview</div>
          <div className="mt-4 flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-panel">
            {livePreviewUrl ? (
              <img className="h-full w-full object-cover" src={livePreviewUrl} alt="Live preview" />
            ) : latestOutput ? (
              <img className="h-full w-full object-cover" src={`${API_BASE}${latestOutput.url}`} alt={latestOutput.prompt} />
            ) : (
              <span className="text-xs uppercase tracking-[0.3em] text-muted">No output yet</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ModelsPage() {
  const categories = ["Base Models", "LoRAs", "VAEs"];
  const [activeCategory, setActiveCategory] = useState(categories[0]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assets, setAssets] = useState<ModelAsset[]>([]);
  const [scanStatus, setScanStatus] = useState<string | null>(null);

  const fetchModels = () => {
    fetch(`${API_BASE}/api/models`)
      .then((res) => res.json())
      .then((data) => setAssets(data))
      .catch(() => {
        setAssets([]);
      });
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const filtered = assets.filter((model) => {
    const typeMatch =
      (activeCategory === "Base Models" && model.kind === "checkpoint") ||
      (activeCategory === "LoRAs" && model.kind === "lora") ||
      (activeCategory === "VAEs" && model.kind === "vae");
    const queryMatch = model.name.toLowerCase().includes(query.toLowerCase());
    const statusMatch = statusFilter === "all" ? true : (statusFilter === "active" ? model.is_active : !model.is_active);
    return typeMatch && queryMatch && statusMatch;
  });

  return (
    <section className="grid gap-6">
      <div className="relative rounded-2xl bg-panel p-6 shadow-panel panel-sheen">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl tracking-[0.08em]">Model Manager</h2>
            <p className="text-xs text-muted">Checkpoints, LoRAs, embeddings with metadata control.</p>
          </div>
          <button
            className="rounded-xl border border-accent bg-accent/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-accent"
            onClick={() => {
              setScanStatus("Scanning...");
              fetch(`${API_BASE}/api/models/scan`, { method: "POST" })
                .then(() => {
                  fetchModels();
                  setScanStatus("Scan complete");
                })
                .catch(() => {
                  setScanStatus("Scan failed");
                });
            }}
          >
            Rescan
          </button>
        </div>
        {scanStatus ? <div className="mt-3 text-xs uppercase tracking-[0.2em] text-muted">{scanStatus}</div> : null}
        <div className="mt-6 grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`rounded-xl border px-4 py-2 text-xs uppercase tracking-[0.2em] ${
                  activeCategory === category ? "border-accent bg-accent/10 text-accent" : "border-white/10 bg-panelAlt text-text/80 hover:border-accent"
                }`}
              >
                {category}
              </button>
            ))}
            <div className="ml-auto flex w-full items-center gap-2 md:w-auto">
              <input
                className="w-full rounded-xl border border-white/10 bg-panelAlt px-3 py-2 text-sm text-text md:w-64"
                placeholder="Search models"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <select
                className="rounded-xl border border-white/10 bg-panelAlt px-3 py-2 text-sm text-text"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((model) => (
              <div key={model.name} className="flex items-center justify-between rounded-xl border border-white/10 bg-panelAlt px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-text">{model.name}</div>
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">{model.kind}</div>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.2em] ${model.is_active ? "bg-success/10 text-success" : "bg-accent2/10 text-accent2"}`}>
                  {model.is_active ? "active" : "inactive"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function HistoryPage() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<OutputItem | null>(null);
  const [outputs, setOutputs] = useState<OutputItem[]>([]);

  const reusePrompt = (item: OutputItem) => {
    const ratioMatch = RATIO_OPTIONS.find((option) => option.startsWith(`${item.width}x${item.height}`));
    const payload = {
      prompt: item.prompt ?? "",
      negativePrompt: item.negative_prompt ?? "",
      ratio: ratioMatch ?? "1024x1024 | 1:1",
      steps: String(item.steps ?? 30),
      cfg: String(item.cfg_scale ?? 7.5),
      batchCount: "1",
      seed: item.seed ? String(item.seed) : "0"
    };
    try {
      const raw = localStorage.getItem(GENERATE_STORAGE_KEY);
      const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      localStorage.setItem(GENERATE_STORAGE_KEY, JSON.stringify({ ...existing, ...payload }));
    } catch {
      localStorage.setItem(GENERATE_STORAGE_KEY, JSON.stringify(payload));
    }
    setSelected(null);
    window.location.hash = "#generate";
  };

  const refreshOutputs = useCallback(() => {
    fetch(`${API_BASE}/api/outputs`)
      .then((res) => res.json())
      .then((data) => setOutputs(data))
      .catch(() => setOutputs([]));
  }, []);

  useEffect(() => {
    refreshOutputs();
  }, []);

  useEffect(() => {
    const activeJobId = loadCurrentJobId();
    if (!activeJobId) {
      return;
    }
    const interval = setInterval(() => {
      fetch(`${API_BASE}/api/jobs/${activeJobId}`)
        .then((res) => res.json())
        .then((data: { status?: string }) => {
          refreshOutputs();
          if (data.status && data.status !== "queued" && data.status !== "running") {
            localStorage.removeItem(CURRENT_JOB_KEY);
            clearInterval(interval);
          }
        })
        .catch(() => {
          clearInterval(interval);
        });
    }, 2000);
    return () => clearInterval(interval);
  }, [refreshOutputs]);

  const filtered = outputs.filter((item) => {
    const queryMatch = item.prompt.toLowerCase().includes(query.toLowerCase());
    const statusMatch = statusFilter === "all" ? true : statusFilter === "done";
    return queryMatch && statusMatch;
  });

  return (
    <section className="grid gap-6">
      <div className="relative rounded-2xl bg-panel p-6 shadow-panel panel-sheen">
        <div>
          <h2 className="font-display text-3xl tracking-[0.08em]">Gallery & History</h2>
          <p className="text-xs text-muted">Outputs, prompts, and reuse loops.</p>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <input
            className="w-full rounded-xl border border-white/10 bg-panelAlt px-3 py-2 text-sm text-text md:w-80"
            placeholder="Search prompts"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            className="rounded-xl border border-white/10 bg-panelAlt px-3 py-2 text-sm text-text"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All</option>
            <option value="done">Done</option>
          </select>
          <button
            type="button"
            onClick={refreshOutputs}
            className="rounded-xl border border-white/10 bg-panelAlt px-4 py-2 text-xs uppercase tracking-[0.2em] text-text/80 hover:border-accent"
          >
            Refresh
          </button>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setSelected(row)}
              className="text-left"
            >
              <div className="rounded-xl border border-white/10 bg-panelAlt px-4 py-3 transition hover:border-accent">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">JOB-{row.job_id}</div>
                </div>
                <div className="mt-2 text-sm text-text">{row.prompt}</div>
                <div className="mt-4 flex h-36 items-center justify-center overflow-hidden rounded-lg border border-dashed border-white/10 bg-panel">
                  <img className="h-full w-full object-cover" src={`${API_BASE}${row.url}`} alt={row.prompt} />
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6">
          <div className="relative w-full max-w-4xl rounded-2xl bg-panel p-6 shadow-panel panel-sheen">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-2xl tracking-[0.08em]">Detail View</h3>
                <p className="text-xs text-muted">Metadata and reuse controls.</p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-xl border border-white/10 bg-panelAlt px-4 py-2 text-xs uppercase tracking-[0.2em] text-text/80 hover:border-accent"
              >
                Close
              </button>
            </div>
            <div className="mt-6 grid gap-6 md:grid-cols-[1.2fr,1fr]">
            <div className="flex min-h-[280px] items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/10 bg-panelAlt">
              <img className="h-full w-full object-cover" src={`${API_BASE}${selected.url}`} alt={selected.prompt} />
            </div>
              <div className="grid gap-3">
                {[
                  { label: "Output ID", value: String(selected.id) },
                  { label: "Prompt", value: selected.prompt },
                  { label: "Negative", value: selected.negative_prompt || "-" },
                  { label: "Seed", value: String(selected.seed ?? "-") },
                  { label: "Steps", value: String(selected.steps) },
                  { label: "CFG", value: String(selected.cfg_scale) },
                  { label: "Sampler", value: selected.sampler ?? "-" },
                  { label: "Scheduler", value: selected.scheduler ?? "-" }
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-lg border border-white/10 bg-panelAlt px-3 py-2 text-xs">
                    <span className="uppercase tracking-[0.2em] text-muted">{item.label}</span>
                    <span className="text-text">{item.value}</span>
                  </div>
                ))}
                <div className="mt-2 flex flex-wrap gap-3">
                  <button
                    className="rounded-xl border border-accent bg-accent/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-accent hover:bg-accent/20"
                    onClick={() => reusePrompt(selected)}
                  >
                    Reuse Prompt
                  </button>
                  <button className="rounded-xl border border-white/10 bg-panelAlt px-4 py-2 text-xs uppercase tracking-[0.2em] text-text/80 hover:border-accent">
                    Download
                  </button>
                  <button
                    className="rounded-xl border border-white/10 bg-panelAlt px-4 py-2 text-xs uppercase tracking-[0.2em] text-text/80 hover:border-accent"
                    onClick={() => {
                      fetch(`${API_BASE}/api/outputs/${selected.id}`, { method: "DELETE" })
                        .then(() => {
                          setSelected(null);
                          refreshOutputs();
                        })
                        .catch(() => {});
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SystemPage() {
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsStatus, setSettingsStatus] = useState<string | null>(null);
  const [serviceStatus, setServiceStatus] = useState({ worker: "unknown", indexer: "unknown" });
  const samplerOptions = [
    { value: "euler", label: "Euler" },
    { value: "euler_a", label: "Euler A" },
    { value: "heun", label: "Heun" },
    { value: "lms", label: "LMS" },
    { value: "ddim", label: "DDIM" },
    { value: "pndm", label: "PNDM" },
    { value: "dpm2", label: "DPM2" },
    { value: "dpm2_a", label: "DPM2 A" },
    { value: "dpmpp_2m", label: "DPM++ 2M" },
    { value: "dpmpp_sde", label: "DPM++ SDE" },
    { value: "unipc", label: "UniPC" }
  ];
  const schedulerOptions = [
    { value: "default", label: "Default" },
    { value: "karras", label: "Karras" },
    { value: "exponential", label: "Exponential" }
  ];
  const panels = [
    {
      key: "paths",
      label: "Paths",
      description: "Model, LoRA, output, and cache locations",
      fields: [
        { label: "Models Path", value: "./storage/models" },
        { label: "LoRAs Path", value: "./storage/loras" },
        { label: "Outputs Path", value: "./storage/outputs" },
        { label: "Thumbnails Path", value: "./storage/thumbnails" }
      ]
    },
    {
      key: "performance",
      label: "Performance",
      description: "Queue tuning, steps, and batch controls",
      fields: [
        { label: "Concurrency", value: "1" },
        { label: "Batch Size", value: "1" },
        { label: "Default Steps", value: "30" },
        { label: "Default CFG", value: "7.5" },
        { label: "Clip Skip", value: "2" },
        { label: "Live Preview", value: settings ? (settings.preview_enabled ? "on" : "off") : "-" },
        { label: "Preview Interval", value: settings ? String(settings.preview_interval) : "-" }
      ]
    },
    {
      key: "generation",
      label: "Generation",
      description: "Image generation controls and model routing",
      fields: [
        { label: "LoRA Weight", value: "0.7" },
        { label: "Refiner", value: "off" },
        { label: "Positive ADM", value: "1.0" },
        { label: "Negative ADM", value: "1.0" },
        { label: "Guidance ADM", value: "1.0" },
        { label: "VAE", value: "auto" }
      ]
    },
    {
      key: "samplers",
      label: "Samplers",
      description: "Sampler defaults and quality bias",
      fields: [
        { label: "Default Sampler", value: settings?.default_sampler ?? "-" },
        { label: "Scheduler", value: settings?.default_scheduler ?? "-" },
        { label: "Sharpness Bias", value: "balanced" }
      ]
    },
    {
      key: "output",
      label: "Output",
      description: "Format, metadata, and naming rules",
      fields: [
        { label: "Format", value: "png" },
        { label: "Embed Metadata", value: "on" },
        { label: "Filename Template", value: "job_{id}_{idx}" }
      ]
    }
  ];

  const active = panels.find((panel) => panel.key === activePanel);
  const isSamplers = active?.key === "samplers";
  const isPerformance = active?.key === "performance";

  const loadSettings = () => {
    fetch(`${API_BASE}/api/settings`)
      .then((res) => res.json())
      .then((data: AppSettings) => setSettings(data))
      .catch(() => setSettings(null));
  };

  const saveSamplerSettings = () => {
    if (!settings) {
      setSettingsStatus("Settings not loaded.");
      return;
    }
    setSettingsStatus("Saving...");
    fetch(`${API_BASE}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        default_sampler: settings.default_sampler,
        default_scheduler: settings.default_scheduler
      })
    })
      .then((res) => res.json())
      .then((data: AppSettings) => {
        setSettings(data);
        setSettingsStatus("Saved");
      })
      .catch(() => setSettingsStatus("Save failed"));
  };

  const savePerformanceSettings = () => {
    if (!settings) {
      setSettingsStatus("Settings not loaded.");
      return;
    }
    setSettingsStatus("Saving...");
    fetch(`${API_BASE}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preview_enabled: settings.preview_enabled,
        preview_interval: settings.preview_interval
      })
    })
      .then((res) => res.json())
      .then((data: AppSettings) => {
        setSettings(data);
        setSettingsStatus("Saved");
      })
      .catch(() => setSettingsStatus("Save failed"));
  };

  useEffect(() => {
    loadSettings();
    fetch(`${API_BASE}/api/system/status`)
      .then((res) => res.json())
      .then((data: { worker?: string; indexer?: string }) =>
        setServiceStatus({
          worker: data.worker ?? "unknown",
          indexer: data.indexer ?? "unknown"
        })
      )
      .catch(() => setServiceStatus({ worker: "unknown", indexer: "unknown" }));
  }, []);

  return (
    <section className="grid gap-6">
      <div className="relative rounded-2xl bg-panel p-6 shadow-panel panel-sheen">
        <div>
          <h2 className="font-display text-3xl tracking-[0.08em]">System & Settings</h2>
          <p className="text-xs text-muted">Runtime controls, queue tuning, service health.</p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            { title: "Queue Concurrency", value: "1" },
            { title: "Worker Status", value: serviceStatus.worker },
            { title: "Indexer Status", value: serviceStatus.indexer }
          ].map((item) => (
            <div key={item.title} className="rounded-xl border border-white/10 bg-panelAlt p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-muted">{item.title}</div>
              <div className="mt-2 text-lg font-display tracking-[0.08em] text-accent2">{item.value}</div>
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {panels.map((panel) => (
            <div key={panel.key} className="flex items-center justify-between rounded-xl border border-white/10 bg-panelAlt px-4 py-3">
              <div className="text-xs uppercase tracking-[0.2em] text-muted">{panel.label}</div>
              <button
                className="rounded-lg border border-white/10 bg-panel px-3 py-1 text-xs uppercase tracking-[0.2em] hover:border-accent"
                onClick={() => setActivePanel(panel.key)}
              >
                Open
              </button>
            </div>
          ))}
        </div>
      </div>

      {active ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6">
          <div className="relative w-full max-w-3xl rounded-2xl bg-panel p-6 shadow-panel panel-sheen">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-2xl tracking-[0.08em]">{active.label}</h3>
                <p className="text-xs text-muted">{active.description}</p>
              </div>
              <button
                type="button"
                onClick={() => setActivePanel(null)}
                className="rounded-xl border border-white/10 bg-panelAlt px-4 py-2 text-xs uppercase tracking-[0.2em] text-text/80 hover:border-accent"
              >
                Close
              </button>
            </div>
            <div className="mt-6 grid gap-3">
              {isSamplers ? (
                <>
                  {settings ? (
                    <>
                      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-panelAlt px-4 py-3 text-xs">
                        <span className="uppercase tracking-[0.2em] text-muted">Default Sampler</span>
                        <select
                          className="w-48 rounded-lg border border-white/10 bg-panel px-3 py-2 text-xs text-text"
                          value={settings.default_sampler}
                          onChange={(event) =>
                            setSettings((prev) => (prev ? { ...prev, default_sampler: event.target.value } : prev))
                          }
                        >
                          {samplerOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-panelAlt px-4 py-3 text-xs">
                        <span className="uppercase tracking-[0.2em] text-muted">Scheduler</span>
                        <select
                          className="w-48 rounded-lg border border-white/10 bg-panel px-3 py-2 text-xs text-text"
                          value={settings.default_scheduler}
                          onChange={(event) =>
                            setSettings((prev) => (prev ? { ...prev, default_scheduler: event.target.value } : prev))
                          }
                        >
                          {schedulerOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-panelAlt px-4 py-3 text-xs">
                        <span className="uppercase tracking-[0.2em] text-muted">Sharpness Bias</span>
                        <input
                          className="w-48 rounded-lg border border-white/10 bg-panel px-3 py-2 text-xs text-text"
                          defaultValue="balanced"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg border border-white/10 bg-panelAlt px-4 py-3 text-xs text-muted">
                      Settings not loaded.
                    </div>
                  )}
                </>
              ) : isPerformance ? (
                <>
                  {settings ? (
                    <>
                      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-panelAlt px-4 py-3 text-xs">
                        <span className="uppercase tracking-[0.2em] text-muted">Live Preview</span>
                        <input
                          type="checkbox"
                          checked={settings.preview_enabled}
                          onChange={(event) =>
                            setSettings((prev) => (prev ? { ...prev, preview_enabled: event.target.checked } : prev))
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-panelAlt px-4 py-3 text-xs">
                        <span className="uppercase tracking-[0.2em] text-muted">Preview Interval</span>
                        <input
                          className="w-28 rounded-lg border border-white/10 bg-panel px-3 py-2 text-xs text-text"
                          value={String(settings.preview_interval)}
                          onChange={(event) =>
                            setSettings((prev) =>
                              prev
                                ? { ...prev, preview_interval: Math.max(1, Number(event.target.value) || 1) }
                                : prev
                            )
                          }
                        />
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg border border-white/10 bg-panelAlt px-4 py-3 text-xs text-muted">
                      Settings not loaded.
                    </div>
                  )}
                </>
              ) : (
                active.fields.map((field) => (
                  <div key={field.label} className="flex items-center justify-between rounded-lg border border-white/10 bg-panelAlt px-4 py-3 text-xs">
                    <span className="uppercase tracking-[0.2em] text-muted">{field.label}</span>
                    <input
                      className="w-48 rounded-lg border border-white/10 bg-panel px-3 py-2 text-xs text-text"
                      defaultValue={field.value}
                    />
                  </div>
                ))
              )}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                className="rounded-xl border border-accent bg-accent/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-accent hover:bg-accent/20"
                onClick={isSamplers ? saveSamplerSettings : isPerformance ? savePerformanceSettings : undefined}
                type="button"
                disabled={!settings && (isSamplers || isPerformance)}
              >
                Save
              </button>
              <button
                className="rounded-xl border border-white/10 bg-panelAlt px-4 py-2 text-xs uppercase tracking-[0.2em] text-text/80 hover:border-accent"
                onClick={isSamplers || isPerformance ? loadSettings : undefined}
                type="button"
                disabled={!settings && (isSamplers || isPerformance)}
              >
                Reset
              </button>
              {settingsStatus ? <span className="text-xs uppercase tracking-[0.2em] text-muted">{settingsStatus}</span> : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function App() {
  const route = useRoute();
  const active = useMemo(() => navItems.find((item) => item.id === route) ?? navItems[0], [route]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-4 z-20 mx-auto mt-4 flex max-w-6xl items-center justify-between gap-6 rounded-xl bg-panel/90 px-6 py-4 shadow-panel backdrop-blur glass-border">
        <div className="flex items-center gap-4">
          <div className="framecreate-gear" />
          <div>
            <div className="font-display text-2xl tracking-[0.2em]">FrameCreate</div>
            <div className="text-xs uppercase tracking-[0.3em] text-muted">because we are different</div>
          </div>
        </div>
        <nav className="hidden items-center gap-3 text-xs uppercase tracking-[0.3em] md:flex">
          {navItems.map((item) => (
            <a
              key={item.id}
              className={`rounded-lg border border-white/10 bg-panelAlt px-3 py-2 hover:border-accent ${active.id === item.id ? "text-accent" : ""}`}
              href={`#${item.id}`}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 pb-16 pt-10">
        {route === "models" ? <ModelsPage /> : null}
        {route === "history" ? <HistoryPage /> : null}
        {route === "system" ? <SystemPage /> : null}
        {route === "generate" ? <GeneratePage /> : null}
      </main>

      <div className="corner-hover">
        <div className="corner-hover-panel">
          <div className="corner-hover-title">FrameCreate</div>
          <a href="https://github.com/MythosMachina/FrameCreate">Copyright MythosMachina</a>
          <a href="https://discord.gg/TB5DHMNa5J">Support Discord</a>
        </div>
      </div>
    </div>
  );
}
