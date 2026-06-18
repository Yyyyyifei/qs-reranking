#!/usr/bin/env python3
"""Extract QS ranking data from the source XLSX into browser-friendly JSON."""

from __future__ import annotations

import json
import re
import statistics
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "2027 QS World University Rankings 1.1 (For qs.com).xlsx"
DATA_DIR = ROOT / "data"
OUT_DATA = DATA_DIR / "qs2027.json"
OUT_REPORT = DATA_DIR / "reproduction_report.json"

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

INDICATORS = [
    {"key": "ar", "label": "Academic Reputation", "column": "AR SCORE", "defaultWeight": 30, "lens": "Research and Discovery"},
    {"key": "cpf", "label": "Citations per Faculty", "column": "CPF SCORE", "defaultWeight": 20, "lens": "Research and Discovery"},
    {"key": "er", "label": "Employer Reputation", "column": "ER SCORE", "defaultWeight": 15, "lens": "Employability and Outcomes"},
    {"key": "eo", "label": "Employment Outcomes", "column": "EO SCORE", "defaultWeight": 5, "lens": "Employability and Outcomes"},
    {"key": "fsr", "label": "Faculty Student Ratio", "column": "FSR SCORE", "defaultWeight": 10, "lens": "Learning Experience"},
    {"key": "ifr", "label": "International Faculty Ratio", "column": "IFR SCORE", "defaultWeight": 5, "lens": "Global Engagement"},
    {"key": "irn", "label": "International Research Network", "column": "IRN SCORE", "defaultWeight": 5, "lens": "Global Engagement"},
    {"key": "isr", "label": "International Student Ratio", "column": "ISR SCORE", "defaultWeight": 5, "lens": "Global Engagement"},
    {"key": "sus", "label": "Sustainability", "column": "SUS SCORE", "defaultWeight": 5, "lens": "Sustainability"},
]

LENSES = [
    {"label": "Research and Discovery", "defaultWeight": 50},
    {"label": "Employability and Outcomes", "defaultWeight": 20},
    {"label": "Learning Experience", "defaultWeight": 10},
    {"label": "Global Engagement", "defaultWeight": 15},
    {"label": "Sustainability", "defaultWeight": 5},
]


def column_index(cell_ref: str) -> int:
    letters = re.match(r"[A-Z]+", cell_ref).group(0)
    value = 0
    for letter in letters:
        value = value * 26 + ord(letter) - 64
    return value - 1


def parse_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    except KeyError:
        return []

    strings = []
    for item in root.findall(f"{NS}si"):
        strings.append("".join(text.text or "" for text in item.iter(f"{NS}t")))
    return strings


