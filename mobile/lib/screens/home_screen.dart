import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import '../main.dart';
import '../services/discovery.dart';
import '../services/link.dart';
import '../services/protocol.dart';
import '../services/settings.dart';
import '../services/system.dart';
import '../theme.dart';
import 'camera_screen.dart';
import 'scan_screen.dart';
import 'settings_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  bool _autoTried = false;
  bool _usbAutoTried = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    discovery.start();
    discovery.addListener(_maybeAutoConnect);
    WidgetsBinding.instance.addPostFrameCallback((_) => _maybeAutoConnect());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    discovery.removeListener(_maybeAutoConnect);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState s) {
    if (s == AppLifecycleState.resumed) discovery.start();
  }

  /// Reconnect automatically to the PC used last time when it shows up, and
  /// to any paired PC as soon as the phone is plugged into it by USB.
  void _maybeAutoConnect() {
    if (!discovery.usbActive) _usbAutoTried = false;
    if (!settings.autoConnect || !mounted || link.isConnected) return;
    if (!_usbAutoTried) {
      final usbPc = discovery.pcs.where((p) => p.usb && (settings.pcs[p.id]?.token.isNotEmpty ?? false)).firstOrNull;
      if (usbPc != null) {
        _usbAutoTried = true;
        _autoTried = true;
        final known = settings.pcs[usbPc.id]!;
        _connect(ConnectTarget(
          hosts: discovery.orderHosts([usbPc.host, ...known.hosts]),
          port: usbPc.port,
          name: known.name,
          id: known.id,
          token: known.token,
        ));
        return;
      }
    }
    if (_autoTried) return;
    final last = settings.lastPc;
    if (last == null) return;
    final found = discovery.pcs.where((p) => p.id == last.id).firstOrNull;
    if (found == null) return;
    _autoTried = true;
    _connect(ConnectTarget(
      hosts: discovery.orderHosts([found.host, ...last.hosts]),
      port: found.port,
      name: last.name,
      id: last.id,
      token: last.token,
    ));
  }

  /// Asks for camera access up front (flutter_webrtc shows the system prompt).
  Future<bool> _ensureCamera() async {
    try {
      final probe = await navigator.mediaDevices.getUserMedia({'audio': false, 'video': true});
      for (final t in probe.getTracks()) {
        await t.stop();
      }
      await probe.dispose();
      return true;
    } catch (_) {
      if (!mounted) return false;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('CarrotCam needs camera access. Allow it in Android Settings → Apps → CarrotCam → Permissions.'),
      ));
      return false;
    }
  }

  Future<void> _connect(ConnectTarget target) async {
    if (!await _ensureCamera()) return;
    if (!mounted) return;
    HapticFeedback.lightImpact();
    link.connect(target);
    await Navigator.of(context).push(smoothRoute(const CameraScreen()));
    if (mounted) setState(() {});
  }

  Future<void> _scan() async {
    final result = await Navigator.of(context).push<PairInfo>(smoothRoute(const ScanScreen()));
    if (result == null) return;
    final known = settings.pcs[result.id];
    _connect(ConnectTarget(
      hosts: discovery.orderHosts(result.hosts),
      port: result.port,
      name: result.name,
      id: result.id,
      code: result.code,
      token: known?.token,
    ));
  }

  Future<void> _tapPc(DiscoveredPc pc) async {
    final known = settings.pcs[pc.id];
    if (known != null && known.token.isNotEmpty) {
      _connect(ConnectTarget(hosts: discovery.orderHosts([pc.host, ...known.hosts]), port: pc.port, name: pc.name, id: pc.id, token: known.token));
      return;
    }
    final code = await _askCode(pc.name);
    if (code == null) return;
    _connect(ConnectTarget(hosts: [pc.host], port: pc.port, name: pc.name, id: pc.id, code: code));
  }

  Future<String?> _askCode(String name) {
    final ctrl = TextEditingController();
    return showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(24, 0, 24, MediaQuery.of(ctx).viewInsets.bottom + 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Pair with $name', style: Theme.of(ctx).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Text('Enter the 6-digit code shown on the PC (camera menu → Phones).', style: TextStyle(color: Theme.of(ctx).colorScheme.outline)),
            const SizedBox(height: 18),
            TextField(
              controller: ctrl,
              autofocus: true,
              keyboardType: TextInputType.number,
              maxLength: 6,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 30, letterSpacing: 12, fontWeight: FontWeight.w800),
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(counterText: '', hintText: '000000'),
              onSubmitted: (v) => v.length == 6 ? Navigator.pop(ctx, v) : null,
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton(onPressed: () => Navigator.pop(ctx, ctrl.text.length == 6 ? ctrl.text : null), child: const Text('Connect')),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _manual() async {
    final host = TextEditingController();
    final code = TextEditingController();
    final res = await showModalBottomSheet<(String, String)>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(24, 0, 24, MediaQuery.of(ctx).viewInsets.bottom + 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Connect manually', style: Theme.of(ctx).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 16),
            TextField(
              controller: host,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'PC address', hintText: '192.168.1.20'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: code,
              keyboardType: TextInputType.number,
              maxLength: 6,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(labelText: 'Pairing code', counterText: ''),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton(onPressed: () => Navigator.pop(ctx, (host.text.trim(), code.text.trim())), child: const Text('Connect')),
            ),
          ],
        ),
      ),
    );
    if (res == null || res.$1.isEmpty) return;
    final parts = res.$1.split(':');
    _connect(ConnectTarget(
      hosts: [parts[0]],
      port: parts.length > 1 ? int.tryParse(parts[1]) ?? kDefaultPort : kDefaultPort,
      name: parts[0],
      code: res.$2.isEmpty ? null : res.$2,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 20,
        title: Row(children: [
          const CarrotLogo(size: 34),
          const SizedBox(width: 12),
          const Text('CarrotCam'),
        ]),
        actions: [
          IconButton(
            icon: const Icon(Icons.tune_rounded),
            onPressed: () => Navigator.of(context).push(smoothRoute(const SettingsScreen())),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: RefreshIndicator(
        color: CC.orange,
        onRefresh: () async {
          await discovery.stop();
          await discovery.start();
          await Future<void>.delayed(const Duration(seconds: 1));
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            const _UpdateBanner(),
            _Hero(onScan: _scan, onManual: _manual),
            const SizedBox(height: 16),
            const _UsbCard(),
            const SizedBox(height: 28),
            ListenableBuilder(
              listenable: Listenable.merge([discovery, settings]),
              builder: (context, _) {
                final found = discovery.pcs;
                final recent = settings.pcs.values.where((k) => !found.any((f) => f.id == k.id)).toList()
                  ..sort((a, b) => b.lastUsed.compareTo(a.lastUsed));
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Text('NEARBY PCS', style: TextStyle(color: scheme.outline, fontWeight: FontWeight.w800, letterSpacing: 1.1, fontSize: 12)),
                      const SizedBox(width: 10),
                      SizedBox(
                        width: 12,
                        height: 12,
                        child: CircularProgressIndicator(strokeWidth: 2, color: CC.orange.withValues(alpha: 0.7)),
                      ),
                    ]),
                    const SizedBox(height: 12),
                    if (found.isEmpty)
                      _EmptyHint(scheme: scheme)
                    else
                      for (final (i, pc) in found.indexed)
                        _PcTile(
                          name: pc.name,
                          subtitle: '${pc.usb ? 'USB cable' : pc.host}${settings.pcs.containsKey(pc.id) ? ' · Paired' : ''}',
                          usb: pc.usb,
                          paired: settings.pcs.containsKey(pc.id),
                          online: true,
                          onTap: () => _tapPc(pc),
                        ).animate().fadeIn(delay: (60 * i).ms, duration: 300.ms).slideY(begin: 0.15, curve: Curves.easeOutCubic),
                    if (recent.isNotEmpty) ...[
                      const SizedBox(height: 22),
                      Text('RECENT', style: TextStyle(color: scheme.outline, fontWeight: FontWeight.w800, letterSpacing: 1.1, fontSize: 12)),
                      const SizedBox(height: 12),
                      for (final k in recent)
                        _PcTile(
                          name: k.name,
                          subtitle: k.hosts.isEmpty ? 'Paired' : 'Last seen at ${k.hosts.first}',
                          paired: true,
                          online: false,
                          onTap: () => _connect(ConnectTarget(hosts: k.hosts, port: k.port, name: k.name, id: k.id, token: k.token)),
                          onLongPress: () => _forget(k),
                        ),
                    ],
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _forget(KnownPc k) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Forget ${k.name}?'),
        content: const Text('You will need the pairing code to connect again.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Forget')),
        ],
      ),
    );
    if (ok == true) settings.forgetPc(k.id);
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.onScan, required this.onManual});
  final VoidCallback onScan;
  final VoidCallback onManual;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: CC.gradient,
        borderRadius: BorderRadius.circular(30),
        boxShadow: [BoxShadow(color: CC.orange.withValues(alpha: 0.35), blurRadius: 30, offset: const Offset(0, 14))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(18)),
            child: const Icon(Icons.videocam_rounded, color: Colors.white, size: 30),
          )
              .animate(onPlay: (c) => c.repeat(reverse: true))
              .scaleXY(begin: 1, end: 1.06, duration: 1400.ms, curve: Curves.easeInOut),
          const SizedBox(height: 18),
          const Text(
            'Your phone is now\na studio webcam',
            style: TextStyle(color: Colors.white, fontSize: 28, height: 1.15, fontWeight: FontWeight.w900, letterSpacing: -0.5),
          ),
          const SizedBox(height: 8),
          Text(
            'Open CarrotCam on your PC, then scan its QR code — or plug your phone in with a USB cable.',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 14.5, height: 1.35),
          ),
          const SizedBox(height: 20),
          Row(children: [
            Expanded(
              child: FilledButton.icon(
                style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: CC.orangeDeep),
                onPressed: onScan,
                icon: const Icon(Icons.qr_code_scanner_rounded),
                label: const Text('Scan QR code'),
              ),
            ),
            const SizedBox(width: 10),
            IconButton.filled(
              style: IconButton.styleFrom(backgroundColor: Colors.white.withValues(alpha: 0.22), minimumSize: const Size(52, 52)),
              onPressed: onManual,
              icon: const Icon(Icons.keyboard_rounded, color: Colors.white),
            ),
          ]),
        ],
      ),
    ).animate().fadeIn(duration: 450.ms).slideY(begin: 0.08, curve: Curves.easeOutCubic);
  }
}

