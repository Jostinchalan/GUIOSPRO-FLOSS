declare module 'jspdf' {
  export class jsPDF {
    constructor(options?: any);
    text(text: string | string[], x: number, y: number): void;
    setFontSize(size: number): void;
    save(filename: string): void;
    splitTextToSize(text: string, maxWidth: number): string[];
    lastAutoTable?: { finalY: number };
  }
}

declare module 'jspdf-autotable' {
  export default function autoTable(doc: any, options: any): void;
}
