// script.js
// منطق الموقع بالكامل: الجلب، العرض، الفلاتر، المفضلة، صفحة الملف الشخصي، والداشبورد

import {
  actressesRef,
  actressRef,
  onValue,
  set,
  remove,
  runTransaction,
  createActressId,
} from "./firebase-init.js";

import { mountSiteChrome } from "./header-footer.js";

const DASHBOARD_PASSWORD = "admin1234";
const FAVORITES_KEY = "ae_favorite_ids";
const THEME_KEY = "ae_theme";
const PAGE_SIZE = 12;

const state = {
  hydrated: false,
  actresses: [],
  index: {
    query: "",
    nationality: "all",
    sort: "popular",
    page: 1,
    controlsBound: false,
  },
  profile: {
    id: null,
    activeTab: "bio",
    controlsBound: false,
  },
  dashboard: {
    accessGranted: false,
    controlsBound: false,
    editingId: null,
    formInitialized: false,
  },
  favorites: {
    controlsBound: false,
  },
};

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeAttr(value = "") {
  return escapeHTML(value).replaceAll("`", "&#96;");
}

function normalizeText(value = "") {
  return String(value).trim().toLowerCase();
}

function formatNumber(value = 0) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat("ar-EG").format(n);
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === "object") return Object.values(value).filter(Boolean);
  return [];
}

function createEmptyPersonalInfo() {
  return {
    nationality: "",
    birthdate: "",
    birthPlace: "",
    height: "",
    weight: "",
    eyeColor: "",
    hairColor: "",
    language: "",
    agency: "",
    instagram: "",
    website: "",
  };
}

function normalizeWorkItem(item) {
  if (typeof item === "string") {
    return {
      title: item,
      year: "",
      role: "",
      notes: "",
    };
  }

  return {
    title: item?.title || "",
    year: item?.year || "",
    role: item?.role || "",
    notes: item?.notes || "",
  };
}

function normalizeActress(raw, id) {
  const images = toArray(raw?.images).map((image) => String(image).trim()).filter(Boolean);
  const works = toArray(raw?.works).map(normalizeWorkItem).filter((work) => {
    return Boolean(work.title || work.year || work.role || work.notes);
  });

  const personalInfo = {
    ...createEmptyPersonalInfo(),
    ...(raw?.personalInfo && typeof raw.personalInfo === "object" ? raw.personalInfo : {}),
  };

  return {
    id,
    name: raw?.name || "",
    mainImage: raw?.mainImage || "",
    images,
    bio: raw?.bio || "",
    personalInfo,
    works,
    views: Number(raw?.views || 0),
    favorites: Number(raw?.favorites || 0),
    createdAt: Number(raw?.createdAt || Date.now()),
    updatedAt: Number(raw?.updatedAt || Date.now()),
  };
}

function getFavoriteIdSet() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveFavoriteIdSet(setValue) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(setValue)));
}

function isFavorite(id) {
  return getFavoriteIdSet().has(id);
}

function setPageStatus(page, message, kind = "info") {
  const selectors = {
    index: "[data-index-status]",
    profile: "[data-profile-status]",
    dashboard: "[data-dashboard-status]",
    favorites: "[data-favorites-status]",
  };

  const el = qs(selectors[page]);
  if (!el) return;
  el.textContent = message;
  el.dataset.kind = kind;
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  const toggle = qs("[data-theme-toggle]");
  if (toggle) {
    const isDark = theme === "dark";
    toggle.setAttribute("aria-pressed", String(isDark));
    toggle.textContent = isDark ? "Light mode" : "Dark mode";
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const initialTheme = saved === "dark" ? "dark" : "light";
  setTheme(initialTheme);
}

function bindHeaderActions() {
  const themeToggle = qs("[data-theme-toggle]");
  const demoLogin = qs("[data-demo-login]");

  if (themeToggle && !themeToggle.dataset.bound) {
    themeToggle.dataset.bound = "true";
    themeToggle.addEventListener("click", () => {
      const current = document.documentElement.dataset.theme || "light";
      setTheme(current === "dark" ? "light" : "dark");
    });
  }

  if (demoLogin && !demoLogin.dataset.bound) {
    demoLogin.dataset.bound = "true";
    demoLogin.addEventListener("click", () => {
      window.location.href = "dashboard.html";
    });
  }
}

function bindRealtimeListener() {
  onValue(actressesRef, (snapshot) => {
    const value = snapshot.val() || {};
    const next = Object.entries(value).map(([id, raw]) => normalizeActress(raw, id));

    next.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    state.actresses = next;
    state.hydrated = true;
    renderCurrentPage();
  });
}

function renderCurrentPage() {
  const page = document.body.dataset.page || "index";

  if (!state.hydrated) {
    setPageStatus(page, "جارٍ تحميل البيانات...", "info");
    return;
  }

  if (page === "index") {
    renderIndexPage();
  } else if (page === "profile") {
    renderProfilePage();
  } else if (page === "dashboard") {
    renderDashboardPage();
  } else if (page === "favorites") {
    renderFavoritesPage();
  }
}

function getCurrentProfileId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || "";
}

