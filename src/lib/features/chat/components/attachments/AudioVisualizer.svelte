<script lang="ts">
  const NUM_BARS = 16;
  const BARS_ARRAY = Array.from({ length: NUM_BARS }, (_, i) => i);

  let { stream, isPaused = false }: { stream: MediaStream | null; isPaused?: boolean } = $props();

  let containerEl = $state<HTMLElement>();
  let audioContext: AudioContext;
  let animationId: number;

  $effect(() => {
    if (stream && containerEl) {
      audioContext = new (
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      )();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount; // 32
      const dataArray = new Uint8Array(bufferLength);

      const bars = Array.from(containerEl.querySelectorAll('.bar')) as HTMLElement[];

      const draw = () => {
        animationId = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);
        for (let i = 0; i < NUM_BARS; i++) {
          if (bars[i]) {
            const height = isPaused ? 10 : Math.max(10, (dataArray[i] / 255) * 100);
            bars[i].style.height = `${height}%`;
          }
        }
      };
      draw();

      return () => {
        cancelAnimationFrame(animationId);
        if (audioContext && audioContext.state !== 'closed') {
          audioContext.close();
        }
      };
    }
  });
</script>

<div class="visualizer" bind:this={containerEl}>
  {#each BARS_ARRAY as i (i)}
    <div class="bar"></div>
  {/each}
</div>

<style>
  .visualizer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    height: 24px;
    width: 60px;
    margin: 0 4px;
  }

  .bar {
    width: 3px;
    height: 10%;
    border-radius: 2px;
    background-color: var(--color-red-500);
    transition: height 0.05s ease-out;
  }
</style>
