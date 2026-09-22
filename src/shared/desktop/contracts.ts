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
};

export type StudyPlan = {
  preparations: PreparationSummary[];
  subjects: SubjectSummary[];
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

function parseSubject(value: unknown): SubjectSummary {
  if (!isRecord(value)) {
    throw new Error("O núcleo local devolveu um assunto inválido.");
  }

  if (
    typeof value.id !== "string" ||
    typeof value.preparationId !== "string" ||
    typeof value.name !== "string" ||
    typeof value.position !== "number"
  ) {
    throw new Error("O núcleo local devolveu um assunto inválido.");
  }

  return {
    id: value.id,
    preparationId: value.preparationId,
    parentId: parseOptionalString(value.parentId, "o assunto pai"),
    name: value.name,
    position: value.position,
  };
}

export function parseStudyPlan(value: unknown): StudyPlan {
  if (!isRecord(value) || !Array.isArray(value.preparations) || !Array.isArray(value.subjects)) {
    throw new Error("O núcleo local devolveu um plano inválido.");
  }

  return {
    preparations: value.preparations.map(parsePreparation),
    subjects: value.subjects.map(parseSubject),
  };
}