def cell_value(cell: ET.Element, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    value = cell.find(f"{NS}v")

    if cell_type == "s" and value is not None:
        return shared_strings[int(value.text)]
    if cell_type == "inlineStr":
        inline = cell.find(f"{NS}is")
        if inline is not None:
            return "".join(text.text or "" for text in inline.iter(f"{NS}t"))
    if value is not None and value.text is not None:
        return value.text
    return ""


def read_rows(path: Path) -> list[list[str]]:
    with zipfile.ZipFile(path) as zf:
        shared_strings = parse_shared_strings(zf)
        root = ET.fromstring(zf.read("xl/worksheets/sheet1.xml"))

    rows: list[list[str]] = []
    for row in root.findall(f".//{NS}row"):
        values: list[str] = []
        for cell in row.findall(f"{NS}c"):
            idx = column_index(cell.attrib["r"])
            while len(values) <= idx:
                values.append("")
            values[idx] = cell_value(cell, shared_strings)
        rows.append(values)
    return rows


def as_float(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(str(value).replace(",", ""))
    except ValueError:
        return None


def as_rank(value: str | None) -> int | None:
    if value is None or value == "":
        return None
    match = re.match(r"\d+", str(value))
    return int(match.group(0)) if match else None


def competition_ranks(records: list[dict], score_key: str) -> dict[int, int]:
    ordered = sorted(records, key=lambda item: (-(item[score_key] or -1), item["officialRank"] or 10**9, item["name"]))
    ranks: dict[int, int] = {}
    previous_score = None
    previous_rank = 0
    for position, record in enumerate(ordered, start=1):
        score = round(record[score_key] or 0, 8)
        rank = previous_rank if score == previous_score else position
        ranks[record["id"]] = rank
        previous_score = score
        previous_rank = rank
    return ranks


def main() -> int:
    if not SOURCE.exists():
        print(f"Missing source workbook: {SOURCE}", file=sys.stderr)
        return 1

    rows = read_rows(SOURCE)
    if len(rows) < 4:
        print("Workbook did not contain the expected QS table.", file=sys.stderr)
        return 1

    headers = rows[2]
    header_index = {name: idx for idx, name in enumerate(headers) if name}
    score_columns = [name for name in headers if "score" in name.lower() and "rank" not in name.lower()]
    rank_columns = [name for name in headers if "rank" in name.lower()]

    missing = [indicator["column"] for indicator in INDICATORS if indicator["column"] not in header_index]
    if missing:
        print(f"Missing expected indicator columns: {missing}", file=sys.stderr)
        return 1

    records = []
    for raw in rows[3:]:
        if not raw or not any(raw):
            continue

        def pick(name: str) -> str:
            idx = header_index.get(name)
            return raw[idx] if idx is not None and idx < len(raw) else ""

        index_value = as_rank(pick("Index"))
        name = pick("Name")
        if not index_value or not name:
            continue

        scores = {indicator["key"]: as_float(pick(indicator["column"])) for indicator in INDICATORS}
        weighted_score = sum((scores[key] or 0) * indicator["defaultWeight"] for indicator in INDICATORS for key in [indicator["key"]]) / 100
        official_score = as_float(pick("Overall SCORE"))
        official_rank = as_rank(pick("Rank"))
        previous_rank = as_rank(pick("Previous Rank"))

        records.append(
            {
                "id": index_value,
                "officialRank": official_rank,
                "previousRank": previous_rank,
                "name": name,
                "country": pick("Country/Territory"),
                "region": pick("Region"),
                "classification": {
                    "size": pick("Size"),
                    "focus": pick("Focus"),
                    "research": pick("Research"),
                    "status": pick("Status"),
                },
                "scores": scores,
                "officialOverallScore": official_score,
                "defaultWeightedScore": round(weighted_score, 4),
                "defaultNormalizedScore": None,
                "officialRankText": pick("Rank"),
            }
        )

    max_default_score = max(record["defaultWeightedScore"] for record in records)
    for record in records:
        record["defaultNormalizedScore"] = round(record["defaultWeightedScore"] / max_default_score * 100, 4)

    default_ranks = competition_ranks(records, "defaultWeightedScore")
    raw_score_errors = [
        abs(record["defaultWeightedScore"] - record["officialOverallScore"])
        for record in records
        if record["officialOverallScore"] is not None
    ]
    normalized_score_errors = [
        abs(round(record["defaultNormalizedScore"], 1) - record["officialOverallScore"])
        for record in records
        if record["officialOverallScore"] is not None
    ]
    rank_deltas = [
        abs(default_ranks[record["id"]] - record["officialRank"])
        for record in records
        if record["officialRank"] is not None
    ]

    top_mismatches = sorted(
        (
            {
                "name": record["name"],
                "officialRank": record["officialRank"],
                "computedRank": default_ranks[record["id"]],
                "officialScore": record["officialOverallScore"],
                "rawWeightedScore": record["defaultWeightedScore"],
                "computedScore": round(record["defaultNormalizedScore"], 1),
                "scoreDelta": round(round(record["defaultNormalizedScore"], 1) - record["officialOverallScore"], 4),
            }
            for record in records
            if record["officialOverallScore"] is not None
        ),
        key=lambda item: (abs(item["scoreDelta"]), abs(item["computedRank"] - item["officialRank"])),
        reverse=True,
    )[:20]

    report = {
        "sourceWorkbook": SOURCE.name,
        "rowCount": len(records),
        "headerRow": 3,
        "scoreColumns": score_columns,
        "rankingColumns": rank_columns,
        "indicatorColumns": [
            {
                "key": indicator["key"],
                "label": indicator["label"],
                "column": indicator["column"],
                "defaultWeight": indicator["defaultWeight"],
                "lens": indicator["lens"],
            }
            for indicator in INDICATORS
        ],
        "omittedScoreColumns": [column for column in score_columns if column not in {item["column"] for item in INDICATORS}],
        "reproduction": {
            "method": "Weighted sum of rounded workbook indicator scores using QS 2027 indicator weights, then normalized so the highest computed weighted score is 100.",
            "defaultWeightTotal": sum(item["defaultWeight"] for item in INDICATORS),
            "maxRawWeightedScore": round(max_default_score, 4),
            "rawMeanAbsoluteScoreError": round(statistics.fmean(raw_score_errors), 4),
            "rawMaxAbsoluteScoreError": round(max(raw_score_errors), 4),
            "normalizedMeanAbsoluteScoreError": round(statistics.fmean(normalized_score_errors), 4),
            "normalizedMaxAbsoluteScoreError": round(max(normalized_score_errors), 4),
            "exactOneDecimalScoreMatches": sum(
                1 for record in records if round(record["defaultNormalizedScore"], 1) == record["officialOverallScore"]
            ),
            "meanAbsoluteRankDelta": round(statistics.fmean(rank_deltas), 4),
            "exactRankMatches": sum(
                1 for record in records if record["officialRank"] is not None and default_ranks[record["id"]] == record["officialRank"]
            ),
            "topMismatches": top_mismatches,
            "note": "Differences are expected because the workbook exposes rounded indicator scores; QS likely calculates official overall scores from higher-precision source values and tie rules.",
        },
    }

    payload = {
        "metadata": {
            "title": "QS World University Rankings 2027",
            "sourceWorkbook": SOURCE.name,
            "generatedFrom": "scripts/extract_qs_data.py",
            "rowCount": len(records),
        },
        "lenses": LENSES,
        "indicators": report["indicatorColumns"],
        "universities": records,
    }

    DATA_DIR.mkdir(exist_ok=True)
    OUT_DATA.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Wrote {OUT_DATA.relative_to(ROOT)} with {len(records)} universities.")
    print(f"Wrote {OUT_REPORT.relative_to(ROOT)}.")
    print("Indicator score columns:")
    for indicator in report["indicatorColumns"]:
        print(f"- {indicator['column']}: {indicator['label']} ({indicator['defaultWeight']}%)")
    print("Omitted score columns:", ", ".join(report["omittedScoreColumns"]) or "none")
    print("Reproduction:", json.dumps(report["reproduction"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
