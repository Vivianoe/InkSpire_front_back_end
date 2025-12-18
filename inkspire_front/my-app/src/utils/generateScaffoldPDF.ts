import { jsPDF } from 'jspdf';

interface Scaffold {
  id: string | number;
  scaffold_id?: string;
  fragment: string;
  text: string | string[];
  title?: string;
  number?: number;
}

interface PDFOptions {
  sessionName?: string;
  courseName?: string;
  date?: string;
}

/**
 * Generate a PDF document containing all accepted scaffolds with their fragments
 */
export async function generateScaffoldPDF(
  scaffolds: Scaffold[],
  options: PDFOptions = {}
): Promise<void> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;
  let yPosition = margin;

  // Helper function to add a new page if needed
  const checkPageBreak = (requiredSpace: number) => {
    if (yPosition + requiredSpace > pageHeight - margin) {
      doc.addPage();
      yPosition = margin;
      return true;
    }
    return false;
  };

  // Helper function to add text with word wrapping
  const addWrappedText = (
    text: string,
    fontSize: number,
    fontStyle: 'normal' | 'bold' | 'italic' = 'normal',
    lineHeight: number = 7,
    color: [number, number, number] = [0, 0, 0]
  ): number => {
    if (!text) return 0;
    
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', fontStyle);
    doc.setTextColor(color[0], color[1], color[2]);
    
    const lines = doc.splitTextToSize(text, contentWidth);
    lines.forEach((line: string) => {
      if (line) {
        checkPageBreak(lineHeight);
        doc.text(line, margin, yPosition);
        yPosition += lineHeight;
      }
    });
    
    return lines.length * lineHeight;
  };

  // Cover page / Header
  if (options.sessionName || options.courseName) {
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    
    if (options.courseName) {
      checkPageBreak(15);
      doc.text(options.courseName, margin, yPosition);
      yPosition += 15;
    }
    
    if (options.sessionName) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'normal');
      checkPageBreak(10);
      const sessionText = `Session: ${options.sessionName}`;
      doc.text(sessionText, margin, yPosition);
      yPosition += 10;
    }
    
    if (options.date) {
      doc.setFontSize(10);
      checkPageBreak(8);
      const dateText = `Generated: ${options.date}`;
      doc.text(dateText, margin, yPosition);
      yPosition += 8;
    }
    
    yPosition += 15; // Extra spacing
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    checkPageBreak(12);
    doc.text('Reading Scaffolds', margin, yPosition);
    yPosition += 20;
  }

  // Add each scaffold
  scaffolds.forEach((scaffold, index) => {
    // Scaffold number and title
    const scaffoldTitle = scaffold.title || `Scaffold ${index + 1}`;
    addWrappedText(
      `${scaffold.number || index + 1}. ${scaffoldTitle}`,
      14,
      'bold',
      10,
      [0, 0, 0]
    );
    yPosition += 5;

    // Original fragment (quoted text)
    addWrappedText('Original Text:', 10, 'bold', 7, [50, 50, 50]);
    yPosition += 3;
    
    const fragmentText = scaffold.fragment || '';
    addWrappedText(
      fragmentText,
      10,
      'italic',
      6,
      [60, 60, 60]
    );
    yPosition += 8;

    // Scaffold text
    addWrappedText('Scaffold Question:', 10, 'bold', 7, [50, 50, 50]);
    yPosition += 3;
    
    const scaffoldText = Array.isArray(scaffold.text)
      ? scaffold.text.join('\n\n')
      : scaffold.text || '';
    
    addWrappedText(
      scaffoldText,
      11,
      'normal',
      7,
      [0, 0, 0]
    );
    
    yPosition += 15; // Spacing between scaffolds
  });

  // Footer on last page
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
  }

  // Generate filename
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = options.sessionName
    ? `scaffolds-${options.sessionName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${timestamp}.pdf`
    : `scaffolds-${timestamp}.pdf`;

  // Save the PDF
  doc.save(filename);
}

