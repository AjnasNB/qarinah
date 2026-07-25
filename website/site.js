(() => {
  const root = document.documentElement;
  const storedTheme = localStorage.getItem("qarinah-theme");
  if (storedTheme === "light" || storedTheme === "dark") {
    root.dataset.colorMode = storedTheme;
    root.dataset.lightTheme = storedTheme;
    root.dataset.darkTheme = storedTheme;
  }

  document.querySelector(".theme-toggle")?.addEventListener("click", () => {
    const dark = root.dataset.colorMode === "dark" ||
      (root.dataset.colorMode === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    const next = dark ? "light" : "dark";
    root.dataset.colorMode = next;
    root.dataset.lightTheme = next;
    root.dataset.darkTheme = next;
    localStorage.setItem("qarinah-theme", next);
  });

  const menu = document.querySelector(".mobile-menu");
  const nav = document.querySelector("#primary-nav");
  menu?.addEventListener("click", () => {
    const open = menu.getAttribute("aria-expanded") === "true";
    menu.setAttribute("aria-expanded", String(!open));
    nav?.classList.toggle("open", !open);
  });

  for (const button of document.querySelectorAll(".copy-button")) {
    button.addEventListener("click", async () => {
      const original = button.textContent;
      await navigator.clipboard.writeText(button.dataset.copy || "");
      button.textContent = "Copied";
      setTimeout(() => { button.textContent = original; }, 1400);
    });
  }

  const sections = [...document.querySelectorAll(".doc-content h2[id], .doc-content h3[id]")];
  const tocLinks = new Map([...document.querySelectorAll(".page-toc a")].map((link) => [link.getAttribute("href")?.slice(1), link]));
  if ("IntersectionObserver" in window && sections.length > 0) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const link of tocLinks.values()) link.classList.remove("active");
        tocLinks.get(entry.target.id)?.classList.add("active");
      }
    }, { rootMargin: "-18% 0px -70% 0px" });
    sections.forEach((section) => observer.observe(section));
  }
})();
