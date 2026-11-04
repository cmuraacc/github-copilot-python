// Client-side rendering and interaction for the Flask-backed Sudoku
const SIZE = 9;
const SCORE_STORAGE_KEY = 'sudoku-top-10-v3';
const ADJUSTED_SCORE_STORAGE_KEY = 'sudoku-top-10-v2';
const LEGACY_SCORE_STORAGE_KEY = 'sudoku-top-10-v1';
const THEME_STORAGE_KEY = 'sudoku-theme';
const PLAYER_NAME_STORAGE_KEY = 'sudoku-player-name';
const DIFFICULTIES = ['easy', 'medium', 'hard'];
let puzzle = [];
let currentDifficulty = null;
let hintMode = 'hard';
let gameDifficulty = 'medium';
let puzzleVersion = 0;
let boardCheckVersion = 0;
let completedGroups = new Set();
const completionTimers = new Map();
let timerStartedAt = null;
let timerInterval = null;
let elapsedMs = 0;
let hintsUsed = 0;
let gameCompleted = false;
const checkHighlightTimers = new Map();

function formatTime(milliseconds) {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function showMessage(text, type = '') {
  const message = document.getElementById('message');
  message.classList.remove('status-error', 'status-success', 'status-info');
  if (type) message.classList.add(`status-${type}`);
  message.textContent = text;
}

function getDifficultyName(clues) {
  return {'45': 'easy', '35': 'medium', '25': 'hard'}[String(clues)] || 'medium';
}

function savePlayerName(name) {
  try {
    localStorage.setItem(PLAYER_NAME_STORAGE_KEY, name);
    updatePlayerNameDisplay(name);
  } catch (error) {
    console.error('Unable to save player name:', error);
    showMessage('Your name could not be saved in browser storage.', 'error');
  }
}

function updatePlayerNameDisplay(name) {
  document.getElementById('active-player-name').textContent = name || 'Player';
}

function initializePlayerName() {
  const nameInput = document.getElementById('player-name');
  try {
    nameInput.value = localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || '';
    updatePlayerNameDisplay(nameInput.value.trim());
  } catch (error) {
    console.error('Unable to read player name:', error);
    updatePlayerNameDisplay('');
    showMessage('Your saved name could not be loaded from browser storage.', 'error');
  }
  nameInput.addEventListener('input', () => savePlayerName(nameInput.value.trim()));
}

function applyTheme(theme) {
  const darkMode = theme === 'dark';
  document.documentElement.dataset.theme = theme;
  const button = document.getElementById('theme-toggle');
  button.setAttribute('aria-pressed', String(darkMode));
  button.textContent = `Dark mode: ${darkMode ? 'On' : 'Off'}`;
  button.title = `Switch to ${darkMode ? 'light' : 'dark'} mode`;
}

function initializeTheme() {
  const systemPreference = window.matchMedia('(prefers-color-scheme: dark)');
  let savedTheme = null;
  try {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === 'dark' || storedTheme === 'light') savedTheme = storedTheme;
  } catch (error) {
    console.error('Unable to read theme preference:', error);
  }

  let followsSystem = savedTheme === null;
  applyTheme(savedTheme || (systemPreference.matches ? 'dark' : 'light'));
  systemPreference.addEventListener('change', (event) => {
    if (followsSystem) applyTheme(event.matches ? 'dark' : 'light');
  });

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    followsSystem = false;
    applyTheme(nextTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch (error) {
      console.error('Unable to save theme preference:', error);
    }
  });
}

function updateTimerDisplay() {
  const currentElapsed = timerStartedAt === null ? elapsedMs : performance.now() - timerStartedAt;
  document.getElementById('timer').textContent = formatTime(currentElapsed);
}

function startGameTimer() {
  if (timerInterval !== null) clearInterval(timerInterval);
  elapsedMs = 0;
  timerStartedAt = performance.now();
  updateTimerDisplay();
  timerInterval = setInterval(updateTimerDisplay, 250);
}

