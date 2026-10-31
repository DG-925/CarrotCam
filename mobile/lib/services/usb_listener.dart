import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

import 'discovery.dart';
import 'protocol.dart';

/// A PC that said hello over the USB cable.
class UsbPc {
  UsbPc({required this.id, required this.name, required this.address, required this.port});
  final String id;
  final String name;
  final String address;
  final int port;
}

/// Lets the PC connect to the phone over a USB cable.
///
/// The PC broadcasts a hello every few seconds. When it arrives on the phone's
/// USB tethering interface and the phone is free, the phone answers and the
/// PC opens a WebSocket to it. From then on the session is the same as when
/// the phone connects to the PC.
class UsbListener {
  UsbListener({required this.discovery, required this.deviceId, required this.willAccept, required this.onSocket});

  final Discovery discovery;
  final String Function() deviceId;

  /// Whether to answer this PC now (false while busy or while asking for a code).
  final bool Function(UsbPc pc) willAccept;
  final void Function(WebSocket ws, UsbPc pc) onSocket;

  RawDatagramSocket? _udp;
  HttpServer? _http;
  final Map<String, UsbPc> _hellos = {};

  Future<void> start() async {
    if (_udp != null) return;
    try {
      final udp = await RawDatagramSocket.bind(InternetAddress.anyIPv4, kUsbHelloPort, reuseAddress: true);
      _udp = udp;
      udp.listen((event) {
        if (event != RawSocketEvent.read) return;
        final dg = udp.receive();
        if (dg == null) return;
        final from = dg.address.address;
        if (!discovery.isUsbHost(from)) return; // only over the cable
        final text = utf8.decode(dg.data, allowMalformed: true);
        if (!text.startsWith(kUsbHello)) return;
        try {
          final j = jsonDecode(text.substring(kUsbHello.length).trim()) as Map<String, dynamic>;
          final pc = UsbPc(
            id: j['id'] as String,
            name: (j['name'] ?? 'PC') as String,
            address: from,
            port: (j['port'] as num?)?.toInt() ?? kDefaultPort,
          );
          _hellos[from] = pc;
          if (!willAccept(pc)) return;
          final reply = utf8.encode(jsonEncode({'app': 'carrotcam-phone', 'id': deviceId(), 'port': kPhoneWsPort}));
          udp.send(reply, dg.address, dg.port);
        } catch (_) {}
      });
    } catch (e) {
      debugPrint('USB listener (udp) unavailable: $e');
    }
    try {
      final http = await HttpServer.bind(InternetAddress.anyIPv4, kPhoneWsPort, shared: true);
      _http = http;
      http.listen((req) async {
        final from = req.connectionInfo?.remoteAddress.address ?? '';
        final pc = _hellos[from];
        if (pc == null || !discovery.isUsbHost(from) || !WebSocketTransformer.isUpgradeRequest(req)) {
          req.response.statusCode = HttpStatus.forbidden;
          await req.response.close();
          return;
        }
        try {
          final ws = await WebSocketTransformer.upgrade(req);
          if (!willAccept(pc)) {
            await ws.close(4009, 'busy');
            return;
          }
          onSocket(ws, pc);
        } catch (_) {}
      });
    } catch (e) {
      debugPrint('USB listener (ws) unavailable: $e');
    }
  }

  Future<void> stop() async {
    _udp?.close();
    _udp = null;
    await _http?.close(force: true);
    _http = null;
  }
}
