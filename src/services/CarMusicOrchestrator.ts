/**
 * CarMusicOrchestrator — Central coordinator.
 *
 * Connects Bluetooth detection events with Spotify playback control.
 * When the saved car Bluetooth device connects → starts playlist with shuffle.
 * When it disconnects → pauses playback.
 */

import type { EventSubscription } from 'expo-modules-core';
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

      EventLog.info(`[Config] Samochód: ${config.carDeviceName} (${config.carDeviceAddress})`);
      EventLog.info(`[Config] Playlista: ${config.playlistUri}`);

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
          EventLog.success(`[BT] ✓ To nasz samochód: ${device.deviceName}`);
          this.scheduleCarConnect();
        } else {
          EventLog.info(`[BT] To nie samochód (szukam: ${config.carDeviceAddress})`);
        }
      });

      const disconnSub = BluetoothDetector.onDisconnected(async (device) => {
        EventLog.info(`[BT] Rozłączono: ${device.deviceName} (${device.deviceAddress})`);

        if (this.isCarDevice(device.deviceAddress, config.carDeviceAddress)) {
          EventLog.info(`[BT] Samochód rozłączony: ${device.deviceName}`);
          this.lastDisconnectTime = Date.now();

          // Cancel pending connect if disconnect came quickly
          if (this.connectTimer) {
            EventLog.warning('[BT] Anulowano zaplanowane odtwarzanie (szybkie rozłączenie)');
            clearTimeout(this.connectTimer);
            this.connectTimer = null;
          }

          await this.onCarDisconnected();
        }
      });

      const carModeSub = BluetoothDetector.onCarModeEntered(async () => {
        EventLog.info('[BT] Wykryto tryb samochodowy (Android Auto)');
        this.scheduleCarConnect();
      });

      this.subscriptions = [connSub, disconnSub, carModeSub];
      this.isRunning = true;
      this.isPlaying = false; // Always reset on start
      await Storage.setServiceEnabled(true);

      EventLog.success('Usługa uruchomiona — oczekuję na połączenie z samochodem');

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
          EventLog.success(`[BT] Samochód już połączony: ${device.name}`);
          // Use debounced connect to avoid race conditions
          this.scheduleCarConnect();
          return;
        }
      }
      EventLog.info('[BT] Samochód nie jest aktualnie połączony');
    } catch (e) {
      EventLog.warning(`[BT] Nie udało się sprawdzić połączonych urządzeń: ${e}`);
    }
  }

  /**
   * Schedule car connect with debounce — waits CONNECT_DEBOUNCE_MS before
   * actually starting playback. If a disconnect arrives during this window,
   * it cancels the pending connect (prevents ghost/stale event race conditions).
   */
  private scheduleCarConnect(): void {
    // Cancel any existing pending connect
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
    }

    this.lastConnectTime = Date.now();
    EventLog.info(`[Debounce] Czekam ${CONNECT_DEBOUNCE_MS}ms przed uruchomieniem muzyki...`);

    this.connectTimer = setTimeout(async () => {
      this.connectTimer = null;

      // Verify device is still connected before playing
      try {
        const connectedDevices = BluetoothDetector.getConnectedDevices();
        const config = await Storage.getConfig();
        const carStillConnected = connectedDevices.some(
          (d) => this.isCarDevice(d.address, config.carDeviceAddress)
        );

        if (!carStillConnected) {
          EventLog.warning('[Debounce] Samochód już nie jest połączony — anuluję odtwarzanie');
          return;
        }

        EventLog.success('[Debounce] Samochód nadal połączony — uruchamiam muzykę');
      } catch (e) {
        EventLog.warning(`[Debounce] Nie mogę zweryfikować połączenia: ${e} — próbuję mimo to`);
      }

      await this.onCarConnected();
    }, CONNECT_DEBOUNCE_MS);
  }

  /**
   * Stop the orchestrator.
   */
  async stop(): Promise<void> {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }

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
   * Handle car Bluetooth connection — start music.
   */
  private async onCarConnected(): Promise<void> {
    if (this.isPlaying) {
      EventLog.info('[Play] Muzyka już gra — pomijam');
      return;
    }

    try {
      // Ensure we have a valid Spotify token
      EventLog.info('[Spotify] Sprawdzam token...');
      const hasToken = await SpotifyAuth.ensureValidToken();
      if (!hasToken) {
        EventLog.warning('[Spotify] Brak ważnego tokenu — próbuję uruchomić przez Intent');
      } else {
        EventLog.info('[Spotify] Token OK');
      }

      const config = await Storage.getConfig();
      const playlistUri = config.playlistUri!;

      EventLog.info(`[Play] Uruchamiam playlistę: ${playlistUri}`);

      // Try to play with shuffle
      const success = await SpotifyService.playPlaylistWithShuffle(playlistUri);

      if (success) {
        this.isPlaying = true;
        EventLog.success('🎵 Muzyka gra!');
      } else {
        EventLog.error('[Play] Nie udało się uruchomić playlisty');
      }
    } catch (error) {
      EventLog.error(`[Play] Błąd onCarConnected: ${error}`);
    }
  }

  /**
   * Handle car Bluetooth disconnection — pause music.
   */
  private async onCarDisconnected(): Promise<void> {
    EventLog.info(`[Disconnect] isPlaying=${this.isPlaying}`);

    if (!this.isPlaying) {
      EventLog.info('[Disconnect] Muzyka nie grała — nic nie robię');
      return;
    }

    try {
      await SpotifyService.pause();
      this.isPlaying = false;
      EventLog.info('[Disconnect] Muzyka zapauzowana po rozłączeniu z samochodem');
    } catch (error) {
      EventLog.error(`[Disconnect] Błąd: ${error}`);
    }
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