function stopGameTimer() {
  if (timerStartedAt !== null) {
    elapsedMs = performance.now() - timerStartedAt;
    timerStartedAt = null;
  }
  if (timerInterval !== null) clearInterval(timerInterval);
  timerInterval = null;
  updateTimerDisplay();
  return elapsedMs;
}

function readScores() {
  let stored = {};
  try {
    const savedScores = localStorage.getItem(SCORE_STORAGE_KEY);
    if (savedScores !== null) {
      stored = JSON.parse(savedScores) || {};
    } else {
      const adjustedScores = localStorage.getItem(ADJUSTED_SCORE_STORAGE_KEY);
      const scoresToMigrate = adjustedScores === null
        ? JSON.parse(localStorage.getItem(LEGACY_SCORE_STORAGE_KEY) || '{}') || {}
        : JSON.parse(adjustedScores) || {};
      stored = Object.fromEntries(DIFFICULTIES.map((difficulty) => {
        const entries = Array.isArray(scoresToMigrate[difficulty]) ? scoresToMigrate[difficulty] : [];
        return [difficulty, entries.map((entry) => {
          if (!entry || !Number.isFinite(entry.timeMs) || !Number.isInteger(entry.hintsUsed)) return entry;
          const penaltyMs = entry.hintsUsed * 30000;
          const elapsedTimeMs = adjustedScores === null ? entry.timeMs : Math.max(0, entry.timeMs - penaltyMs);
          const adjustedTimeMs = adjustedScores === null ? entry.timeMs + penaltyMs : entry.timeMs;
          return {...entry, elapsedTimeMs, adjustedTimeMs};
        })];
      }));
      localStorage.setItem(SCORE_STORAGE_KEY, JSON.stringify(stored));
    }
  } catch (error) {
    console.error('Unable to read Sudoku scores:', error);
    stored = {};
    showMessage('Saved rankings could not be loaded from browser storage.', 'error');
  }
  return Object.fromEntries(DIFFICULTIES.map((difficulty) => {
    const entries = Array.isArray(stored[difficulty]) ? stored[difficulty] : [];
    const validEntries = entries.filter((entry) => entry
      && typeof entry.name === 'string'
      && Number.isFinite(entry.elapsedTimeMs)
      && entry.elapsedTimeMs >= 0
      && Number.isFinite(entry.adjustedTimeMs)
      && entry.adjustedTimeMs >= entry.elapsedTimeMs
      && DIFFICULTIES.includes(entry.difficulty)
      && Number.isInteger(entry.hintsUsed)
      && entry.hintsUsed >= 0
    ).sort((first, second) => first.adjustedTimeMs - second.adjustedTimeMs);
    return [difficulty, validEntries.slice(0, 10)];
  }));
}

function renderLeaderboard() {
  const difficulty = getDifficultyName(document.getElementById('difficulty').value);
  const entries = readScores()[difficulty];
  const title = document.getElementById('leaderboard-title');
  const table = document.getElementById('leaderboard-table');
  const emptyMessage = document.getElementById('leaderboard-empty');
  const body = document.getElementById('leaderboard-body');
  document.getElementById('clear-ranking').disabled = entries.length === 0;
  title.textContent = `Top 10: ${difficulty[0].toUpperCase()}${difficulty.slice(1)}`;
  table.hidden = entries.length === 0;
  emptyMessage.hidden = entries.length > 0;
  body.replaceChildren();

  entries.forEach((entry, index) => {
    const row = document.createElement('tr');
    [
      String(index + 1),
      entry.name,
      formatTime(entry.elapsedTimeMs),
      formatTime(entry.adjustedTimeMs),
      `${entry.difficulty[0].toUpperCase()}${entry.difficulty.slice(1)}`,
      String(entry.hintsUsed)
    ].forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.appendChild(cell);
    });
    body.appendChild(row);
  });
}

