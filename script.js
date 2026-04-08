// ============================================================
//  FlowState — Pomodoro Timer
//  Features: Countdown timer, modes, tasks, stats,
//            localStorage, settings, Web Audio API sounds
// ============================================================

// ============================================================
//  DEFAULT CONFIG
// ============================================================
const DEFAULTS = {
  pomodoro:     25,
  short:        5,
  long:         15,
  sessions:     4,
  autoBreak:    false,
  autoPomodoro: false,
};

// ============================================================
//  STATE
// ============================================================
let cfg          = loadConfig();
let mode         = 'pomodoro';     // pomodoro | short | long
let timeLeft     = cfg.pomodoro * 60;
let totalTime    = cfg.pomodoro * 60;
let running      = false;
let interval     = null;
let sessionsDone = 0;              // pomodoros completed this cycle
let soundOn      = true;
let tasks        = [];
let activeTask   = null;

// Stats
let stats = loadStats();

// ============================================================
//  DOM REFS
// ============================================================
const timerDisplay  = document.getElementById('timerDisplay');
const progCircle    = document.getElementById('progCircle');
const modeLabel     = document.getElementById('modeLabel');
const sessionDots   = document.getElementById('sessionDots');
const startBtn      = document.getElementById('startBtn');
const resetBtn      = document.getElementById('resetBtn');
const skipBtn       = document.getElementById('skipBtn');
const taskInput     = document.getElementById('taskInput');
const addTaskBtn    = document.getElementById('addTaskBtn');
const taskList      = document.getElementById('taskList');
const taskCountEl   = document.getElementById('taskCount');
const toast         = document.getElementById('toast');
const soundBtn      = document.getElementById('soundBtn');
const settingsBtn   = document.getElementById('settingsBtn');
const settingsOverlay = document.getElementById('settingsOverlay');
const closeSettings = document.getElementById('closeSettings');
const saveSettings  = document.getElementById('saveSettings');

// Mode tab buttons
const modeTabs = document.querySelectorAll('.mode-tab');

// Stat displays
const statPomodoros = document.getElementById('statPomodoros');
const statFocusTime = document.getElementById('statFocusTime');
const statStreak    = document.getElementById('statStreak');

// ============================================================
//  CIRCUMFERENCE constant
// ============================================================
const CIRC = 2 * Math.PI * 140; // 879.6

// ============================================================
//  MODE COLOURS
// ============================================================
const MODE_COLORS = {
  pomodoro: '#c084fc',
  short:    '#34d399',
  long:     '#60a5fa',
};

const MODE_LABELS = {
  pomodoro: 'FOCUS',
  short:    'SHORT BREAK',
  long:     'LONG BREAK',
};

// ============================================================
//  COLOUR THEME UPDATE
// ============================================================
function applyColor(m) {
  const c = MODE_COLORS[m];
  document.documentElement.style.setProperty('--clr', c);
}

// ============================================================
//  TIMER DISPLAY
// ============================================================
function pad(n) { return String(n).padStart(2, '0'); }

function updateDisplay() {
  const m = Math.floor(timeLeft / 60);
  const s = timeLeft % 60;
  timerDisplay.textContent = `${pad(m)}:${pad(s)}`;
  document.title = `${pad(m)}:${pad(s)} — FlowState`;

  // Progress ring
  const pct    = timeLeft / totalTime;
  const offset = CIRC * (1 - pct);
  progCircle.style.strokeDashoffset = offset;
}

// ============================================================
//  SESSION DOTS
// ============================================================
function renderDots() {
  sessionDots.innerHTML = '';
  for (let i = 0; i < cfg.sessions; i++) {
    const dot = document.createElement('div');
    dot.className = 'dot' + (i < sessionsDone ? ' done' : '');
    sessionDots.appendChild(dot);
  }
}

// ============================================================
//  SET MODE
// ============================================================
function setMode(m, fromSkip = false) {
  mode      = m;
  running   = false;
  clearInterval(interval);

  const mins = m === 'pomodoro' ? cfg.pomodoro
             : m === 'short'    ? cfg.short
             :                    cfg.long;

  timeLeft  = mins * 60;
  totalTime = mins * 60;

  // UI
  modeTabs.forEach(t => t.classList.toggle('active', t.dataset.mode === m));
  modeLabel.textContent     = MODE_LABELS[m];
  startBtn.textContent      = 'START';
  startBtn.classList.remove('running');
  applyColor(m);
  updateDisplay();
  renderDots();

  if (!fromSkip) return;

  // Auto-start logic
  if (m === 'pomodoro' && cfg.autoPomodoro) startTimer();
  if (m !== 'pomodoro' && cfg.autoBreak)    startTimer();
}

