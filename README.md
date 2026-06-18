# QS 2027 Re-Ranker

Static ranking workbench built from `2027 QS World University Rankings 1.1 (For qs.com).xlsx`.

## Data Source

Source data comes from the local workbook:

`2027 QS World University Rankings 1.1 (For qs.com).xlsx`

The workbook is QS World University Rankings 2027 reference data prepared for qs.com. Public ranking list: [QS World University Rankings 2027](https://www.topuniversities.com/world-university-rankings). QS ranking names, source indicators, official ranks, and official scores belong to QS Quacquarelli Symonds. This project only reuses the provided workbook locally to explore alternative weighting methods.

## Disclaimer / 免责提醒

This is an unofficial, non-commercial, for-fun ranking explorer.

- Not affiliated with, endorsed by, or sponsored by QS.
- Not for profit and not intended for admissions, employment, investment, policy, or other formal decisions.
- No redistribution: do not redistribute the original workbook, extracted dataset, or derived ranking data outside an authorized/local context.
- Custom rankings are experimental. They depend on user-selected weights and rounded workbook indicator scores, so they should not be treated as official QS results.
- 免责提醒：本工具仅供个人学习、探索和娱乐使用，不代表 QS 官方排名，不应用于正式决策，也不应对原始数据或派生数据进行再分发或商业使用。

## Acknowledgements

- Data source: QS World University Rankings 2027 reference workbook and public ranking list from QS / TopUniversities.
- Built with OpenAI Codex as a vibe-coding collaborator for data extraction, interface design, and implementation.

## Search Visibility

The local `http://localhost:8000/` version cannot be indexed by Google. To make the site searchable:

Current public URL: [https://yyyyyifei.github.io/qs-reranking/](https://yyyyyifei.github.io/qs-reranking/)

1. Deploy the static files to a public HTTPS URL, such as GitHub Pages, Netlify, Vercel, or another static host.
2. Generate crawl files with your deployed URL:

```bash
python3 scripts/generate_sitemap.py https://your-public-site.example
```

3. Commit and deploy the generated `sitemap.xml` and updated `robots.txt`.
4. Add the deployed site to [Google Search Console](https://search.google.com/search-console), verify ownership, and submit `https://your-public-site.example/sitemap.xml`.

The page includes search metadata, Open Graph tags, Twitter card metadata, structured data, `robots.txt`, and a sitemap generator.

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
