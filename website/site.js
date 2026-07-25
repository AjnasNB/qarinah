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

  const searchInput = document.querySelector('input[type="search"]');
  document.addEventListener("keydown", (event) => {
    if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) return;
    event.preventDefault();
    if (searchInput) {
      searchInput.focus();
    } else {
      window.location.assign("/search/");
    }
  });

  const searchForm = document.querySelector("[data-search-form]");
  const searchResults = document.querySelector("[data-search-results]");
  const searchStatus = document.querySelector("[data-search-status]");
  if (searchForm && searchInput && searchResults && searchStatus) {
    const normalize = (value) => value.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const query = new URLSearchParams(window.location.search).get("q")?.trim() || "";
    searchInput.value = query;

    const render = async () => {
      if (!query) return;
      searchStatus.textContent = `Searching Qarinah documentation for “${query}”…`;
      try {
        const response = await fetch("/search-index.json", { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`Search index returned ${response.status}.`);
        const index = await response.json();
        const normalizedQuery = normalize(query);
        const terms = [...new Set(normalizedQuery.split(/\s+/).filter((term) => term.length > 1))];
        const scored = index.map((entry) => {
          const title = normalize(entry.title || "");
          const description = normalize(entry.description || "");
          const keywords = normalize((entry.keywords || []).join(" "));
          const headings = normalize((entry.headings || []).map((heading) => heading.text).join(" "));
          const content = normalize(entry.content || "");
          let score = 0;
          if (title.includes(normalizedQuery)) score += 24;
          if (keywords.includes(normalizedQuery)) score += 18;
          if (headings.includes(normalizedQuery)) score += 14;
          if (description.includes(normalizedQuery)) score += 10;
          if (content.includes(normalizedQuery)) score += 6;
          for (const term of terms) {
            if (title.includes(term)) score += 8;
            if (keywords.includes(term)) score += 5;
            if (headings.includes(term)) score += 4;
            if (description.includes(term)) score += 3;
            if (content.includes(term)) score += 1;
          }
          const heading = (entry.headings || []).find((candidate) => {
            const value = normalize(candidate.text);
            return value.includes(normalizedQuery) || terms.every((term) => value.includes(term));
          });
          return { entry, score, heading };
        }).filter((item) => item.score > 0).sort((left, right) => right.score - left.score).slice(0, 12);

        searchResults.replaceChildren();
        searchStatus.textContent = scored.length === 0
          ? `No documentation matched “${query}”. Try a command, error code, host name, or shorter phrase.`
          : `${scored.length} result${scored.length === 1 ? "" : "s"} for “${query}”.`;

        for (const { entry, heading } of scored) {
          const article = document.createElement("article");
          article.className = "search-result";
          const link = document.createElement("a");
          link.href = `${entry.route}${heading ? `#${heading.id}` : ""}`;
          const title = document.createElement("h2");
          title.textContent = entry.title;
          const summary = document.createElement("p");
          summary.textContent = heading ? `${heading.text} - ${entry.description}` : entry.description;
          const route = document.createElement("span");
          route.textContent = link.href.replace(window.location.origin, "");
          link.append(title, summary, route);
          article.append(link);
          searchResults.append(article);
        }
      } catch (error) {
        searchStatus.textContent = "Documentation search is temporarily unavailable. Open the documentation index or GitHub source.";
        console.error(error);
      }
    };

    render();
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
