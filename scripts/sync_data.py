#!/usr/bin/env python3
"""
Sync data overtime dari Google Sheets publik (Anyone with the link can view)
ke docs/data.json dan docs/hub_coords.json.

Dijalankan otomatis tiap hari jam 07:00 WIB oleh
.github/workflows/sync-data.yml, atau bisa dijalankan manual:

    python3 scripts/sync_data.py

Kalau sheet source berubah (kolom baru, urutan kolom beda, dll), sesuaikan
COLUMN mapping di bawah.
"""
import csv
import io
import json
import os
import sys
import urllib.request

# ID diambil dari URL spreadsheet:
# https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit?gid=<GID>
SHEET_ID = os.environ.get("SHEET_ID", "1Ec7MsFbFDP8v9YwTRKOzzpYDWidVvVZrzBq9JDrwjq0")
GID = os.environ.get("SHEET_GID", "0")

CSV_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={GID}"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_JSON = os.path.join(ROOT, "docs", "data.json")
HUB_COORDS_JSON = os.path.join(ROOT, "docs", "hub_coords.json")

# Fallback koordinat kalau ada site/lokasi baru yang belum pernah dipetakan.
# Titik tengah Indonesia -> supaya tetap muncul di peta (bukan error), lalu
# perlu dikoreksi manual di docs/hub_coords.json setelah sync pertama.
FALLBACK_COORD = {"lat": -2.0, "lng": 117.0}


def fetch_csv(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        if resp.status != 200:
            raise RuntimeError(f"Gagal fetch sheet, HTTP {resp.status}")
        return resp.read().decode("utf-8")


def short_name(loc: str) -> str:
    """Bikin nama pendek dari nama lokasi penuh, dipakai kalau ada site baru."""
    s = loc
    for prefix in ("DC HUB ", "DC ", "CIREBON-DC HUB INFORMA"):
        if s.startswith(prefix) and prefix != "CIREBON-DC HUB INFORMA":
            s = s[len(prefix):]
    s = s.replace("CIREBON-DC HUB INFORMA", "Cirebon")
    return s.strip().title()


def main():
    print(f"Fetching: {CSV_URL}")
    try:
        raw = fetch_csv(CSV_URL)
    except Exception as e:
        print(f"ERROR: gagal mengambil data dari Google Sheets: {e}", file=sys.stderr)
        sys.exit(1)

    reader = csv.DictReader(io.StringIO(raw))
    rows = list(reader)
    if not rows:
        print("ERROR: sheet kosong / gagal parse CSV.", file=sys.stderr)
        sys.exit(1)

    required_cols = {
        "Employee ID", "Employee Name", "OT Date", "Job Title Name",
        "Location Name", "BU", "Total OT Hour Paid", "OT (IDR)", "OT Type Name",
    }
    missing = required_cols - set(reader.fieldnames or [])
    if missing:
        print(f"ERROR: kolom hilang di sheet: {missing}", file=sys.stderr)
        sys.exit(1)

    with open(HUB_COORDS_JSON, encoding="utf-8") as f:
        loc_meta = json.load(f)

    records = []
    skipped = 0
    new_locs = set()

    for r in rows:
        try:
            emp_id = (r.get("Employee ID") or "").strip()
            nm = (r.get("Employee Name") or "").strip()
            date_raw = (r.get("OT Date") or "").strip()
            loc = (r.get("Location Name") or "").strip()
            bu = (r.get("BU") or "").strip()
            jt_raw = (r.get("Job Title Name") or "").strip()
            idr_raw = (r.get("OT (IDR)") or "0").strip()
            h_raw = (r.get("Total OT Hour Paid") or "0").strip()
            ot_type = (r.get("OT Type Name") or "").strip()

            if not emp_id or not date_raw or not loc:
                skipped += 1
                continue

            m, d, y = date_raw.split("/")
            date_iso = f"{y}-{int(m):02d}-{int(d):02d}"

            idr = int(float(idr_raw.replace(",", "")))
            hours = float(h_raw.replace(",", ""))
            jt = "D" if jt_raw.upper() == "DRIVER" else "A"

            # anomali BU non-standar -> masukkan ke HCI (mengikuti aturan yang sudah disepakati)
            if bu not in ("HCI", "AHI"):
                bu = "HCI"

            if loc not in loc_meta:
                new_locs.add(loc)
                loc_meta[loc] = {"short": short_name(loc), **FALLBACK_COORD}

            records.append({
                "id": emp_id, "nm": nm, "dt": date_iso, "jt": jt,
                "loc": loc, "bu": bu, "h": hours, "idr": idr, "ot": ot_type,
            })
        except Exception as e:
            skipped += 1
            print(f"WARN: skip baris invalid ({e}): {r}", file=sys.stderr)

    if not records:
        print("ERROR: 0 baris valid ter-parse, sync dibatalkan (data lama tidak diubah).", file=sys.stderr)
        sys.exit(1)

    with open(DATA_JSON, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, separators=(",", ":"))

    with open(HUB_COORDS_JSON, "w", encoding="utf-8") as f:
        json.dump(loc_meta, f, ensure_ascii=False, indent=2)

    print(f"OK: {len(records)} baris tersimpan ke {DATA_JSON} ({skipped} baris dilewati).")
    if new_locs:
        print("PERHATIAN: site baru terdeteksi, koordinatnya masih fallback (titik tengah Indonesia).")
        print("Koreksi manual lat/lng-nya di docs/hub_coords.json:")
        for loc in sorted(new_locs):
            print(f"  - {loc}")


if __name__ == "__main__":
    main()
