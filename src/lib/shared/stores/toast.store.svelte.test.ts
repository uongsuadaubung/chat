import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toast } from '$lib/shared/stores/toast.store.svelte';

describe('Toast Notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Clear out any existing toasts before each test
    toast.toasts.forEach((t) => toast.remove(t.id));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should show error toast with Vietnamese message', () => {
    const errorMessage = 'Không thể ghim tin nhắn: Lỗi kết nối';
    toast.error(errorMessage);

    expect(toast.toasts.length).toBe(1);
    expect(toast.toasts[0].message).toBe(errorMessage);
    expect(toast.toasts[0].type).toBe('error');
  });

  it('should show success toast', () => {
    const successMessage = 'Thao tác thành công';
    toast.success(successMessage);

    expect(toast.toasts.length).toBe(1);
    expect(toast.toasts[0].message).toBe(successMessage);
    expect(toast.toasts[0].type).toBe('success');
  });

  it('should automatically remove toasts after default duration', () => {
    toast.error('Test error');
    expect(toast.toasts.length).toBe(1);

    // Fast-forward past default duration (4000ms)
    vi.advanceTimersByTime(4000);
    expect(toast.toasts.length).toBe(0);
  });
});