function recordFinish(elapsedTimeMs, adjustedTimeMs, completionMessage) {
  const scores = readScores();
  const entries = scores[gameDifficulty];
  if (entries.length < 10 || adjustedTimeMs < entries[entries.length - 1].adjustedTimeMs) {
    const nameInput = document.getElementById('player-name');
    let name = nameInput.value.trim().slice(0, 30);
    if (!name) {
      const enteredName = window.prompt(
        `${completionMessage}\n\nNew ${gameDifficulty} Top 10 time! Enter your name:`,
        ''
      );
      if (enteredName === null) {
        renderLeaderboard();
        return;
      }
      name = enteredName.trim().slice(0, 30);
      if (!name) {
        window.alert('A name is required to save this ranking.');
        renderLeaderboard();
        return;
      }
      nameInput.value = name;
      savePlayerName(name);
    } else {
      savePlayerName(name);
      window.alert(`${completionMessage}\n\nTop 10 score saved under ${name}.`);
    }
    entries.push({
      name,
      elapsedTimeMs,
      adjustedTimeMs,
      difficulty: gameDifficulty,
      hintsUsed
    });
    entries.sort((first, second) => first.adjustedTimeMs - second.adjustedTimeMs);
    scores[gameDifficulty] = entries.slice(0, 10);
    try {
      localStorage.setItem(SCORE_STORAGE_KEY, JSON.stringify(scores));
    } catch (error) {
      console.error('Unable to save Sudoku scores:', error);
      showMessage('Your finish could not be saved to the local leaderboard.', 'error');
    }
  } else {
    window.alert(completionMessage);
  }
  renderLeaderboard();
}

function clearCurrentRanking() {
  const difficulty = getDifficultyName(document.getElementById('difficulty').value);
  if (!window.confirm(`Clear the ${difficulty} Top 10 ranking on this device?`)) return;

  const scores = readScores();
  scores[difficulty] = [];
  try {
    localStorage.setItem(SCORE_STORAGE_KEY, JSON.stringify(scores));
    renderLeaderboard();
  } catch (error) {
    console.error('Unable to clear Sudoku ranking:', error);
    showMessage('Unable to clear the ranking in local storage.', 'error');
  }
}

function completeGame() {
  if (gameCompleted) return;
  gameCompleted = true;
  const elapsedTimeMs = stopGameTimer();
  const adjustedTimeMs = elapsedTimeMs + hintsUsed * 30000;
  showMessage('');
  const hintSummary = `${hintsUsed} hint${hintsUsed === 1 ? '' : 's'} used`;
  const completionMessage = `Congratulations! You completed ${gameDifficulty} sudoku in ${formatTime(elapsedTimeMs)}\n${hintSummary}\nAdjusted time: ${formatTime(adjustedTimeMs)}`;
  recordFinish(elapsedTimeMs, adjustedTimeMs, completionMessage);
}

function getCurrentBoard() {
  const inputs = document.querySelectorAll('#sudoku-board .sudoku-cell');
  const board = [];
  for (let row = 0; row < SIZE; row++) {
    board[row] = [];
    for (let col = 0; col < SIZE; col++) {
      const value = inputs[row * SIZE + col].value;
      board[row][col] = value ? Number(value) : 0;
    }
  }
  return board;
}

function highlightMatchingCells(value) {
  const inputs = document.querySelectorAll('#sudoku-board .sudoku-cell');
  const alreadyHighlighted = Boolean(value) && Array.from(inputs).some((input) =>
    input.value === value && input.classList.contains('same-number-highlight')
  );
  for (const input of inputs) {
    input.classList.toggle(
      'same-number-highlight',
      Boolean(value) && !alreadyHighlighted && input.value === value
    );
  }
  const selectedNumber = Boolean(value) && !alreadyHighlighted ? value : '';
  document.querySelectorAll('.number-choice').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.number === selectedNumber));
  });
}

function clearMatchingHighlights() {
  document.querySelectorAll('.same-number-highlight').forEach((cell) => {
    cell.classList.remove('same-number-highlight');
  });
  document.querySelectorAll('.number-choice').forEach((button) => {
    button.setAttribute('aria-pressed', 'false');
  });
}

