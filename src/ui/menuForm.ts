import { onMounted, onBeforeUnmount, type Ref } from "vue";
import { isMenuDown, isMenuUp, pollGamepadBindings, virtualInputFor, virtualInputForBinding, type VirtualInput } from "@/game/VirtualController";

/** Native forms retain mouse/Tab support while using the game's mapped pad inputs. */
export function useMenuForm(root: Ref<HTMLElement | null>, back: () => void): void {
  let typing = false;
  let index = 0;
  let stop: (() => void) | undefined;
  const fields = () => [...(root.value?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled):not([type=file]), select:not(:disabled)") ?? [])].filter((element) => element.offsetParent !== null);
  const pointer = (event: Event) => {
    const element = event.target as HTMLElement;
    typing = element instanceof HTMLInputElement && element.type === "text";
    const i = fields().indexOf(element);
    if (i >= 0) index = i;
  };
  const input = (value: VirtualInput, event?: Event) => {
    const all = fields();
    const focused = document.activeElement as HTMLElement;
    const i = all.indexOf(focused);
    if (i >= 0) index = i;
    if (typing) {
      if (value === "b") { event?.preventDefault(); typing = false; focused.blur(); }
      return;
    }
    if (value === "b") { event?.preventDefault(); back(); return; }
    if (isMenuUp(value) || isMenuDown(value)) {
      event?.preventDefault();
      index = (index + (isMenuDown(value) ? 1 : -1) + all.length) % all.length;
      all[index]?.focus();
      return;
    }
    const field = all[index];
    if (!field) return;
    if (value === "a") {
      event?.preventDefault(); field.focus();
      if (field instanceof HTMLInputElement && field.type === "text") { typing = true; field.select(); }
      else if (field instanceof HTMLButtonElement || field instanceof HTMLInputElement && field.type === "checkbox") field.click();
    }
    if ((value === "left" || value === "right") && field instanceof HTMLSelectElement) {
      event?.preventDefault();
      field.selectedIndex = Math.max(0, Math.min(field.options.length - 1, field.selectedIndex + (value === "right" ? 1 : -1)));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };
  const key = (event: KeyboardEvent) => { const value = virtualInputFor(event); if (value) input(value, event); };
  onMounted(() => {
    window.addEventListener("keydown", key);
    root.value?.addEventListener("pointerdown", pointer);
    stop = pollGamepadBindings((binding) => { const value = virtualInputForBinding(binding); if (value) input(value); });
    fields()[0]?.focus();
  });
  onBeforeUnmount(() => {
    window.removeEventListener("keydown", key);
    root.value?.removeEventListener("pointerdown", pointer);
    stop?.();
  });
}
