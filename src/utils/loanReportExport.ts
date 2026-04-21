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
  const margin = Math.max(6, paperSettings.margin_mm);
  const maxWidth = pageWidth - (margin * 2);
  const maxHeight = pageHeight - (margin * 2);

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

    pdf.addImage(imageData, 'PNG', margin, margin, renderWidth, renderHeight, undefined, 'FAST');
  }

  pdf.save(fileName);
}