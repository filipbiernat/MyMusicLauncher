import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  RefreshControl,
  Linking,
} from 'react-native';
import { StatusCard } from '../components/StatusCard';
import { DeviceSelector } from '../components/DeviceSelector';
import { EventLogView } from '../components/EventLogView';
import { Storage, type AppConfig } from '../config/storage';
import { CarMusicOrchestrator } from '../services/CarMusicOrchestrator';
import { SpotifyAuth } from '../services/SpotifyAuth';
import { EventLog } from '../services/EventLog';
import type { PairedDevice } from '../../modules/bluetooth-detector';
import { BluetoothDetector } from '../../modules/bluetooth-detector';

type Props = {
  onNeedsSetup: () => void;
};

export function SettingsScreen({ onNeedsSetup }: Props) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [playlistInput, setPlaylistInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const loadConfig = useCallback(async () => {
    const cfg = await Storage.getConfig();
    setConfig(cfg);
    setPlaylistInput(cfg.playlistUri || '');
    const status = CarMusicOrchestrator.getStatus();
    setIsRunning(status.isRunning);
    setIsPlaying(status.isPlaying);

    // Diagnostic: check native service state
    try {
      const nativeServiceRunning = BluetoothDetector.isServiceRunning();
      EventLog.info(`[Diagnostyka] Otwarcie aplikacji — orchestrator: ${status.isRunning ? 'TAK' : 'NIE'}, natywna usługa: ${nativeServiceRunning ? 'TAK' : 'NIE'}, serviceEnabled: ${cfg.serviceEnabled ? 'TAK' : 'NIE'}`);
    } catch (e) {
      EventLog.warning(`[Diagnostyka] Nie mogę sprawdzić stanu usługi: ${e}`);
    }

    // Auto-resume service if it was enabled previously
    if (cfg.serviceEnabled && !status.isRunning && cfg.carDeviceAddress && cfg.playlistUri) {
      EventLog.info('[Auto-start] Wznawianie usługi...');
      try {
        const started = await CarMusicOrchestrator.start();
        setIsRunning(started);
        EventLog.info(`[Auto-start] Wynik: ${started ? 'SUKCES' : 'BŁĄD'}`);
      } catch (e) {
        EventLog.error(`[Auto-start] Błąd: ${e}`);
      }
    }
  }, []);

  useEffect(() => {
    loadConfig();
    const interval = setInterval(() => {
      const status = CarMusicOrchestrator.getStatus();
      setIsRunning(status.isRunning);
      setIsPlaying(status.isPlaying);
    }, 2000);
    return () => clearInterval(interval);
  }, [loadConfig]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadConfig();
    setRefreshing(false);
  };

  const handleToggleService = async () => {
    if (isRunning) {
      await CarMusicOrchestrator.stop();
      setIsRunning(false);
    } else {
      // Validate config
      if (!config?.carDeviceAddress) {
        Alert.alert('Brak konfiguracji', 'Wybierz urządzenie Bluetooth samochodu.');
        return;
      }
      if (!config?.playlistUri) {
        Alert.alert('Brak konfiguracji', 'Ustaw URI playlisty Spotify.');
        return;
      }

      const started = await CarMusicOrchestrator.start();
      setIsRunning(started);
    }
  };

  const handleDeviceSelect = async (device: PairedDevice) => {
    await Storage.setCarDevice(device.address, device.name);
    try {
      BluetoothDetector.syncConfig({
        carDeviceAddress: device.address,
        carDeviceName: device.name,
      });
    } catch (e) {}
    await loadConfig();
    EventLog.info(`Ustawiono samochód: ${device.name} (${device.address})`);
  };

  const handlePlaylistSave = async () => {
    let uri = playlistInput.trim();

    // Convert Spotify link to URI format
    if (uri.includes('open.spotify.com/playlist/')) {
      const match = uri.match(/playlist\/([a-zA-Z0-9]+)/);
      if (match) {
        uri = `spotify:playlist:${match[1]}`;
      }
    }

    if (!uri.startsWith('spotify:playlist:')) {
      Alert.alert(
        'Nieprawidłowy format',
        'Wklej link do playlisty Spotify lub URI w formacie spotify:playlist:XXXXX'
      );
      return;
    }

    await Storage.setPlaylist(uri, uri);
    try {
      BluetoothDetector.syncConfig({
        playlistUri: uri,
      });
    } catch (e) {}
    setPlaylistInput(uri);
    await loadConfig();
    EventLog.info(`Playlista ustawiona: ${uri}`);
  };

  const handleShuffleToggle = async (enabled: boolean) => {
    await Storage.setShuffleEnabled(enabled);
    try {
      BluetoothDetector.syncConfig({
        shuffleEnabled: enabled,
      });
    } catch (e) {}
    await loadConfig();
  };

  const handleSpotifyLogin = async () => {
    await SpotifyAuth.login(config?.spotifyClientId || undefined);
  };

  if (!config) return null;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1DB954" />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>MyMusicLauncher</Text>
          <Text style={styles.subtitle}>Automatyczny odtwarzacz Spotify</Text>
        </View>

        {/* Status */}
        <StatusCard
          isServiceRunning={isRunning}
          isPlaying={isPlaying}
          carDeviceName={config.carDeviceName}
          isBluetoothListening={isRunning}
        />

        {/* Start/Stop Button */}
        <TouchableOpacity
          style={[styles.mainButton, isRunning && styles.mainButtonActive]}
          onPress={handleToggleService}
          activeOpacity={0.8}
        >
          <Text style={styles.mainButtonEmoji}>{isRunning ? '⏹️' : '▶️'}</Text>
          <Text style={styles.mainButtonText}>
            {isRunning ? 'Zatrzymaj usługę' : 'Uruchom usługę'}
          </Text>
        </TouchableOpacity>

        {/* Car Bluetooth Device */}
        <DeviceSelector
          selectedAddress={config.carDeviceAddress}
          onSelect={handleDeviceSelect}
        />

        {/* Playlist */}
        <View style={styles.section}>
          <Text style={styles.sectionIcon}>🎵</Text>
          <Text style={styles.sectionTitle}>Playlista Spotify</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={playlistInput}
              onChangeText={setPlaylistInput}
              placeholder="spotify:playlist:XXXXX lub link"
              placeholderTextColor="#555"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.saveButton} onPress={handlePlaylistSave}>
              <Text style={styles.saveButtonText}>💾</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Shuffle */}
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleIcon}>🔀</Text>
            <Text style={styles.toggleLabel}>Odtwarzanie losowe</Text>
          </View>
          <Switch
            value={config.shuffleEnabled}
            onValueChange={handleShuffleToggle}
            trackColor={{ false: '#3A3A4E', true: '#1DB95480' }}
            thumbColor={config.shuffleEnabled ? '#1DB954' : '#78909C'}
          />
        </View>

        {/* Battery Optimization Settings */}
        <TouchableOpacity
          style={styles.batteryButton}
          onPress={() => Linking.openSettings()}
          activeOpacity={0.8}
        >
          <View style={styles.batteryIconContainer}>
            <Text style={styles.batteryIcon}>⚡</Text>
          </View>
          <View style={styles.batteryTextContainer}>
            <Text style={styles.batteryTitle}>Optymalizacja baterii</Text>
            <Text style={styles.batterySubtitle}>
              Kliknij, aby otworzyć ustawienia i wybrać: Bateria → Nieograniczone
            </Text>
          </View>
          <Text style={styles.chevron}>→</Text>
        </TouchableOpacity>

        {/* Overlay Permission Settings */}
        <TouchableOpacity
          style={styles.batteryButton}
          onPress={async () => {
            const hasPermission = await BluetoothDetector.requestOverlayPermission();
            if (hasPermission) {
              Alert.alert('Sukces', 'Uprawnienie jest już przyznane!');
            }
          }}
          activeOpacity={0.8}
        >
          <View style={styles.batteryIconContainer}>
            <Text style={styles.batteryIcon}>📱</Text>
          </View>
          <View style={styles.batteryTextContainer}>
            <Text style={styles.batteryTitle}>Wyświetlanie nad aplikacjami</Text>
            <Text style={styles.batterySubtitle}>
              Konieczne, by odpalać Spotify w tle. Zaznacz "Zawsze zezwalaj"
            </Text>
          </View>
          <Text style={styles.chevron}>→</Text>
        </TouchableOpacity>

        {/* Event Log */}
        <EventLogView />

        {/* Reset */}
        <TouchableOpacity
          style={styles.resetButton}
          onPress={() => {
            Alert.alert('Reset', 'Czy na pewno chcesz zresetować ustawienia?', [
              { text: 'Anuluj', style: 'cancel' },
              {
                text: 'Resetuj',
                style: 'destructive',
                onPress: async () => {
                  await CarMusicOrchestrator.stop();
                  await Storage.clearAll();
                  await loadConfig();
                  EventLog.clear();
                },
              },
            ]);
          }}
        >
          <Text style={styles.resetButtonText}>🗑️ Resetuj ustawienia</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121218',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#1DB954',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 4,
  },
  mainButton: {
    backgroundColor: '#1DB954',
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#1DB954',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  mainButtonActive: {
    backgroundColor: '#EF5350',
    shadowColor: '#EF5350',
  },
  mainButtonEmoji: {
    fontSize: 20,
    marginRight: 10,
  },
  mainButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  section: {
    backgroundColor: '#1E1E2E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#2A2A3E',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 14,
    marginRight: 8,
  },
  saveButton: {
    backgroundColor: '#1DB954',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  saveButtonText: {
    fontSize: 18,
  },
  toggleRow: {
    backgroundColor: '#1E1E2E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  toggleLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  batteryButton: {
    backgroundColor: '#1E1E2E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFA72640',
  },
  batteryIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFA72620',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  batteryIcon: {
    fontSize: 18,
  },
  batteryTextContainer: {
    flex: 1,
  },
  batteryTitle: {
    color: '#FFA726',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  batterySubtitle: {
    color: '#A0A0B8',
    fontSize: 12,
    lineHeight: 16,
  },
  chevron: {
    color: '#A0A0B8',
    fontSize: 16,
    marginLeft: 8,
  },
  spotifyButton: {
    backgroundColor: '#1E1E2E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1DB95440',
  },
  spotifyButtonText: {
    color: '#1DB954',
    fontSize: 15,
    fontWeight: '600',
  },
  resetButton: {
    alignItems: 'center',
    padding: 16,
    marginTop: 8,
  },
  resetButtonText: {
    color: '#78909C',
    fontSize: 14,
  },
});
