export type WorkspaceSummary = {
  workspaceId: string;
  name: string;
  formatVersion: number;
  path: string;
  storageStatus: "local";
};

export type WorkspaceRequest = {
  workspacePath: string;
  name: string;
};

export type BackupSummary = {
  path: string;
  workspaceName: string;
  createdAtEpochSeconds: number;
};

export type RevisionSummary = {
  revisionId: string;
  path: string;
  createdAtEpochSeconds: number;
  blobCount: number;
};

export type RestoreWorkspaceRevisionRequest = {
  workspacePath: string;
  revisionId: string;
};

export type PublishWorkspaceRevisionRequest = {
  destinationParentPath: string;
};

export type SyncDestinationSettings = {
  enabled: boolean;
  destinationPath: string | null;
};

export type ConfigureSyncDestinationRequest = {
  enabled: boolean;
  destinationParentPath: string | null;
};

export type CreateBackupRequest = {
  destinationParentPath: string;
};

export type RestoreBackupRequest = {
  backupPath: string;
  destinationParentPath: string;
};

export type PreparationSummary = {
  id: string;
  name: string;
  organization: string | null;
  role: string | null;
  examDate: string | null;
  isPrimary: boolean;
};

export type SubjectSummary = {
  id: string;
  preparationId: string;
  parentId: string | null;
  name: string;
  position: number;
  priority: number;
  studyStatus: SubjectStudyStatus;
};

export type SubjectStudyStatus = "not_started" | "in_progress" | "theory_completed";

export type SubjectCoverageSummary = {
  preparationId: string;
  totalSubjects: number;
  startedSubjects: number;
  completedSubjects: number;
};

export type StudyPlan = {
  preparations: PreparationSummary[];
  subjects: SubjectSummary[];
  subjectCoverage: SubjectCoverageSummary[];
};

export type StudyDayAvailability = {
  weekday: number;
  availableMinutes: number;
  isRest: boolean;
};

export type StudyCycleSlotSummary = {
  position: number;
  subjectId: string;
  subjectName: string;
  priority: number;
  plannedMinutes: number;
};

export type StudyPlanningSummary = {
  preparationId: string;
  availability: StudyDayAvailability[];
  subjectPriorities: Array<{
    subjectId: string;
    priority: number;
  }>;
  weeklyAvailableMinutes: number;
  weeklyStudyMinutes: number;
  reviewReservePercent: number;
  cyclePosition: number;
  cycleStep: number;
  cycleSlots: StudyCycleSlotSummary[];
  warning: string | null;
  updatedAt: string | null;
};

export type StudyPlanningPreparationRequest = {
  preparationId: string;
};

export type SaveStudyPlanningRequest = StudyPlanningPreparationRequest & {
  availability: StudyDayAvailability[];
  subjectPriorities: Array<{
    subjectId: string;
    priority: number;
  }>;
  reviewReservePercent: number;
  cycleSlots?: Array<{
    subjectId: string;
    plannedMinutes: number;
  }>;
};

export type CreatePreparationRequest = {
  name: string;
  organization: string | null;
  role: string | null;
  examDate: string | null;
  makePrimary: boolean;
};

export type CreateSubjectRequest = {
  preparationId: string;
  name: string;
  parentId: string | null;
};

export type SetSubjectStudyStatusRequest = {
  subjectId: string;
  status: SubjectStudyStatus;
};

export type ContestStatus =
  | "expected"
  | "authorized"
  | "notice_published"
  | "registration_open"
  | "registration_closed"
  | "completed";