modeTabs.forEach(t => t.addEventListener('click', () => setMode(t.dataset.mode)));

// ============================================================
//  START / PAUSE
// ============================================================
function startTimer() {
  running = true;
  startBtn.textContent = 'PAUSE';
  startBtn.classList.add('running');

  interval = setInterval(() => {
    timeLeft--;
    updateDisplay();

    if (timeLeft <= 0) {
      clearInterval(interval);
      onTimerEnd();
    }
  }, 1000);
}

function pauseTimer() {
  running = false;
  clearInterval(interval);
  startBtn.textContent = 'RESUME';
  startBtn.classList.add('running');
}

startBtn.addEventListener('click', () => {
  if (running) pauseTimer();
  else         startTimer();
});

// ============================================================
//  RESET
// ============================================================
resetBtn.addEventListener('click', () => {
  setMode(mode);
  showToast('Timer reset');
});

// ============================================================
//  SKIP
// ============================================================
skipBtn.addEventListener('click', () => {
  clearInterval(interval);
  if (mode === 'pomodoro') {
    sessionsDone++;
    if (sessionsDone >= cfg.sessions) {
      sessionsDone = 0;
      setMode('long', true);
      showToast('Long break time! 🎉');
    } else {
      setMode('short', true);
      showToast('Short break!');
    }
  } else {
    setMode('pomodoro', true);
    showToast('Back to focus 💪');
  }
});

// ============================================================
//  TIMER END
// ============================================================
function onTimerEnd() {
  playSound(mode === 'pomodoro' ? 'done' : 'bell');

  if (mode === 'pomodoro') {
    sessionsDone++;
    stats.pomodoros++;
    stats.focusMinutes += cfg.pomodoro;
    if (sessionsDone === 1) stats.streak++;
    saveStats();
    updateStats();
    renderDots();

    if (sessionsDone >= cfg.sessions) {
      sessionsDone = 0;
      showToast('🏆 Long break earned!');
      setMode('long', true);
    } else {
      showToast('✅ Session done! Take a break.');
      setMode('short', true);
    }
  } else {
    showToast('🎯 Break over — back to it!');
    setMode('pomodoro', true);
  }
}

// ============================================================
//  WEB AUDIO SOUNDS
// ============================================================
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playSound(type) {
  if (!soundOn) return;
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    if (type === 'done') {
      // Three ascending tones
      [[440, 0], [554, 0.18], [659, 0.36]].forEach(([freq, delay]) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type      = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now + delay);
        gain.gain.linearRampToValueAtTime(0.18, now + delay + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.5);
        osc.start(now + delay);
        osc.stop(now + delay + 0.6);
      });
    } else {
      // Single bell tone
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 528;
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      osc.start(now); osc.stop(now + 1.5);
    }
  } catch (e) { /* audio not available */ }
}

function playClick() {
  if (!soundOn) return;
  try {
    const ctx  = getAudioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.value = 800;
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.start(); osc.stop(ctx.currentTime + 0.06);
  } catch (e) {}
}

soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  soundBtn.textContent = soundOn ? '🔔' : '🔕';
  showToast(soundOn ? 'Sound on' : 'Sound off');
});

// ============================================================
//  TASKS
// ============================================================
function addTask() {
  const text = taskInput.value.trim();
  if (!text) return;
  const task = { id: Date.now(), text, done: false };
  tasks.unshift(task);
  taskInput.value = '';
  saveTasks();
  renderTasks();
  playClick();
}

addTaskBtn.addEventListener('click', addTask);
taskInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });

