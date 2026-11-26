(() => {
  'use strict';

  // =========================================================================
  // Constants & Tier Definitions
  // =========================================================================
  const DEFAULT_THRESHOLDS = {
    tier2Min: 0.50,
    tier3Min: 1.50,
    tier4Min: 3.00,
  };

  const TIER_META = {
    1: {
      tier: 1,
      name: 'Optimal Condition',
      pill: 'TIER 1 // OPTIMAL CONDITION',
      shortLabel: 'Tier 1 — Optimal',
      timeline: 'No Service Needed',
      status: 'OPTIMAL PERFORMANCE — No service needed',
      action: 'Normal operation; equipment running within baseline tolerances.',
      color: '#10b981',
    },
    2: {
      tier: 2,
      name: 'Minor Wear Detected',
      pill: 'TIER 2 // MINOR WEAR DETECTED',
      shortLabel: 'Tier 2 — Service Recommended',
      timeline: 'Next Planned Downtime',
      status: 'SERVICE RECOMMENDED — For optimum performance',
      action: 'Early bearing/alignment wear detected. Schedule routine inspection and lubrication during next planned downtime.',
      color: '#eab308',
    },
    3: {
      tier: 3,
      name: 'Moderate Degradation',
      pill: 'TIER 3 // MODERATE DEGRADATION',
      shortLabel: 'Tier 3 — Within 30 Days',
      timeline: 'Within 30 Operating Days',
      status: 'SERVICE REQUIRED WITHIN 30 DAYS OF USE',
      action: 'Abnormal vibration sustained. Order replacement parts and schedule maintenance within 30 operating days to prevent failure.',
      color: '#f97316',
    },
    4: {
      tier: 4,
      name: 'Critical Fault',
      pill: 'TIER 4 // CRITICAL FAULT',
      shortLabel: 'Tier 4 — Immediate',
      timeline: 'Immediate Halt & Service',
      status: 'CRITICAL: SERVICE REQUIRED IMMEDIATELY',
      action: 'Severe mechanical instability. Halt operation immediately to prevent catastrophic damage.',
      color: '#ef4444',
    },
  };

  const MAX_CHART_POINTS = 120;
  const MAX_CONSOLE_LINES = 600;

  // =========================================================================
  // Application State
  // =========================================================================
  const state = {
    thresholds: { ...DEFAULT_THRESHOLDS },
    consoleExpanded: false,
    consoleAutoScroll: true,
    consoleLineCount: 0,

    // Connection state
    mode: 'disconnected', // 'disconnected' | 'serial' | 'sim'
    port: null,
    reader: null,
    readableStreamClosed: null,
    keepReading: false,
    simTimer: null,
    simStep: 0,

    // Telemetry state
    latestTelemetry: null,
    latestAssessment: null,
    previousTier: 1,
    sessionPeakDev: 0,
    worstTierReached: 1,
    packetsParsed: 0,
    history: [], // { timestamp: Date, maxDev: number, tier: number, anomalyCount: number }
    escalationLog: [],
  };

  // =========================================================================
  // DOM References
  // =========================================================================
  const dom = {
    portLabel: document.getElementById('port-label'),
    metaDot: document.getElementById('meta-dot'),
    btnConnect: document.getElementById('btn-connect'),
    btnDisconnect: document.getElementById('btn-disconnect'),
    btnDemo: document.getElementById('btn-demo'),
    btnResetAll: document.getElementById('btn-reset-all'),
    btnSettings: document.getElementById('btn-settings'),
    settingsDrawer: document.getElementById('settings-drawer'),

    alertBanner: document.getElementById('alert-banner'),
    alertTitle: document.getElementById('alert-title'),
    alertMessage: document.getElementById('alert-message'),
    btnDismissAlert: document.getElementById('btn-dismiss-alert'),

    sliderTier2: document.getElementById('slider-tier2'),
    sliderTier3: document.getElementById('slider-tier3'),
    sliderTier4: document.getElementById('slider-tier4'),
    valTier2: document.getElementById('val-tier2'),
    valTier3: document.getElementById('val-tier3'),
    valTier4: document.getElementById('val-tier4'),
    hintTier2: document.getElementById('hint-tier2'),

    heroCard: document.getElementById('hero-card'),
    heroTierBadge: document.getElementById('hero-tier-badge'),
    heroTimeline: document.getElementById('hero-timeline'),
    heroTrigger: document.getElementById('hero-trigger'),
    heroStatus: document.getElementById('hero-status'),
    heroAction: document.getElementById('hero-action'),
    heroMaxDev: document.getElementById('hero-max-dev'),
    heroLastUpdate: document.getElementById('hero-last-update'),

    gaugeCurrentVal: document.getElementById('gauge-current-val'),
    gaugeScaleMax: document.getElementById('gauge-scale-max'),
    zone1: document.getElementById('zone-1'),
    zone2: document.getElementById('zone-2'),
    zone3: document.getElementById('zone-3'),
    zone4: document.getElementById('zone-4'),
    gaugeNeedle: document.getElementById('gauge-needle'),
    tickT2: document.getElementById('tick-t2'),
    tickT3: document.getElementById('tick-t3'),
    tickT4: document.getElementById('tick-t4'),
    tickMax: document.getElementById('tick-max'),

    chartCanvas: document.getElementById('telemetry-chart'),
    chartTooltip: document.getElementById('chart-tooltip'),

    anomalyFraction: document.getElementById('anomaly-fraction'),
    anomalySlots: Array.from(document.querySelectorAll('#anomaly-slots .anomaly-slot')),
    badgeWindow: document.getElementById('badge-window'),
    ledIndicator: document.getElementById('led-indicator'),
    badgeLed: document.getElementById('badge-led'),
    buzzerIndicator: document.getElementById('buzzer-indicator'),
    badgeBuzzer: document.getElementById('badge-buzzer'),
    statPeakDev: document.getElementById('stat-peak-dev'),
    badgeWorstTier: document.getElementById('badge-worst-tier'),
    statPackets: document.getElementById('stat-packets'),

    logTbody: document.getElementById('log-tbody'),
    btnExportCsv: document.getElementById('btn-export-csv'),

    btnToggleConsole: document.getElementById('btn-toggle-console'),
    consoleBody: document.getElementById('console-body'),
    consoleOutput: document.getElementById('console-output'),
    consoleLineCount: document.getElementById('console-line-count'),
    btnPauseScroll: document.getElementById('btn-pause-scroll'),
    btnClearConsole: document.getElementById('btn-clear-console'),
  };

  // =========================================================================
  // Utility Helpers
  // =========================================================================
  function formatTime(date) {
    return date.toLocaleTimeString([], {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  function formatIsoLocal(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
      `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    );
  }

  function showAlert(title, message) {
    dom.alertTitle.textContent = title;
    dom.alertMessage.textContent = message;
    dom.alertBanner.classList.remove('hidden');
  }

  function hideAlert() {
    dom.alertBanner.classList.add('hidden');
  }

  function escapeCsvField(value) {
    const str = String(value ?? '');
    if (/[",\r\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  // =========================================================================
  // Serial Data Parser
  // =========================================================================
  /**
   * Parses lines formatted like:
   * Window: NORMAL | Max dev: 0.12 | Last 5 anomalies: 0 | LED: OFF | Buzzer: OFF
   */
  function parseTelemetryLine(rawLine) {
    if (!rawLine || typeof rawLine !== 'string') return null;

    const line = rawLine.trim();
    if (!line.includes('Window:') || !line.includes('Max dev:')) {
      return null;
    }

    const windowMatch = line.match(/Window:\s*([A-Za-z0-9_-]+)/i);
    const maxDevMatch = line.match(/Max dev:\s*(-?\d+(?:\.\d+)?)/i);
    const anomalyMatch = line.match(/Last\s*5\s*anomalies:\s*(\d+)/i);
    const ledMatch = line.match(/LED:\s*(ON|OFF)/i);
    const buzzerMatch = line.match(/Buzzer:\s*(ACTIVE|ON|OFF)/i);

    if (!windowMatch || !maxDevMatch || !anomalyMatch || !ledMatch || !buzzerMatch) {
      return null;
    }

    const maxDev = parseFloat(maxDevMatch[1]);
    const anomalyRaw = parseInt(anomalyMatch[1], 10);
    if (!Number.isFinite(maxDev) || !Number.isFinite(anomalyRaw)) {
      return null;
    }

    const rawBuzzer = buzzerMatch[1].toUpperCase();

    return {
      windowStatus: windowMatch[1].toUpperCase(),
      maxDev: Math.max(0, maxDev),
      anomalyCount: Math.max(0, Math.min(5, anomalyRaw)),
      ledState: ledMatch[1].toUpperCase(),
      buzzerState: rawBuzzer === 'ON' ? 'ACTIVE' : rawBuzzer,
      raw: line,
      timestamp: new Date(),
    };
  }

  // =========================================================================
  // Multi-Tier Service Urgency Assessment Engine
  // =========================================================================
  function assessUrgency(telemetry, thresholds) {
    const { maxDev, anomalyCount, buzzerState } = telemetry;
    const { tier2Min, tier3Min, tier4Min } = thresholds;

    // Tier 4 — Critical Fault (>= 3.00 m/s² or Last 5 anomalies >= 3 / Buzzer: ACTIVE)
    const t4Reasons = [];
    if (maxDev >= tier4Min) {
      t4Reasons.push(`Max dev ${maxDev.toFixed(2)} >= ${tier4Min.toFixed(2)} m/s²`);
    }
    if (anomalyCount >= 3) {
      t4Reasons.push(`Last 5 anomalies = ${anomalyCount} (>= 3)`);
    }
    if (buzzerState === 'ACTIVE') {
      t4Reasons.push('Hardware Buzzer: ACTIVE');
    }
    if (t4Reasons.length > 0) {
      return {
        ...TIER_META[4],
        reason: t4Reasons.join(' + '),
      };
    }

    // Tier 3 — Moderate Degradation (1.50 – 2.99 m/s² or Last 5 anomalies = 2)
    const t3Reasons = [];
    if (maxDev >= tier3Min) {
      t3Reasons.push(`Max dev ${maxDev.toFixed(2)} >= ${tier3Min.toFixed(2)} m/s²`);
    }
    if (anomalyCount === 2) {
      t3Reasons.push('Last 5 anomalies = 2');
    }
    if (t3Reasons.length > 0) {
      return {
        ...TIER_META[3],
        reason: t3Reasons.join(' + '),
      };
    }

    // Tier 2 — Minor Wear Detected (0.50 – 1.49 m/s²)
    if (maxDev >= tier2Min) {
      return {
        ...TIER_META[2],
        reason: `Max dev ${maxDev.toFixed(2)} >= ${tier2Min.toFixed(2)} m/s²`,
      };
    }

    // Tier 1 — Optimal Condition (0.00 – 0.49 m/s²)
    return {
      ...TIER_META[1],
      reason: `Max dev ${maxDev.toFixed(2)} < ${tier2Min.toFixed(2)} m/s² & anomalies <= 1`,
    };
  }

  // =========================================================================
  // Real-Time Telemetry Canvas Chart
  // =========================================================================
  class TelemetryChart {
    constructor(canvas, tooltipEl) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.tooltip = tooltipEl;
      this.hoverIndex = -1;
      this.plotPoints = [];

      this.resizeObserver = new ResizeObserver(() => this.draw());
      this.resizeObserver.observe(this.canvas.parentElement);

      this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
      this.canvas.addEventListener('mouseleave', () => {
        this.hoverIndex = -1;
        this.tooltip.classList.add('hidden');
        this.draw();
      });
    }

    handleMouseMove(event) {
      if (this.plotPoints.length === 0) return;
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;

      let closestIdx = -1;
      let minDist = Infinity;
      for (let i = 0; i < this.plotPoints.length; i++) {
        const dist = Math.abs(this.plotPoints[i].x - mouseX);
        if (dist < minDist) {
          minDist = dist;
          closestIdx = i;
        }
      }

      if (closestIdx !== -1 && minDist <= 28) {
        this.hoverIndex = closestIdx;
        const pt = this.plotPoints[closestIdx];
        const tierColor = TIER_META[pt.sample.tier].color;
        this.tooltip.innerHTML =
          `<div style="color:${tierColor};font-weight:700;">Tier ${pt.sample.tier} — ${pt.sample.maxDev.toFixed(2)} m/s²</div>` +
          `<div>Time: ${formatTime(pt.sample.timestamp)} | Anomalies: ${pt.sample.anomalyCount}/5</div>`;
        this.tooltip.classList.remove('hidden');

        const tipW = this.tooltip.offsetWidth || 180;
        const left = Math.min(Math.max(8, pt.x + 12), rect.width - tipW - 8);
        const top = Math.max(8, pt.y - 42);
        this.tooltip.style.left = `${left}px`;
        this.tooltip.style.top = `${top}px`;
      } else {
        this.hoverIndex = -1;
        this.tooltip.classList.add('hidden');
      }
      this.draw();
    }

    draw() {
      const parent = this.canvas.parentElement;
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      if (width <= 0 || height <= 0) return;

      const dpr = window.devicePixelRatio || 1;
      if (this.canvas.width !== Math.floor(width * dpr) || this.canvas.height !== Math.floor(height * dpr)) {
        this.canvas.width = Math.floor(width * dpr);
        this.canvas.height = Math.floor(height * dpr);
      }

      const ctx = this.ctx;
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const pad = { top: 16, right: 18, bottom: 28, left: 48 };
      const plotW = width - pad.left - pad.right;
      const plotH = height - pad.top - pad.bottom;

      const { tier2Min, tier3Min, tier4Min } = state.thresholds;
      const data = state.history;
      const maxData = data.reduce((acc, d) => Math.max(acc, d.maxDev), 0);
      const yMax = Math.max(tier4Min * 1.35, maxData * 1.15, 4.0);

      const yToPx = (val) => pad.top + plotH - (Math.min(Math.max(val, 0), yMax) / yMax) * plotH;

      // Draw colored horizontal threshold bands
      const bands = [
        { from: 0, to: tier2Min, fill: 'rgba(16, 185, 129, 0.08)' },
        { from: tier2Min, to: tier3Min, fill: 'rgba(234, 179, 8, 0.08)' },
        { from: tier3Min, to: tier4Min, fill: 'rgba(249, 115, 22, 0.09)' },
        { from: tier4Min, to: yMax, fill: 'rgba(239, 68, 68, 0.11)' },
      ];

      bands.forEach((b) => {
        const yTop = yToPx(Math.min(b.to, yMax));
        const yBot = yToPx(Math.max(b.from, 0));
        if (yBot > yTop) {
          ctx.fillStyle = b.fill;
          ctx.fillRect(pad.left, yTop, plotW, yBot - yTop);
        }
      });

      // Y-axis gridlines & labels
      ctx.font = '11px Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const steps = 4;
      for (let i = 0; i <= steps; i++) {
        const val = (yMax / steps) * i;
        const y = yToPx(val);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + plotW, y);
        ctx.stroke();

        ctx.fillStyle = '#64748b';
        ctx.fillText(val.toFixed(1), pad.left - 8, y);
      }

      // Threshold reference lines
      const thresholdLines = [
        { val: tier2Min, color: 'rgba(234, 179, 8, 0.75)', label: `T2 (${tier2Min.toFixed(2)})` },
        { val: tier3Min, color: 'rgba(249, 115, 22, 0.8)', label: `T3 (${tier3Min.toFixed(2)})` },
        { val: tier4Min, color: 'rgba(239, 68, 68, 0.85)', label: `T4 (${tier4Min.toFixed(2)})` },
      ];

      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      thresholdLines.forEach((t) => {
        const y = yToPx(t.val);
        ctx.strokeStyle = t.color;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + plotW, y);
        ctx.stroke();

        ctx.fillStyle = t.color;
        ctx.fillText(t.label, pad.left + 6, y - 3);
      });
      ctx.restore();

      // Empty state message
      this.plotPoints = [];
      if (data.length === 0) {
        ctx.fillStyle = '#64748b';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Awaiting incoming ESP32 telemetry packets...', pad.left + plotW / 2, pad.top + plotH / 2);
        ctx.restore();
        return;
      }

      // Compute plotted points
      const count = data.length;
      const denom = Math.max(1, count - 1);
      for (let i = 0; i < count; i++) {
        const x = count === 1 ? pad.left + plotW : pad.left + (i / denom) * plotW;
        const y = yToPx(data[i].maxDev);
        this.plotPoints.push({ x, y, sample: data[i] });
      }

      // Area under line
      ctx.beginPath();
      ctx.moveTo(this.plotPoints[0].x, pad.top + plotH);
      for (let i = 0; i < this.plotPoints.length; i++) {
        ctx.lineTo(this.plotPoints[i].x, this.plotPoints[i].y);
      }
      ctx.lineTo(this.plotPoints[this.plotPoints.length - 1].x, pad.top + plotH);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0.24)');
      grad.addColorStop(1, 'rgba(56, 189, 248, 0.01)');
      ctx.fillStyle = grad;
      ctx.fill();

      // Main line
      ctx.beginPath();
      for (let i = 0; i < this.plotPoints.length; i++) {
        const pt = this.plotPoints[i];
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Point dots colored by tier
      for (let i = 0; i < this.plotPoints.length; i++) {
        const pt = this.plotPoints[i];
        const isHovered = i === this.hoverIndex;
        const isLast = i === this.plotPoints.length - 1;
        if (count > 55 && !isHovered && !isLast && pt.sample.tier < 3) continue;

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, isHovered ? 5 : isLast ? 4 : 2.8, 0, Math.PI * 2);
        ctx.fillStyle = TIER_META[pt.sample.tier].color;
        ctx.fill();
        if (isHovered || isLast) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      // Hover crosshair
      if (this.hoverIndex >= 0 && this.plotPoints[this.hoverIndex]) {
        const hp = this.plotPoints[this.hoverIndex];
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(hp.x, pad.top);
        ctx.lineTo(hp.x, pad.top + plotH);
        ctx.stroke();
        ctx.restore();
      }

      // X-axis first / last timestamps
      ctx.fillStyle = '#64748b';
      ctx.font = '11px Consolas, monospace';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(formatTime(data[0].timestamp), pad.left, pad.top + plotH + 8);
      ctx.textAlign = 'right';
      ctx.fillText(formatTime(data[data.length - 1].timestamp), pad.left + plotW, pad.top + plotH + 8);

      ctx.restore();
    }
  }

  const telemetryChart = new TelemetryChart(dom.chartCanvas, dom.chartTooltip);

  // =========================================================================
  // UI Rendering
  // =========================================================================
  function getGaugeScaleMax() {
    const liveVal = state.latestTelemetry ? state.latestTelemetry.maxDev : 0;
    return Math.max(state.thresholds.tier4Min * 1.5, liveVal * 1.15, 4.5);
  }

  function renderGauge() {
    const { tier2Min, tier3Min, tier4Min } = state.thresholds;
    const scaleMax = getGaugeScaleMax();
    const liveVal = state.latestTelemetry ? state.latestTelemetry.maxDev : 0;

    const p2 = (tier2Min / scaleMax) * 100;
    const p3 = (tier3Min / scaleMax) * 100;
    const p4 = (tier4Min / scaleMax) * 100;

    dom.zone1.style.width = `${p2}%`;
    dom.zone2.style.width = `${Math.max(0, p3 - p2)}%`;
    dom.zone3.style.width = `${Math.max(0, p4 - p3)}%`;
    dom.zone4.style.width = `${Math.max(0, 100 - p4)}%`;

    dom.tickT2.style.left = `${p2}%`;
    dom.tickT2.textContent = tier2Min.toFixed(2);
    dom.tickT3.style.left = `${p3}%`;
    dom.tickT3.textContent = tier3Min.toFixed(2);
    dom.tickT4.style.left = `${p4}%`;
    dom.tickT4.textContent = tier4Min.toFixed(2);
    dom.tickMax.textContent = `${scaleMax.toFixed(2)}+`;

    const needlePct = Math.min(100, Math.max(0, (liveVal / scaleMax) * 100));
    dom.gaugeNeedle.style.left = `${needlePct}%`;
    dom.gaugeCurrentVal.textContent = `${liveVal.toFixed(2)} m/s²`;
    dom.gaugeScaleMax.textContent = `${scaleMax.toFixed(2)} m/s²`;
  }

  function renderHeroAndHardware() {
    const t = state.latestTelemetry;
    const a = state.latestAssessment;

    if (!t || !a) {
      dom.heroCard.className = 'hero-card tier-1';
      renderGauge();
      return;
    }

    // Hero card
    dom.heroCard.className = `hero-card tier-${a.tier}`;
    dom.heroTierBadge.textContent = a.pill;
    dom.heroTimeline.textContent = `Timeline: ${a.timeline}`;
    dom.heroTrigger.textContent = `Trigger: ${a.reason}`;
    dom.heroStatus.textContent = a.status;
    dom.heroAction.textContent = a.action;
    dom.heroMaxDev.textContent = t.maxDev.toFixed(2);
    dom.heroLastUpdate.textContent = `Last packet: ${formatTime(t.timestamp)}`;

    // Sliding window 5-block indicator
    dom.anomalyFraction.textContent = `${t.anomalyCount} / 5`;
    dom.anomalySlots.forEach((slot, idx) => {
      slot.classList.remove('active-warn', 'active-orange', 'active-crit');
      if (idx < t.anomalyCount) {
        if (t.anomalyCount >= 3) slot.classList.add('active-crit');
        else if (t.anomalyCount === 2) slot.classList.add('active-orange');
        else slot.classList.add('active-warn');
      }
    });

    // Window status badge
    dom.badgeWindow.textContent = t.windowStatus;
    dom.badgeWindow.className = `status-badge ${
      t.windowStatus === 'NORMAL' ? 'status-normal' : 'status-anomaly'
    }`;

    // LED mirror
    dom.badgeLed.textContent = t.ledState;
    dom.ledIndicator.classList.toggle('led-on', t.ledState === 'ON');

    // Buzzer mirror
    dom.badgeBuzzer.textContent = t.buzzerState;
    dom.buzzerIndicator.classList.toggle('buzzer-active', t.buzzerState === 'ACTIVE');

    // Session peaks
    dom.statPeakDev.textContent = state.sessionPeakDev.toFixed(2);
    const worstMeta = TIER_META[state.worstTierReached];
    dom.badgeWorstTier.textContent = worstMeta.shortLabel;
    dom.badgeWorstTier.className = `tier-pill tier-${state.worstTierReached}`;
    dom.statPackets.textContent = String(state.packetsParsed);

    renderGauge();
  }

  function renderEscalationLog() {
    const rows = state.escalationLog;
    dom.btnExportCsv.disabled = rows.length === 0;

    if (rows.length === 0) {
      dom.logTbody.innerHTML =
        '<tr class="empty-row"><td colspan="7">No tier escalations recorded yet. Connect COM5 or run simulation to begin monitoring.</td></tr>';
      return;
    }

    // Show newest escalations at the top
    const html = [...rows]
      .reverse()
      .map((entry) => {
        return `
          <tr>
            <td class="mono">${formatIsoLocal(entry.timestamp)}</td>
            <td class="mono">
              <span class="tier-pill tier-${entry.fromTier}">T${entry.fromTier}</span>
              &rarr;
              <span class="tier-pill tier-${entry.toTier}">T${entry.toTier}</span>
            </td>
            <td><strong>${entry.status}</strong></td>
            <td class="mono">${entry.maxDev.toFixed(2)} m/s²</td>
            <td class="mono">${entry.anomalyCount} / 5</td>
            <td class="mono">LED: ${entry.ledState} | Buzzer: ${entry.buzzerState}</td>
            <td>
              <div>${entry.reason}</div>
              <small style="color:var(--text-secondary)">${entry.action}</small>
            </td>
          </tr>
        `;
      })
      .join('');

    dom.logTbody.innerHTML = html;
  }

  function appendConsoleLine(text, kind = 'raw') {
    const placeholder = dom.consoleOutput.querySelector('.console-placeholder');
    if (placeholder) placeholder.remove();

    const lineEl = document.createElement('div');
    lineEl.className = `console-line ${kind === 'parsed' ? 'line-parsed' : kind === 'warn' ? 'line-warn' : ''}`;

    const tsSpan = document.createElement('span');
    tsSpan.className = 'ts';
    tsSpan.textContent = `[${formatTime(new Date())}]`;

    const msgNode = document.createTextNode(text);
    lineEl.appendChild(tsSpan);
    lineEl.appendChild(msgNode);
    dom.consoleOutput.appendChild(lineEl);

    while (dom.consoleOutput.children.length > MAX_CONSOLE_LINES) {
      dom.consoleOutput.removeChild(dom.consoleOutput.firstChild);
    }

    state.consoleLineCount += 1;
    dom.consoleLineCount.textContent = `${state.consoleLineCount} ${state.consoleLineCount === 1 ? 'line' : 'lines'}`;

    if (state.consoleAutoScroll && state.consoleExpanded) {
      dom.consoleOutput.scrollTop = dom.consoleOutput.scrollHeight;
    }
  }

  function updateConnectionUi() {
    if (state.mode === 'serial') {
      dom.metaDot.className = 'meta-dot connected';
      dom.btnConnect.disabled = true;
      dom.btnDisconnect.disabled = false;
      dom.btnDemo.disabled = true;
    } else if (state.mode === 'sim') {
      dom.metaDot.className = 'meta-dot simulating';
      dom.portLabel.textContent = 'Simulating Stream';
      dom.btnConnect.disabled = true;
      dom.btnDisconnect.disabled = true;
      dom.btnDemo.textContent = 'Stop Simulation';
    } else {
      dom.metaDot.className = 'meta-dot';
      dom.portLabel.textContent = 'Disconnected';
      dom.btnConnect.disabled = false;
      dom.btnDisconnect.disabled = true;
      dom.btnDemo.disabled = false;
      dom.btnDemo.textContent = 'Simulate Stream';
    }
  }

  // =========================================================================
  // Telemetry Processing Pipeline
  // =========================================================================
  function handleIncomingLine(rawLine) {
    const cleanLine = rawLine.replace(/\r$/, '');
    if (!cleanLine.trim()) return;

    const telemetry = parseTelemetryLine(cleanLine);
    appendConsoleLine(cleanLine, telemetry ? 'parsed' : 'raw');
    if (!telemetry) return;

    const assessment = assessUrgency(telemetry, state.thresholds);

    state.latestTelemetry = telemetry;
    state.latestAssessment = assessment;
    state.packetsParsed += 1;

    if (telemetry.maxDev > state.sessionPeakDev) {
      state.sessionPeakDev = telemetry.maxDev;
    }
    if (assessment.tier > state.worstTierReached) {
      state.worstTierReached = assessment.tier;
    }

    // Record escalation whenever machine moves to a higher urgency tier
    if (assessment.tier > state.previousTier) {
      state.escalationLog.push({
        timestamp: telemetry.timestamp,
        fromTier: state.previousTier,
        toTier: assessment.tier,
        status: assessment.status,
        maxDev: telemetry.maxDev,
        anomalyCount: telemetry.anomalyCount,
        windowStatus: telemetry.windowStatus,
        ledState: telemetry.ledState,
        buzzerState: telemetry.buzzerState,
        reason: assessment.reason,
        action: assessment.action,
      });
      renderEscalationLog();
    }

    state.previousTier = assessment.tier;

    // Push chart sample
    state.history.push({
      timestamp: telemetry.timestamp,
      maxDev: telemetry.maxDev,
      tier: assessment.tier,
      anomalyCount: telemetry.anomalyCount,
    });
    if (state.history.length > MAX_CHART_POINTS) {
      state.history.shift();
    }

    renderHeroAndHardware();
    telemetryChart.draw();
  }

  function reevaluateWithNewThresholds() {
    state.history.forEach((pt) => {
      const synthetic = {
        maxDev: pt.maxDev,
        anomalyCount: pt.anomalyCount,
        buzzerState: 'OFF',
      };
      pt.tier = assessUrgency(synthetic, state.thresholds).tier;
    });

    if (state.latestTelemetry) {
      state.latestAssessment = assessUrgency(state.latestTelemetry, state.thresholds);
      state.previousTier = state.latestAssessment.tier;
      if (state.latestAssessment.tier > state.worstTierReached) {
        state.worstTierReached = state.latestAssessment.tier;
      }
    }

    renderHeroAndHardware();
    telemetryChart.draw();
  }

  // =========================================================================
  // Web Serial API Connection & Line-Buffered Streaming
  // =========================================================================
  function formatSerialError(err) {
    const msg = (err && err.message ? err.message : String(err)).toLowerCase();
    const name = err && err.name ? err.name : '';

    if (name === 'SecurityError') {
      return {
        title: 'Secure Context Required for Web Serial API',
        detail:
          'Your browser requires http://localhost or https:// to access COM ports. Serve this folder locally (e.g., run start-server.bat) instead of opening via file://.',
      };
    }

    if (
      name === 'NetworkError' ||
      name === 'InvalidStateError' ||
      msg.includes('failed to open') ||
      msg.includes('access denied') ||
      msg.includes('in use') ||
      msg.includes('busy') ||
      msg.includes('locked')
    ) {
      return {
        title: 'COM Port Locked or Unavailable (e.g., COM5)',
        detail:
          'Could not open the selected COM port because it is currently locked by another application (such as Arduino IDE Serial Monitor, PuTTY, or another browser tab). Close the other serial monitor and click Connect again.',
      };
    }

    return {
      title: 'Serial Port Error',
      detail: err && err.message ? err.message : 'Unexpected error while communicating with the ESP32 serial port.',
    };
  }

  async function connectSerial() {
    hideAlert();

    if (!('serial' in navigator)) {
      showAlert(
        'Web Serial API Not Supported',
        'Please open this dashboard in Google Chrome or Microsoft Edge (desktop) over http://localhost or https:// to connect directly to COM5.'
      );
      return;
    }

    let selectedPort = null;
    try {
      selectedPort = await navigator.serial.requestPort();
    } catch (err) {
      if (err && err.name === 'NotFoundError') {
        // User cancelled the COM port picker
        return;
      }
      const formatted = formatSerialError(err);
      showAlert(formatted.title, formatted.detail);
      return;
    }

    try {
      await selectedPort.open({
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none',
      });
    } catch (err) {
      const formatted = formatSerialError(err);
      showAlert(formatted.title, formatted.detail);
      return;
    }

    state.port = selectedPort;
    state.keepReading = true;
    state.mode = 'serial';

    const info = selectedPort.getInfo ? selectedPort.getInfo() : {};
    if (info.usbVendorId !== undefined) {
      const vid = info.usbVendorId.toString(16).padStart(4, '0').toUpperCase();
      const pid = (info.usbProductId || 0).toString(16).padStart(4, '0').toUpperCase();
      dom.portLabel.textContent = `ESP32 USB-UART (VID:${vid} PID:${pid}) @ 115200`;
    } else {
      dom.portLabel.textContent = 'Serial COM Port @ 115200 8N1';
    }

    updateConnectionUi();
    appendConsoleLine('--- Connected to serial port @ 115200 baud (8N1) ---', 'warn');
    readSerialLoop(selectedPort);
  }

  async function readSerialLoop(port) {
    let lineBuffer = '';

    try {
      while (port.readable && state.keepReading) {
        const textDecoder = new TextDecoderStream();
        state.readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
        state.reader = textDecoder.readable.getReader();

        try {
          while (true) {
            const { value, done } = await state.reader.read();
            if (done) {
              break;
            }
            if (value) {
              lineBuffer += value;
              const lines = lineBuffer.split('\n');
              // Keep incomplete trailing packet fragment in buffer
              lineBuffer = lines.pop() ?? '';
              for (let i = 0; i < lines.length; i++) {
                handleIncomingLine(lines[i]);
              }
            }
          }
        } catch (readErr) {
          if (state.keepReading) {
            const formatted = formatSerialError(readErr);
            showAlert(formatted.title, formatted.detail);
            appendConsoleLine(`--- Serial read error: ${readErr.message || readErr} ---`, 'warn');
          }
          break;
        } finally {
          if (state.reader) {
            state.reader.releaseLock();
            state.reader = null;
          }
        }
      }
    } finally {
      if (lineBuffer.trim().length > 0) {
        handleIncomingLine(lineBuffer);
      }
      if (state.mode === 'serial') {
        await disconnectSerial();
      }
    }
  }

  async function disconnectSerial() {
    state.keepReading = false;

    if (state.reader) {
      try {
        await state.reader.cancel();
      } catch (_) {
        // Ignore cancellation errors during teardown
      }
    }

    if (state.readableStreamClosed) {
      try {
        await state.readableStreamClosed;
      } catch (_) {
        // Ignore stream pipe abort error
      }
      state.readableStreamClosed = null;
    }

    if (state.port) {
      try {
        await state.port.close();
      } catch (_) {
        // Port might already be closed if physically unplugged
      }
      state.port = null;
    }

    if (state.mode === 'serial') {
      state.mode = 'disconnected';
      updateConnectionUi();
      appendConsoleLine('--- Serial port disconnected cleanly ---', 'warn');
    }
  }

  if ('serial' in navigator) {
    navigator.serial.addEventListener('disconnect', async (event) => {
      if (state.port && event.target === state.port) {
        showAlert(
          'ESP32 Device Unplugged',
          'The USB serial connection was lost. Check the cable and reconnect when ready.'
        );
        await disconnectSerial();
      }
    });
  }

  // =========================================================================
  // Built-in ESP32 Telemetry Simulator (for offline UI verification)
  // =========================================================================
  function toggleSimulation() {
    if (state.mode === 'sim') {
      clearInterval(state.simTimer);
      state.simTimer = null;
      state.mode = 'disconnected';
      updateConnectionUi();
      appendConsoleLine('--- Simulation stopped ---', 'warn');
      return;
    }

    hideAlert();
    state.mode = 'sim';
    state.simStep = 0;
    updateConnectionUi();
    appendConsoleLine('--- Simulation started (emulating ESP32 serial packets) ---', 'warn');

    const emitSimulatedPacket = () => {
      const s = state.simStep++;
      let maxDev = 0.14;
      let anomalies = 0;
      let windowStatus = 'NORMAL';
      let led = 'OFF';
      let buzzer = 'OFF';

      const phase = s % 28;
      if (phase < 7) {
        maxDev = 0.08 + Math.random() * 0.25;
        anomalies = 0;
      } else if (phase < 13) {
        maxDev = 0.62 + Math.random() * 0.65;
        anomalies = 1;
        led = 'ON';
      } else if (phase < 19) {
        maxDev = 1.65 + Math.random() * 1.1;
        anomalies = 2;
        windowStatus = 'WARNING';
        led = 'ON';
      } else if (phase < 24) {
        maxDev = 3.15 + Math.random() * 1.25;
        anomalies = phase >= 21 ? 4 : 3;
        windowStatus = 'ANOMALY';
        led = 'ON';
        buzzer = 'ACTIVE';
      } else {
        maxDev = 0.18 + Math.random() * 0.2;
        anomalies = 0;
      }

      const line = `Window: ${windowStatus} | Max dev: ${maxDev.toFixed(2)} | Last 5 anomalies: ${anomalies} | LED: ${led} | Buzzer: ${buzzer}`;
      handleIncomingLine(line);
    };

    emitSimulatedPacket();
    state.simTimer = setInterval(emitSimulatedPacket, 900);
  }

  // =========================================================================
  // CSV Export
  // =========================================================================
  function exportMaintenanceCsv() {
    if (state.escalationLog.length === 0) return;

    const headers = [
      'Timestamp',
      'Previous Tier',
      'New Tier',
      'Urgency Status',
      'Max Dev (m/s^2)',
      'Last 5 Anomalies',
      'Window Status',
      'Hardware LED',
      'Hardware Buzzer',
      'Trigger Reason',
      'Recommended Action',
    ];

    const lines = [headers.map(escapeCsvField).join(',')];

    state.escalationLog.forEach((entry) => {
      lines.push(
        [
          formatIsoLocal(entry.timestamp),
          `Tier ${entry.fromTier}`,
          `Tier ${entry.toTier}`,
          entry.status,
          entry.maxDev.toFixed(2),
          `${entry.anomalyCount}/5`,
          entry.windowStatus,
          entry.ledState,
          entry.buzzerState,
          entry.reason,
          entry.action,
        ]
          .map(escapeCsvField)
          .join(',')
      );
    });

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const fileName = `esp32-maintenance-report-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
      now.getDate()
    )}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.csv`;

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // =========================================================================
  // Threshold Slider Synchronization
  // =========================================================================
  function syncThresholdInputs() {
    const { tier2Min, tier3Min, tier4Min } = state.thresholds;
    dom.sliderTier2.value = tier2Min.toFixed(2);
    dom.sliderTier3.value = tier3Min.toFixed(2);
    dom.sliderTier4.value = tier4Min.toFixed(2);

    dom.valTier2.textContent = `${tier2Min.toFixed(2)} m/s²`;
    dom.valTier3.textContent = `${tier3Min.toFixed(2)} m/s²`;
    dom.valTier4.textContent = `${tier4Min.toFixed(2)} m/s²`;
    dom.hintTier2.textContent = tier2Min.toFixed(2);
  }

  function handleSliderChange(changedKey) {
    let t2 = parseFloat(dom.sliderTier2.value);
    let t3 = parseFloat(dom.sliderTier3.value);
    let t4 = parseFloat(dom.sliderTier4.value);

    const minGap = 0.15;
    if (changedKey === 't2') {
      if (t2 > t3 - minGap) t3 = Math.min(4.0, +(t2 + minGap).toFixed(2));
      if (t3 > t4 - minGap) t4 = Math.min(8.0, +(t3 + minGap).toFixed(2));
      if (t2 > t3 - minGap) t2 = +(t3 - minGap).toFixed(2);
    } else if (changedKey === 't3') {
      if (t3 < t2 + minGap) t2 = Math.max(0.1, +(t3 - minGap).toFixed(2));
      if (t3 > t4 - minGap) t4 = Math.min(8.0, +(t3 + minGap).toFixed(2));
      if (t3 > t4 - minGap) t3 = +(t4 - minGap).toFixed(2);
    } else if (changedKey === 't4') {
      if (t4 < t3 + minGap) t3 = Math.max(0.4, +(t4 - minGap).toFixed(2));
      if (t3 < t2 + minGap) t2 = Math.max(0.1, +(t3 - minGap).toFixed(2));
      if (t4 < t3 + minGap) t4 = +(t3 + minGap).toFixed(2);
    }

    state.thresholds = { tier2Min: t2, tier3Min: t3, tier4Min: t4 };
    syncThresholdInputs();
    reevaluateWithNewThresholds();
  }

  // =========================================================================
  // Event Wiring
  // =========================================================================
  dom.btnConnect.addEventListener('click', connectSerial);
  dom.btnDisconnect.addEventListener('click', disconnectSerial);
  dom.btnDemo.addEventListener('click', toggleSimulation);
  dom.btnDismissAlert.addEventListener('click', hideAlert);

  dom.btnSettings.addEventListener('click', () => {
    const isHidden = dom.settingsDrawer.classList.toggle('hidden');
    dom.btnSettings.setAttribute('aria-expanded', String(!isHidden));
  });

  dom.sliderTier2.addEventListener('input', () => handleSliderChange('t2'));
  dom.sliderTier3.addEventListener('input', () => handleSliderChange('t3'));
  dom.sliderTier4.addEventListener('input', () => handleSliderChange('t4'));

  function resetAll() {
    if (state.mode === 'sim') {
      clearInterval(state.simTimer);
      state.simTimer = null;
      state.mode = 'disconnected';
      updateConnectionUi();
    }

    hideAlert();
    state.thresholds = { ...DEFAULT_THRESHOLDS };
    syncThresholdInputs();

    state.history = [];
    state.simStep = 0;
    state.latestTelemetry = null;
    state.latestAssessment = null;
    state.previousTier = 1;
    state.sessionPeakDev = 0;
    state.worstTierReached = 1;
    state.packetsParsed = 0;
    state.escalationLog = [];

    telemetryChart.hoverIndex = -1;
    telemetryChart.plotPoints = [];
    dom.chartTooltip.classList.add('hidden');

    dom.heroTierBadge.textContent = TIER_META[1].pill;
    dom.heroTimeline.textContent = `Timeline: ${TIER_META[1].timeline}`;
    dom.heroTrigger.textContent = 'Awaiting telemetry...';
    dom.heroStatus.textContent = TIER_META[1].status;
    dom.heroAction.textContent = TIER_META[1].action;
    dom.heroMaxDev.textContent = '0.00';
    dom.heroLastUpdate.textContent = 'Last packet: --';
    dom.anomalyFraction.textContent = '0 / 5';
    dom.anomalySlots.forEach((slot) => slot.classList.remove('active-warn', 'active-orange', 'active-crit'));
    dom.badgeWindow.textContent = '--';
    dom.badgeWindow.className = 'status-badge status-neutral';
    dom.badgeLed.textContent = 'OFF';
    dom.ledIndicator.classList.remove('led-on');
    dom.badgeBuzzer.textContent = 'OFF';
    dom.buzzerIndicator.classList.remove('buzzer-active');
    dom.statPeakDev.textContent = '0.00';
    dom.badgeWorstTier.textContent = TIER_META[1].shortLabel;
    dom.badgeWorstTier.className = 'tier-pill tier-1';
    dom.statPackets.textContent = '0';

    state.consoleLineCount = 0;
    dom.consoleLineCount.textContent = '0 lines';
    dom.consoleOutput.innerHTML = '<div class="console-placeholder">Waiting for incoming serial stream...</div>';

    renderHeroAndHardware();
    renderEscalationLog();
    telemetryChart.draw();
  }

  dom.btnResetAll.addEventListener('click', resetAll);

  dom.btnExportCsv.addEventListener('click', exportMaintenanceCsv);

  dom.btnToggleConsole.addEventListener('click', () => {
    state.consoleExpanded = !state.consoleExpanded;
    dom.consoleBody.classList.toggle('hidden', !state.consoleExpanded);
    dom.btnToggleConsole.setAttribute('aria-expanded', String(state.consoleExpanded));
    if (state.consoleExpanded && state.consoleAutoScroll) {
      dom.consoleOutput.scrollTop = dom.consoleOutput.scrollHeight;
    }
  });

  dom.btnPauseScroll.addEventListener('click', () => {
    state.consoleAutoScroll = !state.consoleAutoScroll;
    dom.btnPauseScroll.setAttribute('aria-pressed', String(!state.consoleAutoScroll));
    dom.btnPauseScroll.textContent = state.consoleAutoScroll ? 'Pause Auto-Scroll' : 'Resume Auto-Scroll';
    if (state.consoleAutoScroll && state.consoleExpanded) {
      dom.consoleOutput.scrollTop = dom.consoleOutput.scrollHeight;
    }
  });

  dom.btnClearConsole.addEventListener('click', () => {
    state.consoleLineCount = 0;
    dom.consoleLineCount.textContent = '0 lines';
    dom.consoleOutput.innerHTML = '<div class="console-placeholder">Console cleared. Waiting for incoming serial stream...</div>';
  });

  // =========================================================================
  // Initialization
  // =========================================================================
  syncThresholdInputs();
  updateConnectionUi();
  renderHeroAndHardware();
  renderEscalationLog();
  telemetryChart.draw();

  if (!('serial' in navigator)) {
    showAlert(
      'Web Serial API Unavailable in This Context',
      'To connect directly to COM5, open this page in Chrome or Edge via http://localhost (using start-server.bat) or https://. You can still test all features with "Simulate Stream".'
    );
  }
})();
