<script lang="ts">
  import { i18n } from '$lib/features/i18n/i18n.store.svelte';
  import GlassButton from '$lib/shared/components/GlassButton.svelte';
  import LockIcon from '$lib/shared/components/icons/LockIcon.svelte';
  interface Props {
    onRetry: () => void;
  }
  let { onRetry }: Props = $props();
</script>

<div class="tab-blocked">
  <div class="blocked-card">
    <div class="icon"><LockIcon size="56" color="var(--accent-color)" /></div>
    <h2>{i18n.t('tabBlocked')}</h2>
    <p class="pre-line">{i18n.t('tabBlockedDesc')}</p>
    <GlassButton variant="round" size="lg" onclick={onRetry}>{i18n.t('retry')}</GlassButton>
  </div>
</div>

<style lang="scss">
  .tab-blocked {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    height: 100dvh;
    background: var(--bg-gradient);
  }

  .blocked-card {
    background: var(--glass-bg);
    -webkit-backdrop-filter: var(--glass-blur);
    backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    border-radius: 24px;
    padding: 3rem;
    text-align: center;
    box-shadow: var(--glass-shadow);
    max-width: 440px;
    width: calc(100% - 2rem);
    animation: slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1);

    .icon {
      font-size: 3.5rem;
      margin-bottom: 0.5rem;
      display: flex;
      justify-content: center;
    }

    h2 {
      color: var(--text-main);
      font-size: 1.5rem;
      font-weight: 700;
      margin: 0 0 0.8rem;
    }

    p {
      color: var(--text-muted);
      font-size: 1rem;
      line-height: 1.7;
      margin: 0 0 2rem;
    }

    .pre-line {
      white-space: pre-line;
    }
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
