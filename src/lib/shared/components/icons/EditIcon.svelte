<script lang="ts">
  interface Props {
    size?: string | number;
    class?: string;
  }
  let { size = 18, class: className = '' }: Props = $props();
</script>

<svg
  class={className}
  viewBox="0 0 24 24"
  width={size}
  height={size}
  fill="none"
  stroke="currentColor"
  stroke-width="2.5"
>
  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
</svg>
