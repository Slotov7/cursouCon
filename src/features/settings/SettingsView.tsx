import { useEffect, useState } from "react";
import {
  exportDiagnostic,
  getAppDiagnostic,
  getDesktopErrorMessage,
  pickDirectory,
  saveAppPreferences,
} from "../../shared/desktop/commands";
import type { AppPreferences, DiagnosticSnapshot } from "../../shared/desktop/contracts";
import {
  buttonPrimaryClass,
  fieldClass,
  selectClass,
} from "../../shared/ui/primitives";

type SettingsViewProps = {
  preferences: AppPreferences;
  onSaved: (preferences: AppPreferences) => void;
};

export function SettingsView({ preferences, onSaved }: SettingsViewProps) {
  const [draft, setDraft] = useState(preferences);
  const [diagnostic, setDiagnostic] = useState<DiagnosticSnapshot | null>(null);
  const [diagnosticLoading, setDiagnosticLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraft(preferences);
  }, [preferences]);

  useEffect(() => {
    let cancelled = false;
    void getAppDiagnostic()
      .then((snapshot) => {
        if (!cancelled) setDiagnostic(snapshot);
      })
      .catch((operationError: unknown) => {
        if (!cancelled) setError(getDesktopErrorMessage(operationError));
      })
      .finally(() => {
        if (!cancelled) setDiagnosticLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setError(null);
    setMessage(null);
    setIsSaving(true);
    try {
      const saved = await saveAppPreferences(draft);
      onSaved(saved);
      setMessage("Preferências salvas neste computador.");
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportDiagnostic = async () => {
    setError(null);
    setMessage(null);
    setIsExporting(true);
    try {
      const destination = await pickDirectory("Escolha onde salvar o diagnóstico");
      if (!destination) return;
      const exported = await exportDiagnostic(destination);
      setMessage(`Diagnóstico exportado em ${exported.path}. Nenhum conteúdo de material foi incluído.`);
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="grid gap-6">
      <section className="glass-hero relative overflow-hidden rounded-3xl border border-white/12 p-6 text-white shadow-xl lg:p-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-300">Preferências locais</p>
        <h2 className="mt-2 font-heading text-2xl font-bold leading-tight lg:text-3xl">Preferências do app</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-200/85">
          Ajuste aparência e comportamento. Essas preferências ficam salvas neste computador.
        </p>
      </section>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300" role="status">
          {message}
        </p>
      )}

      <section className="glass-card rounded-2xl p-5 shadow-xs" aria-labelledby="preferences-title">
        <div className="border-b border-line pb-4">
          <h3 id="preferences-title" className="font-heading text-xl font-bold text-ink">Interface e estudo</h3>
          <p className="mt-1 text-xs text-muted">As alterações só são confirmadas depois do salvamento.</p>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <label className={fieldClass}>
            Tema
            <select
              className={selectClass}
              value={draft.theme}
              onChange={(event) =>
                setDraft((current) => ({ ...current, theme: event.target.value as AppPreferences["theme"] }))
              }
              disabled={isSaving}
            >
              <option value="dark">Escuro</option>
              <option value="light">Claro</option>
            </select>
          </label>

          <label className={fieldClass}>
            Fuso horário preferido
            <select
              className={selectClass}
              value={draft.timezone}
              onChange={(event) => setDraft((current) => ({ ...current, timezone: event.target.value }))}
              disabled={isSaving}
            >
              <option value="system">Usar fuso do sistema</option>
              {draft.timezone !== "system" &&
                !["America/Sao_Paulo", "UTC", "America/New_York", "Europe/Lisbon"].includes(draft.timezone) && (
                  <option value={draft.timezone}>{draft.timezone}</option>
                )}
              <option value="America/Sao_Paulo">America/Sao_Paulo</option>
              <option value="UTC">UTC</option>
              <option value="America/New_York">America/New_York</option>
              <option value="Europe/Lisbon">Europe/Lisbon</option>
            </select>
            <span className="text-[11px] font-normal text-muted">Define o dia do plano, prazos de revisão e datas padrão; a duração usa tempo decorrido.</span>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-line bg-paper/50 p-3 text-xs text-ink">
            <input
              className="mt-0.5 size-4 accent-blue-600"
              type="checkbox"
              checked={draft.reducedMotion}
              onChange={(event) => setDraft((current) => ({ ...current, reducedMotion: event.target.checked }))}
              disabled={isSaving}
            />
            <span>
              <strong className="block font-semibold">Reduzir movimento</strong>
              <span className="mt-1 block text-muted">Diminui transições, animações e efeitos de rolagem.</span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-line bg-paper/50 p-3 text-xs text-ink">
            <input
              className="mt-0.5 size-4 accent-blue-600"
              type="checkbox"
              checked={draft.highContrast}
              onChange={(event) => setDraft((current) => ({ ...current, highContrast: event.target.checked }))}
              disabled={isSaving}
            />
            <span>
              <strong className="block font-semibold">Alto contraste</strong>
              <span className="mt-1 block text-muted">Aumenta o contraste das superfícies e divisores.</span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-line bg-paper/50 p-3 text-xs text-ink lg:col-span-2">
            <input
              className="mt-0.5 size-4 accent-blue-600"
              type="checkbox"
              checked={draft.gamificationVisible}
              onChange={(event) => setDraft((current) => ({ ...current, gamificationVisible: event.target.checked }))}
              disabled={isSaving}
            />
            <span>
              <strong className="block font-semibold">Mostrar recompensas (XP)</strong>
              <span className="mt-1 block text-muted">Ocultar este painel não apaga seus registros.</span>
            </span>
          </label>
        </div>

        <div className="mt-4 flex justify-end border-t border-line pt-3">
          <button type="button" className={buttonPrimaryClass} onClick={() => void handleSave()} disabled={isSaving}>
            {isSaving ? "Salvando..." : "Salvar preferências"}
          </button>
        </div>
      </section>

      <details className="rounded-2xl border border-line bg-card shadow-xs">
        <summary className="cursor-pointer list-none p-4 font-semibold text-ink">
          <span className="block text-sm">Diagnóstico e suporte</span>
          <span className="mt-1 block text-xs font-normal text-muted">Informações técnicas para ajudar a investigar problemas.</span>
        </summary>
      <section className="glass-card rounded-b-2xl border-t border-line p-5 shadow-xs" aria-labelledby="diagnostic-title">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <h3 id="diagnostic-title" className="font-heading text-xl font-bold text-ink">Diagnóstico do aplicativo</h3>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
              O arquivo exportado contém apenas versão, plataforma, schema e contagens agregadas. Materiais, notas, URLs, banco e segredos ficam fora por padrão.
            </p>
          </div>
          <button type="button" className={buttonPrimaryClass} onClick={() => void handleExportDiagnostic()} disabled={isExporting}>
            {isExporting ? "Exportando..." : "Exportar diagnóstico"}
          </button>
        </div>

        {diagnostic ? (
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DiagnosticValue label="Versão" value={diagnostic.appVersion} />
            <DiagnosticValue label="Plataforma" value={`${diagnostic.platform} · ${diagnostic.architecture}`} />
            <DiagnosticValue label="Schema local" value={String(diagnostic.schemaVersion)} />
            <DiagnosticValue label="Preparações" value={String(diagnostic.counts.preparations)} />
            <DiagnosticValue label="Materiais" value={String(diagnostic.counts.materials)} />
            <DiagnosticValue label="Questões" value={String(diagnostic.counts.questions)} />
            <DiagnosticValue label="Tentativas" value={String(diagnostic.counts.questionAttempts)} />
            <DiagnosticValue label="Sessões" value={String(diagnostic.counts.studySessions)} />
          </dl>
        ) : diagnosticLoading ? (
          <p className="mt-4 text-xs text-muted">Carregando diagnóstico...</p>
        ) : (
          <p className="mt-4 text-xs text-muted">O diagnóstico não pôde ser carregado.</p>
        )}
      </section>
      </details>
    </div>
  );
}

function DiagnosticValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-paper/50 p-3">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold text-ink" title={value}>{value}</dd>
    </div>
  );
}
