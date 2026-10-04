import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import '../main.dart';
import '../services/link.dart';
import '../services/protocol.dart';
import '../theme.dart';

class CameraScreen extends StatefulWidget {
  const CameraScreen({super.key});

  @override
  State<CameraScreen> createState() => _CameraScreenState();
}

class _CameraScreenState extends State<CameraScreen> with WidgetsBindingObserver {
  bool _stealth = false;
  Offset? _focusPoint;
  Timer? _focusTimer;
  double _pinchStart = 1;
  bool _wasStreaming = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    link.addListener(_onLink);
    SystemChrome.setSystemUIOverlayStyle(SystemUiOverlayStyle.light);
    // Webcams are landscape: lock it so the stream is upright even with
    // auto-rotate off (mount the phone sideways). Rotate on the PC if needed.
    SystemChrome.setPreferredOrientations([DeviceOrientation.landscapeLeft, DeviceOrientation.landscapeRight]);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    link.removeListener(_onLink);
    _focusTimer?.cancel();
    SystemChrome.setPreferredOrientations(DeviceOrientation.values);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    link.disconnect();
    link.releaseCamera();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState s) {
    // Android pauses the camera in the background; reopen it when we're back.
    if (s == AppLifecycleState.resumed && link.isConnected) link.openCamera(deviceId: link.cameraId);
  }

  void _onLink() {
    if (!mounted) return;
    if (link.isStreaming && !_wasStreaming) {
      HapticFeedback.mediumImpact();
      if (settings.stealthAfterConnect) setState(() => _stealth = true);
    }
    _wasStreaming = link.isStreaming;
  }

  void _tapFocus(TapUpDetails d, Size size) {
    final p = d.localPosition;
    link.focusAt(p.dx / size.width, p.dy / size.height);
    setState(() => _focusPoint = p);
    _focusTimer?.cancel();
    _focusTimer = Timer(const Duration(milliseconds: 1200), () {
      if (mounted) setState(() => _focusPoint = null);
    });
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: Colors.black,
        body: ListenableBuilder(
          listenable: link,
          builder: (context, _) {
            return Stack(fit: StackFit.expand, children: [
              LayoutBuilder(
                builder: (context, c) => GestureDetector(
                  onTapUp: (d) => _tapFocus(d, c.biggest),
                  onScaleStart: (_) => _pinchStart = link.zoom,
                  onScaleUpdate: (d) {
                    if (d.pointerCount >= 2) link.setZoom(_pinchStart * d.scale);
                  },
                  child: RTCVideoView(
                    link.renderer,
                    objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                    mirror: link.front,
                  ),
                ),
              ),
              if (_focusPoint != null)
                Positioned(
                  left: _focusPoint!.dx - 36,
                  top: _focusPoint!.dy - 36,
                  child: IgnorePointer(
                    child: Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(color: CC.orange, width: 2.5),
                      ),
                    ).animate().scaleXY(begin: 1.5, end: 1, duration: 260.ms, curve: Curves.easeOutBack).fadeIn(),
                  ),
                ),
              _TopBar(onStealth: () => setState(() => _stealth = true)),
              _ConnectionOverlay(key: ValueKey(link.state)),
              _BottomBar(onRemote: () => _openRemote(context)),
              if (_stealth)
                GestureDetector(
                  onTap: () => setState(() => _stealth = false),
                  child: Container(
                    color: Colors.black,
                    alignment: Alignment.center,
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      Container(
                        width: 12,
                        height: 12,
                        decoration: BoxDecoration(
                          color: link.isStreaming ? CC.green : CC.orange,
                          shape: BoxShape.circle,
                        ),
                      ).animate(onPlay: (c) => c.repeat(reverse: true)).fade(begin: 0.3, end: 1, duration: 1200.ms),
                      const SizedBox(height: 14),
                      Text(
                        link.isStreaming ? 'Streaming to ${link.pcName}' : 'Standing by',
                        style: TextStyle(color: Colors.white.withValues(alpha: 0.45)),
                      ),
                      const SizedBox(height: 4),
                      Text('Tap to wake', style: TextStyle(color: Colors.white.withValues(alpha: 0.25), fontSize: 12)),
                    ]),
                  ).animate().fadeIn(duration: 400.ms),
                ),
            ]);
          },
        ),
      ),
    );
  }

  void _openRemote(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _RemoteSheet(),
    );
  }
}

