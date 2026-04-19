<script lang="ts">
  export let size = 24;
  export let color = 'currentColor';
  let className = '';
  export { className as class };
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
  <rect x="6" y="4" width="4" height="16"></rect>
  <rect x="14" y="4" width="4" height="16"></rect>
</svg>
