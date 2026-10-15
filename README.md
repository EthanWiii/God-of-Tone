# God of Tone

A local practice tool: load a Guitar Pro tab, record yourself (video + audio), and
see a score for each take: wrong, missed, early or late notes, where you slowed
down, and how your bends came out. You decide which takes to keep; nothing is
saved unless you click **Save**.

This is a skeleton. The end-to-end flow works, but the analysis is a first
version (see "Status").

## Run

```bash
npm install
npm run dev
```

Then open http://localhost:5173 in **Chrome**. It is the only browser that can save
takes straight into a folder; other browsers download them instead.

## How to use

1. **Import tab**: Guitar Pro 6 `.gpx`, or `.gp3/.gp4/.gp5/.gp`, or MusicXML. Pick the track.
2. Choose **camera**, **audio input** (your audio interface), and which **input channel** the guitar is on.
3. Optional: choose a **bar range** and **speed** (50–100%).
4. **Record** (or press Space / PageDown). With **Count-in** on, you hear one bar of clicks
   at the practice tempo, and timing is judged against that strict grid.
5. Stop. The take is analysed and shows its score. Notes are coloured on the tab:
   green = good, orange = early/late, red = wrong, grey = missed.
6. **Save** the takes you like (or press S / PageUp for the latest one). Pick a save folder first with **Save folder…**.

**Import recording** scores an existing audio/video file against the tab. Without a
count-in, the app estimates where the tab starts and what tempo you played.

A Bluetooth page-turner foot pedal usually sends PageDown/PageUp, so it can start/stop
recording and save takes hands-free.

## Code layout

```
src/
  main.js                  UI wiring
  tab/
    tabView.js             alphaTab: render, playback, colour notes
    expectedNotes.js       Score -> time-stamped expected notes (pitch, string/fret, techniques)
  recording/
    devices.js             camera / audio-interface stream (voice processing off)
    recorder.js            MediaRecorder + count-in clicks
    takeStore.js           in-memory takes, save to folder / download
  analysis/
    pipeline.js            decode -> onsets -> pitch -> align -> score -> techniques
    audio.js               decode to mono, choose input channel
    onsets.js              note starts (SuperFlux, ignores bends/vibrato)
    pitch.js               YIN pitch + pitch contour
    align.js               match played notes to tab notes, estimate offset/tempo
    score.js               per-note status, per-bar tempo, take score
    techniques.js          technique checks (bend done, others stubbed)
  coach/coach.js           rule-based practice notes; prompt builder for a future AI coach
  ui/takeList.js           take list
```

## Status / next steps

- [x] Tab import (GP3–GP8, incl. GP6 `.gpx`), track selection, playback, bar range, speed
- [x] Video + audio recording, count-in, take list, manual save, foot-pedal keys
- [x] Single-note analysis: wrong / missed / extra / early / late, tempo per bar
- [x] Bend check (cents sharp/flat)
- [ ] Repeats/alternate endings: the tab is currently read straight through, once
- [ ] Chords: pitch detection is monophonic; swap in a polyphonic model (e.g. basic-pitch)
- [ ] Latency calibration for the audio interface (affects early/late)
- [ ] Vibrato and slide checks (pitch-contour rules)
- [ ] Palm mute, harmonics, picked vs. legato (small trained classifier)
- [ ] AI coach: a tiny local server holding the API key, fed by `buildCoachPrompt()`
- [ ] Persist session history (scores over time) without storing videos
