# SOCmonitor

Strona (PL/EN), która sama zbiera newsy z cyberbezpieczeństwa, nowe CVE, aktywnie wykorzystywane luki (CISA KEV) i ofiary ransomware. Bez serwera, za darmo.

## Jak to działa

- `scripts/fetch.py` pobiera dane i zapisuje `data/data.json` (tylko standardowa biblioteka Pythona).
- `.github/workflows/update.yml` odpala skrypt co godzinę i commituje zmiany.
- `index.html` + `assets/` to statyczna strona, która czyta `data/data.json`.


## Źródła

Newsy: BleepingComputer, The Hacker News, Krebs on Security, CERT Polska, Niebezpiecznik, Sekurak.
CVE: NVD API 2.0. Exploited: CISA KEV. Ransomware: ransomware.live (API v2).
Listę kanałów RSS zmienisz w `FEEDS` na górze `fetch.py`.