export type ManualContestSummary = {
  id: string;
  name: string;
  organization: string | null;
  role: string | null;
  board: string | null;
  sourceUrl: string | null;
  status: ContestStatus;
  registrationStartsOn: string | null;
  registrationEndsOn: string | null;
  feeDeadline: string | null;
  examDate: string | null;
  notes: string | null;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SaveManualContestRequest = Omit<ManualContestSummary, "id" | "createdAt" | "updatedAt" | "isFavorite"> & {
  id: string | null;
};

export type SetManualContestFavoriteRequest = {
  contestId: string;
  isFavorite: boolean;
};

export type StudyTaskStatus = "pending" | "partial" | "completed" | "skipped";

export type StudySessionStatus = "active" | "paused" | "completed" | "interrupted";

export type StudyTaskSummary = {
  id: string;
  preparationId: string;
  subjectId: string | null;
  subjectName: string | null;
  title: string;
  objective: string | null;
  plannedMinutes: number;
  scheduledFor: string;
  status: StudyTaskStatus;
};

export type StudySessionSummary = {
  id: string;
  taskId: string;
  subjectId: string | null;
  startedAt: string;
  activeStartedAt: string | null;
  effectiveSeconds: number;
  status: StudySessionStatus;
};

export type StudyReviewStatus = "pending" | "completed";

export type StudyReviewSummary = {
  id: string;
  subjectId: string;
  subjectName: string;
  sourceSessionId: string;
  dueDate: string;
  status: StudyReviewStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type StudyCycleSuggestion = {
  preparationId: string;
  cyclePosition: number;
  cycleStep: number;
  subjectId: string;
  subjectName: string;
  plannedMinutes: number;
};

export type DailyPlan = {
  date: string;
  tasks: StudyTaskSummary[];
  activeSession: StudySessionSummary | null;
  reviews: StudyReviewSummary[];
  cycleSuggestion: StudyCycleSuggestion | null;
};

export type AcceptStudyCycleActionRequest = {
  preparationId: string;
  cyclePosition: number;
  cycleStep: number;
  scheduledFor: string;
};

export type AcceptStudyCycleActionResult = {
  task: StudyTaskSummary;
  nextCyclePosition: number;
  nextCycleStep: number;
};

export type FinishStudySessionResult = {
  session: StudySessionSummary;
  xpGranted: number;
  review: StudyReviewSummary | null;
};

export type CompleteStudyReviewResult = {
  review: StudyReviewSummary;
  xpGranted: number;
};

export type StudyHistoryEntry = {
  sessionId: string;
  taskId: string;
  taskTitle: string;
  subjectName: string | null;
  endedAt: string;
  effectiveSeconds: number;
  taskStatus: StudyTaskStatus;
  xpGranted: number;
};

export type StudyProgressSummary = {
  totalXp: number;
  completedSessions: number;
  effectiveSeconds: number;
  streak: StudyStreakSummary;
  recentSessions: StudyHistoryEntry[];
};

export type StudyStreakSummary = {
  currentPlannedDays: number;
  longestPlannedDays: number;
  lastStudyDay: string | null;
};

export type MaterialSubjectSummary = {
  id: string;
  name: string;
};

export type MaterialSummary = {
  id: string;
  originalName: string;
  contentHash: string;
  mimeType: string | null;
  byteSize: number;
  importedAt: string;
  currentPage: number;
  subjects: MaterialSubjectSummary[];
};

export type NoteSummary = {
  id: string;
  title: string;
  contentMarkdown: string;
  materialId: string | null;
  subjectId: string | null;
  materialName: string | null;
  subjectName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type QuestionType = "multiple_choice" | "true_false";
export type QuestionConfidence = "certain" | "doubt" | "guess";
export type QuestionResult = "correct" | "incorrect" | "blank" | "pending";
export const ERROR_NOTEBOOK_ID = "notebook-errors";

export type NotebookKind = "error" | "manual" | "dynamic";
export type NotebookAttemptStatus = "incorrect" | "unanswered" | "correct";

export type NotebookFilter = {
  subjectId: string | null;
  questionType: QuestionType | null;
  attemptStatus: NotebookAttemptStatus;
};

export type NotebookSummary = {
  id: string;
  name: string;
  kind: NotebookKind;
  questionCount: number;
  filter: NotebookFilter | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateNotebookRequest = {
  name: string;
  kind: Exclude<NotebookKind, "error">;
  filter: NotebookFilter | null;
};

export type QuestionOptionSummary = {
  key: string;
  text: string;
};

export type QuestionSummary = {
  id: string;
  questionType: QuestionType;
  statementMarkdown: string;
  options: QuestionOptionSummary[];
  answerKey: string | null;
  explanationMarkdown: string | null;
  sourceName: string | null;
  board: string | null;
  organization: string | null;
  role: string | null;
  examYear: number | null;
  subjectId: string | null;
  subjectName: string | null;
  status: "active" | "annulled" | "outdated" | "answer_changed";
  attemptsCount: number;
  firstAttemptResult: QuestionResult | null;
  lastAttemptResult: QuestionResult | null;
};

export type QuestionAttemptSummary = {
  id: string;
  questionId: string;
  selectedKey: string | null;
  confidence: QuestionConfidence;
  elapsedSeconds: number;
  answerKeyAtAttempt: string | null;
  result: QuestionResult;
  answeredAt: string;
};

export type AnswerQuestionResult = {
  attempt: QuestionAttemptSummary;
  question: QuestionSummary;
  xpGranted: number;
};

export type QuestionNotebookReason =
  | "content"
  | "interpretation"
  | "distraction"
  | "forgetfulness";

export type QuestionNotebookEntry = {
  questionId: string;
  notebookId: string;
  reason: QuestionNotebookReason | null;
  observation: string | null;
  addedAt: string;
  updatedAt: string;
};

export type SetQuestionNotebookRequest = {
  notebookId: string;
  questionId: string;
  included: boolean;
  reason: QuestionNotebookReason | null;
  observation: string | null;
};

export type QuestionImportIssue = {
  index: number;
  kind: "invalid" | "duplicate";
  externalId: string | null;
  message: string;
};

export type QuestionImportPreview = {
  schemaVersion: number;
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  fileHash: string;
  issues: QuestionImportIssue[];
};

export type QuestionImportResult = {
  imported: number;
  skippedInvalid: number;
  skippedDuplicates: number;
};

export type QuestionExportResult = {
  path: string;
  exported: number;
  schemaVersion: number;
};

export type CreateStudyTaskRequest = {
  preparationId: string;
  subjectId: string | null;
  title: string;
  objective: string | null;
  plannedMinutes: number;
  scheduledFor: string;
};

export type RescheduleStudyTaskRequest = {
  taskId: string;
  scheduledFor: string;
};

export type SkipStudyTaskRequest = {
  taskId: string;
};

export type ImportMaterialRequest = {
  sourcePath: string;
  subjectId: string | null;
};

export type OpenMaterialRequest = {
  materialId: string;
};

export type UpdateMaterialPageRequest = {
  materialId: string;
  page: number;
};

export type GetQuestionsRequest = {
  subjectId: string | null;
  questionType: QuestionType | null;
  status: QuestionSummary["status"] | null;
  limit: number;
  offset: number;
};

export type CreateQuestionOptionRequest = {
  key: string;
  text: string;
};

export type CreateQuestionRequest = {
  questionType: QuestionType;
  statementMarkdown: string;
  options: CreateQuestionOptionRequest[];
  answerKey: string | null;
  explanationMarkdown: string | null;
  sourceName: string | null;
  board: string | null;
  organization: string | null;
  role: string | null;
  examYear: number | null;
  subjectId: string | null;
};

export type AnswerQuestionRequest = {
  questionId: string;
  selectedKey: string | null;
  confidence: QuestionConfidence;
  elapsedSeconds: number;
};

export type SaveNoteRequest = {
  id: string | null;
  title: string;
  contentMarkdown: string;
  materialId: string | null;
  subjectId: string | null;
};

export type StartStudySessionRequest = {
  taskId: string;
};

export type PauseStudySessionRequest = {
  sessionId: string;
  effectiveSeconds: number;
};

export type ResumeStudySessionRequest = {
  sessionId: string;
};

export type FinishStudySessionRequest = {
  sessionId: string;
  effectiveSeconds: number;
  taskStatus: "completed" | "partial";
  reviewOn: string | null;
};

export type GetStudyProgressRequest = {
  asOfDate: string;
};

export type RescheduleStudyReviewRequest = {
  reviewId: string;
  dueDate: string;
};

export type CompleteStudyReviewRequest = {
  reviewId: string;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

export function parseWorkspaceSummary(value: unknown): WorkspaceSummary {
  if (
    !isRecord(value) ||
    typeof value.workspaceId !== "string" ||
    typeof value.name !== "string" ||
    typeof value.formatVersion !== "number" ||
    typeof value.path !== "string" ||
    value.storageStatus !== "local"
  ) {
    throw new Error("O núcleo local devolveu uma resposta de espaço inválida.");
  }

  return {
    workspaceId: value.workspaceId,
    name: value.name,
    formatVersion: value.formatVersion,
    path: value.path,
    storageStatus: "local",
  };
}

export function parseBackupSummary(value: unknown): BackupSummary {
  if (
    !isRecord(value) ||
    typeof value.path !== "string" ||
    typeof value.workspaceName !== "string" ||
    typeof value.createdAtEpochSeconds !== "number" ||
    !Number.isInteger(value.createdAtEpochSeconds) ||
    value.createdAtEpochSeconds < 0
  ) {
    throw new Error("O núcleo local devolveu um resumo de backup inválido.");
  }

  return {
    path: value.path,
    workspaceName: value.workspaceName,
    createdAtEpochSeconds: value.createdAtEpochSeconds,
  };
}

export function parseRevisionSummary(value: unknown): RevisionSummary {
  if (
    !isRecord(value) ||
    typeof value.revisionId !== "string" ||
    typeof value.path !== "string" ||
    typeof value.createdAtEpochSeconds !== "number" ||
    !Number.isInteger(value.createdAtEpochSeconds) ||
    value.createdAtEpochSeconds < 0 ||
    typeof value.blobCount !== "number" ||
    !Number.isInteger(value.blobCount) ||
    value.blobCount < 0
  ) {
    throw new Error("O núcleo local devolveu um resumo de revisão inválido.");
  }

  return {
    revisionId: value.revisionId,
    path: value.path,
    createdAtEpochSeconds: value.createdAtEpochSeconds,
    blobCount: value.blobCount,
  };
}

export function parseSyncDestinationSettings(value: unknown): SyncDestinationSettings {
  if (
    !isRecord(value) ||
    typeof value.enabled !== "boolean" ||
    (value.destinationPath !== null && typeof value.destinationPath !== "string")
  ) {
    throw new Error("O núcleo local devolveu uma configuração de destino inválida.");
  }

  return {
    enabled: value.enabled,
    destinationPath: value.destinationPath,
  };
}

export function parseOptionalWorkspaceSummary(value: unknown): WorkspaceSummary | null {
  return value === null ? null : parseWorkspaceSummary(value);
}

function parseOptionalString(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`O núcleo local devolveu ${fieldName} inválido.`);
  }

  return value;
}

function parsePreparation(value: unknown): PreparationSummary {
  if (!isRecord(value)) {
    throw new Error("O núcleo local devolveu uma preparação inválida.");
  }

  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.isPrimary !== "boolean"
  ) {
    throw new Error("O núcleo local devolveu uma preparação inválida.");
  }

  return {
    id: value.id,
    name: value.name,
    organization: parseOptionalString(value.organization, "o órgão"),
    role: parseOptionalString(value.role, "o cargo"),
    examDate: parseOptionalString(value.examDate, "a data da prova"),
    isPrimary: value.isPrimary,
  };
}

function parseSubjectStudyStatus(value: unknown): SubjectStudyStatus {
  if (value === "not_started" || value === "in_progress" || value === "theory_completed") {
    return value;
  }
  throw new Error("O núcleo local devolveu um estado de estudo inválido.");
}

export function parseSubject(value: unknown): SubjectSummary {
  if (!isRecord(value)) {
    throw new Error("O núcleo local devolveu um assunto inválido.");
  }

  if (
    typeof value.id !== "string" ||
    typeof value.preparationId !== "string" ||
    typeof value.name !== "string" ||
    typeof value.position !== "number" ||
    !Number.isInteger(value.position) ||
    typeof value.priority !== "number" ||
    !Number.isInteger(value.priority) ||
    value.priority < 1 ||
    value.priority > 5
  ) {
    throw new Error("O núcleo local devolveu um assunto inválido.");
  }

  return {
    id: value.id,
    preparationId: value.preparationId,
    parentId: parseOptionalString(value.parentId, "o assunto pai"),
    name: value.name,
    position: value.position,
    priority: value.priority,
    studyStatus: parseSubjectStudyStatus(value.studyStatus),
  };
}

function parseSubjectCoverage(value: unknown): SubjectCoverageSummary {
  if (
    !isRecord(value) ||
    typeof value.preparationId !== "string" ||
    typeof value.totalSubjects !== "number" ||
    !Number.isInteger(value.totalSubjects) ||
    value.totalSubjects < 0 ||
    typeof value.startedSubjects !== "number" ||
    !Number.isInteger(value.startedSubjects) ||
    value.startedSubjects < 0 ||
    value.startedSubjects > value.totalSubjects ||
    typeof value.completedSubjects !== "number" ||
    !Number.isInteger(value.completedSubjects) ||
    value.completedSubjects < 0 ||
    value.completedSubjects > value.startedSubjects
  ) {
    throw new Error("O núcleo local devolveu um resumo de cobertura inválido.");
  }
  return {
    preparationId: value.preparationId,
    totalSubjects: value.totalSubjects,
    startedSubjects: value.startedSubjects,
    completedSubjects: value.completedSubjects,
  };
}

export function parseStudyPlan(value: unknown): StudyPlan {
  if (
    !isRecord(value) ||
    !Array.isArray(value.preparations) ||
    !Array.isArray(value.subjects) ||
    !Array.isArray(value.subjectCoverage)
  ) {
    throw new Error("O núcleo local devolveu um plano inválido.");
  }

  return {
    preparations: value.preparations.map(parsePreparation),
    subjects: value.subjects.map(parseSubject),
    subjectCoverage: value.subjectCoverage.map(parseSubjectCoverage),
  };
}

function parseStudyDayAvailability(value: unknown): StudyDayAvailability {
  if (
    !isRecord(value) ||
    typeof value.weekday !== "number" ||
    !Number.isInteger(value.weekday) ||
    value.weekday < 0 ||
    value.weekday > 6 ||
    typeof value.availableMinutes !== "number" ||
    !Number.isInteger(value.availableMinutes) ||
    value.availableMinutes < 0 ||
    value.availableMinutes > 1440 ||
    typeof value.isRest !== "boolean"
  ) {
    throw new Error("O núcleo local devolveu uma disponibilidade inválida.");
  }

  return {
    weekday: value.weekday,
    availableMinutes: value.availableMinutes,
    isRest: value.isRest,
  };
}

function parseStudyCycleSlot(value: unknown): StudyCycleSlotSummary {
  if (
    !isRecord(value) ||
    typeof value.position !== "number" ||
    !Number.isInteger(value.position) ||
    value.position < 0 ||
    typeof value.subjectId !== "string" ||
    typeof value.subjectName !== "string" ||
    typeof value.priority !== "number" ||
    !Number.isInteger(value.priority) ||
    value.priority < 1 ||
    value.priority > 5 ||
    typeof value.plannedMinutes !== "number" ||
    !Number.isInteger(value.plannedMinutes) ||
    value.plannedMinutes <= 0
  ) {
    throw new Error("O núcleo local devolveu uma posição de ciclo inválida.");
  }

  return {
    position: value.position,
    subjectId: value.subjectId,
    subjectName: value.subjectName,
    priority: value.priority,
    plannedMinutes: value.plannedMinutes,
  };
}

function parseStudySubjectPriority(value: unknown): { subjectId: string; priority: number } {
  if (
    !isRecord(value) ||
    typeof value.subjectId !== "string" ||
    typeof value.priority !== "number" ||
    !Number.isInteger(value.priority) ||
    value.priority < 1 ||
    value.priority > 5
  ) {
    throw new Error("O núcleo local devolveu uma prioridade inválida.");
  }

  return { subjectId: value.subjectId, priority: value.priority };
}

export function parseStudyPlanning(value: unknown): StudyPlanningSummary {
  if (
    !isRecord(value) ||
    typeof value.preparationId !== "string" ||
    !Array.isArray(value.availability) ||
    value.availability.length !== 7 ||
    !Array.isArray(value.subjectPriorities) ||
    typeof value.weeklyAvailableMinutes !== "number" ||
    !Number.isInteger(value.weeklyAvailableMinutes) ||
    value.weeklyAvailableMinutes < 0 ||
    typeof value.weeklyStudyMinutes !== "number" ||
    !Number.isInteger(value.weeklyStudyMinutes) ||
    value.weeklyStudyMinutes < 0 ||
    value.weeklyStudyMinutes > value.weeklyAvailableMinutes ||
    typeof value.reviewReservePercent !== "number" ||
    !Number.isInteger(value.reviewReservePercent) ||
    value.reviewReservePercent < 0 ||
    value.reviewReservePercent > 80 ||
    typeof value.cyclePosition !== "number" ||
    !Number.isInteger(value.cyclePosition) ||
    value.cyclePosition < 0 ||
    typeof value.cycleStep !== "number" ||
    !Number.isInteger(value.cycleStep) ||
    value.cycleStep < 0 ||
    !Array.isArray(value.cycleSlots)
  ) {
    throw new Error("O núcleo local devolveu um planejamento inválido.");
  }

  return {
    preparationId: value.preparationId,
    availability: value.availability.map(parseStudyDayAvailability),
    subjectPriorities: value.subjectPriorities.map(parseStudySubjectPriority),
    weeklyAvailableMinutes: value.weeklyAvailableMinutes,
    weeklyStudyMinutes: value.weeklyStudyMinutes,
    reviewReservePercent: value.reviewReservePercent,
    cyclePosition: value.cyclePosition,
    cycleStep: value.cycleStep,
    cycleSlots: value.cycleSlots.map(parseStudyCycleSlot),
    warning: parseOptionalString(value.warning, "o aviso do planejamento"),
    updatedAt: parseOptionalString(value.updatedAt, "a data de atualização do planejamento"),
  };
}

function parseContestStatus(value: unknown): ContestStatus {
  if (
    value === "expected" ||
    value === "authorized" ||
    value === "notice_published" ||
    value === "registration_open" ||
    value === "registration_closed" ||
    value === "completed"
  ) {
    return value;
  }
  throw new Error("O núcleo local devolveu uma situação de concurso inválida.");
}

export function parseManualContest(value: unknown): ManualContestSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.isFavorite !== "boolean" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    throw new Error("O núcleo local devolveu um concurso inválido.");
  }
  return {
    id: value.id,
    name: value.name,
    organization: parseOptionalString(value.organization, "o órgão do concurso"),
    role: parseOptionalString(value.role, "o cargo do concurso"),
    board: parseOptionalString(value.board, "a banca do concurso"),
    sourceUrl: parseOptionalString(value.sourceUrl, "a fonte do concurso"),
    status: parseContestStatus(value.status),
    registrationStartsOn: parseOptionalString(value.registrationStartsOn, "o início das inscrições"),
    registrationEndsOn: parseOptionalString(value.registrationEndsOn, "o encerramento das inscrições"),
    feeDeadline: parseOptionalString(value.feeDeadline, "o prazo de pagamento"),
    examDate: parseOptionalString(value.examDate, "a data da prova"),
    notes: parseOptionalString(value.notes, "as observações do concurso"),
    isFavorite: value.isFavorite,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function parseManualContests(value: unknown): ManualContestSummary[] {
  if (!Array.isArray(value)) {
    throw new Error("O núcleo local devolveu uma lista de concursos inválida.");
  }
  return value.map(parseManualContest);
}

function parseStudyTaskStatus(value: unknown): StudyTaskStatus {
  if (value === "pending" || value === "partial" || value === "completed" || value === "skipped") {
    return value;
  }

  throw new Error("O núcleo local devolveu um status de tarefa inválido.");
}

function parseStudySessionStatus(value: unknown): StudySessionStatus {
  if (value === "active" || value === "paused" || value === "completed" || value === "interrupted") {
    return value;
  }

  throw new Error("O núcleo local devolveu um status de sessão inválido.");
}

export function parseStudyTask(value: unknown): StudyTaskSummary {
  if (!isRecord(value)) {
    throw new Error("O núcleo local devolveu uma tarefa inválida.");
  }

  if (
    typeof value.id !== "string" ||
    typeof value.preparationId !== "string" ||
    typeof value.title !== "string" ||
    typeof value.plannedMinutes !== "number" ||
    !Number.isInteger(value.plannedMinutes) ||
    typeof value.scheduledFor !== "string"
  ) {
    throw new Error("O núcleo local devolveu uma tarefa inválida.");
  }

  return {
    id: value.id,
    preparationId: value.preparationId,
    subjectId: parseOptionalString(value.subjectId, "o assunto da tarefa"),
    subjectName: parseOptionalString(value.subjectName, "o nome do assunto da tarefa"),
    title: value.title,
    objective: parseOptionalString(value.objective, "o objetivo da tarefa"),
    plannedMinutes: value.plannedMinutes,
    scheduledFor: value.scheduledFor,
    status: parseStudyTaskStatus(value.status),
  };
}

function parseMaterialSubject(value: unknown): MaterialSubjectSummary {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    throw new Error("O núcleo local devolveu um vínculo de material inválido.");
  }

  return { id: value.id, name: value.name };
}

export function parseMaterial(value: unknown): MaterialSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.originalName !== "string" ||
    typeof value.contentHash !== "string" ||
    typeof value.byteSize !== "number" ||
    !Number.isInteger(value.byteSize) ||
    value.byteSize < 0 ||
    typeof value.importedAt !== "string" ||
    typeof value.currentPage !== "number" ||
    !Number.isInteger(value.currentPage) ||
    value.currentPage < 1 ||
    !Array.isArray(value.subjects)
  ) {
    throw new Error("O núcleo local devolveu um material inválido.");
  }

  return {
    id: value.id,
    originalName: value.originalName,
    contentHash: value.contentHash,
    mimeType: parseOptionalString(value.mimeType, "o tipo do material"),
    byteSize: value.byteSize,
    importedAt: value.importedAt,
    currentPage: value.currentPage,
    subjects: value.subjects.map(parseMaterialSubject),
  };
}

