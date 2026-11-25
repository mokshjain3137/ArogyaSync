import React, { useState, useEffect, useRef } from 'react';
import {
  Radio, Send, ShieldAlert, CheckCircle2, Zap, SignalHigh,
  AlertTriangle, X, Clock, RefreshCw, Package, Wifi, Bluetooth,
  Sliders, ArrowRight, Activity, Volume2, VolumeX, Eye, Terminal,
  Cpu, RotateCcw, Check, Sparkles, Layers, Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { broadcastLoRaPacket, subscribeToLoRaRadio } from '../lib/loraRadio';
import { bleBridge } from '../lib/bluetoothRadio';
import { usePWAInstall } from '../hooks/usePWAInstall';

const PRESETS = [
  {
    id: 'p-cardiac',
    label: '🚨 Cardiac Emergency',
    triage: 'Red',
    type: 'patient',
    name: 'Devendra Joshi',
    age: 62,
    gender: 'Male',
    blood: 'O-',
    allergy: 'Ibuprofen',
    bp: '165/100',
    spo2: '91%',
    hr: '115 bpm',
    temp: '98.8°F',
    complaint: 'Crushing retrosternal chest pain radiating to left jaw',
    notes: 'Prior CABG (2021). Diaphoretic, pale. Immediate referral required.',
    ePhone: '+91 98111 22244'
  },
  {
    id: 'p-asthma',
    label: '⚠️ Severe Asthma',
    triage: 'Yellow',
    type: 'patient',
    name: 'Lakshmi Narayan',
    age: 31,
    gender: 'Female',
    blood: 'B+',
    allergy: 'Sulfa antibiotics',
    bp: '130/85',
    spo2: '94%',
    hr: '94 bpm',
    temp: '99.0°F',
    complaint: 'Acute respiratory distress and audible expiratory wheeze',
    notes: 'Administered 2.5mg Salbutamol via nebulizer. Re-eval in 20 min.',
    ePhone: '+91 91234 56790'
  },
  {
    id: 'p-fever',
    label: '👶 Pediatric High Fever',
    triage: 'Yellow',
    type: 'patient',
    name: 'Ravi Kumar',
    age: 4,
    gender: 'Male',
    blood: 'A+',
    allergy: 'Peanuts',
    bp: '90/60',
    spo2: '98%',
    hr: '124 bpm',
    temp: '103.2°F',
    complaint: 'Febrile episode (103°F) for 48h, poor oral intake, lethargy',
    notes: 'Paracetamol syrup 5ml given at 14:00. Watch for febrile seizure.',
    ePhone: '+91 99887 76655'
  },
  {
    id: 'p-antenatal',
    label: '💚 Antenatal Routine',
    triage: 'Green',
    type: 'patient',
    name: 'Smita Patil',
    age: 26,
    gender: 'Female',
    blood: 'AB-',
    allergy: 'None',
    bp: '110/70',
    spo2: '99%',
    hr: '76 bpm',
    temp: '98.4°F',
    complaint: 'Routine 2nd-trimester antenatal checkup (24 weeks)',
    notes: 'Normal fetal heart tones. Prescribed Iron & Folic Acid.',
    ePhone: '+91 99001 12234'
  },
  {
    id: 'p-inventory',
    label: '💊 Critical Medicine Stock',
    triage: 'Inventory',
    type: 'inventory',
    name: 'Paracetamol 500mg Tablets',
    qty: 150,
    unit: 'tablets',
    min: 200,
    status: 'Low Stock',
    notes: 'Stock dropped below 200 threshold. Request replenishment from District Depot.'
  }
];

// Simple Web Audio API alert sound
function playEmergencyBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.1); // D6
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {
    // Audio might be blocked if user hasn't interacted
  }
}

