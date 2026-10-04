import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:battery_plus/battery_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import 'protocol.dart';
import 'settings.dart';

enum LinkState { idle, connecting, connected, streaming, reconnecting, error }

class ConnectTarget {
  ConnectTarget({required this.hosts, required this.port, required this.name, this.id, this.code, this.token});
  final List<String> hosts;
  final int port;
  final String name;
  final String? id;
  final String? code;
  final String? token;
}

class CameraInfo {
  CameraInfo(this.id, this.label, this.front);
  final String id;
  final String label;
  final bool front;
}

class StreamStats {
  double mbps = 0;
  int fps = 0;
  int width = 0;
  int height = 0;
  String limitation = 'none';
  String codec = '';
}

/// The phone side of a CarrotCam session: WebSocket signaling to the PC and a
/// WebRTC video sender. Media goes peer-to-peer over the LAN.
class CarrotLink extends ChangeNotifier {
  CarrotLink(this.settings);

  final AppSettings settings;
  final RTCVideoRenderer renderer = RTCVideoRenderer();
  final Battery _battery = Battery();

  LinkState state = LinkState.idle;
  String? error;
  String pcName = '';
  ConnectTarget? _target;
  WebSocket? _ws;
  String? _connectedHost;
  bool _closing = false;
  Timer? _statusTimer;
  Timer? _statsTimer;
  Timer? _reconnectTimer;
  int _reconnectAttempts = 0;

  MediaStream? _stream;
  RTCPeerConnection? _pc;
  RTCRtpSender? _sender;
  final List<RTCIceCandidate> _pendingIce = [];
  Map<String, dynamic> _config = {'width': 1920, 'height': 1080, 'fps': 30, 'bitrate': 10000};

  bool front = false;
  bool torch = false;
  bool hasTorch = false;
  double zoom = 1;
  double maxZoom = 8;
  String? cameraId;
  List<CameraInfo> cameras = [];
  RemoteState remote = RemoteState();
  StreamStats stats = StreamStats();
  bool _rendererReady = false;

  bool get isStreaming => state == LinkState.streaming;
  bool get isConnected => state == LinkState.connected || state == LinkState.streaming;

  // ---------------------------------------------------------------- camera
  Future<void> initRenderer() async {
    if (_rendererReady) return;
    await renderer.initialize();
    _rendererReady = true;
  }

  Future<void> openCamera({String? deviceId}) async {
    await initRenderer();
    final old = _stream;
    final w = _config['width'] as int;
    final h = _config['height'] as int;
    final fps = _config['fps'] as int;
    // plain numbers: flutter_webrtc's Android parser ignores {ideal: x} maps
    final video = <String, dynamic>{'width': w, 'height': h, 'frameRate': fps};
    if (deviceId != null) {
      video['deviceId'] = deviceId;
      video['optional'] = [
        {'sourceId': deviceId}
      ];
    } else {
      video['facingMode'] = front ? 'user' : 'environment';
    }
    // Fully release the previous camera first: flutter_webrtc reuses a still
    // registered capturer (ignoring the new size/fps) and most phones can't
    // open two cameras at once anyway.
    if (old != null) {
      renderer.srcObject = null;
      _stream = null;
      for (final t in old.getTracks()) {
        await t.stop();
      }
      await old.dispose();
    }
    final stream = await navigator.mediaDevices.getUserMedia({'audio': false, 'video': video});
    _stream = stream;
    renderer.srcObject = stream;
    if (deviceId != null) {
      cameraId = deviceId;
      front = cameras.firstWhere((c) => c.id == deviceId, orElse: () => CameraInfo(deviceId, '', front)).front;
    }
    torch = false;
    zoom = 1;
    final track = stream.getVideoTracks().first;
    try {
      hasTorch = await track.hasTorch();
    } catch (_) {
      hasTorch = false;
    }
    if (_sender != null) await _sender!.replaceTrack(track);
    await _loadCameras();
    notifyListeners();
    _sendStatus();
  }

  Future<void> _loadCameras() async {
    if (cameras.isNotEmpty) return;
    try {
      final list = await Helper.cameras;
      var back = 0, frontN = 0;
      cameras = list.map((d) {
        final l = d.label.toLowerCase();
        final isFront = l.contains('front') || l.contains('user');
        final n = isFront ? ++frontN : ++back;
        final name = isFront ? (n == 1 ? 'Front camera' : 'Front camera $n') : (n == 1 ? 'Main camera' : 'Back camera $n');
        return CameraInfo(d.deviceId, name, isFront);
      }).toList();
    } catch (_) {}
  }

