// App wiring: toolbar, tab view, recording, analysis and the results panel.

import { TabView } from './tab/tabView.js';
import { extractExpectedEvents } from './tab/expectedNotes.js';
import { listDevices, openStream, stopStream } from './recording/devices.js';
import { TakeRecorder } from './recording/recorder.js';
import { TakeStore } from './recording/takeStore.js';
import { analyzeTake, prepareEvents } from './analysis/pipeline.js';
import { coachNotes } from './coach/coach.js';
import { renderTakeList } from './ui/takeList.js';

const $ = (id) => document.getElementById(id);

const state = {
  songTitle: 'practice',
  expected: null, // result of extractExpectedEvents for the selected track
  stream: null,
  selectedTakeId: null,
};

const tab = new TabView($('alphatab'));
const recorder = new TakeRecorder();
const store = new TakeStore();

// ---------------------------------------------------------------- Tab

$('tab-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  state.songTitle = file.name.replace(/\.[^.]+$/, '');
  tab.load(await file.arrayBuffer());
  e.target.value = '';
});

tab.onError((err) => alert(`Could not open this tab file:\n${err.message ?? err}`));

tab.onScoreLoaded((score) => {
  $('tab-placeholder').hidden = true;
  if (score.title) state.songTitle = score.title;

  const select = $('track-select');
  select.replaceChildren(...score.tracks.map((t, i) => new Option(`${i + 1}. ${t.name}`, i)));
  select.disabled = false;
  // Default to the first guitar-like track.
  const guitarIndex = score.tracks.findIndex((t) => /guit|gtr/i.test(t.name));
  select.value = guitarIndex >= 0 ? guitarIndex : 0;
  tab.selectTrack(Number(select.value));

  $('bar-from').value = 1;
  $('bar-to').value = score.masterBars.length;
  $('bar-from').max = $('bar-to').max = score.masterBars.length;
  $('record-btn').disabled = false;
  refreshExpected();
});

$('track-select').addEventListener('change', (e) => {
  tab.selectTrack(Number(e.target.value));
  refreshExpected();
});

function refreshExpected() {
  state.expected = extractExpectedEvents(tab.score, tab.trackIndex);
  // Takes imported before a tab existed can be scored now.
  store.takes.filter((t) => t.status === 'pending').forEach(runAnalysis);
}

tab.onPlayerReady(() => ($('tab-play').disabled = false));
tab.onPlayerStateChanged((playing) => ($('tab-play').textContent = playing ? '⏸ Pause tab' : '▶ Play tab'));
$('tab-play').addEventListener('click', () => tab.playPause());

$('speed-select').addEventListener('change', () => (tab.api.playbackSpeed = practiceSettings().speed));

function practiceSettings() {
  const bars = state.expected?.barCount ?? 1;
  const from = Math.max(1, Math.min(bars, Number($('bar-from').value) || 1));
  const to = Math.max(from, Math.min(bars, Number($('bar-to').value) || bars));
  return { fromBar: from - 1, toBar: to - 1, speed: Number($('speed-select').value), trackIndex: tab.trackIndex };
}

// ---------------------------------------------------------------- Devices

async function startPreview() {
  stopStream(state.stream);
  try {
    state.stream = await openStream({
      cameraId: $('camera-select').value,
      audioId: $('audio-select').value,
      withVideo: $('video-toggle').checked,
    });
    $('camera-preview').srcObject = state.stream;
  } catch (err) {
    alert(`Could not open camera / audio input: ${err.message}`);
  }
}

async function fillDeviceLists() {
  const { cameras, audioInputs } = await listDevices();
  const fill = (select, devices, fallback) => {
    const current = select.value;
    select.replaceChildren(...devices.map((d, i) => new Option(d.label || `${fallback} ${i + 1}`, d.deviceId)));
    if (devices.some((d) => d.deviceId === current)) select.value = current;
  };
  fill($('camera-select'), cameras, 'Camera');
  fill($('audio-select'), audioInputs, 'Input');
}

for (const id of ['camera-select', 'audio-select', 'video-toggle']) {
  $(id).addEventListener('change', startPreview);
}
navigator.mediaDevices.addEventListener('devicechange', fillDeviceLists);

// ---------------------------------------------------------------- Recording

let recTimer = null;

async function toggleRecording() {
  if (!state.expected || !state.stream) return;
  const btn = $('record-btn');

  if (!recorder.isRecording) {
    const practice = practiceSettings();
    const firstEvent = state.expected.events.find((e) => e.barIndex >= practice.fromBar);
    const countIn = $('countin-toggle').checked
      ? { bpm: (firstEvent?.bpm ?? state.expected.tempo) * practice.speed, beats: state.expected.timeSignature[0] }
      : undefined;

    btn.classList.add('active');
    btn.textContent = '■ Stop';
    $('rec-indicator').hidden = false;
    const startedAt = Date.now();
    recTimer = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      $('rec-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }, 250);

    recorder.practice = practice;
    await recorder.start(state.stream, {
      countIn,
      onCount: (n) => {
        $('countin-overlay').hidden = n === null;
        $('countin-overlay').textContent = n ?? '';
      },
    });
  } else {
    const result = await recorder.stop();
    clearInterval(recTimer);
    btn.classList.remove('active');
    btn.textContent = '● Record';
    $('rec-indicator').hidden = true;
    $('countin-overlay').hidden = true;

    const take = store.add({ ...result, source: 'recorded' });
    take.practice = recorder.practice;
    selectTake(take);
    runAnalysis(take);
  }
}

$('record-btn').addEventListener('click', toggleRecording);

$('recording-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  const take = store.add({
    blob: file,
    mimeType: file.type,
    durationSec: await mediaDuration(file),
    tabStartOffset: null, // unknown - the aligner estimates it
    source: 'imported',
    name: file.name,
  });
  selectTake(take);
  runAnalysis(take);
});

