#!/usr/bin/env python3
"""Extract the two supplied healthcare directory PDFs into review-only CSVs."""

from __future__ import annotations

import argparse
import csv
import difflib
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from typing import Any

import fitz


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RAW_DIR = ROOT / "data" / "raw"
DEFAULT_OUTPUT_DIR = ROOT / "data" / "processed"

HARYANA_PDF = "20250508834158531.pdf"
PMJAY_PDF = "202608041074356704.pdf"
HARYANA_DATE = "2025-05-05"
PMJAY_DATE = "2026-08-03"
EXPECTED_PMJAY_ENTRIES = 76

FACILITY_FIELDS = [
    "source_document",
    "source_date",
    "source_page",
    "district",
    "record_type",
    "facility_type",
    "facility_name",
    "facility_count",
    "verification_status",
    "extraction_review_status",
    "extraction_notes",
]

BED_FIELDS = [
    "source_document",
    "source_date",
    "source_page",
    "district",
    "record_type",
    "hospital_name",
    "bed_capacity",
    "verification_status",
    "extraction_review_status",
    "extraction_notes",
]

PMJAY_FIELDS = [
    "source_document",
    "source_date",
    "source_page",
    "record_type",
    "pdf_entry_number",
    "hospital_id",
    "hospital_name",
    "hospital_name_source",
    "hospital_type",
    "email",
    "email_source",
    "nodal_officer_name",
    "contact_number",
    "contact_number_source",
    "verification_status",
    "extraction_review_status",
    "extraction_notes",
]


def normalize_space(value: str) -> str:
    value = unicodedata.normalize("NFC", value)
    return re.sub(r"\s+", " ", value).strip()


def words_by_line(words: list[tuple[Any, ...]]) -> list[list[tuple[Any, ...]]]:
    lines: list[list[tuple[Any, ...]]] = []
    for word in sorted(words, key=lambda item: (round(float(item[1]), 1), float(item[0]))):
        y = float(word[1])
        if not lines or abs(float(lines[-1][0][1]) - y) > 1.5:
            lines.append([word])
        else:
            lines[-1].append(word)
    return lines


def extract_column_lines(
    page: fitz.Page,
    x_min: float,
    x_max: float,
    y_min: float,
    y_max: float,
) -> list[str]:
    selected = [
        word
        for word in page.get_text("words")
        if x_min <= float(word[0]) < x_max and y_min <= float(word[1]) <= y_max
    ]
    return [
        normalize_space(" ".join(str(word[4]) for word in line))
        for line in words_by_line(selected)
    ]


def clean_facility_name(value: str) -> str:
    value = normalize_space(value).strip(" ,;.")
    value = re.sub(r"\s*-\s*", "-", value)
    return normalize_space(value)