export function parseMaterials(value: unknown): MaterialSummary[] {
  if (!Array.isArray(value)) {
    throw new Error("O núcleo local devolveu uma lista de materiais inválida.");
  }

  return value.map(parseMaterial);
}

function parseQuestionType(value: unknown): QuestionType {
  if (value === "multiple_choice" || value === "true_false") {
    return value;
  }
  throw new Error("O núcleo local devolveu um tipo de questão inválido.");
}

function parseQuestionResult(value: unknown): QuestionResult {
  if (value === "correct" || value === "incorrect" || value === "blank" || value === "pending") {
    return value;
  }
  throw new Error("O núcleo local devolveu um resultado de questão inválido.");
}

function parseQuestionConfidence(value: unknown): QuestionConfidence {
  if (value === "certain" || value === "doubt" || value === "guess") {
    return value;
  }
  throw new Error("O núcleo local devolveu uma confiança inválida.");
}

function parseQuestionStatus(value: unknown): QuestionSummary["status"] {
  if (value === "active" || value === "annulled" || value === "outdated" || value === "answer_changed") {
    return value;
  }
  throw new Error("O núcleo local devolveu uma situação de questão inválida.");
}

function parseOptionalInteger(value: unknown, fieldName: string): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  throw new Error(`O núcleo local devolveu ${fieldName} inválido.`);
}