function updateNumberHighlights(board) {
  document.querySelectorAll('.number-choice').forEach((button) => {
    const value = Number(button.dataset.number);
    const count = board.reduce((total, row) => total + row.filter((cell) => cell === value).length, 0);
    const complete = count === SIZE;
    button.classList.toggle('is-complete', complete);
    button.setAttribute('aria-label', `Number ${value}: ${count} of 9 filled${complete ? ', complete' : ''}`);
  });
}

function clearHintHighlights() {
  document.querySelectorAll('.hint-target, .hint-support').forEach((cell) => {
    cell.classList.remove('hint-target', 'hint-support');
  });
}

function clearCheckResultHighlights() {
  for (const timer of checkHighlightTimers.values()) clearTimeout(timer);
  checkHighlightTimers.clear();
  document.querySelectorAll('.check-result-highlight').forEach((cell) => {
    cell.classList.remove('check-result-highlight');
  });
}

function flashIncorrectCells(indices) {
  const cells = document.querySelectorAll('#sudoku-board .sudoku-cell');
  const version = puzzleVersion;
  for (const index of indices) {
    const cell = cells[index];
    if (!cell) continue;
    clearTimeout(checkHighlightTimers.get(cell));
    cell.classList.add('check-result-highlight');
    checkHighlightTimers.set(cell, setTimeout(() => {
      if (version === puzzleVersion) cell.classList.remove('check-result-highlight');
      checkHighlightTimers.delete(cell);
    }, 3000));
  }
}

function updateConflictHighlights(board) {
  const inputs = document.querySelectorAll('#sudoku-board .sudoku-cell');
  const conflicts = new Set();
  const markDuplicates = (cells) => {
    const seen = new Map();
    cells.forEach(({row, col}) => {
      const value = board[row][col];
      if (!value) return;
      const cell = inputs[row * SIZE + col];
      const previous = seen.get(value);
      if (previous) {
        conflicts.add(cell);
        previous.forEach((previousCell) => conflicts.add(previousCell));
      } else {
        seen.set(value, [cell]);
      }
    });
  };

  for (let index = 0; index < SIZE; index++) {
    markDuplicates(Array.from({length: SIZE}, (_, col) => ({row: index, col})));
    markDuplicates(Array.from({length: SIZE}, (_, row) => ({row, col: index})));
  }
  for (let boxRow = 0; boxRow < 3; boxRow++) {
    for (let boxCol = 0; boxCol < 3; boxCol++) {
      const cells = [];
      for (let row = boxRow * 3; row < boxRow * 3 + 3; row++) {
        for (let col = boxCol * 3; col < boxCol * 3 + 3; col++) {
          cells.push({row, col});
        }
      }
      markDuplicates(cells);
    }
  }

  inputs.forEach((cell) => cell.classList.toggle('conflict', conflicts.has(cell)));
}

function getCompletedGroups(board, incorrect) {
  const groups = [];
  const addGroup = (key, cells) => {
    if (cells.every(({row, col}) => board[row][col] !== 0 && !incorrect.has(row * SIZE + col))) {
      groups.push({key, cells});
    }
  };

  for (let row = 0; row < SIZE; row++) {
    addGroup(`row:${row}`, Array.from({length: SIZE}, (_, col) => ({row, col})));
  }
  for (let col = 0; col < SIZE; col++) {
    addGroup(`column:${col}`, Array.from({length: SIZE}, (_, row) => ({row, col})));
  }
  for (let boxRow = 0; boxRow < 3; boxRow++) {
    for (let boxCol = 0; boxCol < 3; boxCol++) {
      const cells = [];
      for (let row = boxRow * 3; row < boxRow * 3 + 3; row++) {
        for (let col = boxCol * 3; col < boxCol * 3 + 3; col++) {
          cells.push({row, col});
        }
      }
      addGroup(`box:${boxRow}:${boxCol}`, cells);
    }
  }
  for (let value = 1; value <= SIZE; value++) {
    const cells = [];
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        if (board[row][col] === value) cells.push({row, col});
      }
    }
    if (cells.length === SIZE) addGroup(`number:${value}`, cells);
  }
  return groups;
}

