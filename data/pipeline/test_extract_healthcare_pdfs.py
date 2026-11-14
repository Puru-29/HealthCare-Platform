import csv
import tempfile
import unittest
from pathlib import Path

from extract_healthcare_pdfs import DEFAULT_RAW_DIR, extract


class PdfExtractionTests(unittest.TestCase):
    def test_supplied_documents_extract_expected_unverified_records(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            output_dir = Path(temporary_directory)
            report = extract(DEFAULT_RAW_DIR, output_dir)

            with (output_dir / "haryana_sonipat_primary_facilities.csv").open(
                encoding="utf-8-sig",
                newline="",
            ) as file:
                facilities = list(csv.DictReader(file))
            with (output_dir / "haryana_sonipat_hospitals_beds.csv").open(
                encoding="utf-8-sig",
                newline="",
            ) as file:
                hospitals = list(csv.DictReader(file))
            with (output_dir / "sonipat_pmjay_empanelled_hospitals.csv").open(
                encoding="utf-8-sig",
                newline="",
            ) as file:
                pmjay = list(csv.DictReader(file))

            named = [row for row in facilities if row["record_type"] == "named_facility"]
            counts = [row for row in facilities if row["record_type"] == "district_facility_count"]
            self.assertEqual(len(named), 37)
            self.assertEqual(len(counts), 3)
            self.assertEqual(len(hospitals), 4)
            self.assertEqual(len(pmjay), 76)
            self.assertEqual(
                [int(row["pdf_entry_number"]) for row in pmjay],
                list(range(1, 77)),
            )
            self.assertEqual(pmjay[0]["hospital_id"], "HOSP6G25147105")
            self.assertEqual(pmjay[0]["verification_status"], "unverified")
            self.assertEqual(
                [
                    (row["hospital_name"], int(row["bed_capacity"]))
                    for row in hospitals
                ],
                [
                    ("DCH Sonepat", 200),
                    ("SDCH Gohana", 100),
                    ("CH Kharkhoda", 50),
                    ("SDCH Ganaur", 50),
                ],
            )
            self.assertTrue(all(row["verification_status"] == "unverified" for row in named))
            self.assertTrue(all(row["verification_status"] == "unverified" for row in hospitals))
            self.assertTrue(all(row["verification_status"] == "unverified" for row in pmjay))
            self.assertTrue(all(
                row["extraction_review_status"] == "needs_manual_review"
                for row in named if row["facility_name"] in {"Sargathal", "Shamri"}
            ))
            self.assertEqual(
                report["sources"]["202608041074356704.pdf"]["missing_entry_numbers"],
                [],
            )
            self.assertEqual(
                report["sources"]["202608041074356704.pdf"]["missing_fields"],
                {},
            )

            generated_files = sorted(output_dir.glob("*.csv"))
            first_pass = {path.name: path.read_bytes() for path in generated_files}
            extract(DEFAULT_RAW_DIR, output_dir)
            self.assertEqual(
                first_pass,
                {path.name: path.read_bytes() for path in generated_files},
            )


if __name__ == "__main__":
    unittest.main()