function parseQuestionOption(value: unknown): QuestionOptionSummary {
  if (!isRecord(value) || typeof value.key !== "string" || typeof value.text !== "string") {
    throw new Error("O núcleo local devolveu uma alternativa inválida.");
  }
  return { key: value.key, text: value.text };
}

export function parseQuestion(value: unknown): QuestionSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.statementMarkdown !== "string" ||
    typeof value.attemptsCount !== "number" ||
    !Number.isInteger(value.attemptsCount) ||
    value.attemptsCount < 0 ||
    !Array.isArray(value.options)
  ) {
    throw new Error("O núcleo local devolveu uma questão inválida.");
  }

  return {
    id: value.id,
    questionType: parseQuestionType(value.questionType),
    statementMarkdown: value.statementMarkdown,
    options: value.options.map(parseQuestionOption),
    answerKey: parseOptionalString(value.answerKey, "o gabarito da questão"),
    explanationMarkdown: parseOptionalString(value.explanationMarkdown, "a explicação da questão"),
    sourceName: parseOptionalString(value.sourceName, "a origem da questão"),
    board: parseOptionalString(value.board, "a banca da questão"),
    organization: parseOptionalString(value.organization, "o órgão da questão"),
    role: parseOptionalString(value.role, "o cargo da questão"),
    examYear: parseOptionalInteger(value.examYear, "o ano da questão"),
    subjectId: parseOptionalString(value.subjectId, "o assunto da questão"),
    subjectName: parseOptionalString(value.subjectName, "o nome do assunto da questão"),
    status: parseQuestionStatus(value.status),
    attemptsCount: value.attemptsCount,
    firstAttemptResult: value.firstAttemptResult === null ? null : parseQuestionResult(value.firstAttemptResult),
    lastAttemptResult: value.lastAttemptResult === null ? null : parseQuestionResult(value.lastAttemptResult),
  };
}

