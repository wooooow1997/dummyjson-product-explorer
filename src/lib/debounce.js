/**
 * Trailing-edge debounce with a `cancel` escape hatch.
 * Used to keep search typing from firing a request per keystroke.
 */
export function debounce(fn, wait = 300) {
  let timer = null;

  const debounced = (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };

  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  /** Run the pending call immediately (used when the user presses Enter). */
  debounced.flush = (...args) => {
    debounced.cancel();
    fn(...args);
  };

  return debounced;
}
