export type WorkspaceSummary = {
  workspaceId: string;
  name: string;
  formatVersion: number;
  path: string;
  storageStatus: "local";
};

export type AppTheme = "light" | "dark";

export type AppPreferences = {
  theme: AppTheme;
  reducedMotion: boolean;
  highContrast: boolean;
  timezone: string;
  gamificationVisible: boolean;
};

export type SaveAppPreferencesRequest = AppPreferences;

export type DiagnosticCounts = {
  preparations: number;
  subjects: number;
  materials: number;
  notes: number;
  questions: number;
  questionAttempts: number;
  studySessions: number;
};

export type DiagnosticSnapshot = {
  appVersion: string;
  platform: string;
  architecture: string;
  workspaceFormatVersion: number;
  schemaVersion: number;
  counts: DiagnosticCounts;
};

export type DiagnosticExportResult = {
  path: string;
  snapshot: DiagnosticSnapshot;
};

export type WorkspaceDataExportResult = {
  path: string;
  schemaVersion: number;
  exportedRecords: number;
  exportedNotes: number;
  exportedAttachments: number;
};

export type StudyProgressCsvExportResult = {
  path: string;
  rowCount: number;
};

export type FlashcardSummary = {
  id: string;
  subjectId: string | null;
  front: string;
  back: string;
  intervalDays: number;
  ease: number;
  repetitions: number;
  dueDate: string;
  algorithmVersion: number;
};

export function parseFlashcard(value: unknown): FlashcardSummary {
  if (!isRecord(value) || typeof value.id !== "string" ||
    !(value.subjectId === null || typeof value.subjectId === "string") ||
    typeof value.front !== "string" || typeof value.back !== "string" ||
    typeof value.intervalDays !== "number" || typeof value.ease !== "number" ||
    typeof value.repetitions !== "number" || typeof value.dueDate !== "string" ||
    value.algorithmVersion !== 1) {
    throw new Error("O núcleo local devolveu um flashcard inválido.");
  }
  return {
    id: value.id, subjectId: value.subjectId, front: value.front, back: value.back,
    intervalDays: value.intervalDays, ease: value.ease, repetitions: value.repetitions,
    dueDate: value.dueDate, algorithmVersion: 1,
  };
}

export type WorkspaceRequest = {
  workspacePath: string;
  name: string;
};

export type BackupSummary = {
  path: string;
  workspaceName: string;
  createdAtEpochSeconds: number;
  retentionWarning?: string | null;
};

export type BackupSettings = {
  destinationParentPath: string;
  keepLast: number | null;
  history: Array<{
    createdAtEpochSeconds: number;
    path: string | null;
    error: string | null;
  }>;
};

export function parseBackupSettings(value: unknown): BackupSettings {
  if (!isRecord(value) || typeof value.destinationParentPath !== "string" ||
    !(value.keepLast === null || (typeof value.keepLast === "number" && Number.isInteger(value.keepLast))) ||
    !Array.isArray(value.history)) {
    throw new Error("O núcleo local devolveu configurações de backup inválidas.");
  }
  const history = value.history.map((entry: unknown) => {
    if (!isRecord(entry) || typeof entry.createdAtEpochSeconds !== "number" ||
      !(entry.path === null || typeof entry.path === "string") ||
      !(entry.error === null || typeof entry.error === "string")) {
      throw new Error("O núcleo local devolveu um histórico de backup inválido.");
    }
    return { createdAtEpochSeconds: entry.createdAtEpochSeconds, path: entry.path, error: entry.error };
  });
  return { destinationParentPath: value.destinationParentPath, keepLast: value.keepLast, history };
}

export type BackupInspectionSummary = {
  path: string;
  backupFormatVersion: number;
  workspaceId: string;
  workspaceName: string;
  workspaceFormatVersion: number;
  databaseSha256: string;
  createdAtEpochSeconds: number;
  blobCount: number;
  revisionFileCount: number;
  exportFileCount: number;
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
  keepLast?: number;
};

export type InspectBackupRequest = {
  backupPath: string;
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
  board: string | null;
  examDate: string | null;
  isPrimary: boolean;
  referenceMaterialId: string | null;
  referenceDocumentStatus: "reference" | "current";
  examRulesMarkdown: string | null;
};

export type SubjectSummary = {
  id: string;
  preparationId: string;
  parentId: string | null;
  name: string;
  position: number;
  priority: number;
  studyStatus: SubjectStudyStatus;
  examWeight: number | null;
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
  board: string | null;
  examDate: string | null;
  makePrimary: boolean;
  referenceMaterialId?: string | null;
  referenceDocumentStatus?: "reference" | "current";
};

export type SetPrimaryPreparationRequest = {
  preparationId: string;
};

export type CreateSubjectRequest = {
  preparationId: string;
  name: string;
  parentId: string | null;
};

export type UpdateSubjectRequest = {
  subjectId: string;
  name: string;
  parentId: string | null;
};

export type MoveSubjectRequest = {
  subjectId: string;
  direction: "up" | "down";
};

export type ArchiveSubjectRequest = {
  subjectId: string;
};

export type SavePreparationExamConfigRequest = {
  preparationId: string;
  referenceMaterialId: string | null;
  referenceDocumentStatus: PreparationSummary["referenceDocumentStatus"];
  examRulesMarkdown: string | null;
  subjectExamWeights: Array<{
    subjectId: string;
    examWeight: number | null;
  }>;
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
  noticeMaterialId: string | null;
  noticeMaterialName: string | null;
};

export type SaveManualContestRequest = Omit<ManualContestSummary, "id" | "createdAt" | "updatedAt" | "isFavorite" | "noticeMaterialId" | "noticeMaterialName"> & {
  id: string | null;
};

export type SetManualContestFavoriteRequest = {
  contestId: string;
  isFavorite: boolean;
};

export type SetManualContestNoticeRequest = {
  contestId: string;
  materialId: string | null;
};

