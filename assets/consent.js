(function () {
  "use strict";
  var KEY = "socmonitor_notice";
  var TXT = {
    pl: {
      msg: "Ta strona nie używa cookies ani śledzenia. W Twojej przeglądarce zapisuje się tylko wybrany język.",
      more: "Szczegóły", ok: "Rozumiem"
    },
    en: {
      msg: "This site uses no cookies or tracking. Only your chosen language is stored in your browser.",
      more: "Details", ok: "Got it"
    }
  };

  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function write() { try { localStorage.setItem(KEY, "1"); } catch (e) {} }
  function lang() {
    var s = null;
    try { s = localStorage.getItem("socmonitor_lang"); } catch (e) {}
    if (s === "pl" || s === "en") return s;
    return (navigator.language || "pl").toLowerCase().indexOf("pl") === 0 ? "pl" : "en";
  }

  if (read()) return;

  var bar = document.createElement("div");
  bar.className = "consent";
  bar.setAttribute("role", "dialog");
  bar.setAttribute("aria-label", "Cookies");

  var p = document.createElement("span");
  var a = document.createElement("a");
  a.href = "privacy.html";
  var b = document.createElement("button");
  b.type = "button";
  bar.appendChild(p); bar.appendChild(a); bar.appendChild(b);

  function paint() {
    var t = TXT[lang()];
    p.textContent = t.msg + " ";
    a.textContent = t.more;
    b.textContent = t.ok;
  }
  b.onclick = function () { write(); bar.remove(); };

  document.querySelectorAll("[data-lang]").forEach(function (btn) {
    btn.addEventListener("click", function () { setTimeout(paint, 0); });
  });

  paint();
  document.body.appendChild(bar);
})();
