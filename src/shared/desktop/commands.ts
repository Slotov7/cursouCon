import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  parseAnswerQuestionResult,
  parseDailyPlan,
  parseFinishStudySessionResult,
  parseMaterial,
  parseMaterials,
  parseNote,
  parseNotes,
  parseOptionalWorkspaceSummary,
  parseQuestion,
  parseQuestionExportResult,
  parseQuestionImportPreview,
  parseQuestionImportResult,
  parseQuestions,
  parseStudyPlan,
  parseStudyProgress,
  parseStudySession,
  parseStudyTask,
  parseWorkspaceSummary,
  type AnswerQuestionRequest,
  type AnswerQuestionResult,
  type CreatePreparationRequest,
  type CreateQuestionRequest,
  type CreateStudyTaskRequest,
  type CreateSubjectRequest,
  type DailyPlan,
  type FinishStudySessionRequest,
  type FinishStudySessionResult,
  type GetQuestionsRequest,
  type ImportMaterialRequest,
  type MaterialSummary,
  type NoteSummary,
  type OpenMaterialRequest,
  type PauseStudySessionRequest,
  type QuestionSummary,
  type QuestionExportResult,
  type QuestionImportPreview,
  type QuestionImportResult,
  type RescheduleStudyTaskRequest,
  type ResumeStudySessionRequest,
  type SaveNoteRequest,
  type SkipStudyTaskRequest,
  type StartStudySessionRequest,
  type StudyPlan,
  type StudyProgressSummary,
  type StudySessionSummary,
  type StudyTaskSummary,
  type UpdateMaterialPageRequest,
  type WorkspaceRequest,
  type WorkspaceSummary,
} from "./contracts";

// Helper to check if running inside native Tauri container
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// ---------------------------------------------------------------------------
// In-Memory / LocalStorage Mock State for Web Browser Preview Mode
// ---------------------------------------------------------------------------
let mockWorkspace: WorkspaceSummary = {
  workspaceId: "ws-demo-senado",
  name: "Concurso Senado 2026",
  formatVersion: 1,
  path: "C:/Estudos/ConcursoSenado",
  storageStatus: "local",
};

let mockStudyPlan: StudyPlan = {
  preparations: [
    {
      id: "prep-1",
      name: "Senado Federal - Analista de TI",
      organization: "Senado Federal",
      role: "Analista Legislativo - TI",
      examDate: "2026-11-15",
      isPrimary: true,
    },
  ],
  subjects: [
    { id: "subj-1", preparationId: "prep-1", parentId: null, name: "Direito Constitucional", position: 1 },
    { id: "subj-2", preparationId: "prep-1", parentId: null, name: "Engenharia de Software", position: 2 },
    { id: "subj-3", preparationId: "prep-1", parentId: null, name: "Língua Portuguesa", position: 3 },
    { id: "subj-4", preparationId: "prep-1", parentId: null, name: "Bancos de Dados & SQL", position: 4 },
    { id: "subj-5", preparationId: "prep-1", parentId: null, name: "Direito Administrativo", position: 5 },
  ],
};