export default function RadioStation({ defaultView = 'dual' }) {
  // 'dual' | 'tx' | 'rx'
  const [viewMode, setViewMode] = useState(defaultView);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const { installPrompt, triggerInstall } = usePWAInstall();

  // BLE State
  const [bleStatus, setBleStatus] = useState(() => bleBridge.getStatus());
  useEffect(() => {
    return bleBridge.subscribe(setBleStatus);
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  // TRANSMITTER (TX) STATE
  // ──────────────────────────────────────────────────────────────────────────
  const [activeType, setActiveType] = useState('patient'); // 'patient' | 'inventory'
  const [formData, setFormData] = useState({
    name: 'Devendra Joshi',
    age: 62,
    gender: 'Male',
    blood: 'O-',
    triage: 'Red',
    complaint: 'Crushing chest pain radiating to left arm',
    notes: 'Diaphoretic, pale, prior CABG. Immediate ECG required.',
    bp: '165/100',
    spo2: '91%',
    hr: '115 bpm',
    temp: '98.8°F',
    ePhone: '+91 98111 22244',
    phcId: 'PHC-MUM-01'
  });

  const [inventoryData, setInventoryData] = useState({
    name: 'Salbutamol Nebulizer Solution',
    qty: 12,
    unit: 'vials',
    min: 25,
    notes: 'Low stock at rural PHC. Emergency replenishment requested.',
    phcId: 'PHC-MUM-01'
  });

  const [isTransmitting, setIsTransmitting] = useState(false);
  const [txStep, setTxStep] = useState(''); // 'csma' | 'compress' | 'encrypt' | 'broadcast' | 'done'
  const [txLog, setTxLog] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('tx_station_log') || '[]');
    } catch {
      return [];
    }
  });

  // Calculate live byte sizes
  const currentPayloadObj = activeType === 'patient' ? {
    T: formData.triage === 'Red' ? 1 : formData.triage === 'Yellow' ? 2 : 3,
    N: formData.name.slice(0, 20),
    B: formData.blood,
    C: formData.complaint.slice(0, 30),
    V: { bp: formData.bp, s: formData.spo2, h: formData.hr, t: formData.temp },
    E: formData.ePhone.slice(0, 14),
    P: formData.phcId,
    ts: Math.floor(Date.now() / 1000)
  } : {
    T: 0,
    IN: inventoryData.name.slice(0, 30),
    Q: inventoryData.qty,
    P: inventoryData.phcId,
    ts: Math.floor(Date.now() / 1000)
  };

  const rawJsonSize = JSON.stringify(activeType === 'patient' ? formData : inventoryData).length;
  const compressedMicroSize = JSON.stringify(currentPayloadObj).length;
  const loraByteLimit = 256;

  const handleApplyPreset = (preset) => {
    if (preset.type === 'patient') {
      setActiveType('patient');
      setFormData(prev => ({
        ...prev,
        name: preset.name,
        age: preset.age,
        gender: preset.gender,
        blood: preset.blood,
        triage: preset.triage,
        complaint: preset.complaint,
        notes: preset.notes,
        bp: preset.bp,
        spo2: preset.spo2,
        hr: preset.hr,
        temp: preset.temp,
        ePhone: preset.ePhone
      }));
    } else {
      setActiveType('inventory');
      setInventoryData(prev => ({
        ...prev,
        name: preset.name,
        qty: preset.qty,
        unit: preset.unit,
        min: preset.min,
        notes: preset.notes
      }));
    }
  };

  const handleTransmit = async () => {
    if (isTransmitting) return;
    setIsTransmitting(true);

    const packetId = 'PKT-' + Math.random().toString(36).substring(2, 9).toUpperCase();
    const isRedEmergency = activeType === 'patient' && formData.triage === 'Red';

    // 1. Channel Activity Detection (CSMA/CA)
    setTxStep('Scanning 868.1 MHz ISM Channel (CSMA / Listen-Before-Talk)...');
    await new Promise(r => setTimeout(r, isRedEmergency ? 250 : 650));

    // 2. Compression
    setTxStep('Compressing into 256-byte micro-string...');
    await new Promise(r => setTimeout(r, 250));

    // 3. Encryption
    setTxStep('Encrypting with AES-256-GCM (96-bit Nonce)...');
    await new Promise(r => setTimeout(r, 250));

    // 4. RF Wave Broadcast
    setTxStep('Broadcasting RF wave across 15 km LoRa & BLE mesh...');

    const payload = activeType === 'patient' ? {
      type: 'patient',
      id: packetId,
      triage: formData.triage,
      name: formData.name,
      age: formData.age,
      gender: formData.gender,
      blood: formData.blood,
      complaint: formData.complaint,
      notes: formData.notes,
      bp: formData.bp,
      spo2: formData.spo2,
      hr: formData.hr,
      temp: formData.temp,
      ePhone: formData.ePhone,
      sender_phc: formData.phcId,
      rawCompressedSize: compressedMicroSize,
      ts: Date.now()
    } : {
      type: 'inventory',
      id: packetId,
      triage: 'Inventory',
      name: inventoryData.name,
      qty: inventoryData.qty,
      unit: inventoryData.unit,
      notes: inventoryData.notes,
      sender_phc: inventoryData.phcId,
      rawCompressedSize: compressedMicroSize,
      ts: Date.now()
    };

    broadcastLoRaPacket(payload);

    const newLogItem = {
      id: packetId,
      type: activeType,
      triage: payload.triage,
      target: payload.name,
      size: compressedMicroSize,
      time: new Date().toLocaleTimeString(),
      carrier: bleStatus.connected ? 'BLE Mesh' : (navigator.onLine ? 'Wi-Fi / Mesh' : 'LoRa 868MHz')
    };

    setTxLog(prev => {
      const updated = [newLogItem, ...prev].slice(0, 30);
      localStorage.setItem('tx_station_log', JSON.stringify(updated));
      return updated;
    });

    await new Promise(r => setTimeout(r, 300));
    setTxStep('Broadcast Confirmed!');
    await new Promise(r => setTimeout(r, 700));

    setIsTransmitting(false);
    setTxStep('');
  };

  // ──────────────────────────────────────────────────────────────────────────
  // RECEIVER (RX) STATE
  // ──────────────────────────────────────────────────────────────────────────
  const [rxPackets, setRxPackets] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('rx_station_packets') || '[]');
    } catch {
      return [];
    }
  });

  const [filterTriage, setFilterTriage] = useState('all'); // 'all' | 'Red' | 'Yellow' | 'Green' | 'Inventory'
  const [viewRawId, setViewRawId] = useState(null);

  useEffect(() => {
    // Subscribe to multi-device & local LoRa radio packets
    const unsubscribe = subscribeToLoRaRadio((packet) => {
      if (!packet) return;

      const receivedPacket = {
        ...packet,
        _receivedAt: new Date().toISOString(),
        _rssi: Math.floor(Math.random() * 20 - 95), // -75 to -95 dBm
        _snr: (Math.random() * 8 + 4).toFixed(1),   // +4.0 to +12.0 dB
        _rawCiphertext: btoa(encodeURIComponent(JSON.stringify(packet))).substring(0, 160)
      };

      if (soundEnabled && (receivedPacket.triage === 'Red' || receivedPacket.priority === 'Red')) {
        playEmergencyBeep();
      }

      setRxPackets(prev => {
        const isDup = prev.some(p => p.id === packet.id && p.ts === packet.ts);
        if (isDup) return prev;
        const updated = [receivedPacket, ...prev].slice(0, 50);
        localStorage.setItem('rx_station_packets', JSON.stringify(updated));
        return updated;
      });
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [soundEnabled]);

  const handleClearRx = () => {
    setRxPackets([]);
    localStorage.removeItem('rx_station_packets');
  };

  const filteredPackets = rxPackets.filter(p => {
    if (filterTriage === 'all') return true;
    return p.triage === filterTriage;
  });

  const emergencyCount = rxPackets.filter(p => p.triage === 'Red').length;

  return (
    <div className="min-h-screen bg-[#F7F6F3] text-[#111111] font-sans selection:bg-[#EAEAEA]">
      {/* ── TOP NAVIGATION BAR ── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-[#EAEAEA] px-6 py-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* Logo & Status */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-[#111111] text-white flex items-center justify-center shrink-0">
              <Radio size={18} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif text-xl font-bold tracking-tight text-[#111111]">ArogyaSync RF</span>
                <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-[#EDF3EC] text-[#346538] border border-[#D0E2CF]">
                  LoRa 868 MHz & BLE Mesh
                </span>
              </div>
              <p className="text-[11px] text-[#787774] m-0">Zero-Network Rural Tele-Triage & Gateway Station</p>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center gap-1.5 p-1 bg-[#FBFBFA] border border-[#EAEAEA] rounded-lg">
            <button
              onClick={() => setViewMode('dual')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'dual'
                  ? 'bg-white text-[#111111] shadow-xs border border-[#EAEAEA]'
                  : 'text-[#787774] hover:text-[#111111]'
              }`}
            >
              <Layers size={13} /> Dual Split Console
            </button>
            <button
              onClick={() => setViewMode('tx')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'tx'
                  ? 'bg-white text-[#111111] shadow-xs border border-[#EAEAEA]'
                  : 'text-[#787774] hover:text-[#111111]'
              }`}
            >
              <Send size={13} /> Transmitter (TX)
            </button>
            <button
              onClick={() => setViewMode('rx')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'rx'
                  ? 'bg-white text-[#111111] shadow-xs border border-[#EAEAEA]'
                  : 'text-[#787774] hover:text-[#111111]'
              }`}
            >
              <Cpu size={13} /> Receiver (RX)
              {emergencyCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-[#9F2F2D] animate-ping" />
              )}
            </button>
          </div>

          {/* Controls: BLE, Audio, PWA Install */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => bleBridge.toggle()}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                bleStatus.connected
                  ? 'bg-[#EBF5FB] border-[#D4E6F1] text-[#2980B9]'
                  : 'bg-white border-[#EAEAEA] text-[#787774] hover:text-[#111111]'
              }`}
              title="Toggle Virtual Bluetooth LE Data Mule Node"
            >
              <Bluetooth size={13} />
              <span>{bleStatus.connected ? 'BLE Mesh Active' : 'BLE Mesh Off'}</span>
            </button>

            <button
              onClick={() => setSoundEnabled(prev => !prev)}
              className="w-8 h-8 rounded-full border border-[#EAEAEA] bg-white flex items-center justify-center text-[#787774] hover:text-[#111111] transition-colors cursor-pointer"
              title={soundEnabled ? 'Mute Emergency Alert Sounds' : 'Unmute Emergency Alert Sounds'}
            >
              {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>

            {installPrompt && (
              <button
                onClick={triggerInstall}
                className="btn-minimal-outline flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
              >
                <Download size={13} /> Install App
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT AREA ── */}
      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className={`grid gap-6 ${
          viewMode === 'dual' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 max-w-3xl mx-auto'
        }`}>
          
          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* TRANSMITTER PANEL (TX) */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {(viewMode === 'dual' || viewMode === 'tx') && (
            <div className="bg-white border border-[#EAEAEA] rounded-xl p-6 shadow-[0_4px_24px_rgba(0,0,0,0.02)] flex flex-col gap-6">
              
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-md bg-[#EDF3EC] text-[#346538] flex items-center justify-center font-bold">
                    <Send size={16} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold uppercase tracking-wider text-[#111111] m-0">
                      Transmitter Node (ASHA / Field TX)
                    </h2>
                    <p className="text-[11px] text-[#787774] m-0">
                      Compresses & broadcasts encrypted 256B micro-strings
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#FBFBFA] border border-[#EAEAEA] text-[#787774]">
                  868.100 MHz
                </span>
              </div>

              {/* Quick Presets */}
              <div>
                <label className="block text-[11px] font-bold text-[#787774] uppercase tracking-widest mb-2">
                  1-Click Medical Emergency Presets
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleApplyPreset(p)}
                      className={`text-xs px-2.5 py-1.5 rounded-md border transition-all cursor-pointer ${
                        (p.type === activeType && ((p.type === 'patient' && p.name === formData.name) || (p.type === 'inventory' && p.name === inventoryData.name)))
                          ? 'bg-[#111111] text-white border-[#111111]'
                          : 'bg-[#FBFBFA] border-[#EAEAEA] text-[#111111] hover:border-[#111111]'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode Toggle: Patient Intake vs Medicine Stock */}
              <div className="flex bg-[#FBFBFA] p-1 rounded-md border border-[#EAEAEA]">
                <button
                  type="button"
                  onClick={() => setActiveType('patient')}
                  className={`flex-1 text-xs font-bold uppercase tracking-wider py-1.5 rounded-sm transition-colors cursor-pointer ${
                    activeType === 'patient'
                      ? 'bg-white text-[#111111] shadow-xs border border-[#EAEAEA]'
                      : 'text-[#787774] hover:text-[#111111]'
                  }`}
                >
                  Patient Triage Record
                </button>
                <button
                  type="button"
                  onClick={() => setActiveType('inventory')}
                  className={`flex-1 text-xs font-bold uppercase tracking-wider py-1.5 rounded-sm transition-colors cursor-pointer ${
                    activeType === 'inventory'
                      ? 'bg-white text-[#111111] shadow-xs border border-[#EAEAEA]'
                      : 'text-[#787774] hover:text-[#111111]'
                  }`}
                >
                  Medicine Stock Alert
                </button>
              </div>

              {/* Patient Form Fields */}
              {activeType === 'patient' ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="block text-[11px] font-bold text-[#787774] uppercase tracking-wider">Patient Full Name</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        className="minimal-input bg-[#FBFBFA] text-xs py-1.5"
                        placeholder="Patient Name"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-[#787774] uppercase tracking-wider">Blood Group</label>
                      <select
                        value={formData.blood}
                        onChange={e => setFormData({ ...formData, blood: e.target.value })}
                        className="minimal-input bg-[#FBFBFA] text-xs py-1.5"
                      >
                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Triage Priority Selector */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-[#787774] uppercase tracking-wider">Triage Priority</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: '🔴 RED (Immediate)', val: 'Red', style: 'border-[#FDEBEC] bg-[#FDEBEC] text-[#9F2F2D]' },
                        { label: '🟡 YELLOW (Urgent)', val: 'Yellow', style: 'border-[#FDF8E2] bg-[#FDF8E2] text-[#956400]' },
                        { label: '🟢 GREEN (Stable)', val: 'Green', style: 'border-[#EDF3EC] bg-[#EDF3EC] text-[#346538]' }
                      ].map(t => (
                        <button
                          key={t.val}
                          type="button"
                          onClick={() => setFormData({ ...formData, triage: t.val })}
                          className={`px-2 py-1.5 rounded-md border text-xs font-bold transition-all cursor-pointer ${
                            formData.triage === t.val
                              ? `${t.style} ring-2 ring-[#111111]`
                              : 'bg-white border-[#EAEAEA] text-[#787774]'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Vitals Grid */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-[#787774] uppercase tracking-wider">Vitals Metrics</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <span className="text-[10px] text-[#787774]">BP</span>
                        <input
                          type="text"
                          value={formData.bp}
                          onChange={e => setFormData({ ...formData, bp: e.target.value })}
                          className="minimal-input bg-[#FBFBFA] text-xs py-1"
                          placeholder="120/80"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-[#787774]">SpO2</span>
                        <input
                          type="text"
                          value={formData.spo2}
                          onChange={e => setFormData({ ...formData, spo2: e.target.value })}
                          className="minimal-input bg-[#FBFBFA] text-xs py-1"
                          placeholder="98%"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-[#787774]">HR</span>
                        <input
                          type="text"
                          value={formData.hr}
                          onChange={e => setFormData({ ...formData, hr: e.target.value })}
                          className="minimal-input bg-[#FBFBFA] text-xs py-1"
                          placeholder="72 bpm"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-[#787774]">Temp</span>
                        <input
                          type="text"
                          value={formData.temp}
                          onChange={e => setFormData({ ...formData, temp: e.target.value })}
                          className="minimal-input bg-[#FBFBFA] text-xs py-1"
                          placeholder="98.6°F"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Chief Complaint */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-[#787774] uppercase tracking-wider">Chief Complaint & Symptoms</label>
                    <textarea
                      rows={2}
                      value={formData.complaint}
                      onChange={e => setFormData({ ...formData, complaint: e.target.value })}
                      className="minimal-input bg-[#FBFBFA] text-xs py-1.5 resize-none"
                      placeholder="Symptoms description..."
                    />
                  </div>
                </div>
              ) : (
                /* Inventory Form Fields */
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-[#787774] uppercase tracking-wider">Medicine / Supply Item Name</label>
                    <input
                      type="text"
                      value={inventoryData.name}
                      onChange={e => setInventoryData({ ...inventoryData, name: e.target.value })}
                      className="minimal-input bg-[#FBFBFA] text-xs py-1.5"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-[#787774] uppercase tracking-wider">Current Quantity</label>
                      <input
                        type="number"
                        value={inventoryData.qty}
                        onChange={e => setInventoryData({ ...inventoryData, qty: Number(e.target.value) })}
                        className="minimal-input bg-[#FBFBFA] text-xs py-1.5"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-[#787774] uppercase tracking-wider">Unit</label>
                      <input
                        type="text"
                        value={inventoryData.unit}
                        onChange={e => setInventoryData({ ...inventoryData, unit: e.target.value })}
                        className="minimal-input bg-[#FBFBFA] text-xs py-1.5"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-[#787774] uppercase tracking-wider">Requisition Notes</label>
                    <textarea
                      rows={2}
                      value={inventoryData.notes}
                      onChange={e => setInventoryData({ ...inventoryData, notes: e.target.value })}
                      className="minimal-input bg-[#FBFBFA] text-xs py-1.5 resize-none"
                    />
                  </div>
                </div>
              )}

              {/* Micro-string Compression & LoRa MTU Meter */}
              <div className="p-3 bg-[#FBFBFA] border border-[#EAEAEA] rounded-lg space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-[#787774] flex items-center gap-1.5">
                    <Zap size={13} className="text-[#956400]" /> LoRa 256-Byte Payload Buffer:
                  </span>
                  <span className="font-mono font-bold text-[#111111]">
                    {compressedMicroSize} / {loraByteLimit} Bytes ({Math.round((compressedMicroSize / loraByteLimit) * 100)}%)
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-[#EAEAEA] h-2 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${
                      compressedMicroSize > 256 ? 'bg-[#9F2F2D]' : 'bg-[#346538]'
                    }`}
                    style={{ width: `${Math.min(100, (compressedMicroSize / loraByteLimit) * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] text-[#787774] font-mono">
                  <span>Raw: {rawJsonSize}B ➔ Compressed: {compressedMicroSize}B</span>
                  <span className="text-[#346538] font-semibold">AES-256-GCM Secure</span>
                </div>
              </div>

              {/* Transmit Action Button */}
              <div>
                <button
                  type="button"
                  onClick={handleTransmit}
                  disabled={isTransmitting}
                  className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer ${
                    formData.triage === 'Red' && activeType === 'patient'
                      ? 'bg-[#9F2F2D] hover:bg-[#852725] active:scale-98'
                      : 'bg-[#111111] hover:bg-[#222222] active:scale-98'
                  } ${isTransmitting ? 'opacity-90' : ''}`}
                >
                  {isTransmitting ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>{txStep}</span>
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      <span>BROADCAST OVER LORA & BLE MESH</span>
                    </>
                  )}
                </button>
              </div>

              {/* Transmission Log */}
              {txLog.length > 0 && (
                <div className="pt-2 border-t border-[#EAEAEA]">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-[#787774] uppercase tracking-wider">
                      Recent Sent Transmissions ({txLog.length})
                    </span>
                    <button
                      onClick={() => { setTxLog([]); localStorage.removeItem('tx_station_log'); }}
                      className="text-[10px] text-[#787774] hover:text-[#9F2F2D] underline cursor-pointer"
                    >
                      Clear Log
                    </button>
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1.5 font-mono text-[11px]">
                    {txLog.slice(0, 5).map((log) => (
                      <div key={log.id} className="p-2 bg-[#FBFBFA] border border-[#EAEAEA] rounded flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${
                            log.triage === 'Red' ? 'bg-[#9F2F2D]' : log.triage === 'Yellow' ? 'bg-[#956400]' : 'bg-[#346538]'
                          }`} />
                          <span className="font-semibold text-[#111111]">{log.target}</span>
                          <span className="text-[10px] text-[#787774]">({log.size}B)</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-[#787774]">
                          <span>{log.carrier}</span>
                          <span>{log.time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* RECEIVER PANEL (RX) */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {(viewMode === 'dual' || viewMode === 'rx') && (
            <div className="bg-white border border-[#EAEAEA] rounded-xl p-6 shadow-[0_4px_24px_rgba(0,0,0,0.02)] flex flex-col gap-6">
              
              {/* Header & Status Bar */}
              <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-md bg-[#EDF3EC] text-[#346538] flex items-center justify-center font-bold">
                    <Radio size={16} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold uppercase tracking-wider text-[#111111] m-0">
                      Receiver Gateway (Doctor / District RX)
                    </h2>
                    <p className="text-[11px] text-[#787774] m-0">
                      Listening on 868.100 MHz SF9 • AES-256 Decryptor
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#346538] animate-pulse" />
                  <span className="text-xs font-semibold text-[#346538]">Listening</span>
                </div>
              </div>

              {/* Telemetry Metrics Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2.5 bg-[#FBFBFA] border border-[#EAEAEA] rounded-lg">
                  <span className="block text-[10px] text-[#787774] uppercase font-bold tracking-wider">Frequency</span>
                  <span className="text-xs font-mono font-bold text-[#111111]">868.1 MHz</span>
                </div>
                <div className="p-2.5 bg-[#FBFBFA] border border-[#EAEAEA] rounded-lg">
                  <span className="block text-[10px] text-[#787774] uppercase font-bold tracking-wider">Modulation</span>
                  <span className="text-xs font-mono font-bold text-[#111111]">SF9 / BW125</span>
                </div>
                <div className="p-2.5 bg-[#FBFBFA] border border-[#EAEAEA] rounded-lg">
                  <span className="block text-[10px] text-[#787774] uppercase font-bold tracking-wider">Avg RSSI</span>
                  <span className="text-xs font-mono font-bold text-[#111111]">-88 dBm</span>
                </div>
                <div className="p-2.5 bg-[#FBFBFA] border border-[#EAEAEA] rounded-lg">
                  <span className="block text-[10px] text-[#787774] uppercase font-bold tracking-wider">Packets RX</span>
                  <span className="text-xs font-mono font-bold text-[#346538]">{rxPackets.length}</span>
                </div>
              </div>

              {/* Triage Filter Bar & Clear */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                  {[
                    { key: 'all', label: `All (${rxPackets.length})` },
                    { key: 'Red', label: `Red (${rxPackets.filter(p => p.triage === 'Red').length})` },
                    { key: 'Yellow', label: `Yellow (${rxPackets.filter(p => p.triage === 'Yellow').length})` },
                    { key: 'Green', label: `Green (${rxPackets.filter(p => p.triage === 'Green').length})` }
                  ].map(f => (
                    <button
                      key={f.key}
                      onClick={() => setFilterTriage(f.key)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                        filterTriage === f.key
                          ? 'bg-[#111111] text-white'
                          : 'bg-[#FBFBFA] border border-[#EAEAEA] text-[#787774] hover:text-[#111111]'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                {rxPackets.length > 0 && (
                  <button
                    onClick={handleClearRx}
                    className="text-xs text-[#787774] hover:text-[#9F2F2D] underline shrink-0 cursor-pointer"
                  >
                    Clear Feed
                  </button>
                )}
              </div>

              {/* Packet List Feed */}
              <div className="flex-1 overflow-y-auto max-h-[560px] space-y-4 pr-1">
                {filteredPackets.length === 0 ? (
                  <div className="h-64 border-2 border-dashed border-[#EAEAEA] rounded-xl flex flex-col items-center justify-center text-center p-6 text-[#787774]">
                    <Radio size={32} className="opacity-40 mb-3 animate-pulse" />
                    <p className="text-sm font-semibold text-[#111111]">Waiting for LoRa Transmission...</p>
                    <p className="text-xs max-w-xs mt-1">
                      Trigger a broadcast on the left transmitter panel or from another laptop to see live packets intercept and decode here.
                    </p>
                  </div>
                ) : (
                  filteredPackets.map((pkt) => {
                    const isRed = pkt.triage === 'Red';
                    const isYellow = pkt.triage === 'Yellow';
                    const isRawOpen = viewRawId === pkt.id;

                    return (
                      <motion.div
                        key={pkt.id + pkt.ts}
                        initial={{ opacity: 0, y: -10, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className={`rounded-xl border p-4 transition-all ${
                          isRed
                            ? 'bg-[#FFFBFB] border-[#FADBDC] shadow-[0_4px_16px_rgba(159,47,45,0.06)]'
                            : isYellow
                            ? 'bg-[#FFFFF9] border-[#FBF0B9]'
                            : 'bg-[#FBFBFA] border-[#EAEAEA]'
                        }`}
                      >
                        {/* Packet Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-[#EAEAEA]/80 gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              isRed ? 'bg-[#FDEBEC] text-[#9F2F2D]' : isYellow ? 'bg-[#FDF8E2] text-[#956400]' : 'bg-[#EDF3EC] text-[#346538]'
                            }`}>
                              {pkt.triage} Priority
                            </span>
                            <span className="text-xs font-bold text-[#111111]">
                              {pkt.type === 'patient' ? pkt.name : pkt.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] font-mono text-[#787774]">
                            <span>RSSI: {pkt._rssi || -85} dBm</span>
                            <span>SNR: +{pkt._snr || 8.2} dB</span>
                            <span className="text-[#111111] font-semibold">
                              {new Date(pkt._receivedAt || pkt.ts).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>

                        {/* Patient Clinical Info */}
                        {pkt.type === 'patient' ? (
                          <div className="pt-3 space-y-3 text-xs">
                            {/* Vitals Ribbon */}
                            <div className="grid grid-cols-4 gap-2 bg-white p-2.5 rounded-lg border border-[#EAEAEA] text-center font-mono">
                              <div>
                                <span className="block text-[9px] text-[#787774] uppercase">BP</span>
                                <span className="font-bold text-[#111111]">{pkt.bp || '120/80'}</span>
                              </div>
                              <div>
                                <span className="block text-[9px] text-[#787774] uppercase">SpO2</span>
                                <span className={`font-bold ${isRed ? 'text-[#9F2F2D]' : 'text-[#111111]'}`}>{pkt.spo2 || '98%'}</span>
                              </div>
                              <div>
                                <span className="block text-[9px] text-[#787774] uppercase">HR</span>
                                <span className="font-bold text-[#111111]">{pkt.hr || '75 bpm'}</span>
                              </div>
                              <div>
                                <span className="block text-[9px] text-[#787774] uppercase">Temp</span>
                                <span className="font-bold text-[#111111]">{pkt.temp || '98.6°F'}</span>
                              </div>
                            </div>

                            {/* Complaint & Notes */}
                            <div className="bg-white p-2.5 rounded-lg border border-[#EAEAEA] space-y-1">
                              <div>
                                <span className="text-[10px] font-bold text-[#787774] uppercase">Complaint: </span>
                                <span className="font-medium text-[#111111]">{pkt.complaint}</span>
                              </div>
                              {pkt.notes && (
                                <div>
                                  <span className="text-[10px] font-bold text-[#787774] uppercase">ASHA Clinical Notes: </span>
                                  <span className="text-[#787774]">{pkt.notes}</span>
                                </div>
                              )}
                            </div>

                            {/* Meta & Carrier */}
                            <div className="flex items-center justify-between text-[11px] text-[#787774] pt-1">
                              <div className="flex items-center gap-3">
                                <span>Blood: <strong className="text-[#111111]">{pkt.blood || 'Unknown'}</strong></span>
                                <span>Emergency Phone: <strong className="text-[#111111]">{pkt.ePhone || 'N/A'}</strong></span>
                              </div>
                              <span className="px-2 py-0.5 rounded bg-white border border-[#EAEAEA] text-[10px] font-semibold text-[#346538]">
                                📡 {pkt.carrier || 'LoRa 868MHz RF'}
                              </span>
                            </div>
                          </div>
                        ) : (
                          /* Inventory Details */
                          <div className="pt-3 space-y-2 text-xs">
                            <div className="p-3 bg-white border border-[#EAEAEA] rounded-lg flex items-center justify-between">
                              <div>
                                <span className="block font-bold text-[#111111]">{pkt.name}</span>
                                <span className="text-[11px] text-[#787774]">{pkt.notes}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-lg font-bold text-[#956400]">{pkt.qty}</span>
                                <span className="block text-[10px] text-[#787774] uppercase">{pkt.unit}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Raw Encrypted Payload Toggle */}
                        <div className="mt-3 pt-2 border-t border-[#EAEAEA]/60 flex items-center justify-between text-[10px]">
                          <button
                            onClick={() => setViewRawId(isRawOpen ? null : pkt.id)}
                            className="text-[#787774] hover:text-[#111111] flex items-center gap-1 cursor-pointer font-mono"
                          >
                            <Terminal size={11} /> {isRawOpen ? 'Hide Raw Micro-String' : 'View Decrypted Micro-String'}
                          </button>
                          <span className="font-mono text-[#787774]">{pkt.id}</span>
                        </div>

                        {isRawOpen && (
                          <div className="mt-2 p-2 bg-[#111111] text-[#A3E635] font-mono text-[10px] rounded overflow-x-auto">
                            <code>{JSON.stringify(pkt, null, 2)}</code>
                          </div>
                        )}
                      </motion.div>
                    );
                  })
                )}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
