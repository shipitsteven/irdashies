import { useState, useEffect, useCallback } from 'react';
import { BaseSettingsSection } from '../components/BaseSettingsSection';
import type {
  CoachingOverlayConfig,
  SettingsTabType,
  LlmConfig,
  LlmProvider,
} from '@irdashies/types';
import { getWidgetDefaultConfig } from '@irdashies/types';
import { useDashboard } from '@irdashies/context';
import { SettingsSection } from '../components/SettingSection';
import { SettingToggleRow } from '../components/SettingToggleRow';
import { SettingNumberRow } from '../components/SettingNumberRow';
import { SettingSliderRow } from '../components/SettingSliderRow';
import { SettingSelectRow } from '../components/SettingSelectRow';
import { SessionVisibility } from '../components/SessionVisibility';
import { TabButton } from '../components/TabButton';

const SETTING_ID = 'coaching';

const defaultConfig = getWidgetDefaultConfig('coaching');

// ─── LLM Config defaults & helpers ──────────────────────────────────────────

const DEFAULT_LLM_CONFIG: LlmConfig = {
  provider: 'gemini',
  apiKey: '',
  model: 'gemini-2.0-flash',
};

const PROVIDER_OPTIONS: { label: string; value: LlmProvider }[] = [
  { label: 'Google Gemini', value: 'gemini' },
  { label: 'OpenAI', value: 'openai' },
  { label: 'OpenAI-compatible', value: 'openai-compatible' },
  { label: 'Ollama (local)', value: 'ollama' },
];

