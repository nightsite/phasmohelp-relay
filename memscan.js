// Liest das In-Game-Journal (Geistername + Vertragsziele) aus dem Speicher von
// Phasmophobia – über reines User-Mode ReadProcessMemory via koffi (FFI auf Win32).
//
// WICHTIG / EHRLICH:
//  - Phasmophobia läuft mit Easy Anti-Cheat. EAC kann das Öffnen eines Lese-Handles
//    verweigern. Dann liefert alles hier sauber `null` (kein Crash) und das Overlay
//    fällt auf manuelle Eingabe zurück. Ein Bypass (Kernel-Treiber) ist NICHT enthalten.
//  - Die Pointer-Pfade (Offsets) sind versionsspezifisch und stehen in
//    phasmo-offsets.json. Ohne korrekte Offsets gibt es plausibilitäts-geprüft `null`.
//
// Nur Windows. Auf anderen Plattformen exportiert das Modul No-Op-Stubs.

const logger = require('./logger');

const IS_WIN = process.platform === 'win32';

let koffi = null;
let k32 = null;
let fns = null;
let initError = null;

// --- Win32-Konstanten ---
const TH32CS_SNAPPROCESS = 0x00000002;
const TH32CS_SNAPMODULE = 0x00000008;
const TH32CS_SNAPMODULE32 = 0x00000010;
const PROCESS_QUERY_INFORMATION = 0x0400;
const PROCESS_VM_READ = 0x0010;
const INVALID_HANDLE = 0xffffffffffffffffn;

// Plausibilitätsgrenzen, damit Platzhalter-/Müll-Offsets `null` statt Unsinn liefern.
const MIN_ADDR = 0x10000n;
const MAX_ADDR = 0x7fffffffffffn;
const MAX_STR_LEN = 256; // .NET-String-Länge (Zeichen)
const MAX_OBJECTIVES = 12;

function initFFI() {
  if (fns || initError) return !initError;
  try {
    koffi = require('koffi');
    k32 = koffi.load('kernel32.dll');

    // WCHAR[]-Felder werden von koffi automatisch zu JS-Strings dekodiert.
    koffi.struct('PROCESSENTRY32W', {
      dwSize: 'uint32',
      cntUsage: 'uint32',
      th32ProcessID: 'uint32',
      th32DefaultHeapID: 'uintptr_t',
      th32ModuleID: 'uint32',
      cntThreads: 'uint32',
      th32ParentProcessID: 'uint32',
      pcPriClassBase: 'int32',
      dwFlags: 'uint32',
      szExeFile: koffi.array('char16_t', 260),
    });
    koffi.struct('MODULEENTRY32W', {
      dwSize: 'uint32',
      th32ModuleID: 'uint32',
      th32ProcessID: 'uint32',
      GlblcntUsage: 'uint32',
      ProccntUsage: 'uint32',
      modBaseAddr: 'uint64',
      modBaseSize: 'uint32',
      hModule: 'uintptr_t',
      szModule: koffi.array('char16_t', 256),
      szExePath: koffi.array('char16_t', 260),
    });

    fns = {
      CreateToolhelp32Snapshot: k32.func('void* __stdcall CreateToolhelp32Snapshot(uint32 dwFlags, uint32 th32ProcessID)'),
      Process32FirstW: k32.func('bool __stdcall Process32FirstW(void* hSnapshot, _Inout_ PROCESSENTRY32W* lppe)'),
      Process32NextW: k32.func('bool __stdcall Process32NextW(void* hSnapshot, _Inout_ PROCESSENTRY32W* lppe)'),
      Module32FirstW: k32.func('bool __stdcall Module32FirstW(void* hSnapshot, _Inout_ MODULEENTRY32W* lpme)'),
      Module32NextW: k32.func('bool __stdcall Module32NextW(void* hSnapshot, _Inout_ MODULEENTRY32W* lpme)'),
      OpenProcess: k32.func('void* __stdcall OpenProcess(uint32 dwDesiredAccess, bool bInheritHandle, uint32 dwProcessId)'),
      ReadProcessMemory: k32.func('bool __stdcall ReadProcessMemory(void* hProcess, uint64 lpBaseAddress, void* lpBuffer, size_t nSize, void* lpNumberOfBytesRead)'),
      CloseHandle: k32.func('bool __stdcall CloseHandle(void* hObject)'),
    };
    return true;
  } catch (err) {
    initError = err;
    logger.warn('memscan: FFI-Init fehlgeschlagen – Memory-Reading deaktiviert: ' + (err && err.message));
    return false;
  }
}

