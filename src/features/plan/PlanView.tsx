import { useState, type CSSProperties, type FormEvent } from "react";
import {
  createPreparation,
  createSubject,
  getDesktopErrorMessage,
} from "../../shared/desktop/commands";
import type { StudyPlan, SubjectSummary } from "../../shared/desktop/contracts";

type PlanViewProps = {
  plan: StudyPlan | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onPlanChanged: () => void;
};

export function PlanView({
  plan,
  isLoading,
  error,
  onRetry,
  onPlanChanged,
}: PlanViewProps) {
  const [preparationName, setPreparationName] = useState("");
  const [organization, setOrganization] = useState("");
  const [role, setRole] = useState("");
  const [examDate, setExamDate] = useState("");
  const [makePrimary, setMakePrimary] = useState(false);
  const [subjectName, setSubjectName] = useState("");
  const [subjectParentId, setSubjectParentId] = useState("");
  const [selectedPreparationId, setSelectedPreparationId] = useState("");
  const [pendingForm, setPendingForm] = useState<"preparation" | "subject" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const currentPlan: StudyPlan = plan ?? { preparations: [], subjects: [] };
  const selectedPreparation =
    currentPlan.preparations.find((preparation) => preparation.id === selectedPreparationId) ??
    currentPlan.preparations[0];
  const subjectsForSelectedPreparation = currentPlan.subjects.filter(
    (subject) => subject.preparationId === selectedPreparation?.id,
  );

  const handlePreparationSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setPendingForm("preparation");

    try {
      await createPreparation({
        name: preparationName,
        organization: optionalValue(organization),
        role: optionalValue(role),
        examDate: optionalValue(examDate),
        makePrimary,
      });
      setPreparationName("");
      setOrganization("");
      setRole("");
      setExamDate("");
      setMakePrimary(false);
      onPlanChanged();
    } catch (operationError: unknown) {
      setFormError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingForm(null);
    }
  };

  const handleSubjectSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!selectedPreparation) {
      setFormError("Crie uma preparação antes de adicionar assuntos.");
      return;
    }

    setPendingForm("subject");

    try {
      await createSubject({
        preparationId: selectedPreparation.id,
        name: subjectName,
        parentId: subjectParentId || null,
      });
      setSubjectName("");
      setSubjectParentId("");
      onPlanChanged();
    } catch (operationError: unknown) {
      setFormError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingForm(null);
    }
  };

  return (
    <div className="plan-view">
      <section className="plan-intro" aria-labelledby="plan-intro-title">
        <div>
          <p className="eyebrow">EDITAL → PLANO</p>
          <h2 id="plan-intro-title">Dê um contorno para o que você quer conquistar.</h2>
          <p>
            Comece com uma preparação e uma árvore simples de assuntos. O ciclo de
            estudos entra depois, sem apagar o que você cadastrar aqui.
          </p>
        </div>
        <div className="plan-intro__signal" aria-hidden="true">
          <span>02</span>
          <span>organizar</span>
        </div>
      </section>

      {error ? (
        <div className="feedback feedback--error plan-feedback" role="alert">
          <span>{error}</span>
          <button className="button button--quiet" type="button" onClick={onRetry}>
            Tentar novamente
          </button>
        </div>
      ) : null}

      {formError ? (
        <p className="feedback feedback--error plan-feedback" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="plan-grid">
        <section className="plan-card" aria-labelledby="preparations-title">
          <div className="plan-card__heading">
            <div>
              <p className="eyebrow">PREPARAÇÕES</p>
              <h3 id="preparations-title">Seu foco atual</h3>
            </div>
            {isLoading ? <span className="loading-label">atualizando...</span> : null}
          </div>

          {currentPlan.preparations.length > 0 ? (
            <div className="preparation-list">
              {currentPlan.preparations.map((preparation) => (
                <article className="preparation-item" key={preparation.id}>
                  <div className="preparation-item__topline">
                    <h4>{preparation.name}</h4>
                    {preparation.isPrimary ? (
                      <span className="primary-label">principal</span>
                    ) : null}
                  </div>
                  <p>
                    {joinDetails([preparation.organization, preparation.role]) ||
                      "Órgão e cargo ainda não informados"}
                  </p>
                  {preparation.examDate ? (
                    <small>prova em {formatExamDate(preparation.examDate)}</small>
                  ) : (
                    <small>sem data de prova definida</small>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="plan-empty">
              <span className="plan-empty__number">01</span>
              <p>Nenhuma preparação cadastrada. O formulário ao lado inicia seu plano.</p>
            </div>
          )}
        </section>

        <section className="plan-card" aria-labelledby="new-preparation-title">
          <div className="plan-card__heading">
            <div>
              <p className="eyebrow">PRIMEIRO PASSO</p>
              <h3 id="new-preparation-title">Nova preparação</h3>
            </div>
          </div>
          <form className="plan-form" onSubmit={handlePreparationSubmit}>
            <label className="field-label" htmlFor="preparation-name">
              Nome
              <input
                id="preparation-name"
                type="text"
                value={preparationName}
                maxLength={120}
                placeholder="Ex.: TCU - Auditor de TI"
                onChange={(event) => setPreparationName(event.target.value)}
                required
                disabled={pendingForm !== null}
              />
            </label>
            <div className="form-row">
              <label className="field-label" htmlFor="preparation-organization">
                Órgão <span className="field-optional">opcional</span>
                <input
                  id="preparation-organization"
                  type="text"
                  value={organization}
                  maxLength={120}
                  placeholder="Ex.: TCU"
                  onChange={(event) => setOrganization(event.target.value)}
                  disabled={pendingForm !== null}
                />
              </label>
              <label className="field-label" htmlFor="preparation-role">
                Cargo <span className="field-optional">opcional</span>
                <input
                  id="preparation-role"
                  type="text"
                  value={role}
                  maxLength={120}
                  placeholder="Ex.: Auditor"
                  onChange={(event) => setRole(event.target.value)}
                  disabled={pendingForm !== null}
                />
              </label>
            </div>
            <label className="field-label" htmlFor="preparation-exam-date">
              Data da prova <span className="field-optional">opcional</span>
              <input
                id="preparation-exam-date"
                type="date"
                value={examDate}
                onChange={(event) => setExamDate(event.target.value)}
                disabled={pendingForm !== null}
              />
            </label>
            <label className="checkbox-label" htmlFor="preparation-primary">
              <input
                id="preparation-primary"
                type="checkbox"
                checked={makePrimary}
                onChange={(event) => setMakePrimary(event.target.checked)}
                disabled={pendingForm !== null}
              />
              <span>Tornar esta a preparação principal</span>
            </label>
            <button
              className="button button--primary"
              type="submit"
              disabled={pendingForm !== null}
            >
              {pendingForm === "preparation" ? "Salvando..." : "Salvar preparação"}
            </button>
          </form>
        </section>

        <section className="plan-card plan-card--subjects" aria-labelledby="subjects-title">
          <div className="plan-card__heading">
            <div>
              <p className="eyebrow">ESTRUTURA</p>
              <h3 id="subjects-title">Disciplinas e assuntos</h3>
            </div>
            <span className="subject-count">
              {currentPlan.subjects.length.toString().padStart(2, "0")}
            </span>
          </div>

          {selectedPreparation ? (
            <>
              <div className="subject-toolbar">
                <label className="field-label" htmlFor="subject-preparation">
                  Preparação
                  <select
                    id="subject-preparation"
                    value={selectedPreparation.id}
                    onChange={(event) => {
                      setSelectedPreparationId(event.target.value);
                      setSubjectParentId("");
                    }}
                    disabled={pendingForm !== null}
                  >
                    {currentPlan.preparations.map((preparation) => (
                      <option key={preparation.id} value={preparation.id}>
                        {preparation.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="subject-content">
                {subjectsForSelectedPreparation.length > 0 ? (
                  <div className="subject-tree" aria-label="Árvore de assuntos">
                    {subjectsForSelectedPreparation.map((subject) => (
                      <SubjectRow
                        key={subject.id}
                        subject={subject}
                        subjects={subjectsForSelectedPreparation}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="plan-empty plan-empty--compact">
                    <span className="plan-empty__number">02</span>
                    <p>Adicione a primeira disciplina ou assunto desta preparação.</p>
                  </div>
                )}
              </div>
              <form className="subject-form" onSubmit={handleSubjectSubmit}>
                <label className="field-label" htmlFor="subject-name">
                  Novo assunto
                  <input
                    id="subject-name"
                    type="text"
                    value={subjectName}
                    maxLength={160}
                    placeholder="Ex.: Língua Portuguesa"
                    onChange={(event) => setSubjectName(event.target.value)}
                    required
                    disabled={pendingForm !== null}
                  />
                </label>
                <label className="field-label" htmlFor="subject-parent">
                  Assunto pai <span className="field-optional">opcional</span>
                  <select
                    id="subject-parent"
                    value={subjectParentId}
                    onChange={(event) => setSubjectParentId(event.target.value)}
                    disabled={pendingForm !== null}
                  >
                    <option value="">Sem pai, no primeiro nível</option>
                    {subjectsForSelectedPreparation.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button button--secondary"
                  type="submit"
                  disabled={pendingForm !== null}
                >
                  {pendingForm === "subject" ? "Salvando..." : "Adicionar assunto"}
                </button>
              </form>
            </>
          ) : (
            <div className="plan-empty">
              <span className="plan-empty__number">02</span>
              <p>A árvore de assuntos aparece depois que você criar uma preparação.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SubjectRow({ subject, subjects }: { subject: SubjectSummary; subjects: SubjectSummary[] }) {
  const depth = getSubjectDepth(subject, subjects);
  const rowStyle = { "--subject-depth": depth } as CSSProperties & {
    "--subject-depth": number;
  };

  return (
    <div className="subject-row" style={rowStyle}>
      <span className="subject-row__marker" aria-hidden="true" />
      <span>{subject.name}</span>
      {depth > 0 ? <small>subassunto</small> : <small>disciplina</small>}
    </div>
  );
}

function getSubjectDepth(subject: SubjectSummary, subjects: SubjectSummary[]): number {
  const byId = new Map(subjects.map((candidate) => [candidate.id, candidate]));
  const visited = new Set<string>();
  let depth = 0;
  let parentId = subject.parentId;

  while (parentId && !visited.has(parentId) && depth < 8) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) {
      break;
    }
    depth += 1;
    parentId = parent.parentId;
  }

  return depth;
}

function optionalValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function joinDetails(details: Array<string | null>): string {
  return details.filter((detail): detail is string => Boolean(detail)).join(" · ");
}

function formatExamDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
