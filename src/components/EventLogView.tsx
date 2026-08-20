import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { EventLog as EventLogService, type LogEntry } from '../services/EventLog';

export function EventLogView() {
  const [entries, setEntries] = useState<LogEntry[]>(EventLogService.getEntries());

  useEffect(() => {
    const unsubscribe = EventLogService.subscribe(setEntries);
    return unsubscribe;
  }, []);

  const getTypeColor = (type: LogEntry['type']): string => {
    switch (type) {
      case 'success':
        return '#1DB954';
      case 'error':
        return '#EF5350';
      case 'warning':
        return '#FFA726';
      case 'info':
      default:
        return '#64B5F6';
    }
  };

  const getTypeIcon = (type: LogEntry['type']): string => {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✗';
      case 'warning':
        return '⚠';
      case 'info':
      default:
        return '●';
    }
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('pl-PL', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  if (entries.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.header}>📋 Dziennik zdarzeń</Text>
        <Text style={styles.emptyText}>Brak zdarzeń</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>📋 Dziennik zdarzeń</Text>
      <FlatList
        data={entries}
        keyExtractor={(_, index) => String(index)}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={styles.entry}>
            <Text style={[styles.typeIcon, { color: getTypeColor(item.type) }]}>
              {getTypeIcon(item.type)}
            </Text>
            <Text style={styles.time}>{formatTime(item.timestamp)}</Text>
            <Text style={styles.message} numberOfLines={2}>
              {item.message}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E1E2E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  emptyText: {
    color: '#78909C',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 8,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A3E',
  },
  typeIcon: {
    fontSize: 12,
    marginRight: 8,
    marginTop: 2,
    fontWeight: '700',
    width: 14,
    textAlign: 'center',
  },
  time: {
    color: '#78909C',
    fontSize: 11,
    marginRight: 8,
    fontFamily: 'monospace',
    minWidth: 65,
    marginTop: 1,
  },
  message: {
    color: '#D0D0E0',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
});
