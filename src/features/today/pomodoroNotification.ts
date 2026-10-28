/**
 * Avisos de fim de fase do Pomodoro.
 *
 * O aplicativo é uma janela desktop: quando o usuário está lendo um material em
 * outra janela, a mensagem na tela não é suficiente. Tentamos a Notification API
 * da WebView e, quando ela não existe ou está bloqueada, emitimos um bipe curto
 * com a Web Audio API. Nenhuma das duas opções envia dados para fora da máquina.
 */

type NotificationConstructor = typeof Notification;

function getNotificationConstructor(): NotificationConstructor | null {
  const candidate = (globalThis as { Notification?: NotificationConstructor }).Notification;
  return typeof candidate === "function" ? candidate : null;
}

export function preparePomodoroNotifications(): void {
  const NotificationCtor = getNotificationConstructor();
  if (!NotificationCtor) return;
  try {
    if (NotificationCtor.permission === "default") {
      void NotificationCtor.requestPermission().catch(() => {
        // Permissão negada ou indisponível: o bipe continua como aviso.
      });
    }
  } catch {
    // Algumas WebViews expõem a API mas lançam ao pedir permissão.
  }
}

export function notifyPomodoroPhaseCompleted(title: string, body: string): void {
  const NotificationCtor = getNotificationConstructor();
  if (NotificationCtor && NotificationCtor.permission === "granted") {
    try {
      new NotificationCtor(title, { body });
    } catch {
      // Sem permissão efetiva da WebView: segue para o aviso sonoro.
    }
  }
  playPomodoroChime();
}

export function playPomodoroChime(): void {
  const AudioContextConstructor =
    (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return;

  try {
    const context = new AudioContextConstructor();
    const playTone = (frequency: number, startOffset: number, duration: number) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, context.currentTime + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + startOffset + 0.02);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        context.currentTime + startOffset + duration,
      );
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(context.currentTime + startOffset);
      oscillator.stop(context.currentTime + startOffset + duration + 0.02);
    };

    playTone(880, 0, 0.18);
    playTone(660, 0.22, 0.22);
    window.setTimeout(() => {
      void context.close().catch(() => undefined);
    }, 700);
  } catch {
    // Áudio indisponível não deve interromper o Pomodoro.
  }
}
