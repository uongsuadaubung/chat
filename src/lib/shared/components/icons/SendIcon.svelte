<script lang="ts">
  interface Props {
    size?: string | number;
    class?: string;
  }
  let { size = 24, class: className = '' }: Props = $props();
</script>

<svg class={className} viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>
</svg>
