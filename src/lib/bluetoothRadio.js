/**
 * ArogyaSync — Bluetooth Low Energy (BLE) Mesh Bridge
 * ====================================================
 * Connects browsers to nearby devices via Web Bluetooth API (or emulated BLE GATT)
 * to transport LoRa micro-string packets locally without requiring internet access.
 */

class BluetoothBridge {
  constructor() {
    this.device = null;
    this.server = null;
    this.isEmulated = localStorage.getItem('ble_emulated_connected') === 'true';
    this.listeners = new Set();
  }

  isSupported() {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  isConnected() {
    return (this.device && this.device.gatt && this.device.gatt.connected) || this.isEmulated;
  }

  getStatus() {
    return {
      supported: this.isSupported(),
      connected: this.isConnected(),
      deviceName: this.device?.name || (this.isEmulated ? 'Virtual BLE Medical Node' : null)
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _notify() {
    const status = this.getStatus();
    this.listeners.forEach((fn) => {
      try {
        fn(status);
      } catch (e) {
        console.warn('[BLE] Listener error:', e);
      }
    });
  }

  async connectHardware() {
    if (!this.isSupported()) {
      throw new Error('Web Bluetooth is not supported in this browser. Please use Chrome/Edge.');
    }

    try {
      this.device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['generic_access', 'battery_service', 'health_thermometer', 'heart_rate']
      });

      this.device.addEventListener('gattserverdisconnected', () => {
        this.server = null;
        this._notify();
      });

      this.server = await this.device.gatt.connect();
      this.isEmulated = false;
      localStorage.removeItem('ble_emulated_connected');
      this._notify();
      return this.getStatus();
    } catch (err) {
      if (err.name === 'NotFoundError') {
        throw new Error('Device selection cancelled.');
      }
      throw err;
    }
  }

  toggle() {
    if (this.isConnected()) {
      this.disconnect();
    } else {
      this.isEmulated = true;
      localStorage.setItem('ble_emulated_connected', 'true');
      this._notify();
    }
    return this.getStatus();
  }

  toggleEmulated() {
    return this.toggle();
  }

  disconnect() {
    if (this.device && this.device.gatt && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.device = null;
    this.server = null;
    this.isEmulated = false;
    localStorage.removeItem('ble_emulated_connected');
    this._notify();
  }
}

export const bleBridge = new BluetoothBridge();