function clearCompletionHighlights() {
  for (const timer of completionTimers.values()) clearTimeout(timer);
  completionTimers.clear();
  document.querySelectorAll('.completion-highlight').forEach((cell) => {
    cell.classList.remove('completion-highlight');
  });
}

function flashCompletedGroup(group) {
  const inputs = document.querySelectorAll('#sudoku-board .sudoku-cell');
  const cells = group.cells.map(({row, col}) => inputs[row * SIZE + col]);
  const version = puzzleVersion;
  cells.forEach((cell) => {
    cell.classList.add('completion-highlight');
    clearTimeout(completionTimers.get(cell));
    completionTimers.set(cell, setTimeout(() => {
      if (version === puzzleVersion) cell.classList.remove('completion-highlight');
      completionTimers.delete(cell);
    }, 2200));
  });
}

async function checkBoard(board) {
  updateNumberHighlights(board);
  updateConflictHighlights(board);
  const version = puzzleVersion;
  const checkVersion = ++boardCheckVersion;
  const response = await fetch('/check', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({board})
  });
  let result;
  try {
    result = await response.json();
  } catch (error) {
    throw new Error('The server returned an invalid board-check response.', {cause: error});
  }
  if (!response.ok) throw new Error(result.error || 'Unable to check this board.');
  if (!Array.isArray(result.incorrect) || typeof result.complete !== 'boolean') {
    throw new Error('The server returned an invalid board-check response.');
  }
  if (version !== puzzleVersion || checkVersion !== boardCheckVersion) return null;

  const incorrect = new Set(result.incorrect.map(([row, col]) => row * SIZE + col));
  const inputs = document.querySelectorAll('#sudoku-board .sudoku-cell');
  inputs.forEach((input, index) => {
    input.classList.toggle('incorrect', Boolean(input.value) && incorrect.has(index));
  });
  if (result.complete) completeGame();

  const groups = getCompletedGroups(board, incorrect);
  const currentGroups = new Set(groups.map((group) => group.key));
  groups.forEach((group) => {
    if (!completedGroups.has(group.key)) flashCompletedGroup(group);
  });
  completedGroups = currentGroups;
  return result;
}

function createBoardElement() {
  const boardDiv = document.getElementById('sudoku-board');
  boardDiv.innerHTML = '';
  for (let i = 0; i < SIZE; i++) {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'sudoku-row';
    for (let j = 0; j < SIZE; j++) {
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 1;
      const boxTone = (Math.floor(i / 3) + Math.floor(j / 3)) % 2 === 0 ? 'box-tone-a' : 'box-tone-b';
      input.className = `sudoku-cell ${boxTone}`;
      input.dataset.row = i;
      input.dataset.col = j;
      input.addEventListener('click', () => highlightMatchingCells(input.value));
      input.addEventListener('input', async (event) => {
        const cell = event.target;
        const value = cell.value.replace(/[^1-9]/g, '');
        cell.value = value;
        clearMatchingHighlights();
        clearHintHighlights();
        cell.classList.remove('check-result-highlight');
        clearTimeout(checkHighlightTimers.get(cell));
        checkHighlightTimers.delete(cell);
        try {
          await checkBoard(getCurrentBoard());
        } catch (error) {
          console.error('Unable to check Sudoku board:', error);
          showMessage(error.message || 'Unable to check this board.', 'error');
        }
      });
      rowDiv.appendChild(input);
    }
    boardDiv.appendChild(rowDiv);
  }
}