export type OnlineContestSummary = {
  id: string;
  sourceName: string;
  sourceKey: string;
  sourceUrl: string;
  name: string;
  organization: string | null;
  role: string | null;
  board: string | null;
  area: string | null;
  location: string | null;
  education: string | null;
  salaryText: string | null;
  salaryMax: number | null;
  vacanciesText: string | null;
  vacancies: number | null;
  status: ContestStatus;
  statusEvidence: string;
  registrationStartsOn: string | null;
  registrationEndsOn: string | null;
  feeDeadline: string | null;
  examDate: string | null;
  sourceCheckedAt: string;
  isFavorite: boolean;
  noticeMaterialId: string | null;
  hasChanges: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OnlineContestSourceState = {
  sourceName: string;
  sourceUrl: string;
  lastAttemptedAt: string | null;
  lastSuccessfulAt: string | null;
  lastError: string | null;
};

export type OnlineContestSnapshot = {
  opportunities: OnlineContestSummary[];
  source: OnlineContestSourceState;
};

export type OnlineContestRefreshResult = {
  sourceName: string;
  sourceUrl: string;
  sourceCheckedAt: string;
  importedCount: number;
  updatedCount: number;
  unchangedCount: number;
  opportunities: OnlineContestSummary[];
};

export type SetOnlineContestFavoriteRequest = {
  opportunityId: string;
  isFavorite: boolean;
};

export type SaveOnlineContestNoticeRequest = {
  opportunityId: string;
};

export type StudyTaskStatus = "pending" | "partial" | "completed" | "skipped";

export type StudySessionStatus = "active" | "paused" | "completed" | "interrupted";
export type StudySessionOrigin = "timer" | "manual";
export type StudySessionDifficulty = "easy" | "normal" | "hard";

export type StudyTaskSummary = {
  id: string;
  preparationId: string;
  subjectId: string | null;
  subjectName: string | null;
  materialId: string | null;
  materialName: string | null;
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
  origin: StudySessionOrigin;
  summaryMarkdown: string | null;
  difficulty: StudySessionDifficulty | null;
  nextSteps: string | null;
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
  activeTask: StudyTaskSummary | null;
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

export type CreateManualStudyRequest = {
  preparationId: string;
  subjectId: string | null;
  title: string;
  studiedOn: string;
  effectiveSeconds: number;
  summaryMarkdown: string | null;
  difficulty: StudySessionDifficulty | null;
  nextSteps: string | null;
};

export type CreateManualStudyResult = {
  session: StudySessionSummary;
  xpGranted: number;
};

export type CorrectStudySessionDurationRequest = {
  sessionId: string;
  effectiveSeconds: number;
  reason: string;
};

export type CorrectStudySessionDurationResult = {
  session: StudySessionSummary;
  previousEffectiveSeconds: number;
  previousXp: number;
  correctedXp: number;
  xpDelta: number;
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
  origin: StudySessionOrigin;
  xpGranted: number;
  durationCorrectionCount: number;
  lastDurationCorrectionAt: string | null;
  summaryMarkdown: string | null;
  difficulty: StudySessionDifficulty | null;
  nextSteps: string | null;
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
  sourceUrl: string | null;
  byteSize: number;
  importedAt: string;
  currentPage: number;
  subjects: MaterialSubjectSummary[];
  tags: string[];
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
export type QuestionContestRelationType =
  | "official_exam"
  | "previous_exam"
  | "thematic_compatibility";
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

export type QuestionContestRelationSummary = {
  contestId: string;
  contestName: string;
  relationType: QuestionContestRelationType;
};

export type QuestionAttachmentSourceSummary = {
  id: string;
  relativePath: string;
  sourcePath: string;
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
  firstAttemptCurrentResult: QuestionResult | null;
  lastAttemptCurrentResult: QuestionResult | null;
  revisionCount: number;
  contestRelations: QuestionContestRelationSummary[];
};

export type QuestionRevisionSummary = {
  id: string;
  questionId: string;
  previousAnswerKey: string | null;
  currentAnswerKey: string | null;
  previousStatus: QuestionSummary["status"];
  currentStatus: QuestionSummary["status"];
  reason: string;
  changedAt: string;
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

export type ReviseQuestionRequest = {
  questionId: string;
  status: QuestionSummary["status"];
  answerKey: string | null;
  reason: string;
};

export type ReviseQuestionResult = {
  question: QuestionSummary;
  revision: QuestionRevisionSummary | null;
};

export type SetQuestionContestRelationRequest = {
  questionId: string;
  contestId: string;
  relationType: QuestionContestRelationType;
  included: boolean;
};

export type CreateExternalQuestionBatchRequest = {
  preparationId: string;
  subjectId: string | null;
  sourceName: string | null;
  studiedOn: string;
  answeredCount: number;
  correctCount: number;
};

export type ExternalQuestionBatchSummary = CreateExternalQuestionBatchRequest & {
  id: string;
  preparationName: string;
  subjectName: string | null;
  createdAt: string;
};

export type QuestionPerformanceSummary = {
  asOfDate: string;
  firstAttemptGraded: number;
  firstAttemptCorrect: number;
  repeatGraded: number;
  repeatCorrect: number;
  externalBatches: number;
  externalAnswered: number;
  externalCorrect: number;
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
  materialId: string | null;
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

export type RegisterMaterialLinkRequest = {
  url: string;
  title: string | null;
  subjectId: string | null;
};

export type OpenMaterialRequest = {
  materialId: string;
};

export type UpdateMaterialPageRequest = {
  materialId: string;
  page: number;
};

export type SetMaterialTagsRequest = {
  materialId: string;
  tags: string[];
};

export type SetMaterialSubjectsRequest = {
  materialId: string;
  subjectIds: string[];
};

export type GetQuestionsRequest = {
  subjectId: string | null;
  questionType: QuestionType | null;
  status: QuestionSummary["status"] | null;
  board: string | null;
  examYear: number | null;
  attemptStatus: "unanswered" | "answered" | "first_correct" | "first_incorrect" | "last_correct" | "last_incorrect" | "repeated" | null;
  notebookId: string | null;
  searchText: string | null;
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

export type SimulationMode = "training" | "exam";
export type SimulationStatus = "draft" | "in_progress" | "paused" | "completed";
export type SimulationQuestionResult = "correct" | "incorrect" | "blank" | "pending" | "annulled";

export type SimulationSummary = {
  id: string;
  preparationId: string;
  preparationName: string;
  title: string;
  mode: SimulationMode;
  questionCount: number;
  answeredCount: number;
  timeLimitSeconds: number | null;
  negativePoints: number;
  blankPoints: number;
  annulledPoints: number;
  status: SimulationStatus;
  startedAt: string | null;
  endsAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

export type SimulationQuestionSummary = {
  questionId: string;
  position: number;
  subjectId: string | null;
  subjectName: string | null;
  questionType: QuestionType;
  statementMarkdown: string;
  options: QuestionOptionSummary[];
  selectedKey: string | null;
  elapsedSeconds: number;
  answerKey: string | null;
  result: SimulationQuestionResult | null;
  explanationMarkdown: string | null;
  weight: number;
};

export type SimulationDetail = {
  simulation: SimulationSummary;
  questions: SimulationQuestionSummary[];
};

export type SimulationDiagnosticSummary = {
  subjectId: string | null;
  subjectName: string | null;
  questionCount: number;
  correctCount: number;
  incorrectCount: number;
  blankCount: number;
  elapsedSeconds: number;
  score: number;
};

export type SimulationResult = {
  detail: SimulationDetail;
  score: number;
  maxScore: number;
  percentage: number | null;
  correctCount: number;
  incorrectCount: number;
  blankCount: number;
  annulledCount: number;
  diagnostics: SimulationDiagnosticSummary[];
};

export type SimulationSubjectSelectionRequest = {
  subjectId: string;
  questionCount: number;
  weight: number;
};

export type CreateSimulationRequest = {
  preparationId: string;
  title: string;
  mode: SimulationMode;
  questionCount: number;
  timeLimitSeconds: number | null;
  negativePoints: number;
  blankPoints: number;
  annulledPoints: number;
  questionType: QuestionType | null;
  subjectSelections: SimulationSubjectSelectionRequest[];
};

export type SimulationIdRequest = {
  simulationId: string;
};

export type AnswerSimulationRequest = {
  simulationId: string;
  questionId: string;
  selectedKey: string | null;
  elapsedSeconds: number;
};

export type DiscursiveSelfAssessment = "weak" | "partial" | "strong";

export type DiscursiveAttemptSummary = {
  id: string;
  responseMarkdown: string;
  selfAssessment: DiscursiveSelfAssessment;
  elapsedSeconds: number;
  answeredAt: string;
};

export type DiscursiveQuestionSummary = {
  id: string;
  statementMarkdown: string;
  referenceMarkdown: string | null;
  rubricMarkdown: string | null;
  sourceName: string | null;
  board: string | null;
  organization: string | null;
  role: string | null;
  examYear: number | null;
  subjectId: string | null;
  subjectName: string | null;
  attemptsCount: number;
  latestAttempt: DiscursiveAttemptSummary | null;
};

export type AnswerDiscursiveQuestionResult = {
  question: DiscursiveQuestionSummary;
  attempt: DiscursiveAttemptSummary;
};

export type CreateDiscursiveQuestionRequest = {
  statementMarkdown: string;
  referenceMarkdown: string | null;
  rubricMarkdown: string | null;
  sourceName: string | null;
  board: string | null;
  organization: string | null;
  role: string | null;
  examYear: number | null;
  subjectId: string | null;
};

export type AnswerDiscursiveQuestionRequest = {
  questionId: string;
  responseMarkdown: string;
  selfAssessment: DiscursiveSelfAssessment;
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

export type HeartbeatStudySessionRequest = {
  sessionId: string;
};

export type FinishStudySessionRequest = {
  sessionId: string;
  effectiveSeconds: number;
  taskStatus: "completed" | "partial";
  reviewOn: string | null;
  summaryMarkdown: string | null;
  difficulty: StudySessionDifficulty | null;
  nextSteps: string | null;
};

export type SaveStudySessionReflectionRequest = {
  sessionId: string;
  summaryMarkdown: string | null;
  difficulty: StudySessionDifficulty | null;
  nextSteps: string | null;
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

export function parseAppPreferences(value: unknown): AppPreferences {
  if (
    !isRecord(value) ||
    (value.theme !== "light" && value.theme !== "dark") ||
    typeof value.reducedMotion !== "boolean" ||
    typeof value.highContrast !== "boolean" ||
    typeof value.timezone !== "string" ||
    !["system", "America/Sao_Paulo", "UTC", "America/New_York", "Europe/Lisbon"].includes(value.timezone) ||
    typeof value.gamificationVisible !== "boolean"
  ) {
    throw new Error("O núcleo local devolveu preferências inválidas.");
  }

  return {
    theme: value.theme,
    reducedMotion: value.reducedMotion,
    highContrast: value.highContrast,
    timezone: value.timezone,
    gamificationVisible: value.gamificationVisible,
  };
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function parseDiagnosticCounts(value: unknown): DiagnosticCounts {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.preparations) ||
    !isNonNegativeInteger(value.subjects) ||
    !isNonNegativeInteger(value.materials) ||
    !isNonNegativeInteger(value.notes) ||
    !isNonNegativeInteger(value.questions) ||
    !isNonNegativeInteger(value.questionAttempts) ||
    !isNonNegativeInteger(value.studySessions)
  ) {
    throw new Error("O núcleo local devolveu contagens de diagnóstico inválidas.");
  }

  return {
    preparations: value.preparations,
    subjects: value.subjects,
    materials: value.materials,
    notes: value.notes,
    questions: value.questions,
    questionAttempts: value.questionAttempts,
    studySessions: value.studySessions,
  };
}

export function parseDiagnosticSnapshot(value: unknown): DiagnosticSnapshot {
  if (
    !isRecord(value) ||
    typeof value.appVersion !== "string" ||
    typeof value.platform !== "string" ||
    typeof value.architecture !== "string" ||
    !isNonNegativeInteger(value.workspaceFormatVersion) ||
    value.workspaceFormatVersion < 1 ||
    !isNonNegativeInteger(value.schemaVersion) ||
    value.schemaVersion < 1
  ) {
    throw new Error("O núcleo local devolveu um diagnóstico inválido.");
  }

  return {
    appVersion: value.appVersion,
    platform: value.platform,
    architecture: value.architecture,
    workspaceFormatVersion: value.workspaceFormatVersion,
    schemaVersion: value.schemaVersion,
    counts: parseDiagnosticCounts(value.counts),
  };
}

export function parseDiagnosticExportResult(value: unknown): DiagnosticExportResult {
  if (!isRecord(value) || typeof value.path !== "string") {
    throw new Error("O núcleo local devolveu uma exportação de diagnóstico inválida.");
  }
  return { path: value.path, snapshot: parseDiagnosticSnapshot(value.snapshot) };
}

export function parseWorkspaceDataExportResult(value: unknown): WorkspaceDataExportResult {
  if (
    !isRecord(value) ||
    typeof value.path !== "string" ||
    typeof value.schemaVersion !== "number" ||
    !Number.isInteger(value.schemaVersion) ||
    value.schemaVersion < 1 ||
    typeof value.exportedRecords !== "number" ||
    !Number.isInteger(value.exportedRecords) ||
    value.exportedRecords < 0 ||
    typeof value.exportedNotes !== "number" ||
    !Number.isInteger(value.exportedNotes) ||
    value.exportedNotes < 0 ||
    typeof value.exportedAttachments !== "number" ||
    !Number.isInteger(value.exportedAttachments) ||
    value.exportedAttachments < 0
  ) {
    throw new Error("O núcleo local devolveu um resultado de exportação inválido.");
  }

  return {
    path: value.path,
    schemaVersion: value.schemaVersion,
    exportedRecords: value.exportedRecords,
    exportedNotes: value.exportedNotes,
    exportedAttachments: value.exportedAttachments,
  };
}

export function parseStudyProgressCsvExportResult(
  value: unknown,
): StudyProgressCsvExportResult {
  if (
    !isRecord(value) ||
    typeof value.path !== "string" ||
    typeof value.rowCount !== "number" ||
    !Number.isInteger(value.rowCount) ||
    value.rowCount < 0
  ) {
    throw new Error("O núcleo local devolveu uma exportação de evolução inválida.");
  }

  return { path: value.path, rowCount: value.rowCount };
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
    retentionWarning: typeof value.retentionWarning === "string" ? value.retentionWarning : null,
  };
}

export function parseBackupInspectionSummary(value: unknown): BackupInspectionSummary {
  if (
    !isRecord(value) ||
    typeof value.path !== "string" ||
    !isNonNegativeInteger(value.backupFormatVersion) ||
    typeof value.workspaceId !== "string" ||
    typeof value.workspaceName !== "string" ||
    !isNonNegativeInteger(value.workspaceFormatVersion) ||
    typeof value.databaseSha256 !== "string" ||
    typeof value.createdAtEpochSeconds !== "number" ||
    !Number.isInteger(value.createdAtEpochSeconds) ||
    value.createdAtEpochSeconds < 0 ||
    !isNonNegativeInteger(value.blobCount) ||
    !isNonNegativeInteger(value.revisionFileCount) ||
    !isNonNegativeInteger(value.exportFileCount)
  ) {
    throw new Error("O núcleo local devolveu uma prévia de backup inválida.");
  }

  return {
    path: value.path,
    backupFormatVersion: value.backupFormatVersion,
    workspaceId: value.workspaceId,
    workspaceName: value.workspaceName,
    workspaceFormatVersion: value.workspaceFormatVersion,
    databaseSha256: value.databaseSha256,
    createdAtEpochSeconds: value.createdAtEpochSeconds,
    blobCount: value.blobCount,
    revisionFileCount: value.revisionFileCount,
    exportFileCount: value.exportFileCount,
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

export function parsePreparationSummary(value: unknown): PreparationSummary {
  if (!isRecord(value)) {
    throw new Error("O núcleo local devolveu uma preparação inválida.");
  }

  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.isPrimary !== "boolean" ||
    (value.referenceMaterialId !== null && typeof value.referenceMaterialId !== "string") ||
    (value.referenceDocumentStatus !== "reference" && value.referenceDocumentStatus !== "current") ||
    (value.referenceDocumentStatus === "current" && value.referenceMaterialId === null) ||
    (value.examRulesMarkdown !== null && typeof value.examRulesMarkdown !== "string")
  ) {
    throw new Error("O núcleo local devolveu uma preparação inválida.");
  }

  return {
    id: value.id,
    name: value.name,
    organization: parseOptionalString(value.organization, "o órgão"),
    role: parseOptionalString(value.role, "o cargo"),
    board: parseOptionalString(value.board, "a banca"),
    examDate: parseOptionalString(value.examDate, "a data da prova"),
    isPrimary: value.isPrimary,
    referenceMaterialId: parseOptionalString(value.referenceMaterialId, "o edital de referência"),
    referenceDocumentStatus: value.referenceDocumentStatus,
    examRulesMarkdown: parseOptionalString(value.examRulesMarkdown, "as regras da prova"),
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
    value.priority > 5 ||
    (value.examWeight !== null &&
      (typeof value.examWeight !== "number" ||
        !Number.isFinite(value.examWeight) ||
        value.examWeight <= 0))
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
    examWeight: value.examWeight,
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
    preparations: value.preparations.map(parsePreparationSummary),
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
    noticeMaterialId: parseOptionalString(value.noticeMaterialId, "o edital local do concurso"),
    noticeMaterialName: parseOptionalString(value.noticeMaterialName, "o nome do edital local"),
  };
}

export function parseManualContests(value: unknown): ManualContestSummary[] {
  if (!Array.isArray(value)) {
    throw new Error("O núcleo local devolveu uma lista de concursos inválida.");
  }
  return value.map(parseManualContest);
}

export function parseOnlineContest(value: unknown): OnlineContestSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.sourceName !== "string" ||
    typeof value.sourceKey !== "string" ||
    typeof value.sourceUrl !== "string" ||
    typeof value.name !== "string" ||
    typeof value.statusEvidence !== "string" ||
    typeof value.sourceCheckedAt !== "string" ||
    typeof value.isFavorite !== "boolean" ||
    typeof value.hasChanges !== "boolean" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    throw new Error("O núcleo local devolveu uma oportunidade online inválida.");
  }
  return {
    id: value.id,
    sourceName: value.sourceName,
    sourceKey: value.sourceKey,
    sourceUrl: value.sourceUrl,
    name: value.name,
    organization: parseOptionalString(value.organization, "o órgão da oportunidade"),
    role: parseOptionalString(value.role, "o cargo da oportunidade"),
    board: parseOptionalString(value.board, "a banca da oportunidade"),
    area: parseOptionalString(value.area, "a área da oportunidade"),
    location: parseOptionalString(value.location, "o local da oportunidade"),
    education: parseOptionalString(value.education, "a escolaridade da oportunidade"),
    salaryText: parseOptionalString(value.salaryText, "o salário da oportunidade"),
    salaryMax: parseOptionalFiniteNumber(value.salaryMax, "o salário máximo da oportunidade"),
    vacanciesText: parseOptionalString(value.vacanciesText, "as vagas da oportunidade"),
    vacancies: parseOptionalInteger(value.vacancies, "a quantidade de vagas da oportunidade"),
    status: parseContestStatus(value.status),
    statusEvidence: value.statusEvidence,
    registrationStartsOn: parseOptionalString(value.registrationStartsOn, "o início das inscrições da oportunidade"),
    registrationEndsOn: parseOptionalString(value.registrationEndsOn, "o encerramento das inscrições da oportunidade"),
    feeDeadline: parseOptionalString(value.feeDeadline, "o prazo de pagamento da oportunidade"),
    examDate: parseOptionalString(value.examDate, "a data da prova da oportunidade"),
    sourceCheckedAt: value.sourceCheckedAt,
    isFavorite: value.isFavorite,
    noticeMaterialId: parseOptionalString(value.noticeMaterialId, "o edital local da oportunidade"),
    hasChanges: value.hasChanges,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function parseOnlineContestSource(value: unknown): OnlineContestSourceState {
  if (!isRecord(value) || typeof value.sourceName !== "string" || typeof value.sourceUrl !== "string") {
    throw new Error("O núcleo local devolveu o estado da fonte online inválido.");
  }
  return {
    sourceName: value.sourceName,
    sourceUrl: value.sourceUrl,
    lastAttemptedAt: parseOptionalString(value.lastAttemptedAt, "a última tentativa da fonte"),
    lastSuccessfulAt: parseOptionalString(value.lastSuccessfulAt, "a última consulta bem-sucedida da fonte"),
    lastError: parseOptionalString(value.lastError, "o último erro da fonte"),
  };
}

export function parseOnlineContestSnapshot(value: unknown): OnlineContestSnapshot {
  if (!isRecord(value) || !Array.isArray(value.opportunities)) {
    throw new Error("O núcleo local devolveu o cache de concursos inválido.");
  }
  return {
    opportunities: value.opportunities.map(parseOnlineContest),
    source: parseOnlineContestSource(value.source),
  };
}

export function parseOnlineContestRefreshResult(value: unknown): OnlineContestRefreshResult {
  if (
    !isRecord(value) ||
    typeof value.sourceName !== "string" ||
    typeof value.sourceUrl !== "string" ||
    typeof value.sourceCheckedAt !== "string" ||
    !isNonNegativeInteger(value.importedCount) ||
    !isNonNegativeInteger(value.updatedCount) ||
    !isNonNegativeInteger(value.unchangedCount) ||
    !Array.isArray(value.opportunities)
  ) {
    throw new Error("O núcleo local devolveu o resultado de atualização online inválido.");
  }
  return {
    sourceName: value.sourceName,
    sourceUrl: value.sourceUrl,
    sourceCheckedAt: value.sourceCheckedAt,
    importedCount: value.importedCount,
    updatedCount: value.updatedCount,
    unchangedCount: value.unchangedCount,
    opportunities: value.opportunities.map(parseOnlineContest),
  };
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

function parseStudySessionOrigin(value: unknown): StudySessionOrigin {
  if (value === "timer" || value === "manual") return value;
  throw new Error("O núcleo local devolveu uma origem de sessão inválida.");
}

function parseOptionalStudySessionDifficulty(value: unknown): StudySessionDifficulty | null {
  if (value === null) return null;
  if (value === "easy" || value === "normal" || value === "hard") return value;
  throw new Error("O núcleo local devolveu uma dificuldade de sessão inválida.");
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
    materialId: parseOptionalString(value.materialId, "o material da tarefa"),
    materialName: parseOptionalString(value.materialName, "o nome do material da tarefa"),
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

function parseMaterialTag(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("O núcleo local devolveu uma etiqueta de material inválida.");
  }
  return value;
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
    !Array.isArray(value.subjects) ||
    !Array.isArray(value.tags)
  ) {
    throw new Error("O núcleo local devolveu um material inválido.");
  }

  return {
    id: value.id,
    originalName: value.originalName,
    contentHash: value.contentHash,
    mimeType: parseOptionalString(value.mimeType, "o tipo do material"),
    sourceUrl: parseOptionalString(value.sourceUrl, "o link externo do material"),
    byteSize: value.byteSize,
    importedAt: value.importedAt,
    currentPage: value.currentPage,
    subjects: value.subjects.map(parseMaterialSubject),
    tags: value.tags.map(parseMaterialTag),
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

function parseSimulationMode(value: unknown): SimulationMode {
  if (value === "training" || value === "exam") return value;
  throw new Error("O núcleo local devolveu um modo de simulado inválido.");
}

function parseSimulationStatus(value: unknown): SimulationStatus {
  if (value === "draft" || value === "in_progress" || value === "paused" || value === "completed") {
    return value;
  }
  throw new Error("O núcleo local devolveu uma situação de simulado inválida.");
}

function parseSimulationQuestionResult(value: unknown): SimulationQuestionResult {
  if (
    value === "correct" ||
    value === "incorrect" ||
    value === "blank" ||
    value === "pending" ||
    value === "annulled"
  ) {
    return value;
  }
  throw new Error("O núcleo local devolveu um resultado de simulado inválido.");
}

function parseOptionalSimulationQuestionResult(value: unknown): SimulationQuestionResult | null {
  if (value === null) return null;
  return parseSimulationQuestionResult(value);
}

function parseFiniteNumber(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(`O núcleo local devolveu ${fieldName} inválido.`);
}

function parseOptionalFiniteNumber(value: unknown, fieldName: string): number | null {
  if (value === null) return null;
  return parseFiniteNumber(value, fieldName);
}

export function parseSimulationSummary(value: unknown): SimulationSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.preparationId !== "string" ||
    typeof value.preparationName !== "string" ||
    typeof value.title !== "string" ||
    !isNonNegativeInteger(value.questionCount) ||
    value.questionCount < 1 ||
    !isNonNegativeInteger(value.answeredCount) ||
    (value.timeLimitSeconds !== null && !isNonNegativeInteger(value.timeLimitSeconds)) ||
    typeof value.createdAt !== "string"
  ) {
    throw new Error("O núcleo local devolveu um resumo de simulado inválido.");
  }

  return {
    id: value.id,
    preparationId: value.preparationId,
    preparationName: value.preparationName,
    title: value.title,
    mode: parseSimulationMode(value.mode),
    questionCount: value.questionCount,
    answeredCount: value.answeredCount,
    timeLimitSeconds: parseOptionalInteger(value.timeLimitSeconds, "o limite de tempo do simulado"),
    negativePoints: parseFiniteNumber(value.negativePoints, "a penalidade do simulado"),
    blankPoints: parseFiniteNumber(value.blankPoints, "a pontuação de branco do simulado"),
    annulledPoints: parseFiniteNumber(value.annulledPoints, "a pontuação de anulada do simulado"),
    status: parseSimulationStatus(value.status),
    startedAt: parseOptionalString(value.startedAt, "o início do simulado"),
    endsAt: parseOptionalString(value.endsAt, "o fim do simulado"),
    finishedAt: parseOptionalString(value.finishedAt, "a conclusão do simulado"),
    createdAt: value.createdAt,
  };
}

export function parseSimulationDetail(value: unknown): SimulationDetail {
  if (!isRecord(value) || !Array.isArray(value.questions)) {
    throw new Error("O núcleo local devolveu um simulado inválido.");
  }
  return {
    simulation: parseSimulationSummary(value.simulation),
    questions: value.questions.map((question) => {
      const weight = isRecord(question)
        ? parseFiniteNumber(question.weight, "o peso da questão do simulado")
        : 0;
      if (
        !isRecord(question) ||
        typeof question.questionId !== "string" ||
        !isNonNegativeInteger(question.position) ||
        !Array.isArray(question.options) ||
        typeof question.statementMarkdown !== "string" ||
        !isNonNegativeInteger(question.elapsedSeconds) ||
        weight <= 0
      ) {
        throw new Error("O núcleo local devolveu uma questão de simulado inválida.");
      }
      return {
        questionId: question.questionId,
        position: question.position,
        subjectId: parseOptionalString(question.subjectId, "o assunto da questão do simulado"),
        subjectName: parseOptionalString(question.subjectName, "o nome do assunto do simulado"),
        questionType: parseQuestionType(question.questionType),
        statementMarkdown: question.statementMarkdown,
        options: question.options.map(parseQuestionOption),
        selectedKey: parseOptionalString(question.selectedKey, "a resposta do simulado"),
        elapsedSeconds: question.elapsedSeconds,
        answerKey: parseOptionalString(question.answerKey, "o gabarito do simulado"),
        result: parseOptionalSimulationQuestionResult(question.result),
        explanationMarkdown: parseOptionalString(question.explanationMarkdown, "a explicação do simulado"),
        weight,
      };
    }),
  };
}

function parseSimulationDiagnostic(value: unknown): SimulationDiagnosticSummary {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.questionCount) ||
    !isNonNegativeInteger(value.correctCount) ||
    !isNonNegativeInteger(value.incorrectCount) ||
    !isNonNegativeInteger(value.blankCount) ||
    !isNonNegativeInteger(value.elapsedSeconds)
  ) {
    throw new Error("O núcleo local devolveu um diagnóstico de simulado inválido.");
  }
  return {
    subjectId: parseOptionalString(value.subjectId, "o assunto do diagnóstico"),
    subjectName: parseOptionalString(value.subjectName, "o nome do assunto do diagnóstico"),
    questionCount: value.questionCount,
    correctCount: value.correctCount,
    incorrectCount: value.incorrectCount,
    blankCount: value.blankCount,
    elapsedSeconds: value.elapsedSeconds,
    score: parseFiniteNumber(value.score, "a pontuação do diagnóstico"),
  };
}

export function parseSimulationResult(value: unknown): SimulationResult {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.correctCount) ||
    !isNonNegativeInteger(value.incorrectCount) ||
    !isNonNegativeInteger(value.blankCount) ||
    !isNonNegativeInteger(value.annulledCount) ||
    !Array.isArray(value.diagnostics)
  ) {
    throw new Error("O núcleo local devolveu um resultado de simulado inválido.");
  }
  return {
    detail: parseSimulationDetail(value.detail),
    score: parseFiniteNumber(value.score, "a pontuação do simulado"),
    maxScore: parseFiniteNumber(value.maxScore, "a pontuação máxima do simulado"),
    percentage: parseOptionalFiniteNumber(value.percentage, "o percentual do simulado"),
    correctCount: value.correctCount,
    incorrectCount: value.incorrectCount,
    blankCount: value.blankCount,
    annulledCount: value.annulledCount,
    diagnostics: value.diagnostics.map(parseSimulationDiagnostic),
  };
}

export function parseSimulations(value: unknown): SimulationSummary[] {
  if (!Array.isArray(value)) {
    throw new Error("O núcleo local devolveu uma lista de simulados inválida.");
  }
  return value.map(parseSimulationSummary);
}

function parseDiscursiveSelfAssessment(value: unknown): DiscursiveSelfAssessment {
  if (value === "weak" || value === "partial" || value === "strong") return value;
  throw new Error("O núcleo local devolveu uma autoavaliação discursiva inválida.");
}

function parseDiscursiveAttempt(value: unknown): DiscursiveAttemptSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.responseMarkdown !== "string" ||
    !isNonNegativeInteger(value.elapsedSeconds) ||
    typeof value.answeredAt !== "string"
  ) {
    throw new Error("O núcleo local devolveu uma resposta discursiva inválida.");
  }
  return {
    id: value.id,
    responseMarkdown: value.responseMarkdown,
    selfAssessment: parseDiscursiveSelfAssessment(value.selfAssessment),
    elapsedSeconds: value.elapsedSeconds,
    answeredAt: value.answeredAt,
  };
}

export function parseDiscursiveQuestion(value: unknown): DiscursiveQuestionSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.statementMarkdown !== "string" ||
    !isNonNegativeInteger(value.attemptsCount)
  ) {
    throw new Error("O núcleo local devolveu uma discursiva inválida.");
  }
  return {
    id: value.id,
    statementMarkdown: value.statementMarkdown,
    referenceMarkdown: parseOptionalString(value.referenceMarkdown, "a referência discursiva"),
    rubricMarkdown: parseOptionalString(value.rubricMarkdown, "a rubrica discursiva"),
    sourceName: parseOptionalString(value.sourceName, "a origem da discursiva"),
    board: parseOptionalString(value.board, "a banca da discursiva"),
    organization: parseOptionalString(value.organization, "o órgão da discursiva"),
    role: parseOptionalString(value.role, "o cargo da discursiva"),
    examYear: parseOptionalInteger(value.examYear, "o ano da discursiva"),
    subjectId: parseOptionalString(value.subjectId, "o assunto da discursiva"),
    subjectName: parseOptionalString(value.subjectName, "o nome do assunto da discursiva"),
    attemptsCount: value.attemptsCount,
    latestAttempt: value.latestAttempt === null ? null : parseDiscursiveAttempt(value.latestAttempt),
  };
}

