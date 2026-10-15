// In-memory list of takes for the current session, plus saving to disk.
// Takes are only written to disk when you click "Save" - everything else is
// discarded when the page closes.

/**
 * @typedef {Object} Take
 * @property {number} id
 * @property {string} name
 * @property {Blob} blob
 * @property {string} mimeType
 * @property {string} url             object URL for playback
 * @property {number} durationSec
 * @property {number|null} tabStartOffset seconds into the recording where the tab starts (known with count-in)
 * @property {'recorded'|'imported'} source
 * @property {'pending'|'analyzing'|'done'|'error'} status
 * @property {object|null} analysis
 * @property {boolean} saved
 */

export class TakeStore extends EventTarget {
  constructor() {
    super();
    /** @type {Take[]} */
    this.takes = [];
    this.nextId = 1;
    this.folderHandle = null;
  }

  add({ blob, mimeType, durationSec, tabStartOffset = null, source = 'recorded', name }) {
    const id = this.nextId++;
    const take = {
      id,
      name: name ?? `Take ${id}`,
      blob,
      mimeType,
      url: URL.createObjectURL(blob),
      durationSec,
      tabStartOffset,
      source,
      status: 'pending',
      analysis: null,
      saved: source === 'imported',
    };
    this.takes.unshift(take);
    this.#changed();
    return take;
  }

  update(take, patch) {
    Object.assign(take, patch);
    this.#changed();
  }

  remove(take) {
    URL.revokeObjectURL(take.url);
    this.takes = this.takes.filter((t) => t !== take);
    this.#changed();
  }

  get latest() {
    return this.takes[0] ?? null;
  }

  get hasUnsaved() {
    return this.takes.some((t) => !t.saved);
  }

  /** Lets you pick a folder once (Chrome/Edge); afterwards saves go straight there. */
  async chooseFolder() {
    if (!window.showDirectoryPicker) {
      alert('This browser cannot write to a folder directly - takes will be downloaded instead. Use Chrome for folder saving.');
      return null;
    }
    this.folderHandle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'guitar-takes' });
    return this.folderHandle.name;
  }

  async save(take, songTitle = 'practice') {
    const ext = take.mimeType.includes('mp4') ? 'mp4' : 'webm';
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const score = take.analysis ? ` - ${Math.round(take.analysis.score.overall)}%` : '';
    const fileName = `${songTitle} - ${take.name}${score} - ${stamp}.${ext}`.replace(/[\\/:*?"<>|]/g, '_');

    if (this.folderHandle) {
      const file = await this.folderHandle.getFileHandle(fileName, { create: true });
      const writable = await file.createWritable();
      await writable.write(take.blob);
      await writable.close();
    } else {
      const a = document.createElement('a');
      a.href = take.url;
      a.download = fileName;
      a.click();
    }
    this.update(take, { saved: true });
    return fileName;
  }

  #changed() {
    this.dispatchEvent(new Event('change'));
  }
}