  Future<void> switchCamera() async {
    final track = _stream?.getVideoTracks().firstOrNull;
    if (track == null) return;
    try {
      await Helper.switchCamera(track);
      front = !front;
      torch = false;
      zoom = 1;
      hasTorch = !front && await track.hasTorch().catchError((_) => false);
      cameraId = null;
    } catch (e) {
      debugPrint('switch camera failed: $e');
    }
    notifyListeners();
    _sendStatus();
  }

  Future<void> setTorch(bool on) async {
    final track = _stream?.getVideoTracks().firstOrNull;
    if (track == null || !hasTorch) return;
    try {
      await track.setTorch(on);
      torch = on;
    } catch (_) {}
    notifyListeners();
    _sendStatus();
  }

  Future<void> setZoom(double z) async {
    final track = _stream?.getVideoTracks().firstOrNull;
    if (track == null) return;
    zoom = z.clamp(1, maxZoom);
    try {
      await Helper.setZoom(track, zoom);
    } catch (_) {}
    notifyListeners();
  }

  Future<void> focusAt(double x, double y) async {
    final track = _stream?.getVideoTracks().firstOrNull;
    if (track == null) return;
    try {
      await Helper.setFocusPoint(track, Point(x.clamp(0, 1), y.clamp(0, 1)));
      await Helper.setExposurePoint(track, Point(x.clamp(0, 1), y.clamp(0, 1)));
    } catch (_) {}
  }

  // ---------------------------------------------------------------- session
  Future<void> connect(ConnectTarget target) async {
    _reconnectTimer?.cancel();
    _closing = false;
    _target = target;
    pcName = target.name;
    error = null;
    state = state == LinkState.reconnecting ? LinkState.reconnecting : LinkState.connecting;
    notifyListeners();

    WebSocket? ws;
    for (final host in target.hosts) {
      try {
        ws = await WebSocket.connect('ws://$host:${target.port}').timeout(const Duration(seconds: 4));
        _connectedHost = host;
        break;
      } catch (_) {}
    }
    if (ws == null) {
      _fail('Could not reach ${target.name}. Make sure CarrotCam is open on the PC and you are on the same Wi-Fi.');
      return;
    }
    _ws = ws;
    ws.pingInterval = const Duration(seconds: 5);
    ws.listen(_onMessage, onDone: _onClosed, onError: (_) => _onClosed(), cancelOnError: true);

    final app = await PackageInfo.fromPlatform();
    _send({
      't': 'hello',
      'v': kProtocolVersion,
      'info': {
        'id': settings.deviceId,
        'name': settings.deviceName,
        'model': settings.model,
        'platform': Platform.operatingSystem,
        'app': app.version,
        'transport': await _transportFor(_connectedHost),
      },
      if (target.code != null) 'code': target.code,
      if (target.token != null) 'token': target.token,
    });
  }

  /// 'usb' when the PC is reached through the phone's USB tethering interface.
  static Future<String> _transportFor(String? host) async {
    if (host == null) return 'wifi';
    final prefix = host.split('.').take(3).join('.');
    try {
      for (final ni in await NetworkInterface.list(type: InternetAddressType.IPv4)) {
        if (!RegExp(r'^(rndis|usb|ncm|bridge)\d*$', caseSensitive: false).hasMatch(ni.name)) continue;
        if (ni.addresses.any((a) => a.address.startsWith('$prefix.'))) return 'usb';
      }
    } catch (_) {}
    return 'wifi';
  }

  void _fail(String message) {
    final known = _target?.id != null ? settings.pcs[_target!.id] : null;
    if ((state == LinkState.reconnecting || state == LinkState.streaming || state == LinkState.connected) && known != null && !_closing) {
      _scheduleReconnect();
      return;
    }
    state = LinkState.error;
    error = message;
    notifyListeners();
  }

  void _scheduleReconnect() {
    final known = _target?.id != null ? settings.pcs[_target!.id] : null;
    if (known == null || _closing) return;
    state = LinkState.reconnecting;
    notifyListeners();
    _reconnectAttempts++;
    final delay = Duration(milliseconds: min(15000, 1000 * pow(1.6, _reconnectAttempts).round()));
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(delay, () {
      final hosts = [...known.hosts];
      connect(ConnectTarget(hosts: hosts, port: known.port, name: known.name, id: known.id, token: known.token));
    });
  }

  void _onClosed() {
    _ws = null;
    _statusTimer?.cancel();
    _closePeer();
    if (_closing) {
      state = LinkState.idle;
      notifyListeners();
      return;
    }
    if (state == LinkState.error) return;
    _fail('Connection to ${pcName.isEmpty ? 'the PC' : pcName} was lost.');
  }

