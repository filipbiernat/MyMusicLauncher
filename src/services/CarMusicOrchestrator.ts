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

class CarMusicOrchestratorClass {
  private subscriptions: EventSubscription[] = [];
  private isRunning = false;
  private isPlaying = false;

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

      // Start listening for Bluetooth events
      BluetoothDetector.startListening();

      // Subscribe to Bluetooth connection events
      const connSub = BluetoothDetector.onConnected(async (device) => {
        EventLog.info(`Bluetooth: ${device.deviceName} (${device.deviceAddress})`);

        if (this.isCarDevice(device.deviceAddress, config.carDeviceAddress)) {
          EventLog.success(`Wykryto samochód: ${device.deviceName}`);
          await this.onCarConnected();
        }
      });

      const disconnSub = BluetoothDetector.onDisconnected(async (device) => {
        EventLog.info(`Rozłączono: ${device.deviceName}`);

        if (this.isCarDevice(device.deviceAddress, config.carDeviceAddress)) {
          EventLog.info(`Samochód rozłączony: ${device.deviceName}`);
          await this.onCarDisconnected();
        }
      });

      const carModeSub = BluetoothDetector.onCarModeEntered(async () => {
        EventLog.info('Wykryto tryb samochodowy (Android Auto)');
        await this.onCarConnected();
      });

      this.subscriptions = [connSub, disconnSub, carModeSub];
      this.isRunning = true;
      await Storage.setServiceEnabled(true);

      EventLog.success('Usługa uruchomiona — oczekuję na połączenie z samochodem');
      return true;
    } catch (error) {
      EventLog.error(`Błąd uruchamiania orchestratora: ${error}`);
      return false;
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
      EventLog.info('Muzyka już gra — pomijam');
      return;
    }

    try {
      // Ensure we have a valid Spotify token
      const hasToken = await SpotifyAuth.ensureValidToken();
      if (!hasToken) {
        EventLog.warning('Brak ważnego tokenu Spotify — próbuję uruchomić przez Intent');
      }

      const config = await Storage.getConfig();
      const playlistUri = config.playlistUri!;
      const shuffleEnabled = config.shuffleEnabled;

      // Try to play with shuffle
      const success = await SpotifyService.playPlaylistWithShuffle(playlistUri);

      if (success) {
        this.isPlaying = true;
        EventLog.success('🎵 Muzyka gra!');
      } else {
        EventLog.error('Nie udało się uruchomić playlisty');
      }
    } catch (error) {
      EventLog.error(`Błąd onCarConnected: ${error}`);
    }
  }

  /**
   * Handle car Bluetooth disconnection — pause music.
   */
  private async onCarDisconnected(): Promise<void> {
    if (!this.isPlaying) return;

    try {
      await SpotifyService.pause();
      this.isPlaying = false;
      EventLog.info('Muzyka zapauzowana po rozłączeniu z samochodem');
    } catch (error) {
      EventLog.error(`Błąd onCarDisconnected: ${error}`);
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
