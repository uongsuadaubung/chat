<script lang="ts">
  import { COLORS } from '$lib/features/webrtc/webrtc.constant';

  let {
    name = '',
    userId = '',
    color = '',
    size = 44
  } = $props<{
    name?: string;
    userId?: string;
    color?: string;
    size?: number | string;
  }>();

  function getColorForUser(id: string) {
    if (!id) return COLORS[0];
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
    return COLORS[Math.abs(hash) % COLORS.length];
  }

  let finalColor = $derived(color || getColorForUser(userId));
  let initial = $derived(name.substring(0, 2).toUpperCase() || '?');
  let fontSize = $derived(typeof size === 'number' ? size * 0.4 : 16);
</script>

<div
  class="user-avatar"
  style="--avatar-color: {finalColor}; --avatar-size: {typeof size === 'number'
    ? size + 'px'
    : size}; --font-size: {fontSize}px"
>
  {initial}
</div>

<style lang="scss">
  .user-avatar {
    width: var(--avatar-size);
    height: var(--avatar-size);
    border-radius: 50%;
    background: var(--avatar-color);
    color: var(--color-white);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: var(--font-size);
    box-shadow: var(--glass-shadow);
    flex-shrink: 0;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    user-select: none;
  }
</style>