export function parseDiscursiveQuestions(value: unknown): DiscursiveQuestionSummary[] {
  if (!Array.isArray(value)) {
    throw new Error("O núcleo local devolveu uma lista de discursivas inválida.");
  }
  return value.map(parseDiscursiveQuestion);
}

export function parseAnswerDiscursiveQuestionResult(value: unknown): AnswerDiscursiveQuestionResult {
  if (!isRecord(value)) {
    throw new Error("O núcleo local devolveu uma resposta discursiva inválida.");
  }
  return {
    question: parseDiscursiveQuestion(value.question),
    attempt: parseDiscursiveAttempt(value.attempt),
  };
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

function parseQuestionContestRelationType(value: unknown): QuestionContestRelationType {
  if (value === "official_exam" || value === "previous_exam" || value === "thematic_compatibility") {
    return value;
  }
  throw new Error("O núcleo local devolveu um tipo de relação de questão inválido.");
}

function parseQuestionContestRelation(value: unknown): QuestionContestRelationSummary {
  if (
    !isRecord(value) ||
    typeof value.contestId !== "string" ||
    typeof value.contestName !== "string"
  ) {
    throw new Error("O núcleo local devolveu uma relação de questão inválida.");
  }
  return {
    contestId: value.contestId,
    contestName: value.contestName,
    relationType: parseQuestionContestRelationType(value.relationType),
  };
}

function parseQuestionAttachmentSource(value: unknown): QuestionAttachmentSourceSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    value.id.trim().length === 0 ||
    typeof value.relativePath !== "string" ||
    typeof value.sourcePath !== "string" ||
    value.sourcePath.trim().length === 0
  ) {
    throw new Error("O núcleo local devolveu uma origem de imagem inválida.");
  }
  return { id: value.id, relativePath: value.relativePath, sourcePath: value.sourcePath };
}