class _PcTile extends StatelessWidget {
  const _PcTile({
    required this.name,
    required this.subtitle,
    required this.paired,
    required this.online,
    required this.onTap,
    this.onLongPress,
    this.usb = false,
  });
  final String name;
  final String subtitle;
  final bool paired;
  final bool online;
  final bool usb;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          onLongPress: onLongPress,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(color: CC.orange.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(15)),
                child: Icon(usb ? Icons.usb_rounded : Icons.desktop_windows_rounded, color: CC.orange),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  const SizedBox(height: 2),
                  Text(subtitle, style: TextStyle(color: scheme.outline, fontSize: 13)),
                ]),
              ),
              if (online)
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(color: CC.green, shape: BoxShape.circle, boxShadow: [
                    BoxShadow(color: CC.green.withValues(alpha: 0.5), blurRadius: 8),
                  ]),
                ),
              const SizedBox(width: 8),
              Icon(Icons.chevron_right_rounded, color: scheme.outline),
            ]),
          ),
        ),
      ),
    );
  }
}

/// Connect over a USB cable: Android USB tethering / iPhone Personal Hotspot
/// turn the cable into a tiny private network between the phone and the PC.
class _UsbCard extends StatelessWidget {
  const _UsbCard();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ListenableBuilder(
      listenable: discovery,
      builder: (context, _) {
        final on = discovery.usbActive;
        final pc = discovery.pcs.where((p) => p.usb).firstOrNull;
        final android = Platform.isAndroid;
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(color: CC.orange.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(14)),
                  child: const Icon(Icons.usb_rounded, color: CC.orange),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('USB cable', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                    const SizedBox(height: 2),
                    Text(
                      pc != null
                          ? 'Connected to ${pc.name} by cable'
                          : on
                              ? 'Cable ready — open CarrotCam on your PC'
                              : 'Steadiest picture, no Wi-Fi needed',
                      style: TextStyle(color: scheme.outline, fontSize: 13),
                    ),
                  ]),
                ),
                if (on)
                  Container(
                    width: 10,
                    height: 10,
                    decoration: const BoxDecoration(color: CC.green, shape: BoxShape.circle),
                  ),
              ]),
              if (!on) ...[
                const SizedBox(height: 12),
                Text(
                  android
                      ? '1. Plug your phone into the PC.\n2. Turn on USB tethering.\n3. Your PC shows up here — tap it.'
                      : '1. Plug your iPhone into the PC.\n2. Turn on Personal Hotspot (Settings).\n3. Your PC shows up here — tap it.',
                  style: TextStyle(color: scheme.outline, height: 1.45, fontSize: 13),
                ),
                if (android) ...[
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.tonalIcon(
                      onPressed: () async {
                        final ok = await openTetherSettings();
                        if (!ok && context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                            content: Text('Open Settings → Network → Hotspot & tethering → USB tethering.'),
                          ));
                        }
                      },
                      icon: const Icon(Icons.settings_ethernet_rounded),
                      label: const Text('Turn on USB tethering'),
                    ),
                  ),
                ],
              ],
            ]),
          ),
        );
      },
    );
  }
}

