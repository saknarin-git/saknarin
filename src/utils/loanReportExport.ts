import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { LoanReportPaperSettings } from '../types';

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export async function exportLoanReportToPdf(
  container: HTMLElement,
  fileName: string,
  paperSettings: LoanReportPaperSettings,
) {
  const pageElements = Array.from(container.querySelectorAll<HTMLElement>('.loan-report-print-page'));
  if (pageElements.length === 0) {
    throw new Error('ไม่พบหน้ารายงานสำหรับบันทึก PDF');
  }

  await waitForNextFrame();

  const pdf = new jsPDF({
    orientation: paperSettings.orientation,
    unit: 'mm',
    format: paperSettings.paper_size,
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginTop = Math.max(6, paperSettings.margin_top_mm);
  const marginRight = Math.max(6, paperSettings.margin_right_mm);
  const marginBottom = Math.max(6, paperSettings.margin_bottom_mm);
  const marginLeft = Math.max(6, paperSettings.margin_left_mm);
  const maxWidth = pageWidth - marginLeft - marginRight;
  const maxHeight = pageHeight - marginTop - marginBottom;

  for (let index = 0; index < pageElements.length; index += 1) {
    const pageElement = pageElements[index];
    const canvas = await html2canvas(pageElement, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });

    const imageData = canvas.toDataURL('image/png');
    const renderWidth = maxWidth;
    const renderHeight = Math.min(maxHeight, renderWidth * (canvas.height / canvas.width));

    if (index > 0) {
      pdf.addPage(paperSettings.paper_size, paperSettings.orientation);
    }

    pdf.addImage(imageData, 'PNG', marginLeft, marginTop, renderWidth, renderHeight, undefined, 'FAST');
  }

  pdf.save(fileName);
}