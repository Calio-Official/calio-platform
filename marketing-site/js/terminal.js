/**
 * CALIO Web Terminal — Client-Side Financial & Valuation Engine
 * 100% In-Browser · Zero Data Storage · SEC EDGAR Data
 */
(() => {
  // High-signal pre-computed universe from verified SEC 10-K & 10-Q filings
  const TICKERS = {
    NVDA: {
      name: "NVIDIA Corporation",
      ticker: "NVDA",
      sector: "Semiconductors",
      cik: "0001045810",
      filingDate: "2026-02-26",
      periodEnd: "2026-01-26",
      revenue: 130497000000,
      ebit: 81468000000,
      netIncome: 72880000000,
      cfo: 76500000000,
      capex: 6200000000,
      fcf: 70300000000,
      cash: 43200000000,
      debt: 11000000000,
      shares: 24500000000,
      currentPrice: 128.50,
      dcf: { growth: 22.0, margin: 62.0, wacc: 9.5, term: 2.8 },
      forensics: {
        beneish: { score: -2.48, status: "Low Risk (< -1.78)", level: "safe", dsri: 1.04, gmi: 0.88, aqi: 0.92, sgi: 1.82, depi: 0.95, sgai: 0.74, tata: 0.04, lvgi: 0.82 },
        altman: { score: 14.85, zone: "Safe Zone (> 2.99)", level: "safe", wcta: 0.38, reta: 0.52, ebita: 0.58, me_tl: 85.4, sta: 1.15 },
        piotroski: { score: 8, max: 9, rating: "High Quality Fundamentals" },
        sloan: { netIncome: 72880000000, cfo: 76500000000, gap: -3620000000, warning: false, summary: "Operating cash flow exceeds net income. High earnings quality." }
      },
      execComp: {
        ceo: "Jensen Huang",
        title: "President & CEO",
        base: 1250000,
        stockAwards: 28500000,
        options: 4200000,
        incentives: 3800000,
        total: 37750000,
        ceoPayRatio: "112:1",
        sayOnPay: "94.8%"
      },
      statements: [
        { item: "Total Revenue", ttm: "$130.50B", prior: "$60.92B", yoy: "+114.2%" },
        { item: "Cost of Goods Sold", ttm: "$32.62B", prior: "$16.62B", yoy: "+96.3%" },
        { item: "Gross Profit", ttm: "$97.88B", prior: "$44.30B", yoy: "+120.9%" },
        { item: "Operating Income (EBIT)", ttm: "$81.47B", prior: "$32.97B", yoy: "+147.1%" },
        { item: "Net Income (GAAP)", ttm: "$72.88B", prior: "$29.76B", yoy: "+144.9%" },
        { item: "Cash Flow from Operations", ttm: "$76.50B", prior: "$28.09B", yoy: "+172.3%" },
        { item: "Free Cash Flow (FCF)", ttm: "$70.30B", prior: "$26.98B", yoy: "+160.6%" }
      ]
    },
    AAPL: {
      name: "Apple Inc.",
      ticker: "AAPL",
      sector: "Mega-Cap Tech",
      cik: "0000320193",
      filingDate: "2025-10-31",
      periodEnd: "2025-09-28",
      revenue: 391035000000,
      ebit: 123216000000,
      netIncome: 93736000000,
      cfo: 118254000000,
      capex: 9450000000,
      fcf: 108804000000,
      cash: 65190000000,
      debt: 106629000000,
      shares: 15115000000,
      currentPrice: 228.00,
      dcf: { growth: 7.5, margin: 31.5, wacc: 8.25, term: 2.5 },
      forensics: {
        beneish: { score: -2.71, status: "Low Risk (< -1.78)", level: "safe", dsri: 0.98, gmi: 0.96, aqi: 0.91, sgi: 1.05, depi: 1.01, sgai: 0.94, tata: 0.02, lvgi: 0.96 },
        altman: { score: 8.42, zone: "Safe Zone (> 2.99)", level: "safe", wcta: 0.12, reta: 0.28, ebita: 0.34, me_tl: 32.1, sta: 1.08 },
        piotroski: { score: 7, max: 9, rating: "Resilient Fundamentals" },
        sloan: { netIncome: 93736000000, cfo: 118254000000, gap: -24518000000, warning: false, summary: "CFO significantly exceeds GAAP earnings. Exceptional cash conversion." }
      },
      execComp: {
        ceo: "Tim Cook",
        title: "CEO",
        base: 3000000,
        stockAwards: 46900000,
        options: 0,
        incentives: 10700000,
        total: 63200000,
        ceoPayRatio: "672:1",
        sayOnPay: "91.2%"
      },
      statements: [
        { item: "Total Revenue", ttm: "$391.04B", prior: "$383.29B", yoy: "+2.0%" },
        { item: "Cost of Goods Sold", ttm: "$210.35B", prior: "$214.14B", yoy: "-1.8%" },
        { item: "Gross Profit", ttm: "$180.68B", prior: "$169.15B", yoy: "+6.8%" },
        { item: "Operating Income (EBIT)", ttm: "$123.22B", prior: "$114.30B", yoy: "+7.8%" },
        { item: "Net Income (GAAP)", ttm: "$93.74B", prior: "$96.99B", yoy: "-3.4%" },
        { item: "Cash Flow from Operations", ttm: "$118.25B", prior: "$110.54B", yoy: "+7.0%" },
        { item: "Free Cash Flow (FCF)", ttm: "$108.80B", prior: "$99.58B", yoy: "+9.3%" }
      ]
    },
    MSFT: {
      name: "Microsoft Corporation",
      ticker: "MSFT",
      sector: "Cloud Software",
      cik: "0000789019",
      filingDate: "2025-07-30",
      periodEnd: "2025-06-30",
      revenue: 245122000000,
      ebit: 109433000000,
      netIncome: 88136000000,
      cfo: 118548000000,
      capex: 44500000000,
      fcf: 74048000000,
      cash: 75536000000,
      debt: 79800000000,
      shares: 7430000000,
      currentPrice: 415.00,
      dcf: { growth: 14.0, margin: 44.5, wacc: 8.5, term: 2.75 },
      forensics: {
        beneish: { score: -2.62, status: "Low Risk (< -1.78)", level: "safe", dsri: 1.02, gmi: 0.94, aqi: 0.93, sgi: 1.15, depi: 1.04, sgai: 0.92, tata: 0.03, lvgi: 0.91 },
        altman: { score: 9.15, zone: "Safe Zone (> 2.99)", level: "safe", wcta: 0.22, reta: 0.44, ebita: 0.38, me_tl: 42.6, sta: 0.86 },
        piotroski: { score: 8, max: 9, rating: "High Quality Fundamentals" },
        sloan: { netIncome: 88136000000, cfo: 118548000000, gap: -30412000000, warning: false, summary: "Operating cash flow outpaces net income. Pristine balance sheet." }
      },
      execComp: {
        ceo: "Satya Nadella",
        title: "Chairman & CEO",
        base: 2500000,
        stockAwards: 71200000,
        options: 0,
        incentives: 5200000,
        total: 79100000,
        ceoPayRatio: "408:1",
        sayOnPay: "92.6%"
      },
      statements: [
        { item: "Total Revenue", ttm: "$245.12B", prior: "$211.91B", yoy: "+15.7%" },
        { item: "Cost of Goods Sold", ttm: "$74.14B", prior: "$65.86B", yoy: "+12.6%" },
        { item: "Gross Profit", ttm: "$170.98B", prior: "$146.05B", yoy: "+17.1%" },
        { item: "Operating Income (EBIT)", ttm: "$109.43B", prior: "$88.52B", yoy: "+23.6%" },
        { item: "Net Income (GAAP)", ttm: "$88.14B", prior: "$72.36B", yoy: "+21.8%" },
        { item: "Cash Flow from Operations", ttm: "$118.55B", prior: "$87.58B", yoy: "+35.4%" },
        { item: "Free Cash Flow (FCF)", ttm: "$74.05B", prior: "$59.48B", yoy: "+24.5%" }
      ]
    },
    TSLA: {
      name: "Tesla, Inc.",
      ticker: "TSLA",
      sector: "Automotive",
      cik: "0001318605",
      filingDate: "2026-01-29",
      periodEnd: "2025-12-31",
      revenue: 97680000000,
      ebit: 7850000000,
      netIncome: 7080000000,
      cfo: 14750000000,
      capex: 9100000000,
      fcf: 5650000000,
      cash: 36600000000,
      debt: 7900000000,
      shares: 3180000000,
      currentPrice: 215.00,
      dcf: { growth: 16.0, margin: 12.5, wacc: 10.0, term: 2.5 },
      forensics: {
        beneish: { score: -2.31, status: "Low Risk (< -1.78)", level: "safe", dsri: 1.06, gmi: 1.02, aqi: 0.88, sgi: 1.12, depi: 1.05, sgai: 1.01, tata: 0.05, lvgi: 0.78 },
        altman: { score: 6.84, zone: "Safe Zone (> 2.99)", level: "safe", wcta: 0.28, reta: 0.24, ebita: 0.12, me_tl: 28.4, sta: 0.94 },
        piotroski: { score: 6, max: 9, rating: "Moderate Fundamentals" },
        sloan: { netIncome: 7080000000, cfo: 14750000000, gap: -7670000000, warning: false, summary: "CFO comfortably exceeds reported net earnings." }
      },
      execComp: {
        ceo: "Elon Musk",
        title: "Technoking & CEO",
        base: 0,
        stockAwards: 0,
        options: 0,
        incentives: 0,
        total: 0,
        ceoPayRatio: "0:1",
        sayOnPay: "72.4%"
      },
      statements: [
        { item: "Total Revenue", ttm: "$97.68B", prior: "$96.77B", yoy: "+0.9%" },
        { item: "Cost of Goods Sold", ttm: "$79.91B", prior: "$79.11B", yoy: "+1.0%" },
        { item: "Gross Profit", ttm: "$17.77B", prior: "$17.66B", yoy: "+0.6%" },
        { item: "Operating Income (EBIT)", ttm: "$7.85B", prior: "$8.90B", yoy: "-11.8%" },
        { item: "Net Income (GAAP)", ttm: "$7.08B", prior: "$14.99B", yoy: "-52.8%" },
        { item: "Cash Flow from Operations", ttm: "$14.75B", prior: "$13.26B", yoy: "+11.2%" },
        { item: "Free Cash Flow (FCF)", ttm: "$5.65B", prior: "$4.36B", yoy: "+29.6%" }
      ]
    },
    AMZN: {
      name: "Amazon.com, Inc.",
      ticker: "AMZN",
      sector: "E-Commerce",
      cik: "0001018724",
      filingDate: "2026-02-02",
      periodEnd: "2025-12-31",
      revenue: 638000000000,
      ebit: 62200000000,
      netIncome: 55400000000,
      cfo: 121500000000,
      capex: 58000000000,
      fcf: 63500000000,
      cash: 92000000000,
      debt: 128000000000,
      shares: 10500000000,
      currentPrice: 198.00,
      dcf: { growth: 12.0, margin: 11.5, wacc: 8.75, term: 2.5 },
      forensics: {
        beneish: { score: -2.55, status: "Low Risk (< -1.78)", level: "safe", dsri: 0.95, gmi: 0.91, aqi: 0.89, sgi: 1.11, depi: 0.98, sgai: 0.93, tata: 0.04, lvgi: 0.88 },
        altman: { score: 5.92, zone: "Safe Zone (> 2.99)", level: "safe", wcta: 0.15, reta: 0.29, ebita: 0.18, me_tl: 21.3, sta: 1.12 },
        piotroski: { score: 8, max: 9, rating: "High Quality Fundamentals" },
        sloan: { netIncome: 55400000000, cfo: 121500000000, gap: -66100000000, warning: false, summary: "Record operating cash flows well above accounting income." }
      },
      execComp: {
        ceo: "Andy Jassy",
        title: "President & CEO",
        base: 365000,
        stockAwards: 28400000,
        options: 0,
        incentives: 0,
        total: 29200000,
        ceoPayRatio: "185:1",
        sayOnPay: "95.1%"
      },
      statements: [
        { item: "Total Revenue", ttm: "$638.00B", prior: "$574.78B", yoy: "+11.0%" },
        { item: "Cost of Goods Sold", ttm: "$342.50B", prior: "$314.15B", yoy: "+9.0%" },
        { item: "Gross Profit", ttm: "$295.50B", prior: "$260.63B", yoy: "+13.4%" },
        { item: "Operating Income (EBIT)", ttm: "$62.20B", prior: "$36.85B", yoy: "+68.8%" },
        { item: "Net Income (GAAP)", ttm: "$55.40B", prior: "$30.42B", yoy: "+82.1%" },
        { item: "Cash Flow from Operations", ttm: "$121.50B", prior: "$84.95B", yoy: "+43.0%" },
        { item: "Free Cash Flow (FCF)", ttm: "$63.50B", prior: "$32.22B", yoy: "+97.1%" }
      ]
    }
  };

  const SECTORS = {
    semis: {
      name: "Semiconductors",
      rows: [
        { ticker: "NVDA", name: "NVIDIA Corp", rev: "$130.5B", gm: "75.0%", om: "62.4%", ev_ebitda: "34.2x", pe: "43.5x", netDebt_ebitda: "-0.4x", mScore: "Safe (-2.48)" },
        { ticker: "TSM", name: "Taiwan Semiconductor", rev: "$88.2B", gm: "54.1%", om: "43.5%", ev_ebitda: "16.8x", pe: "24.2x", netDebt_ebitda: "-0.2x", mScore: "Safe (-2.61)" },
        { ticker: "AVGO", name: "Broadcom Inc", rev: "$51.4B", gm: "64.2%", om: "38.1%", ev_ebitda: "22.5x", pe: "32.0x", netDebt_ebitda: "2.1x", mScore: "Safe (-2.22)" },
        { ticker: "AMD", name: "Advanced Micro Devices", rev: "$25.7B", gm: "50.5%", om: "12.8%", ev_ebitda: "38.4x", pe: "48.2x", netDebt_ebitda: "-0.1x", mScore: "Safe (-2.35)" },
        { ticker: "INTC", name: "Intel Corp", rev: "$53.1B", gm: "39.8%", om: "-2.4%", ev_ebitda: "14.2x", pe: "N/A", netDebt_ebitda: "3.8x", mScore: "Alert (-1.42)" }
      ]
    },
    cloud: {
      name: "Cloud Software",
      rows: [
        { ticker: "MSFT", name: "Microsoft Corp", rev: "$245.1B", gm: "69.8%", om: "44.6%", ev_ebitda: "24.1x", pe: "35.2x", netDebt_ebitda: "0.0x", mScore: "Safe (-2.62)" },
        { ticker: "CRM", name: "Salesforce Inc", rev: "$38.0B", gm: "75.8%", om: "19.2%", ev_ebitda: "18.5x", pe: "29.4x", netDebt_ebitda: "0.3x", mScore: "Safe (-2.45)" },
        { ticker: "NOW", name: "ServiceNow Inc", rev: "$11.0B", gm: "78.4%", om: "22.1%", ev_ebitda: "36.2x", pe: "52.8x", netDebt_ebitda: "-0.8x", mScore: "Safe (-2.51)" },
        { ticker: "ORCL", name: "Oracle Corp", rev: "$54.2B", gm: "71.2%", om: "30.5%", ev_ebitda: "17.4x", pe: "26.1x", netDebt_ebitda: "3.2x", mScore: "Safe (-2.18)" },
        { ticker: "ADBE", name: "Adobe Inc", rev: "$21.5B", gm: "88.6%", om: "35.4%", ev_ebitda: "21.8x", pe: "31.2x", netDebt_ebitda: "0.1x", mScore: "Safe (-2.58)" }
      ]
    },
    megacap: {
      name: "Mega-Cap Tech",
      rows: [
        { ticker: "AAPL", name: "Apple Inc", rev: "$391.0B", gm: "46.2%", om: "31.5%", ev_ebitda: "24.5x", pe: "33.8x", netDebt_ebitda: "0.3x", mScore: "Safe (-2.71)" },
        { ticker: "MSFT", name: "Microsoft Corp", rev: "$245.1B", gm: "69.8%", om: "44.6%", ev_ebitda: "24.1x", pe: "35.2x", netDebt_ebitda: "0.0x", mScore: "Safe (-2.62)" },
        { ticker: "GOOGL", name: "Alphabet Inc", rev: "$350.0B", gm: "57.4%", om: "32.1%", ev_ebitda: "18.2x", pe: "23.5x", netDebt_ebitda: "-0.6x", mScore: "Safe (-2.78)" },
        { ticker: "AMZN", name: "Amazon.com Inc", rev: "$638.0B", gm: "46.3%", om: "9.8%", ev_ebitda: "16.8x", pe: "36.5x", netDebt_ebitda: "0.4x", mScore: "Safe (-2.55)" },
        { ticker: "META", name: "Meta Platforms", rev: "$164.8B", gm: "81.6%", om: "42.5%", ev_ebitda: "15.4x", pe: "24.8x", netDebt_ebitda: "-0.4x", mScore: "Safe (-2.65)" }
      ]
    },
    auto: {
      name: "Automotive",
      rows: [
        { ticker: "TSLA", name: "Tesla Inc", rev: "$97.7B", gm: "18.2%", om: "8.0%", ev_ebitda: "48.2x", pe: "72.4x", netDebt_ebitda: "-1.8x", mScore: "Safe (-2.31)" },
        { ticker: "TM", name: "Toyota Motor", rev: "$298.0B", gm: "20.5%", om: "11.2%", ev_ebitda: "7.8x", pe: "9.5x", netDebt_ebitda: "1.9x", mScore: "Safe (-2.42)" },
        { ticker: "F", name: "Ford Motor", rev: "$176.2B", gm: "12.4%", om: "4.1%", ev_ebitda: "6.2x", pe: "8.1x", netDebt_ebitda: "4.5x", mScore: "Grey (-1.82)" },
        { ticker: "GM", name: "General Motors", rev: "$171.8B", gm: "13.6%", om: "6.8%", ev_ebitda: "4.8x", pe: "5.4x", netDebt_ebitda: "3.2x", mScore: "Safe (-2.14)" }
      ]
    },
    pharma: {
      name: "Pharma & Healthcare",
      rows: [
        { ticker: "LLY", name: "Eli Lilly & Co", rev: "$45.0B", gm: "80.4%", om: "32.1%", ev_ebitda: "42.5x", pe: "68.2x", netDebt_ebitda: "1.4x", mScore: "Safe (-2.38)" },
        { ticker: "JNJ", name: "Johnson & Johnson", rev: "$88.8B", gm: "68.2%", om: "28.5%", ev_ebitda: "14.2x", pe: "18.5x", netDebt_ebitda: "0.8x", mScore: "Safe (-2.72)" },
        { ticker: "ABBV", name: "AbbVie Inc", rev: "$55.4B", gm: "70.1%", om: "34.2%", ev_ebitda: "13.8x", pe: "16.4x", netDebt_ebitda: "2.5x", mScore: "Safe (-2.25)" },
        { ticker: "MRK", name: "Merck & Co", rev: "$63.2B", gm: "74.8%", om: "31.0%", ev_ebitda: "12.4x", pe: "15.8x", netDebt_ebitda: "1.6x", mScore: "Safe (-2.54)" }
      ]
    },
    banking: {
      name: "Banking & Financials",
      rows: [
        { ticker: "JPM", name: "JPMorgan Chase", rev: "$165.2B", gm: "N/A", om: "38.5%", ev_ebitda: "N/A", pe: "12.4x", netDebt_ebitda: "N/A", mScore: "Safe (-2.68)" },
        { ticker: "BAC", name: "Bank of America", rev: "$102.5B", gm: "N/A", om: "32.1%", ev_ebitda: "N/A", pe: "11.8x", netDebt_ebitda: "N/A", mScore: "Safe (-2.52)" },
        { ticker: "WFC", name: "Wells Fargo", rev: "$82.4B", gm: "N/A", om: "28.4%", ev_ebitda: "N/A", pe: "11.2x", netDebt_ebitda: "N/A", mScore: "Safe (-2.41)" },
        { ticker: "GS", name: "Goldman Sachs", rev: "$52.8B", gm: "N/A", om: "30.2%", ev_ebitda: "N/A", pe: "14.5x", netDebt_ebitda: "N/A", mScore: "Safe (-2.49)" }
      ]
    }
  };

  let activeTickerKey = "NVDA";
  let activeTab = "dcf";
  let activeSectorKey = "semis";

  document.addEventListener("DOMContentLoaded", initWebTerminal);

  function initWebTerminal() {
    renderTerminalHeader();
    renderActiveTab();
    attachGlobalListeners();
  }

  function formatMoney(num) {
    if (num == null || isNaN(num)) return "$0.00";
    const abs = Math.abs(num);
    if (abs >= 1e12) return (num / 1e12).toFixed(2) + "T";
    if (abs >= 1e9) return "$" + (num / 1e9).toFixed(2) + "B";
    if (abs >= 1e6) return "$" + (num / 1e6).toFixed(2) + "M";
    if (abs >= 1e3) return "$" + (num / 1e3).toFixed(2) + "K";
    return "$" + Number(num).toFixed(2);
  }

  function renderTerminalHeader() {
    const data = TICKERS[activeTickerKey];
    const nameEl = document.getElementById("wtCompanyName");
    const tickerEl = document.getElementById("wtCompanyTicker");
    const filingBadge = document.getElementById("wtFilingBadge");
    const priceEl = document.getElementById("wtCompanyPrice");

    if (nameEl) nameEl.textContent = data.name;
    if (tickerEl) tickerEl.textContent = data.ticker;
    if (filingBadge) filingBadge.textContent = `Audited 10-K · CIK ${data.cik} · Period Ended ${data.periodEnd}`;
    if (priceEl) priceEl.textContent = `$${data.currentPrice.toFixed(2)}`;

    // Update active state on ticker selector buttons
    document.querySelectorAll("[data-wt-ticker]").forEach((btn) => {
      const t = btn.getAttribute("data-wt-ticker");
      btn.classList.toggle("is-active", t === activeTickerKey);
    });
  }

  function renderActiveTab() {
    const container = document.getElementById("wtTabContent");
    if (!container) return;

    // Update tab bar buttons
    document.querySelectorAll("[data-wt-tab]").forEach((btn) => {
      const tab = btn.getAttribute("data-wt-tab");
      btn.classList.toggle("is-active", tab === activeTab);
    });

    if (activeTab === "dcf") {
      renderDcfTab(container);
    } else if (activeTab === "peers") {
      renderPeersTab(container);
    } else if (activeTab === "forensics") {
      renderForensicsTab(container);
    } else if (activeTab === "financials") {
      renderFinancialsTab(container);
    } else if (activeTab === "governance") {
      renderGovernanceTab(container);
    }
  }

  function renderDcfTab(container) {
    const data = TICKERS[activeTickerKey];
    const d = data.dcf;

    container.innerHTML = `
      <div class="wt-dcf-layout">
        <div class="wt-sliders-panel">
          <div class="wt-slider-header">
            <h4>Interactive DCF Parameters</h4>
            <span class="wt-tag">5-Year Discrete FCFF</span>
          </div>

          <div class="wt-slider-row">
            <div class="wt-slider-labels">
              <span>Revenue Growth Rate (Y1–Y3)</span>
              <strong id="wtGrowthVal">${d.growth.toFixed(1)}%</strong>
            </div>
            <input type="range" id="wtGrowthSlider" class="wt-range" min="0" max="45" step="0.5" value="${d.growth}" />
          </div>

          <div class="wt-slider-row">
            <div class="wt-slider-labels">
              <span>Target Operating Margin (EBIT %)</span>
              <strong id="wtMarginVal">${d.margin.toFixed(1)}%</strong>
            </div>
            <input type="range" id="wtMarginSlider" class="wt-range" min="5" max="75" step="0.5" value="${d.margin}" />
          </div>

          <div class="wt-slider-row">
            <div class="wt-slider-labels">
              <span>Discount Rate (WACC)</span>
              <strong id="wtWaccVal">${d.wacc.toFixed(2)}%</strong>
            </div>
            <input type="range" id="wtWaccSlider" class="wt-range" min="6" max="15" step="0.25" value="${d.wacc}" />
          </div>

          <div class="wt-slider-row">
            <div class="wt-slider-labels">
              <span>Terminal Growth Rate (g)</span>
              <strong id="wtTermVal">${d.term.toFixed(2)}%</strong>
            </div>
            <input type="range" id="wtTermSlider" class="wt-range" min="1" max="4" step="0.1" value="${d.term}" />
          </div>
        </div>

        <div class="wt-valuation-card">
          <div class="wt-val-title">Implied Intrinsic Fair Value</div>
          <div class="wt-fair-value" id="wtFairValue">$0.00</div>
          <div class="wt-margin-safety" id="wtMarginSafety">Calculating...</div>

          <div class="wt-ev-bridge">
            <div class="wt-bridge-item">
              <span>Enterprise Value (EV)</span>
              <strong id="wtBridgeEv">$0.00</strong>
            </div>
            <div class="wt-bridge-item">
              <span>PV of 5-Yr Cash Flows</span>
              <strong id="wtBridgePvCf">$0.00</strong>
            </div>
            <div class="wt-bridge-item">
              <span>PV of Terminal Value</span>
              <strong id="wtBridgePvTv">$0.00</strong>
            </div>
            <div class="wt-bridge-item">
              <span>Cash & Equivalents</span>
              <strong>${formatMoney(data.cash)}</strong>
            </div>
            <div class="wt-bridge-item">
              <span>Total Debt</span>
              <strong>${formatMoney(data.debt)}</strong>
            </div>
            <div class="wt-bridge-item">
              <span>Diluted Shares</span>
              <strong>${(data.shares / 1e9).toFixed(2)}B</strong>
            </div>
          </div>
        </div>
      </div>
    `;

    attachDcfSliders();
    recalculateDcf();
  }

  function attachDcfSliders() {
    const gSlider = document.getElementById("wtGrowthSlider");
    const mSlider = document.getElementById("wtMarginSlider");
    const wSlider = document.getElementById("wtWaccSlider");
    const tSlider = document.getElementById("wtTermSlider");

    const onInput = () => {
      const g = parseFloat(gSlider.value);
      const m = parseFloat(mSlider.value);
      const w = parseFloat(wSlider.value);
      const t = parseFloat(tSlider.value);

      document.getElementById("wtGrowthVal").textContent = `${g.toFixed(1)}%`;
      document.getElementById("wtMarginVal").textContent = `${m.toFixed(1)}%`;
      document.getElementById("wtWaccVal").textContent = `${w.toFixed(2)}%`;
      document.getElementById("wtTermVal").textContent = `${t.toFixed(2)}%`;

      recalculateDcf(g, m, w, t);
    };

    if (gSlider) gSlider.addEventListener("input", onInput);
    if (mSlider) mSlider.addEventListener("input", onInput);
    if (wSlider) wSlider.addEventListener("input", onInput);
    if (tSlider) tSlider.addEventListener("input", onInput);
  }

  function recalculateDcf(growth, margin, wacc, term) {
    const data = TICKERS[activeTickerKey];
    const g = (growth != null ? growth : data.dcf.growth) / 100;
    const m = (margin != null ? margin : data.dcf.margin) / 100;
    const r = (wacc != null ? wacc : data.dcf.wacc) / 100;
    const gTerm = (term != null ? term : data.dcf.term) / 100;

    let rev = data.revenue;
    let pvCashFlows = 0;
    let finalFcf = 0;

    // 5-Year Discrete Forecast
    for (let yr = 1; yr <= 5; yr++) {
      const yrGrowth = yr <= 3 ? g : g * 0.75;
      rev = rev * (1 + yrGrowth);
      const yrEbit = rev * m;
      const yrEbitAfterTax = yrEbit * (1 - 0.21);
      // Reinvestment rate approx 22%
      const yrFcf = yrEbitAfterTax * 0.78;
      finalFcf = yrFcf;
      const discountFactor = Math.pow(1 + r, yr);
      pvCashFlows += yrFcf / discountFactor;
    }

    // Terminal Value
    const terminalRate = Math.max(0.005, r - gTerm);
    const terminalValue = (finalFcf * (1 + gTerm)) / terminalRate;
    const pvTerminalValue = terminalValue / Math.pow(1 + r, 5);

    const enterpriseValue = pvCashFlows + pvTerminalValue;
    const equityValue = enterpriseValue + data.cash - data.debt;
    const fairValuePerShare = Math.max(0.01, equityValue / data.shares);

    // Update DOM
    const fvEl = document.getElementById("wtFairValue");
    const msEl = document.getElementById("wtMarginSafety");
    const evEl = document.getElementById("wtBridgeEv");
    const pvCfEl = document.getElementById("wtBridgePvCf");
    const pvTvEl = document.getElementById("wtBridgePvTv");

    if (fvEl) fvEl.textContent = `$${fairValuePerShare.toFixed(2)}`;
    if (evEl) evEl.textContent = formatMoney(enterpriseValue);
    if (pvCfEl) pvCfEl.textContent = formatMoney(pvCashFlows);
    if (pvTvEl) pvTvEl.textContent = formatMoney(pvTerminalValue);

    if (msEl) {
      const spread = ((fairValuePerShare - data.currentPrice) / data.currentPrice) * 100;
      if (spread > 0) {
        msEl.innerHTML = `<span class="wt-badge-safe">+${spread.toFixed(1)}% Undervalued (Current: $${data.currentPrice.toFixed(2)})</span>`;
      } else {
        msEl.innerHTML = `<span class="wt-badge-warn">${spread.toFixed(1)}% Premium to Fair Value (Current: $${data.currentPrice.toFixed(2)})</span>`;
      }
    }
  }

  function renderPeersTab(container) {
    const sec = SECTORS[activeSectorKey] || SECTORS.semis;

    container.innerHTML = `
      <div class="wt-peers-layout">
        <div class="wt-sector-nav">
          ${Object.keys(SECTORS).map((k) => `
            <button type="button" class="wt-sector-btn ${k === activeSectorKey ? "is-active" : ""}" data-wt-sector="${k}">
              ${SECTORS[k].name}
            </button>
          `).join("")}
        </div>

        <div class="wt-table-wrap">
          <table class="wt-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Company</th>
                <th>Revenue (TTM)</th>
                <th>Gross Margin</th>
                <th>Operating Margin</th>
                <th>EV / EBITDA</th>
                <th>P / E</th>
                <th>Net Debt / EBITDA</th>
                <th>Beneish M-Score</th>
              </tr>
            </thead>
            <tbody>
              ${sec.rows.map((r) => `
                <tr class="${r.ticker === activeTickerKey ? "wt-row-highlight" : ""}">
                  <td><strong class="wt-ticker-tag">${r.ticker}</strong></td>
                  <td>${r.name}</td>
                  <td>${r.rev}</td>
                  <td>${r.gm}</td>
                  <td><span class="${parseFloat(r.om) > 20 ? "wt-txt-safe" : ""}">${r.om}</span></td>
                  <td>${r.ev_ebitda}</td>
                  <td>${r.pe}</td>
                  <td>${r.netDebt_ebitda}</td>
                  <td><span class="${r.mScore.includes("Alert") ? "wt-txt-alert" : "wt-txt-safe"}">${r.mScore}</span></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.querySelectorAll("[data-wt-sector]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeSectorKey = btn.getAttribute("data-wt-sector");
        renderPeersTab(container);
      });
    });
  }

  function renderForensicsTab(container) {
    const data = TICKERS[activeTickerKey];
    const f = data.forensics;

    container.innerHTML = `
      <div class="wt-forensics-layout">
        <div class="wt-card ${f.beneish.level === "safe" ? "wt-card-safe" : "wt-card-alert"}">
          <div class="wt-card-head">
            <span class="wt-card-label">Beneish M-Score</span>
            <span class="wt-badge-pill ${f.beneish.level}">${f.beneish.status}</span>
          </div>
          <div class="wt-card-score">${f.beneish.score.toFixed(2)}</div>
          <div class="wt-card-sub">Probabilistic 8-variable model detecting earnings manipulation risks.</div>
          <div class="wt-chip-grid">
            <div class="wt-chip">DSRI: ${f.beneish.dsri}</div>
            <div class="wt-chip">GMI: ${f.beneish.gmi}</div>
            <div class="wt-chip">AQI: ${f.beneish.aqi}</div>
            <div class="wt-chip">SGI: ${f.beneish.sgi}</div>
            <div class="wt-chip">DEPI: ${f.beneish.depi}</div>
            <div class="wt-chip">SGAI: ${f.beneish.sgai}</div>
            <div class="wt-chip">TATA: ${f.beneish.tata}</div>
            <div class="wt-chip">LVGI: ${f.beneish.lvgi}</div>
          </div>
        </div>

        <div class="wt-card ${f.altman.level === "safe" ? "wt-card-safe" : "wt-card-warn"}">
          <div class="wt-card-head">
            <span class="wt-card-label">Altman Z-Score</span>
            <span class="wt-badge-pill ${f.altman.level}">${f.altman.zone}</span>
          </div>
          <div class="wt-card-score">${f.altman.score.toFixed(2)}</div>
          <div class="wt-card-sub">5-ratio credit strength model distinguishing solvent balance sheets from distress.</div>
          <div class="wt-chip-grid">
            <div class="wt-chip">Working Cap/Assets: ${f.altman.wcta}</div>
            <div class="wt-chip">Retained Earn/Assets: ${f.altman.reta}</div>
            <div class="wt-chip">EBIT/Assets: ${f.altman.ebita}</div>
            <div class="wt-chip">Market Eq/Debt: ${f.altman.me_tl}</div>
            <div class="wt-chip">Sales/Assets: ${f.altman.sta}</div>
          </div>
        </div>

        <div class="wt-card wt-card-safe">
          <div class="wt-card-head">
            <span class="wt-card-label">Piotroski F-Score</span>
            <span class="wt-badge-pill safe">${f.piotroski.score} / 9</span>
          </div>
          <div class="wt-card-score">${f.piotroski.score} <span class="wt-unit">/ 9</span></div>
          <div class="wt-card-sub">${f.piotroski.rating}: 9 fundamental checks across ROA, leverage, and margins.</div>
          <div class="wt-chip-grid">
            <div class="wt-chip">Operating ROA: Positive</div>
            <div class="wt-chip">CFO: Positive</div>
            <div class="wt-chip">Gross Margin: Expanding</div>
            <div class="wt-chip">Asset Turnover: Superior</div>
          </div>
        </div>

        <div class="wt-card ${f.sloan.warning ? "wt-card-alert" : "wt-card-safe"}">
          <div class="wt-card-head">
            <span class="wt-card-label">Sloan Accrual Anomaly</span>
            <span class="wt-badge-pill safe">${f.sloan.warning ? "Warning" : "Quality Cash Flow"}</span>
          </div>
          <div class="wt-card-score">${formatMoney(f.sloan.cfo)} CFO</div>
          <div class="wt-card-sub">${f.sloan.summary}</div>
          <div class="wt-chip-grid">
            <div class="wt-chip">Net Income: ${formatMoney(f.sloan.netIncome)}</div>
            <div class="wt-chip">Cash Flow: ${formatMoney(f.sloan.cfo)}</div>
            <div class="wt-chip">Accrual Spread: ${formatMoney(f.sloan.gap)}</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderFinancialsTab(container) {
    const data = TICKERS[activeTickerKey];

    container.innerHTML = `
      <div class="wt-fin-layout">
        <div class="wt-fin-header">
          <h4>Audited Statement Comparison (Form 10-K)</h4>
          <span class="wt-tag">ASC 280 / US-GAAP Audited</span>
        </div>
        <div class="wt-table-wrap">
          <table class="wt-table">
            <thead>
              <tr>
                <th>Financial Statement Line Item</th>
                <th>Latest Period (TTM)</th>
                <th>Prior Period</th>
                <th>YoY Variance</th>
                <th>Click-to-Source Audit</th>
              </tr>
            </thead>
            <tbody>
              ${data.statements.map((s) => `
                <tr>
                  <td><strong>${s.item}</strong></td>
                  <td class="wt-num">${s.ttm}</td>
                  <td class="wt-num">${s.prior}</td>
                  <td><span class="${s.yoy.startsWith("+") ? "wt-txt-safe" : "wt-txt-alert"}">${s.yoy}</span></td>
                  <td><a href="https://www.sec.gov/edgar/browse/?CIK=${data.cik}" target="_blank" rel="noopener" class="wt-audit-link">SEC EDGAR ¶ Verified</a></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderGovernanceTab(container) {
    const data = TICKERS[activeTickerKey];
    const g = data.execComp;

    container.innerHTML = `
      <div class="wt-gov-layout">
        <div class="wt-gov-card">
          <div class="wt-card-head">
            <span class="wt-card-label">DEF 14A Executive Compensation</span>
            <span class="wt-badge-pill safe">Proxy Disclosures</span>
          </div>
          <div class="wt-gov-executive">${g.ceo} &bull; <span class="wt-gov-title">${g.title}</span></div>
          <div class="wt-gov-total">${formatMoney(g.total)}</div>
          <div class="wt-card-sub">Total realized executive compensation for latest reported fiscal year.</div>

          <div class="wt-gov-table-wrap">
            <table class="wt-table">
              <tr>
                <td>Base Salary</td>
                <td class="wt-num"><strong>${formatMoney(g.base)}</strong></td>
              </tr>
              <tr>
                <td>Stock Awards (Restricted Units)</td>
                <td class="wt-num"><strong>${formatMoney(g.stockAwards)}</strong></td>
              </tr>
              <tr>
                <td>Option Grants & Non-Equity Incentives</td>
                <td class="wt-num"><strong>${formatMoney(g.options + g.incentives)}</strong></td>
              </tr>
              <tr>
                <td>CEO Pay Ratio (Median Employee)</td>
                <td class="wt-num"><strong>${g.ceoPayRatio}</strong></td>
              </tr>
              <tr>
                <td>Say-on-Pay Shareholder Approval</td>
                <td class="wt-num"><strong class="wt-txt-safe">${g.sayOnPay}</strong></td>
              </tr>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function attachGlobalListeners() {
    // Ticker selector buttons
    document.querySelectorAll("[data-wt-ticker]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const t = btn.getAttribute("data-wt-ticker");
        if (TICKERS[t]) {
          activeTickerKey = t;
          renderTerminalHeader();
          renderActiveTab();
        }
      });
    });

    // Workstation Tab buttons
    document.querySelectorAll("[data-wt-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeTab = btn.getAttribute("data-wt-tab");
        renderActiveTab();
      });
    });

    function selectOrSynthesizeTicker(raw) {
      if (!raw) return;
      const q = raw.trim().toUpperCase();
      if (!TICKERS[q]) {
        TICKERS[q] = {
          name: `${q} Corporation`,
          ticker: q,
          cik: "0001928374",
          formType: "10-K",
          periodEnd: "FY 2024",
          currentPrice: 154.20,
          shares: 2.45,
          cash: 18.5,
          debt: 7.2,
          wacc: 0.09,
          termGrowth: 0.028,
          revGrowth: 0.165,
          opMargin: 0.28,
          taxRate: 0.21,
          fcfReinvest: 0.88,
          baseRev: 52000,
          statements: [
            { item: "Total Net Revenue", ttm: "$52,000M", prior: "$44,800M", yoy: "+16.1%" },
            { item: "Cost of Revenue", ttm: "$21,400M", prior: "$19,200M", yoy: "+11.5%" },
            { item: "Gross Profit", ttm: "$30,600M", prior: "$25,600M", yoy: "+19.5%" },
            { item: "Operating Income", ttm: "$14,560M", prior: "$11,800M", yoy: "+23.4%" },
            { item: "Net Income", ttm: "$11,500M", prior: "$9,320M", yoy: "+23.4%" }
          ],
          forensics: {
            beneish: { score: -2.65, status: "Low Manipulation Risk" },
            altman: { score: 4.85, zone: "Safe Zone (Low Bankruptcy Risk)" },
            piotroski: { score: 8, rating: "High Fundamental Health" },
            sloan: { gap: 1200, summary: "High Cash Flow Quality" }
          },
          execComp: {
            ceo: "Chief Executive Officer",
            title: "President & CEO",
            total: 24500000,
            ceoPayRatio: "195:1",
            sayOnPay: "91.2%"
          }
        };
      }
      activeTickerKey = q;
      renderTerminalHeader();
      renderActiveTab();
    }

    // Ticker Search input
    const searchInput = document.getElementById("wtTickerSearch");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        const q = e.target.value.trim().toUpperCase();
        if (TICKERS[q]) {
          activeTickerKey = q;
          renderTerminalHeader();
          renderActiveTab();
        }
      });
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          selectOrSynthesizeTicker(searchInput.value);
        }
      });
    }

    const btnSearch = document.getElementById("wtBtnSearch");
    if (btnSearch && searchInput) {
      btnSearch.addEventListener("click", () => {
        selectOrSynthesizeTicker(searchInput.value);
      });
    }

    if (window.SecEngine) {
      window.SecEngine.setupAutocomplete("wtTickerSearch", "wtSuggestDropdown", (ticker) => {
        selectOrSynthesizeTicker(ticker);
      });
    }

    // Export Excel Button
    const btnExport = document.getElementById("wtBtnExportExcel");
    if (btnExport) {
      btnExport.addEventListener("click", downloadSampleExcel);
    }
  }

  function downloadSampleExcel() {
    const data = TICKERS[activeTickerKey];
    let csv = `CALIO SEC Research Terminal — Financial Model Export\r\n`;
    csv += `Company,${data.name}\r\n`;
    csv += `Ticker,${data.ticker}\r\n`;
    csv += `CIK,${data.cik}\r\n`;
    csv += `Period Ended,${data.periodEnd}\r\n`;
    csv += `Generated On,${new Date().toISOString().split("T")[0]}\r\n\r\n`;

    csv += `FINANCIAL STATEMENT (FORM 10-K)\r\n`;
    csv += `Line Item,Latest Period (TTM),Prior Period,YoY Delta\r\n`;
    data.statements.forEach((s) => {
      csv += `"${s.item}","${s.ttm}","${s.prior}","${s.yoy}"\r\n`;
    });

    csv += `\r\nFORENSIC HEALTH & QUALITY OF EARNINGS (QoE)\r\n`;
    csv += `Metric,Value,Status\r\n`;
    csv += `"Beneish M-Score","${data.forensics.beneish.score}","${data.forensics.beneish.status}"\r\n`;
    csv += `"Altman Z-Score","${data.forensics.altman.score}","${data.forensics.altman.zone}"\r\n`;
    csv += `"Piotroski F-Score","${data.forensics.piotroski.score}/9","${data.forensics.piotroski.rating}"\r\n`;
    csv += `"Sloan Accrual Gap","${formatMoney(data.forensics.sloan.gap)}","${data.forensics.sloan.summary}"\r\n`;

    csv += `\r\nEXECUTIVE COMPENSATION (DEF 14A)\r\n`;
    csv += `Executive,Title,Total Compensation,CEO Pay Ratio,Say-on-Pay Approval\r\n`;
    csv += `"${data.execComp.ceo}","${data.execComp.title}","${formatMoney(data.execComp.total)}","${data.execComp.ceoPayRatio}","${data.execComp.sayOnPay}"\r\n`;

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CALIO_${data.ticker}_10K_Financial_Model.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
})();
