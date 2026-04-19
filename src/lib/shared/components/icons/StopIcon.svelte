<script lang="ts">
  let { size = 24, class: className = '' } = $props<{ size?: number; class?: string }>();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="currentColor"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  class={className}
>
  <rect x="6" y="6" width="12" height="12" rx="2" ry="2" />
</svg>