def parse_haryana_facilities(
    path: Path,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    document = fitz.open(path)
    if document.page_count < 3:
        raise ValueError(f"{path.name}: expected at least 3 pages, found {document.page_count}")

    table_page = document[1]
    district_words = [
        word for word in table_page.get_text("words")
        if str(word[4]).casefold() == "sonipat"
    ]
    if not district_words:
        raise ValueError(f"{path.name}: could not find Sonipat district in page 2")
    district_y = float(district_words[0][1])
    next_district_y = min(
        (
            float(word[1])
            for word in table_page.get_text("words")
            if float(word[0]) < 110
            and float(word[1]) > district_y
            and str(word[4]).casefold() in {"yamuna"}
        ),
        default=district_y + 95,
    )
    y_min = district_y - 1
    y_max = next_district_y - 1

    chc_names = [
        clean_facility_name(line)
        for line in extract_column_lines(table_page, 160, 285, y_min, y_max)
        if clean_facility_name(line)
    ]
    phc_text = " ".join(extract_column_lines(table_page, 310, 513, y_min, y_max))
    phc_text = re.sub(r"-\s+", "-", phc_text)
    phc_text = re.sub(r",\s*,+", ",", phc_text)
    phc_names = [clean_facility_name(item) for item in phc_text.split(",")]
    phc_names = [item for item in phc_names if item]
    parsing_notes: list[str] = []
    manual_review_names: set[str] = set()

    # This source omits a comma between two adjacent names in the PHC column.
    # Keep the split explicit and report it for a human to confirm against the PDF.
    for index, value in enumerate(phc_names):
        match = re.fullmatch(r"(Sargathal)\s+(Shamri)", value, flags=re.IGNORECASE)
        if match:
            phc_names[index:index + 1] = [match.group(1), match.group(2)]
            manual_review_names.update((match.group(1), match.group(2)))
            parsing_notes.append(
                "Page 2 PHC list has no comma between 'Sargathal' and 'Shamri'; "
                "split into two names to reconcile the printed PHC count of 30. "
                "Confirm visually."
            )
            break

    declared_counts: dict[str, int | None] = {"CHC": None, "PHC": None, "Sub-centre": None}
    for word in table_page.get_text("words"):
        x, y, text = float(word[0]), float(word[1]), str(word[4])
        if abs(y - district_y) > 1.6 or not text.isdigit():
            continue
        number = int(text)
        if 135 <= x < 165:
            declared_counts["CHC"] = number
        elif 275 <= x < 310:
            declared_counts["PHC"] = number
        elif 500 <= x < 540:
            declared_counts["Sub-centre"] = number

    facilities: list[dict[str, Any]] = []
    for facility_type, names in (("CHC", chc_names), ("PHC", phc_names)):
        for name in names:
            notes: list[str] = []
            if "\ufffd" in name:
                notes.append("PDF text contains a replacement character; verify the name visually.")
            if name in manual_review_names:
                notes.append("Name split inferred from the column layout and printed count; confirm visually.")
            facilities.append({
                "source_document": path.name,
                "source_date": HARYANA_DATE,
                "source_page": 2,
                "district": "Sonipat",
                "record_type": "named_facility",
                "facility_type": facility_type,
                "facility_name": name,
                "facility_count": "",
                "verification_status": "unverified",
                "extraction_review_status": "needs_manual_review" if notes else "extracted",
                "extraction_notes": "; ".join(notes),
            })

    # The source provides only the Sub-centre count, not individual names.
    for facility_type, names in (("CHC", chc_names), ("PHC", phc_names), ("Sub-centre", [])):
        facilities.append({
            "source_document": path.name,
            "source_date": HARYANA_DATE,
            "source_page": 2,
            "district": "Sonipat",
            "record_type": "district_facility_count",
            "facility_type": facility_type,
            "facility_name": "",
            "facility_count": declared_counts[facility_type] if declared_counts[facility_type] is not None else len(names),
            "verification_status": "unverified",
            "extraction_review_status": "extracted",
            "extraction_notes": "Aggregate count printed in source; sub-centre names are not listed." if facility_type == "Sub-centre" else "",
        })

    if declared_counts["CHC"] != len(chc_names):
        parsing_notes.append(
            f"CHC names extracted={len(chc_names)} but printed count={declared_counts['CHC']}."
        )
    if declared_counts["PHC"] != len(phc_names):
        parsing_notes.append(
            f"PHC names extracted={len(phc_names)} but printed count={declared_counts['PHC']}."
        )
    if declared_counts["Sub-centre"] is None:
        parsing_notes.append("Could not read the Sonipat Sub-centre count from page 2.")

    beds_page = document[2]
    bed_rows: list[dict[str, Any]] = []
    target_names = {"dch sonepat", "sdch gohana", "ch kharkhoda", "sdch ganaur"}
    for line in beds_page.get_text("text", sort=True).splitlines():
        cleaned = normalize_space(line)
        match = re.search(
            r"\b\d+\s*\.?\s*((?:DCH|SDCH|CH)\s+.+?)\s+(\d+)\s*[Bb]eds?\b",
            cleaned,
        )
        if not match:
            continue
        hospital_name = normalize_space(match.group(1))
        if hospital_name.casefold() not in target_names:
            continue
        bed_rows.append({
            "source_document": path.name,
            "source_date": HARYANA_DATE,
            "source_page": 3,
            "district": "Sonipat",
            "record_type": "district_hospital_bed_capacity",
            "hospital_name": hospital_name,
            "bed_capacity": int(match.group(2)),
            "verification_status": "unverified",
            "extraction_review_status": "extracted",
            "extraction_notes": "Source district label is spelled Sonepat.",
        })

    if len(bed_rows) != 4:
        parsing_notes.append(
            f"Expected 4 Sonipat/Sonepat hospital bed rows; extracted {len(bed_rows)}."
        )

    return facilities, bed_rows, parsing_notes


def is_hospital_id(value: str) -> bool:
    return re.fullmatch(r"HOSP[A-Z0-9]*\d[A-Z0-9]*", value, flags=re.IGNORECASE) is not None


def row_words_for_anchor(
    words: list[tuple[Any, ...]],
    anchors: list[tuple[int, float]],
    index: int,
    x_min: float,
    x_max: float,
    max_distance: float = 18.0,
    bias_wrapped_name_to_next: bool = False,
) -> list[tuple[Any, ...]]:
    anchor_y = anchors[index][1]
    result: list[tuple[Any, ...]] = []
    for word in words:
        x, y = float(word[0]), float(word[1])
        if not (x_min <= x < x_max) or abs(y - anchor_y) > max_distance:
            continue
        distances = [abs(y - candidate_y) for _, candidate_y in anchors]
        nearest = min(
            range(len(anchors)),
            key=lambda candidate: (distances[candidate], -anchors[candidate][1]),
        )
        if (
            bias_wrapped_name_to_next
            and nearest + 1 < len(anchors)
            and y > anchors[nearest][1]
            and abs(distances[nearest + 1] - distances[nearest]) <= 3.0
        ):
            nearest += 1
        if nearest == index:
            result.append(word)
    return sorted(result, key=lambda word: (round(float(word[1]), 1), float(word[0])))


def joined_words(words: list[tuple[Any, ...]]) -> str:
    return normalize_space(" ".join(str(word[4]) for word in words))


def normalized_name_key(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).casefold()
    return re.sub(r"[^a-z0-9]+", "", value)


def parse_pmjay(path: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    document = fitz.open(path)
    records: list[dict[str, Any]] = []
    parse_errors: list[str] = []
    for page_number, page in enumerate(document, start=1):
        words = page.get_text("words")
        ids = sorted(
            [word for word in words if is_hospital_id(str(word[4]))],
            key=lambda word: (float(word[1]), float(word[0])),
        )
        anchors = [(index, float(word[1])) for index, word in enumerate(ids)]
        serials = sorted(
            [
                word for word in words
                if 65 <= float(word[0]) < 90
                and str(word[4]).isdigit()
                and 45 <= float(word[1]) < page.rect.height - 20
            ],
            key=lambda word: (float(word[1]), float(word[0])),
        )
        if len(serials) != len(ids):
            parse_errors.append(
                f"PM-JAY page {page_number}: found {len(ids)} hospital IDs but "
                f"{len(serials)} entry numbers."
            )

        for index, identifier in enumerate(ids):
            name_words = row_words_for_anchor(
                words,
                anchors,
                index,
                170,
                370,
                bias_wrapped_name_to_next=True,
            )
            type_words = row_words_for_anchor(words, anchors, index, 370, 430)
            email_words = row_words_for_anchor(words, anchors, index, 430, 650)
            officer_words = row_words_for_anchor(words, anchors, index, 650, 785)
            contact_words = row_words_for_anchor(words, anchors, index, 785, 950)

            name_source = joined_words(name_words)
            hospital_type_source = joined_words(type_words)
            email_source = joined_words(email_words)
            officer_name = joined_words(officer_words)
            contact_source = joined_words(contact_words)

            serial = str(serials[index][4]) if index < len(serials) else ""
            if index == 0:
                # The first PM-JAY page's column headers sit immediately above
                # entry 1 and can otherwise fall inside its geometric radius.
                first_entry_top = float(ids[0][1]) - 10
                name_source = joined_words([
                    word for word in name_words if float(word[1]) >= first_entry_top
                ])
                hospital_type_source = joined_words([
                    word for word in type_words if float(word[1]) >= first_entry_top
                ])
                email_source = joined_words([
                    word for word in email_words if float(word[1]) >= first_entry_top
                ])
                officer_name = joined_words([
                    word for word in officer_words if float(word[1]) >= first_entry_top
                ])
                contact_source = joined_words([
                    word for word in contact_words if float(word[1]) >= first_entry_top
                ])
            # Keep source casing for names and officer names. Email is normalized
            # in its clean column while the PDF's visible form remains available.
            email = email_source.lower() if email_source else ""
            email = re.sub(r"\s+", "", email)
            contact = re.sub(r"\s+", "", contact_source)
            notes: list[str] = []
            if not name_source:
                notes.append("Hospital name was not confidently extracted.")
            if not is_hospital_id(str(identifier[4])):
                notes.append("Hospital ID did not match the expected source pattern.")
            record = {
                "source_document": path.name,
                "source_date": PMJAY_DATE,
                "source_page": page_number,
                "record_type": "pmjay_empanelled_hospital",
                "pdf_entry_number": serial,
                "hospital_id": str(identifier[4]),
                "hospital_name": name_source,
                "hospital_name_source": name_source,
                "hospital_type": hospital_type_source,
                "email": email,
                "email_source": email_source,
                "nodal_officer_name": officer_name,
                "contact_number": contact,
                "contact_number_source": contact_source,
                "verification_status": "unverified",
                "extraction_review_status": "needs_manual_review" if notes else "extracted",
                "extraction_notes": "; ".join(notes),
            }
            records.append(record)

    numbers: list[int] = []
    for record in records:
        try:
            numbers.append(int(record["pdf_entry_number"]))
        except ValueError:
            parse_errors.append(
                f"PM-JAY source page {record['source_page']}: missing entry number "
                f"for hospital ID {record['hospital_id']}."
            )
    number_counts = Counter(numbers)
    duplicate_numbers = sorted(number for number, count in number_counts.items() if count > 1)
    missing_numbers = sorted(set(range(1, EXPECTED_PMJAY_ENTRIES + 1)) - set(numbers))
    unexpected_numbers = sorted(set(numbers) - set(range(1, EXPECTED_PMJAY_ENTRIES + 1)))
    if duplicate_numbers:
        parse_errors.append(f"Duplicate PM-JAY entry numbers: {duplicate_numbers}.")
    if missing_numbers:
        parse_errors.append(f"Missing PM-JAY entry numbers: {missing_numbers}.")
    if unexpected_numbers:
        parse_errors.append(f"Unexpected PM-JAY entry numbers: {unexpected_numbers}.")

    missing_fields: dict[str, list[dict[str, str]]] = defaultdict(list)
    for record in records:
        for field in (
            "hospital_id",
            "hospital_name",
            "hospital_type",
            "email",
            "nodal_officer_name",
            "contact_number",
        ):
            if not record[field]:
                missing_fields[field].append({
                    "pdf_entry_number": record["pdf_entry_number"],
                    "hospital_id": record["hospital_id"],
                    "source_page": record["source_page"],
                })

    duplicate_ids: dict[str, list[str]] = defaultdict(list)
    duplicate_names: dict[str, list[str]] = defaultdict(list)
    for record in records:
        duplicate_ids[record["hospital_id"].casefold()].append(record["pdf_entry_number"])
        key = normalized_name_key(record["hospital_name"])
        if key:
            duplicate_names[key].append(record["pdf_entry_number"])
    similar_names: list[dict[str, Any]] = []
    for left_index, left in enumerate(records):
        left_key = normalized_name_key(left["hospital_name"])
        if not left_key:
            continue
        for right in records[left_index + 1:]:
            right_key = normalized_name_key(right["hospital_name"])
            if not right_key or left_key == right_key:
                continue
            similarity = difflib.SequenceMatcher(None, left_key, right_key).ratio()
            if similarity >= 0.9:
                similar_names.append({
                    "pdf_entry_numbers": [
                        left["pdf_entry_number"],
                        right["pdf_entry_number"],
                    ],
                    "source_names": [
                        left["hospital_name"],
                        right["hospital_name"],
                    ],
                    "similarity": round(similarity, 3),
                })
    possible_duplicates = {
        "hospital_id": [
            {"hospital_id": key, "pdf_entry_numbers": values}
            for key, values in duplicate_ids.items() if len(values) > 1
        ],
        "hospital_name_exact_after_normalization": [
            {"normalized_name_key": key, "pdf_entry_numbers": values}
            for key, values in duplicate_names.items() if len(values) > 1
        ],
        "similar_hospital_names_review_candidates": similar_names,
    }

    return records, {
        "expected_numbered_entries": EXPECTED_PMJAY_ENTRIES,
        "extracted_rows": len(records),
        "numbered_entry_count_matches": len(records) == EXPECTED_PMJAY_ENTRIES,
        "numbers_present": sorted(number_counts),
        "missing_entry_numbers": missing_numbers,
        "duplicate_entry_numbers": duplicate_numbers,
        "unexpected_entry_numbers": unexpected_numbers,
        "missing_fields": dict(missing_fields),
        "possible_duplicates": possible_duplicates,
        "parsing_errors": parse_errors,
    }


def find_duplicate_facility_names(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    keys: dict[str, list[str]] = defaultdict(list)
    for row in rows:
        if row["record_type"] != "named_facility":
            continue
        key = normalized_name_key(row["facility_name"])
        if key:
            keys[key].append(row["facility_name"])
    return [
        {"normalized_name_key": key, "source_names": names}
        for key, names in keys.items() if len(names) > 1
    ]


def write_csv(path: Path, fields: list[str], rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=fields, extrasaction="raise")
        writer.writeheader()
        writer.writerows(rows)


def build_report(
    raw_dir: Path,
    output_paths: dict[str, Path],
    facilities: list[dict[str, Any]],
    bed_rows: list[dict[str, Any]],
    haryana_notes: list[str],
    pmjay_validation: dict[str, Any],
) -> dict[str, Any]:
    facility_names = [row for row in facilities if row["record_type"] == "named_facility"]
    facility_counts = {
        row["facility_type"]: row["facility_count"]
        for row in facilities if row["record_type"] == "district_facility_count"
    }
    damaged_names = [
        {
            "facility_type": row["facility_type"],
            "facility_name": row["facility_name"],
            "source_page": row["source_page"],
            "note": row["extraction_notes"],
        }
        for row in facility_names if row["extraction_review_status"] != "extracted"
    ]
    haryana_expected_names = {
        "CHC": facility_counts.get("CHC"),
        "PHC": facility_counts.get("PHC"),
    }
    return {
        "generated_at": date.today().isoformat(),
        "input_directory": str(raw_dir),
        "outputs": {name: str(path) for name, path in output_paths.items()},
        "sources": {
            HARYANA_PDF: {
                "source_date": HARYANA_DATE,
                "page_count": 4,
                "sonipat_named_facilities": {
                    "extracted_rows": len(facility_names),
                    "counts_by_type": dict(Counter(row["facility_type"] for row in facility_names)),
                    "printed_counts": facility_counts,
                    "name_counts_match_printed_counts": {
                        "CHC": len([row for row in facility_names if row["facility_type"] == "CHC"]) == haryana_expected_names["CHC"],
                        "PHC": len([row for row in facility_names if row["facility_type"] == "PHC"]) == haryana_expected_names["PHC"],
                    },
                    "sub_centre_names_in_source": False,
                    "sub_centre_count": facility_counts.get("Sub-centre"),
                    "district_hospital_rows": len(bed_rows),
                    "district_hospital_bed_capacities": [
                        {
                            "hospital_name": row["hospital_name"],
                            "bed_capacity": row["bed_capacity"],
                            "source_page": row["source_page"],
                        }
                        for row in bed_rows
                    ],
                    "possible_duplicates": find_duplicate_facility_names(facilities),
                    "manual_review_required": damaged_names,
                    "parsing_errors": haryana_notes,
                },
            },
            PMJAY_PDF: {
                "source_date": PMJAY_DATE,
                "page_count": 3,
                **pmjay_validation,
            },
        },
        "verification_policy": "Every extracted row is marked unverified; no operational status is asserted.",
    }


def render_markdown(report: dict[str, Any]) -> str:
    haryana = report["sources"][HARYANA_PDF]["sonipat_named_facilities"]
    pmjay = report["sources"][PMJAY_PDF]
    lines = [
        "# PDF extraction validation report",
        "",
        f"Generated: {report['generated_at']}",
        "",
        "All extracted records are marked `unverified`; this report does not establish current operation or empanelment.",
        "",
        "## Haryana health facilities (source date 2025-05-05)",
        "",
        f"- Named Sonipat facilities extracted: {haryana['extracted_rows']} (CHC {haryana['counts_by_type'].get('CHC', 0)}; PHC {haryana['counts_by_type'].get('PHC', 0)}).",
        f"- Printed counts: CHC {haryana['printed_counts'].get('CHC')}; PHC {haryana['printed_counts'].get('PHC')}; sub-centres {haryana['sub_centre_count']}.",
        "- Individual sub-centre names are not present in the source list; only the aggregate count is provided.",
        f"- Sonipat district hospitals with bed capacities extracted: {haryana['district_hospital_rows']}.",
        f"- Possible exact normalized duplicates: {sum(len(group['source_names']) for group in haryana['possible_duplicates'])}.",
        "",
        "### Manual review / parsing notes",
        "",
    ]
    if not haryana["manual_review_required"] and not haryana["parsing_errors"]:
        lines.append("- None.")
    for issue in haryana["manual_review_required"]:
        lines.append(f"- Page {issue['source_page']}: `{issue['facility_name']}` — {issue['note']}")
    for note in haryana["parsing_errors"]:
        lines.append(f"- {note}")

    lines.extend([
        "",
        "## PM-JAY Sonipat list (source date 2026-08-03)",
        "",
        f"- Expected numbered entries: {pmjay['expected_numbered_entries']}.",
        f"- Extracted rows: {pmjay['extracted_rows']}.",
        f"- Count matches: {pmjay['numbered_entry_count_matches']}.",
        f"- Missing entry numbers: {pmjay['missing_entry_numbers'] or 'None'}.",
        f"- Duplicate entry numbers: {pmjay['duplicate_entry_numbers'] or 'None'}.",
        f"- Missing field occurrences (ID/name/type/email/nodal officer/contact): {sum(len(items) for items in pmjay['missing_fields'].values())}.",
        f"- Duplicate hospital IDs: {pmjay['possible_duplicates']['hospital_id'] or 'None'}.",
        f"- Duplicate names after exact normalization: {pmjay['possible_duplicates']['hospital_name_exact_after_normalization'] or 'None'}.",
        f"- Similar-name review candidates (>= 0.90 string similarity): {pmjay['possible_duplicates']['similar_hospital_names_review_candidates'] or 'None'}.",
        "",
        "### Missing fields",
        "",
    ])
    if not pmjay["missing_fields"]:
        lines.append("- None in required ID/name/type/email/contact fields.")
    else:
        for field, records in pmjay["missing_fields"].items():
            lines.append(f"- `{field}` missing for: {records}")
    lines.extend(["", "### Parsing errors", ""])
    if not pmjay["parsing_errors"]:
        lines.append("- None.")
    else:
        lines.extend(f"- {error}" for error in pmjay["parsing_errors"])
    lines.extend(["", "## Output files", ""])
    lines.extend(f"- `{Path(path).name}`" for path in report["outputs"].values())
    return "\n".join(lines) + "\n"


def extract(raw_dir: Path, output_dir: Path) -> dict[str, Any]:
    haryana_path = raw_dir / HARYANA_PDF
    pmjay_path = raw_dir / PMJAY_PDF
    missing = [path.name for path in (haryana_path, pmjay_path) if not path.is_file()]
    if missing:
        raise FileNotFoundError(f"Missing required source PDF(s): {', '.join(missing)}")

    facilities, bed_rows, haryana_notes = parse_haryana_facilities(haryana_path)
    pmjay_rows, pmjay_validation = parse_pmjay(pmjay_path)

    paths = {
        "haryana_facilities_csv": output_dir / "haryana_sonipat_primary_facilities.csv",
        "haryana_hospital_beds_csv": output_dir / "haryana_sonipat_hospitals_beds.csv",
        "pmjay_hospitals_csv": output_dir / "sonipat_pmjay_empanelled_hospitals.csv",
        "validation_json": output_dir / "pdf_extraction_validation.json",
        "validation_markdown": output_dir / "pdf_extraction_validation.md",
    }
    write_csv(paths["haryana_facilities_csv"], FACILITY_FIELDS, facilities)
    write_csv(paths["haryana_hospital_beds_csv"], BED_FIELDS, bed_rows)
    write_csv(paths["pmjay_hospitals_csv"], PMJAY_FIELDS, pmjay_rows)
    report = build_report(raw_dir, paths, facilities, bed_rows, haryana_notes, pmjay_validation)
    output_dir.mkdir(parents=True, exist_ok=True)
    paths["validation_json"].write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    paths["validation_markdown"].write_text(render_markdown(report), encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    arguments = parser.parse_args()
    try:
        report = extract(arguments.raw_dir.resolve(), arguments.output_dir.resolve())
    except (OSError, ValueError, fitz.FileDataError) as error:
        print(f"Extraction failed: {error}", file=sys.stderr)
        return 1

    print(json.dumps({
        "outputs": report["outputs"],
        "haryana_facility_counts": report["sources"][HARYANA_PDF]["sonipat_named_facilities"]["counts_by_type"],
        "haryana_printed_counts": report["sources"][HARYANA_PDF]["sonipat_named_facilities"]["printed_counts"],
        "haryana_bed_rows": report["sources"][HARYANA_PDF]["sonipat_named_facilities"]["district_hospital_rows"],
        "pmjay_extracted_rows": report["sources"][PMJAY_PDF]["extracted_rows"],
        "pmjay_expected_rows": report["sources"][PMJAY_PDF]["expected_numbered_entries"],
        "pmjay_missing_entry_numbers": report["sources"][PMJAY_PDF]["missing_entry_numbers"],
        "pmjay_missing_fields": report["sources"][PMJAY_PDF]["missing_fields"],
        "pmjay_possible_duplicates": report["sources"][PMJAY_PDF]["possible_duplicates"],
        "pmjay_parsing_errors": report["sources"][PMJAY_PDF]["parsing_errors"],
    }, indent=2, ensure_ascii=False))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
