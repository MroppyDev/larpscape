#!/usr/bin/env python3
"""Export piano-roll notes from an FL Studio .flp to Standard MIDI.

Standalone binary scan (no full PyFLP parse — avoids Python 3.13 enum issues).
Usage:
  python scripts/flp-to-midi.py path/to/project.flp path/to/out.mid
"""
from __future__ import annotations

import io
import struct
import sys
from collections import defaultdict
from pathlib import Path

import construct as c
import mido

from pyflp.pattern import NotesEvent

FLP_HEADER = struct.Struct("<4sIhHH")
BYTE, WORD, DWORD, TEXT, DATA = 0, 64, 128, 192, 208
NOTES_ID = DATA + 16  # PatternID.Notes
TEMPO_COARSE_ID = WORD + 2
TEMPO_DWORD_ID = DWORD + 28


def _read_varint(data: bytes, pos: int) -> tuple[int, int]:
    stream = io.BytesIO(data[pos:])
    size = c.VarInt.parse_stream(stream)
    return int(size), pos + stream.tell()


def _scan_events(data: bytes) -> tuple[int, int, list[bytes]]:
    hdr = data[:FLP_HEADER.size]
    magic, hdr_size, _fmt, _chans, ppq = FLP_HEADER.unpack(hdr)
    if magic != b"FLhd" or data[FLP_HEADER.size : FLP_HEADER.size + 4] != b"FLdt":
        raise ValueError("Not a valid .flp file")
    pos = 22
    end = len(data)
    tempo = 120
    note_blobs: list[bytes] = []
    while pos < end:
        eid = data[pos]
        pos += 1
        if eid < WORD:
            val = data[pos]
            pos += 1
            if eid == TEMPO_COARSE_ID:
                tempo = val if val else tempo
        elif eid < DWORD:
            val = int.from_bytes(data[pos : pos + 2], "little")
            pos += 2
            if eid == TEMPO_COARSE_ID:
                tempo = val if val else tempo
        elif eid < TEXT:
            val = int.from_bytes(data[pos : pos + 4], "little")
            pos += 4
            if eid == TEMPO_DWORD_ID:
                tempo = max(1, round(val / 1000))
        else:
            size, pos = _read_varint(data, pos)
            payload = data[pos : pos + size]
            pos += size
            if eid == NOTES_ID and payload:
                note_blobs.append(payload)
    return ppq, tempo, note_blobs


def export_flp_to_midi(flp_path: Path, out_path: Path) -> dict:
    ppq, tempo, blobs = _scan_events(flp_path.read_bytes())
    by_ch: dict[int, list[tuple[int, int, int, int]]] = defaultdict(list)
    note_count = 0
    for blob in blobs:
        for n in NotesEvent.STRUCT.parse(blob):
            pos = int(n.position)
            length = max(1, int(n.length))
            key = int(n.key)
            vel = max(1, min(127, int(n.velocity)))
            ch = max(0, min(15, int(n.rack_channel) & 0x0F))
            by_ch[ch].append((pos, pos + length, key, vel))
            note_count += 1

    mid = mido.MidiFile(ticks_per_beat=ppq)
    meta = mido.MidiTrack()
    meta.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(float(tempo)), time=0))
    meta.append(mido.MetaMessage("track_name", name=flp_path.stem, time=0))
    mid.tracks.append(meta)

    for ch in sorted(by_ch):
        tr = mido.MidiTrack()
        tr.append(mido.MetaMessage("track_name", name=f"ch{ch}", time=0))
        events: list[tuple[int, str, int, int]] = []
        for start, end, key, vel in by_ch[ch]:
            events.append((start, "on", key, vel))
            events.append((end, "off", key, 0))
        events.sort(key=lambda e: (e[0], e[1] == "on"))
        last = 0
        for tick, kind, key, vel in events:
            delta = max(0, tick - last)
            last = tick
            msg = "note_on" if kind == "on" else "note_off"
            tr.append(mido.Message(msg, note=key, velocity=vel, channel=ch, time=delta))
        mid.tracks.append(tr)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    mid.save(str(out_path))
    return {"tempo": tempo, "ppq": ppq, "notes": note_count, "tracks": len(by_ch), "out": str(out_path)}


def main() -> None:
    flp = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(
        r"c:\Users\pigu8\Documents\Image-Line\FL Studio\Projects\stupie\stupie.flp"
    )
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("public/music/market_day.mid")
    print(export_flp_to_midi(flp, out))


if __name__ == "__main__":
    main()
