import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type Props = {
  isServiceRunning: boolean;
  isPlaying: boolean;
  carDeviceName: string | null;
  isBluetoothListening: boolean;
};

export function StatusCard({ isServiceRunning, isPlaying, carDeviceName, isBluetoothListening }: Props) {
  const getStatusColor = () => {
    if (isPlaying) return '#1DB954'; // Spotify green
    if (isServiceRunning) return '#FFA726'; // Orange - waiting
    return '#78909C'; // Grey - inactive
  };

  const getStatusText = () => {
    if (isPlaying) return '🎵 Odtwarzam muzykę';
    if (isServiceRunning) return '🔍 Oczekuję na samochód...';
    return '⏸️ Usługa zatrzymana';
  };

  const getStatusEmoji = () => {
    if (isPlaying) return '🎶';
    if (isServiceRunning) return '🚗';
    return '💤';
  };

  return (
    <View style={[styles.card, { borderLeftColor: getStatusColor() }]}>
      <View style={styles.statusRow}>
        <Text style={styles.emoji}>{getStatusEmoji()}</Text>
        <View style={styles.statusInfo}>
          <Text style={styles.statusText}>{getStatusText()}</Text>
          <Text style={styles.statusSubtext}>
            {carDeviceName
              ? `Samochód: ${carDeviceName}`
              : 'Brak ustawionego urządzenia'}
          </Text>
        </View>
        <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
      </View>

      <View style={styles.indicators}>
        <View style={styles.indicator}>
          <View
            style={[
              styles.indicatorDot,
              { backgroundColor: isBluetoothListening ? '#1DB954' : '#78909C' },
            ]}
          />
          <Text style={styles.indicatorText}>Bluetooth</Text>
        </View>
        <View style={styles.indicator}>
          <View
            style={[
              styles.indicatorDot,
              { backgroundColor: isServiceRunning ? '#1DB954' : '#78909C' },
            ]}
          />
          <Text style={styles.indicatorText}>Usługa</Text>
        </View>
        <View style={styles.indicator}>
          <View
            style={[
              styles.indicatorDot,
              { backgroundColor: isPlaying ? '#1DB954' : '#78909C' },
            ]}
          />
          <Text style={styles.indicatorText}>Spotify</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1E1E2E',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  emoji: {
    fontSize: 36,
    marginRight: 14,
  },
  statusInfo: {
    flex: 1,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  statusSubtext: {
    color: '#A0A0B8',
    fontSize: 13,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    shadowColor: '#1DB954',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 4,
  },
  indicators: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2A2A3E',
  },
  indicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  indicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  indicatorText: {
    color: '#A0A0B8',
    fontSize: 12,
  },
});