export function parseQuestions(value: unknown): QuestionSummary[] {
  if (!Array.isArray(value)) {
    throw new Error("O núcleo local devolveu uma lista de questões inválida.");
  }
  return value.map(parseQuestion);
}

function parseQuestionAttempt(value: unknown): QuestionAttemptSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.questionId !== "string" ||
    typeof value.elapsedSeconds !== "number" ||
    !Number.isInteger(value.elapsedSeconds) ||
    value.elapsedSeconds < 0 ||
    typeof value.answeredAt !== "string"
  ) {
    throw new Error("O núcleo local devolveu uma tentativa inválida.");
  }

  return {
    id: value.id,
    questionId: value.questionId,
    selectedKey: parseOptionalString(value.selectedKey, "a resposta da tentativa"),
    confidence: parseQuestionConfidence(value.confidence),
    elapsedSeconds: value.elapsedSeconds,
    answerKeyAtAttempt: parseOptionalString(value.answerKeyAtAttempt, "o gabarito da tentativa"),
    result: parseQuestionResult(value.result),
    answeredAt: value.answeredAt,
  };
}

export function parseAnswerQuestionResult(value: unknown): AnswerQuestionResult {
  if (!isRecord(value) || typeof value.xpGranted !== "number" || !Number.isInteger(value.xpGranted) || value.xpGranted < 0) {
    throw new Error("O núcleo local devolveu um resultado de tentativa inválido.");
  }
  return {
    attempt: parseQuestionAttempt(value.attempt),
    question: parseQuestion(value.question),
    xpGranted: value.xpGranted,
  };
}

