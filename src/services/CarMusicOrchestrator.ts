/**
 * CarMusicOrchestrator — Central coordinator.
 *
 * Connects Bluetooth detection events with Spotify playback control.
 * When the saved car Bluetooth device connects → starts playlist with shuffle.
 * When it disconnects → pauses playback.
 */

import type { EventSubscription } from 'expo-modules-core';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { BluetoothDetector } from '../../modules/bluetooth-detector';
import { SpotifyService } from './SpotifyService';
import { SpotifyAuth } from './SpotifyAuth';
import { Storage } from '../config/storage';
import { EventLog } from './EventLog';

// Debounce time in ms — ignore connect/disconnect arriving within this window
const CONNECT_DEBOUNCE_MS = 3000;

class CarMusicOrchestratorClass {
  private subscriptions: EventSubscription[] = [];
  private isRunning = false;
  private isPlaying = false;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastConnectTime = 0;
  private lastDisconnectTime = 0;

  /**
   * Start the orchestrator — begin listening for car Bluetooth connection.
   */
  async start(): Promise<boolean> {
    if (this.isRunning) {
      EventLog.warning('Orchestrator już działa');
      return true;
    }

    try {
      const config = await Storage.getConfig();

      if (!config.carDeviceAddress) {
        EventLog.error('Nie ustawiono urządzenia Bluetooth samochodu!');
        return false;
      }

      if (!config.playlistUri) {
        EventLog.error('Nie ustawiono playlisty Spotify!');
        return false;
      }

      // Request notification permissions (required on Android 13+ for visible notifications)
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        EventLog.info(`[Powiadomienia] Uprawnienie POST_NOTIFICATIONS: ${status}`);
      } catch (permErr) {
        EventLog.warning(`[Powiadomienia] Błąd sprawdzania uprawnień: ${permErr}`);
      }

      EventLog.info(`[Config] Samochód: ${config.carDeviceName} (${config.carDeviceAddress})`);
      EventLog.info(`[Config] Playlista: ${config.playlistUri}`);

      // Sync complete configuration to native Android SharedPreferences
      try {
        const refreshToken = await SecureStore.getItemAsync('spotify_refresh_token');
        BluetoothDetector.syncConfig({
          carDeviceAddress: config.carDeviceAddress,
          carDeviceName: config.carDeviceName,
          playlistUri: config.playlistUri,
          spotifyToken: config.spotifyToken,
          spotifyRefreshToken: refreshToken,
          spotifyClientId: config.spotifyClientId,
          shuffleEnabled: config.shuffleEnabled,
          serviceEnabled: true,
        });
        EventLog.info('[Config] Konfiguracja zsynchronizowana z usługą natywną');
      } catch (syncErr) {
        EventLog.warning(`[Config] Błąd synchronizacji konfiguracji: ${syncErr}`);
      }

      // Start native Foreground Service (keeps BT detection alive in background)
      try {
        const serviceStarted = BluetoothDetector.startForegroundService();
        EventLog.info(`[Service] Foreground Service: ${serviceStarted ? 'URUCHOMIONY ✓' : 'BŁĄD ✗'}`);
      } catch (e) {
        EventLog.error(`[Service] Błąd uruchamiania Foreground Service: ${e}`);
      }

      // Start listening for car mode events
      BluetoothDetector.startListening();
      EventLog.info('[BT] Nasłuchiwanie zdarzeń uruchomione');

      // Subscribe to Bluetooth connection events
      const connSub = BluetoothDetector.onConnected(async (device) => {
        EventLog.info(`[BT] Połączono: ${device.deviceName} (${device.deviceAddress})`);

        if (this.isCarDevice(device.deviceAddress, config.carDeviceAddress)) {
          EventLog.success(`[BT] ✓ To nasz samochód: ${device.deviceName} (uruchamia usługa natywna)`);
        } else {
          EventLog.info(`[BT] To nie samochód (szukam: ${config.carDeviceAddress})`);
        }
      });

      const disconnSub = BluetoothDetector.onDisconnected(async (device) => {
        EventLog.info(`[BT] Rozłączono: ${device.deviceName} (${device.deviceAddress})`);

        if (this.isCarDevice(device.deviceAddress, config.carDeviceAddress)) {
          EventLog.info(`[BT] Samochód rozłączony: ${device.deviceName} (zatrzymuje usługa natywna)`);
          this.lastDisconnectTime = Date.now();
        }
      });

      const carModeSub = BluetoothDetector.onCarModeEntered(async () => {
        EventLog.info('[BT] Wykryto tryb samochodowy (Android Auto)');
      });

      this.subscriptions = [connSub, disconnSub, carModeSub];
      this.isRunning = true;
      this.isPlaying = false; // Always reset on start
      await Storage.setServiceEnabled(true);

      EventLog.success('Usługa uruchomiona — oczekuję na połączenie z samochodem (natywnie)');

      // Check if car is ALREADY connected (app started after BT was connected)
      this.checkAlreadyConnected(config.carDeviceAddress);

      return true;
    } catch (error) {
      EventLog.error(`Błąd uruchamiania orchestratora: ${error}`);
      return false;
    }
  }

  /**
   * Check if car is already connected when the service starts.
   */
  private async checkAlreadyConnected(carAddress: string): Promise<void> {
    try {
      const connectedDevices = BluetoothDetector.getConnectedDevices();
      EventLog.info(`[BT] Sprawdzam połączone urządzenia: ${connectedDevices.length} znalezionych`);
      
      for (const device of connectedDevices) {
        EventLog.info(`[BT] Połączone: ${device.name} (${device.address})`);
        if (this.isCarDevice(device.address, carAddress)) {
          EventLog.success(`[BT] Samochód już połączony: ${device.name} (obsługiwane natywnie)`);
          return;
        }
      }
      EventLog.info('[BT] Samochód nie jest aktualnie połączony');
    } catch (e) {
      EventLog.warning(`[BT] Nie udało się sprawdzić połączonych urządzeń: ${e}`);
    }
  }

  /**
   * Stop the orchestrator.
   */
  async stop(): Promise<void> {
    this.subscriptions.forEach((sub) => sub.remove());
    this.subscriptions = [];

    try {
      BluetoothDetector.stopListening();
    } catch (e) {
      // Module may not be available in dev
    }

    try {
      BluetoothDetector.stopForegroundService();
      EventLog.info('[Service] Foreground Service zatrzymany');
    } catch (e) {
      // Ignore
    }

    this.isRunning = false;
    this.isPlaying = false;
    await Storage.setServiceEnabled(false);
    EventLog.info('Usługa zatrzymana');
  }

  /**
   * Compare device addresses (case-insensitive).
   */
  private isCarDevice(deviceAddress: string, savedAddress: string | null): boolean {
    if (!savedAddress) return false;
    return deviceAddress.toUpperCase() === savedAddress.toUpperCase();
  }

  getStatus(): { isRunning: boolean; isPlaying: boolean } {
    return { isRunning: this.isRunning, isPlaying: this.isPlaying };
  }
}

export const CarMusicOrchestrator = new CarMusicOrchestratorClass();