function isInvalid(handle) {
  if (!handle) return true;
  try {
    return BigInt(koffi.address(handle)) === INVALID_HANDLE;
  } catch (_) {
    return false;
  }
}

// PID des Spielprozesses anhand des Exe-Namens (case-insensitive).
function findPid(exeName) {
  const snap = fns.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (isInvalid(snap)) return 0;
  try {
    const want = String(exeName).toLowerCase();
    const entry = { dwSize: koffi.sizeof('PROCESSENTRY32W') };
    let ok = fns.Process32FirstW(snap, entry);
    while (ok) {
      if (entry.szExeFile && entry.szExeFile.toLowerCase() === want) return entry.th32ProcessID >>> 0;
      ok = fns.Process32NextW(snap, entry);
    }
  } catch (err) {
    logger.warn('memscan: Prozesssuche fehlgeschlagen: ' + (err && err.message));
  } finally {
    fns.CloseHandle(snap);
  }
  return 0;
}

// Basisadresse eines Moduls (z.B. GameAssembly.dll) im Zielprozess.
function findModuleBase(pid, moduleName) {
  let snap = fns.CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, pid);
  if (isInvalid(snap)) return 0n;
  try {
    const want = String(moduleName).toLowerCase();
    const entry = { dwSize: koffi.sizeof('MODULEENTRY32W') };
    let ok = fns.Module32FirstW(snap, entry);
    while (ok) {
      if (entry.szModule && entry.szModule.toLowerCase() === want) return BigInt(entry.modBaseAddr);
      ok = fns.Module32NextW(snap, entry);
    }
  } catch (err) {
    logger.warn('memscan: Modulsuche fehlgeschlagen: ' + (err && err.message));
  } finally {
    fns.CloseHandle(snap);
  }
  return 0n;
}

class GameMemory {
  constructor(exeName, moduleName) {
    this.exeName = exeName || 'Phasmophobia.exe';
    this.moduleName = moduleName || 'GameAssembly.dll';
    this.handle = null;
    this.pid = 0;
    this.moduleBase = 0n;
  }

  // Stellt sicher, dass Handle + Modulbasis für den laufenden Prozess gültig sind.
  attach() {
    if (this.handle && this.moduleBase) return true;
    const pid = findPid(this.exeName);
    if (!pid) return false;
    const handle = fns.OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid);
    if (isInvalid(handle)) {
      // Typischer EAC-Fall: Handle wird verweigert.
      return false;
    }
    const base = findModuleBase(pid, this.moduleName);
    if (!base) {
      fns.CloseHandle(handle);
      return false;
    }
    this.pid = pid;
    this.handle = handle;
    this.moduleBase = base;
    return true;
  }

  detach() {
    try {
      if (this.handle) fns.CloseHandle(this.handle);
    } catch (_) {}
    this.handle = null;
    this.pid = 0;
    this.moduleBase = 0n;
  }

  // Liest `size` Bytes ab `addr` (BigInt). Gibt Buffer oder null.
  read(addr, size) {
    if (!this.handle || addr < MIN_ADDR || addr > MAX_ADDR) return null;
    const buf = Buffer.alloc(size);
    const ok = fns.ReadProcessMemory(this.handle, addr, buf, size, null);
    return ok ? buf : null;
  }

  readU64(addr) {
    const buf = this.read(addr, 8);
    return buf ? buf.readBigUInt64LE(0) : null;
  }

  readI32(addr) {
    const buf = this.read(addr, 4);
    return buf ? buf.readInt32LE(0) : null;
  }

  readBool(addr) {
    const buf = this.read(addr, 1);
    return buf ? buf[0] !== 0 : null;
  }

  // .NET/IL2CPP-String: int32-Länge @ +0x10, UTF-16-Zeichen @ +0x14.
  readDotNetString(strObjAddr) {
    if (!strObjAddr || strObjAddr < MIN_ADDR || strObjAddr > MAX_ADDR) return '';
    const len = this.readI32(strObjAddr + 0x10n);
    if (len === null || len <= 0 || len > MAX_STR_LEN) return '';
    const buf = this.read(strObjAddr + 0x14n, len * 2);
    if (!buf) return '';
    return buf.toString('utf16le').replace(/\x00.*$/, '').trim();
  }

  // Folgt einer Cheat-Engine-Pointer-Chain: addr = base+modul, dann je Offset
  // addr = [addr] + offset. Gibt die FINALE Feldadresse (BigInt) oder null.
  resolveChain(baseOffset, offsets) {
    let addr = this.moduleBase + toBig(baseOffset);
    const chain = Array.isArray(offsets) ? offsets : [];
    for (let i = 0; i < chain.length; i++) {
      const ptr = this.readU64(addr);
      if (ptr === null || ptr < MIN_ADDR || ptr > MAX_ADDR) return null;
      addr = ptr + toBig(chain[i]);
    }
    return addr;
  }
}