function getLocalDateKey(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

let mockTasks: StudyTaskSummary[] = [
  {
    id: "task-101",
    preparationId: "prep-1",
    subjectId: "subj-1",
    subjectName: "Direito Constitucional",
    title: "Controle de Constitucionalidade (Concentrado e Difuso)",
    objective: "Revisar jurisprudência do STF e fazer 15 questões.",
    plannedMinutes: 45,
    scheduledFor: getLocalDateKey(),
    status: "pending",
  },
  {
    id: "task-102",
    preparationId: "prep-1",
    subjectId: "subj-2",
    subjectName: "Engenharia de Software",
    title: "Arquitetura Hexagonal, Ports & Adapters e DDD",
    objective: "Estudo de padrões de projeto e casos de uso isolados.",
    plannedMinutes: 60,
    scheduledFor: getLocalDateKey(),
    status: "pending",
  },
  {
    id: "task-103",
    preparationId: "prep-1",
    subjectId: "subj-3",
    subjectName: "Língua Portuguesa",
    title: "Sintaxe da Oração, Período e Regência da Crase",
    objective: "Resolução de bateria de questões banca FGV.",
    plannedMinutes: 30,
    scheduledFor: getLocalDateKey(),
    status: "pending",
  },
];

let mockActiveSession: StudySessionSummary | null = null;
let mockXp = 480;

// ---------------------------------------------------------------------------
// IPC Core Wrappers
// ---------------------------------------------------------------------------

export async function getActiveWorkspace(): Promise<WorkspaceSummary | null> {
  if (!isTauri()) return mockWorkspace;
  const response = await invoke<unknown>("get_active_workspace");
  return parseOptionalWorkspaceSummary(response);
}

export async function createWorkspace(request: WorkspaceRequest): Promise<WorkspaceSummary> {
  if (!isTauri()) {
    mockWorkspace = {
      workspaceId: `ws-${Date.now()}`,
      name: request.name,
      formatVersion: 1,
      path: request.workspacePath,
      storageStatus: "local",
    };
    return mockWorkspace;
  }
  const response = await invoke<unknown>("create_workspace", { request });
  return parseWorkspaceSummary(response);
}

export async function openWorkspace(workspacePath: string): Promise<WorkspaceSummary> {
  if (!isTauri()) {
    mockWorkspace = {
      workspaceId: `ws-${Date.now()}`,
      name: "Espaço Local Carregado",
      formatVersion: 1,
      path: workspacePath,
      storageStatus: "local",
    };
    return mockWorkspace;
  }
  const response = await invoke<unknown>("open_workspace", {
    request: { workspacePath },
  });
  return parseWorkspaceSummary(response);
}

export async function pickWorkspaceDirectory(): Promise<string | null> {
  if (!isTauri()) {
    return "C:/Estudos/ConcursoSenado2026";
  }
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Escolha a pasta do espaço de estudos",
  });
  return typeof selected === "string" ? selected : null;
}

export async function getStudyPlan(): Promise<StudyPlan> {
  if (!isTauri()) return mockStudyPlan;
  const response = await invoke<unknown>("get_study_plan");
  return parseStudyPlan(response);
}

export async function createPreparation(request: CreatePreparationRequest): Promise<void> {
  if (!isTauri()) {
    mockStudyPlan.preparations.push({
      id: `prep-${Date.now()}`,
      name: request.name,
      organization: request.organization,
      role: request.role,
      examDate: request.examDate,
      isPrimary: request.makePrimary,
    });
    return;
  }
  await invoke("create_preparation", { request });
}

export async function createSubject(request: CreateSubjectRequest): Promise<void> {
  if (!isTauri()) {
    mockStudyPlan.subjects.push({
      id: `subj-${Date.now()}`,
      preparationId: request.preparationId,
      parentId: request.parentId,
      name: request.name,
      position: mockStudyPlan.subjects.length + 1,
    });
    return;
  }
  await invoke("create_subject", { request });
}

export async function getDailyPlan(date: string): Promise<DailyPlan> {
  if (!isTauri()) {
    return {
      date,
      tasks: mockTasks,
      activeSession: mockActiveSession,
    };
  }
  const response = await invoke<unknown>("get_daily_plan", { request: { date } });
  return parseDailyPlan(response);
}

export async function pickMaterialFile(): Promise<string | null> {
  if (!isTauri()) return "C:/Documentos/Edital-Sintetizado.pdf";
  const selected = await open({
    directory: false,
    multiple: false,
    title: "Escolha um material para importar",
  });
  return typeof selected === "string" ? selected : null;
}

