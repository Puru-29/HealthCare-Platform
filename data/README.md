# Hospital data pipeline

How the government PDFs in `data/raw/` become the hospital directory the app serves.

```
data/raw/*.pdf ──(1) extract──▶ data/processed/*.csv ──(2) build──▶ sonipat_facilities.json ──(3) import──▶ server/carepath.db
                                       ▲                       ▲
              data/raw/osm/*.json (locations)    data/manual/pmjay_location_matches.json (hand-reviewed links)
```

## 1. Extract the PDFs (only when a new PDF is published)

Run this when Haryana or the NHA publish a new list, for example an updated PM-JAY empanelment roster.

```powershell
python -m pip install -r scripts\requirements-pdf.txt     # once, ideally inside .venv
python scripts\extract_healthcare_pdfs.py
python -m unittest discover -s scripts -p test_extract_healthcare_pdfs.py
```

Outputs, all marked `unverified`:

- `sonipat_pmjay_empanelled_hospitals.csv`: PM-JAY hospital IDs, names, type, Ayushman desk officer and contact.
- `haryana_sonipat_primary_facilities.csv`: CHC/PHC names and district counts.
- `haryana_sonipat_hospitals_beds.csv`: government hospital bed capacity.
- `pdf_extraction_validation.json` / `.md`: counts, missing fields and rows that need a human look. Read these before using a new extract.

IDs and phone numbers are kept as text. Possible duplicates are reported, never merged.

## 2. Build the directory

```powershell
npm run data:build
```

This merges the CSVs with OpenStreetMap locations using `data/manual/pmjay_location_matches.json`, and infers specialties, recording the source of each one. It writes `sonipat_facilities.json`. For a new PDF, add any new PM-JAY entries to the match file first; the build stops if an entry is missing.

## 3. Load it into the app

```powershell
npm run data:import
```

This updates the database without overwriting what hospitals have confirmed themselves in the console (verified specialties, phone, location pin).
