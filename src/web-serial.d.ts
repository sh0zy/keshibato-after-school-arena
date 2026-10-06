// Web Serial API（T字レバーの ESP32 と USB でつなぐために使う）の型。
// TypeScript の標準 lib.dom には含まれないため、使う範囲だけ最小限に宣言する。
interface SerialPortInfo { usbVendorId?:number; usbProductId?:number }
interface SerialOptions { baudRate:number; dataBits?:number; stopBits?:number; parity?:'none'|'even'|'odd'; bufferSize?:number; flowControl?:'none'|'hardware' }
interface SerialPortFilter { usbVendorId?:number; usbProductId?:number }
interface SerialPort extends EventTarget {
 readonly readable:ReadableStream<Uint8Array>|null
 readonly writable:WritableStream<Uint8Array>|null
 open(options:SerialOptions):Promise<void>
 close():Promise<void>
 forget?():Promise<void>
 getInfo():SerialPortInfo
}
interface Serial extends EventTarget {
 requestPort(options?:{filters?:SerialPortFilter[]}):Promise<SerialPort>
 getPorts():Promise<SerialPort[]>
}
interface Navigator { readonly serial:Serial }