export function parseQuestionAttachmentSources(value: unknown): QuestionAttachmentSourceSummary[] {
  if (!Array.isArray(value)) {
    throw new Error("O núcleo local devolveu uma lista de imagens inválida.");
  }
  return value.map(parseQuestionAttachmentSource);
}

function parseOptionalQuestionResult(value: unknown, fieldName: string): QuestionResult | null {
  if (value === null) return null;
  try {
    return parseQuestionResult(value);
  } catch {
    throw new Error(`O núcleo local devolveu ${fieldName} inválido.`);
  }
}

export function parseQuestion(value: unknown): QuestionSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.statementMarkdown !== "string" ||
     typeof value.attemptsCount !== "number" ||
     !Number.isInteger(value.attemptsCount) ||
     value.attemptsCount < 0 ||
     typeof value.revisionCount !== "number" ||
     !Number.isInteger(value.revisionCount) ||
     value.revisionCount < 0 ||
     !Array.isArray(value.options) ||
     !Array.isArray(value.contestRelations)
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
    firstAttemptResult: parseOptionalQuestionResult(value.firstAttemptResult, "o primeiro resultado"),
    lastAttemptResult: parseOptionalQuestionResult(value.lastAttemptResult, "o último resultado"),
    firstAttemptCurrentResult: parseOptionalQuestionResult(
      value.firstAttemptCurrentResult,
      "o primeiro resultado reavaliado",
    ),
    lastAttemptCurrentResult: parseOptionalQuestionResult(
      value.lastAttemptCurrentResult,
      "o último resultado reavaliado",
    ),
    revisionCount: value.revisionCount,
    contestRelations: value.contestRelations.map(parseQuestionContestRelation),
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

