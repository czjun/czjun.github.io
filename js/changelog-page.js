(function () {
  if (window.__anzhiyuChangelogLoaded) return;
  window.__anzhiyuChangelogLoaded = true;

  const PAGE_ID = "changelog-page";
  const CACHE_TTL = 15 * 60 * 1000;
  const REQUEST_TIMEOUT = 20000;
  const RETRY_DELAYS = [0, 1200];

  const toBoolean = (value) => String(value).toLowerCase() === "true";

  const formatDateTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || "-";
    return date.toLocaleString("zh-CN", { hour12: false });
  };

  const formatDay = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "未知日期";
    return date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
  };

  const isMergeCommit = (message) => /^Merge\b/i.test(message || "");

  const createEl = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (typeof text === "string") el.textContent = text;
    return el;
  };

  const setStatus = (root, message, level) => {
    const statusEl = root.querySelector("#changelog-status");
    if (!statusEl) return;
    statusEl.className = "changelog-status" + (level ? " " + level : "");
    statusEl.textContent = message;
  };

  const getCacheKey = (cfg) =>
    ["anzhiyu-changelog-v1", cfg.repo, cfg.branch, cfg.perPage, cfg.showMerge].join(":");

  const readCache = (cfg) => {
    try {
      const raw = localStorage.getItem(getCacheKey(cfg));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.items) || !parsed.savedAt) return null;
      if (Date.now() - parsed.savedAt > CACHE_TTL) return null;
      return parsed;
    } catch (err) {
      return null;
    }
  };

  const writeCache = (cfg, payload) => {
    try {
      localStorage.setItem(getCacheKey(cfg), JSON.stringify({ ...payload, savedAt: Date.now() }));
    } catch (err) {
      // ignore quota errors
    }
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const isAbortLikeError = (err) => {
    if (!err) return false;
    if (err.name === "AbortError") return true;
    const msg = String(err.message || err);
    return /aborted|abort/i.test(msg);
  };

  const normalizeFetchError = (err) => {
    if (isAbortLikeError(err)) {
      return new Error("请求 GitHub API 超时，请稍后重试。");
    }
    const msg = String((err && err.message) || err || "");
    if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(msg)) {
      return new Error("网络异常或请求被拦截，请检查是否可访问 api.github.com。");
    }
    return err instanceof Error ? err : new Error(msg || "未知错误");
  };

  const fetchJson = async (url) => {
    let lastError = null;

    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt += 1) {
      if (RETRY_DELAYS[attempt] > 0) {
        await sleep(RETRY_DELAYS[attempt]);
      }

      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const timeout = controller
        ? setTimeout(() => {
            try {
              controller.abort("timeout");
            } catch (err) {
              controller.abort();
            }
          }, REQUEST_TIMEOUT)
        : null;

      try {
        const response = await fetch(url, {
          headers: { Accept: "application/vnd.github+json" },
          cache: "no-store",
          signal: controller ? controller.signal : undefined,
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error("HTTP " + response.status + " " + text.slice(0, 120));
        }
        return response.json();
      } catch (err) {
        lastError = err;
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }

    throw normalizeFetchError(lastError);
  };

  const normalizeGitHubCommits = (rawItems, cfg) => {
    const items = Array.isArray(rawItems) ? rawItems : [];
    return items
      .map((item) => {
        const commitInfo = item && item.commit ? item.commit : {};
        const authorInfo = commitInfo.author || {};
        const message = (commitInfo.message || "").split("\n")[0].trim();
        return {
          sha: item.sha || "",
          shortSha: item.sha ? item.sha.slice(0, 7) : "",
          message,
          author: authorInfo.name || "unknown",
          date: authorInfo.date || "",
          url: item.html_url || "",
        };
      })
      .filter((item) => item.sha && item.message)
      .filter((item) => (cfg.showMerge ? true : !isMergeCommit(item.message)));
  };

  const groupByDay = (items) => {
    const map = new Map();
    items.forEach((item) => {
      const day = formatDay(item.date);
      if (!map.has(day)) map.set(day, []);
      map.get(day).push(item);
    });
    return Array.from(map.entries());
  };

  const renderTree = (root, items, sourceLabel) => {
    const treeEl = root.querySelector("#changelog-tree");
    if (!treeEl) return;
    treeEl.innerHTML = "";

    if (!items.length) {
      treeEl.textContent = "暂无提交记录。";
      return;
    }

    const groups = groupByDay(items);
    groups.forEach(([day, commits]) => {
      const dayBlock = createEl("section", "changelog-day");
      const dayTitle = createEl("h3", "changelog-day-title", day);
      dayBlock.appendChild(dayTitle);

      const list = createEl("ul", "changelog-list");
      commits.forEach((commit) => {
        const item = createEl("li", "changelog-item");
        item.appendChild(createEl("span", "changelog-dot"));

        const card = createEl("article", "changelog-card");
        const msg = createEl("a", "changelog-message", commit.message);
        msg.href = commit.url || "https://github.com/" + sourceLabel;
        msg.target = "_blank";
        msg.rel = "noopener";
        card.appendChild(msg);

        const meta = createEl("div", "changelog-meta");
        const hash = createEl("span", "changelog-hash", "#" + commit.shortSha);
        const author = createEl("span", "changelog-author", commit.author);
        const time = createEl("time", "changelog-time", formatDateTime(commit.date));
        meta.appendChild(hash);
        meta.appendChild(author);
        meta.appendChild(time);
        card.appendChild(meta);

        item.appendChild(card);
        list.appendChild(item);
      });

      dayBlock.appendChild(list);
      treeEl.appendChild(dayBlock);
    });
  };

  const loadFromGitHub = async (cfg) => {
    const [owner, repoName] = cfg.repo.split("/");
    if (!owner || !repoName) {
      throw new Error("仓库格式无效，应为 owner/repo");
    }
    const api =
      "https://api.github.com/repos/" +
      encodeURIComponent(owner) +
      "/" +
      encodeURIComponent(repoName) +
      "/commits?sha=" +
      encodeURIComponent(cfg.branch) +
      "&per_page=" +
      encodeURIComponent(cfg.perPage);
    const data = await fetchJson(api);
    const items = normalizeGitHubCommits(data, cfg);
    return { items, source: "GitHub API" };
  };

  const parseConfig = (root) => ({
    repo: root.getAttribute("data-repo") || "",
    branch: root.getAttribute("data-branch") || "main",
    perPage: Math.max(1, Math.min(100, Number(root.getAttribute("data-per-page") || 50) || 50)),
    showMerge: toBoolean(root.getAttribute("data-show-merge")),
  });

  const run = async (root, forceRefresh) => {
    const runId = String((Number(root.getAttribute("data-run-id") || "0") || 0) + 1);
    root.setAttribute("data-run-id", runId);

    const cfg = parseConfig(root);
    if (!cfg.repo) {
      setStatus(root, "未配置仓库，请在 _config.anzhiyu.yml 的 changelog.repo 填写 owner/repo。", "error");
      return;
    }

    if (!forceRefresh) {
      const cache = readCache(cfg);
      if (cache) {
        renderTree(root, cache.items, cfg.repo);
        setStatus(root, "已显示缓存数据，正在后台更新...", "info");
      } else {
        setStatus(root, "正在加载提交记录...", "info");
      }
    } else {
      setStatus(root, "正在刷新提交记录...", "info");
    }

    try {
      const result = await loadFromGitHub(cfg);
      if (root.getAttribute("data-run-id") !== runId) return;
      writeCache(cfg, result);
      renderTree(root, result.items, cfg.repo);
      setStatus(root, "加载完成，来源: " + result.source, "success");
    } catch (err) {
      if (root.getAttribute("data-run-id") !== runId) return;
      const friendlyError = normalizeFetchError(err);
      const cache = readCache(cfg);
      if (cache) {
        renderTree(root, cache.items, cfg.repo);
        setStatus(root, "GitHub 请求失败，已显示缓存数据。原因: " + friendlyError.message, "warn");
      } else {
        setStatus(root, "加载失败: " + friendlyError.message, "error");
      }
    }
  };

  const init = () => {
    const root = document.getElementById(PAGE_ID);
    if (!root) return;

    if (root.getAttribute("data-bound") !== "1") {
      const refreshBtn = root.querySelector("#changelog-refresh");
      if (refreshBtn) {
        refreshBtn.addEventListener("click", () => run(root, true));
      }
      root.setAttribute("data-bound", "1");
    }

    run(root, false);
  };

  window.renderChangelogPage = init;
  document.addEventListener("DOMContentLoaded", init);
  document.addEventListener("pjax:complete", init);
})();
