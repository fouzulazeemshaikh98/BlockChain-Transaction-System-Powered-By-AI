import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import govtEmblem from "../assets/govt-emblem.jpg";
import { TransactionResponse } from "./api";

function loadImageAsDataUrl(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas 2D context unavailable")); return; }
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/jpeg"));
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

interface ReceiptParams {
  transaction: TransactionResponse;
  accountNumber?: string | null;
  recipientAccountNumber?: string | null;
  applicantName?: string | null;
  originCountry?: string | null;
  destinationCountry?: string | null;
  failureReason?: string | null;
}

/// Shared with pages/SendTransfer.tsx's post-settlement result screen and
/// pages/Transactions.tsx's per-row "Receipt" action - one PDF design for
/// every place a settled transaction's receipt can be downloaded from,
/// instead of a page-local closure duplicated at each call site.
export async function downloadReceiptPdf(params: ReceiptParams): Promise<void> {
  const { transaction: t, accountNumber, recipientAccountNumber, applicantName, originCountry, destinationCountry, failureReason } = params;
  const isSuccess = t.settlementStatus === "Executed";
  const reference = `TXN-${String(t.id).padStart(6, "0")}`;
  const doc = new jsPDF();
  const marginX = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - marginX * 2;

  const navy: [number, number, number] = [15, 23, 42];
  const gray: [number, number, number] = [100, 116, 139];
  const lightLine: [number, number, number] = [226, 232, 240];
  const zebra: [number, number, number] = [241, 245, 249];
  const statusColor: [number, number, number] = isSuccess ? [5, 150, 105] : [190, 30, 30];
  const statusBg: [number, number, number] = isSuccess ? [236, 253, 245] : [254, 242, 242];

  const cardTop = 14;
  let y = cardTop;

  // Watermark, drawn first so every later element sits on top of it.
  // Successful transfers get the government emblem centered on the page;
  // failed ones keep a plain diagonal text stamp.
  doc.saveGraphicsState();
  doc.setGState(doc.GState({ opacity: 0.07 }));
  if (isSuccess) {
    const emblemDataUrl = await loadImageAsDataUrl(govtEmblem);
    const wmWidth = 90;
    const wmHeight = wmWidth * (148 / 168);
    doc.addImage(
      emblemDataUrl,
      "JPEG",
      pageWidth / 2 - wmWidth / 2,
      pageHeight / 2 - wmHeight / 2,
      wmWidth,
      wmHeight
    );
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(52);
    doc.setTextColor(...statusColor);
    doc.text("FAILED TRANSACTION", pageWidth / 2, pageHeight / 2, { align: "center", angle: 45 });
  }
  doc.restoreGraphicsState();

  // Letterhead
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...navy);
  doc.text("AI BLOCK SYSTEM", marginX, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...gray);
  doc.text("Cross-Border Transfer Network", marginX, y + 5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...navy);
  doc.text("OFFICIAL RECEIPT", pageWidth - marginX, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...gray);
  doc.text(`Issued ${new Date().toLocaleString()}`, pageWidth - marginX, y + 5, { align: "right" });

  y += 11;
  doc.setDrawColor(...lightLine);
  doc.setLineWidth(0.4);
  doc.line(marginX, y, pageWidth - marginX, y);

  // Status pill, centered
  y += 14;
  const statusLabel = isSuccess ? "PAYMENT SUCCESSFUL" : "PAYMENT FAILED";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  const pillTextWidth = doc.getTextWidth(statusLabel);
  const pillWidth = pillTextWidth + 16;
  const pillHeight = 8.5;
  doc.setFillColor(...statusBg);
  doc.roundedRect(pageWidth / 2 - pillWidth / 2, y - pillHeight / 2 - 3, pillWidth, pillHeight, 4, 4, "F");
  doc.setTextColor(...statusColor);
  doc.text(statusLabel, pageWidth / 2, y, { align: "center" });

  // Large centered amount
  y += 15;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.setTextColor(...navy);
  doc.text(`${t.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} mUSDC`, pageWidth / 2, y, {
    align: "center",
  });

  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...gray);
  const subtext = isSuccess
    ? `to ${t.recipientLabel ?? "recipient"} — ${originCountry ?? "—"} to ${destinationCountry ?? "—"}`
    : failureReason ?? t.settlementError ?? "Settlement could not be completed.";
  doc.text(subtext, pageWidth / 2, y, { align: "center", maxWidth: contentWidth - 20 });

  y += 12;
  doc.setDrawColor(...lightLine);
  doc.line(marginX, y, pageWidth - marginX, y);

  // Detail table - ruled rows with zebra striping and a fixed label/value
  // column so everything lines up cleanly, instead of loose free-floating
  // text pairs.
  y += 2;
  const labelColWidth = 52;
  const valueColX = marginX + labelColWidth + 4;
  const valueColWidth = contentWidth - labelColWidth - 4;

  const rows: Array<[string, string]> = [
    ["Reference No.", reference],
    ["Status", t.settlementStatus],
    ["Date & Time", new Date().toLocaleString()],
    ["Sender Account No.", accountNumber ?? "—"],
    ["Recipient Account No.", recipientAccountNumber ?? "—"],
    ["Recipient Branch", t.recipientLabel ?? "—"],
    ["Authorized Under NOC", applicantName ?? "—"],
    ["From Country", originCountry ?? "—"],
    ["To Country", destinationCountry ?? "—"],
    isSuccess
      ? ["Blockchain Tx Hash", t.settlementTxHash ?? "—"]
      : ["Failure Reason", failureReason ?? t.settlementError ?? "Unknown error"],
  ];

  rows.forEach(([label, value], i) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const wrapped = doc.splitTextToSize(value, valueColWidth);
    const lineCount = Array.isArray(wrapped) ? wrapped.length : 1;
    const rowHeight = Math.max(9, lineCount * 5 + 3);

    if (i % 2 === 0) {
      doc.setFillColor(...zebra);
      doc.rect(marginX, y, contentWidth, rowHeight, "F");
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...gray);
    doc.text(label.toUpperCase(), marginX + 3, y + rowHeight / 2 - (lineCount - 1) * 2.5 + 1, {
      baseline: "middle",
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...navy);
    doc.text(wrapped, valueColX, y + rowHeight / 2 - (lineCount - 1) * 2.5 + 1, { baseline: "middle" });

    y += rowHeight;
    doc.setDrawColor(...lightLine);
    doc.setLineWidth(0.2);
    doc.line(marginX, y, marginX + contentWidth, y);
  });

  // Footer: QR verification code on the left, disclaimer on the right
  y += 10;
  const qrText = [
    "AI Block System — Transfer Receipt",
    `Reference: ${reference}`,
    `Status: ${t.settlementStatus}`,
    `Amount: ${t.amount.toLocaleString()} mUSDC`,
    `From: ${originCountry ?? "—"}  To: ${destinationCountry ?? "—"}`,
    isSuccess ? `Tx Hash: ${t.settlementTxHash ?? "—"}` : `Reason: ${failureReason ?? t.settlementError ?? "Unknown"}`,
  ].join("\n");
  const qrDataUrl = await QRCode.toDataURL(qrText, { margin: 1, width: 240 });
  const qrSize = 26;
  doc.addImage(qrDataUrl, "PNG", marginX, y, qrSize, qrSize);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...gray);
  doc.text("Scan to verify", marginX + qrSize / 2, y + qrSize + 4, { align: "center" });

  const disclaimerX = marginX + qrSize + 8;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...gray);
  doc.text(
    "This is a system-generated receipt and does not require a signature.",
    disclaimerX,
    y + 6,
    { maxWidth: contentWidth - qrSize - 8 }
  );
  doc.setFont("helvetica", "normal");
  doc.text(
    "AI Block System · NOC-Gated Cross-Border Transfer Network",
    disclaimerX,
    y + 13,
    { maxWidth: contentWidth - qrSize - 8 }
  );

  const cardBottom = y + qrSize + 12;

  // Card border framing the whole receipt
  doc.setDrawColor(...lightLine);
  doc.setLineWidth(0.6);
  doc.roundedRect(marginX - 8, cardTop, contentWidth + 16, cardBottom - cardTop, 3, 3, "S");

  doc.save(`receipt-${reference}.pdf`);
}
