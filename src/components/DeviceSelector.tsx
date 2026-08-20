import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  PermissionsAndroid,
  Platform,
} from 'react-native';

type PairedDevice = {
  name: string;
  address: string;
};

type Props = {
  selectedAddress: string | null;
  onSelect: (device: PairedDevice) => void;
};

export function DeviceSelector({ selectedAddress, onSelect }: Props) {
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const requestPermissions = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;

    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      ]);

      return (
        granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
          PermissionsAndroid.RESULTS.GRANTED
      );
    } catch {
      return false;
    }
  };

  const loadDevices = async () => {
    setLoading(true);
    try {
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        Alert.alert(
          'Uprawnienia',
          'Potrzebuję uprawnień Bluetooth, aby wyświetlić sparowane urządzenia.'
        );
        setLoading(false);
        return;
      }

      // Import dynamically to avoid crash if module not available
      const { BluetoothDetector } = require('../../modules/bluetooth-detector');
      const paired = BluetoothDetector.getPairedDevices();
      setDevices(paired);
    } catch (error) {
      console.error('Failed to load paired devices:', error);
      // Fallback: show manual input option
      setDevices([]);
    }
    setLoading(false);
  };

  const toggleExpanded = () => {
    if (!expanded) {
      loadDevices();
    }
    setExpanded(!expanded);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={toggleExpanded} activeOpacity={0.7}>
        <View style={styles.headerLeft}>
          <Text style={styles.icon}>📡</Text>
          <View>
            <Text style={styles.title}>Urządzenie samochodu</Text>
            <Text style={styles.subtitle}>
              {selectedAddress
                ? `Wybrano: ${selectedAddress}`
                : 'Dotknij aby wybrać'}
            </Text>
          </View>
        </View>
        <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.list}>
          {loading ? (
            <ActivityIndicator color="#1DB954" style={styles.loader} />
          ) : devices.length === 0 ? (
            <Text style={styles.emptyText}>
              Brak sparowanych urządzeń.{'\n'}
              Sparuj telefon z systemem audio samochodu w ustawieniach Bluetooth.
            </Text>
          ) : (
            <FlatList
              data={devices}
              keyExtractor={(item) => item.address}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.deviceItem,
                    item.address === selectedAddress && styles.deviceItemSelected,
                  ]}
                  onPress={() => {
                    onSelect(item);
                    setExpanded(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.deviceIcon}>
                    {item.address === selectedAddress ? '✅' : '🔹'}
                  </Text>
                  <View style={styles.deviceInfo}>
                    <Text style={styles.deviceName}>{item.name}</Text>
                    <Text style={styles.deviceAddress}>{item.address}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E1E2E',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  icon: {
    fontSize: 24,
    marginRight: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    color: '#A0A0B8',
    fontSize: 12,
    marginTop: 2,
  },
  chevron: {
    color: '#A0A0B8',
    fontSize: 12,
  },
  list: {
    borderTopWidth: 1,
    borderTopColor: '#2A2A3E',
    paddingVertical: 8,
  },
  loader: {
    paddingVertical: 20,
  },
  emptyText: {
    color: '#78909C',
    fontSize: 13,
    textAlign: 'center',
    padding: 20,
    lineHeight: 20,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  deviceItemSelected: {
    backgroundColor: '#1DB95420',
  },
  deviceIcon: {
    fontSize: 16,
    marginRight: 12,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  deviceAddress: {
    color: '#78909C',
    fontSize: 12,
    marginTop: 2,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
  },
});