  Future<void> _onMessage(dynamic raw) async {
    Map<String, dynamic> msg;
    try {
      msg = jsonDecode(raw as String) as Map<String, dynamic>;
    } catch (_) {
      return;
    }
    switch (msg['t']) {
      case 'welcome':
        _reconnectAttempts = 0;
        pcName = (msg['pcName'] ?? pcName) as String;
        final id = (msg['pcId'] ?? _target?.id ?? '') as String;
        final hosts = <String>{?_connectedHost, ...?_target?.hosts}.toList();
        await settings.savePc(KnownPc(
          id: id,
          name: pcName,
          hosts: hosts,
          port: _target?.port ?? kDefaultPort,
          token: msg['token'] as String,
          lastUsed: DateTime.now().millisecondsSinceEpoch,
        ));
        _target = ConnectTarget(hosts: hosts, port: _target?.port ?? kDefaultPort, name: pcName, id: id, token: msg['token'] as String);
        state = LinkState.connected;
        error = null;
        notifyListeners();
        if (_stream == null) {
          try {
            await openCamera();
          } catch (e) {
            error = 'Camera unavailable: $e';
          }
        }
        _statusTimer?.cancel();
        _statusTimer = Timer.periodic(const Duration(seconds: 5), (_) => _sendStatus());
        _sendStatus();
        if (settings.keepAwake) WakelockPlus.enable();
      case 'denied':
        final reason = msg['reason'];
        _closing = true;
        if (reason == 'bad_code' && _target?.token != null && _target?.id != null) {
          await settings.forgetPc(_target!.id!);
        }
        state = LinkState.error;
        error = switch (reason) {
          'bad_code' => 'Wrong pairing code. Check the code shown on the PC.',
          'version' => 'Please update CarrotCam on both devices.',
          'busy' => 'Too many attempts. Wait a minute and try again.',
          _ => 'The PC refused the connection.',
        };
        notifyListeners();
      case 'start':
        await _startStream(Map<String, dynamic>.from(msg['config'] as Map));
      case 'stop':
        _closePeer();
        if (state == LinkState.streaming) state = LinkState.connected;
        notifyListeners();
      case 'answer':
        if (msg['sid'] != null && msg['sid'] != _streamSeq) return; // answer to an older attempt
        await _pc?.setRemoteDescription(RTCSessionDescription(msg['sdp'] as String, 'answer'));
        for (final c in _pendingIce) {
          await _pc?.addCandidate(c);
        }
        _pendingIce.clear();
      case 'ice':
        if (msg['sid'] != null && msg['sid'] != _streamSeq) return;
        final c = RTCIceCandidate(msg['candidate'] as String, msg['sdpMid'] as String?, msg['sdpMLineIndex'] as int?);
        if (_pc != null && (await _pc!.getRemoteDescription()) != null) {
          await _pc!.addCandidate(c);
        } else {
          _pendingIce.add(c);
        }
      case 'cmd':
        await _onCommand(msg['action'] as String, msg['value']);
      case 'state':
        remote = RemoteState.fromJson(Map<String, dynamic>.from(msg['state'] as Map));
        notifyListeners();
      case 'ping':
        _send({'t': 'pong'});
    }
  }

  Future<void> _onCommand(String action, dynamic value) async {
    switch (action) {
      case 'switchCamera':
        await switchCamera();
      case 'torch':
        await setTorch(value == true);
      case 'zoom':
        await setZoom((value as num).toDouble());
      case 'camera':
        await openCamera(deviceId: value as String);
      case 'focus':
        final m = Map<String, dynamic>.from(value as Map);
        await focusAt((m['x'] as num).toDouble(), (m['y'] as num).toDouble());
    }
  }

  int _streamSeq = 0;