function renderPuzzle(puz) {
  puzzle = puz;
  clearCompletionHighlights();
  clearMatchingHighlights();
  clearHintHighlights();
  clearCheckResultHighlights();
  createBoardElement();
  const boardDiv = document.getElementById('sudoku-board');
  const inputs = boardDiv.getElementsByTagName('input');
  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE; j++) {
      const idx = i * SIZE + j;
      const val = puzzle[i][j];
      const inp = inputs[idx];
      if (val !== 0) {
        inp.value = val;
        inp.readOnly = true;
        inp.className += ' prefilled';
      } else {
        inp.value = '';
        inp.readOnly = false;
      }
    }
  }
  completedGroups = new Set(getCompletedGroups(getCurrentBoard(), new Set()).map((group) => group.key));
  updateNumberHighlights(getCurrentBoard());
}

async function newGame() {
  const version = ++puzzleVersion;
  boardCheckVersion++;
  const clues = document.getElementById('difficulty').value;
  try {
    const response = await fetch(`/new?clues=${encodeURIComponent(clues)}`);
    let data;
    try {
      data = await response.json();
    } catch (error) {
      throw new Error('The server returned an invalid puzzle response.', {cause: error});
    }
    if (!response.ok) throw new Error(data.error || 'Unable to start a new game.');
    if (!Array.isArray(data.puzzle) || data.puzzle.length !== SIZE
        || data.puzzle.some((row) => !Array.isArray(row) || row.length !== SIZE
          || row.some((value) => !Number.isInteger(value) || value < 0 || value > SIZE))) {
      throw new Error('The server returned an invalid puzzle.');
    }
    if (version !== puzzleVersion) return;

    stopGameTimer();
    renderPuzzle(data.puzzle);
    currentDifficulty = clues;
    gameDifficulty = getDifficultyName(clues);
    document.getElementById('active-difficulty').textContent =
      `${gameDifficulty[0].toUpperCase()}${gameDifficulty.slice(1)}`;
    hintsUsed = 0;
    gameCompleted = false;
    startGameTimer();
    showMessage('');
    renderLeaderboard();
  } catch (error) {
    console.error('Unable to start a Sudoku game:', error);
    if (version === puzzleVersion) showMessage(error.message || 'Unable to start a new game.', 'error');
  }
}

async function checkSolution() {
  clearCheckResultHighlights();
  let data;
  try {
    data = await checkBoard(getCurrentBoard());
  } catch (error) {
    console.error('Unable to check Sudoku solution:', error);
    showMessage(error.message || 'Unable to check this board.', 'error');
    return;
  }
  if (!data) return;
  const msg = document.getElementById('message');
  msg.classList.remove('status-error', 'status-success', 'status-info');
  if (data.error) {
    msg.classList.add('status-error');
    msg.innerText = data.error;
    return;
  }
  const incorrect = new Set(data.incorrect.map(x => x[0]*SIZE + x[1]));
  if (data.complete) {
    return;
  }
  if (incorrect.size === 0) {
    msg.classList.add('status-info');
    msg.innerText = 'No incorrect filled cells yet. The puzzle is incomplete.';
    return;
  }

  flashIncorrectCells(incorrect);
  const firstIncorrectIndex = incorrect.values().next().value;
  document.querySelectorAll('#sudoku-board .sudoku-cell')[firstIncorrectIndex].focus();
  msg.classList.add('status-error');
  msg.innerText = 'Incorrect cells are highlighted for 3 seconds.';
}

async function requestHint() {
  clearHintHighlights();
  showMessage('');
  const board = getCurrentBoard();
  const boardSnapshot = JSON.stringify(board);
  const version = puzzleVersion;
  try {
    const response = await fetch('/hint', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({board})
    });
    const data = await response.json();
    if (version !== puzzleVersion || boardSnapshot !== JSON.stringify(getCurrentBoard())) return;
    if (!response.ok || data.error) {
      showMessage(data.error || 'Unable to get a hint.', 'error');
      return;
    }
    if (!data.hint) {
      showMessage(data.message || 'No supported single-step hint is available.', 'info');
      return;
    }

    const hint = data.hint;
    hintsUsed++;
    const inputs = document.querySelectorAll('#sudoku-board .sudoku-cell');
    const target = inputs[hint.row * SIZE + hint.col];
    target.classList.add('hint-target');
    hint.support.forEach(([row, col]) => {
      inputs[row * SIZE + col].classList.add('hint-support');
    });

    if (hintMode === 'hard') {
      target.value = String(hint.value);
      target.readOnly = true;
      target.classList.remove('incorrect');
      try {
        await checkBoard(getCurrentBoard());
      } catch (error) {
        console.error('Unable to refresh the board after applying a hint:', error);
        showMessage('Hint applied, but board feedback could not be refreshed.', 'error');
      }
    }

  } catch (error) {
    console.error('Unable to get Sudoku hint:', error);
    showMessage('Unable to get a hint right now.', 'error');
  }
}

