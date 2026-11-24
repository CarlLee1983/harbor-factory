import './fullscreen.css';

const root = document.documentElement;
const button = document.querySelector('#fullscreen-toggle');
let changing = false;

function updateButton() {
  if (document.fullscreenElement === root) {
    button.textContent = '退出全螢幕';
  } else {
    button.textContent = root.hasAttribute('data-viewport-mode') ? '退出放大模式' : '全螢幕';
  }
}

function exitViewportMode() {
  root.removeAttribute('data-viewport-mode');
  updateButton();
  const focused = document.activeElement;
  if (focused?.closest('.masthead')) {
    focused.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }
}

button.addEventListener('click', async () => {
  if (changing) return;
  if (root.hasAttribute('data-viewport-mode')) {
    exitViewportMode();
    return;
  }

  const exiting = document.fullscreenElement === root;
  changing = true;
  try {
    if (exiting) {
      await document.exitFullscreen();
    } else if (document.fullscreenEnabled && root.requestFullscreen) {
      await root.requestFullscreen({ navigationUI: 'hide' });
    } else {
      root.setAttribute('data-viewport-mode', '');
    }
  } catch {
    if (!exiting) root.setAttribute('data-viewport-mode', '');
  } finally {
    changing = false;
    updateButton();
  }
});

document.addEventListener('fullscreenchange', updateButton);
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented || !root.hasAttribute('data-viewport-mode')) return;
  if (document.querySelector('dialog[open]')) return;
  exitViewportMode();
});

button.hidden = false;