export async function getMaterials(): Promise<MaterialSummary[]> {
  if (!isTauri()) {
    return [
      {
        id: "mat-1",
        originalName: "Constituicao-Federal-1988-CF88.pdf",
        contentHash: "hash-123",
        mimeType: "application/pdf",
        byteSize: 2450000,
        importedAt: "2026-01-12T14:00:00Z",
        currentPage: 42,
        subjects: [{ id: "subj-1", name: "Direito Constitucional" }],
      },
      {
        id: "mat-2",
        originalName: "Engenharia-de-Software-Pressman-Anotacoes.pdf",
        contentHash: "hash-456",
        mimeType: "application/pdf",
        byteSize: 5200000,
        importedAt: "2026-01-15T11:00:00Z",
        currentPage: 88,
        subjects: [{ id: "subj-2", name: "Engenharia de Software" }],
      },
    ];
  }
  const response = await invoke<unknown>("get_materials");
  return parseMaterials(response);
}

export async function importMaterial(request: ImportMaterialRequest): Promise<MaterialSummary> {
  if (!isTauri()) {
    return {
      id: `mat-${Date.now()}`,
      originalName: request.sourcePath.split("/").pop() || "Material.pdf",
      contentHash: `hash-${Date.now()}`,
      mimeType: "application/pdf",
      byteSize: 1024000,
      importedAt: new Date().toISOString(),
      currentPage: 1,
      subjects: request.subjectId ? [{ id: request.subjectId, name: "Disciplina Selecionada" }] : [],
    };
  }
  const response = await invoke<unknown>("import_material", { request });
  return parseMaterial(response);
}

export async function openMaterial(request: OpenMaterialRequest): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_material", { request });
}

export async function getMaterialSource(request: OpenMaterialRequest): Promise<string> {
  if (!isTauri()) return "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";
  const sourcePath = await invoke<unknown>("get_material_source", { request });
  if (typeof sourcePath !== "string" || sourcePath.trim().length === 0) {
    throw new Error("O núcleo local devolveu uma origem de material inválida.");
  }
  return convertFileSrc(sourcePath);
}

export async function updateMaterialPage(request: UpdateMaterialPageRequest): Promise<MaterialSummary> {
  if (!isTauri()) {
    return {
      id: request.materialId,
      originalName: "Material Local",
      contentHash: "hash-local",
      mimeType: "application/pdf",
      byteSize: 1024000,
      importedAt: new Date().toISOString(),
      currentPage: request.page,
      subjects: [{ id: "subj-1", name: "Direito Constitucional" }],
    };
  }
  const response = await invoke<unknown>("update_material_page", { request });
  return parseMaterial(response);
}

export async function getNotes(): Promise<NoteSummary[]> {
  if (!isTauri()) {
    return [
      {
        id: "note-1",
        title: "Resumo Súmula Vinculante 10 STF",
        contentMarkdown: "Viola a cláusula de reserva de plenário (CF, art. 97) a decisão de órgão fracionário de tribunal que afasta a incidência de lei.",
        materialId: "mat-1",
        subjectId: "subj-1",
        materialName: "Constituicao-Federal-1988-CF88.pdf",
        subjectName: "Direito Constitucional",
        createdAt: "2026-02-01T15:30:00Z",
        updatedAt: "2026-02-01T15:30:00Z",
      },
    ];
  }
  const response = await invoke<unknown>("get_notes");
  return parseNotes(response);
}

