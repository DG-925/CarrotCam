import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:bonsoir/bonsoir.dart';
import 'package:flutter/foundation.dart';

import 'protocol.dart';

class DiscoveredPc {
  DiscoveredPc({required this.id, required this.name, required this.host, required this.port, this.usb = false});
  final String id;
  final String name;
  final String host;
  final int port;

  /// Reached over a USB cable (USB tethering) instead of Wi-Fi.
  final bool usb;
}

/// Network interfaces a phone creates when it shares its connection over a
/// USB cable: Android USB tethering (rndis0 / usb0 / ncm0) and the iPhone
/// Personal Hotspot bridge.
final _usbInterface = RegExp(r'^(rndis|usb|ncm|bridge)\d*$', caseSensitive: false);

/// Finds CarrotCam PCs on the local network using mDNS (Bonjour/NSD) and a
/// UDP broadcast fallback for networks that block multicast.
class Discovery extends ChangeNotifier {
  final Map<String, DiscoveredPc> _found = {};
  BonsoirDiscovery? _mdns;
  StreamSubscription? _mdnsSub;
  RawDatagramSocket? _udp;
  Timer? _probeTimer;
  bool running = false;

  /// "a.b.c" prefixes of this phone's USB-tethering interfaces.
  Set<String> _usbSubnets = {};

  /// True while the phone is plugged in with USB tethering turned on.
  bool get usbActive => _usbSubnets.isNotEmpty;

  /// PCs found over a USB cable come first.
  List<DiscoveredPc> get pcs => _found.values.toList()
    ..sort((a, b) => a.usb != b.usb ? (a.usb ? -1 : 1) : a.name.compareTo(b.name));

  static String _subnet(String ip) => ip.split('.').take(3).join('.');

  bool isUsbHost(String host) => _usbSubnets.contains(_subnet(host));

  /// Puts addresses reachable over the USB cable first.
  List<String> orderHosts(Iterable<String> hosts) {
    final list = hosts.toSet().toList();
    list.sort((a, b) => (isUsbHost(a) ? 0 : 1) - (isUsbHost(b) ? 0 : 1));
    return list;
  }

  Future<void> start() async {
    if (running) return;
    running = true;
    _startMdns();
    await _startUdp();
  }

  Future<void> _startMdns() async {
    try {
      final d = BonsoirDiscovery(type: kMdnsType, printLogs: false);
      _mdns = d;
      await d.initialize();
      _mdnsSub = d.eventStream?.listen((event) {
        switch (event) {
          case BonsoirDiscoveryServiceFoundEvent():
            event.service.resolve(d.serviceResolver);
          case BonsoirDiscoveryServiceResolvedEvent():
            final s = event.service;
            final host = s.hostAddresses.firstWhere((a) => !a.contains(':'), orElse: () => s.hostAddress ?? '');
            if (host.isEmpty) return;
            final id = s.attributes['id'] ?? s.name;
            _add(DiscoveredPc(
              id: id,
              name: s.attributes['name'] ?? s.name.replaceFirst('CarrotCam ', ''),
              host: host,
              port: s.port,
              usb: isUsbHost(host),
            ));
          case BonsoirDiscoveryServiceLostEvent():
            final id = event.service.attributes['id'];
            if (id != null && _found.remove(id) != null) notifyListeners();
          default:
            break;
        }
      });
      await d.start();
    } catch (e) {
      debugPrint('mDNS discovery failed: $e');
    }
  }

  Future<void> _startUdp() async {
    try {
      final socket = await RawDatagramSocket.bind(InternetAddress.anyIPv4, 0);
      socket.broadcastEnabled = true;
      _udp = socket;
      socket.listen((event) {
        if (event != RawSocketEvent.read) return;
        final dg = socket.receive();
        if (dg == null) return;
        try {
          final j = jsonDecode(utf8.decode(dg.data)) as Map<String, dynamic>;
          if (j['app'] != 'carrotcam') return;
          _add(DiscoveredPc(
            id: j['id'] as String,
            name: (j['name'] ?? 'PC') as String,
            host: dg.address.address,
            port: (j['port'] ?? kDefaultPort) as int,
            usb: isUsbHost(dg.address.address),
          ));
        } catch (_) {}
      });
      void probe() {
        final data = utf8.encode(kDiscoveryProbe);
        try {
          socket.send(data, InternetAddress('255.255.255.255'), kDiscoveryPort);
        } catch (_) {}
        _subnetBroadcasts().then((list) {
          for (final b in list) {
            try {
              socket.send(data, b, kDiscoveryPort);
            } catch (_) {}
          }
        });
      }

      probe();
      _probeTimer = Timer.periodic(const Duration(seconds: 3), (_) => probe());
    } catch (e) {
      debugPrint('UDP discovery failed: $e');
    }
  }

  Future<List<InternetAddress>> _subnetBroadcasts() async {
    final out = <InternetAddress>[];
    final usb = <String>{};
    try {
      for (final ni in await NetworkInterface.list(type: InternetAddressType.IPv4)) {
        for (final a in ni.addresses) {
          final p = a.rawAddress;
          out.add(InternetAddress('${p[0]}.${p[1]}.${p[2]}.255'));
          if (_usbInterface.hasMatch(ni.name)) usb.add(_subnet(a.address));
        }
      }
    } catch (_) {}
    if (!setEquals(usb, _usbSubnets)) {
      _usbSubnets = usb;
      // the cable was plugged in or out: forget PCs found over it
      if (usb.isEmpty) _found.removeWhere((_, pc) => pc.usb);
      notifyListeners();
    }
    return out;
  }

  void _add(DiscoveredPc pc) {
    final prev = _found[pc.id];
    if (prev != null && prev.host == pc.host && prev.port == pc.port && prev.usb == pc.usb) return;
    // the same PC answers over Wi-Fi and the cable: keep the cable
    if (prev != null && prev.usb && !pc.usb && usbActive) return;
    _found[pc.id] = pc;
    notifyListeners();
  }

  Future<void> stop() async {
    running = false;
    _probeTimer?.cancel();
    _probeTimer = null;
    await _mdnsSub?.cancel();
    _mdnsSub = null;
    try {
      await _mdns?.stop();
    } catch (_) {}
    _mdns = null;
    _udp?.close();
    _udp = null;
  }
}
