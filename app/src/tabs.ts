// ARIA tablist wiring: roving tabindex, Left/Right wrap, Home/End, click/tap to select.
// Tabs need role="tab"; `onSelect` gets the index and shows the matching panel.
export function wireTablist(list: HTMLElement, onSelect: (i: number) => void, initial = 0) {
  const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
  const select = (i: number, focus = false) => {
    tabs.forEach((t, k) => {
      const on = k === i;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      t.classList.toggle("active", on);
    });
    if (focus) tabs[i].focus();
    onSelect(i);
  };
  tabs.forEach((t, k) => {
    t.addEventListener("click", () => select(k));
    t.addEventListener("keydown", (e) => {
      const n = tabs.length;
      const to = e.key === "ArrowRight" ? (k + 1) % n : e.key === "ArrowLeft" ? (k - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
      if (to < 0) return;
      e.preventDefault();
      select(to, true);
    });
  });
  select(initial);
  return select;
}