export function parseQuestionRevision(value: unknown): QuestionRevisionSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.questionId !== "string" ||
    typeof value.reason !== "string" ||
    typeof value.changedAt !== "string"
  ) {
    throw new Error("O núcleo local devolveu uma revisão de questão inválida.");
  }
  return {
    id: value.id,
    questionId: value.questionId,
    previousAnswerKey: parseOptionalString(value.previousAnswerKey, "o gabarito anterior"),
    currentAnswerKey: parseOptionalString(value.currentAnswerKey, "o gabarito atual"),
    previousStatus: parseQuestionStatus(value.previousStatus),
    currentStatus: parseQuestionStatus(value.currentStatus),
    reason: value.reason,
    changedAt: value.changedAt,
  };
}

export function parseReviseQuestionResult(value: unknown): ReviseQuestionResult {
  if (!isRecord(value) || !("question" in value)) {
    throw new Error("O núcleo local devolveu um resultado de revisão inválido.");
  }
  return {
    question: parseQuestion(value.question),
    revision: value.revision === null ? null : parseQuestionRevision(value.revision),
  };
}

export function parseExternalQuestionBatch(value: unknown): ExternalQuestionBatchSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.preparationId !== "string" ||
    typeof value.preparationName !== "string" ||
    typeof value.studiedOn !== "string" ||
    typeof value.createdAt !== "string" ||
    !isNonNegativeInteger(value.answeredCount) ||
    value.answeredCount === 0 ||
    !isNonNegativeInteger(value.correctCount) ||
    value.correctCount > value.answeredCount
  ) {
    throw new Error("O núcleo local devolveu um lote externo inválido.");
  }
  return {
    id: value.id,
    preparationId: value.preparationId,
    preparationName: value.preparationName,
    subjectId: parseOptionalString(value.subjectId, "o assunto do lote"),
    subjectName: parseOptionalString(value.subjectName, "o nome do assunto do lote"),
    sourceName: parseOptionalString(value.sourceName, "a origem do lote"),
    studiedOn: value.studiedOn,
    answeredCount: value.answeredCount,
    correctCount: value.correctCount,
    createdAt: value.createdAt,
  };
}