function toBig(v) {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return BigInt(Math.trunc(v));
  if (typeof v === 'string') return BigInt(v.trim()); // unterstützt "0x..."
  return 0n;
}

function configured(spec) {
  return !!spec && toBig(spec.base || 0) !== 0n;
}

// Hauptfunktion: liest Journal anhand der Offsets-Config.
// Rückgabe: { ghostName, objectives:[{text,done}] } oder null (nicht lesbar/EAC/Offsets).
let mem = null;
function readJournal(offsets) {
  if (!IS_WIN || !offsets || !initFFI()) return null;
  if (!configured(offsets.ghostName) && !configured(offsets.objectives)) return null; // Platzhalter

  if (!mem) mem = new GameMemory(offsets.exe, offsets.module);
  if (!mem.attach()) { mem.detach(); return null; }

  try {
    const result = { ghostName: '', objectives: [] };

    if (configured(offsets.ghostName)) {
      const fieldAddr = mem.resolveChain(offsets.ghostName.base, offsets.ghostName.offsets);
      const strPtr = fieldAddr !== null ? mem.readU64(fieldAddr) : null;
      if (strPtr) result.ghostName = mem.readDotNetString(strPtr);
    }

    if (configured(offsets.objectives)) {
      result.objectives = readObjectives(mem, offsets.objectives);
    }

    // Wenn gar nichts Sinnvolles rauskam, lieber sauber null (Fallback auf manuell).
    if (!result.ghostName && result.objectives.length === 0) return null;
    return result;
  } catch (err) {
    logger.warn('memscan: Journal-Lesen fehlgeschlagen: ' + (err && err.message));
    mem.detach();
    return null;
  }
}

// Liest eine Liste von Zielen. Erwartet im Offsets-Spec:
//   base/offsets  -> Adresse des Listen-/Array-Objekts
//   count.offset  -> int32-Anzahl relativ zum Listen-Objekt
//   items.first   -> Offset zum ersten Element-Pointer
//   items.stride  -> Bytes zwischen Element-Pointern (i.d.R. 0x8)
//   item.text     -> Offset des Text-Strings im Element
//   item.done     -> Offset des "erledigt"-Bools im Element (optional)
function readObjectives(m, spec) {
  const out = [];
  const listAddr = m.resolveChain(spec.base, spec.offsets);
  if (listAddr === null) return out;

  let count = 0;
  if (spec.count && spec.count.offset !== undefined) {
    count = m.readI32(listAddr + toBig(spec.count.offset)) || 0;
  }
  count = Math.max(0, Math.min(count, MAX_OBJECTIVES));
  if (!count) return out;

  const first = toBig(spec.items && spec.items.first);
  const stride = toBig(spec.items && spec.items.stride) || 8n;
  const textOff = toBig(spec.item && spec.item.text);
  const doneOff = spec.item && spec.item.done !== undefined ? toBig(spec.item.done) : null;

  for (let i = 0; i < count; i++) {
    const elemPtr = m.readU64(listAddr + first + stride * BigInt(i));
    if (!elemPtr) continue;
    const strPtr = m.readU64(elemPtr + textOff);
    const text = strPtr ? m.readDotNetString(strPtr) : '';
    if (!text) continue;
    const done = doneOff !== null ? !!m.readBool(elemPtr + doneOff) : false;
    out.push({ text, done });
  }
  return out;
}

function dispose() {
  if (mem) { mem.detach(); mem = null; }
}

module.exports = { readJournal, dispose, available: IS_WIN };