// Wire buttons
window.addEventListener('load', () => {
  const difficultySelect = document.getElementById('difficulty');
  initializeTheme();
  currentDifficulty = difficultySelect.value;
  renderLeaderboard();
  difficultySelect.addEventListener('change', () => {
    if (window.confirm('Start a new game with this difficulty?')) {
      renderLeaderboard();
      newGame();
    } else {
      difficultySelect.value = currentDifficulty;
    }
  });
  document.getElementById('new-game').addEventListener('click', newGame);
  document.getElementById('check-solution').addEventListener('click', checkSolution);
  document.getElementById('clear-ranking').addEventListener('click', clearCurrentRanking);
  const settingsDialog = document.getElementById('settings-dialog');
  const settingsView = document.getElementById('settings-view');
  const leaderboardView = document.getElementById('leaderboard-view');
  document.getElementById('open-settings').addEventListener('click', () => {
    settingsView.hidden = false;
    leaderboardView.hidden = true;
    settingsDialog.setAttribute('aria-labelledby', 'settings-title');
    settingsDialog.showModal();
  });
  document.getElementById('close-settings').addEventListener('click', () => settingsDialog.close());
  document.getElementById('close-ranking').addEventListener('click', () => settingsDialog.close());
  document.getElementById('open-ranking').addEventListener('click', () => {
    renderLeaderboard();
    settingsView.hidden = true;
    leaderboardView.hidden = false;
    settingsDialog.setAttribute('aria-labelledby', 'ranking-title');
  });
  document.getElementById('back-to-settings').addEventListener('click', () => {
    leaderboardView.hidden = true;
    settingsView.hidden = false;
    settingsDialog.setAttribute('aria-labelledby', 'settings-title');
  });
  settingsDialog.addEventListener('click', (event) => {
    if (event.target === settingsDialog) settingsDialog.close();
  });
  initializePlayerName();
  document.querySelectorAll('.number-choice').forEach((button) => {
    button.addEventListener('click', () => highlightMatchingCells(button.dataset.number));
  });
  const hintModeButton = document.getElementById('hint-mode');
  const hintButton = document.getElementById('hint-action');
  hintModeButton.addEventListener('click', () => {
    hintMode = hintMode === 'hard' ? 'light' : 'hard';
    const hardMode = hintMode === 'hard';
    hintModeButton.setAttribute('aria-pressed', String(!hardMode));
    hintModeButton.textContent = `Hint mode: ${hardMode ? 'Hard' : 'Light'}`;
    hintModeButton.title = `Switch to ${hardMode ? 'light' : 'hard'} hints`;
    clearHintHighlights();
  });
  hintButton.addEventListener('click', requestHint);
  const highlightButton = document.getElementById('toggle-highlights');
  const numberHighlights = document.getElementById('number-highlights');
  highlightButton.addEventListener('click', () => {
    const enabled = highlightButton.getAttribute('aria-pressed') !== 'true';
    highlightButton.setAttribute('aria-pressed', String(enabled));
    highlightButton.textContent = `Highlights: ${enabled ? 'On' : 'Off'}`;
    highlightButton.title = enabled ? 'Turn highlights off' : 'Turn highlights on';
    document.body.classList.toggle('highlights-off', !enabled);
    numberHighlights.hidden = !enabled;
  });
  // initialize
  newGame();
});