(() => {
  const pickButtons = document.querySelectorAll("[data-pick-folder]");
  for (const button of pickButtons) {
    button.addEventListener("click", async () => {
      const targetInput = button.closest("form")?.querySelector("input[name='path']");
      if (!targetInput) return;

      const tauri = window.__TAURI__;
      if (tauri?.core?.invoke) {
        try {
          const selected = await tauri.core.invoke("pick_folder");
          if (selected) {
            targetInput.value = selected;
          }
          return;
        } catch (error) {
          console.warn("Tauri folder picker failed", error);
        }
      }

      targetInput.focus();
      targetInput.select();
    });
  }
})();