class _Glass extends StatelessWidget {
  const _Glass({required this.child, this.padding = const EdgeInsets.symmetric(horizontal: 12, vertical: 8), this.radius = 18});
  final Widget child;
  final EdgeInsets padding;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
      ),
      child: child,
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({required this.onStealth});
  final VoidCallback onStealth;

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (link.state) {
      LinkState.streaming => ('Live on ${link.pcName}', CC.green),
      LinkState.connected => (link.remote.active ? 'Starting…' : 'Connected · standby', CC.orange),
      LinkState.connecting => ('Connecting…', CC.orange),
      LinkState.reconnecting => ('Reconnecting…', CC.orange),
      LinkState.error => ('Not connected', CC.red),
      LinkState.idle => ('Not connected', Colors.grey),
    };
    final s = link.stats;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
        child: Align(
          alignment: Alignment.topCenter,
          child: Row(children: [
            _Glass(
              padding: EdgeInsets.zero,
              radius: 24,
              child: IconButton(
                icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ),
            const SizedBox(width: 8),
            Flexible(
              child: _Glass(
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Container(
                    width: 9,
                    height: 9,
                    decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                  ).animate(onPlay: (c) => c.repeat(reverse: true)).fade(begin: 0.4, end: 1, duration: 900.ms),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(label,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13)),
                  ),
                ]),
              ),
            ),
            const Spacer(),
            if (link.isStreaming && s.width > 0)
              _Glass(
                child: Text(
                  '${s.height}p · ${s.fps}fps · ${s.mbps.toStringAsFixed(1)} Mbps',
                  style: const TextStyle(color: Colors.white, fontSize: 11.5, fontFamily: 'monospace'),
                ),
              ),
            const SizedBox(width: 8),
            _Glass(
              padding: EdgeInsets.zero,
              radius: 24,
              child: IconButton(
                tooltip: 'Stealth mode (black screen)',
                icon: const Icon(Icons.dark_mode_rounded, color: Colors.white),
                onPressed: onStealth,
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

class _ConnectionOverlay extends StatelessWidget {
  const _ConnectionOverlay({super.key});

  @override
  Widget build(BuildContext context) {
    final st = link.state;
    Widget? child;
    if (st == LinkState.connecting || st == LinkState.reconnecting) {
      child = Column(mainAxisSize: MainAxisSize.min, children: [
        const SizedBox(width: 34, height: 34, child: CircularProgressIndicator(color: CC.orange, strokeWidth: 3)),
        const SizedBox(height: 14),
        Text(st == LinkState.reconnecting ? 'Reconnecting to ${link.pcName}…' : 'Connecting to ${link.pcName}…',
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
      ]);
    } else if (st == LinkState.error) {
      child = Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.link_off_rounded, color: Colors.white, size: 40),
        const SizedBox(height: 12),
        Text(link.error ?? 'Connection failed',
            textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
        const SizedBox(height: 16),
        FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Back')),
      ]);
    } else if (st == LinkState.connected && !link.remote.active) {
      child = Column(mainAxisSize: MainAxisSize.min, children: [
        const Text('Connected!', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
        const SizedBox(height: 6),
        Text('Another camera is selected on the PC.', style: TextStyle(color: Colors.white.withValues(alpha: 0.8))),
        const SizedBox(height: 14),
        FilledButton.icon(
          onPressed: () => link.sendRemote('useMe'),
          icon: const Icon(Icons.videocam_rounded),
          label: const Text('Use this phone'),
        ),
      ]);
    }
    return IgnorePointer(
      ignoring: child == null,
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 300),
        child: child == null
            ? const SizedBox.shrink()
            : Center(
                key: ValueKey(st),
                child: _Glass(padding: const EdgeInsets.all(24), radius: 28, child: child),
              ),
      ),
    );
  }
}

