<script lang="ts">
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import ImageIcon from '$lib/shared/components/icons/ImageIcon.svelte';
  import VideoIcon from '$lib/shared/components/icons/VideoIcon.svelte';
  import MicIcon from '$lib/shared/components/icons/MicIcon.svelte';
  import FileIcon from '$lib/shared/components/icons/FileIcon.svelte';

  interface Props {
    category: 'image' | 'video' | 'audio' | 'file';
    size?: number;
    showLabel?: boolean;
    customLabel?: string;
  }
  let { category, size = 14, showLabel = true, customLabel }: Props = $props();
</script>

<div class="file-category-icon">
  {#if category === 'image'}
    <ImageIcon {size} /> {showLabel ? customLabel || i18n.t('image') : ''}
  {:else if category === 'video'}
    <VideoIcon {size} /> {showLabel ? customLabel || i18n.t('video') : ''}
  {:else if category === 'audio'}
    <MicIcon {size} /> {showLabel ? customLabel || i18n.t('voiceMessage') : ''}
  {:else}
    <FileIcon {size} /> {showLabel ? customLabel || i18n.t('file') : ''}
  {/if}
</div>

<style>
  .file-category-icon {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
</style>
