// Phones connected with a USB cable share a small private network with the PC
// (Android "USB tethering", iPhone "Personal Hotspot" over USB).
const USB_SUBNETS = [/^192\.168\.42\./, /^192\.168\.44\./, /^192\.168\.98\./, /^172\.20\.10\./, /^10\.42\./]

export function isUsbDevice(d: { address: string; info: { transport?: string } }): boolean {
  return d.info.transport === 'usb' || isUsbAddress(d.address)
}

export function isUsbAddress(address: string | undefined): boolean {
  return !!address && USB_SUBNETS.some((r) => r.test(address))
}