function mediaDuration(file) {
  return new Promise((resolve) => {
    const el = document.createElement('video');
    el.preload = 'metadata';
    el.onloadedmetadata = () => { resolve(el.duration || 0); URL.revokeObjectURL(el.src); };
    el.onerror = () => resolve(0);
    el.src = URL.createObjectURL(file);
  });
}

$('folder-btn').addEventListener('click', async () => {
  const name = await store.chooseFolder();
  if (name) $('folder-btn').textContent = `📁 ${name}`;
});

// ---------------------------------------------------------------- Analysis

async function runAnalysis(take) {
  if (!state.expected) return; // stays 'pending' until a tab is loaded
  store.update(take, { status: 'analyzing' });
  try {
    const practice = take.practice ?? practiceSettings();
    const events = prepareEvents(state.expected.events, practice);
    const analysis = await analyzeTake(take, events, { channel: $('channel-select').value });
    store.update(take, { status: 'done', analysis });
  } catch (err) {
    console.error(err);
    store.update(take, { status: 'error' });
  }
  if (take.id === state.selectedTakeId) showResults(take);
}

// ---------------------------------------------------------------- Results panel

function selectTake(take) {
  state.selectedTakeId = take.id;
  showResults(take);
  renderTakes();
}

function showResults(take) {
  const card = $('current-score');
  const a = take?.analysis;
  card.querySelector('.score-label').textContent = take ? take.name : 'Current take';
  if (!a) {
    card.querySelector('.score-value').textContent = take?.status === 'analyzing' ? '…' : '—';
    card.querySelector('.score-details').textContent = '';
    $('bar-tempo').replaceChildren();
    $('coach-notes').replaceChildren();
    return;
  }

  const s = a.score;
  const c = s.counts;
  card.querySelector('.score-value').textContent = `${Math.round(s.overall)}%`;
  card.querySelector('.score-details').innerHTML = [
    `Notes ${Math.round(s.pitchAccuracy)}% · Timing ${Math.round(s.timingAccuracy)}%`,
    s.meanDeviationMs != null ? `Average timing offset ${Math.round(s.meanDeviationMs)} ms` : '',
    `✓ ${c.correct} · late ${c.late} · early ${c.early} · wrong ${c.wrong} · missed ${c.missed} · extra ${c.extra}`,
    s.playedTempoRatio ? `Played at ${Math.round(s.playedTempoRatio * 100)}% of the target tempo on average` : '',
  ].filter(Boolean).join('<br>');

  renderBarTempos(a.barTempos);
  $('coach-notes').replaceChildren(...coachNotes(a).map((text) => Object.assign(document.createElement('li'), { textContent: text })));

  tab.clearColors();
  tab.colorNotes(a.eventResults.flatMap((r) => r.event.notes.map((n) => ({ note: n.note, status: r.status }))));
}

function renderBarTempos(barTempos) {
  const max = Math.max(...barTempos.map((b) => Math.max(b.playedBpm, b.tabBpm)), 1);
  $('bar-tempo').replaceChildren(
    ...barTempos.map((b) => {
      const el = document.createElement('div');
      el.className = 'bar' + (b.playedBpm < b.tabBpm * 0.93 ? ' slow' : '');
      el.style.height = `${(b.playedBpm / max) * 100}%`;
      el.title = `Bar ${b.barIndex + 1}: ${Math.round(b.playedBpm)} bpm (target ${Math.round(b.tabBpm)})`;
      return el;
    }),
  );
}

function renderTakes() {
  renderTakeList($('take-list'), store.takes, {
    selectedId: state.selectedTakeId,
    onSelect: selectTake,
    onSave: async (take) => {
      try {
        await store.save(take, state.songTitle);
      } catch (err) {
        if (err.name !== 'AbortError') alert(`Saving failed: ${err.message}`);
      }
    },
    onDelete: (take) => {
      if (!take.saved && !confirm(`Discard ${take.name}? It has not been saved.`)) return;
      store.remove(take);
      if (take.id === state.selectedTakeId) {
        state.selectedTakeId = store.latest?.id ?? null;
        showResults(store.latest);
      }
    },
  });
}

store.addEventListener('change', renderTakes);

// ---------------------------------------------------------------- Keyboard / foot pedal

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea')) return;
  if (e.code === 'Space' || e.code === 'PageDown') {
    e.preventDefault();
    toggleRecording();
  } else if ((e.code === 'KeyS' || e.code === 'PageUp') && store.latest && !store.latest.saved) {
    e.preventDefault();
    store.save(store.latest, state.songTitle);
  }
});

window.addEventListener('beforeunload', (e) => {
  if (store.hasUnsaved) e.preventDefault();
});

// ---------------------------------------------------------------- Start

(async () => {
  await startPreview(); // asks for permission, which also unlocks device names
  await fillDeviceLists();
})();
