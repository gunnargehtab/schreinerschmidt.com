// Theme picker: the key `ss-theme` is written only after a click; "Wie System" deletes it.
const K = 'ss-theme';
const root = document.documentElement;
const radios = document.querySelectorAll<HTMLInputElement>(`input[name="${K}"]`);

let saved: string | null = null;
try {
  saved = localStorage.getItem(K);
} catch {
  // Storage blocked: the picker still works for this page.
}
const start = saved === 'light' || saved === 'dark' ? saved : 'system';

const apply = (value: string) => {
  if (value === 'system') delete root.dataset['theme'];
  else root.dataset['theme'] = value;
  try {
    if (value === 'system') localStorage.removeItem(K);
    else localStorage.setItem(K, value);
  } catch {
    // Ignore: the choice applies to this page only.
  }
};

radios.forEach((radio) => {
  radio.checked = radio.value === start;
  radio.addEventListener('change', () => {
    const run = () => apply(radio.value);
    if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.startViewTransition(run);
    } else run();
  });
});
