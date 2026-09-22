import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  parseOptionalWorkspaceSummary,
  parseWorkspaceSummary,
  parseStudyPlan,
  type CreatePreparationRequest,
  type CreateSubjectRequest,
  type StudyPlan,
  type WorkspaceRequest,
  type WorkspaceSummary,
} from "./contracts";

export async function getActiveWorkspace(): Promise<WorkspaceSummary | null> {
  const response = await invoke<unknown>("get_active_workspace");
  return parseOptionalWorkspaceSummary(response);
}

export async function createWorkspace(request: WorkspaceRequest): Promise<WorkspaceSummary> {
  const response = await invoke<unknown>("create_workspace", { request });
  return parseWorkspaceSummary(response);
}

export async function openWorkspace(workspacePath: string): Promise<WorkspaceSummary> {
  const response = await invoke<unknown>("open_workspace", {
    request: { workspacePath },
  });
  return parseWorkspaceSummary(response);
}

export async function pickWorkspaceDirectory(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Escolha a pasta do espaço de estudos",
  });

  return typeof selected === "string" ? selected : null;
}

export async function getStudyPlan(): Promise<StudyPlan> {
  const response = await invoke<unknown>("get_study_plan");
  return parseStudyPlan(response);
}

export async function createPreparation(
  request: CreatePreparationRequest,
): Promise<void> {
  await invoke("create_preparation", { request });
}

export async function createSubject(request: CreateSubjectRequest): Promise<void> {
  await invoke("create_subject", { request });
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
