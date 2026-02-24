const IDLE_TIMEOUT_MS = 60_000;
const SCREENSAVER_PATH = '/snake/index.html';

function isScreensaverPage() {
  return window.location.pathname === SCREENSAVER_PATH;
}

if (!isScreensaverPage()) {
  let idleTimer = null;

  const scheduleRedirect = () => {
    window.location.href = SCREENSAVER_PATH;
  };

  const resetIdleTimer = () => {
    if (idleTimer) {
      window.clearTimeout(idleTimer);
    }
    idleTimer = window.setTimeout(scheduleRedirect, IDLE_TIMEOUT_MS);
  };

  const activityEvents = [
    'mousemove',
    'mousedown',
    'keydown',
    'scroll',
    'touchstart',
    'touchmove',
    'pointerdown',
    'click',
  ];

  for (const eventName of activityEvents) {
    window.addEventListener(eventName, resetIdleTimer, { passive: true });
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      resetIdleTimer();
    }
  });

  resetIdleTimer();
}
