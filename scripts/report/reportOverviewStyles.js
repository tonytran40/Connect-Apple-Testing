const REPORT_OVERVIEW_STYLES = `    :root {
      --ink: #172033;
      --muted: #687386;
      --line: #dce3ec;
      --line-strong: #c9d3e1;
      --paper: #f4f6f9;
      --panel: #ffffff;
      --blue: #2563eb;
      --blue-soft: #eff6ff;
      --pass: #15805d;
      --fail: #c2413a;
      --fail-soft: #fff1f0;
      --warning: #a16207;
      --skipped: #64748b;
      --blocked: #b45309;
      --inconclusive: #7c3aed;
      --unknown: #64748b;
      --radius: 1rem;
      --shadow: 0 12px 34px rgba(15, 23, 42, 0.07);
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; color: var(--ink); background: var(--paper); font: 15px/1.5 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    a { color: inherit; }
    button, input, select { font: inherit; }

    .hero { padding: 2rem clamp(1rem,4vw,3rem) 5.25rem; color: white; background: linear-gradient(135deg,#10182b,#182946 72%,#1d3a61); }
    .hero-layout { display: grid; grid-template-columns: minmax(0,1fr) minmax(18rem,25rem); gap: 2rem; align-items: start; max-width: 76rem; margin: 0 auto; }
    .hero-copy { min-width: 0; }
    .hero-eyebrow, .section-label { margin: 0 0 .35rem; color: #8fa5c6; font-size: .72rem; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }
    .hero h1 { margin: 0; font-size: clamp(2rem,5vw,3.6rem); line-height: 1; letter-spacing: -.055em; overflow-wrap: anywhere; }
    .hero-copy > p:not(.hero-eyebrow) { margin: .65rem 0 0; color: #b8c5d8; font-size: 1rem; }
    .hero-meta { display: flex; flex-wrap: wrap; gap: .45rem; margin-top: 1.2rem; }
    .hero-meta span { border: 1px solid rgba(255,255,255,.12); border-radius: 999px; padding: .32rem .62rem; color: #d8e0ed; background: rgba(255,255,255,.06); font-size: .8rem; font-weight: 700; }
    .hero-meta .stale-report { border-color: rgba(251,191,36,.48); color: #fde68a; }

    main { max-width: 76rem; margin: -3.25rem auto 0; padding: 0 clamp(1rem,4vw,3rem) 4rem; }
    .panel { border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); box-shadow: var(--shadow); }

    .run-summary { position: relative; z-index: 2; padding: 1.25rem; }
    .release-summary { display: grid; grid-template-columns: auto minmax(0,1fr); gap: 1rem; align-items: start; }
    .decision-badge { min-width: 7.4rem; border-radius: .8rem; padding: .75rem .85rem; color: white; background: var(--unknown); text-align: center; font-size: .78rem; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; }
    .decision-badge.pass { background: var(--pass); }
    .decision-badge.fail { background: var(--fail); }
    .decision-badge.warning { background: var(--warning); }
    .decision-copy h2 { margin: .05rem 0 .25rem; font-size: 1.25rem; line-height: 1.2; letter-spacing: -.02em; }
    .decision-copy p { margin: 0; color: var(--muted); }
    .decision-facts { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .65rem; }
    .decision-facts span { border-radius: 999px; padding: .25rem .55rem; color: #40506a; background: #f1f5f9; font-size: .76rem; font-weight: 800; }
    .summary-metrics { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); gap: 0; margin: 1.15rem 0 0; border-top: 1px solid var(--line); }
    .summary-metrics div { min-width: 0; padding: .9rem .75rem 0; border-left: 1px solid var(--line); }
    .summary-metrics div:first-child { border-left: 0; padding-left: 0; }
    dt { color: var(--muted); font-size: .68rem; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
    dd { margin: .12rem 0 0; font-size: 1.25rem; font-weight: 850; overflow-wrap: anywhere; }
    .summary-metrics .metric-alert dd { color: var(--fail); }
    button { border: 1px solid var(--line-strong); border-radius: .7rem; padding: .55rem .75rem; color: var(--blue); background: white; font-weight: 850; cursor: pointer; }
    button:hover { border-color: var(--blue); background: var(--blue-soft); }
    .copy-report { position: absolute; right: 1.25rem; top: 1.25rem; }

    .results-section { margin-top: 2rem; }
    .results-heading { display: flex; justify-content: space-between; gap: 1rem; align-items: end; margin-bottom: .85rem; }
    .results-heading h2 { margin: 0; font-size: 1.65rem; letter-spacing: -.035em; }
    .results-heading > span { color: var(--muted); font-weight: 800; }
    .toolbar { display: grid; grid-template-columns: minmax(13rem,1fr) 11rem 13rem auto; gap: .6rem; align-items: start; margin-bottom: .8rem; }
    input, select, .filter-more > summary { width: 100%; min-height: 2.75rem; border: 1px solid var(--line-strong); border-radius: .72rem; padding: .65rem .8rem; color: var(--ink); background: white; }
    input:focus, select:focus { outline: 3px solid rgba(37,99,235,.14); border-color: var(--blue); }
    .filter-more { position: relative; }
    .filter-more > summary { display: grid; place-items: center; cursor: pointer; list-style: none; color: #40506a; font-weight: 800; white-space: nowrap; }
    .filter-more > summary::-webkit-details-marker { display: none; }
    .filter-more > div { position: absolute; z-index: 10; top: calc(100% + .4rem); right: 0; display: grid; gap: .4rem; min-width: 12rem; border: 1px solid var(--line); border-radius: .8rem; padding: .55rem; background: white; box-shadow: var(--shadow); }
    .check-filter { display: flex; gap: .5rem; align-items: center; padding: .4rem; color: #40506a; font-weight: 750; white-space: nowrap; }
    .check-filter input { width: auto; min-height: 0; margin: 0; }

    .test-grid { display: grid; gap: .55rem; }
    .test-card { border: 1px solid var(--line); border-radius: .85rem; background: white; overflow: hidden; }
    .test-card.fail { border-color: rgba(194,65,58,.42); }
    .test-card.slow:not(.fail) { border-color: rgba(161,98,7,.35); }
    .test-card-summary { display: grid; grid-template-columns: auto minmax(0,1fr) auto; gap: .85rem; align-items: center; padding: .85rem 1rem; cursor: pointer; list-style: none; }
    .test-card-summary::-webkit-details-marker { display: none; }
    .test-card-summary:hover { background: #fafbfd; }
    .test-card-copy { min-width: 0; }
    .test-card h3 { margin: 0; font-size: 1rem; line-height: 1.25; letter-spacing: -.01em; }
    .test-card p { margin: .15rem 0 0; color: var(--muted); font-size: .82rem; overflow-wrap: anywhere; }
    .status-pill { display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; padding: .23rem .52rem; color: white; background: var(--unknown); font-size: .68rem; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; }
    .status-pill.pass { background: var(--pass); }
    .status-pill.fail { background: var(--fail); }
    .status-pill.skipped { background: var(--skipped); }
    .status-pill.blocked { background: var(--blocked); }
    .status-pill.inconclusive { background: var(--inconclusive); }
    .test-card-result { display: flex; gap: .75rem; align-items: center; color: var(--muted); font-weight: 800; }
    .open-details { display: grid; place-items: center; width: 1.5rem; height: 1.5rem; border-radius: 999px; background: #f1f5f9; transition: transform 150ms ease; }
    .test-card[open] .open-details { transform: rotate(180deg); }
    .card-tags { display: flex; flex-wrap: wrap; gap: .3rem; margin-top: .35rem; }
    .card-tags span { border-radius: 999px; padding: .12rem .4rem; color: #536176; background: #f1f5f9; font-size: .68rem; font-weight: 800; }
    .test-card-evidence { display: grid; gap: .7rem; border-top: 1px solid var(--line); padding: .9rem 1rem 1rem 4.65rem; background: #fafbfd; }
    .test-card-evidence p { margin: 0; white-space: pre-wrap; }
    .test-card-evidence code { overflow-x: auto; border-radius: .55rem; padding: .6rem .7rem; color: #e5eefc; background: #152034; font-size: .78rem; white-space: nowrap; }
    .test-card-evidence a { justify-self: start; color: var(--blue); font-weight: 850; text-decoration: none; }
    .test-card-evidence .evidence-error { color: #922f2a; font-weight: 750; }

    .evidence-stack { display: grid; gap: .65rem; margin-top: 2rem; }
    .disclosure { box-shadow: none; overflow: clip; }
    .section-summary { display: grid; grid-template-columns: minmax(0,1fr) auto auto; gap: 1rem; align-items: center; min-height: 4rem; padding: .85rem 1rem; cursor: pointer; list-style: none; }
    .section-summary::-webkit-details-marker { display: none; }
    .section-summary:hover { background: #fafbfd; }
    .section-summary > span:first-child { display: grid; gap: .08rem; }
    .section-summary strong { font-size: .96rem; }
    .section-summary small { color: var(--muted); }
    .summary-value { color: #40506a; font-size: .82rem; font-weight: 850; text-align: right; }
    .section-summary::after { content: '+'; color: var(--muted); font-size: 1.25rem; font-weight: 400; }
    .disclosure[open] > .section-summary::after { content: '−'; }
    .disclosure-body { border-top: 1px solid var(--line); padding: 1rem; }
    .disclosure-body > :first-child { margin-top: 0; }
    .disclosure-body > :last-child { margin-bottom: 0; }

    .coverage-scroll { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: .83rem; }
    th, td { padding: .66rem .7rem; border-bottom: 1px solid #e8edf3; text-align: left; vertical-align: middle; }
    thead th { color: var(--muted); background: #f8fafc; font-size: .67rem; letter-spacing: .07em; text-transform: uppercase; }
    tbody th { font-weight: 800; }
    tbody tr:last-child th, tbody tr:last-child td { border-bottom: 0; }
    .coverage-class { border-radius: 999px; padding: .18rem .45rem; color: #40506a; background: #edf2f7; font-size: .68rem; font-weight: 850; text-transform: capitalize; }
    .coverage-note { margin: 0 0 .8rem; color: var(--muted); }
    .ccl-status { display: inline-flex; border-radius: 999px; padding: .2rem .48rem; color: white; background: var(--unknown); font-size: .67rem; font-weight: 900; white-space: nowrap; }
    .ccl-status.pass { background: var(--pass); }
    .ccl-status.fail { background: var(--fail); }
    .ccl-status.partial, .ccl-status.blocked { background: var(--warning); }

    .panel-heading { display: flex; justify-content: space-between; gap: 1rem; align-items: baseline; margin-bottom: .75rem; }
    .panel-heading h2, .panel-heading h3 { margin: 0; font-size: 1rem; }
    .panel-heading p { margin: 0; color: var(--muted); font-size: .8rem; font-weight: 750; }
    .phase-panel { margin-bottom: 1rem; }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(9rem,1fr)); gap: .5rem; margin: 0; }
    .meta-grid > div { min-width: 0; border: 1px solid var(--line); border-radius: .65rem; padding: .6rem; background: #fafbfd; }
    .meta-grid dd { font-size: .9rem; }
    .cleanup-panel { margin: 0 0 1rem; padding: .8rem; box-shadow: none; }
    .cleanup-panel p { margin: 0; }
    .overview-grid { display: grid; grid-template-columns: minmax(0,1.3fr) minmax(16rem,.7fr); gap: 1rem; }
    .lane-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(13rem,1fr)); gap: .55rem; }
    .lane-card { border: 1px solid var(--line); border-radius: .7rem; padding: .7rem; background: #fafbfd; }
    .lane-card.fail { border-color: rgba(194,65,58,.32); background: var(--fail-soft); }
    .eyebrow { color: var(--muted); font-size: .65rem; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
    .lane-card h3 { margin: .12rem 0 .6rem; font-size: .9rem; }
    .lane-card dl { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: .35rem; margin: 0; }
    .lane-card dl div { min-width: 0; }
    .lane-card dd { font-size: .82rem; }
    .slow-list, .comparison-list { display: grid; gap: .4rem; }
    .slow-list a, .comparison-list a { display: flex; justify-content: space-between; gap: .75rem; border: 1px solid var(--line); border-radius: .65rem; padding: .58rem; text-decoration: none; }
    .slow-list span, .comparison-list span { color: var(--muted); font-size: .76rem; font-weight: 750; text-align: right; }
    .muted { color: var(--muted); }
    .insight-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(16rem,1fr)); gap: 1rem; }
    .comparison-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: .4rem; margin-bottom: .55rem; }
    .comparison-grid div { border: 1px solid var(--line); border-radius: .6rem; padding: .5rem; background: #fafbfd; }
    .comparison-grid dd { font-size: .95rem; }
    .category-list { display: grid; gap: .5rem; }
    .category-row { display: grid; grid-template-columns: 6rem minmax(3rem,1fr) 1.5rem; gap: .5rem; align-items: center; color: var(--muted); font-size: .78rem; font-weight: 800; }
    .category-row div { height: .45rem; border-radius: 999px; overflow: hidden; background: #edf2f7; }
    .category-row i { display: block; height: 100%; border-radius: inherit; background: var(--fail); }

    [hidden] { display: none !important; }
    @media (max-width: 800px) {
      .hero { padding-bottom: 4.25rem; }
      .hero-layout { grid-template-columns: 1fr; gap: 1.25rem; }
      main { margin-top: -2.6rem; }
      .summary-metrics { grid-template-columns: repeat(3,1fr); }
      .summary-metrics div:nth-child(4) { border-left: 0; padding-left: 0; }
      .toolbar { grid-template-columns: 1fr 1fr; }
      .toolbar input { grid-column: 1 / -1; }
      .overview-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 560px) {
      .release-summary { grid-template-columns: 1fr; }
      .decision-badge { justify-self: start; min-width: 0; }
      .copy-report { position: static; margin-top: 1rem; }
      .summary-metrics { grid-template-columns: repeat(2,1fr); }
      .summary-metrics div:nth-child(odd) { border-left: 0; padding-left: 0; }
      .toolbar { grid-template-columns: 1fr; }
      .toolbar input { grid-column: auto; }
      .filter-more > div { left: 0; right: auto; }
      .test-card-summary { grid-template-columns: auto minmax(0,1fr); }
      .test-card-result { grid-column: 2; justify-content: space-between; }
      .test-card-evidence { padding-left: 1rem; }
      .summary-value { display: none; }
      .lane-card dl { grid-template-columns: repeat(2,1fr); }
    }`;

module.exports = { REPORT_OVERVIEW_STYLES };
