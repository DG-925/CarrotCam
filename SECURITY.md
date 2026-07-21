# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in CarrotCam, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please email security concerns to: **DG-925@users.noreply.github.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You should receive an acknowledgement within 48 hours. We will work with you to understand and address the issue before any public disclosure.

---

## Security Considerations

### Network Communication

- CarrotCam streams video over **HTTP** on port **8080** (no encryption)
- The MJPEG stream is **not authenticated** — anyone on the same network can connect
- Use CarrotCam on **trusted networks only** (home, office)
- Do not use on public WiFi without a VPN

### ADB (USB Mode)

- USB mode uses ADB (Android Debug Bridge) for device communication
- ADB requires **USB Debugging** enabled on your phone
- ADB access grants significant control over your device — only connect to trusted PCs
- CarrotCam bundles its own ADB binary — no system-wide ADB installation required

### Virtual Camera Driver

- The virtual camera driver (`softcam.dll`) registers as a system-wide DirectShow filter
- Any application on your PC can access the virtual camera feed
- The driver is loaded into every process that queries video devices

### File Permissions

- CarrotCam does **not** read, write, or transmit files from your device
- Screenshots and recordings are saved locally to your PC only
- No telemetry, analytics, or phone-home behavior beyond update checks

### Auto-Updates

- Updates are fetched from GitHub Releases (`api.github.com`)
- Update checks happen over HTTPS (encrypted)
- Downloaded APKs are verified against the release signature before installation

### Data Collection

CarrotCam collects **no personal data**. No accounts, no cloud sync, no analytics.

---

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.4   | Yes       |
| < 0.1.4 | No        |

Always use the latest version from [Releases](https://github.com/DG-925/CarrotCam/releases/latest).
