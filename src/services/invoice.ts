// Invoice generation service
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Paths, Directory, File } from 'expo-file-system';
import { Invoice, StopEvent, WeeklyDemurrage, AppSettings } from '../types';
import {
  getDemurrageEventsByWeek,
  getOrCreateWeeklyDemurrage,
  getSettings,
  saveInvoice,
  markInvoiceGenerated,
} from './database';
import { generateSecureId } from '../utils/encryption';
import {
  getCurrentTimestamp,
  formatDateTime,
  formatDuration,
  formatDate,
  getWeekRangeDisplay,
  formatMinutesToHHMM,
} from '../utils/dateUtils';
import { formatLocation } from './location';

/**
 * Generate HTML content for the invoice
 */
function generateInvoiceHTML(
  invoice: Invoice,
  settings: AppSettings,
  weeklyData: WeeklyDemurrage
): string {
  const totalHours = Math.floor(invoice.totalMinutes / 60);
  const totalMins = invoice.totalMinutes % 60;
  const weekRange = getWeekRangeDisplay(weeklyData.weekStartDate);
  const rate = settings.hourlyRate || 0;
  const subtotal = rate > 0 ? (invoice.totalMinutes / 60) * rate : 0;
  const gstAmount = subtotal * 0.10; // 10% GST
  const totalAmount = subtotal + gstAmount;

  const eventsHTML = invoice.events
    .map(
      (event, index) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">${index + 1}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">${formatDateTime(event.startTime)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">${event.endTime ? formatDateTime(event.endTime) : 'N/A'}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">${formatDuration(event.durationMinutes)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">${formatLocation(event.startLocation)}</td>
      </tr>
    `
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Demurrage Invoice - ${weekRange}</title>
  <style>
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      margin: 0;
      padding: 40px;
      background: #f5f5f5;
      color: #333;
    }
    .invoice-container {
      max-width: 800px;
      margin: 0 auto;
      background: #fff;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid #2196F3;
    }
    .company-info h1 {
      color: #2196F3;
      margin: 0 0 10px 0;
      font-size: 28px;
    }
    .invoice-info {
      text-align: right;
    }
    .invoice-info h2 {
      color: #2196F3;
      margin: 0 0 10px 0;
    }
    .summary-box {
      background: #e3f2fd;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
    }
    .summary-item {
      text-align: center;
    }
    .summary-item .label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    .summary-item .value {
      font-size: 24px;
      font-weight: bold;
      color: #1976D2;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    th {
      background: #2196F3;
      color: white;
      padding: 12px;
      text-align: left;
      font-size: 12px;
      text-transform: uppercase;
    }
    .total-section {
      background: #f5f5f5;
      padding: 20px;
      border-radius: 8px;
      text-align: right;
    }
    .total-row {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 10px;
    }
    .total-label {
      font-weight: bold;
      margin-right: 20px;
      min-width: 150px;
    }
    .total-value {
      font-size: 18px;
      font-weight: bold;
      color: #2196F3;
      min-width: 100px;
      text-align: right;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #eee;
      text-align: center;
      color: #999;
      font-size: 12px;
    }
    @media print {
      body { padding: 0; background: white; }
      .invoice-container { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <div class="header">
      <div class="company-info">
        <h1>${settings.companyName || 'Demurrage Tracking'}</h1>
        <p>${settings.companyAddress || ''}</p>
      </div>
      <div class="invoice-info">
        <h2>INVOICE</h2>
        <p><strong>Invoice #:</strong> ${invoice.id.substring(0, 8).toUpperCase()}</p>
        <p><strong>Date:</strong> ${formatDate(invoice.generatedAt)}</p>
        <p><strong>Period:</strong> ${weekRange}</p>
      </div>
    </div>

    <div class="summary-box">
      <div class="summary-grid">
        <div class="summary-item">
          <div class="label">Total Demurrage Events</div>
          <div class="value">${invoice.events.length}</div>
        </div>
        <div class="summary-item">
          <div class="label">Total Demurrage Time</div>
          <div class="value">${formatMinutesToHHMM(invoice.totalMinutes)}</div>
        </div>
        <div class="summary-item">
          <div class="label">Week Period</div>
          <div class="value">${weekRange.split(' - ')[0]}</div>
        </div>
      </div>
    </div>

    <h3>Demurrage Events</h3>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Start Time</th>
          <th>End Time</th>
          <th>Duration</th>
          <th>Location</th>
        </tr>
      </thead>
      <tbody>
        ${eventsHTML || '<tr><td colspan="5" style="padding: 20px; text-align: center;">No demurrage events this week</td></tr>'}
      </tbody>
    </table>

    <div class="total-section">
      <div class="total-row">
        <span class="total-label">Total Demurrage Time:</span>
        <span class="total-value">${totalHours}h ${totalMins}m</span>
      </div>
      ${rate > 0 ? `
      <div class="total-row">
        <span class="total-label">Rate per Hour:</span>
        <span class="total-value">$${rate.toFixed(2)}</span>
      </div>
      <div class="total-row">
        <span class="total-label">Subtotal:</span>
        <span class="total-value">$${subtotal.toFixed(2)}</span>
      </div>
      <div class="total-row">
        <span class="total-label">GST (10%):</span>
        <span class="total-value">$${gstAmount.toFixed(2)}</span>
      </div>
      <div class="total-row" style="font-size: 20px; border-top: 2px solid #2196F3; padding-top: 10px; margin-top: 10px;">
        <span class="total-label">TOTAL AMOUNT (Inc. GST):</span>
        <span class="total-value">$${totalAmount.toFixed(2)}</span>
      </div>
      ` : ''}
    </div>

    <div class="footer">
      <p>This invoice was automatically generated by Demurrage Tracker</p>
      <p>Generated on ${formatDateTime(invoice.generatedAt)}</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Generate invoice for a specific week
 */
export async function generateWeeklyInvoice(weekStartDate?: string): Promise<Invoice | null> {
  try {
    const weeklyData = await getOrCreateWeeklyDemurrage(weekStartDate);
    const settings = await getSettings();
    
    if (!settings) {
      console.error('Settings not found');
      return null;
    }
    
    // Get all demurrage events for the week
    const events = await getDemurrageEventsByWeek(weeklyData.weekStartDate);
    
    // Calculate totals
    const totalMinutes = events.reduce((sum, e) => sum + e.durationMinutes, 0);
    const totalHours = Math.round((totalMinutes / 60) * 100) / 100;
    
    // Create invoice object
    const invoice: Invoice = {
      id: generateSecureId(),
      weeklyDemurrageId: weeklyData.id,
      generatedAt: getCurrentTimestamp(),
      sentAt: null,
      recipientEmail: settings.recipientEmail,
      totalHours,
      totalMinutes,
      pdfPath: '',
      events,
    };
    
    // Generate HTML
    const html = generateInvoiceHTML(invoice, settings, weeklyData);
    
    // Generate PDF from HTML
    const pdfFileName = `invoice_${weeklyData.weekStartDate}_${invoice.id.substring(0, 8)}.pdf`;
    
    try {
      // Create PDF using expo-print
      const { uri: pdfUri } = await Print.printToFileAsync({
        html,
        base64: false,
      });
      
      // Move PDF to permanent location in invoices directory
      const invoicesDir = new Directory(Paths.document, 'invoices');
      if (!invoicesDir.exists) {
        invoicesDir.create();
      }
      
      // Copy PDF to permanent location
      const pdfFile = new File(invoicesDir, pdfFileName);
      const sourceFile = new File(pdfUri);
      sourceFile.copy(pdfFile);
      
      invoice.pdfPath = pdfFile.uri;
      console.log('PDF generated at:', pdfFile.uri);
    } catch (pdfError) {
      console.error('Error generating PDF:', pdfError);
      // Fall back to HTML file if PDF fails
      const htmlFileName = `invoice_${weeklyData.weekStartDate}_${invoice.id.substring(0, 8)}.html`;
      const invoicesDir = new Directory(Paths.document, 'invoices');
      if (!invoicesDir.exists) {
        invoicesDir.create();
      }
      const htmlFile = new File(invoicesDir, htmlFileName);
      htmlFile.write(html);
      invoice.pdfPath = htmlFile.uri;
    }
    
    // Save invoice to database
    await saveInvoice(invoice);
    await markInvoiceGenerated(weeklyData.weekStartDate, invoice.pdfPath);
    
    console.log('Invoice generated:', invoice.id, 'Path:', invoice.pdfPath);
    return invoice;
  } catch (error) {
    console.error('Error generating invoice:', error);
    return null;
  }
}

/**
 * Get invoice file path for a week
 */
export async function getInvoicePath(weekStartDate: string): Promise<string | null> {
  const weeklyData = await getOrCreateWeeklyDemurrage(weekStartDate);
  return weeklyData.invoicePath || null;
}

/**
 * Check if invoice exists for a week
 */
export async function hasInvoice(weekStartDate: string): Promise<boolean> {
  const weeklyData = await getOrCreateWeeklyDemurrage(weekStartDate);
  return weeklyData.invoiceGenerated;
}

/**
 * Generate invoice preview data
 */
export async function getInvoicePreview(weekStartDate?: string): Promise<{
  totalMinutes: number;
  totalHours: number;
  eventCount: number;
  events: StopEvent[];
  subtotal: number;
  gstAmount: number;
  totalAmount: number;
  estimatedAmount: number; // Keep for backward compatibility
} | null> {
  try {
    const weeklyData = await getOrCreateWeeklyDemurrage(weekStartDate);
    const settings = await getSettings();
    const events = await getDemurrageEventsByWeek(weeklyData.weekStartDate);
    
    const totalMinutes = events.reduce((sum, e) => sum + e.durationMinutes, 0);
    const totalHours = Math.round((totalMinutes / 60) * 100) / 100;
    const rate = settings?.hourlyRate || 0;
    
    const subtotal = totalHours * rate;
    const gstAmount = subtotal * 0.10; // 10% GST
    const totalAmount = subtotal + gstAmount;
    
    return {
      totalMinutes,
      totalHours,
      eventCount: events.length,
      events,
      subtotal,
      gstAmount,
      totalAmount,
      estimatedAmount: totalAmount, // Now includes GST
    };
  } catch (error) {
    console.error('Error getting invoice preview:', error);
    return null;
  }
}

/**
 * Share invoice PDF via device share sheet
 */
export async function shareInvoicePDF(invoicePath: string): Promise<boolean> {
  try {
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      console.error('Sharing is not available on this device');
      return false;
    }
    
    await Sharing.shareAsync(invoicePath, {
      mimeType: 'application/pdf',
      dialogTitle: 'Share Invoice',
    });
    
    return true;
  } catch (error) {
    console.error('Error sharing invoice:', error);
    return false;
  }
}

/**
 * Get HTML content for invoice (for email body)
 */
export async function getInvoiceHTML(weekStartDate?: string): Promise<string | null> {
  try {
    const weeklyData = await getOrCreateWeeklyDemurrage(weekStartDate);
    const settings = await getSettings();
    if (!settings) return null;
    
    const events = await getDemurrageEventsByWeek(weeklyData.weekStartDate);
    const totalMinutes = events.reduce((sum, e) => sum + e.durationMinutes, 0);
    const totalHours = Math.round((totalMinutes / 60) * 100) / 100;
    
    const invoice: Invoice = {
      id: 'preview',
      weeklyDemurrageId: weeklyData.weekStartDate,
      generatedAt: getCurrentTimestamp(),
      sentAt: null,
      recipientEmail: settings.recipientEmail,
      totalHours,
      totalMinutes,
      pdfPath: '',
      events,
    };
    
    return generateInvoiceHTML(invoice, settings, weeklyData);
  } catch (error) {
    console.error('Error getting invoice HTML:', error);
    return null;
  }
}