function launchConfetti(anchorEl) {
  const rect = anchorEl?.getBoundingClientRect?.() || {
    left: window.innerWidth / 2,
    top: window.innerHeight / 2,
    width: 0,
    height: 0,
  };

  const container = document.createElement("div");
  container.setAttribute("aria-hidden", "true");

  const glyphs = ["♥", "✦", "•", "✧"];

  for (let i = 0; i < 14; i++) {
    const piece = document.createElement("span");
    piece.textContent = glyphs[i % glyphs.length];
    piece.style.position = "fixed";
    piece.style.left = `${rect.left + rect.width / 2}px`;
    piece.style.top = `${rect.top + rect.height / 2}px`;
    piece.style.pointerEvents = "none";
    piece.style.zIndex = "9999";
    piece.style.fontSize = "18px";
    piece.style.transform = "translate(0, 0)";
    piece.style.opacity = "1";
    piece.style.transition = "transform 700ms ease, opacity 700ms ease";
    piece.style.setProperty("--dx", `${(Math.random() - 0.5) * 220}px`);
    piece.style.setProperty("--dy", `${-90 - Math.random() * 110}px`);
    container.appendChild(piece);

    requestAnimationFrame(() => {
      piece.style.transform = `translate(var(--dx), var(--dy)) rotate(${Math.random() * 240}deg)`;
      piece.style.opacity = "0";
    });

    setTimeout(() => piece.remove(), 800);
  }

  document.body.appendChild(container);
  setTimeout(() => container.remove(), 900);
}

async function toggleFavorite(id, triggerEl) {
  const setValue = getFavoriteIdSet();
  const currentlyFavorite = setValue.has(id);

  try {
    await runTransaction(actressRef(id), (current) => {
      if (!current) return current;
      const normalized = normalizeActress(current, id);
      const nextCount = Math.max(0, Number(normalized.favorites || 0) + (currentlyFavorite ? -1 : 1));
      return {
        ...current,
        favorites: nextCount,
        updatedAt: Date.now(),
      };
    });

    if (currentlyFavorite) {
      setValue.delete(id);
    } else {
      setValue.add(id);
    }

    saveFavoriteIdSet(setValue);
    launchConfetti(triggerEl || document.body);
    renderCurrentPage();
  } catch (error) {
    console.error(error);
    setPageStatus("dashboard", "حدث خطأ أثناء تحديث المفضلة.", "error");
    setPageStatus("index", "حدث خطأ أثناء تحديث المفضلة.", "error");
    setPageStatus("profile", "حدث خطأ أثناء تحديث المفضلة.", "error");
    setPageStatus("favorites", "حدث خطأ أثناء تحديث المفضلة.", "error");
  }
}

async function incrementViewOnce(id) {
  const sessionKey = `ae_viewed_${id}`;
  if (sessionStorage.getItem(sessionKey) === "1") return;

  sessionStorage.setItem(sessionKey, "1");

  try {
    await runTransaction(actressRef(id), (current) => {
      if (!current) return current;
      const normalized = normalizeActress(current, id);
      return {
        ...current,
        views: Number(normalized.views || 0) + 1,
        updatedAt: Date.now(),
      };
    });
  } catch (error) {
    console.error(error);
  }
}

function buildActressCard(actress, options = {}) {
  const favorite = isFavorite(actress.id);
  const label = favorite ? "إزالة من المفضلة" : "إضافة للمفضلة";
  const url = `profile.html?id=${encodeURIComponent(actress.id)}`;

  return `
    <article class="actress-card" data-actress-id="${safeAttr(actress.id)}">
      <a class="actress-card__link" href="${url}">
        ${
          actress.mainImage
            ? `<img class="actress-card__image" src="${safeAttr(actress.mainImage)}" alt="${escapeHTML(actress.name)}" loading="lazy" />`
            : `<div class="actress-card__image" data-empty-image="true">لا توجد صورة</div>`
        }
        <div class="actress-card__body">
          <h3 class="actress-card__name">${escapeHTML(actress.name || "بدون اسم")}</h3>
          <div class="actress-card__meta">
            <div class="actress-card__meta-item">
              <span class="actress-card__meta-label">Views</span>
              <strong class="actress-card__meta-value" data-view-count>${formatNumber(actress.views)}</strong>
            </div>
            <div class="actress-card__meta-item">
              <span class="actress-card__meta-label">Favorites</span>
              <strong class="actress-card__meta-value" data-favorite-count>${formatNumber(actress.favorites)}</strong>
            </div>
          </div>
        </div>
      </a>

      <button
        class="actress-card__favorite${favorite ? " actress-card__favorite--active" : ""}"
        type="button"
        data-favorite-toggle
        data-actress-id="${safeAttr(actress.id)}"
        aria-pressed="${favorite ? "true" : "false"}"
      >
        ${label}
      </button>
    </article>
  `;
}