function parseNotebookKind(value: unknown): NotebookKind {
  if (value === "error" || value === "manual" || value === "dynamic") {
    return value;
  }
  throw new Error("O núcleo local devolveu um tipo de caderno inválido.");
}

function parseNotebookFilter(value: unknown): NotebookFilter | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    (value.attemptStatus !== "incorrect" &&
      value.attemptStatus !== "unanswered" &&
      value.attemptStatus !== "correct")
  ) {
    throw new Error("O núcleo local devolveu um filtro de caderno inválido.");
  }
  return {
    subjectId: parseOptionalString(value.subjectId, "o assunto do filtro"),
    questionType:
      value.questionType === null ? null : parseQuestionType(value.questionType),
    attemptStatus: value.attemptStatus,
  };
}

export function parseNotebook(value: unknown): NotebookSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.questionCount !== "number" ||
    !Number.isInteger(value.questionCount) ||
    value.questionCount < 0 ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    throw new Error("O núcleo local devolveu um caderno inválido.");
  }
  return {
    id: value.id,
    name: value.name,
    kind: parseNotebookKind(value.kind),
    questionCount: value.questionCount,
    filter: parseNotebookFilter(value.filter),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function parseNotebooks(value: unknown): NotebookSummary[] {
  if (!Array.isArray(value)) {
    throw new Error("O núcleo local devolveu uma lista de cadernos inválida.");
  }
  return value.map(parseNotebook);
}

function parseQuestionNotebookReason(value: unknown): QuestionNotebookReason | null {
  if (value === null) return null;
  if (
    value === "content" ||
    value === "interpretation" ||
    value === "distraction" ||
    value === "forgetfulness"
  ) {
    return value;
  }
  throw new Error("O núcleo local devolveu um motivo de caderno inválido.");
}

function parseQuestionNotebookEntry(value: unknown): QuestionNotebookEntry {
  if (
    !isRecord(value) ||
    typeof value.questionId !== "string" ||
    typeof value.notebookId !== "string" ||
    typeof value.addedAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    throw new Error("O núcleo local devolveu uma entrada de caderno inválida.");
  }
  return {
    questionId: value.questionId,
    notebookId: value.notebookId,
    reason: parseQuestionNotebookReason(value.reason),
    observation: parseOptionalString(value.observation, "a observação do caderno"),
    addedAt: value.addedAt,
    updatedAt: value.updatedAt,
  };
}

export function parseQuestionNotebookEntries(value: unknown): QuestionNotebookEntry[] {
  if (!Array.isArray(value)) {
    throw new Error("O núcleo local devolveu uma lista de caderno inválida.");
  }
  return value.map(parseQuestionNotebookEntry);
}

function parseQuestionImportIssue(value: unknown): QuestionImportIssue {
  if (
    !isRecord(value) ||
    typeof value.index !== "number" ||
    !Number.isInteger(value.index) ||
    value.index < 1 ||
    (value.kind !== "invalid" && value.kind !== "duplicate") ||
    typeof value.message !== "string"
  ) {
    throw new Error("O núcleo local devolveu um diagnóstico de importação inválido.");
  }
  return {
    index: value.index,
    kind: value.kind,
    externalId: parseOptionalString(value.externalId, "o identificador externo"),
    message: value.message,
  };
}

export function parseQuestionImportPreview(value: unknown): QuestionImportPreview {
  if (
    !isRecord(value) ||
    typeof value.schemaVersion !== "number" ||
    !Number.isInteger(value.schemaVersion) ||
    typeof value.total !== "number" ||
    !Number.isInteger(value.total) ||
    value.total < 0 ||
    typeof value.valid !== "number" ||
    !Number.isInteger(value.valid) ||
    value.valid < 0 ||
    typeof value.invalid !== "number" ||
    !Number.isInteger(value.invalid) ||
    value.invalid < 0 ||
    typeof value.duplicates !== "number" ||
    !Number.isInteger(value.duplicates) ||
    value.duplicates < 0 ||
    typeof value.fileHash !== "string" ||
    !Array.isArray(value.issues)
  ) {
    throw new Error("O núcleo local devolveu uma prévia de importação inválida.");
  }
  return {
    schemaVersion: value.schemaVersion,
    total: value.total,
    valid: value.valid,
    invalid: value.invalid,
    duplicates: value.duplicates,
    fileHash: value.fileHash,
    issues: value.issues.map(parseQuestionImportIssue),
  };
}

export function parseQuestionImportResult(value: unknown): QuestionImportResult {
  if (
    !isRecord(value) ||
    typeof value.imported !== "number" ||
    !Number.isInteger(value.imported) ||
    value.imported < 0 ||
    typeof value.skippedInvalid !== "number" ||
    !Number.isInteger(value.skippedInvalid) ||
    value.skippedInvalid < 0 ||
    typeof value.skippedDuplicates !== "number" ||
    !Number.isInteger(value.skippedDuplicates) ||
    value.skippedDuplicates < 0
  ) {
    throw new Error("O núcleo local devolveu um resultado de importação inválido.");
  }
  return {
    imported: value.imported,
    skippedInvalid: value.skippedInvalid,
    skippedDuplicates: value.skippedDuplicates,
  };
}

export function parseQuestionExportResult(value: unknown): QuestionExportResult {
  if (
    !isRecord(value) ||
    typeof value.path !== "string" ||
    typeof value.exported !== "number" ||
    !Number.isInteger(value.exported) ||
    value.exported < 0 ||
    typeof value.schemaVersion !== "number" ||
    !Number.isInteger(value.schemaVersion)
  ) {
    throw new Error("O núcleo local devolveu um resultado de exportação inválido.");
  }
  return {
    path: value.path,
    exported: value.exported,
    schemaVersion: value.schemaVersion,
  };
}

export function parseNote(value: unknown): NoteSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.contentMarkdown !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    throw new Error("O núcleo local devolveu uma nota inválida.");
  }

  return {
    id: value.id,
    title: value.title,
    contentMarkdown: value.contentMarkdown,
    materialId: parseOptionalString(value.materialId, "o material da nota"),
    subjectId: parseOptionalString(value.subjectId, "o assunto da nota"),
    materialName: parseOptionalString(value.materialName, "o nome do material da nota"),
    subjectName: parseOptionalString(value.subjectName, "o nome do assunto da nota"),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function parseNotes(value: unknown): NoteSummary[] {
  if (!Array.isArray(value)) {
    throw new Error("O núcleo local devolveu uma lista de notas inválida.");
  }

  return value.map(parseNote);
}

export function parseStudySession(value: unknown): StudySessionSummary {
  if (!isRecord(value)) {
    throw new Error("O núcleo local devolveu uma sessão inválida.");
  }

  if (
    typeof value.id !== "string" ||
    typeof value.taskId !== "string" ||
    typeof value.startedAt !== "string" ||
    typeof value.effectiveSeconds !== "number" ||
    !Number.isInteger(value.effectiveSeconds)
  ) {
    throw new Error("O núcleo local devolveu uma sessão inválida.");
  }

  return {
    id: value.id,
    taskId: value.taskId,
    subjectId: parseOptionalString(value.subjectId, "o assunto da sessão"),
    startedAt: value.startedAt,
    activeStartedAt: parseOptionalString(value.activeStartedAt, "o início ativo da sessão"),
    effectiveSeconds: value.effectiveSeconds,
    status: parseStudySessionStatus(value.status),
  };
}

function parseStudyReviewStatus(value: unknown): StudyReviewStatus {
  if (value === "pending" || value === "completed") return value;
  throw new Error("O núcleo local devolveu um status de revisão inválido.");
}

export function parseStudyReview(value: unknown): StudyReviewSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.subjectId !== "string" ||
    typeof value.subjectName !== "string" ||
    typeof value.sourceSessionId !== "string" ||
    typeof value.dueDate !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    throw new Error("O núcleo local devolveu uma revisão inválida.");
  }
  return {
    id: value.id,
    subjectId: value.subjectId,
    subjectName: value.subjectName,
    sourceSessionId: value.sourceSessionId,
    dueDate: value.dueDate,
    status: parseStudyReviewStatus(value.status),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    completedAt: parseOptionalString(value.completedAt, "a data de conclusão da revisão"),
  };
}

