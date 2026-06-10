Custom music for Larpscape
=============================

Drop your own personal .mid (Standard MIDI) files into this folder, then list
them in manifest.json as an array of {name, file} entries, for example:

    [
      { "name": "My Tune",        "file": "my_tune.mid" },
      { "name": "Rainy Evening",  "file": "rainy_evening.mid" }
    ]

Each entry appears as an always-unlocked track in the in-game music list and
plays through the same SoundFont synthesizer as the built-in soundtrack
(a loaded /soundfont.sf2 is required for MIDI playback).

IMPORTANT — legal note:
This folder is for your PERSONAL files on your PERSONAL machine only.
Never commit, host, or publicly distribute MIDI files of copyrighted music
(game soundtracks, commercial songs, etc.). Ship this folder with an empty
manifest ([]) and no .mid files. Only add music you wrote yourself or that
is clearly licensed for redistribution.
