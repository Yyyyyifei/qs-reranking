# QS 2027 Re-Ranker

Static ranking workbench built from `2027 QS World University Rankings 1.1 (For qs.com).xlsx`.

## Data Source

Source data comes from the local workbook:

`2027 QS World University Rankings 1.1 (For qs.com).xlsx`

The workbook is QS World University Rankings 2027 reference data prepared for qs.com. QS ranking names, source indicators, official ranks, and official scores belong to QS Quacquarelli Symonds. This project only reuses the provided workbook locally to explore alternative weighting methods.

## Disclaimer / 免责提醒

This is an unofficial, non-commercial, for-fun ranking explorer.

- Not affiliated with, endorsed by, or sponsored by QS.
- Not for profit and not intended for admissions, employment, investment, policy, or other formal decisions.
- No redistribution: do not redistribute the original workbook, extracted dataset, or derived ranking data outside an authorized/local context.
- Custom rankings are experimental. They depend on user-selected weights and rounded workbook indicator scores, so they should not be treated as official QS results.
- 免责提醒：本工具仅供个人学习、探索和娱乐使用，不代表 QS 官方排名，不应用于正式决策，也不应对原始数据或派生数据进行再分发或商业使用。

## Data Extraction

Run:

```bash
python3 scripts/extract_qs_data.py
```

This creates:

- `data/qs2027.json`: normalized browser data for the app.
- `data/reproduction_report.json`: extracted score columns and QS-weight reproduction diagnostics.

## Indicator Columns

The custom ranking uses score fields only:

- `AR SCORE`: Academic Reputation, 30%
- `CPF SCORE`: Citations per Faculty, 20%
- `ER SCORE`: Employer Reputation, 15%
- `EO SCORE`: Employment Outcomes, 5%
- `FSR SCORE`: Faculty Student Ratio, 10%
- `IFR SCORE`: International Faculty Ratio, 5%
- `IRN SCORE`: International Research Network, 5%
- `ISR SCORE`: International Student Ratio, 5%
- `SUS SCORE`: Sustainability, 5%

`Overall SCORE` is preserved for comparison but is not used as an input indicator.