function parseStudyCycleSuggestion(value: unknown): StudyCycleSuggestion {
  if (
    !isRecord(value) ||
    typeof value.preparationId !== "string" ||
    typeof value.cyclePosition !== "number" ||
    !Number.isInteger(value.cyclePosition) ||
    value.cyclePosition < 0 ||
    typeof value.cycleStep !== "number" ||
    !Number.isInteger(value.cycleStep) ||
    value.cycleStep < 0 ||
    typeof value.subjectId !== "string" ||
    typeof value.subjectName !== "string" ||
    typeof value.plannedMinutes !== "number" ||
    !Number.isInteger(value.plannedMinutes) ||
    value.plannedMinutes <= 0
  ) {
    throw new Error("O núcleo local devolveu uma sugestão de ciclo inválida.");
  }

  return {
    preparationId: value.preparationId,
    cyclePosition: value.cyclePosition,
    cycleStep: value.cycleStep,
    subjectId: value.subjectId,
    subjectName: value.subjectName,
    plannedMinutes: value.plannedMinutes,
  };
}

export function parseDailyPlan(value: unknown): DailyPlan {
  if (
    !isRecord(value) ||
    typeof value.date !== "string" ||
    !Array.isArray(value.tasks) ||
    !Array.isArray(value.reviews)
  ) {
    throw new Error("O núcleo local devolveu um plano diário inválido.");
  }

  return {
    date: value.date,
    tasks: value.tasks.map(parseStudyTask),
    activeSession: value.activeSession === null ? null : parseStudySession(value.activeSession),
    reviews: value.reviews.map(parseStudyReview),
    cycleSuggestion:
      value.cycleSuggestion === null ? null : parseStudyCycleSuggestion(value.cycleSuggestion),
  };
}

