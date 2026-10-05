import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
    // never start a second connection while one is being set up or running
    if (_busy || !settings.autoConnect || !mounted || (link.state != LinkState.idle && link.state != LinkState.error)) return;
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

  /// True from the moment a connection is requested until its camera screen
  /// closes, so discovery events can't start a second one in parallel.
  bool _busy = false;

  Future<void> _connect(ConnectTarget target) async {
    if (_busy) return;
    _busy = true;
    try {
      if (!await _ensureCamera()) return;
      if (!mounted) return;
      HapticFeedback.lightImpact();
      link.connect(target);
      await Navigator.of(context).push(smoothRoute(const CameraScreen()));
      if (mounted) setState(() {});
    } finally {
      _busy = false;
    }
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
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 20,
        title: const Row(children: [
          CarrotLogo(size: 30),
          SizedBox(width: 10),
          Text('CarrotCam'),
        ]),
        actions: [
          IconButton(
            tooltip: 'Settings',
            icon: const Icon(Icons.settings_outlined),
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
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 40),
          children: [
            const _UpdateBanner(),
            _Hero(onScan: _scan, onManual: _manual),
            ListenableBuilder(
              listenable: Listenable.merge([discovery, settings]),
              builder: (context, _) {
                final found = discovery.pcs;
                final recent = settings.pcs.values.where((k) => !found.any((f) => f.id == k.id)).toList()
                  ..sort((a, b) => b.lastUsed.compareTo(a.lastUsed));
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SectionLabel(
                      'Nearby PCs',
                      trailing: SizedBox(width: 11, height: 11, child: CircularProgressIndicator(strokeWidth: 1.8)),
                    ),
                    if (found.isEmpty)
                      const _EmptyHint()
                    else
                      for (final pc in found)
                        _PcTile(
                          name: pc.name,
                          subtitle: '${pc.usb ? 'USB cable' : 'Wi-Fi'}${settings.pcs.containsKey(pc.id) ? ' · paired' : ' · tap to pair'}',
                          usb: pc.usb,
                          online: true,
                          onTap: () => _tapPc(pc),
                        ),
                    if (recent.isNotEmpty) ...[
                      const SectionLabel('Paired before'),
                      for (final k in recent)
                        _PcTile(
                          name: k.name,
                          subtitle: 'Not found right now · hold to forget',
                          online: false,
                          onTap: () => _connect(ConnectTarget(hosts: k.hosts, port: k.port, name: k.name, id: k.id, token: k.token)),
                          onLongPress: () => _forget(k),
                        ),
                    ],
                    const SectionLabel('USB cable'),
                    const _UsbCard(),
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
    final t = Tokens.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const IconTile(Icons.videocam_outlined, size: 48),
            const SizedBox(height: 16),
            const Text(
              'Your phone, your PC\'s best webcam',
              style: TextStyle(fontSize: 24, height: 1.2, fontWeight: FontWeight.w800, letterSpacing: -0.4),
            ),
            const SizedBox(height: 8),
            Text(
              'Open CarrotCam on your PC, pick Phones in the camera menu and scan the code. Or plug in a USB cable.',
              style: TextStyle(color: t.muted, fontSize: 14, height: 1.4),
            ),
            const SizedBox(height: 18),
            Row(children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: onScan,
                  icon: const Icon(Icons.qr_code_scanner_rounded),
                  label: const Text('Scan QR code'),
                ),
              ),
              const SizedBox(width: 10),
              OutlinedButton.icon(
                onPressed: onManual,
                icon: const Icon(Icons.dialpad_rounded, size: 20),
                label: const Text('Code'),
              ),
            ]),
          ],
        ),
      ),
    );
  }
}

class _PcTile extends StatelessWidget {
  const _PcTile({
    required this.name,
    required this.subtitle,
    required this.online,
    required this.onTap,
    this.onLongPress,
    this.usb = false,
  });
  final String name;
  final String subtitle;
  final bool online;
  final bool usb;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;

  @override
  Widget build(BuildContext context) {
    final t = Tokens.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          onLongPress: onLongPress,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              IconTile(usb ? Icons.usb_rounded : Icons.desktop_windows_outlined, color: online ? CC.orange : t.muted),
              const SizedBox(width: 14),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Flexible(child: Text(name, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5))),
                    if (online) ...[const SizedBox(width: 8), const Dot(CC.green, size: 7)],
                  ]),
                  const SizedBox(height: 2),
                  Text(subtitle, style: TextStyle(color: t.muted, fontSize: 13)),
                ]),
              ),
              Icon(Icons.chevron_right_rounded, color: t.muted),
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
    final t = Tokens.of(context);
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
                IconTile(Icons.usb_rounded, color: on ? CC.green : CC.orange),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(pc != null ? 'Cable connected' : on ? 'Cable ready' : 'Steadiest picture',
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5)),
                    const SizedBox(height: 2),
                    Text(
                      pc != null
                          ? 'Tap ${pc.name} above to start'
                          : on
                              ? 'Open CarrotCam on your PC'
                              : 'No Wi-Fi needed, and the phone charges',
                      style: TextStyle(color: t.muted, fontSize: 13),
                    ),
                  ]),
                ),
              ]),
              if (!on) ...[
                const SizedBox(height: 14),
                for (final (i, step) in (android
                        ? ['Plug your phone into the PC', 'Turn on USB tethering', 'Your PC shows up above: tap it']
                        : ['Plug your iPhone into the PC', 'Turn on Personal Hotspot in Settings', 'Your PC shows up above: tap it'])
                    .indexed)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(children: [
                      Container(
                        width: 22,
                        height: 22,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(color: t.accentSoft, shape: BoxShape.circle),
                        child: Text('${i + 1}', style: const TextStyle(color: CC.orange, fontSize: 12, fontWeight: FontWeight.w700)),
                      ),
                      const SizedBox(width: 10),
                      Expanded(child: Text(step, style: TextStyle(color: t.text, fontSize: 13.5))),
                    ]),
                  ),
                if (android) ...[
                  const SizedBox(height: 6),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () async {
                        final ok = await openTetherSettings();
                        if (!ok && context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                            content: Text('Open Settings → Network → Hotspot & tethering → USB tethering.'),
                          ));
                        }
                      },
                      icon: const Icon(Icons.settings_ethernet_rounded, size: 20),
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
  const _EmptyHint();

  @override
  Widget build(BuildContext context) {
    final t = Tokens.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Row(children: [
          Icon(Icons.wifi_find_rounded, color: t.muted, size: 28),
          const SizedBox(width: 14),
          Expanded(
            child: Text(
              'Looking for PCs on your Wi-Fi and USB cable. Make sure CarrotCam is open on your computer.',
              style: TextStyle(color: t.muted, height: 1.4),
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
          padding: const EdgeInsets.only(bottom: 12),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  const IconTile(Icons.system_update_outlined, size: 38),
                  const SizedBox(width: 12),
                  Expanded(child: Text('CarrotCam ${u.version} is ready', style: const TextStyle(fontWeight: FontWeight.w700))),
                  if (p == null)
                    FilledButton(
                      style: FilledButton.styleFrom(minimumSize: const Size(0, 38)),
                      onPressed: updater.install,
                      child: const Text('Update'),
                    ),
                ]),
                if (p != null) ...[
                  const SizedBox(height: 12),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(value: p, minHeight: 6),
                  ),
                ],
                if (updater.error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(updater.error!, style: const TextStyle(color: CC.red, fontSize: 12)),
                  ),
              ]),
            ),
          ),
        );
      },
    );
  }
}
