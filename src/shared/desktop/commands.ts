import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  parseAnswerQuestionResult,
  parseBackupInspectionSummary,
  parseBackupSummary,
  parseCompleteStudyReviewResult,
  parseAppPreferences,
  parseCorrectStudySessionDurationResult,
  parseCreateManualStudyResult,
  parseWorkspaceDataExportResult,
  parseAcceptStudyCycleActionResult,
  parseDailyPlan,
  parseExternalQuestionBatch,
  parseQuestionPerformance,
  parseDiagnosticExportResult,
  parseDiagnosticSnapshot,
  parseFinishStudySessionResult,
  parseMaterial,
  parseMaterials,
  parseNote,
  parseNotes,
  parseManualContest,
  parseManualContests,
  parseOptionalWorkspaceSummary,
  parsePreparationSummary,
  parseQuestion,
  parseQuestionExportResult,
  parseQuestionImportPreview,
  parseQuestionImportResult,
  parseQuestionNotebookEntries,
  parseNotebooks,
  parseNotebook,
  parseQuestions,
  parseReviseQuestionResult,
  parseRevisionSummary,
  parseStudyPlanning,
  parseSyncDestinationSettings,
  parseStudyPlan,
  parseStudyProgress,
  parseStudyReview,
  parseSubject,
  parseStudySession,
  parseStudyTask,
  parseWorkspaceSummary,
  type AnswerQuestionRequest,
  type AnswerQuestionResult,
  type AppPreferences,
  type BackupSummary,
  type BackupInspectionSummary,
  type CreatePreparationRequest,
  type SetPrimaryPreparationRequest,
  type CreateBackupRequest,
  type InspectBackupRequest,
  type CreateQuestionRequest,
  type CreateNotebookRequest,
  type CreateStudyTaskRequest,
  type CreateExternalQuestionBatchRequest,
  type ExternalQuestionBatchSummary,
  type QuestionPerformanceSummary,
  type ConfigureSyncDestinationRequest,
  type CreateSubjectRequest,
  type UpdateSubjectRequest,
  type MoveSubjectRequest,
  type ArchiveSubjectRequest,
  type SavePreparationExamConfigRequest,
  type DailyPlan,
  type DiagnosticExportResult,
  type DiagnosticSnapshot,
  type AcceptStudyCycleActionRequest,
  type AcceptStudyCycleActionResult,
  type FinishStudySessionRequest,
  type FinishStudySessionResult,
  type HeartbeatStudySessionRequest,
  type CompleteStudyReviewRequest,
  type CompleteStudyReviewResult,
  type CorrectStudySessionDurationRequest,
  type CorrectStudySessionDurationResult,
  type CreateManualStudyRequest,
  type CreateManualStudyResult,
  type GetStudyProgressRequest,
  type GetQuestionsRequest,
  type ImportMaterialRequest,
  type RegisterMaterialLinkRequest,
  type MaterialSummary,
  type NoteSummary,
  type ManualContestSummary,
  type OpenMaterialRequest,
  type PauseStudySessionRequest,
  type QuestionSummary,
  type QuestionResult,
  type ReviseQuestionRequest,
  type ReviseQuestionResult,
  type QuestionExportResult,
  type QuestionImportPreview,
  type QuestionImportResult,
  type QuestionNotebookEntry,
  type RevisionSummary,
  type RestoreWorkspaceRevisionRequest,
  type NotebookSummary,
  type PublishWorkspaceRevisionRequest,
  type SetQuestionNotebookRequest,
  type RescheduleStudyTaskRequest,
  type ResumeStudySessionRequest,
  type SaveStudySessionReflectionRequest,
  type RestoreBackupRequest,
  type SaveNoteRequest,
  type SaveManualContestRequest,
  type SetManualContestFavoriteRequest,
  type SetManualContestNoticeRequest,
  type SkipStudyTaskRequest,
  type StartStudySessionRequest,
  type StudyPlan,
  type StudyPlanningSummary,
  type PreparationSummary,
  type SaveStudyPlanningRequest,
  type SaveAppPreferencesRequest,
  type StudyPlanningPreparationRequest,
  type StudyHistoryEntry,
  type SubjectSummary,
  type SetMaterialSubjectsRequest,
  type SetMaterialTagsRequest,
  type SetSubjectStudyStatusRequest,
  type StudyProgressSummary,
  type StudyReviewSummary,
  type StudySessionSummary,
  type StudyTaskSummary,
  type RescheduleStudyReviewRequest,
  type SyncDestinationSettings,
  type UpdateMaterialPageRequest,
  type WorkspaceRequest,
  type WorkspaceDataExportResult,
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

let mockSyncDestinationSettings: SyncDestinationSettings = {
  enabled: false,
  destinationPath: null,
};

let mockAppPreferences: AppPreferences = {
  theme: "dark",
  reducedMotion: false,
  highContrast: false,
  timezone: "system",
  gamificationVisible: true,
};

let mockStudyPlan: StudyPlan = {
  preparations: [
    {
      id: "prep-1",
      name: "Senado Federal - Analista de TI",
      organization: "Senado Federal",
      role: "Analista Legislativo - TI",
      board: null,
      examDate: "2026-11-15",
      isPrimary: true,
      referenceMaterialId: "mat-1",
      referenceDocumentStatus: "reference",
      examRulesMarkdown: "- Cada questão vale 1 ponto.\n- Consulte o edital antes de ajustar o plano.",
    },
  ],
  subjects: [
    { id: "subj-1", preparationId: "prep-1", parentId: null, name: "Direito Constitucional", position: 1, priority: 1, studyStatus: "not_started", examWeight: 2 },
    { id: "subj-2", preparationId: "prep-1", parentId: null, name: "Engenharia de Software", position: 2, priority: 2, studyStatus: "not_started", examWeight: 2 },
    { id: "subj-3", preparationId: "prep-1", parentId: null, name: "Língua Portuguesa", position: 3, priority: 3, studyStatus: "not_started", examWeight: 1 },
    { id: "subj-4", preparationId: "prep-1", parentId: null, name: "Bancos de Dados & SQL", position: 4, priority: 4, studyStatus: "not_started", examWeight: 1 },
    { id: "subj-5", preparationId: "prep-1", parentId: null, name: "Direito Administrativo", position: 5, priority: 5, studyStatus: "not_started", examWeight: null },
  ],
  subjectCoverage: [],
};

let mockStudyPlanning: StudyPlanningSummary = {
  preparationId: "prep-1",
  availability: [
    { weekday: 0, availableMinutes: 0, isRest: true },
    { weekday: 1, availableMinutes: 60, isRest: false },
    { weekday: 2, availableMinutes: 60, isRest: false },
    { weekday: 3, availableMinutes: 60, isRest: false },
    { weekday: 4, availableMinutes: 60, isRest: false },
    { weekday: 5, availableMinutes: 60, isRest: false },
    { weekday: 6, availableMinutes: 0, isRest: true },
  ],
  subjectPriorities: [
    { subjectId: "subj-1", priority: 1 },
    { subjectId: "subj-2", priority: 2 },
    { subjectId: "subj-3", priority: 3 },
    { subjectId: "subj-4", priority: 4 },
    { subjectId: "subj-5", priority: 5 },
  ],
  weeklyAvailableMinutes: 300,
  weeklyStudyMinutes: 240,
  reviewReservePercent: 20,
  cyclePosition: 0,
  cycleStep: 0,
  cycleSlots: [
    { position: 0, subjectId: "subj-1", subjectName: "Direito Constitucional", priority: 1, plannedMinutes: 30 },
    { position: 1, subjectId: "subj-2", subjectName: "Engenharia de Software", priority: 2, plannedMinutes: 30 },
    { position: 2, subjectId: "subj-3", subjectName: "Língua Portuguesa", priority: 3, plannedMinutes: 30 },
    { position: 3, subjectId: "subj-4", subjectName: "Bancos de Dados & SQL", priority: 4, plannedMinutes: 30 },
    { position: 4, subjectId: "subj-5", subjectName: "Direito Administrativo", priority: 5, plannedMinutes: 30 },
    { position: 5, subjectId: "subj-1", subjectName: "Direito Constitucional", priority: 1, plannedMinutes: 30 },
    { position: 6, subjectId: "subj-2", subjectName: "Engenharia de Software", priority: 2, plannedMinutes: 30 },
    { position: 7, subjectId: "subj-3", subjectName: "Língua Portuguesa", priority: 3, plannedMinutes: 30 },
    { position: 8, subjectId: "subj-1", subjectName: "Direito Constitucional", priority: 1, plannedMinutes: 30 },
    { position: 9, subjectId: "subj-2", subjectName: "Engenharia de Software", priority: 2, plannedMinutes: 30 },
  ],
  warning: null,
  updatedAt: new Date().toISOString(),
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
    materialId: "mat-1",
    materialName: "Constituicao-Federal-1988-CF88.pdf",
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
    materialId: "mat-2",
    materialName: "Engenharia-de-Software-Pressman-Anotacoes.pdf",
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
    materialId: null,
    materialName: null,
    title: "Sintaxe da Oração, Período e Regência da Crase",
    objective: "Resolução de bateria de questões banca FGV.",
    plannedMinutes: 30,
    scheduledFor: getLocalDateKey(),
    status: "pending",
  },
];

