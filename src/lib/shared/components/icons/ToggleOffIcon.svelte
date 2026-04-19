<script lang="ts">
  interface Props {
    size?: string | number;
    color?: string;
    class?: string;
  }
  let { size = 24, color = 'currentColor', class: className = '' }: Props = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke={color}
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  class={className}
>
  <rect width="20" height="14" x="2" y="5" rx="7" />
  <circle cx="8" cy="12" r="3" />
</svg>
