"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/lib/reportPdf.ts
var reportPdf_exports = {};
__export(reportPdf_exports, {
  downloadReportPdf: () => downloadReportPdf
});
module.exports = __toCommonJS(reportPdf_exports);
var import_jspdf = require("jspdf");
var import_qrcode = __toESM(require("qrcode"), 1);
var NAVY = [15, 23, 42];
var GRAY = [100, 116, 139];
var LIGHT_LINE = [226, 232, 240];
var ZEBRA = [241, 245, 249];
var RISK_COLORS = {
  VERIFIED: [16, 185, 129],
  LOW: [14, 165, 233],
  MEDIUM: [245, 158, 11],
  HIGH: [249, 115, 22],
  CRITICAL: [239, 68, 68]
};
var RISK_BG = {
  VERIFIED: [236, 253, 245],
  LOW: [240, 249, 255],
  MEDIUM: [255, 251, 235],
  HIGH: [255, 247, 237],
  CRITICAL: [254, 242, 242]
};
var SEVERITY_COLORS = {
  Low: GRAY,
  Medium: RISK_COLORS.MEDIUM,
  High: RISK_COLORS.HIGH,
  Critical: RISK_COLORS.CRITICAL
};
async function downloadReportPdf(report) {
  const { transaction: t, analysis: a } = report;
  const riskLevel = a?.riskLevel ?? "PENDING";
  const riskColor = RISK_COLORS[riskLevel] ?? GRAY;
  const riskBg = RISK_BG[riskLevel] ?? [248, 250, 252];
  const doc = new import_jspdf.jsPDF();
  const marginX = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - marginX * 2;
  const cardTop = 14;
  let y = cardTop;
  function ensureSpace(needed) {
    if (y + needed > pageHeight - 24) {
      doc.addPage();
      y = 20;
    }
  }
  doc.saveGraphicsState();
  doc.setGState(doc.GState({ opacity: 0.06 }));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(46);
  doc.setTextColor(...riskColor);
  doc.text(`${riskLevel} RISK`, pageWidth / 2, pageHeight / 2, { align: "center", angle: 45 });
  doc.restoreGraphicsState();
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...NAVY);
  doc.text("AI BLOCK SYSTEM", marginX, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  doc.text("Cross-Border Transfer Network", marginX, y + 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text("FORENSIC ANALYSIS REPORT", pageWidth - marginX, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text(`Generated ${(/* @__PURE__ */ new Date()).toLocaleString()}`, pageWidth - marginX, y + 5, { align: "right" });
  y += 11;
  doc.setDrawColor(...LIGHT_LINE);
  doc.setLineWidth(0.4);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 14;
  const pillLabel = a ? `${riskLevel} RISK` : "NOT YET ANALYZED";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  const pillWidth = doc.getTextWidth(pillLabel) + 16;
  doc.setFillColor(...riskBg);
  doc.roundedRect(pageWidth / 2 - pillWidth / 2, y - 6.25 - 3, pillWidth, 8.5, 4, 4, "F");
  doc.setTextColor(...riskColor);
  doc.text(pillLabel, pageWidth / 2, y, { align: "center" });
  y += 15;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(...NAVY);
  doc.text(a ? `${a.finalRiskScore.toFixed(1)} / 100` : "\u2014", pageWidth / 2, y, { align: "center" });
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...GRAY);
  doc.text(
    a ? `Semantic ${a.semanticScore.toFixed(0)} \xB7 Protocol ${a.templateScore.toFixed(0)} \xB7 Forensic ${a.forensicScore.toFixed(0)} \xB7 Behavioral ${a.behavioralScore.toFixed(0)}` : "This transaction has not been analyzed yet.",
    pageWidth / 2,
    y,
    { align: "center" }
  );
  y += 12;
  doc.setDrawColor(...LIGHT_LINE);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 2;
  const labelColWidth = 42;
  const valueColX = marginX + labelColWidth + 4;
  const valueColWidth = contentWidth - labelColWidth - 4;
  function tableRows(rows) {
    rows.forEach(([label, value], i) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      const wrapped = doc.splitTextToSize(value, valueColWidth);
      const lineCount = Array.isArray(wrapped) ? wrapped.length : 1;
      const rowHeight = Math.max(9, lineCount * 5 + 3);
      ensureSpace(rowHeight);
      if (i % 2 === 0) {
        doc.setFillColor(...ZEBRA);
        doc.rect(marginX, y, contentWidth, rowHeight, "F");
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY);
      doc.text(label.toUpperCase(), marginX + 3, y + rowHeight / 2 - (lineCount - 1) * 2.5 + 1, { baseline: "middle" });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...NAVY);
      doc.text(wrapped, valueColX, y + rowHeight / 2 - (lineCount - 1) * 2.5 + 1, { baseline: "middle" });
      y += rowHeight;
    });
  }
  function sectionHeading(text) {
    ensureSpace(12);
    y += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...NAVY);
    doc.text(text, marginX, y);
    y += 5;
  }
  sectionHeading("Transaction Summary");
  tableRows([
    ["Hash", t.transactionHash],
    ["Network", t.network],
    ["From", t.fromAddress],
    ["To", t.toAddress],
    ["Amount", String(t.amount)],
    ["Timestamp", new Date(t.timestamp).toLocaleString()],
    ["Status", t.status],
    ["Settlement", t.settlementStatus],
    ...t.settlementTxHash ? [["Settlement Tx Hash", t.settlementTxHash]] : []
  ]);
  if (a) {
    sectionHeading("Module Scores");
    const modules = [
      ["Semantic Analysis", a.semanticScore],
      ["Protocol Verification", a.templateScore],
      ["Micro-Level Forensics", a.forensicScore],
      ["Behavioral Analysis", a.behavioralScore]
    ];
    const barX = marginX + 48;
    const barWidth = contentWidth - 48 - 16;
    for (const [label, score] of modules) {
      ensureSpace(9);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...NAVY);
      doc.text(label, marginX, y + 4);
      doc.setFillColor(...LIGHT_LINE);
      doc.roundedRect(barX, y + 1, barWidth, 4.5, 1, 1, "F");
      doc.setFillColor(...riskColor);
      doc.roundedRect(barX, y + 1, barWidth * Math.min(Math.max(score, 0), 100) / 100, 4.5, 1, 1, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...GRAY);
      doc.text(score.toFixed(0), barX + barWidth + 4, y + 4.5);
      y += 9;
    }
    sectionHeading(`Detected Anomalies (${a.anomalies.length})`);
    if (a.anomalies.length === 0) {
      ensureSpace(6);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(...GRAY);
      doc.text("No anomalies detected.", marginX, y + 3);
      y += 8;
    } else {
      for (const anomaly of a.anomalies) {
        const sevColor = SEVERITY_COLORS[anomaly.severity] ?? GRAY;
        const desc = doc.splitTextToSize(anomaly.description, contentWidth - 6);
        const blockHeight = 6 + desc.length * 4.6 + 3;
        ensureSpace(blockHeight);
        doc.setFillColor(...sevColor);
        doc.rect(marginX, y, 1.2, blockHeight - 2, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(...NAVY);
        doc.text(`${anomaly.type}`, marginX + 4, y + 4);
        doc.setTextColor(...sevColor);
        doc.setFontSize(8);
        doc.text(anomaly.severity.toUpperCase(), marginX + 4 + doc.getTextWidth(`${anomaly.type}  `), y + 4);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...GRAY);
        doc.text(desc, marginX + 4, y + 9);
        y += blockHeight + 2;
      }
    }
    sectionHeading("AI Recommendation");
    const rec = doc.splitTextToSize(a.recommendation, contentWidth);
    ensureSpace(rec.length * 4.8 + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...NAVY);
    doc.text(rec, marginX, y + 3);
    y += rec.length * 4.8 + 6;
  }
  ensureSpace(40);
  y += 6;
  doc.setDrawColor(...LIGHT_LINE);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 8;
  const qrText = [
    "AI Block System \u2014 Forensic Report",
    `Tx: ${t.transactionHash}`,
    `Risk Level: ${riskLevel}`,
    a ? `Score: ${a.finalRiskScore.toFixed(1)} / 100` : "Score: N/A"
  ].join("\n");
  const qrDataUrl = await import_qrcode.default.toDataURL(qrText, { margin: 1, width: 240 });
  const qrSize = 24;
  doc.addImage(qrDataUrl, "PNG", marginX, y, qrSize, qrSize);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text("Scan to verify", marginX + qrSize / 2, y + qrSize + 4, { align: "center" });
  const disclaimerX = marginX + qrSize + 8;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text(
    "This report was generated automatically by the AI Block System risk engine.",
    disclaimerX,
    y + 6,
    { maxWidth: contentWidth - qrSize - 8 }
  );
  doc.setFont("helvetica", "normal");
  doc.text(
    "AI Block System \xB7 NOC-Gated Cross-Border Transfer Network",
    disclaimerX,
    y + 13,
    { maxWidth: contentWidth - qrSize - 8 }
  );
  doc.save(`report-${t.id}.pdf`);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  downloadReportPdf
});
