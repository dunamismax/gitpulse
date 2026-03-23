(() => {
  const pickButtons = document.querySelectorAll("[data-pick-folder]");
  for (const button of pickButtons) {
    button.addEventListener("click", () => {
      const targetInput = button.closest("form")?.querySelector("input[name='path']");
      if (!targetInput) return;

      targetInput.focus();
      targetInput.select();
    });
  }
})();
