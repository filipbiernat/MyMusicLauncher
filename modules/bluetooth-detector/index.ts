import { requireNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';

type BluetoothDevice = {
  deviceName: string;
  deviceAddress: string;
};

type PairedDevice = {
  name: string;
  address: string;
};

type BluetoothDetectorEvents = {
  onBluetoothConnected: (device: BluetoothDevice) => void;
  onBluetoothDisconnected: (device: BluetoothDevice) => void;
  onCarModeEntered: () => void;
  onCarModeExited: () => void;
};

type BluetoothDetectorModuleType = {
  startListening(): void;
  stopListening(): void;
  isListening(): boolean;
  getPairedDevices(): PairedDevice[];
  getConnectedDevices(): PairedDevice[];
  startForegroundService(): boolean;
  stopForegroundService(): void;
  isServiceRunning(): boolean;
  syncConfig(jsonStr: string): boolean;
  addListener<K extends keyof BluetoothDetectorEvents>(
    eventName: K,
    listener: BluetoothDetectorEvents[K]
  ): EventSubscription;
};

const BluetoothDetectorNative =
  requireNativeModule<BluetoothDetectorModuleType>('BluetoothDetector');

export const BluetoothDetector = {
  startListening(): void {
    try {
      BluetoothDetectorNative.startListening();
    } catch {}
  },

  stopListening(): void {
    try {
      BluetoothDetectorNative.stopListening();
    } catch {}
  },

  isListening(): boolean {
    try {
      return BluetoothDetectorNative.isListening();
    } catch {
      return false;
    }
  },

  getPairedDevices(): PairedDevice[] {
    try {
      return BluetoothDetectorNative.getPairedDevices();
    } catch {
      return [];
    }
  },

  getConnectedDevices(): PairedDevice[] {
    try {
      return BluetoothDetectorNative.getConnectedDevices();
    } catch {
      return [];
    }
  },

  startForegroundService(): boolean {
    try {
      return BluetoothDetectorNative.startForegroundService();
    } catch {
      return false;
    }
  },

  stopForegroundService(): void {
    try {
      BluetoothDetectorNative.stopForegroundService();
    } catch {}
  },

  isServiceRunning(): boolean {
    try {
      return BluetoothDetectorNative.isServiceRunning();
    } catch {
      return false;
    }
  },

  syncConfig(config: Record<string, any>): boolean {
    try {
      return BluetoothDetectorNative.syncConfig(JSON.stringify(config));
    } catch {
      return false;
    }
  },

  onConnected(callback: (device: BluetoothDevice) => void): EventSubscription {
    return BluetoothDetectorNative.addListener('onBluetoothConnected', callback);
  },

  onDisconnected(callback: (device: BluetoothDevice) => void): EventSubscription {
    return BluetoothDetectorNative.addListener('onBluetoothDisconnected', callback);
  },

  onCarModeEntered(callback: () => void): EventSubscription {
    return BluetoothDetectorNative.addListener('onCarModeEntered', callback);
  },

  onCarModeExited(callback: () => void): EventSubscription {
    return BluetoothDetectorNative.addListener('onCarModeExited', callback);
  },
};

export type { BluetoothDevice, PairedDevice, EventSubscription };