const HARDCODED_GEMINI_MODELS = [
  { label: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
  { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
  { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
];

const RECOMMENDED_OLLAMA_MODELS = [
  { label: 'gemma3:12b — Google, good all-rounder (8GB VRAM)', value: 'gemma3:12b' },
  { label: 'gemma3:27b — Google, higher quality (16GB+ VRAM)', value: 'gemma3:27b' },
  { label: 'llama3.1:8b — Meta, solid general purpose', value: 'llama3.1:8b' },
  { label: 'qwen2.5:7b — strong reasoning for size', value: 'qwen2.5:7b' },
  { label: 'phi-4:14b — Microsoft, good at structured output', value: 'phi-4:14b' },
];

/** Gemini keys start with AIza and are 39 chars */
function isValidGeminiKey(key: string): boolean {
  return /^AIza[A-Za-z0-9_-]{35}$/.test(key);
}

/** Redact an API key to first 4 + last 4 chars */
function redactKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '...' + key.slice(-4);
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface CoachingWidgetSettings {
  id: string;
  enabled: boolean;
  config: CoachingOverlayConfig;
}

interface ModelOption {
  label: string;
  value: string;
}

interface TestResult {
  status: 'idle' | 'testing' | 'success' | 'error';
  message?: string;
  responseMs?: number;
}

// ─── LLM Settings Tab Component ─────────────────────────────────────────────

// ─── Per-provider localStorage helpers ──────────────────────────────────────

function verifiedKey(provider: string): string {
  return `quietEyeLlmVerified_${provider}`;
}
function modelsKey(provider: string): string {
  return `quietEyeLlmModels_${provider}`;
}

function loadVerifiedState(provider: string): TestResult {
  try {
    const stored = localStorage.getItem(verifiedKey(provider));
    if (stored) return JSON.parse(stored) as TestResult;
  } catch { /* ignore */ }
  return { status: 'idle' };
}

function defaultModelsForProvider(provider: string): ModelOption[] {
  if (provider === 'ollama') return RECOMMENDED_OLLAMA_MODELS;
  return HARDCODED_GEMINI_MODELS;
}

function loadCachedModels(provider: string): ModelOption[] {
  try {
    const stored = localStorage.getItem(modelsKey(provider));
    if (stored) {
      const parsed = JSON.parse(stored) as ModelOption[];
      if (parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return defaultModelsForProvider(provider);
}

function LlmSettingsTab() {
  // Load persisted LLM config from localStorage
  const [llmConfig, setLlmConfig] = useState<LlmConfig>(() => {
    try {
      const stored = localStorage.getItem('quietEyeLlmConfig');
      if (stored) return { ...DEFAULT_LLM_CONFIG, ...JSON.parse(stored) };
    } catch { /* ignore */ }
    return DEFAULT_LLM_CONFIG;
  });

  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<TestResult>(() =>
    loadVerifiedState(DEFAULT_LLM_CONFIG.provider)
  );
  const [models, setModels] = useState<ModelOption[]>(() =>
    loadCachedModels(DEFAULT_LLM_CONFIG.provider)
  );
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const isVerified = testResult.status === 'success';

  // Persist LLM config to localStorage on change
  useEffect(() => {
    localStorage.setItem('quietEyeLlmConfig', JSON.stringify(llmConfig));
  }, [llmConfig]);

  // Persist verified state + models per provider
  useEffect(() => {
    if (testResult.status === 'success') {
      localStorage.setItem(verifiedKey(llmConfig.provider), JSON.stringify(testResult));
    }
  }, [testResult, llmConfig.provider]);
  useEffect(() => {
    if (models !== HARDCODED_GEMINI_MODELS) {
      localStorage.setItem(modelsKey(llmConfig.provider), JSON.stringify(models));
    }
  }, [models, llmConfig.provider]);

  const resetVerification = useCallback(() => {
    setTestResult({ status: 'idle' });
    setModels(defaultModelsForProvider(llmConfig.provider));
    setOllamaError(null);
    localStorage.removeItem(verifiedKey(llmConfig.provider));
    localStorage.removeItem(modelsKey(llmConfig.provider));
    setSaveStatus('idle');
  }, [llmConfig.provider]);

  const updateConfig = useCallback(
    (patch: Partial<LlmConfig>) => {
      setLlmConfig((prev) => {
        const next = { ...prev, ...patch };
        // If provider changed, load that provider's cached state
        if (patch.provider !== undefined && patch.provider !== prev.provider) {
          setTestResult(loadVerifiedState(patch.provider));
          setModels(loadCachedModels(patch.provider));
          setOllamaError(null);
          // For Ollama, auto-set a dummy API key
          if (patch.provider === 'ollama') {
            next.apiKey = 'ollama';
          } else if (prev.provider === 'ollama') {
            // Switching away from Ollama — clear the dummy key
            next.apiKey = '';
          }
        }
        // If key changed (within same provider), reset that provider's verification
        if (patch.apiKey !== undefined && patch.apiKey !== prev.apiKey && patch.provider !== 'ollama') {
          setTestResult({ status: 'idle' });
          setModels(defaultModelsForProvider(next.provider));
          localStorage.removeItem(verifiedKey(next.provider));
          localStorage.removeItem(modelsKey(next.provider));
        }
        setSaveStatus('idle');
        return next;
      });
    },
    []
  );

  // ─── Key Validation ─────────────────────────────────────────────────

  const validateKey = useCallback(
    (key: string) => {
      if (!key) {
        setKeyError(null);
        return;
      }
      if (llmConfig.provider === 'gemini' && !isValidGeminiKey(key)) {
        setKeyError(
          "API key format doesn't look right — Gemini keys start with AIza and are 39 characters"
        );
      } else {
        setKeyError(null);
      }
    },
    [llmConfig.provider]
  );

  // ─── Fetch Models ───────────────────────────────────────────────────

  const fetchModels = useCallback(async (token?: string | null) => {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('http://localhost:8878/api/config/models', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          api_key: llmConfig.apiKey,
          provider: llmConfig.provider,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.models && data.models.length > 0) {
          setModels(
            data.models.map((m: { id: string; name: string }) => ({
              label: m.name,
              value: m.id,
            }))
          );
        }
      }
    } catch {
      // Keep hardcoded fallback
    }
  }, [llmConfig.apiKey, llmConfig.provider]);

  // ─── Test Connection ────────────────────────────────────────────────

  const handleVerify = useCallback(async () => {
    const isOllama = llmConfig.provider === 'ollama';

    if (!isOllama && !llmConfig.apiKey) {
      setTestResult({ status: 'error', message: 'Please enter your API key' });
      return;
    }
    if (
      llmConfig.provider === 'gemini' &&
      !isValidGeminiKey(llmConfig.apiKey)
    ) {
      setTestResult({
        status: 'error',
        message:
          "API key format doesn't look right — Gemini keys start with AIza",
      });
      return;
    }

    setTestResult({ status: 'testing' });
    setOllamaError(null);

    try {
      const token = await window.electronAPI?.getServiceToken?.();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // For Ollama, first fetch models to check connectivity
      if (isOllama) {
        const modelsRes = await fetch('http://localhost:8878/api/config/models', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            provider: 'ollama',
            api_key: 'ollama',
          }),
        });
        const modelsData = await modelsRes.json();

        if (!modelsRes.ok) {
          const hint = modelsData.hint || '';
          setOllamaError(modelsData.error || 'Ollama is not reachable');
          setTestResult({
            status: 'error',
            message: `Ollama not reachable — ${hint || 'is it running?'}`,
          });
          return;
        }

        if (modelsData.models && modelsData.models.length > 0) {
          setModels(
            modelsData.models.map((m: { id: string; name: string }) => ({
              label: m.name,
              value: m.id,
            }))
          );
          // Auto-select first model if current selection isn't in the list
          const modelIds = modelsData.models.map((m: { id: string }) => m.id);
          if (!modelIds.includes(llmConfig.model)) {
            updateConfig({ model: modelsData.models[0].id });
          }
        } else {
          setOllamaError(modelsData.warning || 'No models installed');
          setTestResult({
            status: 'error',
            message: 'No models installed — run: ollama pull gemma3:12b',
          });
          return;
        }
      }

      // Test the actual LLM call
      const res = await fetch('http://localhost:8878/api/config/test-llm', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          provider: llmConfig.provider,
          api_key: isOllama ? 'ollama' : llmConfig.apiKey,
          model: llmConfig.model,
          base_url: llmConfig.baseUrl,
        }),
      });

      const data = await res.json();

      if (res.ok && data.status === 'ok') {
        setTestResult({
          status: 'success',
          message: isOllama
            ? `Ollama connected! Model: ${data.model} ✓`
            : `Connected! Model: ${data.model} ✓`,
          responseMs: data.response_ms,
        });
        // Fetch dynamic model list on success (non-Ollama — we already fetched above)
        if (!isOllama) fetchModels(token);
      } else if (res.status === 401 || res.status === 403) {
        setTestResult({
          status: 'error',
          message:
            'API key was rejected — check that it\'s correct and has Generative Language API enabled',
        });
      } else {
        setTestResult({
          status: 'error',
          message: data.error || `Verification failed (HTTP ${res.status})`,
        });
      }
    } catch {
      setTestResult({
        status: 'error',
        message: isOllama
          ? "Couldn't reach the coaching service — is it running?"
          : "Couldn't reach the coaching service — is it running?",
      });
    }
  }, [llmConfig, updateConfig, fetchModels]);

  // ─── Test Connection ────────────────────────────────────────────────

  // ─── Save Config ────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!llmConfig.apiKey && llmConfig.provider !== 'ollama') {
      setSaveStatus('error');
      return;
    }

    try {
      const token = await window.electronAPI?.getServiceToken?.();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('http://localhost:8878/api/config/llm', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          provider: llmConfig.provider,
          api_key: llmConfig.provider === 'ollama' ? 'ollama' : llmConfig.apiKey,
          model: llmConfig.model,
          base_url: llmConfig.baseUrl,
          max_tokens: llmConfig.maxTokens,
          timeout: llmConfig.timeout,
        }),
      });

      if (res.ok) {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
        resetVerification();
      }
    } catch {
      setSaveStatus('error');
      resetVerification();
    }
  }, [llmConfig, resetVerification]);

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <>
      <SettingsSection title="LLM Provider">
        <SettingSelectRow
          title="Provider"
          description="Select your LLM provider for coaching"
          value={llmConfig.provider}
          options={PROVIDER_OPTIONS}
          onChange={(v) => {
            updateConfig({ provider: v as LlmProvider });
          }}
        />
      </SettingsSection>

      <SettingsSection title={llmConfig.provider === 'ollama' ? 'Local Setup' : 'API Key'}>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="max-w-[70%]">
              <h4 className="text-md font-medium text-slate-300">
                {llmConfig.provider === 'ollama' ? 'Ollama (Local)' : 'API Key'}
              </h4>
              <p className="text-sm text-slate-500 mt-1">
                {llmConfig.provider === 'gemini'
                  ? 'Get a free key from Google AI Studio (aistudio.google.com)'
                  : llmConfig.provider === 'ollama'
                    ? 'Runs entirely on your machine \u2014 no API key, no cloud, no cost'
                    : 'Your API key for the selected provider'}
              </p>
            </div>
          </div>

          {llmConfig.provider === 'ollama' && (
            <div className="rounded-md bg-slate-700/50 border border-slate-600 p-3 space-y-2">
              <p className="text-sm text-slate-300">
                <strong>Setup:</strong> Install{' '}
                <a
                  href="https://ollama.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  Ollama
                </a>
                , then pull a model:
              </p>
              <code className="block text-sm text-green-400 bg-slate-800 rounded px-2 py-1 font-mono">
                ollama pull gemma3:12b
              </code>
              <p className="text-xs text-slate-500">
                Recommended: gemma3:12b (8GB VRAM) or llama3.1:8b. Coaching prompts are small \u2014 even 7B models work well.
              </p>
              {ollamaError && (
                <p className="text-sm text-amber-400">
                  \u26a0\ufe0f {ollamaError}
                </p>
              )}
            </div>
          )}

          {llmConfig.provider !== 'ollama' && (
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={llmConfig.apiKey}
                  onChange={(e) => {
                    updateConfig({ apiKey: e.target.value });
                    validateKey(e.target.value);
                  }}
                  placeholder={
                    llmConfig.provider === 'gemini'
                      ? 'AIza...'
                      : 'sk-...'
                  }
                  className="w-full rounded border border-gray-600 bg-gray-700 p-2 text-slate-300 pr-16 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200"
                >
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
          )}

          {keyError && (
            <p className="text-sm text-amber-400">{keyError}</p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="Verify & Model">
        <div className="space-y-3">
          {/* Verify button */}
          <div className="flex items-center gap-3">
            {isVerified ? (
              <>
                <span className="text-sm text-green-400">
                  ✅ {testResult.message}
                  {testResult.responseMs != null &&
                    ` (${testResult.responseMs}ms)`}
                </span>
                <button
                  type="button"
                  onClick={resetVerification}
                  className="px-3 py-1 rounded-md text-xs text-slate-400 hover:text-slate-200 border border-slate-600 hover:border-slate-500 transition-colors"
                >
                  Re-verify
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={
                    testResult.status === 'testing' ||
                    (!llmConfig.apiKey && llmConfig.provider !== 'ollama')
                  }
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2 ${
                    testResult.status === 'testing'
                      ? 'bg-slate-600 text-slate-400 cursor-wait'
                      : 'bg-blue-600 hover:bg-blue-500 text-white'
                  }`}
                >
                  {testResult.status === 'testing' && (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {testResult.status === 'testing' ? 'Verifying...' : 'Verify'}
                </button>

                {testResult.status === 'error' && (
                  <span className="text-sm text-red-400">
                    ❌ {testResult.message}
                  </span>
                )}
              </>
            )}
          </div>

          {/* Model dropdown */}
          <SettingSelectRow
            title="Model"
            description={
              llmConfig.provider === 'ollama'
                ? (testResult.status === 'success'
                    ? 'Locally installed models from Ollama'
                    : 'Click Verify to detect installed models')
                : (testResult.status === 'success'
                    ? 'Models loaded from your API key'
                    : 'Verify your key to load available models')
            }
            value={llmConfig.model}
            options={models}
            onChange={(v) => updateConfig({ model: v })}
          />
        </div>
      </SettingsSection>

      {/* Base URL — only for openai-compatible */}
      {llmConfig.provider === 'openai-compatible' && (
        <SettingsSection title="Endpoint">
          <div className="space-y-2">
            <div className="max-w-[70%]">
              <h4 className="text-md font-medium text-slate-300">
                Base URL
              </h4>
              <p className="text-sm text-slate-500 mt-1">
                OpenAI-compatible API endpoint (e.g.
                http://localhost:8899/v1)
              </p>
            </div>
            <input
              type="text"
              value={llmConfig.baseUrl ?? ''}
              onChange={(e) => updateConfig({ baseUrl: e.target.value })}
              placeholder="http://localhost:8899/v1"
              className="w-full rounded border border-gray-600 bg-gray-700 p-2 text-slate-300 font-mono text-sm"
            />
          </div>
        </SettingsSection>
      )}

      {/* Save button */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={
            (!llmConfig.apiKey && llmConfig.provider !== 'ollama') ||
            (llmConfig.provider !== 'ollama' && testResult.status !== 'success')
          }
          className="px-4 py-2 rounded-md text-sm font-medium bg-green-600 hover:bg-green-500 text-white transition-colors disabled:bg-slate-600 disabled:text-slate-400"
        >
          Save LLM Config
        </button>
        {saveStatus === 'saved' && (
          <span className="text-sm text-green-400">✅ Saved</span>
        )}
        {saveStatus === 'error' && (
          <span className="text-sm text-red-400">
            ❌ Save failed — is the coaching service running?
          </span>
        )}
      </div>

      <div className="text-sm text-slate-500 px-1 pt-2">
        {llmConfig.provider === 'ollama' ? (
          <p>
            All inference runs locally on your machine via Ollama at{' '}
            <code className="text-slate-400 bg-slate-700 px-1 rounded">
              localhost:11434
            </code>
            . No data leaves your computer.
          </p>
        ) : (
          <p>
            Your API key is stored locally on this machine and only sent to
            the coaching service at{' '}
            <code className="text-slate-400 bg-slate-700 px-1 rounded">
              localhost:8878
            </code>
            .
          </p>
        )}
      </div>
    </>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export const CoachingSettings = () => {
  const { currentDashboard } = useDashboard();

  const [activeTab, setActiveTab] = useState<SettingsTabType>(
    () => (localStorage.getItem('coachingTab') as SettingsTabType) || 'display'
  );

  useEffect(() => {
    localStorage.setItem('coachingTab', activeTab);
  }, [activeTab]);

  const savedSettings = currentDashboard?.widgets.find(
    (w) => w.id === SETTING_ID
  ) as CoachingWidgetSettings | undefined;

  const [settings, setSettings] = useState<CoachingWidgetSettings>({
    id: SETTING_ID,
    enabled: savedSettings?.enabled ?? false,
    config:
      (savedSettings?.config as CoachingOverlayConfig) ?? defaultConfig,
  });

  if (!currentDashboard) return <>Loading...</>;

  return (
    <BaseSettingsSection
      title="Quiet Eye Coaching"
      description="AI-powered race coaching with per-lap feedback and section analysis. Requires the Quiet Eye service running on localhost:8878."
      settings={settings}
      onSettingsChange={(s) => setSettings(s as CoachingWidgetSettings)}
      widgetId={SETTING_ID}
    >
      {(handleConfigChange) => (
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex border-b border-slate-700">
            <TabButton
              id="display"
              activeTab={activeTab}
              setActiveTab={setActiveTab}
            >
              Display
            </TabButton>
            <TabButton
              id="styling"
              activeTab={activeTab}
              setActiveTab={setActiveTab}
            >
              Appearance
            </TabButton>
            <TabButton
              id="visibility"
              activeTab={activeTab}
              setActiveTab={setActiveTab}
            >
              Visibility
            </TabButton>
            <TabButton
              id="llm"
              activeTab={activeTab}
              setActiveTab={setActiveTab}
            >
              LLM
            </TabButton>
          </div>

          {/* DISPLAY TAB */}
          {activeTab === 'display' && (
            <>
              <SettingsSection title="Radio Message">
                <SettingToggleRow
                  title="Show Radio Message"
                  description="Display the AI radio-style coaching message after each lap"
                  enabled={settings.config.showRadioMessage}
                  onToggle={(v) => handleConfigChange({ showRadioMessage: v })}
                />

                <SettingNumberRow
                  title="Radio Fade Duration (s)"
                  description="How long the radio message stays visible before fading"
                  value={settings.config.radioFadeDuration}
                  min={3}
                  max={30}
                  step={1}
                  onChange={(v) => handleConfigChange({ radioFadeDuration: v })}
                />
              </SettingsSection>

              <SettingsSection title="Action Items">
                <SettingToggleRow
                  title="Show Action Items"
                  description="Display prioritized coaching points below the radio message"
                  enabled={settings.config.showActionItems}
                  onToggle={(v) => handleConfigChange({ showActionItems: v })}
                />

                <SettingNumberRow
                  title="Max Action Items"
                  description="Maximum number of coaching items to display"
                  value={settings.config.maxActionItems}
                  min={1}
                  max={10}
                  step={1}
                  onChange={(v) => handleConfigChange({ maxActionItems: v })}
                />
              </SettingsSection>

              <SettingsSection title="Status">
                <SettingToggleRow
                  title="Show Status Indicator"
                  description="Display service connection and processing status"
                  enabled={settings.config.showStatusIndicator}
                  onToggle={(v) => handleConfigChange({ showStatusIndicator: v })}
                />

                <SettingToggleRow
                  title="Headless Mode"
                  description="Run coaching service connection and TTS without showing any overlay. Use when you only want voice coaching."
                  enabled={settings.config.headless}
                  onToggle={(v) => handleConfigChange({ headless: v })}
                />
              </SettingsSection>

              <SettingsSection title="Service Info">
                <div className="text-sm text-slate-400 space-y-1 px-1">
                  <p>
                    The Quiet Eye coaching service must be running at{' '}
                    <code className="text-slate-300 bg-slate-700 px-1 rounded">
                      http://localhost:8878
                    </code>
                  </p>
                  <p>
                    irDashies will automatically connect when the service is
                    available and reconnect if it goes down.
                  </p>
                </div>
              </SettingsSection>
            </>
          )}

          {/* APPEARANCE TAB */}
          {activeTab === 'styling' && (
            <SettingsSection title="Appearance">
              <SettingNumberRow
                title="Font Size"
                description="Base font size for the overlay (px)"
                value={settings.config.fontSize}
                min={10}
                max={24}
                step={1}
                onChange={(v) => handleConfigChange({ fontSize: v })}
              />

              <SettingSliderRow
                title="Opacity"
                description="Background opacity of the overlay"
                value={Math.round(settings.config.opacity * 100)}
                units="%"
                min={20}
                max={100}
                step={5}
                onChange={(v) => handleConfigChange({ opacity: v / 100 })}
              />
            </SettingsSection>
          )}

          {/* VISIBILITY TAB */}
          {activeTab === 'visibility' && (
            <SettingsSection title="Session Visibility">
              <SessionVisibility
                sessionVisibility={settings.config.sessionVisibility}
                handleConfigChange={handleConfigChange}
              />
            </SettingsSection>
          )}

          {/* LLM TAB */}
          {activeTab === 'llm' && <LlmSettingsTab />}
        </div>
      )}
    </BaseSettingsSection>
  );
};