export async function saveNote(request: SaveNoteRequest): Promise<NoteSummary> {
  if (!isTauri()) {
    return {
      id: request.id || `note-${Date.now()}`,
      title: request.title,
      contentMarkdown: request.contentMarkdown,
      materialId: request.materialId,
      subjectId: request.subjectId,
      materialName: null,
      subjectName: "Disciplina",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  const response = await invoke<unknown>("save_note", { request });
  return parseNote(response);
}

export async function getQuestions(request: GetQuestionsRequest): Promise<QuestionSummary[]> {
  if (!isTauri()) return [];
  const response = await invoke<unknown>("get_questions", { request });
  return parseQuestions(response);
}

export async function pickQuestionImportFile(): Promise<string | null> {
  if (!isTauri()) return null;
  const selected = await open({
    directory: false,
    multiple: false,
    title: "Escolha um arquivo JSON de questões",
    filters: [{ name: "JSON de questões", extensions: ["json"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export async function previewQuestionImport(sourcePath: string): Promise<QuestionImportPreview> {
  if (!isTauri()) {
    throw new Error("A prévia de JSON está disponível no aplicativo desktop.");
  }
  const response = await invoke<unknown>("preview_question_import", {
    request: { sourcePath },
  });
  return parseQuestionImportPreview(response);
}

export async function importQuestions(
  sourcePath: string,
  expectedFileHash: string,
): Promise<QuestionImportResult> {
  if (!isTauri()) {
    throw new Error("A importação JSON está disponível no aplicativo desktop.");
  }
  const response = await invoke<unknown>("import_questions", {
    request: { sourcePath, expectedFileHash },
  });
  return parseQuestionImportResult(response);
}

export async function exportQuestions(): Promise<QuestionExportResult> {
  if (!isTauri()) {
    return { path: "exports/questions-demo.json", exported: 0, schemaVersion: 1 };
  }
  const response = await invoke<unknown>("export_questions");
  return parseQuestionExportResult(response);
}

export async function createQuestion(request: CreateQuestionRequest): Promise<QuestionSummary> {
  if (!isTauri()) {
    return {
      id: `q-${Date.now()}`,
      questionType: request.questionType,
      statementMarkdown: request.statementMarkdown,
      options: request.options,
      answerKey: request.answerKey,
      explanationMarkdown: request.explanationMarkdown,
      sourceName: request.sourceName,
      board: request.board,
      organization: request.organization,
      role: request.role,
      examYear: request.examYear,
      subjectId: request.subjectId,
      subjectName: "Disciplina",
      status: "active",
      attemptsCount: 0,
      firstAttemptResult: null,
      lastAttemptResult: null,
    };
  }
  const response = await invoke<unknown>("create_question", { request });
  return parseQuestion(response);
}

export async function answerQuestion(request: AnswerQuestionRequest): Promise<AnswerQuestionResult> {
  if (!isTauri()) {
    const mockQuestion: QuestionSummary = {
      id: request.questionId,
      questionType: "multiple_choice",
      statementMarkdown: "Questão respondida no modo de teste.",
      options: [{ key: "C", text: "Opção C" }],
      answerKey: "C",
      explanationMarkdown: "Gabarito C.",
      sourceName: null,
      board: "Cebraspe",
      organization: "STF",
      role: "Analista",
      examYear: 2025,
      subjectId: "subj-1",
      subjectName: "Direito Constitucional",
      status: "active",
      attemptsCount: 1,
      firstAttemptResult: "correct",
      lastAttemptResult: "correct",
    };

    return {
      attempt: {
        id: `att-${Date.now()}`,
        questionId: request.questionId,
        selectedKey: request.selectedKey,
        confidence: request.confidence,
        elapsedSeconds: request.elapsedSeconds,
        answerKeyAtAttempt: "C",
        result: "correct",
        answeredAt: new Date().toISOString(),
      },
      question: mockQuestion,
      xpGranted: 2,
    };
  }
  const response = await invoke<unknown>("answer_question", { request });
  return parseAnswerQuestionResult(response);
}

export async function createStudyTask(request: CreateStudyTaskRequest): Promise<void> {
  if (!isTauri()) {
    mockTasks.push({
      id: `task-${Date.now()}`,
      preparationId: request.preparationId,
      subjectId: request.subjectId,
      subjectName: "Disciplina",
      title: request.title,
      objective: request.objective,
      plannedMinutes: request.plannedMinutes,
      scheduledFor: request.scheduledFor,
      status: "pending",
    });
    return;
  }
  const response = await invoke<unknown>("create_study_task", { request });
  parseStudyTask(response);
}

export async function rescheduleStudyTask(request: RescheduleStudyTaskRequest): Promise<void> {
  if (!isTauri()) {
    const task = mockTasks.find((t) => t.id === request.taskId);
    if (task) task.scheduledFor = request.scheduledFor;
    return;
  }
  const response = await invoke<unknown>("reschedule_study_task", { request });
  parseStudyTask(response);
}

export async function skipStudyTask(request: SkipStudyTaskRequest): Promise<void> {
  if (!isTauri()) {
    const task = mockTasks.find((t) => t.id === request.taskId);
    if (task) task.status = "skipped";
    return;
  }
  const response = await invoke<unknown>("skip_study_task", { request });
  parseStudyTask(response);
}

export async function startStudySession(request: StartStudySessionRequest): Promise<StudySessionSummary> {
  if (!isTauri()) {
    const nowIso = new Date().toISOString();
    mockActiveSession = {
      id: `sess-${Date.now()}`,
      taskId: request.taskId,
      subjectId: "subj-1",
      status: "active",
      startedAt: nowIso,
      activeStartedAt: nowIso,
      effectiveSeconds: 0,
    };
    return mockActiveSession;
  }
  const response = await invoke<unknown>("start_study_session", { request });
  return parseStudySession(response);
}

export async function pauseStudySession(request: PauseStudySessionRequest): Promise<StudySessionSummary> {
  if (!isTauri()) {
    if (mockActiveSession) {
      mockActiveSession.status = "paused";
      mockActiveSession.effectiveSeconds = request.effectiveSeconds;
    }
    return mockActiveSession!;
  }
  const response = await invoke<unknown>("pause_study_session", { request });
  return parseStudySession(response);
}

export async function resumeStudySession(request: ResumeStudySessionRequest): Promise<StudySessionSummary> {
  if (!isTauri()) {
    if (mockActiveSession) {
      mockActiveSession.status = "active";
      mockActiveSession.activeStartedAt = new Date().toISOString();
    }
    return mockActiveSession!;
  }
  const response = await invoke<unknown>("resume_study_session", { request });
  return parseStudySession(response);
}

export async function finishStudySession(request: FinishStudySessionRequest): Promise<FinishStudySessionResult> {
  if (!isTauri()) {
    const task = mockTasks.find((t) => t.id === mockActiveSession?.taskId);
    if (task) {
      task.status = request.taskStatus;
    }
    const completedSession = mockActiveSession || {
      id: `sess-${Date.now()}`,
      taskId: "task-101",
      subjectId: "subj-1",
      startedAt: new Date().toISOString(),
      activeStartedAt: null,
      effectiveSeconds: request.effectiveSeconds,
      status: "completed" as const,
    };

    mockActiveSession = null;
    mockXp += 50;

    return {
      session: { ...completedSession, status: "completed" },
      xpGranted: 50,
    };
  }
  const response = await invoke<unknown>("finish_study_session", { request });
  return parseFinishStudySessionResult(response);
}

export async function getStudyProgress(): Promise<StudyProgressSummary> {
  if (!isTauri()) {
    return {
      totalXp: mockXp,
      completedSessions: 32,
      effectiveSeconds: 67200, // 112h
      recentSessions: [
        {
          sessionId: "sess-1",
          taskId: "task-101",
          taskTitle: "Controle de Constitucionalidade",
          subjectName: "Direito Constitucional",
          endedAt: "2026-02-20T14:00:00Z",
          effectiveSeconds: 2700,
          taskStatus: "completed",
          xpGranted: 50,
        },
        {
          sessionId: "sess-2",
          taskId: "task-102",
          taskTitle: "Arquitetura Hexagonal & DDD",
          subjectName: "Engenharia de Software",
          endedAt: "2026-02-21T10:00:00Z",
          effectiveSeconds: 3600,
          taskStatus: "completed",
          xpGranted: 50,
        },
      ],
    };
  }
  const response = await invoke<unknown>("get_study_progress");
  return parseStudyProgress(response);
}

export function getDesktopErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return "Não foi possível concluir a operação no núcleo local.";
}
