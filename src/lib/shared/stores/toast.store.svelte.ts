export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

export const TOAST_DEFAULT_DURATION = 4000;

class ToastState {
  toasts = $state<Toast[]>([]);

  show(message: string, type: ToastType = 'info', durationMs = TOAST_DEFAULT_DURATION) {
    const id = crypto.randomUUID();
    this.toasts.push({ id, message, type });

    if (durationMs > 0) {
      setTimeout(() => {
        this.remove(id);
      }, durationMs);
    }
  }

  error(message: string, durationMs = TOAST_DEFAULT_DURATION) {
    this.show(message, 'error', durationMs);
  }

  success(message: string, durationMs = TOAST_DEFAULT_DURATION) {
    this.show(message, 'success', durationMs);
  }

  info(message: string, durationMs = TOAST_DEFAULT_DURATION) {
    this.show(message, 'info', durationMs);
  }

  warning(message: string, durationMs = TOAST_DEFAULT_DURATION) {
    this.show(message, 'warning', durationMs);
  }

  remove(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }
}

export const toast = new ToastState();
