import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../services/protocol.dart';
import '../theme.dart';

class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key});

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  final _controller = MobileScannerController(formats: const [BarcodeFormat.qrCode], detectionSpeed: DetectionSpeed.noDuplicates);
  bool _done = false;
  String? _hint;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_done) return;
    for (final b in capture.barcodes) {
      final info = PairInfo.parse(b.rawValue ?? '');
      if (info != null) {
        _done = true;
        HapticFeedback.mediumImpact();
        Navigator.of(context).pop(info);
        return;
      }
    }
    setState(() => _hint = 'That is not a CarrotCam code');
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final box = size.width * 0.72;
    return Scaffold(
      backgroundColor: Colors.black,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        title: const Text('Scan pairing code', style: TextStyle(color: Colors.white, fontSize: 18)),
        actions: [
          IconButton(icon: const Icon(Icons.flash_on_rounded), onPressed: _controller.toggleTorch),
        ],
      ),
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(controller: _controller, onDetect: _onDetect),
          // dim everything outside the scan window
          ColorFiltered(
            colorFilter: ColorFilter.mode(Colors.black.withValues(alpha: 0.55), BlendMode.srcOut),
            child: Stack(children: [
              Container(decoration: const BoxDecoration(color: Colors.black, backgroundBlendMode: BlendMode.dstOut)),
              Center(
                child: Container(
                  width: box,
                  height: box,
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(32)),
                ),
              ),
            ]),
          ),
          Center(
            child: Container(
              width: box,
              height: box,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(32),
                border: Border.all(color: CC.orange, width: 4),
              ),
            )
                .animate(onPlay: (c) => c.repeat(reverse: true))
                .scaleXY(begin: 1, end: 1.03, duration: 900.ms, curve: Curves.easeInOut),
          ),
          Positioned(
            left: 24,
            right: 24,
            bottom: 60,
            child: Column(children: [
              const Text(
                'Point at the QR code on your PC',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 6),
              Text(
                _hint ?? 'CarrotCam on your PC → Phones',
                style: TextStyle(color: Colors.white.withValues(alpha: 0.7)),
              ),
            ]),
          ),
        ],
      ),
    );
  }
}
