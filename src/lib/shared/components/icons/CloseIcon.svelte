<script lang="ts">
  interface Props {
    size?: string | number;
    class?: string;
    strokeWidth?: string | number;
  }
  let { size = 20, class: className = '', strokeWidth = 2 }: Props = $props();
</script>

<svg
  class={className}
  viewBox="0 0 24 24"
  width={size}
  height={size}
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
>
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
</svg>