function renderTasks() {
  if (tasks.length === 0) {
    taskList.innerHTML = '<li style="text-align:center;color:var(--muted);font-size:0.82rem;padding:1rem 0">No tasks yet — add one above</li>';
    taskCountEl.textContent = '0 tasks';
    return;
  }

  const pending = tasks.filter(t => !t.done).length;
  taskCountEl.textContent = `${pending} task${pending !== 1 ? 's' : ''} left`;

  taskList.innerHTML = tasks.map((t, i) => `
    <li class="task-item${t.done ? ' done' : ''}${activeTask === t.id ? ' active' : ''}"
        data-id="${t.id}" style="animation-delay:${i * 0.04}s">
      <div class="task-check" data-check="${t.id}"></div>
      <span class="task-text">${escHtml(t.text)}</span>
      <button class="task-del" data-del="${t.id}">✕</button>
    </li>`).join('');

  // Events
  taskList.querySelectorAll('.task-check').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const id = parseInt(el.dataset.check);
      const t  = tasks.find(t => t.id === id);
      if (t) { t.done = !t.done; saveTasks(); renderTasks(); playClick(); }
    });
  });

  taskList.querySelectorAll('.task-del').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const id = parseInt(el.dataset.del);
      tasks = tasks.filter(t => t.id !== id);
      if (activeTask === id) activeTask = null;
      saveTasks(); renderTasks();
    });
  });

  taskList.querySelectorAll('.task-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = parseInt(el.dataset.id);
      activeTask = activeTask === id ? null : id;
      renderTasks();
    });
  });
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ============================================================
//  STATS
// ============================================================
function updateStats() {
  statPomodoros.textContent = stats.pomodoros;
  statFocusTime.textContent = stats.focusMinutes >= 60
    ? `${Math.floor(stats.focusMinutes/60)}h ${stats.focusMinutes%60}m`
    : `${stats.focusMinutes}m`;
  statStreak.textContent = stats.streak;
}

// ============================================================
//  SETTINGS
// ============================================================
settingsBtn.addEventListener('click', () => {
  document.getElementById('setPomodoro').value  = cfg.pomodoro;
  document.getElementById('setShort').value     = cfg.short;
  document.getElementById('setLong').value      = cfg.long;
  document.getElementById('setSessions').value  = cfg.sessions;
  document.getElementById('setAutoBreak').checked     = cfg.autoBreak;
  document.getElementById('setAutoPomodoro').checked  = cfg.autoPomodoro;
  settingsOverlay.classList.add('open');
});

closeSettings.addEventListener('click', () => settingsOverlay.classList.remove('open'));
settingsOverlay.addEventListener('click', e => {
  if (e.target === settingsOverlay) settingsOverlay.classList.remove('open');
});

saveSettings.addEventListener('click', () => {
  cfg.pomodoro     = parseInt(document.getElementById('setPomodoro').value) || 25;
  cfg.short        = parseInt(document.getElementById('setShort').value)    || 5;
  cfg.long         = parseInt(document.getElementById('setLong').value)     || 15;
  cfg.sessions     = parseInt(document.getElementById('setSessions').value) || 4;
  cfg.autoBreak    = document.getElementById('setAutoBreak').checked;
  cfg.autoPomodoro = document.getElementById('setAutoPomodoro').checked;
  saveConfig();
  settingsOverlay.classList.remove('open');
  setMode(mode);
  showToast('Settings saved ✓');
});

// ============================================================
//  TOAST
// ============================================================
let toastTimer = null;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ============================================================
//  LOCAL STORAGE
// ============================================================
function saveConfig() { localStorage.setItem('flowstate_cfg', JSON.stringify(cfg)); }
function loadConfig() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('flowstate_cfg') || '{}') }; }
  catch { return { ...DEFAULTS }; }
}

function saveTasks() { localStorage.setItem('flowstate_tasks', JSON.stringify(tasks)); }
function loadTasks() {
  try { return JSON.parse(localStorage.getItem('flowstate_tasks') || '[]'); }
  catch { return []; }
}

function saveStats() { localStorage.setItem('flowstate_stats', JSON.stringify(stats)); }
function loadStats() {
  const today = new Date().toDateString();
  try {
    const s = JSON.parse(localStorage.getItem('flowstate_stats') || '{}');
    if (s.date !== today) return { pomodoros:0, focusMinutes:0, streak:0, date:today };
    return s;
  } catch { return { pomodoros:0, focusMinutes:0, streak:0, date:today }; }
}

// ============================================================
//  INIT
// ============================================================
tasks = loadTasks();
setMode('pomodoro');
updateDisplay();
renderTasks();
updateStats();
