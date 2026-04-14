// header-footer.js
// توليد الـ header والـ footer المشتركين في كل الصفحات

function getActivePage() {
  return document.body?.dataset?.page || "index";
}

function navItem(href, label, key, activePage) {
  const active = activePage === key ? ' aria-current="page"' : "";
  return `<a class="site-nav__link" href="${href}"${active}>${label}</a>`;
}

export function renderSiteHeader() {
  const activePage = getActivePage();

  return `
    <div class="site-shell site-shell--header">
      <div class="site-shell__brand">
        <a class="site-brand" href="index.html" aria-label="مكتبة الممثلات">مكتبة الممثلات</a>
      </div>

      <nav class="site-nav" aria-label="التنقل الرئيسي">
        ${navItem("index.html", "الرئيسية", "index", activePage)}
        ${navItem("favorites.html", "المفضلة", "favorites", activePage)}
        ${navItem("dashboard.html", "الداشبورد", "dashboard", activePage)}
      </nav>

      <form class="site-search" data-global-search action="index.html" method="get">
        <label class="site-search__label" for="global-search-input">بحث عام</label>
        <input
          class="site-search__input"
          id="global-search-input"
          name="q"
          type="search"
          data-global-search-input
          aria-label="ابحث باسم ممثلة"
        >
        <button class="site-search__button" type="submit">بحث</button>
      </form>

      <div class="site-actions">
        <button class="site-actions__button" type="button" data-theme-toggle aria-pressed="false">Dark mode</button>
        <button class="site-actions__button" type="button" data-demo-login>تسجيل دخول</button>
      </div>
    </div>
  `;
}

export function renderSiteFooter() {
  const year = new Date().getFullYear();

  return `
    <div class="site-shell site-shell--footer">
      <p class="site-footer__text">© ${year} مكتبة الممثلات</p>
      <p class="site-footer__text">واجهة تجريبية متصلة بـ Firebase Realtime Database</p>
    </div>
  `;
}

export function mountSiteChrome() {
  const headerHost = document.querySelector("[data-site-header]");
  const footerHost = document.querySelector("[data-site-footer]");

  if (headerHost) headerHost.innerHTML = renderSiteHeader();
  if (footerHost) footerHost.innerHTML = renderSiteFooter();
}