class _EmptyHint extends StatelessWidget {
  const _EmptyHint({required this.scheme});
  final ColorScheme scheme;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(children: [
          Icon(Icons.wifi_find_rounded, color: scheme.outline, size: 30)
              .animate(onPlay: (c) => c.repeat())
              .fade(begin: 0.4, end: 1, duration: 900.ms)
              .then()
              .fade(begin: 1, end: 0.4, duration: 900.ms),
          const SizedBox(width: 16),
          Expanded(
            child: Text(
              'Looking for PCs on your Wi-Fi or USB cable…\nMake sure CarrotCam is open on your computer.',
              style: TextStyle(color: scheme.outline, height: 1.4),
            ),
          ),
        ]),
      ),
    );
  }
}

class _UpdateBanner extends StatelessWidget {
  const _UpdateBanner();

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: updater,
      builder: (context, _) {
        final u = updater.available;
        if (u == null) return const SizedBox.shrink();
        final p = updater.progress;
        return Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  const Icon(Icons.system_update_rounded, color: CC.orange),
                  const SizedBox(width: 12),
                  Expanded(child: Text('CarrotCam ${u.version} is available', style: const TextStyle(fontWeight: FontWeight.w800))),
                  if (p == null)
                    FilledButton(
                      style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
                      onPressed: updater.install,
                      child: const Text('Update'),
                    ),
                ]),
                if (p != null) ...[
                  const SizedBox(height: 12),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: LinearProgressIndicator(value: p, minHeight: 8, color: CC.orange),
                  ),
                ],
                if (updater.error != null) Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(updater.error!, style: const TextStyle(color: CC.red, fontSize: 12)),
                ),
              ]),
            ),
          ),
        ).animate().fadeIn().slideY(begin: -0.2);
      },
    );
  }
}
