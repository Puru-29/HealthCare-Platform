# PDF extraction validation report

Generated: 2026-10-29

All extracted records are marked `unverified`; this report does not establish current operation or empanelment.

## Haryana health facilities (source date 2025-05-05)

- Named Sonipat facilities extracted: 37 (CHC 7; PHC 30).
- Printed counts: CHC 7; PHC 30; sub-centres 177.
- Individual sub-centre names are not present in the source list; only the aggregate count is provided.
- Sonipat district hospitals with bed capacities extracted: 4.
- Possible exact normalized duplicates: 0.

### Manual review / parsing notes

- Page 2: `Sargathal` — Name split inferred from the column layout and printed count; confirm visually.
- Page 2: `Shamri` — Name split inferred from the column layout and printed count; confirm visually.
- Page 2 PHC list has no comma between 'Sargathal' and 'Shamri'; split into two names to reconcile the printed PHC count of 30. Confirm visually.

## PM-JAY Sonipat list (source date 2026-08-03)

- Expected numbered entries: 76.
- Extracted rows: 76.
- Count matches: True.
- Missing entry numbers: None.
- Duplicate entry numbers: None.
- Missing field occurrences (ID/name/type/email/nodal officer/contact): 0.
- Duplicate hospital IDs: None.
- Duplicate names after exact normalization: None.
- Similar-name review candidates (>= 0.90 string similarity): [{'pdf_entry_numbers': ['23', '26'], 'source_names': ['Primary Health center', 'Primary healthcare center'], 'similarity': 0.905}, {'pdf_entry_numbers': ['44', '63'], 'source_names': ['RAMA HOSPITAL', 'RANA HOSPITAL'], 'similarity': 0.917}].

### Missing fields

- None in required ID/name/type/email/contact fields.

### Parsing errors

- None.

## Output files

- `haryana_sonipat_primary_facilities.csv`
- `haryana_sonipat_hospitals_beds.csv`
- `sonipat_pmjay_empanelled_hospitals.csv`
- `pdf_extraction_validation.json`
- `pdf_extraction_validation.md`
