#!/usr/bin/env python3

import json
import os
import re
import html
import sys
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

UA = "SOCmonitor/1.0 (hobby project)"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "data.json")

FEEDS = [
    {"name": "BleepingComputer", "lang": "en", "url": "https://www.bleepingcomputer.com/feed/"},
    {"name": "The Hacker News", "lang": "en", "url": "https://feeds.feedburner.com/TheHackersNews"},
    {"name": "Krebs on Security", "lang": "en", "url": "https://krebsonsecurity.com/feed/"},
    {"name": "CERT Polska", "lang": "pl", "url": "https://cert.pl/feed/"},
    {"name": "Niebezpiecznik", "lang": "pl", "url": "https://niebezpiecznik.pl/feed/"},
    {"name": "Sekurak", "lang": "pl", "url": "https://sekurak.pl/feed/"},
]

NVD_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0"
KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
RANSOM_URL = "https://api.ransomware.live/v2/recentvictims"


def get(url, headers=None, timeout=40):
    h = {"User-Agent": UA}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def clean(text, limit=260):
    text = html.unescape(re.sub(r"<[^>]+>", " ", text or ""))
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "..."


def to_iso(value):
    if not value:
        return None
    value = value.strip()
    try:
        dt = parsedate_to_datetime(value)
    except Exception:
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except Exception:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def local(tag):
    return tag.rsplit("}", 1)[-1]


def parse_feed(raw, source, lang, per_feed=12):
    root = ET.fromstring(raw)
    items = []
    for node in root.iter():
        if local(node.tag) not in ("item", "entry"):
            continue
        d = {}
        for c in node:
            name = local(c.tag)
            if name == "link":
                d.setdefault("link", c.attrib.get("href") or (c.text or "").strip())
            elif name in ("title", "description", "summary", "pubDate", "published", "updated", "date"):
                d.setdefault(name, c.text or "")
        link = d.get("link", "")
        if not link.startswith(("http://", "https://")):
            continue
        date = to_iso(d.get("pubDate") or d.get("published") or d.get("updated") or d.get("date"))
        items.append({
            "title": clean(d.get("title"), 200),
            "link": link,
            "summary": clean(d.get("description") or d.get("summary")),
            "date": date,
            "source": source,
            "lang": lang,
        })
    items.sort(key=lambda x: x["date"] or "", reverse=True)
    return items[:per_feed]


def fetch_news():
    news, errors = [], []
    for f in FEEDS:
        try:
            news += parse_feed(get(f["url"]), f["name"], f["lang"])
        except Exception as e:
            errors.append(f"{f['name']}: {e}")
    seen, out = set(), []
    for n in sorted(news, key=lambda x: x["date"] or "", reverse=True):
        if n["link"] in seen:
            continue
        seen.add(n["link"])
        out.append(n)
    if not out:
        raise RuntimeError("; ".join(errors) or "brak newsow")
    return out[:80], errors


def fetch_cves(hours=48):
    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=hours)
    fmt = "%Y-%m-%dT%H:%M:%S.000"
    q = urllib.parse.urlencode({
        "pubStartDate": start.strftime(fmt),
        "pubEndDate": end.strftime(fmt),
        "resultsPerPage": 2000,
    })
    headers = {}
    if os.environ.get("NVD_API_KEY"):
        headers["apiKey"] = os.environ["NVD_API_KEY"]
    data = json.loads(get(f"{NVD_URL}?{q}", headers, timeout=60))
    out = []
    for v in data.get("vulnerabilities", []):
        c = v["cve"]
        desc = next((d["value"] for d in c.get("descriptions", []) if d.get("lang") == "en"), "")
        score, sev = None, None
        for key in ("cvssMetricV40", "cvssMetricV31", "cvssMetricV30", "cvssMetricV2"):
            m = c.get("metrics", {}).get(key)
            if m:
                cd = m[0]["cvssData"]
                score = cd.get("baseScore")
                sev = (cd.get("baseSeverity") or m[0].get("baseSeverity") or "").upper() or None
                break
        out.append({
            "id": c["id"],
            "published": to_iso(c.get("published")),
            "score": score,
            "severity": sev,
            "summary": clean(desc, 300),
            "link": f"https://nvd.nist.gov/vuln/detail/{c['id']}",
        })
    out.sort(key=lambda x: x["published"] or "", reverse=True)
    return out[:200], data.get("totalResults", len(out))


def fetch_kev():
    data = json.loads(get(KEV_URL, timeout=60))
    vulns = sorted(data.get("vulnerabilities", []), key=lambda x: x.get("dateAdded", ""), reverse=True)
    out = []
    for v in vulns[:40]:
        out.append({
            "id": v.get("cveID"),
            "vendor": v.get("vendorProject"),
            "product": v.get("product"),
            "name": clean(v.get("vulnerabilityName"), 160),
            "added": v.get("dateAdded"),
            "due": v.get("dueDate"),
            "ransomware": v.get("knownRansomwareCampaignUse") == "Known",
            "link": f"https://nvd.nist.gov/vuln/detail/{v.get('cveID')}",
        })
    return out


def fetch_ransomware():
    data = json.loads(get(RANSOM_URL, timeout=60))
    rows = []
    for v in data:
        rows.append({
            "victim": clean(v.get("victim"), 120),
            "group": v.get("group"),
            "country": v.get("country"),
            "sector": clean(v.get("activity"), 60),
            "date": to_iso(v.get("discovered") or v.get("attackdate") or ""),
        })
    rows.sort(key=lambda x: x["date"] or "", reverse=True)
    return rows[:60]


def load_old():
    try:
        with open(OUT, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def main():
    old = load_old()
    new = {k: old.get(k, []) for k in ("news", "cves", "kev", "ransomware")}
    errors = {}

    try:
        new["news"], feed_errors = fetch_news()
        if feed_errors:
            errors["news_partial"] = feed_errors
    except Exception as e:
        errors["news"] = str(e)
    try:
        new["cves"], total = fetch_cves()
        new["cve_total_48h"] = total
    except Exception as e:
        errors["cves"] = str(e)
        new["cve_total_48h"] = old.get("cve_total_48h", 0)
    try:
        new["kev"] = fetch_kev()
    except Exception as e:
        errors["kev"] = str(e)
    try:
        new["ransomware"] = fetch_ransomware()
    except Exception as e:
        errors["ransomware"] = str(e)

    new["errors"] = errors

    # Zapisuj tylko gdy cos sie zmienilo (poza znacznikiem czasu), zeby nie robic pustych commitow.
    changed = {k: v for k, v in old.items() if k != "updated"} != new
    if changed or "updated" not in old:
        new["updated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        tmp = OUT + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(new, f, ensure_ascii=False, indent=1)
        os.replace(tmp, OUT)
        print("zapisano", OUT)
    else:
        print("bez zmian")

    for k, v in errors.items():
        print(f"BLAD {k}: {v}", file=sys.stderr)
    # Nie wywalaj calego workflow, gdy padlo tylko jedno zrodlo.
    return 1 if len(errors) >= 4 else 0


if __name__ == "__main__":
    sys.exit(main())
