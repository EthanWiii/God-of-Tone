// Wraps alphaTab: renders the tab, plays it back, and colours notes after analysis.
import * as alphaTab from '@coderline/alphatab';

export class TabView {
  constructor(container) {
    this.api = new alphaTab.AlphaTabApi(container, {
      core: { fontDirectory: '/font/' },
      display: { staveProfile: alphaTab.StaveProfile.ScoreTab, scale: 0.9 },
      player: {
        playerMode: alphaTab.PlayerMode.EnabledSynthesizer,
        soundFont: '/soundfont/sonivox.sf2',
        scrollElement: container.parentElement,
      },
    });
    this.score = null;
    this.trackIndex = 0;
  }

  /** Called with the parsed Score whenever a file finishes loading. */
  onScoreLoaded(callback) {
    this.api.scoreLoaded.on((score) => {
      this.score = score;
      callback(score);
    });
  }

  onPlayerReady(callback) {
    this.api.playerReady.on(callback);
  }

  onPlayerStateChanged(callback) {
    // state: 0 = paused, 1 = playing
    this.api.playerStateChanged.on((e) => callback(e.state === 1));
  }

  onError(callback) {
    this.api.error.on(callback);
  }

  /** Loads Guitar Pro 3-8 (.gp3/.gp4/.gp5/.gpx/.gp) or MusicXML from raw bytes. */
  load(arrayBuffer) {
    this.api.load(new Uint8Array(arrayBuffer));
  }

  selectTrack(index) {
    if (!this.score) return;
    this.trackIndex = index;
    this.api.renderTracks([this.score.tracks[index]]);
  }

  get track() {
    return this.score?.tracks[this.trackIndex] ?? null;
  }

  playPause() {
    this.api.playPause();
  }

  stop() {
    this.api.stop();
  }

  /**
   * Colours each expected note by its analysis result.
   * @param {Array<{note: object, status: string}>} noteResults
   */
  colorNotes(noteResults) {
    const colors = {
      correct: new alphaTab.model.Color(31, 157, 85, 255),
      late: new alphaTab.model.Color(217, 142, 4, 255),
      early: new alphaTab.model.Color(217, 142, 4, 255),
      wrong: new alphaTab.model.Color(214, 69, 69, 255),
      missed: new alphaTab.model.Color(160, 160, 160, 255),
    };
    const { NoteStyle, NoteSubElement } = alphaTab.model;
    for (const { note, status } of noteResults) {
      const color = colors[status];
      if (!color) continue;
      note.style = new NoteStyle();
      note.style.colors.set(NoteSubElement.GuitarTabFretNumber, color);
      note.style.colors.set(NoteSubElement.StandardNotationNoteHead, color);
    }
    this.api.render();
  }

  clearColors() {
    if (!this.track) return;
    for (const staff of this.track.staves)
      for (const bar of staff.bars)
        for (const voice of bar.voices)
          for (const beat of voice.beats)
            for (const note of beat.notes) note.style = undefined;
    this.api.render();
  }
}