  Future<void> _startStream(Map<String, dynamic> config) async {
    final sid = ++_streamSeq;
    final changed = config['width'] != _config['width'] || config['height'] != _config['height'] || config['fps'] != _config['fps'];
    _config = config;
    _closePeer();
    if (_stream == null || changed) {
      try {
        await openCamera(deviceId: cameraId);
      } catch (e) {
        error = 'Camera unavailable: $e';
        notifyListeners();
        return;
      }
    }
    final stream = _stream!;
    final pc = await createPeerConnection({
      'iceServers': [],
      'sdpSemantics': 'unified-plan',
      'bundlePolicy': 'max-bundle',
    });
    _pc = pc;
    pc.onIceCandidate = (c) {
      if (c.candidate == null) return;
      _send({'t': 'ice', 'sid': sid, 'candidate': c.candidate, 'sdpMid': c.sdpMid, 'sdpMLineIndex': c.sdpMLineIndex});
    };
    pc.onConnectionState = (s) {
      if (pc != _pc) return;
      if (s == RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
        state = LinkState.streaming;
        if (settings.keepAwake) WakelockPlus.enable();
        notifyListeners();
      } else if (s == RTCPeerConnectionState.RTCPeerConnectionStateFailed) {
        state = LinkState.connected;
        notifyListeners();
      }
    };
    final track = stream.getVideoTracks().first;
    _sender = await pc.addTrack(track, stream);

    // bitrate / framerate: keep motion smooth, let resolution adapt first
    try {
      final params = _sender!.parameters;
      final enc = (params.encodings == null || params.encodings!.isEmpty) ? [RTCRtpEncoding()] : params.encodings!;
      enc[0].maxBitrate = (config['bitrate'] as int) * 1000;
      enc[0].maxFramerate = config['fps'] as int;
      enc[0].active = true;
      params.encodings = enc;
      params.degradationPreference = RTCDegradationPreference.MAINTAIN_FRAMERATE;
      await _sender!.setParameters(params);
    } catch (e) {
      debugPrint('setParameters failed: $e');
    }

    final offer = await pc.createOffer({});
    await pc.setLocalDescription(offer);
    if (sid != _streamSeq) return; // a newer start request replaced this one
    _send({'t': 'offer', 'sid': sid, 'sdp': offer.sdp});
    _statsTimer?.cancel();
    _statsTimer = Timer.periodic(const Duration(seconds: 2), (_) => _pollStats());
  }

  int _lastBytes = 0;
  int _lastTs = 0;
  Future<void> _pollStats() async {
    final pc = _pc;
    if (pc == null) return;
    try {
      final reports = await pc.getStats();
      for (final r in reports) {
        if (r.type == 'outbound-rtp' && r.values['kind'] == 'video') {
          final bytes = (r.values['bytesSent'] as num?)?.toInt() ?? 0;
          final ts = DateTime.now().millisecondsSinceEpoch;
          if (_lastTs > 0 && ts > _lastTs) stats.mbps = (bytes - _lastBytes) * 8 / ((ts - _lastTs) * 1000);
          _lastBytes = bytes;
          _lastTs = ts;
          stats.fps = (r.values['framesPerSecond'] as num?)?.round() ?? stats.fps;
          stats.width = (r.values['frameWidth'] as num?)?.toInt() ?? stats.width;
          stats.height = (r.values['frameHeight'] as num?)?.toInt() ?? stats.height;
          stats.limitation = (r.values['qualityLimitationReason'] ?? 'none').toString();
        }
      }
      notifyListeners();
    } catch (_) {}
  }

  void _closePeer() {
    _statsTimer?.cancel();
    _statsTimer = null;
    _sender = null;
    _pendingIce.clear();
    final pc = _pc;
    _pc = null;
    pc?.close();
    stats = StreamStats();
    _lastBytes = 0;
    _lastTs = 0;
  }

  Future<void> _sendStatus() async {
    if (_ws == null) return;
    int? level;
    bool? charging;
    try {
      level = await _battery.batteryLevel;
      final s = await _battery.batteryState;
      charging = s == BatteryState.charging || s == BatteryState.full;
    } catch (_) {}
    _send({
      't': 'status',
      'status': {
        'battery': ?level,
        'charging': ?charging,
        'facing': front ? 'front' : 'back',
        'torch': torch,
        'zoom': zoom,
        'maxZoom': maxZoom,
        'width': stats.width,
        'height': stats.height,
        'fps': stats.fps,
        'cameras': cameras.map((c) => {'id': c.id, 'label': c.label, 'facing': c.front ? 'front' : 'back'}).toList(),
        'cameraId': ?cameraId,
      }
    });
  }

  void sendRemote(String action, [Object? value]) => _send({'t': 'remote', 'action': action, 'value': ?value});

  void _send(Map<String, dynamic> msg) {
    try {
      _ws?.add(jsonEncode(msg));
    } catch (_) {}
  }

  /// Leaves the session (camera preview stays available).
  Future<void> disconnect() async {
    _closing = true;
    _reconnectTimer?.cancel();
    _send({'t': 'bye'});
    _closePeer();
    await _ws?.close();
    _ws = null;
    state = LinkState.idle;
    WakelockPlus.disable();
    notifyListeners();
  }

  Future<void> releaseCamera() async {
    renderer.srcObject = null;
    final s = _stream;
    _stream = null;
    if (s != null) {
      for (final t in s.getTracks()) {
        await t.stop();
      }
      await s.dispose();
    }
  }

  @override
  void dispose() {
    _closing = true;
    _reconnectTimer?.cancel();
    _statusTimer?.cancel();
    _closePeer();
    _ws?.close();
    releaseCamera();
    if (_rendererReady) renderer.dispose();
    WakelockPlus.disable();
    super.dispose();
  }
}
