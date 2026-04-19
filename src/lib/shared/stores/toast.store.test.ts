import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toast } from './toast.store.svelte';

describe('toast.store.svelte.ts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Clear out any existing toasts before each test
    // To do this simply, we'll manually remove current toasts or iterate and remove
    toast.toasts.forEach((t) => toast.remove(t.id));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize with an empty array', () => {
    expect(toast.toasts.length).toBe(0);
  });

  it('should add an info toast using info()', () => {
    toast.info('Test Info Message');
    expect(toast.toasts.length).toBe(1);
    expect(toast.toasts[0].message).toBe('Test Info Message');
    expect(toast.toasts[0].type).toBe('info');
    expect(toast.toasts[0].id).toBeDefined();
  });

  it('should add a success toast using success()', () => {
    toast.success('Test Success');
    expect(toast.toasts.length).toBe(1);
    expect(toast.toasts[0].type).toBe('success');
  });

  it('should add a warning toast using warning()', () => {
    toast.warning('Test Warning');
    expect(toast.toasts.length).toBe(1);
    expect(toast.toasts[0].type).toBe('warning');
  });

  it('should add an error toast using error()', () => {
    toast.error('Test Error');
    expect(toast.toasts.length).toBe(1);
    expect(toast.toasts[0].type).toBe('error');
  });

  it('should remove a toast by ID', () => {
    toast.show('To be removed', 'info', 0); // No timeout
    expect(toast.toasts.length).toBe(1);
    const id = toast.toasts[0].id;

    toast.remove(id);
    expect(toast.toasts.length).toBe(0);
  });

  it('should automatically remove toasts after durationMs', () => {
    toast.show('Auto remove', 'info', 2000);
    expect(toast.toasts.length).toBe(1);

    // Fast-forward 1000ms, should still be there
    vi.advanceTimersByTime(1000);
    expect(toast.toasts.length).toBe(1);

    // Fast-forward another 1000ms, should be gone
    vi.advanceTimersByTime(1000);
    expect(toast.toasts.length).toBe(0);
  });

  it('should not automatically remove if durationMs is 0', () => {
    toast.show('Sticky toast', 'info', 0);
    expect(toast.toasts.length).toBe(1);

    // Fast-forward long time
    vi.advanceTimersByTime(10000);
    expect(toast.toasts.length).toBe(1);
  });
});