export function parseQuestionPerformance(value: unknown): QuestionPerformanceSummary {
  if (
    !isRecord(value) ||
    typeof value.asOfDate !== "string" ||
    !isNonNegativeInteger(value.firstAttemptGraded) ||
    !isNonNegativeInteger(value.firstAttemptCorrect) ||
    value.firstAttemptCorrect > value.firstAttemptGraded ||
    !isNonNegativeInteger(value.repeatGraded) ||
    !isNonNegativeInteger(value.repeatCorrect) ||
    value.repeatCorrect > value.repeatGraded ||
    !isNonNegativeInteger(value.externalBatches) ||
    !isNonNegativeInteger(value.externalAnswered) ||
    !isNonNegativeInteger(value.externalCorrect) ||
    value.externalCorrect > value.externalAnswered
  ) {
    throw new Error("O núcleo local devolveu métricas de questões inválidas.");
  }
  return {
    asOfDate: value.asOfDate,
    firstAttemptGraded: value.firstAttemptGraded,
    firstAttemptCorrect: value.firstAttemptCorrect,
    repeatGraded: value.repeatGraded,
    repeatCorrect: value.repeatCorrect,
    externalBatches: value.externalBatches,
    externalAnswered: value.externalAnswered,
    externalCorrect: value.externalCorrect,
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
    origin: parseStudySessionOrigin(value.origin),
    summaryMarkdown: parseOptionalString(value.summaryMarkdown, "o resumo da sessão"),
    difficulty: parseOptionalStudySessionDifficulty(value.difficulty),
    nextSteps: parseOptionalString(value.nextSteps, "os próximos passos da sessão"),
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
    activeTask: value.activeTask === null ? null : parseStudyTask(value.activeTask),
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

export function parseCreateManualStudyResult(value: unknown): CreateManualStudyResult {
  if (!isRecord(value) || typeof value.xpGranted !== "number" || !Number.isInteger(value.xpGranted)) {
    throw new Error("O núcleo local devolveu um resultado de estudo manual inválido.");
  }
  return {
    session: parseStudySession(value.session),
    xpGranted: value.xpGranted,
  };
}

export function parseCorrectStudySessionDurationResult(
  value: unknown,
): CorrectStudySessionDurationResult {
  if (
    !isRecord(value) ||
    typeof value.previousEffectiveSeconds !== "number" ||
    !Number.isInteger(value.previousEffectiveSeconds) ||
    typeof value.previousXp !== "number" ||
    !Number.isInteger(value.previousXp) ||
    typeof value.correctedXp !== "number" ||
    !Number.isInteger(value.correctedXp) ||
    typeof value.xpDelta !== "number" ||
    !Number.isInteger(value.xpDelta)
  ) {
    throw new Error("O núcleo local devolveu uma correção de duração inválida.");
  }
  return {
    session: parseStudySession(value.session),
    previousEffectiveSeconds: value.previousEffectiveSeconds,
    previousXp: value.previousXp,
    correctedXp: value.correctedXp,
    xpDelta: value.xpDelta,
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
    !Number.isInteger(value.xpGranted) ||
    typeof value.durationCorrectionCount !== "number" ||
    !Number.isInteger(value.durationCorrectionCount) ||
    value.durationCorrectionCount < 0
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
    origin: parseStudySessionOrigin(value.origin),
    xpGranted: value.xpGranted,
    durationCorrectionCount: value.durationCorrectionCount,
    lastDurationCorrectionAt: parseOptionalString(
      value.lastDurationCorrectionAt,
      "a data da última correção de duração",
    ),
    summaryMarkdown: parseOptionalString(value.summaryMarkdown, "o resumo do histórico"),
    difficulty: parseOptionalStudySessionDifficulty(value.difficulty),
    nextSteps: parseOptionalString(value.nextSteps, "os próximos passos do histórico"),
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
