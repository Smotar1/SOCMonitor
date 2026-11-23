(function () {
  "use strict";

  var I18N = {
    pl: {
      updated: "Aktualizacja: ",
      tab_news: "Newsy", tab_cves: "Nowe CVE", tab_kev: "Aktywnie atakowane", tab_ransomware: "Ransomware",
      stat_news: "Newsy (24h)", stat_crit: "Krytyczne CVE (48h)", stat_cves: "Nowe CVE (48h)",
      stat_kev: "Nowe w KEV (7 dni)", stat_ransom: "Ofiary ransomware (24h)",
      kev_desc: "Luki z katalogu CISA KEV, czyli potwierdzone przypadki wykorzystania w atakach. Łataj w pierwszej kolejności.",
      ransom_desc: "Ostatnie ofiary ogłoszone przez grupy ransomware (dane: ransomware.live).",
      all: "Wszystkie", all_lang: "Wszystkie języki", all_sev: "Każda waga", search: "Szukaj...",
      none: "Brak danych.", no_match: "Nic nie pasuje do filtra.",
      ransom_used: "używane przez ransomware", due: "termin łatania: ",
      err: "Część źródeł nie odpowiedziała, pokazuję ostatnie dane: ",
      footer: "Dane z publicznych źródeł: NVD, CISA KEV, ransomware.live, kanały RSS. Projekt hobbystyczny, bez gwarancji kompletności.",
      nodata: "Brak pliku z danymi. Uruchom workflow Actions lub scripts/fetch.py.",
      unknown: "brak oceny",
      privacy: "Prywatność i cookies"
    },
    en: {
      updated: "Updated: ",
      tab_news: "News", tab_cves: "New CVEs", tab_kev: "Exploited in the wild", tab_ransomware: "Ransomware",
      stat_news: "News (24h)", stat_crit: "Critical CVEs (48h)", stat_cves: "New CVEs (48h)",
      stat_kev: "New in KEV (7 days)", stat_ransom: "Ransomware victims (24h)",
      kev_desc: "Vulnerabilities from the CISA KEV catalog, i.e. confirmed exploitation in real attacks. Patch these first.",
      ransom_desc: "Latest victims posted by ransomware groups (data: ransomware.live).",
      all: "All", all_lang: "All languages", all_sev: "Any severity", search: "Search...",
      none: "No data.", no_match: "Nothing matches the filter.",
      ransom_used: "used by ransomware", due: "patch due: ",
      err: "Some sources did not respond, showing the last known data: ",
      footer: "Data from public sources: NVD, CISA KEV, ransomware.live, RSS feeds. Hobby project, no completeness guarantee.",
      nodata: "Data file missing. Run the Actions workflow or scripts/fetch.py.",
      unknown: "unrated",
      privacy: "Privacy and cookies"
    }
  };

  var state = { lang: "pl", tab: "news", data: null, newsLang: "all", sev: "all", q: "" };

  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; }
  }
  function t(k) { return I18N[state.lang][k] || k; }
  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? u : "#"; }

  function ago(iso) {
    if (!iso) return "";
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    var rtf = typeof Intl !== "undefined" && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat(state.lang, { numeric: "auto" }) : null;
    var units = [["day", 86400], ["hour", 3600], ["minute", 60]];
    for (var i = 0; i < units.length; i++) {
      if (s >= units[i][1] || i === units.length - 1) {
        var v = -Math.max(0, Math.round(s / units[i][1]));
        return rtf ? rtf.format(v, units[i][0]) : new Date(iso).toLocaleString(state.lang);
      }
    }
    return "";
  }

  function withinHours(iso, h) { return iso && Date.now() - new Date(iso).getTime() <= h * 3600 * 1000; }

  function card(href, cls, title, summary, rowParts) {
    var a = el(href ? "a" : "div", "item " + (cls || ""));
    if (href) { a.href = safeUrl(href); a.target = "_blank"; a.rel = "noopener noreferrer"; }
    a.appendChild(el("div", "t", title));
    if (summary) a.appendChild(el("div", "s", summary));
    var row = el("div", "row");
    rowParts.forEach(function (p) { if (p) row.appendChild(p); });
    a.appendChild(row);
    return a;
  }
  function badge(text, cls) { return el("span", "badge " + (cls || ""), text); }
  function span(text) { return el("span", "", text); }

  function fill(id, nodes, emptyKey) {
    var box = $(id);
    box.textContent = "";
    if (!nodes.length) { box.appendChild(el("div", "empty", t(emptyKey || "none"))); return; }
    nodes.forEach(function (n) { box.appendChild(n); });
  }

  function renderStats() {
    var d = state.data, box = $("stats");
    box.textContent = "";
    if (!d) return;
    var kev7 = (d.kev || []).filter(function (k) { return k.added && Date.now() - new Date(k.added).getTime() <= 7 * 86400000; }).length;
    var crit = (d.cves || []).filter(function (c) { return c.severity === "CRITICAL"; }).length;
    var items = [
      [(d.news || []).filter(function (n) { return withinHours(n.date, 24); }).length, "stat_news", ""],
      [crit, "stat_crit", "crit"],
      [d.cve_total_48h || (d.cves || []).length, "stat_cves", ""],
      [kev7, "stat_kev", "warn"],
      [(d.ransomware || []).filter(function (r) { return withinHours(r.date, 24); }).length, "stat_ransom", "warn"]
    ];
    items.forEach(function (it) {
      var s = el("div", "stat " + it[2]);
      s.appendChild(el("div", "n", String(it[0])));
      s.appendChild(el("div", "l", t(it[1])));
      box.appendChild(s);
    });
  }

  function renderNews() {
    var q = state.q.toLowerCase();
    var list = ((state.data && state.data.news) || []).filter(function (n) {
      if (state.newsLang !== "all" && n.lang !== state.newsLang) return false;
      return !q || (n.title + " " + n.summary).toLowerCase().indexOf(q) !== -1;
    }).map(function (n) {
      return card(n.link, "", n.title, n.summary, [badge(n.source), badge(n.lang.toUpperCase(), "lang"), span(ago(n.date))]);
    });
    fill("news", list, "no_match");
  }

  function renderCves() {
    var q = state.q.toLowerCase();
    var list = ((state.data && state.data.cves) || []).filter(function (c) {
      if (state.sev !== "all" && c.severity !== state.sev) return false;
      return !q || (c.id + " " + c.summary).toLowerCase().indexOf(q) !== -1;
    }).sort(function (a, b) {
      return (b.score || 0) - (a.score || 0) || (b.published || "").localeCompare(a.published || "");
    }).map(function (c) {
      var kevSet = (state.data.kev || []).some(function (k) { return k.id === c.id; });
      return card(c.link, c.severity || "", c.id, c.summary, [
        badge(c.score != null ? c.score.toFixed(1) + " " + (c.severity || "") : t("unknown"), c.severity || ""),
        kevSet ? badge("KEV", "kev") : null,
        span(ago(c.published))
      ]);
    });
    fill("cves", list, "no_match");
  }

  function renderKev() {
    var list = ((state.data && state.data.kev) || []).map(function (k) {
      return card(k.link, "HIGH", k.id + " - " + (k.vendor || "") + " " + (k.product || ""), k.name, [
        k.ransomware ? badge(t("ransom_used"), "kev") : null,
        span(k.added || ""),
        k.due ? span(t("due") + k.due) : null
      ]);
    });
    fill("kev", list);
  }

  function renderRansom() {
    var list = ((state.data && state.data.ransomware) || []).map(function (r) {
      return card(null, "HIGH", r.victim, [r.sector, r.country].filter(Boolean).join(" | "), [badge(r.group || "?"), span(ago(r.date))]);
    });
    fill("ransomware", list);
  }

  function buildTools() {
    var nt = $("news-tools");
    nt.textContent = "";
    var sel = el("select");
    [["all", "all_lang"], ["pl", null], ["en", null]].forEach(function (o) {
      var op = el("option", "", o[1] ? t(o[1]) : o[0].toUpperCase());
      op.value = o[0]; sel.appendChild(op);
    });
    sel.value = state.newsLang;
    sel.onchange = function () { state.newsLang = sel.value; renderNews(); };
    var inp = el("input"); inp.type = "search"; inp.placeholder = t("search"); inp.value = state.q;
    inp.oninput = function () { state.q = inp.value; renderNews(); renderCves(); };
    nt.appendChild(sel); nt.appendChild(inp);

    var ct = $("cve-tools");
    ct.textContent = "";
    var sev = el("select");
    ["all", "CRITICAL", "HIGH", "MEDIUM", "LOW"].forEach(function (s) {
      var op = el("option", "", s === "all" ? t("all_sev") : s); op.value = s; sev.appendChild(op);
    });
    sev.value = state.sev;
    sev.onchange = function () { state.sev = sev.value; renderCves(); };
    var inp2 = el("input"); inp2.type = "search"; inp2.placeholder = t("search"); inp2.value = state.q;
    inp2.oninput = function () { state.q = inp2.value; renderCves(); renderNews(); };
    ct.appendChild(sev); ct.appendChild(inp2);
  }

  function buildTabs() {
    var box = $("tabs");
    box.textContent = "";
    ["news", "cves", "kev", "ransomware"].forEach(function (id) {
      var b = el("button", state.tab === id ? "on" : "", t("tab_" + id));
      b.onclick = function () { state.tab = id; showTab(); buildTabs(); };
      box.appendChild(b);
    });
  }

  function showTab() {
    ["news", "cves", "kev", "ransomware"].forEach(function (id) { $("panel-" + id).hidden = state.tab !== id; });
  }

  function renderBanner() {
    var b = $("banner"), d = state.data;
    if (!d) { b.hidden = false; b.textContent = t("nodata"); return; }
    var errs = Object.keys(d.errors || {});
    b.hidden = !errs.length;
    if (errs.length) b.textContent = t("err") + errs.join(", ");
  }

  function applyLang() {
    document.documentElement.lang = state.lang;
    document.querySelectorAll("[data-lang]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-lang") === state.lang); });
    document.querySelectorAll("[data-i18n]").forEach(function (n) { n.textContent = t(n.getAttribute("data-i18n")); });
    $("footer").textContent = t("footer");
    $("priv-link").textContent = t("privacy");
    var up = state.data && state.data.updated;
    $("updated").textContent = up ? t("updated") + new Date(up).toLocaleString(state.lang) : "";
    buildTabs(); buildTools(); renderBanner(); renderStats();
    renderNews(); renderCves(); renderKev(); renderRansom(); showTab();
  }

  function init() {
    var saved = store("socmonitor_lang");
    state.lang = saved === "pl" || saved === "en" ? saved : ((navigator.language || "pl").toLowerCase().indexOf("pl") === 0 ? "pl" : "en");
    document.querySelectorAll("[data-lang]").forEach(function (b) {
      b.onclick = function () { state.lang = b.getAttribute("data-lang"); store("socmonitor_lang", state.lang); applyLang(); };
    });
    fetch("data/data.json?t=" + Date.now())
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { state.data = d; })
      .catch(function () { state.data = null; })
      .then(applyLang);
    setInterval(function () {
      fetch("data/data.json?t=" + Date.now()).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { if (d) { state.data = d; applyLang(); } }).catch(function () {});
    }, 10 * 60 * 1000);
  }

  init();
})();
