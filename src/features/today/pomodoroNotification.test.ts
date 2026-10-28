import { describe, expect, it, vi } from "vitest";
import { notifyPomodoroPhaseCompleted } from "./pomodoroNotification";

describe("pomodoroNotification", () => {
  it("emite notificação quando a permissão está concedida", () => {
    const NotificationMock = vi.fn();
    Object.assign(NotificationMock, { permission: "granted" });
    vi.stubGlobal("Notification", NotificationMock);

    notifyPomodoroPhaseCompleted("Foco concluído", "Hora da pausa.");

    expect(NotificationMock).toHaveBeenCalledWith("Foco concluído", {
      body: "Hora da pausa.",
    });
  });
});
