const REPORT_OVERVIEW_STYLES = `    :root {
      --ink: #162033;
      --muted: #6c7789;
      --line: #dfe6ef;
      --paper: #f7f9fc;
      --panel: #ffffff;
      --pass: #0f9f6e;
      --fail: #d93f3f;
      --skipped: #64748b;
      --blocked: #b45309;
      --inconclusive: #7c3aed;
      --unknown: #7c8798;
      --navy: #090222;
      --blue: #0e61d8;
      --shadow: 0 18px 60px rgba(22, 32, 51, 0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(14, 97, 216, 0.18), transparent 34rem),
        linear-gradient(180deg, #eef4fb 0%, var(--paper) 24rem);
      font: 16px/1.5 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    a { color: inherit; }
    .hero {
      padding: 3rem clamp(1rem, 4vw, 4rem) 2rem;
      color: white;
      background:
        linear-gradient(135deg, rgba(9, 2, 34, 0.96), rgba(13, 45, 88, 0.94)),
        radial-gradient(circle at 70% 10%, rgba(255, 255, 255, 0.2), transparent 20rem);
    }
    .hero-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(16rem, 25rem);
      gap: 1.5rem;
      align-items: start;
    }
    .hero h1 {
      margin: 0 0 0.5rem;
      font-size: clamp(2.2rem, 5vw, 4.7rem);
      letter-spacing: -0.06em;
      line-height: 0.95;
    }
    .hero p { margin: 0; color: rgba(255, 255, 255, 0.72); }
    .hero-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-top: 1.5rem;
    }
    .hero-meta span {
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 999px;
      padding: 0.45rem 0.75rem;
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.86);
    }
    .hero-meta .stale-report {
      border-color: rgba(251, 191, 36, 0.7);
      background: rgba(146, 64, 14, 0.42);
      color: #fef3c7;
    }
    .report-switcher {
      position: relative;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 1rem;
      background: rgba(255, 255, 255, 0.08);
      color: white;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.14);
    }
    .report-switcher summary {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 0.75rem;
      align-items: center;
      padding: 0.85rem 1rem;
      cursor: pointer;
      list-style: none;
    }
    .report-switcher summary::-webkit-details-marker { display: none; }
    .report-switcher-copy {
      display: grid;
      gap: 0.08rem;
      min-width: 0;
    }
    .report-switcher-copy strong,
    .report-run-copy strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .report-switcher-eyebrow,
    .report-menu-heading {
      font-size: 0.76rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-weight: 900;
    }
    .report-switcher-copy small {
      color: rgba(255, 255, 255, 0.7);
      font-size: 0.78rem;
      font-weight: 700;
    }
    .report-switcher-toggle {
      display: grid;
      place-items: center;
      width: 1.65rem;
      height: 1.65rem;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.14);
      font-weight: 900;
      transition: transform 150ms ease;
    }
    .report-switcher[open] .report-switcher-toggle { transform: rotate(180deg); }
    .report-menu {
      position: absolute;
      z-index: 20;
      top: calc(100% + 0.65rem);
      right: 0;
      width: min(28rem, calc(100vw - 2rem));
      padding: 0.85rem;
      border: 1px solid rgba(215, 226, 241, 0.95);
      border-radius: 1rem;
      background: rgba(255, 255, 255, 0.98);
      color: var(--ink);
      box-shadow: 0 24px 60px rgba(8, 22, 47, 0.25);
      backdrop-filter: blur(16px);
    }
    .report-menu-heading {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 0.15rem 0 0.45rem;
      color: var(--muted);
    }
    .report-menu-heading span {
      border-radius: 999px;
      padding: 0.1rem 0.45rem;
      background: #edf3fb;
      color: var(--blue);
      font-size: 0.72rem;
    }
    .viewing-heading { margin-top: 0.85rem; }
    .archived-heading { margin-top: 0.95rem; }
    .report-latest,
    .report-run {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      align-items: center;
      padding: 0.7rem 0.75rem;
      border: 1px solid var(--line);
      border-radius: 0.8rem;
      color: var(--ink);
      text-decoration: none;
      transition: border-color 150ms ease, background 150ms ease, transform 150ms ease;
    }
    .report-latest {
      border-color: rgba(40, 109, 222, 0.5);
      background: linear-gradient(135deg, #e8f1ff, #f6faff);
    }
    .report-run-list {
      display: grid;
      gap: 0.4rem;
      max-height: min(23rem, 52vh);
      overflow: auto;
      padding-right: 0.15rem;
    }
    .report-run { border-radius: 0.7rem; }
    .report-latest:hover,
    .report-run:hover {
      border-color: rgba(14, 97, 216, 0.55);
      background: #f3f8ff;
      transform: translateX(-2px);
    }
    .report-latest.is-viewing,
    .report-run.is-viewing {
      border-color: rgba(14, 97, 216, 0.75);
      box-shadow: inset 3px 0 0 var(--blue);
    }
    .report-run-copy {
      display: grid;
      min-width: 0;
      gap: 0.1rem;
    }
    .report-run-copy small {
      color: var(--muted);
      font-size: 0.78rem;
      font-weight: 700;
    }
    .report-menu-empty {
      margin: 0;
      padding: 0.75rem;
      color: var(--muted);
      font-weight: 700;
    }
    main { padding: 2rem clamp(1rem, 4vw, 4rem) 4rem; }
    .stats {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 1rem;
      margin-top: -3.5rem;
    }
    .stat, .panel, .test-section {
      background: rgba(255, 255, 255, 0.9);
      border: 1px solid rgba(223, 230, 239, 0.85);
      border-radius: 1.3rem;
      box-shadow: var(--shadow);
    }
    .stat { padding: 1.2rem; }
    .stat span { display: block; color: var(--muted); font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.08em; }
    .stat strong { display: block; margin-top: 0.35rem; font-size: 2rem; line-height: 1; }
    .sticky-summary {
      position: sticky;
      top: 0.75rem;
      z-index: 5;
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem;
      align-items: center;
      margin: 1rem 0 1.5rem;
      padding: 0.7rem;
      border: 1px solid rgba(223, 230, 239, 0.92);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.88);
      box-shadow: 0 12px 36px rgba(22, 32, 51, 0.1);
      backdrop-filter: blur(14px);
    }
    .sticky-summary strong,
    .sticky-summary span {
      border-radius: 999px;
      padding: 0.35rem 0.65rem;
      background: #f4f7fb;
      font-weight: 800;
    }
    button {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 0.55rem 0.8rem;
      background: #edf4ff;
      color: var(--blue);
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }
    .overview-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) minmax(16rem, 0.8fr);
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .overview-grid .panel {
      margin-bottom: 0;
    }
    .phase-panel, .cleanup-panel { margin-bottom:1.5rem; padding:1.25rem; }
    .phase-panel .meta-grid { margin-bottom:0; }
    .cleanup-panel.fail { border-color:rgba(217,63,63,.42); background:#fff7f7; }
    .panel-heading {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: start;
      margin-bottom: 1rem;
    }
    .panel-heading h2,
    .panel h2 {
      margin: 0;
      letter-spacing: -0.04em;
    }
    .panel-heading p {
      margin: 0;
      color: var(--muted);
      font-weight: 700;
    }
    .lane-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
      gap: 0.8rem;
    }
    .lane-card {
      border: 1px solid var(--line);
      border-radius: 1rem;
      padding: 0.9rem;
      background: #fbfdff;
    }
    .lane-card.fail {
      border-color: rgba(217, 63, 63, 0.42);
      background: #fff7f7;
    }
    .lane-card h3 {
      margin: 0.2rem 0 0.8rem;
      line-height: 1.1;
    }
    .lane-card dl,
    .run-environment dl {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.55rem;
      margin: 0;
    }
    .lane-card dl div {
      border: 1px solid var(--line);
      border-radius: 0.7rem;
      padding: 0.55rem;
      background: white;
    }
    .eyebrow {
      color: var(--muted);
      font-size: 0.75rem;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .slow-list {
      display: grid;
      gap: 0.55rem;
    }
    .slow-list a {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      border: 1px solid var(--line);
      border-radius: 0.8rem;
      padding: 0.65rem;
      background: #fbfdff;
      text-decoration: none;
    }
    .slow-list span {
      color: var(--muted);
      font-weight: 700;
      text-align: right;
    }
    .comparison-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.55rem;
      margin-bottom: 0.8rem;
    }
    .comparison-grid div {
      border: 1px solid var(--line);
      border-radius: 0.8rem;
      padding: 0.65rem;
      background: #fbfdff;
    }
    .comparison-list {
      display: grid;
      gap: 0.55rem;
    }
    .comparison-list a {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      border: 1px solid var(--line);
      border-radius: 0.8rem;
      padding: 0.65rem;
      background: #fbfdff;
      text-decoration: none;
    }
    .comparison-list a.fail { border-color: rgba(217, 63, 63, 0.42); background: #fff7f7; }
    .comparison-list a.pass { border-color: rgba(15, 159, 110, 0.32); background: #f2fbf7; }
    .comparison-list a.slow { border-color: rgba(245, 158, 11, 0.42); background: #fffbeb; }
    .comparison-list span {
      color: var(--muted);
      font-weight: 800;
      text-align: right;
    }
    .category-list {
      display: grid;
      gap: 0.65rem;
    }
    .category-row {
      display: grid;
      grid-template-columns: 7rem minmax(4rem, 1fr) 2rem;
      gap: 0.75rem;
      align-items: center;
      color: var(--muted);
      font-weight: 900;
    }
    .category-row div {
      height: 0.7rem;
      overflow: hidden;
      border-radius: 999px;
      background: #edf2f7;
    }
    .category-row i {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--fail);
    }
    .report-insights {
      margin-bottom: 1.5rem;
    }
    .report-insights > summary {
      cursor: pointer;
      color: var(--ink);
      font-weight: 900;
      letter-spacing: -0.02em;
    }
    .insight-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
      gap: 1.25rem;
      margin-top: 1.25rem;
    }
    .compact {
      grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
      margin-bottom: 0;
    }
    .toolbar {
      display: grid;
      grid-template-columns: minmax(12rem, 1fr) 12rem 14rem repeat(3, max-content);
      gap: 0.75rem;
      margin: 1.5rem 0;
      align-items: center;
    }
    input, select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 0.9rem;
      padding: 0.85rem 1rem;
      background: white;
      color: var(--ink);
      font: inherit;
    }
    .check-filter {
      display: inline-flex;
      gap: 0.4rem;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 0.65rem 0.8rem;
      background: white;
      color: var(--muted);
      font-weight: 800;
      white-space: nowrap;
    }
    .check-filter input {
      width: auto;
    }
    .test-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .test-card {
      display: block;
      text-decoration: none;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 1.2rem;
      transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
    }
    .test-card-summary { min-height: 11rem; padding: 1rem; cursor: pointer; list-style: none; }
    .test-card-summary::-webkit-details-marker { display: none; }
    .test-card-evidence { display: grid; gap: .75rem; padding: 1rem; border-top: 1px solid var(--line); }
    .test-card-evidence p { margin: 0; white-space: pre-wrap; }
    .test-card-evidence code { overflow-x: auto; border-radius: .65rem; padding: .65rem; background: #101828; color: #e9f1ff; white-space: nowrap; }
    .test-card-evidence a { justify-self: start; color: var(--blue); font-weight: 800; text-decoration: none; }
    .test-card-evidence .evidence-error { color: #8f2424; font-weight: 700; }
    .test-card:hover { transform: translateY(-3px); box-shadow: var(--shadow); border-color: rgba(14, 97, 216, 0.4); }
    .test-card.fail { border-color: rgba(217, 63, 63, 0.45); }
    .test-card.slow { border-color: rgba(245, 158, 11, 0.55); }
    .test-card-top {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: center;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 0.25rem 0.6rem;
      color: white;
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.04em;
    }
    .status-pill.pass { background: var(--pass); }
    .status-pill.fail { background: var(--fail); }
    .status-pill.skipped { background: var(--skipped); }
    .status-pill.blocked { background: var(--blocked); }
    .status-pill.inconclusive { background: var(--inconclusive); }
    .status-pill.unknown { background: var(--unknown); }
    .slow-pill { background: #d97706; margin-left: 0.35rem; }
    .duration, .muted, .test-card p, .screenshot-count { color: var(--muted); }
    .test-card h3 { margin: 1.1rem 0 0.35rem; font-size: 1.35rem; line-height: 1.1; }
    .card-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-top: 1rem;
      color: var(--muted);
      font-size: 0.9rem;
      font-weight: 800;
    }
    .card-tags span {
      border-radius: 999px;
      padding: 0.25rem 0.55rem;
      background: #f4f7fb;
    }
    .panel { padding: 1.25rem; margin-bottom: 1.5rem; }
    .evidence-decision { display: grid; grid-template-columns: auto minmax(0,1fr); gap: 1rem; align-items: center; }
    .decision-badge { display: grid; place-items: center; min-width: 8rem; min-height: 5rem; border-radius: 1rem; color: white; font-size: 1.05rem; font-weight: 900; letter-spacing: .05em; }
    .decision-badge.pass { background: var(--pass); }
    .decision-badge.fail { background: var(--fail); }
    .decision-badge.warning { background: var(--blocked); }
    .decision-badge.unknown { background: var(--inconclusive); }
    .decision-copy h2 { margin: 0 0 .25rem; }
    .decision-copy p { margin: 0; color: var(--muted); font-weight: 700; }
    .decision-facts { display: flex; flex-wrap: wrap; gap: .45rem; margin-top: .75rem; }
    .decision-facts span { border-radius: 999px; padding: .28rem .58rem; background: #eef3f9; color: var(--ink); font-size: .82rem; font-weight: 800; }
    .coverage-panel table { width: 100%; border-collapse: collapse; }
    .coverage-panel th, .coverage-panel td { padding: .65rem; border-top: 1px solid var(--line); text-align: left; }
    .coverage-panel thead th { border-top: 0; color: var(--muted); font-size: .75rem; letter-spacing: .06em; text-transform: uppercase; }
    .coverage-scroll { overflow-x: auto; }
    .coverage-class { border-radius: 999px; padding: .2rem .5rem; background: #eef3f9; font-size: .78rem; font-weight: 800; text-transform: capitalize; white-space: nowrap; }
    .coverage-fallback > p { margin-bottom: 0; color: var(--muted); }
    .failures a {
      display: grid;
      gap: 0.25rem;
      padding: 0.85rem 0;
      border-top: 1px solid var(--line);
      text-decoration: none;
    }
    .failures span {
      color: var(--muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .failures em {
      justify-self: start;
      border-radius: 999px;
      padding: 0.2rem 0.5rem;
      background: #fff5f5;
      color: #a32929;
      font-size: 0.75rem;
      font-style: normal;
      font-weight: 900;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .test-section {
      margin-top: 1.5rem;
      overflow: hidden;
    }
    .section-summary {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 1rem;
      padding: clamp(1rem, 3vw, 1.6rem);
      cursor: pointer;
      list-style: none;
    }
    .section-summary::-webkit-details-marker { display: none; }
    .section-summary h2 {
      margin: 0.5rem 0 0;
      font-size: clamp(1.5rem, 3vw, 2.35rem);
      letter-spacing: -0.04em;
    }
    .section-summary p {
      margin: 0.35rem 0 0;
      color: var(--muted);
      font-weight: 700;
    }
    .summary-meta {
      display: flex;
      flex-wrap: wrap;
      justify-content: end;
      gap: 0.55rem;
      color: var(--muted);
      font-weight: 800;
    }
    .summary-meta span {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 0.35rem 0.65rem;
      background: #fbfdff;
    }
    .collapse-label {
      color: var(--blue);
    }
    .collapse-label::before {
      content: 'Open ';
    }
    .test-section[open] .collapse-label::before {
      content: 'Close ';
    }
    .test-section-body {
      padding: 0 clamp(1rem, 3vw, 1.6rem) clamp(1rem, 3vw, 1.6rem);
      border-top: 1px solid var(--line);
    }
    .test-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.65rem;
      align-items: center;
      margin: 1rem 0;
    }
    .markdown-link {
      display: inline-flex;
      border-radius: 999px;
      padding: 0.55rem 0.8rem;
      background: #edf4ff;
      color: var(--blue);
      font-weight: 700;
      text-decoration: none;
    }
    .command-box,
    .failure-timeline,
    .compare-box,
    .history-box {
      border: 1px solid var(--line);
      border-radius: 1rem;
      background: #fbfdff;
      padding: 1rem;
      margin-bottom: 1.25rem;
    }
    .command-box h4,
    .failure-timeline h4,
    .compare-box h4,
    .history-box h4 {
      margin: 0 0 0.5rem;
    }
    .command-box code {
      display: block;
      overflow-x: auto;
      border-radius: 0.75rem;
      padding: 0.8rem;
      background: #101828;
      color: #e9f1ff;
      white-space: nowrap;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
      gap: 0.75rem;
      margin: 0 0 1.25rem;
    }
    .meta-grid div {
      border: 1px solid var(--line);
      border-radius: 0.9rem;
      padding: 0.75rem;
      background: #fbfdff;
    }
    dt { color: var(--muted); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; }
    dd { margin: 0.25rem 0 0; font-weight: 700; }
    .failure-box {
      border: 1px solid rgba(217, 63, 63, 0.28);
      border-radius: 1rem;
      background: #fff5f5;
      padding: 1rem;
      margin-bottom: 1.25rem;
    }
    .timeline-strip,
    .compare-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
      gap: 0.8rem;
    }
    .timeline-strip a,
    .compare-grid figure {
      margin: 0;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 0.9rem;
      background: white;
      text-decoration: none;
    }
    .timeline-strip span {
      display: block;
      padding: 0.5rem 0.65rem;
      color: var(--muted);
      font-size: 0.75rem;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .timeline-failed {
      border-color: rgba(217, 63, 63, 0.62) !important;
      box-shadow: 0 14px 36px rgba(217, 63, 63, 0.18);
    }
    .timeline-strip img,
    .compare-grid img {
      display: block;
      width: 100%;
      height: 18rem;
      object-fit: contain;
      background: #111827;
    }
    .history-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
      gap: 0.65rem;
    }
    .history-list a {
      display: grid;
      gap: 0.35rem;
      border: 1px solid var(--line);
      border-radius: 0.85rem;
      padding: 0.75rem;
      background: white;
      text-decoration: none;
    }
    .history-list small {
      color: var(--muted);
      font-weight: 800;
    }
    pre {
      overflow: auto;
      white-space: pre-wrap;
      margin: 0;
      color: #7a2020;
      font-size: 0.9rem;
    }
    .steps-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
      gap: 1rem;
    }
    .step {
      margin: 0;
      border: 1px solid var(--line);
      border-radius: 1rem;
      overflow: hidden;
      background: white;
    }
    .failed-step {
      border: 3px solid var(--fail);
      box-shadow: 0 18px 50px rgba(217, 63, 63, 0.24);
      position: relative;
    }
    .failed-step::before {
      content: 'Failed here';
      position: absolute;
      z-index: 1;
      top: 0.8rem;
      left: 0.8rem;
      border-radius: 999px;
      padding: 0.35rem 0.7rem;
      background: var(--fail);
      color: white;
      font-size: 0.78rem;
      font-weight: 900;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      box-shadow: 0 10px 28px rgba(217, 63, 63, 0.3);
    }
    .step img {
      display: block;
      width: 100%;
      height: min(34rem, 68vh);
      object-fit: contain;
      background: #111827;
    }
    figcaption {
      display: grid;
      gap: 0.2rem;
      padding: 0.85rem;
      color: var(--ink);
      font-weight: 700;
    }
    figcaption span {
      color: var(--muted);
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .step-error {
      margin-top: 0.65rem;
      border-radius: 0.75rem;
      padding: 0.75rem;
      background: #fff5f5;
      color: #7a2020;
      font-size: 0.82rem;
      font-weight: 600;
      text-transform: none;
      letter-spacing: 0;
    }
    [hidden] { display: none !important; }
    @media (max-width: 780px) {
      .stats, .toolbar, .overview-grid { grid-template-columns: 1fr; }
      .sticky-summary { border-radius: 1rem; }
      .hero-layout { grid-template-columns: 1fr; }
      .hero { padding-top: 2rem; }
      .report-menu { right: auto; left: 0; }
      .section-summary { display: block; }
      .summary-meta { justify-content: start; margin-top: 1rem; }
      .markdown-link { display: inline-block; margin-top: 1rem; }
      .evidence-decision { grid-template-columns: 1fr; }
    }`;

module.exports = { REPORT_OVERVIEW_STYLES };
