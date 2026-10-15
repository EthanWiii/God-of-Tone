// Renders the take list in the side panel.

const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/**
 * @param {HTMLElement} listEl
 * @param {import('../recording/takeStore.js').Take[]} takes
 * @param {{ selectedId: number|null, onSelect, onSave, onDelete }} handlers
 */
export function renderTakeList(listEl, takes, { selectedId, onSelect, onSave, onDelete }) {
  listEl.replaceChildren(
    ...takes.map((take) => {
      const li = document.createElement('li');
      li.className = 'take' + (take.id === selectedId ? ' selected' : '');

      const title = document.createElement('div');
      title.innerHTML = `<strong>${escapeHtml(take.name)}</strong> <span class="meta">${fmt(take.durationSec)} · ${statusText(take)}</span>`;

      const actions = document.createElement('div');
      actions.className = 'actions';
      if (take.saved) {
        actions.innerHTML = `<span class="saved">${take.source === 'imported' ? 'Imported' : 'Saved'}</span>`;
      } else {
        const save = button('Save', () => onSave(take));
        actions.append(save);
      }
      actions.append(button('✕', () => onDelete(take), 'Delete take'));

      li.append(title, actions);
      if (take.id === selectedId) {
        const video = document.createElement('video');
        video.src = take.url;
        video.controls = true;
        video.playsInline = true;
        li.append(video);
      }
      li.addEventListener('click', (e) => {
        if (!e.target.closest('button, video')) onSelect(take);
      });
      return li;
    }),
  );
}

function statusText(take) {
  switch (take.status) {
    case 'analyzing': return 'analyzing…';
    case 'error': return 'analysis failed';
    case 'pending': return 'load a tab to score';
    default: return `<strong>${Math.round(take.analysis.score.overall)}%</strong>`;
  }
}

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function button(label, onClick, title) {
  const b = document.createElement('button');
  b.textContent = label;
  if (title) b.title = title;
  b.addEventListener('click', onClick);
  return b;
}
