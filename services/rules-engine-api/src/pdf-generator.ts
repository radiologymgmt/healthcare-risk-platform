import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildFallbackPdf(title: string, lines: string[]): Buffer {
  const safeLines = [title, ...lines].map((l) =>
    l
      .replace(/[^\x20-\x7E]/g, " ")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)")
      .slice(0, 95),
  );
  const ops = ["BT", "/F1 11 Tf", "45 750 Td", "15 TL"];
  safeLines.slice(0, 44).forEach((line, i) => {
    ops.push(i === 0 ? `(${line}) Tj` : `T* (${line}) Tj`);
  });
  ops.push("ET");
  const stream = Buffer.from(ops.join("\n"), "latin1");
  const objects = [
    Buffer.from("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n", "latin1"),
    Buffer.from("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n", "latin1"),
    Buffer.from(
      "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
      "latin1",
    ),
    Buffer.concat([
      Buffer.from(`4 0 obj << /Length ${stream.length} >> stream\n`, "latin1"),
      stream,
      Buffer.from("\nendstream endobj\n", "latin1"),
    ]),
    Buffer.from("5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n", "latin1"),
  ];

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
  let offset = chunks[0]!.length;
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(offset);
    chunks.push(obj);
    offset += obj.length;
  }
  const xrefStart = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(chunks);
}

/**
 * Renders branded clinical HTML into a real PDF binary using headless Chromium
 * (`/usr/bin/google-chrome --headless=new --print-to-pdf`), with a deterministic
 * PDF 1.4 fallback when Chromium is not available.
 */
export async function renderHtmlToPdf(
  html: string,
  fallbackTitle: string,
  fallbackLines: string[],
): Promise<Buffer> {
  const chromeBinary =
    process.env.CHROME_BIN ??
    ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((p) =>
      fs.existsSync(p),
    );

  if (!chromeBinary) {
    return buildFallbackPdf(fallbackTitle, fallbackLines);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hrp-pdf-"));
  const htmlFile = path.join(tmpDir, "report.html");
  const pdfFile = path.join(tmpDir, "report.pdf");

  try {
    fs.writeFileSync(htmlFile, html, "utf8");
    await execFileAsync(
      chromeBinary,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--print-to-pdf-no-header",
        `--print-to-pdf=${pdfFile}`,
        `file://${htmlFile}`,
      ],
      { timeout: 15000 },
    );

    if (fs.existsSync(pdfFile)) {
      const pdfBytes = fs.readFileSync(pdfFile);
      if (pdfBytes.length > 100 && pdfBytes.subarray(0, 4).toString("ascii") === "%PDF") {
        return pdfBytes;
      }
    }
    return buildFallbackPdf(fallbackTitle, fallbackLines);
  } catch {
    return buildFallbackPdf(fallbackTitle, fallbackLines);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export function wrapBrandedClinicalHtml(title: string, subtitle: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: letter; margin: 0.6in; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; line-height: 1.45; font-size: 11px; margin: 0; }
    .header { border-bottom: 2px solid #0d7377; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-end; }
    .brand { font-size: 16px; font-weight: 700; color: #0d7377; letter-spacing: -0.01em; }
    .subtitle { font-size: 11px; color: #475569; margin-top: 2px; }
    .meta { text-align: right; font-size: 10px; color: #64748b; }
    h2 { font-size: 13px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin: 16px 0 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f8fafc; font-weight: 600; font-size: 10px; text-transform: uppercase; color: #475569; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 600; font-family: monospace; }
    .acute { background: #ffe4e6; color: #9f1239; }
    .high { background: #fef3c7; color: #92400e; }
    .moderate { background: #e0f2fe; color: #075985; }
    .routine { background: #f1f5f9; color: #334155; }
    .card { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; margin-bottom: 10px; background: #ffffff; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
    .kpi { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; background: #f8fafc; }
    .kpi-val { font-size: 18px; font-weight: 700; color: #0d7377; }
    .kpi-label { font-size: 9px; text-transform: uppercase; color: #64748b; }
    .footer { margin-top: 22px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #64748b; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">Enterprise Healthcare Risk Assessment Platform</div>
      <div class="subtitle">${escapeHtml(title)} &mdash; ${escapeHtml(subtitle)}</div>
    </div>
    <div class="meta">
      Generated: ${escapeHtml(new Date().toISOString().slice(0, 19).replace("T", " "))} UTC<br/>
      HIPAA-Protected Clinical Document
    </div>
  </div>
  ${bodyHtml}
  <div class="footer">
    <span>Confidential &mdash; Clinical Decision Support &amp; Prior-Authorization Documentation</span>
    <span>Generated via Headless PDF Engine (Component 8)</span>
  </div>
</body>
</html>`;
}
