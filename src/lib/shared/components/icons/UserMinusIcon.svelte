<script lang="ts">
  let { size = '20', strokeWidth = 2 } = $props<{ size?: string | number; strokeWidth?: number }>();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <!-- Person silhouette -->
  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
  <circle cx="9" cy="7" r="4" />
  <!-- Minus sign -->
  <line x1="16" y1="11" x2="22" y2="11" />
</svg>