let mockActiveSession: StudySessionSummary | null = null;
let mockStudyReviews: StudyReviewSummary[] = [];
let mockXp = 480;
let mockRecentSessions: StudyHistoryEntry[] = [];
let mockExternalQuestionBatches: ExternalQuestionBatchSummary[] = [];
let mockIndividualAttempts: Array<{ questionId: string; result: QuestionResult; answeredAt: string }> = [];
const MOCK_REVIEW_XP_PER_OCCURRENCE = 5;
const MOCK_REVIEW_XP_DAILY_CAP = 30;
let mockNotebookEntries: Record<string, QuestionNotebookEntry[]> = {
  "notebook-errors": [],
};
let mockNotebooks: NotebookSummary[] = [
  {
    id: "notebook-errors",
    name: "Caderno de Erros",
    kind: "error",
    questionCount: 0,
    filter: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];
let mockManualContests: ManualContestSummary[] = [];
let mockMaterials: MaterialSummary[] = [
  {
    id: "mat-1",
    originalName: "Constituicao-Federal-1988-CF88.pdf",
    contentHash: "hash-123",
    mimeType: "application/pdf",
    sourceUrl: null,
    byteSize: 2450000,
    importedAt: "2026-01-12T14:00:00Z",
    currentPage: 42,
    subjects: [{ id: "subj-1", name: "Direito Constitucional" }],
    tags: ["base", "constitucional"],
  },
  {
    id: "mat-2",
    originalName: "Engenharia-de-Software-Pressman-Anotacoes.pdf",
    contentHash: "hash-456",
    mimeType: "application/pdf",
    sourceUrl: null,
    byteSize: 5200000,
    importedAt: "2026-01-15T11:00:00Z",
    currentPage: 88,
    subjects: [{ id: "subj-2", name: "Engenharia de Software" }],
    tags: ["referência"],
  },
];

// ---------------------------------------------------------------------------
// IPC Core Wrappers
// ---------------------------------------------------------------------------

export async function getActiveWorkspace(): Promise<WorkspaceSummary | null> {
  if (!isTauri()) return mockWorkspace;
  const response = await invoke<unknown>("get_active_workspace");
  return parseOptionalWorkspaceSummary(response);
}

export async function getAppPreferences(): Promise<AppPreferences> {
  if (!isTauri()) return { ...mockAppPreferences };
  const response = await invoke<unknown>("get_app_preferences");
  return parseAppPreferences(response);
}

export async function saveAppPreferences(
  request: SaveAppPreferencesRequest,
): Promise<AppPreferences> {
  if (!isTauri()) {
    mockAppPreferences = { ...request };
    return { ...mockAppPreferences };
  }
  const response = await invoke<unknown>("save_app_preferences", { request });
  return parseAppPreferences(response);
}

export async function getAppDiagnostic(): Promise<DiagnosticSnapshot> {
  if (!isTauri()) {
    return {
      appVersion: "0.1.0",
      platform: "web-preview",
      architecture: "browser",
      workspaceFormatVersion: 1,
      schemaVersion: 30,
      counts: {
        preparations: mockStudyPlan.preparations.length,
        subjects: mockStudyPlan.subjects.length,
        materials: mockMaterials.length,
        notes: 0,
        questions: 3,
        questionAttempts: 0,
        studySessions: mockRecentSessions.length,
      },
    };
  }
  const response = await invoke<unknown>("get_app_diagnostic");
  return parseDiagnosticSnapshot(response);
}

export async function exportDiagnostic(
  destinationParentPath: string,
): Promise<DiagnosticExportResult> {
  if (!isTauri()) {
    return {
      path: `${destinationParentPath}/cursoucon-diagnostic-demo.json`,
      snapshot: await getAppDiagnostic(),
    };
  }
  const response = await invoke<unknown>("export_diagnostic", {
    request: { destinationParentPath },
  });
  return parseDiagnosticExportResult(response);
}

export async function exportWorkspaceData(): Promise<WorkspaceDataExportResult> {
  if (!isTauri()) {
    return {
      path: "exports/data-demo",
      schemaVersion: 1,
      exportedRecords: 0,
      exportedNotes: 0,
      exportedAttachments: 0,
    };
  }
  const response = await invoke<unknown>("export_workspace_data");
  return parseWorkspaceDataExportResult(response);
}

export async function getRecentWorkspaces(): Promise<WorkspaceSummary[]> {
  if (!isTauri()) return [mockWorkspace];
  const response = await invoke<unknown>("get_recent_workspaces");
  if (!Array.isArray(response)) {
    throw new Error("O núcleo local devolveu uma lista de espaços inválida.");
  }
  return response.map(parseWorkspaceSummary);
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

export async function createWorkspaceBackup(
  request: CreateBackupRequest,
): Promise<BackupSummary> {
  if (!isTauri()) {
    return {
      path: `${request.destinationParentPath}/ConcursoSenado-backup-demo`,
      workspaceName: mockWorkspace.name,
      createdAtEpochSeconds: Math.floor(Date.now() / 1000),
    };
  }
  const response = await invoke<unknown>("create_workspace_backup", { request });
  return parseBackupSummary(response);
}

export async function inspectWorkspaceBackup(
  request: InspectBackupRequest,
): Promise<BackupInspectionSummary> {
  if (!isTauri()) {
    return {
      path: request.backupPath,
      backupFormatVersion: 1,
      workspaceId: mockWorkspace.workspaceId,
      workspaceName: mockWorkspace.name,
      workspaceFormatVersion: mockWorkspace.formatVersion,
      databaseSha256: "0".repeat(64),
      createdAtEpochSeconds: Math.floor(Date.now() / 1000),
      blobCount: 0,
      revisionFileCount: 0,
      exportFileCount: 0,
    };
  }
  const response = await invoke<unknown>("inspect_workspace_backup", { request });
  return parseBackupInspectionSummary(response);
}

export async function createWorkspaceRevision(): Promise<RevisionSummary> {
  if (!isTauri()) {
    return {
      revisionId: `revision-${Date.now()}`,
      path: `${mockWorkspace.path}/revisions/revision-demo`,
      createdAtEpochSeconds: Math.floor(Date.now() / 1000),
      blobCount: 0,
    };
  }
  const response = await invoke<unknown>("create_workspace_revision");
  return parseRevisionSummary(response);
}

export async function publishWorkspaceRevision(
  request: PublishWorkspaceRevisionRequest,
): Promise<RevisionSummary> {
  if (!isTauri()) {
    return {
      revisionId: `revision-${Date.now()}`,
      path: `${request.destinationParentPath}/ConcursoSenado-revision-demo`,
      createdAtEpochSeconds: Math.floor(Date.now() / 1000),
      blobCount: 0,
    };
  }
  const response = await invoke<unknown>("publish_workspace_revision", { request });
  return parseRevisionSummary(response);
}

export async function publishConfiguredWorkspaceRevision(): Promise<RevisionSummary> {
  if (!isTauri()) {
    return {
      revisionId: `revision-${Date.now()}`,
      path: `${mockSyncDestinationSettings.destinationPath}/ConcursoSenado-revision-demo`,
      createdAtEpochSeconds: Math.floor(Date.now() / 1000),
      blobCount: 0,
    };
  }
  const response = await invoke<unknown>("publish_configured_workspace_revision");
  return parseRevisionSummary(response);
}

export async function getSyncDestinationSettings(): Promise<SyncDestinationSettings> {
  if (!isTauri()) {
    return mockSyncDestinationSettings;
  }
  const response = await invoke<unknown>("get_sync_destination_settings");
  return parseSyncDestinationSettings(response);
}

export async function configureSyncDestination(
  request: ConfigureSyncDestinationRequest,
): Promise<SyncDestinationSettings> {
  if (!isTauri()) {
    mockSyncDestinationSettings = {
      enabled: request.enabled,
      destinationPath: request.destinationParentPath,
    };
    return mockSyncDestinationSettings;
  }
  const response = await invoke<unknown>("configure_sync_destination", { request });
  return parseSyncDestinationSettings(response);
}

export async function getWorkspaceRevisions(workspacePath: string): Promise<RevisionSummary[]> {
  if (!isTauri()) {
    return [
      {
        revisionId: "revision-demo",
        path: `${workspacePath}/revisions/revision-demo`,
        createdAtEpochSeconds: Math.floor(Date.now() / 1000),
        blobCount: 0,
      },
    ];
  }
  const response = await invoke<unknown>("get_workspace_revisions", {
    request: { workspacePath },
  });
  if (!Array.isArray(response)) {
    throw new Error("O núcleo local devolveu uma lista de revisões inválida.");
  }
  return response.map(parseRevisionSummary);
}

export async function restoreWorkspaceRevision(
  request: RestoreWorkspaceRevisionRequest,
): Promise<WorkspaceSummary> {
  if (!isTauri()) {
    mockWorkspace = {
      ...mockWorkspace,
      workspaceId: `ws-revision-${Date.now()}`,
      path: request.workspacePath,
    };
    return mockWorkspace;
  }
  const response = await invoke<unknown>("restore_workspace_revision", { request });
  return parseWorkspaceSummary(response);
}

export async function restoreWorkspaceBackup(
  request: RestoreBackupRequest,
): Promise<WorkspaceSummary> {
  if (!isTauri()) {
    mockWorkspace = {
      ...mockWorkspace,
      workspaceId: `ws-restored-${Date.now()}`,
      name: `${mockWorkspace.name} (restaurado)`,
      path: `${request.destinationParentPath}/ConcursoSenado-restaurado`,
    };
    return mockWorkspace;
  }
  const response = await invoke<unknown>("restore_workspace_backup", { request });
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

export async function pickDirectory(title: string): Promise<string | null> {
  if (!isTauri()) {
    return "C:/Estudos/CursouCon";
  }
  const selected = await open({
    directory: true,
    multiple: false,
    title,
  });
  return typeof selected === "string" ? selected : null;
}

function getMockStudyPlan(): StudyPlan {
  const subjectCoverage = mockStudyPlan.preparations.map((preparation) => {
    const subjects = mockStudyPlan.subjects.filter(
      (subject) => subject.preparationId === preparation.id,
    );
    return {
      preparationId: preparation.id,
      totalSubjects: subjects.length,
      startedSubjects: subjects.filter((subject) => subject.studyStatus !== "not_started").length,
      completedSubjects: subjects.filter((subject) => subject.studyStatus === "theory_completed").length,
    };
  });
  return { ...mockStudyPlan, subjectCoverage };
}

export async function getStudyPlan(): Promise<StudyPlan> {
  if (!isTauri()) return getMockStudyPlan();
  const response = await invoke<unknown>("get_study_plan");
  return parseStudyPlan(response);
}

export async function getStudyPlanning(
  request: StudyPlanningPreparationRequest,
): Promise<StudyPlanningSummary> {
  if (!isTauri()) {
    if (request.preparationId !== mockStudyPlanning.preparationId) {
      throw new Error("A preparação escolhida não existe mais.");
    }
    return mockStudyPlanning;
  }
  const response = await invoke<unknown>("get_study_planning", { request });
  return parseStudyPlanning(response);
}

export async function saveStudyPlanning(
  request: SaveStudyPlanningRequest,
): Promise<StudyPlanningSummary> {
  if (!isTauri()) {
    const preparation = mockStudyPlan.preparations.find((item) => item.id === request.preparationId);
    if (!preparation) throw new Error("A preparação escolhida não existe mais.");
    for (const subjectPriority of request.subjectPriorities) {
      mockStudyPlan.subjects = mockStudyPlan.subjects.map((subject) =>
        subject.id === subjectPriority.subjectId
          ? { ...subject, priority: subjectPriority.priority }
          : subject,
      );
    }
    const totalMinutes = request.availability.reduce(
      (total, day) => total + day.availableMinutes,
      0,
    );
    const orderedSubjects = mockStudyPlan.subjects
      .filter((subject) => subject.preparationId === request.preparationId)
      .sort((left, right) => left.priority - right.priority || left.position - right.position);
    const weeklyStudyMinutes = Math.floor(
      (totalMinutes * (100 - request.reviewReservePercent)) / 100,
    );
    const blockCount = orderedSubjects.length > 0 ? Math.floor(weeklyStudyMinutes / 30) : 0;
    const generatedSlots = Array.from({ length: blockCount }, (_, position) => {
      const subject = orderedSubjects[position % orderedSubjects.length];
      return {
        position,
        subjectId: subject.id,
        subjectName: subject.name,
        priority: subject.priority,
        plannedMinutes: 30,
      };
    });
    const cycleSlots = request.cycleSlots
      ? request.cycleSlots.map((slot, position) => {
          const subject = orderedSubjects.find((item) => item.id === slot.subjectId);
          if (!subject) throw new Error("Um assunto do ciclo não existe mais.");
          return {
            position,
            subjectId: subject.id,
            subjectName: subject.name,
            priority: subject.priority,
            plannedMinutes: slot.plannedMinutes,
          };
        })
      : generatedSlots;
    if (cycleSlots.reduce((total, slot) => total + slot.plannedMinutes, 0) > weeklyStudyMinutes) {
      throw new Error("O ciclo editado excede o tempo semanal para estudo.");
    }
    mockStudyPlanning = {
      preparationId: request.preparationId,
      availability: request.availability,
      subjectPriorities: orderedSubjects.map((subject) => ({
        subjectId: subject.id,
        priority: subject.priority,
      })),
      weeklyAvailableMinutes: totalMinutes,
      weeklyStudyMinutes,
      reviewReservePercent: request.reviewReservePercent,
      cyclePosition: 0,
      cycleStep: 0,
      cycleSlots,
      warning:
        orderedSubjects.length === 0
          ? "Cadastre ao menos uma disciplina para montar o ciclo."
          : cycleSlots.length === 0
            ? "A disponibilidade precisa alcançar um bloco de 30 minutos."
            : null,
      updatedAt: new Date().toISOString(),
    };
    return mockStudyPlanning;
  }
  const response = await invoke<unknown>("save_study_planning", { request });
  return parseStudyPlanning(response);
}

export async function advanceStudyCycle(
  request: StudyPlanningPreparationRequest,
): Promise<StudyPlanningSummary> {
  if (!isTauri()) {
    if (request.preparationId !== mockStudyPlanning.preparationId) {
      throw new Error("A preparação escolhida não existe mais.");
    }
    if (mockStudyPlanning.cycleSlots.length === 0) {
      throw new Error("Salve uma disponibilidade e uma prioridade antes de avançar o ciclo.");
    }
    mockStudyPlanning = {
      ...mockStudyPlanning,
      cyclePosition: (mockStudyPlanning.cyclePosition + 1) % mockStudyPlanning.cycleSlots.length,
      cycleStep: mockStudyPlanning.cycleStep + 1,
    };
    return mockStudyPlanning;
  }
  const response = await invoke<unknown>("advance_study_cycle", { request });
  return parseStudyPlanning(response);
}

export async function createPreparation(request: CreatePreparationRequest): Promise<void> {
  if (!isTauri()) {
    const makePrimary = request.makePrimary || mockStudyPlan.preparations.length === 0;
    if (makePrimary) {
      mockStudyPlan.preparations = mockStudyPlan.preparations.map((item) => ({ ...item, isPrimary: false }));
    }
    mockStudyPlan.preparations.push({
      id: `prep-${Date.now()}`,
      name: request.name,
      organization: request.organization,
      role: request.role,
      board: request.board,
      examDate: request.examDate,
      isPrimary: makePrimary,
      referenceMaterialId: null,
      referenceDocumentStatus: "reference",
      examRulesMarkdown: null,
    });
    return;
  }
  await invoke("create_preparation", { request });
}

export async function setPrimaryPreparation(
  request: SetPrimaryPreparationRequest,
): Promise<PreparationSummary> {
  if (!isTauri()) {
    const existing = mockStudyPlan.preparations.find((item) => item.id === request.preparationId);
    if (!existing) throw new Error("A preparação escolhida não existe mais.");
    mockStudyPlan.preparations = mockStudyPlan.preparations.map((item) => ({
      ...item,
      isPrimary: item.id === request.preparationId,
    }));
    const updated = mockStudyPlan.preparations.find((item) => item.id === request.preparationId);
    if (!updated) throw new Error("A preparação escolhida não existe mais.");
    return updated;
  }
  const response = await invoke<unknown>("set_primary_preparation", { request });
  return parsePreparationSummary(response);
}

export async function createSubject(request: CreateSubjectRequest): Promise<void> {
  if (!isTauri()) {
    mockStudyPlan.subjects.push({
      id: `subj-${Date.now()}`,
      preparationId: request.preparationId,
      parentId: request.parentId,
      name: request.name,
      position: mockStudyPlan.subjects.length + 1,
      priority: 3,
      studyStatus: "not_started",
      examWeight: null,
    });
    return;
  }
  await invoke("create_subject", { request });
}

export async function updateSubject(request: UpdateSubjectRequest): Promise<SubjectSummary> {
  if (!isTauri()) {
    const subject = mockStudyPlan.subjects.find((item) => item.id === request.subjectId);
    if (!subject) throw new Error("O assunto escolhido não existe mais.");
    if (!request.name.trim()) throw new Error("O nome do assunto é obrigatório.");
    const parent = request.parentId
      ? mockStudyPlan.subjects.find((item) => item.id === request.parentId && item.preparationId === subject.preparationId)
      : null;
    if (request.parentId && !parent) throw new Error("O assunto pai não pertence à preparação.");
    let ancestor = parent;
    const visited = new Set<string>();
    while (ancestor && !visited.has(ancestor.id)) {
      if (ancestor.id === subject.id) throw new Error("Um assunto não pode ser movido para dentro da própria subárvore.");
      visited.add(ancestor.id);
      ancestor = mockStudyPlan.subjects.find((item) => item.id === ancestor?.parentId);
    }
    const newPosition = subject.parentId === request.parentId
      ? subject.position
      : Math.max(-1, ...mockStudyPlan.subjects
          .filter((item) => item.preparationId === subject.preparationId && item.parentId === request.parentId)
          .map((item) => item.position)) + 1;
    const updated = { ...subject, name: request.name.trim(), parentId: request.parentId, position: newPosition };
    mockStudyPlan.subjects = mockStudyPlan.subjects.map((item) => item.id === subject.id ? updated : item);
    return updated;
  }
  const response = await invoke<unknown>("update_subject", { request });
  return parseSubject(response);
}

export async function moveSubject(request: MoveSubjectRequest): Promise<SubjectSummary> {
  if (!isTauri()) {
    const subject = mockStudyPlan.subjects.find((item) => item.id === request.subjectId);
    if (!subject) throw new Error("O assunto escolhido não existe mais.");
    const siblings = mockStudyPlan.subjects
      .filter((item) => item.preparationId === subject.preparationId && item.parentId === subject.parentId)
      .sort((left, right) => left.position - right.position || left.name.localeCompare(right.name));
    const index = siblings.findIndex((item) => item.id === subject.id);
    const target = index + (request.direction === "up" ? -1 : 1);
    if (target >= 0 && target < siblings.length) {
      [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
      mockStudyPlan.subjects = mockStudyPlan.subjects.map((item) => {
        const position = siblings.findIndex((sibling) => sibling.id === item.id);
        return position < 0 ? item : { ...item, position };
      });
    }
    return mockStudyPlan.subjects.find((item) => item.id === subject.id) ?? subject;
  }
  const response = await invoke<unknown>("move_subject", { request });
  return parseSubject(response);
}

export async function archiveSubject(request: ArchiveSubjectRequest): Promise<void> {
  if (!isTauri()) {
    const subject = mockStudyPlan.subjects.find((item) => item.id === request.subjectId);
    if (!subject) throw new Error("O assunto escolhido não existe mais.");
    const archived = new Set([subject.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of mockStudyPlan.subjects) {
        if (item.parentId && archived.has(item.parentId) && !archived.has(item.id)) {
          archived.add(item.id);
          changed = true;
        }
      }
    }
    if (mockActiveSession && archived.has(mockActiveSession.subjectId ?? "") &&
      ["active", "paused", "interrupted"].includes(mockActiveSession.status)) {
      throw new Error("Encerre a sessão aberta nesta subárvore antes de arquivar.");
    }
    mockStudyPlan.subjects = mockStudyPlan.subjects.filter((item) => !archived.has(item.id));
    const currentPosition = mockStudyPlanning.cyclePosition;
    const remaining = mockStudyPlanning.cycleSlots.filter((slot) => !archived.has(slot.subjectId));
    const nextPosition = remaining.findIndex((slot) => slot.position >= currentPosition);
    mockStudyPlanning = {
      ...mockStudyPlanning,
      cycleSlots: remaining.map((slot, position) => ({ ...slot, position })),
      cyclePosition: Math.max(0, nextPosition),
    };
    return;
  }
  await invoke("archive_subject", { request });
}

export async function savePreparationExamConfig(
  request: SavePreparationExamConfigRequest,
): Promise<PreparationSummary> {
  if (!isTauri()) {
    if (request.referenceDocumentStatus === "current" && !request.referenceMaterialId) {
      throw new Error("Selecione um edital antes de marcá-lo como vigente.");
    }
    const preparation = mockStudyPlan.preparations.find(
      (item) => item.id === request.preparationId,
    );
    if (!preparation) throw new Error("A preparação escolhida não existe mais.");
    mockStudyPlan.preparations = mockStudyPlan.preparations.map((item) =>
      item.id === request.preparationId
        ? {
            ...item,
            referenceMaterialId: request.referenceMaterialId,
            referenceDocumentStatus: request.referenceDocumentStatus,
            examRulesMarkdown: request.examRulesMarkdown?.trim() || null,
          }
        : item,
    );
    for (const subjectWeight of request.subjectExamWeights) {
      mockStudyPlan.subjects = mockStudyPlan.subjects.map((subject) =>
        subject.id === subjectWeight.subjectId
          ? { ...subject, examWeight: subjectWeight.examWeight }
          : subject,
      );
    }
    const updatedPreparation = mockStudyPlan.preparations.find(
      (item) => item.id === request.preparationId,
    );
    if (!updatedPreparation) throw new Error("A preparação escolhida não existe mais.");
    return updatedPreparation;
  }
  const response = await invoke<unknown>("save_preparation_exam_config", { request });
  return parsePreparationSummary(response);
}

export async function setSubjectStudyStatus(
  request: SetSubjectStudyStatusRequest,
): Promise<SubjectSummary> {
  if (!isTauri()) {
    const subject = mockStudyPlan.subjects.find((item) => item.id === request.subjectId);
    if (!subject) throw new Error("O assunto escolhido não existe mais.");
    const updated = { ...subject, studyStatus: request.status };
    mockStudyPlan.subjects = mockStudyPlan.subjects.map((item) =>
      item.id === updated.id ? updated : item,
    );
    return updated;
  }
  const response = await invoke<unknown>("set_subject_study_status", { request });
  return parseSubject(response);
}

export async function getManualContests(): Promise<ManualContestSummary[]> {
  if (!isTauri()) return mockManualContests;
  const response = await invoke<unknown>("get_manual_contests");
  return parseManualContests(response);
}

export async function saveManualContest(
  request: SaveManualContestRequest,
): Promise<ManualContestSummary> {
  if (!isTauri()) {
    const now = new Date().toISOString();
    const existing = request.id
      ? mockManualContests.find((contest) => contest.id === request.id)
      : undefined;
    if (request.id && !existing) {
      throw new Error("O concurso escolhido não existe mais.");
    }
    const saved: ManualContestSummary = {
      ...request,
      id: request.id ?? `contest-${Date.now()}`,
      isFavorite: existing?.isFavorite ?? false,
      noticeMaterialId: existing?.noticeMaterialId ?? null,
      noticeMaterialName: existing?.noticeMaterialName ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    mockManualContests = existing
      ? mockManualContests.map((contest) => (contest.id === saved.id ? saved : contest))
      : [saved, ...mockManualContests];
    return saved;
  }
  const response = await invoke<unknown>("save_manual_contest", { request });
  return parseManualContest(response);
}

export async function setManualContestFavorite(
  request: SetManualContestFavoriteRequest,
): Promise<ManualContestSummary> {
  if (!isTauri()) {
    const updated = mockManualContests.find((contest) => contest.id === request.contestId);
    if (!updated) throw new Error("O concurso escolhido não existe mais.");
    const saved = { ...updated, isFavorite: request.isFavorite, updatedAt: new Date().toISOString() };
    mockManualContests = mockManualContests.map((contest) =>
      contest.id === saved.id ? saved : contest,
    );
    return saved;
  }
  const response = await invoke<unknown>("set_manual_contest_favorite", { request });
  return parseManualContest(response);
}

export async function setManualContestNotice(
  request: SetManualContestNoticeRequest,
): Promise<ManualContestSummary> {
  if (!isTauri()) {
    const contest = mockManualContests.find((item) => item.id === request.contestId);
    if (!contest) throw new Error("O concurso escolhido não existe mais.");
    const material = request.materialId
      ? mockMaterials.find((item) => item.id === request.materialId)
      : null;
    if (request.materialId && (!material || material.sourceUrl || material.mimeType !== "application/pdf")) {
      throw new Error("Escolha um PDF importado localmente para usar como edital offline.");
    }
    const saved = {
      ...contest,
      noticeMaterialId: material?.id ?? null,
      noticeMaterialName: material?.originalName ?? null,
      updatedAt: new Date().toISOString(),
    };
    mockManualContests = mockManualContests.map((item) => item.id === saved.id ? saved : item);
    return saved;
  }
  const response = await invoke<unknown>("set_manual_contest_notice", { request });
  return parseManualContest(response);
}

export async function getDailyPlan(date: string): Promise<DailyPlan> {
  if (!isTauri()) {
    const cycleSlot = mockStudyPlanning.cycleSlots[mockStudyPlanning.cyclePosition] ?? null;
    return {
      date,
      tasks: mockTasks,
      activeSession: mockActiveSession,
      activeTask: mockActiveSession
        ? mockTasks.find((task) => task.id === mockActiveSession?.taskId) ?? null
        : null,
      reviews: mockStudyReviews.filter(
        (review) => review.status === "pending" && review.dueDate <= date,
      ),
      cycleSuggestion: cycleSlot
        ? {
            preparationId: mockStudyPlanning.preparationId,
            cyclePosition: cycleSlot.position,
            cycleStep: mockStudyPlanning.cycleStep,
            subjectId: cycleSlot.subjectId,
            subjectName: cycleSlot.subjectName,
            plannedMinutes: cycleSlot.plannedMinutes,
          }
        : null,
    };
  }
  const response = await invoke<unknown>("get_daily_plan", { request: { date } });
  return parseDailyPlan(response);
}

export async function acceptStudyCycleAction(
  request: AcceptStudyCycleActionRequest,
): Promise<AcceptStudyCycleActionResult> {
  if (!isTauri()) {
    if (
      request.preparationId !== mockStudyPlanning.preparationId ||
      request.cyclePosition !== mockStudyPlanning.cyclePosition ||
      request.cycleStep !== mockStudyPlanning.cycleStep
    ) {
      throw new Error("A próxima ação mudou; atualize o plano de hoje e tente novamente.");
    }
    const cycleSlot = mockStudyPlanning.cycleSlots[mockStudyPlanning.cyclePosition];
    const subject = mockStudyPlan.subjects.find((item) => item.id === cycleSlot?.subjectId);
    if (!cycleSlot || !subject) {
      throw new Error("O ciclo não possui uma próxima ação disponível.");
    }
    const task: StudyTaskSummary = {
      id: `task-cycle-${Date.now()}`,
      preparationId: request.preparationId,
      subjectId: subject.id,
      subjectName: subject.name,
      materialId: null,
      materialName: null,
      title: `Estudo focado de ${subject.name}`,
      objective: "Bloco aceito a partir do ciclo de estudos.",
      plannedMinutes: cycleSlot.plannedMinutes,
      scheduledFor: request.scheduledFor,
      status: "pending",
    };
    mockTasks = [...mockTasks, task];
    const nextCyclePosition =
      (mockStudyPlanning.cyclePosition + 1) % mockStudyPlanning.cycleSlots.length;
    const nextCycleStep = mockStudyPlanning.cycleStep + 1;
    mockStudyPlanning = { ...mockStudyPlanning, cyclePosition: nextCyclePosition, cycleStep: nextCycleStep };
    return { task, nextCyclePosition, nextCycleStep };
  }
  const response = await invoke<unknown>("accept_study_cycle_action", { request });
  return parseAcceptStudyCycleActionResult(response);
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
    return mockMaterials.map((material) => ({
      ...material,
      subjects: [...material.subjects],
      tags: [...material.tags],
    }));
  }
  const response = await invoke<unknown>("get_materials");
  return parseMaterials(response);
}

export async function importMaterial(request: ImportMaterialRequest): Promise<MaterialSummary> {
  if (!isTauri()) {
    const originalName = request.sourcePath.split(/[\\/]/).pop() || "Material.pdf";
    const importedMaterial: MaterialSummary = {
      id: `mat-${Date.now()}`,
      originalName,
      contentHash: `hash-${Date.now()}`,
      mimeType: mimeTypeForMaterialName(originalName),
      sourceUrl: null,
      byteSize: 1024000,
      importedAt: new Date().toISOString(),
      currentPage: 1,
      subjects: request.subjectId ? [{ id: request.subjectId, name: "Disciplina Selecionada" }] : [],
      tags: [],
    };
    mockMaterials = [importedMaterial, ...mockMaterials];
    return importedMaterial;
  }
  const response = await invoke<unknown>("import_material", { request });
  return parseMaterial(response);
}

export async function registerMaterialLink(
  request: RegisterMaterialLinkRequest,
): Promise<MaterialSummary> {
  if (!isTauri()) {
    const url = request.url.trim();
    if (!/^https?:\/\//i.test(url)) {
      throw new Error("Informe um link HTTP ou HTTPS válido.");
    }
    const existing = mockMaterials.find((material) => material.sourceUrl === url);
    if (existing) {
      if (request.subjectId && !existing.subjects.some((subject) => subject.id === request.subjectId)) {
        const updatedExisting = {
          ...existing,
          subjects: [
            ...existing.subjects,
            { id: request.subjectId, name: "Disciplina Selecionada" },
          ],
        };
        mockMaterials = mockMaterials.map((material) =>
          material.id === existing.id ? updatedExisting : material,
        );
        return updatedExisting;
      }
      return existing;
    }

    let fallbackName = url;
    try {
      fallbackName = new URL(url).hostname || url;
    } catch {
      // O núcleo nativo faz a validação definitiva no aplicativo desktop.
    }
    const linkedMaterial: MaterialSummary = {
      id: `mat-link-${Date.now()}`,
      originalName: request.title?.trim() || fallbackName,
      contentHash: `link-${Date.now()}`,
      mimeType: "text/html",
      sourceUrl: url,
      byteSize: 0,
      importedAt: new Date().toISOString(),
      currentPage: 1,
      subjects: request.subjectId ? [{ id: request.subjectId, name: "Disciplina Selecionada" }] : [],
      tags: [],
    };
    mockMaterials = [linkedMaterial, ...mockMaterials];
    return linkedMaterial;
  }
  const response = await invoke<unknown>("register_material_link", { request });
  return parseMaterial(response);
}

function mimeTypeForMaterialName(fileName: string): string | null {
  const extension = fileName.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "pdf":
      return "application/pdf";
    case "md":
      return "text/markdown";
    case "txt":
      return "text/plain";
    case "csv":
      return "text/csv";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xls":
      return "application/vnd.ms-excel";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    default:
      return null;
  }
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
    const material = mockMaterials.find((item) => item.id === request.materialId);
    if (!material) {
      throw new Error("O material escolhido não existe mais.");
    }
    const updatedMaterial = { ...material, currentPage: request.page };
    mockMaterials = mockMaterials.map((item) =>
      item.id === request.materialId ? updatedMaterial : item,
    );
    return updatedMaterial;
  }
  const response = await invoke<unknown>("update_material_page", { request });
  return parseMaterial(response);
}

export async function setMaterialTags(request: SetMaterialTagsRequest): Promise<MaterialSummary> {
  if (!isTauri()) {
    const material = mockMaterials.find((item) => item.id === request.materialId);
    if (!material) {
      throw new Error("O material escolhido não existe mais.");
    }
    const updatedMaterial = { ...material, tags: [...request.tags] };
    mockMaterials = mockMaterials.map((item) =>
      item.id === request.materialId ? updatedMaterial : item,
    );
    return updatedMaterial;
  }
  const response = await invoke<unknown>("set_material_tags", { request });
  return parseMaterial(response);
}

export async function setMaterialSubjects(
  request: SetMaterialSubjectsRequest,
): Promise<MaterialSummary> {
  if (!isTauri()) {
    const material = mockMaterials.find((item) => item.id === request.materialId);
    if (!material) {
      throw new Error("O material escolhido não existe mais.");
    }
    const subjects = request.subjectIds.map((subjectId) => {
      const subject = mockStudyPlan.subjects.find((item) => item.id === subjectId);
      return { id: subjectId, name: subject?.name ?? "Disciplina selecionada" };
    });
    const updatedMaterial = { ...material, subjects };
    mockMaterials = mockMaterials.map((item) =>
      item.id === request.materialId ? updatedMaterial : item,
    );
    return updatedMaterial;
  }
  const response = await invoke<unknown>("set_material_subjects", { request });
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

export async function getNotebooks(): Promise<NotebookSummary[]> {
  if (!isTauri()) {
    return mockNotebooks.map((notebook) => ({
      ...notebook,
      questionCount: mockNotebookEntries[notebook.id]?.length ?? 0,
    }));
  }
  const response = await invoke<unknown>("get_notebooks");
  return parseNotebooks(response);
}

export async function createNotebook(request: CreateNotebookRequest): Promise<NotebookSummary> {
  if (!isTauri()) {
    const now = new Date().toISOString();
    const notebook: NotebookSummary = {
      id: `notebook-${Date.now()}`,
      name: request.name.trim(),
      kind: "manual",
      questionCount: 0,
      filter: request.filter,
      createdAt: now,
      updatedAt: now,
    };
    mockNotebooks = [...mockNotebooks, notebook];
    mockNotebookEntries[notebook.id] = [];
    return notebook;
  }
  const response = await invoke<unknown>("create_notebook", { request });
  return parseNotebook(response);
}

export async function getNotebookEntries(notebookId: string): Promise<QuestionNotebookEntry[]> {
  if (!isTauri()) return mockNotebookEntries[notebookId] ?? [];
  const response = await invoke<unknown>("get_notebook_entries", {
    request: { notebookId },
  });
  return parseQuestionNotebookEntries(response);
}

export async function setNotebookEntry(
  request: SetQuestionNotebookRequest,
): Promise<boolean> {
  if (!isTauri()) {
    const now = new Date().toISOString();
    const entries = mockNotebookEntries[request.notebookId] ?? [];
    if (request.included) {
      const current = entries.find((entry) => entry.questionId === request.questionId);
      const nextEntry: QuestionNotebookEntry = {
        questionId: request.questionId,
        notebookId: request.notebookId,
        reason: request.reason,
        observation: request.observation,
        addedAt: current?.addedAt ?? now,
        updatedAt: now,
      };
      mockNotebookEntries[request.notebookId] = current
        ? entries.map((entry) => (entry.questionId === request.questionId ? nextEntry : entry))
        : [...entries, nextEntry];
    } else {
      mockNotebookEntries[request.notebookId] = entries.filter(
        (entry) => entry.questionId !== request.questionId,
      );
    }
    return request.included;
  }
  const response = await invoke<unknown>("set_notebook_entry", { request });
  if (typeof response !== "boolean") {
    throw new Error("O núcleo local devolveu um resultado de caderno inválido.");
  }
  return response;
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
      firstAttemptCurrentResult: null,
      lastAttemptCurrentResult: null,
      revisionCount: 0,
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
      statementMarkdown: "Questão respondida no modo de pré-visualização.",
      options: [
        { key: "A", text: "Alternativa de pré-visualização A" },
        { key: "B", text: "Alternativa de pré-visualização B" },
      ],
      answerKey: "A",
      explanationMarkdown: "Gabarito disponível apenas no modo de pré-visualização.",
      sourceName: null,
      board: null,
      organization: null,
      role: null,
      examYear: null,
      subjectId: null,
      subjectName: null,
      status: "active",
      attemptsCount: 1,
      firstAttemptResult:
        request.selectedKey === null ? "blank" : request.selectedKey === "A" ? "correct" : "incorrect",
      lastAttemptResult:
        request.selectedKey === null ? "blank" : request.selectedKey === "A" ? "correct" : "incorrect",
      firstAttemptCurrentResult:
        request.selectedKey === null ? "blank" : request.selectedKey === "A" ? "correct" : "incorrect",
      lastAttemptCurrentResult:
        request.selectedKey === null ? "blank" : request.selectedKey === "A" ? "correct" : "incorrect",
      revisionCount: 0,
    };

    const result =
      request.selectedKey === null
        ? "blank"
        : request.selectedKey === mockQuestion.answerKey
        ? "correct"
        : "incorrect";

    mockIndividualAttempts = [...mockIndividualAttempts, {
      questionId: request.questionId,
      result,
      answeredAt: new Date().toISOString(),
    }];

    return {
      attempt: {
        id: `att-${Date.now()}`,
        questionId: request.questionId,
        selectedKey: request.selectedKey,
        confidence: request.confidence,
        elapsedSeconds: request.elapsedSeconds,
        answerKeyAtAttempt: mockQuestion.answerKey,
        result,
        answeredAt: new Date().toISOString(),
      },
      question: mockQuestion,
      xpGranted: result === "correct" ? 2 : 0,
    };
  }
  const response = await invoke<unknown>("answer_question", { request });
  return parseAnswerQuestionResult(response);
}

export async function reviseQuestion(
  request: ReviseQuestionRequest,
): Promise<ReviseQuestionResult> {
  if (!isTauri()) {
    if (!request.reason.trim()) {
      throw new Error("Informe o motivo da revisão.");
    }
    return {
      question: {
        id: request.questionId,
        questionType: "multiple_choice",
        statementMarkdown: "Questão revisada no modo de pré-visualização.",
        options: [
          { key: "A", text: "Alternativa de pré-visualização A" },
          { key: "B", text: "Alternativa de pré-visualização B" },
        ],
        answerKey: request.answerKey,
        explanationMarkdown: null,
        sourceName: null,
        board: null,
        organization: null,
        role: null,
        examYear: null,
        subjectId: null,
        subjectName: null,
        status: request.status,
        attemptsCount: 0,
        firstAttemptResult: null,
        lastAttemptResult: null,
        firstAttemptCurrentResult: null,
        lastAttemptCurrentResult: null,
        revisionCount: 1,
      },
      revision: {
        id: `revision-${Date.now()}`,
        questionId: request.questionId,
        previousAnswerKey: "A",
        currentAnswerKey: request.answerKey,
        previousStatus: "active",
        currentStatus: request.status,
        reason: request.reason.trim(),
        changedAt: new Date().toISOString(),
      },
    };
  }
  const response = await invoke<unknown>("revise_question", { request });
  return parseReviseQuestionResult(response);
}

export async function createExternalQuestionBatch(
  request: CreateExternalQuestionBatchRequest,
): Promise<ExternalQuestionBatchSummary> {
  if (!isTauri()) {
    if (!Number.isInteger(request.answeredCount) || request.answeredCount < 1 ||
      !Number.isInteger(request.correctCount) || request.correctCount < 0 || request.correctCount > request.answeredCount) {
      throw new Error("Informe respondidas acima de zero e acertos entre zero e o total respondido.");
    }
    const preparation = mockStudyPlan.preparations.find((item) => item.id === request.preparationId);
    if (!preparation) throw new Error("A preparação escolhida não existe mais.");
    const subject = request.subjectId
      ? mockStudyPlan.subjects.find((item) => item.id === request.subjectId && item.preparationId === request.preparationId)
      : null;
    if (request.subjectId && !subject) throw new Error("O assunto escolhido não pertence à preparação.");
    const saved: ExternalQuestionBatchSummary = {
      ...request,
      id: `external-batch-${Date.now()}-${mockExternalQuestionBatches.length}`,
      preparationName: preparation.name,
      subjectName: subject?.name ?? null,
      createdAt: new Date().toISOString(),
    };
    mockExternalQuestionBatches = [saved, ...mockExternalQuestionBatches];
    return saved;
  }
  const response = await invoke<unknown>("create_external_question_batch", { request });
  return parseExternalQuestionBatch(response);
}

export async function getExternalQuestionBatches(): Promise<ExternalQuestionBatchSummary[]> {
  if (!isTauri()) return mockExternalQuestionBatches.slice(0, 20);
  const response = await invoke<unknown>("get_external_question_batches");
  if (!Array.isArray(response)) throw new Error("O núcleo local devolveu lotes externos inválidos.");
  return response.map(parseExternalQuestionBatch);
}

export async function getQuestionPerformance(asOfDate: string): Promise<QuestionPerformanceSummary> {
  if (!isTauri()) {
    const seen = new Set<string>();
    let firstAttemptGraded = 0;
    let firstAttemptCorrect = 0;
    let repeatGraded = 0;
    let repeatCorrect = 0;
    for (const attempt of mockIndividualAttempts.filter((item) => item.answeredAt.slice(0, 10) <= asOfDate)) {
      const first = !seen.has(attempt.questionId);
      seen.add(attempt.questionId);
      if (attempt.result === "correct" || attempt.result === "incorrect") {
        if (first) {
          firstAttemptGraded++;
          if (attempt.result === "correct") firstAttemptCorrect++;
        } else {
          repeatGraded++;
          if (attempt.result === "correct") repeatCorrect++;
        }
      }
    }
    const batches = mockExternalQuestionBatches.filter((batch) => batch.studiedOn <= asOfDate);
    return {
      asOfDate,
      firstAttemptGraded,
      firstAttemptCorrect,
      repeatGraded,
      repeatCorrect,
      externalBatches: batches.length,
      externalAnswered: batches.reduce((total, batch) => total + batch.answeredCount, 0),
      externalCorrect: batches.reduce((total, batch) => total + batch.correctCount, 0),
    };
  }
  const response = await invoke<unknown>("get_question_performance", { request: { asOfDate } });
  return parseQuestionPerformance(response);
}

export async function createStudyTask(request: CreateStudyTaskRequest): Promise<void> {
  if (!isTauri()) {
    const material = request.materialId
      ? mockMaterials.find((item) => item.id === request.materialId)
      : null;
    if (request.materialId && !material) throw new Error("O material escolhido não existe mais.");
    mockTasks.push({
      id: `task-${Date.now()}`,
      preparationId: request.preparationId,
      subjectId: request.subjectId,
      subjectName: mockStudyPlan.subjects.find((item) => item.id === request.subjectId)?.name ?? null,
      materialId: material?.id ?? null,
      materialName: material?.originalName ?? null,
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
      summaryMarkdown: null,
      origin: "timer",
      difficulty: null,
      nextSteps: null,
    };
    return mockActiveSession;
  }
  const response = await invoke<unknown>("start_study_session", { request });
  return parseStudySession(response);
}

export async function createManualStudy(
  request: CreateManualStudyRequest,
): Promise<CreateManualStudyResult> {
  if (!isTauri()) {
    const studiedAt = `${request.studiedOn}T12:00:00Z`;
    const session: StudySessionSummary = {
      id: `manual-session-${Date.now()}`,
      taskId: `manual-task-${Date.now()}`,
      subjectId: request.subjectId,
      startedAt: studiedAt,
      activeStartedAt: null,
      effectiveSeconds: request.effectiveSeconds,
      status: "completed",
      origin: "manual",
      summaryMarkdown: request.summaryMarkdown,
      difficulty: request.difficulty,
      nextSteps: request.nextSteps,
    };
    const xpGranted = Math.floor(request.effectiveSeconds / 60);
    const history: StudyHistoryEntry = {
      sessionId: session.id,
      taskId: session.taskId,
      taskTitle: request.title,
      subjectName:
        mockStudyPlan.subjects.find((subject) => subject.id === request.subjectId)?.name ?? null,
      endedAt: studiedAt,
      effectiveSeconds: request.effectiveSeconds,
      taskStatus: "completed",
      origin: "manual",
      xpGranted,
      durationCorrectionCount: 0,
      lastDurationCorrectionAt: null,
      summaryMarkdown: request.summaryMarkdown,
      difficulty: request.difficulty,
      nextSteps: request.nextSteps,
    };
    mockRecentSessions = [history, ...mockRecentSessions];
    mockXp += xpGranted;
    return { session, xpGranted };
  }
  const response = await invoke<unknown>("create_manual_study", { request });
  return parseCreateManualStudyResult(response);
}

export async function correctStudySessionDuration(
  request: CorrectStudySessionDurationRequest,
): Promise<CorrectStudySessionDurationResult> {
  if (!isTauri()) {
    const history = mockRecentSessions.find((item) => item.sessionId === request.sessionId);
    if (!history) throw new Error("A sessão escolhida não existe mais.");
    const previousXp = history.xpGranted;
    const correctedXp = Math.floor(request.effectiveSeconds / 60);
    const correctedAt = new Date().toISOString();
    mockRecentSessions = mockRecentSessions.map((item) =>
      item.sessionId === request.sessionId
        ? {
            ...item,
            effectiveSeconds: request.effectiveSeconds,
            xpGranted: correctedXp,
            durationCorrectionCount: item.durationCorrectionCount + 1,
            lastDurationCorrectionAt: correctedAt,
          }
        : item,
    );
    mockXp += correctedXp - previousXp;
    return {
      session: {
        id: request.sessionId,
        taskId: history.taskId,
        subjectId: null,
        startedAt: history.endedAt,
        activeStartedAt: null,
        effectiveSeconds: request.effectiveSeconds,
        status: "completed",
        origin: history.origin,
        summaryMarkdown: history.summaryMarkdown,
        difficulty: history.difficulty,
        nextSteps: history.nextSteps,
      },
      previousEffectiveSeconds: history.effectiveSeconds,
      previousXp,
      correctedXp,
      xpDelta: correctedXp - previousXp,
    };
  }
  const response = await invoke<unknown>("correct_study_session_duration", { request });
  return parseCorrectStudySessionDurationResult(response);
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

export async function heartbeatStudySession(
  request: HeartbeatStudySessionRequest,
): Promise<StudySessionSummary> {
  if (!isTauri()) {
    return mockActiveSession!;
  }
  const response = await invoke<unknown>("heartbeat_study_session", { request });
  return parseStudySession(response);
}

export async function saveStudySessionReflection(
  request: SaveStudySessionReflectionRequest,
): Promise<StudySessionSummary> {
  if (!isTauri()) {
    if (!mockActiveSession || mockActiveSession.id !== request.sessionId) {
      throw new Error("A sessão não está mais aberta.");
    }
    mockActiveSession = {
      ...mockActiveSession,
      summaryMarkdown: request.summaryMarkdown,
      difficulty: request.difficulty,
      nextSteps: request.nextSteps,
    };
    return mockActiveSession;
  }
  const response = await invoke<unknown>("save_study_session_reflection", { request });
  return parseStudySession(response);
}

export async function finishStudySession(request: FinishStudySessionRequest): Promise<FinishStudySessionResult> {
  if (!isTauri()) {
    const task = mockTasks.find((t) => t.id === mockActiveSession?.taskId);
    if (task) {
      task.status = request.taskStatus;
    }
    const completedSession = mockActiveSession || {
      id: request.sessionId,
      taskId: "task-101",
      subjectId: "subj-1",
      startedAt: new Date().toISOString(),
      activeStartedAt: null,
      effectiveSeconds: request.effectiveSeconds,
      status: "completed" as const,
      origin: "timer" as const,
      summaryMarkdown: request.summaryMarkdown,
      difficulty: request.difficulty,
      nextSteps: request.nextSteps,
    };

    let review: StudyReviewSummary | null = mockStudyReviews.find(
      (item) => item.sourceSessionId === request.sessionId,
    ) ?? null;
    if (!review && request.reviewOn && completedSession.subjectId) {
      const now = new Date().toISOString();
      review = {
        id: `review-${Date.now()}`,
        subjectId: completedSession.subjectId,
        subjectName:
          mockStudyPlan.subjects.find((subject) => subject.id === completedSession.subjectId)?.name ??
          "Assunto",
        sourceSessionId: request.sessionId,
        dueDate: request.reviewOn,
        status: "pending",
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      };
      mockStudyReviews = [review, ...mockStudyReviews];
    }

    mockActiveSession = null;
    mockXp += 50;

    return {
      session: {
        ...completedSession,
        status: "completed",
        summaryMarkdown: request.summaryMarkdown,
        difficulty: request.difficulty,
        nextSteps: request.nextSteps,
      },
      xpGranted: 50,
      review,
    };
  }
  const response = await invoke<unknown>("finish_study_session", { request });
  return parseFinishStudySessionResult(response);
}

export async function rescheduleStudyReview(
  request: RescheduleStudyReviewRequest,
): Promise<StudyReviewSummary> {
  if (!isTauri()) {
    const review = mockStudyReviews.find((item) => item.id === request.reviewId);
    if (!review) throw new Error("A revisão escolhida não existe mais.");
    if (review.status === "completed") {
      throw new Error("Uma revisão concluída não pode ser reagendada.");
    }
    const updated = { ...review, dueDate: request.dueDate, updatedAt: new Date().toISOString() };
    mockStudyReviews = mockStudyReviews.map((item) => item.id === updated.id ? updated : item);
    return updated;
  }
  const response = await invoke<unknown>("reschedule_study_review", { request });
  return parseStudyReview(response);
}

export async function completeStudyReview(
  request: CompleteStudyReviewRequest,
): Promise<CompleteStudyReviewResult> {
  if (!isTauri()) {
    const review = mockStudyReviews.find((item) => item.id === request.reviewId);
    if (!review) throw new Error("A revisão escolhida não existe mais.");
    if (review.status === "completed") return { review, xpGranted: 0 };
    const now = new Date().toISOString();
    const completed = { ...review, status: "completed" as const, completedAt: now, updatedAt: now };
    const completedToday = mockStudyReviews.filter(
      (item) => item.status === "completed" && item.completedAt?.slice(0, 10) === now.slice(0, 10),
    ).length;
    const xpGranted = Math.max(
      0,
      Math.min(
        MOCK_REVIEW_XP_PER_OCCURRENCE,
        MOCK_REVIEW_XP_DAILY_CAP - completedToday * MOCK_REVIEW_XP_PER_OCCURRENCE,
      ),
    );
    mockStudyReviews = mockStudyReviews.map((item) => item.id === completed.id ? completed : item);
    mockXp += xpGranted;
    return { review: completed, xpGranted };
  }
  const response = await invoke<unknown>("complete_study_review", { request });
  return parseCompleteStudyReviewResult(response);
}

export async function getStudyProgress(request: GetStudyProgressRequest): Promise<StudyProgressSummary> {
  if (!isTauri()) {
    const seededSessions: StudyHistoryEntry[] = [
      {
        sessionId: "sess-1",
        taskId: "task-101",
        taskTitle: "Controle de Constitucionalidade",
        subjectName: "Direito Constitucional",
        endedAt: "2026-02-20T14:00:00Z",
        effectiveSeconds: 2700,
        taskStatus: "completed",
        origin: "timer",
        xpGranted: 50,
        durationCorrectionCount: 0,
        lastDurationCorrectionAt: null,
        summaryMarkdown: null,
        difficulty: null,
        nextSteps: null,
      },
      {
        sessionId: "sess-2",
        taskId: "task-102",
        taskTitle: "Arquitetura Hexagonal & DDD",
        subjectName: "Engenharia de Software",
        endedAt: "2026-02-21T10:00:00Z",
        effectiveSeconds: 3600,
        taskStatus: "completed",
        origin: "timer",
        xpGranted: 50,
        durationCorrectionCount: 0,
        lastDurationCorrectionAt: null,
        summaryMarkdown: null,
        difficulty: null,
        nextSteps: null,
      },
    ];
    const recentSessions = [...mockRecentSessions, ...seededSessions];
    return {
      totalXp: mockXp,
      completedSessions: 32 + mockRecentSessions.length,
      effectiveSeconds:
        67200 + mockRecentSessions.reduce((total, session) => total + session.effectiveSeconds, 0),
      streak: {
        currentPlannedDays: 4,
        longestPlannedDays: 9,
        lastStudyDay: request.asOfDate,
      },
      recentSessions,
    };
  }
  const response = await invoke<unknown>("get_study_progress", { request });
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
