# Data terms (DRAFT)

> **OWNER REVIEW REQUIRED. This is a draft and is not legal advice. It must be read and approved by the owner (and, if wanted, a lawyer) before the repository is made public.**

## What the MIT licence covers

The [MIT licence](LICENSE) in this repository covers the **code only**: the workflows, the MCP server, the tests and the documentation text.

It does **not** cover Starlecta data. The sample files in this repository (`fixtures/`, `mcp-server/test/fixtures/`) are **synthetic test data**. They are not real measurements and are not published Starlecta data. This repository ships synthetic fixtures and code only, apart from one short Trend Cloud excerpt (public aggregate counts from starlecta.com, dated 2026-10-30) shown in the README and `live/WALKTHROUGH.md`; the live tools themselves are governed by the [terms of use](https://starlecta.com/en/terms) and the key terms in [auth.md](https://starlecta.com/auth.md). Synthetic fixtures may carry `"source_url": null`, which means "not published"; published editions, when they exist, carry their own source links.

## Published Starlecta data

Starlecta may in future publish open data editions (for example creator samples and engagement benchmarks) on starlecta.com. No such data is included in this repository. When an edition is published, it is governed by these terms, not by MIT:

1. **Attribution.** If you use or show the data, credit "Starlecta (starlecta.com)" and state the edition's **data date** (`data_as_of`: the dates of the data edition or record, not the time a metric was measured) and the method version.
2. **No resale or bulk redistribution.** You may not sell the data, repackage it as a competing dataset, or republish it in bulk (whole files, whole pools or large extracts). Quoting individual values with attribution is fine.
3. **Data date.** Values are as of the stated data date (the date of the edition or record). They are not live figures and not a guarantee of future results, sales or reach. Do not present old values as current.
4. **No invented values.** Where a value is missing, suppressed or "in preparation", it must stay missing in anything you build. Do not fill gaps with estimates presented as Starlecta data.
5. **Expiry and removal.** Each edition is served only until its `serve_until` date. Editions may be revised or withdrawn; stop using withdrawn data when notified or when it is no longer listed.
6. **Removal requests.** A person or brand shown in the data can ask for removal at **support@starlecta.com**. We will act on such requests and the entry will not appear in later editions.
7. **No warranty.** Data is provided "as is", without warranty of any kind.

## Contact

support@starlecta.com
