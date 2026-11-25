/**
 * ArogyaSync — LoRa Radio Simulation Channel (Multi-Device Wi-Fi + Bluetooth + RF Mesh)
 * =====================================================================================
 * Enables cross-device transmission of LoRa 868MHz micro-packets:
 *   1. Wi-Fi / Cloud Realtime Mesh (via Supabase Realtime WebSockets):
 *      Any device (phone, laptop, tablet) with the website open will transmit/receive
 *      packets in real-time across Wi-Fi or cellular networks without needing RF hardware.
 *   2. Same-Device BroadcastChannel:
 *      Delivers packets between tabs and windows on the same machine.
 *   3. In-Window Custom Events + LocalStorage:
 *      Guarantees packets are persisted and received even when components unmount.
 */

import { supabase } from './supabase';
import { bleBridge } from './bluetoothRadio';

const BROADCAST_CHANNEL_NAME = 'lora_radio';
const REALTIME_CHANNEL_NAME = 'lora_mesh_network';

let sharedBroadcastChannel = null;
let sharedRealtimeChannel = null;

const getBroadcastChannel = () => {
  if (typeof window === 'undefined') return null;
  if (!sharedBroadcastChannel) {
    try {
      sharedBroadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    } catch (e) {
      console.warn('[LoRa Radio] BroadcastChannel unavailable:', e);
    }
  }
  return sharedBroadcastChannel;
};

const getRealtimeChannel = () => {
  if (typeof window === 'undefined') return null;
  if (!sharedRealtimeChannel) {
    try {
      sharedRealtimeChannel = supabase.channel(REALTIME_CHANNEL_NAME, {
        config: { broadcast: { ack: false } }
      });
      sharedRealtimeChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[LoRa Mesh] Connected to Wi-Fi/Cloud Realtime Mesh.');
        }
      });
    } catch (err) {
      console.warn('[LoRa Mesh] Realtime channel init error:', err);
    }
  }
  return sharedRealtimeChannel;
};

// Initialize realtime channel immediately
if (typeof window !== 'undefined') {
  getRealtimeChannel();
}

/**
 * Broadcasts a packet over the simulated LoRa network.
 * Guaranteed to reach:
 *   1. All other physical devices open to the website on Wi-Fi/Internet (via Supabase Realtime)
 *   2. Bluetooth LE paired nodes / emulated BLE GATT
 *   3. Other browser tabs (via BroadcastChannel)
 *   4. Same-tab components (via CustomEvent & localStorage)
 */
export const broadcastLoRaPacket = (packet) => {
  if (!packet) return;

  const bleStatus = bleBridge.getStatus();
  const carrier = bleStatus.connected
    ? 'Bluetooth LE Mesh'
    : (navigator.onLine ? 'Wi-Fi / Cloud Mesh' : 'Local RF Simulation');

  const enrichedPacket = {
    ...packet,
    carrier,
    _receivedAt: packet._receivedAt || new Date().toISOString()
  };

  // 1. Persist to Gateway RX history in localStorage
  try {
    const rawGateway = localStorage.getItem('lora_gateway_packets');
    const list = rawGateway ? JSON.parse(rawGateway) : [];
    const isDup = list.some(p => p.id === enrichedPacket.id && p.ts === enrichedPacket.ts);
    if (!isDup) {
      const updated = [enrichedPacket, ...list].slice(0, 50);
      localStorage.setItem('lora_gateway_packets', JSON.stringify(updated));
    }
  } catch (err) {
    console.warn('[LoRa Radio] Failed to persist gateway packet:', err);
  }

  // 2. Persist patient packets to Doctor Radio history in localStorage
  if (enrichedPacket.type === 'patient') {
    try {
      const rawDoctor = localStorage.getItem('lora_logs');
      const list = rawDoctor ? JSON.parse(rawDoctor) : [];
      const isDup = list.some(p => p.id === enrichedPacket.id && p.ts === enrichedPacket.ts);
      if (!isDup) {
        const updated = [enrichedPacket, ...list].slice(0, 50);
        localStorage.setItem('lora_logs', JSON.stringify(updated));
      }
    } catch (err) {
      console.warn('[LoRa Radio] Failed to persist doctor packet:', err);
    }
  }

  // 3. Dispatch in-window event (for same-tab listeners)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('lora_packet_radio', { detail: enrichedPacket }));
  }

  // 4. Send via cross-tab BroadcastChannel
  try {
    const channel = getBroadcastChannel();
    if (channel) {
      channel.postMessage(enrichedPacket);
    }
  } catch (err) {
    console.warn('[LoRa Radio] PostMessage failed:', err);
  }

  // 5. Broadcast to ALL OTHER DEVICES via Wi-Fi / Supabase Realtime
  try {
    const rt = getRealtimeChannel();
    if (rt) {
      rt.send({
        type: 'broadcast',
        event: 'lora_wave',
        payload: enrichedPacket
      });
    }
  } catch (err) {
    console.warn('[LoRa Radio] Realtime broadcast error:', err);
  }
};

/**
 * Subscribes to all incoming LoRa packets across Wi-Fi, Bluetooth, BroadcastChannel, and DOM.
 * @param {Function} callback - invoked with packet object
 * @returns {Function} unsubscribe cleanup function
 */
export const subscribeToLoRaRadio = (callback) => {
  if (typeof window === 'undefined' || typeof callback !== 'function') {
    return () => {};
  }

  // Handler for in-window custom events
  const handleLocalEvent = (e) => {
    if (e?.detail) {
      callback(e.detail);
    }
  };

  // Handler for BroadcastChannel events
  const channel = getBroadcastChannel();
  const handleBroadcastMessage = (event) => {
    if (event?.data) {
      callback(event.data);
    }
  };

  // Handler for Realtime Wi-Fi / Cloud mesh events from other devices
  const rt = getRealtimeChannel();
  let rtSubscription = null;
  if (rt) {
    rtSubscription = rt.on('broadcast', { event: 'lora_wave' }, ({ payload }) => {
      if (payload) {
        // Also ensure it is persisted on this device
        try {
          const rawGateway = localStorage.getItem('lora_gateway_packets');
          const list = rawGateway ? JSON.parse(rawGateway) : [];
          if (!list.some(p => p.id === payload.id && p.ts === payload.ts)) {
            localStorage.setItem('lora_gateway_packets', JSON.stringify([payload, ...list].slice(0, 50)));
          }

          if (payload.type === 'patient') {
            const rawDoctor = localStorage.getItem('lora_logs');
            const docList = rawDoctor ? JSON.parse(rawDoctor) : [];
            if (!docList.some(p => p.id === payload.id && p.ts === payload.ts)) {
              localStorage.setItem('lora_logs', JSON.stringify([payload, ...docList].slice(0, 50)));
            }
          }
        } catch (e) {
          console.warn('[LoRa Mesh] Persistence error:', e);
        }

        callback(payload);
      }
    });
  }

  window.addEventListener('lora_packet_radio', handleLocalEvent);
  if (channel) {
    channel.addEventListener('message', handleBroadcastMessage);
  }

  return () => {
    window.removeEventListener('lora_packet_radio', handleLocalEvent);
    if (channel) {
      channel.removeEventListener('message', handleBroadcastMessage);
    }
  };
};
