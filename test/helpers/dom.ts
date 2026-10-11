/** Teks yang dibaca pengguna, tanpa salinan visual aria-hidden milik ikon/ticker. */
export function accessibleText(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  for (const fragment of copy.querySelectorAll('[aria-hidden="true"]')) fragment.remove();
  return copy.textContent?.trim() ?? "";
}
