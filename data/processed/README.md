# Source PDF extraction

This folder contains review-only CSVs extracted from the source PDFs in `data/raw/`. The extraction workflow does not connect to PostgreSQL, publish records, or infer current operational status. Every row is marked `unverified`.

## Install

From the project root, install the pinned PDF parsing dependency:

```powershell
python -m pip install -r scripts\requirements-pdf.txt
```

## Run / refresh outputs

```powershell
python scripts\extract_healthcare_pdfs.py
```

The script expects the two named source PDFs in `data/raw/` and overwrites only its own generated files under `data/processed/`. Optional paths:

```powershell
python scripts\extract_healthcare_pdfs.py --raw-dir data\raw --output-dir data\processed
```

Run the extraction checks without changing the generated deliverables:

```powershell
python -m unittest discover -s scripts -p test_extract_healthcare_pdfs.py
```

## Generated files

- `haryana_sonipat_primary_facilities.csv` — individual CHC/PHC names and separate source-count rows, including the reported sub-centre count. The source does not list individual sub-centre names.
- `haryana_sonipat_hospitals_beds.csv` — Sonipat/Sonepat district hospital names and listed bed capacities.
- `sonipat_pmjay_empanelled_hospitals.csv` — PM-JAY source IDs (text), names, types, email/contact fields, source date/page, and unverified status.
- `pdf_extraction_validation.json` and `pdf_extraction_validation.md` — counts, missing fields, duplicate candidates, sequence comparison, and parsing/manual-review notes.

Hospital IDs and phone numbers are written as text. Names preserve the source casing and are whitespace-normalized; source name/email/contact columns are retained where normalization is applied. Possible duplicates are reported, never merged. Review the validation report and original PDF before any future import or publication.
