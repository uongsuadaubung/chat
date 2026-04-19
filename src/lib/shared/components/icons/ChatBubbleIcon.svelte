<script lang="ts">
  interface Props {
    size?: string | number;
    class?: string;
  }
  let { size = 24, class: className = '' }: Props = $props();
</script>

<svg class={className} viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"></path>
</svg>