class _BottomBar extends StatelessWidget {
  const _BottomBar({required this.onRemote});
  final VoidCallback onRemote;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.bottomCenter,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            _Glass(
              radius: 24,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              child: Row(children: [
                const Icon(Icons.zoom_out_rounded, color: Colors.white70, size: 18),
                Expanded(
                  child: Slider(
                    value: link.zoom.clamp(1, link.maxZoom),
                    min: 1,
                    max: link.maxZoom,
                    onChanged: link.setZoom,
                  ),
                ),
                SizedBox(
                  width: 38,
                  child: Text('${link.zoom.toStringAsFixed(1)}×', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12)),
                ),
              ]),
            ),
            const SizedBox(height: 12),
            Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
              _RoundButton(
                icon: link.torch ? Icons.flashlight_on_rounded : Icons.flashlight_off_rounded,
                active: link.torch,
                enabled: link.hasTorch,
                label: 'Torch',
                onTap: () => link.setTorch(!link.torch),
              ),
              _RoundButton(icon: Icons.cameraswitch_rounded, label: 'Flip', onTap: link.switchCamera),
              _RoundButton(icon: Icons.auto_awesome_rounded, label: 'Studio', big: true, onTap: onRemote, active: true),
              _RoundButton(
                icon: Icons.photo_camera_rounded,
                label: 'Snap',
                enabled: link.isConnected,
                onTap: () {
                  HapticFeedback.lightImpact();
                  link.sendRemote('snapshot');
                },
              ),
              _RoundButton(
                icon: Icons.camera_rounded,
                label: 'Lens',
                enabled: link.cameras.length > 2,
                onTap: () => _pickLens(context),
              ),
            ]),
          ]),
        ),
      ),
    );
  }

  void _pickLens(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          for (final c in link.cameras)
            ListTile(
              leading: Icon(c.front ? Icons.face_rounded : Icons.camera_rear_rounded, color: CC.orange),
              title: Text(c.label),
              trailing: c.id == link.cameraId ? const Icon(Icons.check_rounded, color: CC.orange) : null,
              onTap: () {
                Navigator.pop(ctx);
                link.openCamera(deviceId: c.id);
              },
            ),
          const SizedBox(height: 12),
        ]),
      ),
    );
  }
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.active = false,
    this.enabled = true,
    this.big = false,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool active;
  final bool enabled;
  final bool big;

  @override
  Widget build(BuildContext context) {
    final size = big ? 66.0 : 54.0;
    return Opacity(
      opacity: enabled ? 1 : 0.4,
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        GestureDetector(
          onTap: enabled ? onTap : null,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            width: size,
            height: size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: active && big ? CC.gradient : null,
              color: active && !big ? CC.orange : Colors.black.withValues(alpha: 0.45),
              border: Border.all(color: Colors.white.withValues(alpha: big ? 0 : 0.14)),
              boxShadow: big ? [BoxShadow(color: CC.orange.withValues(alpha: 0.45), blurRadius: 20, offset: const Offset(0, 6))] : null,
            ),
            child: Icon(icon, color: Colors.white, size: big ? 30 : 24),
          ),
        ),
        const SizedBox(height: 6),
        Text(label, style: const TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w600)),
      ]),
    );
  }
}

