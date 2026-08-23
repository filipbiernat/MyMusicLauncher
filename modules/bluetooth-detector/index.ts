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
  addListener<K extends keyof BluetoothDetectorEvents>(
    eventName: K,
    listener: BluetoothDetectorEvents[K]
  ): EventSubscription;
};

const BluetoothDetectorNative =
  requireNativeModule<BluetoothDetectorModuleType>('BluetoothDetector');

export const BluetoothDetector = {
  startListening(): void {
    BluetoothDetectorNative.startListening();
  },

  stopListening(): void {
    BluetoothDetectorNative.stopListening();
  },

  isListening(): boolean {
    return BluetoothDetectorNative.isListening();
  },

  getPairedDevices(): PairedDevice[] {
    return BluetoothDetectorNative.getPairedDevices();
  },

  getConnectedDevices(): PairedDevice[] {
    return BluetoothDetectorNative.getConnectedDevices();
  },

  startForegroundService(): boolean {
    return BluetoothDetectorNative.startForegroundService();
  },

  stopForegroundService(): void {
    BluetoothDetectorNative.stopForegroundService();
  },

  isServiceRunning(): boolean {
    return BluetoothDetectorNative.isServiceRunning();
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
