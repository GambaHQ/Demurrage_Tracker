// Invoice screen - Generate and send invoices
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import {
  Card,
  Title,
  Text,
  Button,
  Chip,
  useTheme,
  Surface,
  Divider,
  ActivityIndicator,
  List,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppStore } from '../store/appStore';
import { generateWeeklyInvoice, getInvoicePreview } from '../services/invoice';
import { sendInvoiceEmail, shareInvoice } from '../services/email';
import { getInvoiceByWeek } from '../services/database';
import {
  formatMinutesToHHMM,
  formatDuration,
  formatDateTime,
  getWeekRangeDisplay,
} from '../utils/dateUtils';
import { formatLocation } from '../services/location';
import { Invoice, StopEvent } from '../types';

export default function InvoiceScreen() {
  const theme = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState<Invoice | null>(null);
  const [previewData, setPreviewData] = useState<{
    totalMinutes: number;
    totalHours: number;
    eventCount: number;
    events: StopEvent[];
    subtotal: number;
    gstAmount: number;
    totalAmount: number;
    estimatedAmount: number;
  } | null>(null);

  const { currentWeekDemurrage, settings, refreshAllData } = useAppStore();

  useEffect(() => {
    loadInvoiceData();
  }, [currentWeekDemurrage]);

  const loadInvoiceData = async () => {
    setIsLoading(true);
    try {
      // Load preview data
      const preview = await getInvoicePreview();
      setPreviewData(preview);

      // Check if invoice already exists
      if (currentWeekDemurrage?.invoiceGenerated) {
        const invoice = await getInvoiceByWeek(currentWeekDemurrage.id);
        setCurrentInvoice(invoice);
      }
    } catch (error) {
      console.error('Error loading invoice data:', error);
    }
    setIsLoading(false);
  };

  const handleGenerateInvoice = async () => {
    setIsGenerating(true);
    try {
      const invoice = await generateWeeklyInvoice();
      if (invoice) {
        setCurrentInvoice(invoice);
        await refreshAllData();
        Alert.alert('Success', 'Invoice generated successfully!');
      } else {
        Alert.alert('Error', 'Failed to generate invoice');
      }
    } catch (error) {
      console.error('Error generating invoice:', error);
      Alert.alert('Error', 'Failed to generate invoice');
    }
    setIsGenerating(false);
  };

  const handleSendInvoice = async () => {
    if (!currentInvoice || !currentWeekDemurrage) {
      Alert.alert('Error', 'No invoice to send');
      return;
    }

    if (!settings?.recipientEmail) {
      Alert.alert('Error', 'Please configure recipient email in Settings');
      return;
    }

    setIsSending(true);
    try {
      const result = await sendInvoiceEmail(
        currentInvoice,
        currentWeekDemurrage.weekStartDate
      );

      if (result.success) {
        await refreshAllData();
        Alert.alert('Success', 'Invoice sent successfully!');
      } else {
        Alert.alert('Error', result.error || 'Failed to send invoice');
      }
    } catch (error) {
      console.error('Error sending invoice:', error);
      Alert.alert('Error', 'Failed to send invoice');
    }
    setIsSending(false);
  };

  const handleShareInvoice = async () => {
    if (!currentInvoice) {
      Alert.alert('Error', 'No invoice to share');
      return;
    }

    try {
      const result = await shareInvoice(currentInvoice);
      if (!result.success) {
        Alert.alert('Error', result.error || 'Failed to share invoice');
      }
    } catch (error) {
      console.error('Error sharing invoice:', error);
      Alert.alert('Error', 'Failed to share invoice');
    }
  };

  const weekRange = currentWeekDemurrage
    ? getWeekRangeDisplay(currentWeekDemurrage.weekStartDate)
    : 'This Week';

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading invoice data...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Week Header */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.weekHeader}>
            <View>
              <Text style={styles.weekLabel}>Invoice Period</Text>
              <Title>{weekRange}</Title>
            </View>
            <Chip
              icon={currentWeekDemurrage?.invoiceSent ? 'check' : 'clock-outline'}
              mode="flat"
              style={
                currentWeekDemurrage?.invoiceSent
                  ? styles.sentChip
                  : currentWeekDemurrage?.invoiceGenerated
                  ? styles.generatedChip
                  : styles.pendingChip
              }
            >
              {currentWeekDemurrage?.invoiceSent
                ? 'Sent'
                : currentWeekDemurrage?.invoiceGenerated
                ? 'Generated'
                : 'Pending'}
            </Chip>
          </View>
        </Card.Content>
      </Card>

      {/* Summary Card */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Invoice Summary</Title>
          <View style={styles.summaryGrid}>
            <Surface style={styles.summaryItem} elevation={1}>
              <MaterialCommunityIcons name="clock-alert" size={28} color="#f44336" />
              <Text style={styles.summaryValue}>
                {formatMinutesToHHMM(previewData?.totalMinutes || 0)}
              </Text>
              <Text style={styles.summaryLabel}>Total Demurrage</Text>
            </Surface>

            <Surface style={styles.summaryItem} elevation={1}>
              <MaterialCommunityIcons name="counter" size={28} color={theme.colors.primary} />
              <Text style={styles.summaryValue}>{previewData?.eventCount || 0}</Text>
              <Text style={styles.summaryLabel}>Events</Text>
            </Surface>

            {settings?.hourlyRate ? (
              <Surface style={styles.summaryItem} elevation={1}>
                <MaterialCommunityIcons name="currency-usd" size={28} color="#4CAF50" />
                <Text style={styles.summaryValue}>
                  ${previewData?.totalAmount?.toFixed(2) || '0.00'}
                </Text>
                <Text style={styles.summaryLabel}>Total (Inc. GST)</Text>
              </Surface>
            ) : null}
          </View>

          {/* GST Breakdown */}
          {settings?.hourlyRate && previewData ? (
            <View style={styles.gstBreakdown}>
              <Divider style={styles.divider} />
              <View style={styles.gstRow}>
                <Text style={styles.gstLabel}>Subtotal:</Text>
                <Text style={styles.gstValue}>${previewData.subtotal?.toFixed(2) || '0.00'}</Text>
              </View>
              <View style={styles.gstRow}>
                <Text style={styles.gstLabel}>GST (10%):</Text>
                <Text style={styles.gstValue}>${previewData.gstAmount?.toFixed(2) || '0.00'}</Text>
              </View>
              <View style={[styles.gstRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Total (Inc. GST):</Text>
                <Text style={styles.totalValue}>${previewData.totalAmount?.toFixed(2) || '0.00'}</Text>
              </View>
            </View>
          ) : null}
        </Card.Content>
      </Card>

      {/* Demurrage Events List */}
      {previewData && previewData.events.length > 0 && (
        <Card style={styles.card}>
          <Card.Content>
            <Title>Demurrage Events</Title>
            <Divider style={styles.divider} />
            {previewData.events.map((event, index) => (
              <List.Item
                key={event.id}
                title={formatDateTime(event.startTime)}
                description={formatLocation(event.startLocation)}
                left={(props) => (
                  <View style={styles.eventNumber}>
                    <Text style={styles.eventNumberText}>{index + 1}</Text>
                  </View>
                )}
                right={() => (
                  <View style={styles.eventDuration}>
                    <Text style={styles.eventDurationText}>
                      {formatDuration(event.durationMinutes)}
                    </Text>
                  </View>
                )}
                style={styles.eventItem}
              />
            ))}
          </Card.Content>
        </Card>
      )}

      {/* Actions Card */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Actions</Title>

          {!currentWeekDemurrage?.invoiceGenerated ? (
            <Button
              mode="contained"
              onPress={handleGenerateInvoice}
              loading={isGenerating}
              disabled={isGenerating || (previewData?.eventCount || 0) === 0}
              style={styles.actionButton}
              icon="file-document-edit"
            >
              Generate Invoice
            </Button>
          ) : (
            <View style={styles.actionButtons}>
              <Button
                mode="contained"
                onPress={handleSendInvoice}
                loading={isSending}
                disabled={isSending || currentWeekDemurrage?.invoiceSent}
                style={styles.actionButton}
                icon="email-send"
              >
                {currentWeekDemurrage?.invoiceSent ? 'Invoice Sent' : 'Send via Email'}
              </Button>

              <Button
                mode="outlined"
                onPress={handleShareInvoice}
                style={styles.actionButton}
                icon="share-variant"
              >
                Share Invoice
              </Button>

              <Button
                mode="outlined"
                onPress={handleGenerateInvoice}
                loading={isGenerating}
                style={styles.actionButton}
                icon="refresh"
              >
                Regenerate Invoice
              </Button>
            </View>
          )}

          {!settings?.recipientEmail && (
            <View style={styles.warningBox}>
              <MaterialCommunityIcons name="alert" size={20} color="#FF9800" />
              <Text style={styles.warningText}>
                Configure recipient email in Settings to send invoices
              </Text>
            </View>
          )}
        </Card.Content>
      </Card>

      {/* Empty State */}
      {(!previewData || previewData.eventCount === 0) && (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="file-document-outline" size={64} color="#ccc" />
          <Text style={styles.emptyTitle}>No Demurrage Events</Text>
          <Text style={styles.emptySubtitle}>
            There are no demurrage events for this week yet
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#666',
  },
  card: {
    margin: 12,
    marginBottom: 0,
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weekLabel: {
    fontSize: 12,
    color: '#666',
    textTransform: 'uppercase',
  },
  sentChip: {
    backgroundColor: '#e8f5e9',
  },
  generatedChip: {
    backgroundColor: '#e3f2fd',
  },
  pendingChip: {
    backgroundColor: '#fff3e0',
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 12,
  },
  summaryItem: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 8,
  },
  summaryLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  divider: {
    marginVertical: 12,
  },
  eventItem: {
    paddingVertical: 4,
  },
  eventNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e3f2fd',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  eventNumberText: {
    fontWeight: 'bold',
    color: '#1976D2',
  },
  eventDuration: {
    justifyContent: 'center',
  },
  eventDurationText: {
    fontWeight: '600',
    color: '#f44336',
  },
  actionButtons: {
    gap: 12,
  },
  actionButton: {
    marginTop: 12,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3e0',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#e65100',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  gstBreakdown: {
    marginTop: 16,
    paddingTop: 16,
  },
  gstRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  gstLabel: {
    fontSize: 14,
    color: '#666',
  },
  gstValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    marginTop: 8,
    paddingTop: 12,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
});