/// Remote control for the PC effects.
class _RemoteSheet extends StatelessWidget {
  const _RemoteSheet();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.62,
      maxChildSize: 0.92,
      minChildSize: 0.35,
      builder: (context, scroll) => ListenableBuilder(
        listenable: link,
        builder: (context, _) {
          final r = link.remote;
          Widget section(String t) => Padding(
                padding: const EdgeInsets.fromLTRB(4, 18, 4, 10),
                child: Text(t, style: TextStyle(color: scheme.outline, fontWeight: FontWeight.w800, letterSpacing: 1.1, fontSize: 12)),
              );
          return ListView(
            controller: scroll,
            padding: const EdgeInsets.fromLTRB(18, 0, 18, 30),
            children: [
              Row(children: [
                const Text('Studio remote', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
                const Spacer(),
                if (!link.isConnected) const Text('Not connected', style: TextStyle(color: CC.red)),
              ]),
              const SizedBox(height: 4),
              Text('Control CarrotCam on ${link.pcName.isEmpty ? 'your PC' : link.pcName} from here.', style: TextStyle(color: scheme.outline)),
              section('QUICK LOOKS'),
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final (id, label, icon) in kPresets)
                  ActionChip(
                    avatar: Icon(icon, size: 18, color: CC.orange),
                    label: Text(label),
                    onPressed: () => link.sendRemote('preset', id),
                  ),
              ]),
              section('EFFECTS'),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                childAspectRatio: 2.6,
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                children: [
                  _Toggle(icon: Icons.blur_on_rounded, label: 'Blur background', on: r.background == 'blur', onTap: () => link.sendRemote('background', r.background == 'blur' ? 'none' : 'blur')),
                  _Toggle(icon: Icons.center_focus_strong_rounded, label: 'Auto framing', on: r.autoFrame, onTap: () => link.sendRemote('autoFrame', !r.autoFrame)),
                  _Toggle(icon: Icons.highlight_rounded, label: 'Spotlight', on: r.spotlight, onTap: () => link.sendRemote('spotlight', !r.spotlight)),
                  _Toggle(icon: Icons.face_retouching_natural_rounded, label: 'Retouch', on: r.retouch, onTap: () => link.sendRemote('retouch', !r.retouch)),
                ],
              ),
              section('FILTER'),
              SizedBox(
                height: 44,
                child: ListView(scrollDirection: Axis.horizontal, children: [
                  for (final (id, label) in kFilters)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(label),
                        selected: r.filter == id,
                        selectedColor: CC.orange,
                        labelStyle: TextStyle(color: r.filter == id ? Colors.white : null, fontWeight: FontWeight.w600),
                        onSelected: (_) => link.sendRemote('filter', id),
                      ),
                    ),
                ]),
              ),
              section('REACTIONS'),
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                for (final (id, label, icon) in kReactions)
                  Tooltip(
                    message: label,
                    child: InkResponse(
                      onTap: () {
                        HapticFeedback.selectionClick();
                        link.sendRemote('reaction', id);
                      },
                      radius: 30,
                      child: Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(color: CC.orange.withValues(alpha: 0.14), shape: BoxShape.circle),
                        child: Icon(icon, color: CC.orange),
                      ),
                    ),
                  ),
              ]),
              section('PRIVACY'),
              Row(children: [
                Expanded(child: _Toggle(icon: Icons.visibility_off_rounded, label: 'Blur all', on: r.privacy == 'blur', onTap: () => link.sendRemote('privacy', 'blur'))),
                const SizedBox(width: 10),
                Expanded(child: _Toggle(icon: Icons.coffee_rounded, label: 'Be right back', on: r.privacy == 'brb', onTap: () => link.sendRemote('privacy', 'brb'))),
              ]),
              section('PC'),
              Row(children: [
                Expanded(
                  child: _Toggle(icon: Icons.fiber_manual_record_rounded, label: r.recording ? 'Stop recording' : 'Record', on: r.recording, onTap: () => link.sendRemote('record')),
                ),
                const SizedBox(width: 10),
                Expanded(child: _Toggle(icon: Icons.videocam_rounded, label: 'Virtual cam', on: r.vcam, onTap: () => link.sendRemote('vcam'))),
              ]),
            ],
          );
        },
      ),
    );
  }
}

class _Toggle extends StatelessWidget {
  const _Toggle({required this.icon, required this.label, required this.on, required this.onTap});
  final IconData icon;
  final String label;
  final bool on;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: on ? CC.orange : scheme.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () {
          HapticFeedback.selectionClick();
          onTap();
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(children: [
            Icon(icon, color: on ? Colors.white : CC.orange),
            const SizedBox(width: 10),
            Expanded(
              child: Text(label,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontWeight: FontWeight.w700, color: on ? Colors.white : scheme.onSurface)),
            ),
          ]),
        ),
      ),
    );
  }
}
