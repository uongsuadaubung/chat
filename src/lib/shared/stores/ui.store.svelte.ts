export interface PreviewMedia {
  type: 'image' | 'video';
  url: string;
  name?: string;
}

class UIStore {
  isSettingsModalOpen = $state(false);
  isNameModalOpen = $state(false);
  previewMedia = $state<PreviewMedia | null>(null);
}

export const uiState = new UIStore();