function applyIndexFilters() {
  let items = [...state.actresses];

  const search = normalizeText(state.index.query);
  const nationality = normalizeText(state.index.nationality);

  if (search) {
    items = items.filter((actress) => {
      const haystack = [
        actress.name,
        actress.bio,
        actress.personalInfo?.nationality,
        actress.personalInfo?.agency,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });
  }

  if (nationality && nationality !== "all") {
    items = items.filter((actress) => normalizeText(actress.personalInfo?.nationality) === nationality);
  }

  switch (state.index.sort) {
    case "views":
      items.sort((a, b) => (b.views - a.views) || (b.favorites - a.favorites) || (b.createdAt - a.createdAt));
      break;
    case "favorites":
      items.sort((a, b) => (b.favorites - a.favorites) || (b.views - a.views) || (b.createdAt - a.createdAt));
      break;
    case "newest":
      items.sort((a, b) => (b.createdAt - a.createdAt) || (b.views - a.views));
      break;
    case "oldest":
      items.sort((a, b) => (a.createdAt - b.createdAt) || (b.views - a.views));
      break;
    case "popular":
    default:
      items.sort((a, b) => (b.favorites - a.favorites) || (b.views - a.views) || (b.createdAt - a.createdAt));
      break;
  }

  return items;
}

function populateNationalityFilter() {
  const select = qs("[data-page-nationality-filter]");
  if (!select) return;

  const current = state.index.nationality || select.value || "all";
  const nationalities = Array.from(
    new Set(
      state.actresses
        .map((actress) => String(actress.personalInfo?.nationality || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "ar"));

  const options = [
    `<option value="all">الكل</option>`,
    ...nationalities.map((item) => `<option value="${safeAttr(item)}">${escapeHTML(item)}</option>`),
  ];

  select.innerHTML = options.join("");

  if ([...select.options].some((option) => option.value === current)) {
    select.value = current;
  } else {
    select.value = "all";
  }

  state.index.nationality = select.value;
}

function renderIndexPage() {
  const grid = qs("[data-actresses-grid]");
  const pagination = qs("[data-pagination]");
  const summary = qs("[data-index-summary]");

  if (!grid || !pagination || !summary) return;

  populateNationalityFilter();

  const results = applyIndexFilters();
  const total = results.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  state.index.page = Math.min(state.index.page, totalPages);

  const start = (state.index.page - 1) * PAGE_SIZE;
  const pageItems = results.slice(start, start + PAGE_SIZE);

  summary.textContent = `${formatNumber(total)} نتيجة`;

  if (total === 0) {
    grid.innerHTML = `<p class="is-empty">لا توجد نتائج مطابقة.</p>`;
    pagination.innerHTML = "";
    setPageStatus("index", "لا توجد نتائج مطابقة.", "info");
    return;
  }

  grid.innerHTML = pageItems.map((actress) => buildActressCard(actress)).join("");

  pagination.innerHTML = `
    <button type="button" data-page-nav="prev" ${state.index.page === 1 ? "disabled" : ""}>السابق</button>
    <span>صفحة ${formatNumber(state.index.page)} من ${formatNumber(totalPages)}</span>
    <button type="button" data-page-nav="next" ${state.index.page === totalPages ? "disabled" : ""}>التالي</button>
  `;

  setPageStatus("index", `تم عرض ${formatNumber(pageItems.length)} من ${formatNumber(total)} عنصر.`, "info");
}

function bindIndexControls() {
  if (state.index.controlsBound) return;

  const searchInput = qs("[data-page-search-input]");
  const nationalityFilter = qs("[data-page-nationality-filter]");
  const sortSelect = qs("[data-page-sort]");
  const grid = qs("[data-actresses-grid]");
  const pagination = qs("[data-pagination]");

  const params = new URLSearchParams(window.location.search);
  const q = params.get("q") || "";

  state.index.query = q;
  if (searchInput) searchInput.value = q;

  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      state.index.query = event.target.value || "";
      state.index.page = 1;
      renderIndexPage();
    });
  }

  if (nationalityFilter) {
    nationalityFilter.addEventListener("change", (event) => {
      state.index.nationality = event.target.value || "all";
      state.index.page = 1;
      renderIndexPage();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", (event) => {
      state.index.sort = event.target.value || "popular";
      state.index.page = 1;
      renderIndexPage();
    });
  }

  if (pagination) {
    pagination.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page-nav]");
      if (!button || button.disabled) return;

      const direction = button.dataset.pageNav;
      const results = applyIndexFilters();
      const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));

      if (direction === "prev") state.index.page = Math.max(1, state.index.page - 1);
      if (direction === "next") state.index.page = Math.min(totalPages, state.index.page + 1);

      renderIndexPage();
    });
  }

  if (grid) {
    grid.addEventListener("click", async (event) => {
      const favoriteButton = event.target.closest("[data-favorite-toggle]");
      if (favoriteButton) {
        event.preventDefault();
        event.stopPropagation();
        await toggleFavorite(favoriteButton.dataset.actressId, favoriteButton);
      }
    });
  }

  state.index.controlsBound = true;
}

