# Salamander Drumkit — Ritmika web subset

Original recordings: **Salamander Drumkit by Alexander Holm**.

- Original library: https://archive.org/details/SalamanderDrumkit
- Author website: https://rytmenpinne.wordpress.com/salamander-drumkit/
- Source documentation: https://github.com/endolith/Salamander-Drumkit
- License for the recordings and this adapted subset: **Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0)** — https://creativecommons.org/licenses/by-sa/3.0/
- License legal text: https://creativecommons.org/licenses/by-sa/3.0/legalcode

This is an adapted subset of 20 recordings, not an endorsement by the original author. These WAV files may be shared and adapted under the same CC BY-SA 3.0 license, retaining attribution and indicating changes. The audio license applies to these recordings and their derivatives.

## Changes for Ritmika

Converted stereo 24-bit recordings to mono PCM16 WAV while preserving the original 48 kHz sample rate and pitch. Removed leading silence, shortened long tails with a fade, and balanced gain by instrument and snare layer. Each layer uses one shared gain across its variations. The snare uses three separate quiet (Ghost) recordings and three strong (F) recordings; quiet hits are not quieter copies of the strong sample. Other instruments alternate two recorded strikes.

The original library's overhead microphone recordings (`OH/`) are used. `manifest.json` lists the source filename, original and output SHA-256 hashes, exact trim boundaries, gain, duration and size of every file. The preparation script is `scripts/prepare_acoustic.py` in the application repository. Run it against the extracted original library to reproduce this subset.

Recordings are served by the same GitHub Pages site as the app. They are loaded on demand and saved in a separate versioned browser cache. Total size: about 3.4 MB.