export function parseAcceptStudyCycleActionResult(
  value: unknown,
): AcceptStudyCycleActionResult {
  if (
    !isRecord(value) ||
    typeof value.nextCyclePosition !== "number" ||
    !Number.isInteger(value.nextCyclePosition) ||
    value.nextCyclePosition < 0 ||
    typeof value.nextCycleStep !== "number" ||
    !Number.isInteger(value.nextCycleStep) ||
    value.nextCycleStep < 0
  ) {
    throw new Error("O núcleo local devolveu um resultado de ciclo inválido.");
  }

  return {
    task: parseStudyTask(value.task),
    nextCyclePosition: value.nextCyclePosition,
    nextCycleStep: value.nextCycleStep,
  };
}

export function parseFinishStudySessionResult(value: unknown): FinishStudySessionResult {
  if (!isRecord(value) || typeof value.xpGranted !== "number" || !Number.isInteger(value.xpGranted)) {
    throw new Error("O núcleo local devolveu um resultado de sessão inválido.");
  }

  return {
    session: parseStudySession(value.session),
    xpGranted: value.xpGranted,
    review: value.review === null ? null : parseStudyReview(value.review),
  };
}

export function parseCompleteStudyReviewResult(value: unknown): CompleteStudyReviewResult {
  if (
    !isRecord(value) ||
    typeof value.xpGranted !== "number" ||
    !Number.isInteger(value.xpGranted) ||
    value.xpGranted < 0
  ) {
    throw new Error("O núcleo local devolveu um resultado de revisão inválido.");
  }

  return {
    review: parseStudyReview(value.review),
    xpGranted: value.xpGranted,
  };
}

function parseStudyHistoryEntry(value: unknown): StudyHistoryEntry {
  if (!isRecord(value)) {
    throw new Error("O núcleo local devolveu um registro de histórico inválido.");
  }

  if (
    typeof value.sessionId !== "string" ||
    typeof value.taskId !== "string" ||
    typeof value.taskTitle !== "string" ||
    typeof value.endedAt !== "string" ||
    typeof value.effectiveSeconds !== "number" ||
    !Number.isInteger(value.effectiveSeconds) ||
    typeof value.xpGranted !== "number" ||
    !Number.isInteger(value.xpGranted)
  ) {
    throw new Error("O núcleo local devolveu um registro de histórico inválido.");
  }

  return {
    sessionId: value.sessionId,
    taskId: value.taskId,
    taskTitle: value.taskTitle,
    subjectName: parseOptionalString(value.subjectName, "o assunto do histórico"),
    endedAt: value.endedAt,
    effectiveSeconds: value.effectiveSeconds,
    taskStatus: parseStudyTaskStatus(value.taskStatus),
    xpGranted: value.xpGranted,
  };
}

export function parseStudyProgress(value: unknown): StudyProgressSummary {
  if (
    !isRecord(value) ||
    typeof value.totalXp !== "number" ||
    !Number.isInteger(value.totalXp) ||
    typeof value.completedSessions !== "number" ||
    !Number.isInteger(value.completedSessions) ||
    typeof value.effectiveSeconds !== "number" ||
    !Number.isInteger(value.effectiveSeconds) ||
    !Array.isArray(value.recentSessions) ||
    !isRecord(value.streak) ||
    typeof value.streak.currentPlannedDays !== "number" ||
    !Number.isInteger(value.streak.currentPlannedDays) ||
    value.streak.currentPlannedDays < 0 ||
    typeof value.streak.longestPlannedDays !== "number" ||
    !Number.isInteger(value.streak.longestPlannedDays) ||
    value.streak.longestPlannedDays < 0
  ) {
    throw new Error("O núcleo local devolveu um resumo de evolução inválido.");
  }

  return {
    totalXp: value.totalXp,
    completedSessions: value.completedSessions,
    effectiveSeconds: value.effectiveSeconds,
    streak: {
      currentPlannedDays: value.streak.currentPlannedDays,
      longestPlannedDays: value.streak.longestPlannedDays,
      lastStudyDay: parseOptionalString(value.streak.lastStudyDay, "o último dia de estudo"),
    },
    recentSessions: value.recentSessions.map(parseStudyHistoryEntry),
  };
}