function renderProfilePage() {
  const profileId = state.profile.id || getCurrentProfileId();
  const hero = qs("[data-profile-hero]");
  const bioPanel = qs('[data-tab-panel="bio"]');
  const galleryPanel = qs('[data-tab-panel="gallery"]');
  const filmographyPanel = qs('[data-tab-panel="filmography"]');
  const personalPanel = qs('[data-tab-panel="personal"]');

  if (!hero || !bioPanel || !galleryPanel || !filmographyPanel || !personalPanel) return;

  if (!profileId) {
    hero.innerHTML = `<p class="is-empty">لم يتم تحديد الممثلة.</p>`;
    bioPanel.innerHTML = "";
    galleryPanel.innerHTML = "";
    filmographyPanel.innerHTML = "";
    personalPanel.innerHTML = "";
    setPageStatus("profile", "لم يتم تحديد المعرف.", "error");
    return;
  }

  const actress = state.actresses.find((item) => item.id === profileId);

  if (!actress) {
    hero.innerHTML = `<p class="is-empty">جاري تحميل الملف أو أن الممثلة غير موجودة.</p>`;
    bioPanel.innerHTML = `<p class="is-empty">لا توجد بيانات بعد.</p>`;
    galleryPanel.innerHTML = `<p class="is-empty">لا توجد صور بعد.</p>`;
    filmographyPanel.innerHTML = `<p class="is-empty">لا توجد أعمال بعد.</p>`;
    personalPanel.innerHTML = `<p class="is-empty">لا توجد معلومات بعد.</p>`;
    setPageStatus("profile", "الممثلة غير موجودة أو لم تُحمَّل بعد.", "error");
    return;
  }

  incrementViewOnce(actress.id);

  const favorite = isFavorite(actress.id);
  const galleryImages = Array.from(new Set([actress.mainImage, ...actress.images].filter(Boolean)));

  hero.innerHTML = `
    <article class="profile-page__hero-card" data-profile-id="${safeAttr(actress.id)}">
      <div class="profile-page__hero-media">
        ${
          actress.mainImage
            ? `<img class="profile-page__hero-image" src="${safeAttr(actress.mainImage)}" alt="${escapeHTML(actress.name)}" loading="lazy" />`
            : `<div class="profile-page__hero-image" data-empty-image="true">لا توجد صورة</div>`
        }
      </div>

      <div class="profile-page__hero-content">
        <p class="profile-page__hero-subtitle">Actress profile</p>
        <h1 class="profile-page__hero-title" id="profile-title">${escapeHTML(actress.name || "بدون اسم")}</h1>
        <div class="profile-page__hero-meta">
          <span>Views: <strong data-view-count>${formatNumber(actress.views)}</strong></span>
          <span>Favorites: <strong data-favorite-count>${formatNumber(actress.favorites)}</strong></span>
          <span>Nationality: <strong>${escapeHTML(actress.personalInfo?.nationality || "—")}</strong></span>
        </div>

        <div class="profile-page__hero-actions">
          <button
            class="profile-page__hero-favorite${favorite ? " profile-page__hero-favorite--active" : ""}"
            type="button"
            data-profile-favorite
            data-actress-id="${safeAttr(actress.id)}"
            aria-pressed="${favorite ? "true" : "false"}"
          >
            ${favorite ? "إزالة من المفضلة" : "أضف للمفضلة"}
          </button>
        </div>
      </div>
    </article>
  `;

  bioPanel.innerHTML = `
    <h2 class="profile-page__panel-title">نبذة شخصية</h2>
    <p class="profile-page__panel-content">${escapeHTML(actress.bio || "لا توجد نبذة بعد.")}</p>
  `;

  galleryPanel.innerHTML = galleryImages.length
    ? `
      <h2 class="profile-page__panel-title">معرض الصور</h2>
      <div class="profile-gallery">
        ${galleryImages
          .map(
            (image, index) => `
              <figure class="profile-gallery__item" data-gallery-index="${index}">
                <img class="profile-gallery__image" src="${safeAttr(image)}" alt="${escapeHTML(actress.name)} - صورة ${index + 1}" loading="lazy" />
              </figure>
            `
          )
          .join("")}
      </div>
    `
    : `<p class="is-empty">لا توجد صور إضافية.</p>`;

  ensureGalleryViewer();

  const galleryPanelEl = qs('[data-tab-panel="gallery"]');
  if (galleryPanelEl && !galleryPanelEl.dataset.bound) {
    galleryPanelEl.dataset.bound = "true";

    galleryPanelEl.addEventListener("click", (event) => {
      const img = event.target.closest(".profile-gallery__image");
      if (!img) return;

      openGalleryViewer(img.src, img.alt || "صورة");
    });
  }

  filmographyPanel.innerHTML = actress.works.length
    ? `
      <h2 class="profile-page__panel-title">الأعمال الفنية</h2>
      <div class="profile-filmography">
        ${actress.works
          .map(
            (work, index) => `
              <article class="profile-filmography__item" data-work-index="${index}">
                <h3 class="profile-filmography__title">${escapeHTML(work.title || "بدون عنوان")}</h3>
                <p class="profile-filmography__details">
                  ${work.year ? `السنة: ${escapeHTML(work.year)}` : ""}
                  ${work.year && work.role ? " | " : ""}
                  ${work.role ? `الدور: ${escapeHTML(work.role)}` : ""}
                </p>
                ${work.notes ? `<p class="profile-filmography__details" style="margin-top: 0.5rem;">${escapeHTML(work.notes)}</p>` : ""}
              </article>
            `
          )
          .join("")}
      </div>
    `
    : `<p class="is-empty">لا توجد أعمال مسجلة بعد.</p>`;

  const infoEntries = [
    ["الجنسية", actress.personalInfo?.nationality],
    ["تاريخ الميلاد", actress.personalInfo?.birthdate ? formatDate(actress.personalInfo.birthdate) : ""],
    ["مكان الميلاد", actress.personalInfo?.birthPlace],
    ["الطول", actress.personalInfo?.height],
    ["الوزن", actress.personalInfo?.weight],
    ["لون العين", actress.personalInfo?.eyeColor],
    ["لون الشعر", actress.personalInfo?.hairColor],
    ["اللغة", actress.personalInfo?.language],
    ["الوكالة", actress.personalInfo?.agency],
    ["انستجرام", actress.personalInfo?.instagram],
    ["الموقع الرسمي", actress.personalInfo?.website],
  ].filter(([, value]) => Boolean(String(value || "").trim()));

  personalPanel.innerHTML = infoEntries.length
    ? `
      <h2 class="profile-page__panel-title">المعلومات الشخصية</h2>
      <div class="profile-info">
        ${infoEntries
          .map(
            ([label, value], index) => {
              let displayValue = escapeHTML(value);

              // تحويل روابط انستجرام والمواقع لروابط قابلة للنقر مع أيقونة معاينة بصرية
              if (label === "انستجرام" && value) {
                const url = value.startsWith('http') ? value : `https://instagram.com/${value.replace('@', '')}`;
                const handle = value.split('/').filter(Boolean).pop().replace('@', '');
                displayValue = `
                  <a href="${safeAttr(url)}" target="_blank" rel="noopener noreferrer" class="profile-info__link">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
                    @${escapeHTML(handle)}
                  </a>`;
              } else if (label === "الموقع الرسمي" && value) {
                const url = value.startsWith('http') ? value : `https://${value}`;
                displayValue = `
                  <a href="${safeAttr(url)}" target="_blank" rel="noopener noreferrer" class="profile-info__link">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                    زيارة الموقع
                  </a>`;
              }

              return `
                <div class="profile-info__card" data-info-index="${index}">
                  <span class="profile-info__label">${escapeHTML(label)}</span>
                  <span class="profile-info__value">${displayValue}</span>
                </div>
              `;
            }
          )
          .join("")}
      </div>
    `
    : `<p class="is-empty">لا توجد معلومات شخصية بعد.</p>`;

  setPageStatus("profile", `تم تحميل ملف ${actress.name}.`, "info");
}

function bindProfileControls() {
  if (state.profile.controlsBound) return;

  const tabs = qs("[data-profile-hero]")?.closest("main") || document;
  const tabButtons = qsa("[data-tab-button]");
  const profileRoot = qs(".profile-page");

  if (profileRoot) {
    profileRoot.addEventListener("click", async (event) => {
      const favoriteButton = event.target.closest("[data-profile-favorite]");
      if (favoriteButton) {
        await toggleFavorite(favoriteButton.dataset.actressId, favoriteButton);
        return;
      }

      const tabButton = event.target.closest("[data-tab-button]");
      if (tabButton) {
        state.profile.activeTab = tabButton.dataset.tabButton || "bio";
        updateProfileTabs();
      }
    });
  }

  if (tabButtons.length) {
    state.profile.activeTab = "bio";
    updateProfileTabs();
  }

  state.profile.controlsBound = true;
}

function updateProfileTabs() {
  const buttons = qsa("[data-tab-button]");
  const panels = qsa("[data-tab-panel]");
  const active = state.profile.activeTab || "bio";

  buttons.forEach((button) => {
    const isActive = button.dataset.tabButton === active;
    button.setAttribute("aria-selected", String(isActive));
    button.dataset.active = String(isActive);
  });

  panels.forEach((panel) => {
    const isActive = panel.dataset.tabPanel === active;
    panel.hidden = !isActive;
    panel.setAttribute("aria-hidden", String(!isActive));
  });
}

function ensureDashboardAccess() {
  if (state.dashboard.accessGranted) return true;

  const entered = prompt("أدخل كلمة مرور الداشبورد:");
  if (entered === DASHBOARD_PASSWORD) {
    state.dashboard.accessGranted = true;
    return true;
  }

  alert("كلمة المرور غير صحيحة.");
  window.location.href = "index.html";
  return false;
}

function buildImageField(value = "") {
  return `
    <div class="dashboard-dynamic-list__item" data-image-item style="display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem;">
      <input class="dashboard-form__input" type="url" data-image-url value="${safeAttr(value)}" placeholder="رابط الصورة..." style="flex: 1;" />
      <button class="dashboard-table__button" type="button" data-remove-image-field>حذف</button>
    </div>
  `;
}

function buildWorkField(work = {}) {
  return `
    <div class="dashboard-dynamic-list__item" data-work-item style="background: var(--c-input-bg); padding: 1.5rem; border-radius: var(--radius-card); margin-bottom: 1rem; border: 1px solid var(--c-border);">
      <div class="dashboard-form__field">
        <label class="dashboard-form__label">عنوان العمل</label>
        <input class="dashboard-form__input" type="text" data-work-title value="${safeAttr(work.title || "")}" />
      </div>
      <div class="dashboard-form__field">
        <label class="dashboard-form__label">السنة</label>
        <input class="dashboard-form__input" type="text" data-work-year value="${safeAttr(work.year || "")}" />
      </div>
      <div class="dashboard-form__field">
        <label class="dashboard-form__label">الدور</label>
        <input class="dashboard-form__input" type="text" data-work-role value="${safeAttr(work.role || "")}" />
      </div>
      <div class="dashboard-form__field">
        <label class="dashboard-form__label">ملاحظات</label>
        <textarea class="dashboard-form__textarea" rows="2" data-work-notes>${escapeHTML(work.notes || "")}</textarea>
      </div>
      <button class="dashboard-table__button" type="button" data-remove-work-field>حذف هذا العمل</button>
    </div>
  `;
}

function ensureDashboardForm() {
  if (state.dashboard.formInitialized) return;

  const imageList = qs("[data-image-list]");
  const workList = qs("[data-work-list]");
  const form = qs("[data-actress-form]");

  if (!imageList || !workList || !form) return;

  imageList.innerHTML = buildImageField("");
  workList.innerHTML = buildWorkField({});

  form.addEventListener("click", (event) => {
    if (event.target.matches("[data-add-image-field]")) {
      event.preventDefault();
      imageList.insertAdjacentHTML("beforeend", buildImageField(""));
      return;
    }

    if (event.target.matches("[data-add-work-field]")) {
      event.preventDefault();
      workList.insertAdjacentHTML("beforeend", buildWorkField({}));
      return;
    }

    if (event.target.matches("[data-remove-image-field]")) {
      event.preventDefault();
      const item = event.target.closest("[data-image-item]");
      if (item) item.remove();
      if (!imageList.querySelector("[data-image-item]")) {
        imageList.innerHTML = buildImageField("");
      }
      return;
    }

    if (event.target.matches("[data-remove-work-field]")) {
      event.preventDefault();
      const item = event.target.closest("[data-work-item]");
      if (item) item.remove();
      if (!workList.querySelector("[data-work-item]")) {
        workList.innerHTML = buildWorkField({});
      }
      return;
    }

    if (event.target.matches("[data-reset-form]")) {
      event.preventDefault();
      resetDashboardForm();
    }
  });

  form.addEventListener("submit", handleDashboardSubmit);

  state.dashboard.formInitialized = true;
}

function resetDashboardForm() {
  const form = qs("[data-actress-form]");
  const imageList = qs("[data-image-list]");
  const workList = qs("[data-work-list]");
  const editingId = qs("[data-editing-id]");

  if (!form || !imageList || !workList || !editingId) return;

  form.reset();
  editingId.value = "";
  state.dashboard.editingId = null;
  imageList.innerHTML = buildImageField("");
  workList.innerHTML = buildWorkField({});
  setPageStatus("dashboard", "تمت إعادة ضبط النموذج.", "info");
}

function fillDashboardForm(actress) {
  const form = qs("[data-actress-form]");
  const editingId = qs("[data-editing-id]");
  const imageList = qs("[data-image-list]");
  const workList = qs("[data-work-list]");

  if (!form || !editingId || !imageList || !workList) return;

  state.dashboard.editingId = actress.id;
  editingId.value = actress.id;

  form.elements.name.value = actress.name || "";
  form.elements.mainImage.value = actress.mainImage || "";
  form.elements.bio.value = actress.bio || "";
  form.elements.nationality.value = actress.personalInfo?.nationality || "";
  form.elements.birthdate.value = actress.personalInfo?.birthdate || "";
  form.elements.birthPlace.value = actress.personalInfo?.birthPlace || "";
  form.elements.height.value = actress.personalInfo?.height || "";
  form.elements.weight.value = actress.personalInfo?.weight || "";
  form.elements.eyeColor.value = actress.personalInfo?.eyeColor || "";
  form.elements.hairColor.value = actress.personalInfo?.hairColor || "";
  form.elements.language.value = actress.personalInfo?.language || "";
  form.elements.agency.value = actress.personalInfo?.agency || "";
  form.elements.instagram.value = actress.personalInfo?.instagram || "";
  form.elements.website.value = actress.personalInfo?.website || "";

  imageList.innerHTML = (actress.images.length ? actress.images : [""]).map((url) => buildImageField(url)).join("");
  workList.innerHTML = (actress.works.length ? actress.works : [{}]).map((work) => buildWorkField(work)).join("");

  setPageStatus("dashboard", `جاري تعديل: ${actress.name}`, "info");
}

function collectDashboardFormData() {
  const form = qs("[data-actress-form]");
  const editingId = qs("[data-editing-id]");

  if (!form || !editingId) {
    throw new Error("نموذج الداشبورد غير موجود.");
  }

  const name = String(form.elements.name.value || "").trim();
  const mainImage = String(form.elements.mainImage.value || "").trim();
  const bio = String(form.elements.bio.value || "").trim();

  const personalInfo = {
    nationality: String(form.elements.nationality.value || "").trim(),
    birthdate: String(form.elements.birthdate.value || "").trim(),
    birthPlace: String(form.elements.birthPlace.value || "").trim(),
    height: String(form.elements.height.value || "").trim(),
    weight: String(form.elements.weight.value || "").trim(),
    eyeColor: String(form.elements.eyeColor.value || "").trim(),
    hairColor: String(form.elements.hairColor.value || "").trim(),
    language: String(form.elements.language.value || "").trim(),
    agency: String(form.elements.agency.value || "").trim(),
    instagram: String(form.elements.instagram.value || "").trim(),
    website: String(form.elements.website.value || "").trim(),
  };

  const images = qsa("[data-image-item] [data-image-url]")
    .map((input) => String(input.value || "").trim())
    .filter(Boolean);

  const works = qsa("[data-work-item]").map((item) => ({
    title: String(qs("[data-work-title]", item)?.value || "").trim(),
    year: String(qs("[data-work-year]", item)?.value || "").trim(),
    role: String(qs("[data-work-role]", item)?.value || "").trim(),
    notes: String(qs("[data-work-notes]", item)?.value || "").trim(),
  })).filter((work) => Boolean(work.title || work.year || work.role || work.notes));

  return {
    id: String(editingId.value || "").trim(),
    name,
    mainImage,
    bio,
    personalInfo,
    images,
    works,
  };
}

async function handleDashboardSubmit(event) {
  event.preventDefault();

  try {
    const form = qs("[data-actress-form]");
    if (!form) return;

    const payload = collectDashboardFormData();
    if (!payload.name) throw new Error("الاسم مطلوب.");
    if (!payload.mainImage) throw new Error("رابط الصورة الرئيسية مطلوب.");

    const existing = payload.id ? state.actresses.find((item) => item.id === payload.id) : null;
    const id = payload.id || createActressId();

    const record = {
      id,
      name: payload.name,
      mainImage: payload.mainImage,
      images: payload.images,
      bio: payload.bio,
      personalInfo: payload.personalInfo,
      works: payload.works,
      views: existing?.views ?? 0,
      favorites: existing?.favorites ?? 0,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };

    await set(actressRef(id), record);
    state.dashboard.editingId = id;

    setPageStatus("dashboard", "تم حفظ البيانات بنجاح.", "success");
    resetDashboardForm();
  } catch (error) {
    console.error(error);
    setPageStatus("dashboard", error.message || "حدث خطأ أثناء الحفظ.", "error");
  }
}

function renderDashboardStats() {
  const host = qs("[data-dashboard-stats]");
  if (!host) return;

  const totalActresses = state.actresses.length;
  const totalViews = state.actresses.reduce((sum, item) => sum + Number(item.views || 0), 0);
  const totalFavorites = state.actresses.reduce((sum, item) => sum + Number(item.favorites || 0), 0);

  host.innerHTML = `
    <div class="dashboard-page__stat">
      <span class="dashboard-page__stat-label">إجمالي الممثلات</span>
      <strong class="dashboard-page__stat-value">${formatNumber(totalActresses)}</strong>
    </div>
    <div class="dashboard-page__stat">
      <span class="dashboard-page__stat-label">إجمالي المشاهدات</span>
      <strong class="dashboard-page__stat-value">${formatNumber(totalViews)}</strong>
    </div>
    <div class="dashboard-page__stat">
      <span class="dashboard-page__stat-label">إجمالي المفضلة</span>
      <strong class="dashboard-page__stat-value">${formatNumber(totalFavorites)}</strong>
    </div>
  `;
}

function renderDashboardTable() {
  const body = qs("[data-actresses-table-body]");
  if (!body) return;

  const rows = [...state.actresses].sort((a, b) => (b.createdAt - a.createdAt) || a.name.localeCompare(b.name, "ar"));

  if (!rows.length) {
    body.innerHTML = `
      <tr>
        <td colspan="4" class="is-empty">لا توجد بيانات بعد.</td>
      </tr>
    `;
    return;
  }

  body.innerHTML = rows
    .map(
      (actress) => `
        <tr class="dashboard-table__row" data-actress-id="${safeAttr(actress.id)}">
          <td class="dashboard-table__cell">${escapeHTML(actress.name)}</td>
          <td class="dashboard-table__cell" data-view-count>${formatNumber(actress.views)}</td>
          <td class="dashboard-table__cell" data-favorite-count>${formatNumber(actress.favorites)}</td>
          <td class="dashboard-table__cell">
            <div class="dashboard-table__actions" style="display: flex; gap: 0.5rem; justify-content: flex-end;">
              <button type="button" class="dashboard-table__button" data-edit-actress-id="${safeAttr(actress.id)}">تعديل</button>
              <button type="button" class="dashboard-table__button" data-delete-actress-id="${safeAttr(actress.id)}" style="color: #ef4444; border-color: #ef4444;">حذف</button>
            </div>
          </td>
        </tr>
      `
    )
    .join("");
}

function bindDashboardTableActions() {
  const body = qs("[data-actresses-table-body]");
  if (!body || body.dataset.bound === "true") return;

  body.dataset.bound = "true";

  body.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-actress-id]");
    const deleteButton = event.target.closest("[data-delete-actress-id]");

    if (editButton) {
      const actress = state.actresses.find((item) => item.id === editButton.dataset.editActressId);
      if (actress) {
        fillDashboardForm(actress);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }

    if (deleteButton) {
      const id = deleteButton.dataset.deleteActressId;
      const actress = state.actresses.find((item) => item.id === id);
      const confirmed = confirm(`هل تريد حذف ${actress?.name || "هذه الممثلة"}؟`);
      if (!confirmed) return;

      try {
        await remove(actressRef(id));

        const favorites = getFavoriteIdSet();
        if (favorites.has(id)) {
          favorites.delete(id);
          saveFavoriteIdSet(favorites);
        }

        if (state.dashboard.editingId === id) {
          resetDashboardForm();
        }

        setPageStatus("dashboard", "تم حذف السجل بنجاح.", "success");
      } catch (error) {
        console.error(error);
        setPageStatus("dashboard", "حدث خطأ أثناء الحذف.", "error");
      }
    }
  });
}

function renderDashboardPage() {
  if (!state.dashboard.accessGranted) {
    if (!ensureDashboardAccess()) return;
  }

  ensureDashboardForm();
  renderDashboardStats();
  renderDashboardTable();
  bindDashboardTableActions();
  setPageStatus("dashboard", "الداشبورد جاهز.", "info");
}

function renderFavoritesPage() {
  const grid = qs("[data-favorites-grid]");
  const summary = qs("[data-favorites-summary]");

  if (!grid || !summary) return;

  const favorites = getFavoriteIdSet();
  const items = state.actresses.filter((item) => favorites.has(item.id));

  summary.textContent = `${formatNumber(items.length)} عنصر مفضل`;

  if (!items.length) {
    grid.innerHTML = `<p class="favorites-page__empty is-empty">قائمة المفضلة فارغة الآن.</p>`;
    setPageStatus("favorites", "قائمة المفضلة فارغة.", "info");
    return;
  }

  grid.innerHTML = items
    .map(
      (actress) => `
        <article class="actress-card" data-actress-id="${safeAttr(actress.id)}">
          <a class="actress-card__link" href="profile.html?id=${encodeURIComponent(actress.id)}">
            ${
              actress.mainImage
                ? `<img class="actress-card__image" src="${safeAttr(actress.mainImage)}" alt="${escapeHTML(actress.name)}" loading="lazy" />`
                : `<div class="actress-card__image" data-empty-image="true">لا توجد صورة</div>`
            }
            <div class="actress-card__body">
              <h3 class="actress-card__name">${escapeHTML(actress.name)}</h3>
              <div class="actress-card__meta">
                <div class="actress-card__meta-item">
                  <span class="actress-card__meta-label">Views</span>
                  <strong class="actress-card__meta-value" data-view-count>${formatNumber(actress.views)}</strong>
                </div>
                <div class="actress-card__meta-item">
                  <span class="actress-card__meta-label">Favorites</span>
                  <strong class="actress-card__meta-value" data-favorite-count>${formatNumber(actress.favorites)}</strong>
                </div>
              </div>
            </div>
          </a>

          <button
            class="actress-card__favorite actress-card__favorite--active"
            type="button"
            data-favorite-toggle
            data-actress-id="${safeAttr(actress.id)}"
            aria-pressed="true"
          >
            إزالة من المفضلة
          </button>
        </article>
      `
    )
    .join("");

  setPageStatus("favorites", "تم تحميل المفضلة.", "info");
}

function bindFavoritesControls() {
  if (state.favorites.controlsBound) return;

  const grid = qs("[data-favorites-grid]");
  if (grid) {
    grid.addEventListener("click", async (event) => {
      const favoriteButton = event.target.closest("[data-favorite-toggle]");
      if (!favoriteButton) return;
      await toggleFavorite(favoriteButton.dataset.actressId, favoriteButton);
    });
  }

  window.addEventListener("storage", (event) => {
    if (event.key === FAVORITES_KEY) renderFavoritesPage();
  });

  state.favorites.controlsBound = true;
}

function initIndexPage() {
  bindIndexControls();
  renderIndexPage();
}

function initProfilePage() {
  const params = new URLSearchParams(window.location.search);
  state.profile.id = params.get("id") || "";
  state.profile.activeTab = "bio";
  bindProfileControls();
  updateProfileTabs();
  renderProfilePage();
}

function initDashboardPage() {
  ensureDashboardAccess();
  ensureDashboardForm();
  renderDashboardPage();
}

function initFavoritesPage() {
  bindFavoritesControls();
  renderFavoritesPage();
}

function initApp() {
  mountSiteChrome();
  initTheme();
  bindHeaderActions();
  bindHeaderHideOnScroll();
  bindRealtimeListener();

  const page = document.body.dataset.page || "index";

  if (page === "index") {
    initIndexPage();
  } else if (page === "profile") {
    initProfilePage();
  } else if (page === "dashboard") {
    initDashboardPage();
  } else if (page === "favorites") {
    initFavoritesPage();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

function bindHeaderHideOnScroll() {
  const header = qs(".site-shell--header");
  if (!header || header.dataset.scrollBound === "true") return;

  header.dataset.scrollBound = "true";

  let lastScrollY = window.scrollY;
  let ticking = false;
  const threshold = 12;

  const updateHeader = () => {
    const currentY = window.scrollY;

    if (currentY <= 0) {
      header.classList.remove("is-hidden");
    } else if (currentY > lastScrollY + threshold) {
      header.classList.add("is-hidden");
    } else if (currentY < lastScrollY - threshold) {
      header.classList.remove("is-hidden");
    }

    lastScrollY = currentY;
    ticking = false;
  };

  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        window.requestAnimationFrame(updateHeader);
        ticking = true;
      }
    },
    { passive: true }
  );
}

function ensureGalleryViewer() {
  if (document.querySelector("[data-gallery-viewer]")) return;

  const viewer = document.createElement("div");
  viewer.className = "gallery-viewer";
  viewer.setAttribute("data-gallery-viewer", "true");
  viewer.hidden = true;

  viewer.innerHTML = `
    <div class="gallery-viewer__backdrop" data-gallery-close></div>
    <div class="gallery-viewer__content" role="dialog" aria-modal="true" aria-label="معاينة الصورة">
      <button class="gallery-viewer__close" type="button" data-gallery-close>×</button>
      <img class="gallery-viewer__image" data-gallery-viewer-image alt="" />
    </div>
  `;

  document.body.appendChild(viewer);

  viewer.addEventListener("click", (event) => {
    if (event.target.matches("[data-gallery-close]")) {
      viewer.hidden = true;
      document.body.classList.remove("gallery-open");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !viewer.hidden) {
      viewer.hidden = true;
      document.body.classList.remove("gallery-open");
    }
  });
}

function openGalleryViewer(src, alt = "") {
  ensureGalleryViewer();

  const viewer = document.querySelector("[data-gallery-viewer]");
  const image = document.querySelector("[data-gallery-viewer-image]");

  if (!viewer || !image) return;

  image.src = src;
  image.alt = alt;
  viewer.hidden = false;
  document.body.classList.add("gallery-open");
}