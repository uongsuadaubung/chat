export function clickOutside(node: HTMLElement, callback: () => void) {
  const handleClick = (e: MouseEvent) => {
    if (node && !node.contains(e.target as Node)) {
      callback();
    }
  };

  // Use capture phase to ensure it runs before other handlers
  document.addEventListener('click', handleClick, true);

  return {
    destroy() {
      document.removeEventListener('click', handleClick, true);
    }
  };
}
