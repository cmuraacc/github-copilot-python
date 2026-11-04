import functools
import random
import sys
import unittest
from pathlib import Path

STARTER_DIR = Path(__file__).resolve().parents[1]
if str(STARTER_DIR) not in sys.path:
    sys.path.insert(0, str(STARTER_DIR))

SIZE = 9
EMPTY = 0
DIFFICULTIES = (('easy', 45), ('medium', 35), ('hard', 25))

try:
    import sudoku_logic
except Exception as error:
    sudoku_logic = None
    SUDOKU_LOGIC_IMPORT_ERROR = error
else:
    SUDOKU_LOGIC_IMPORT_ERROR = None

try:
    from app import CURRENT as APP_CURRENT
    from app import app as FLASK_APP
except Exception as error:
    APP_CURRENT = {}
    FLASK_APP = None
    FLASK_APP_IMPORT_ERROR = error
else:
    FLASK_APP_IMPORT_ERROR = None


def read_source(relative_path):
    try:
        return (STARTER_DIR / relative_path).read_text(encoding='utf-8')
    except (OSError, UnicodeError):
        return ''


MAIN_JS = read_source(Path('static') / 'main.js')
STYLES_CSS = read_source(Path('static') / 'styles.css')
INDEX_HTML = read_source(Path('templates') / 'index.html')


def count_solutions(board, limit=2):
    """Count solutions up to limit using backtracking in test code only."""
    if not is_valid_partial_board(board): 
        return 0

    best_cell = None
    best_candidates = None
    for row in range(SIZE):
        for col in range(SIZE):
            if board[row][col] != EMPTY:
                continue
            candidates = candidates_for(board, row, col)
            if not candidates:
                return 0
            if best_candidates is None or len(candidates) < len(best_candidates):
                best_cell = (row, col)
                best_candidates = candidates
                if len(candidates) == 1:
                    break
        if best_candidates is not None and len(best_candidates) == 1:
            break

    if best_cell is None:
        return 1

    row, col = best_cell
    solution_count = 0
    for value in sorted(best_candidates):
        board[row][col] = value
        solution_count += count_solutions(board, limit - solution_count)
        board[row][col] = EMPTY
        if solution_count >= limit:
            break
    return solution_count


def has_no_duplicates(values):
    filled = [value for value in values if value != EMPTY]
    return len(filled) == len(set(filled))


def is_well_formed_board(board):
    return (
        isinstance(board, list)
        and len(board) == SIZE
        and all(isinstance(row, list) and len(row) == SIZE for row in board)
        and all(type(value) is int and EMPTY <= value <= SIZE for row in board for value in row)
    )


def is_valid_partial_board(board):
    if not is_well_formed_board(board):
        return False
    if any(not has_no_duplicates(row) for row in board):
        return False
    if any(not has_no_duplicates([board[row][col] for row in range(SIZE)]) for col in range(SIZE)):
        return False
    for box_row in range(0, SIZE, 3):
        for box_col in range(0, SIZE, 3):
            cells = [
                board[row][col]
                for row in range(box_row, box_row + 3)
                for col in range(box_col, box_col + 3)
            ]
            if not has_no_duplicates(cells):
                return False
    return True


def candidates_for(board, row, col):
    used = set(board[row])
    used.update(board[index][col] for index in range(SIZE))
    box_row = row - row % 3
    box_col = col - col % 3
    used.update(
        board[box_row + row_offset][box_col + col_offset]
        for row_offset in range(3)
        for col_offset in range(3)
    )
    return set(range(1, SIZE + 1)) - used 

def is_complete_valid_solution(board):
    return (
        is_well_formed_board(board)
        and all(EMPTY not in row and len(set(row)) == SIZE for row in board)
        and all(len({board[row][col] for row in range(SIZE)}) == SIZE for col in range(SIZE))
        and all(
            len({
                board[row][col]
                for row in range(box_row, box_row + 3)
                for col in range(box_col, box_col + 3)
            }) == SIZE
            for box_row in range(0, SIZE, 3)
            for box_col in range(0, SIZE, 3)
        )
    )

def feature_test(method):
    @functools.wraps(method)
    def run(self):
        try:
            return method(self)
        except AssertionError:
            raise
        except Exception as error:
            self.fail(f'{method.__name__} raised {type(error).__name__}: {error}')
    return run


class SudokuFeatureTests(unittest.TestCase):
    _puzzles = None
    _puzzle_generation_error = None

    def generated_puzzles(self):
        cls = type(self)
        if cls._puzzle_generation_error:
            self.fail(f'Puzzle generation prerequisite failed: {cls._puzzle_generation_error}')
        if cls._puzzles is not None:
            return cls._puzzles
        if sudoku_logic is None:
            self.fail(f'Missing sudoku_logic module: {SUDOKU_LOGIC_IMPORT_ERROR}')
        generator = getattr(sudoku_logic, 'generate_puzzle', None)
        if not callable(generator):
            self.fail('Missing sudoku_logic.generate_puzzle(), required to test puzzle rules and difficulty.')

        random_module = getattr(sudoku_logic, 'random', None)
        random_state = random_module.getstate() if hasattr(random_module, 'getstate') else None
        puzzles = {}
        try:
            if random_state is not None:
                random_module.seed(20261103)
            for difficulty, clues in DIFFICULTIES:
                puzzles[difficulty] = generator(clues)
        except Exception as error:
            cls._puzzle_generation_error = f'{type(error).__name__}: {error}'
            self.fail(f'sudoku_logic.generate_puzzle() failed: {cls._puzzle_generation_error}')
        finally:
            if random_state is not None:
                random_module.setstate(random_state)

        for difficulty, result in puzzles.items():
            if not isinstance(result, (tuple, list)) or len(result) != 2:
                self.fail(f'generate_puzzle() must return (puzzle, solution) for {difficulty}.')
            if not all(is_well_formed_board(board) for board in result):
                self.fail(f'generate_puzzle() returned a malformed board for {difficulty}.')
        cls._puzzles = puzzles
        return cls._puzzles

    def require_logic_function(self, name, feature):
        if sudoku_logic is None:
            self.fail(f'Missing sudoku_logic module: {SUDOKU_LOGIC_IMPORT_ERROR}')
        function = getattr(sudoku_logic, name, None)
        if not callable(function):
            self.fail(f'Missing sudoku_logic.{name}(), required for {feature}.')
        return function

    def client(self):
        if FLASK_APP is None:
            self.fail(f'Flask app could not be imported: {FLASK_APP_IMPORT_ERROR}')
        try:
            return FLASK_APP.test_client()
        except Exception as error:
            self.fail(f'Unable to create Flask test client: {type(error).__name__}: {error}')

    def response_json(self, response, feature):
        if not response.is_json:
            body = response.get_data(as_text=True)[:200]
            self.fail(f'{feature} returned HTTP {response.status_code}, not JSON: {body!r}')
        data = response.get_json(silent=True)
        if not isinstance(data, dict):
            self.fail(f'{feature} returned invalid JSON: {data!r}')
        if response.status_code != 200:
            self.fail(f'{feature} returned HTTP {response.status_code}: {data.get("error", data)!r}')
        return data

    def assert_source_contains(self, source, filename, snippet, feature):
        if not source:
            self.fail(f'Missing or unreadable {filename}, required for {feature}.')
        if snippet not in source:
            self.fail(f'Missing {feature} in {filename}: expected {snippet!r}.')

    def assert_source_has_one_of(self, source, filename, snippets, feature):
        if not source:
            self.fail(f'Missing or unreadable {filename}, required for {feature}.')
        self.assertTrue(
            any(snippet in source for snippet in snippets),
            f'Missing {feature} implementation in {filename}; expected one of {snippets!r}.'
        )

    @feature_test
    def test_rows_contain_no_duplicate_digits(self):
        for difficulty, (puzzle, solution) in self.generated_puzzles().items():
            for board_name, board in (('puzzle', puzzle), ('solution', solution)):
                for row_index, row in enumerate(board):
                    with self.subTest(difficulty=difficulty, board=board_name, row=row_index):
                        self.assertTrue(has_no_duplicates(row), f'{difficulty} {board_name} row {row_index + 1} has duplicates.')

    @feature_test
    def test_columns_contain_no_duplicate_digits(self):
        for difficulty, (puzzle, solution) in self.generated_puzzles().items():
            for board_name, board in (('puzzle', puzzle), ('solution', solution)):
                for col in range(SIZE):
                    values = [board[row][col] for row in range(SIZE)]
                    with self.subTest(difficulty=difficulty, board=board_name, column=col):
                        self.assertTrue(has_no_duplicates(values), f'{difficulty} {board_name} column {col + 1} has duplicates.')

    @feature_test
    def test_three_by_three_subsquares_contain_no_duplicate_digits(self):
        for difficulty, (puzzle, solution) in self.generated_puzzles().items():
            for board_name, board in (('puzzle', puzzle), ('solution', solution)):
                for box_row in range(0, SIZE, 3):
                    for box_col in range(0, SIZE, 3):
                        values = [board[row][col] for row in range(box_row, box_row + 3)
                                  for col in range(box_col, box_col + 3)]
                        with self.subTest(difficulty=difficulty, board=board_name, box=(box_row, box_col)):
                            self.assertTrue(has_no_duplicates(values), f'{difficulty} {board_name} subsquare has duplicates.')

    @feature_test
    def test_difficulty_levels_set_the_prefilled_clue_count(self):
        for difficulty, clue_count in DIFFICULTIES:
            puzzle, _ = self.generated_puzzles()[difficulty]
            actual = sum(value != EMPTY for row in puzzle for value in row)
            with self.subTest(difficulty=difficulty):
                self.assertEqual(actual, clue_count, f'Expected {clue_count} prefilled cells; found {actual}.')

    @feature_test
    def test_generated_puzzles_have_valid_complete_solutions(self):
        solve_with_logic = self.require_logic_function('solve_with_logic', 'logic-only puzzle solvability')
        for difficulty, (puzzle, solution) in self.generated_puzzles().items():
            with self.subTest(difficulty=difficulty):
                self.assertTrue(is_complete_valid_solution(solution), f'{difficulty} solution is incomplete or invalid.')
                try:
                    logical_solution = solve_with_logic([row[:] for row in puzzle])
                except Exception as error:
                    self.fail(f'solve_with_logic raised {type(error).__name__}: {error}')
                self.assertEqual(logical_solution, solution, f'{difficulty} puzzle is not solvable with the hint logic.')

    @feature_test
    def test_generated_puzzles_have_exactly_one_solution(self):
        for difficulty, (puzzle, _) in self.generated_puzzles().items():
            with self.subTest(difficulty=difficulty):
                self.assertEqual(count_solutions([row[:] for row in puzzle]), 1, 'Puzzle must have exactly one solution.')

    @feature_test
    def test_prefilled_and_hard_hint_cells_are_locked_in_client(self):
        self.assert_source_has_one_of(MAIN_JS, 'static/main.js',
                                      ('inp.readOnly = true;', 'inp.disabled = true;'), 'prefilled-cell locking')
        self.assert_source_has_one_of(MAIN_JS, 'static/main.js',
                                      ('target.readOnly = true;', 'target.disabled = true;'), 'hard-hint locking')

    @feature_test
    def test_difficulty_select_has_easy_medium_and_hard_options(self):
        for value, label in (('45', 'Easy'), ('35', 'Medium'), ('25', 'Hard')):
            with self.subTest(difficulty=label):
                self.assert_source_contains(
                    INDEX_HTML, 'templates/index.html', f'<option value="{value}"',
                    f'{label} difficulty option with {value} clues'
                )
                self.assert_source_contains(
                    INDEX_HTML, 'templates/index.html', f'>{label}</option>',
                    f'visible {label} difficulty label'
                )
        for difficulty, clues in DIFFICULTIES:
            self.assertEqual(sum(value != EMPTY for row in self.generated_puzzles()[difficulty][0] for value in row), clues)

    @feature_test
    def test_hint_endpoint_returns_a_correct_fillable_cell(self):
        client = self.client()
        new_game = self.response_json(client.get('/new?clues=80'), 'Creating a one-empty-cell puzzle')
        puzzle = new_game.get('puzzle')
        solution = APP_CURRENT.get('solution')
        if not is_well_formed_board(puzzle):
            self.fail('New-game endpoint is missing or returned a malformed puzzle.')
        if not is_complete_valid_solution(solution):
            self.fail('New-game endpoint did not retain a valid solution for checking hints.')
        data = self.response_json(client.post('/hint', json={'board': puzzle}), 'Requesting a hint')
        hint = data.get('hint')
        if not isinstance(hint, dict):
            self.fail(f'Hint endpoint is missing or returned no deduction: {data.get("message", data)!r}')
        row, col, value = hint.get('row'), hint.get('col'), hint.get('value')
        self.assertIsInstance(row, int, 'Hint is missing a target row.')
        self.assertIsInstance(col, int, 'Hint is missing a target column.')
        self.assertTrue(0 <= row < SIZE and 0 <= col < SIZE, f'Invalid hint target: {hint!r}')
        self.assertEqual(puzzle[row][col], EMPTY, 'Hint target should be empty.')
        self.assertEqual(value, solution[row][col], 'Hint value is not correct.')
        self.assert_source_contains(MAIN_JS, 'static/main.js', "if (hintMode === 'hard')", 'hard/light hint mode')

    @feature_test
    def test_check_endpoint_reports_only_wrong_filled_entries(self):
        client = self.client()
        new_game = self.response_json(client.get('/new?clues=45'), 'Creating a puzzle for checking')
        puzzle = new_game.get('puzzle')
        solution = APP_CURRENT.get('solution')
        if not is_well_formed_board(puzzle) or not is_complete_valid_solution(solution):
            self.fail('New-game endpoint is missing or returned an invalid puzzle/solution.')
        board = [row[:] for row in puzzle]
        blank = next(((row, col) for row in range(SIZE) for col in range(SIZE) if board[row][col] == EMPTY), None)
        if blank is None:
            self.fail('Generated puzzle has no blank cell to test wrong-entry checking.')
        row, col = blank
        board[row][col] = solution[row][col] % SIZE + 1
        result = self.response_json(client.post('/check', json={'board': board}), 'Checking a wrong entry')
        self.assertEqual(result.get('incorrect'), [[row, col]], 'Checker did not identify exactly the wrong cell.')
        self.assertFalse(result.get('complete'), 'Board with a wrong entry was marked complete.')

    @feature_test
    def test_completion_runs_congratulations_and_stops_timer(self):
        for snippet, feature in (
            ('if (result.complete) completeGame();', 'completion detection'),
            ('function completeGame()', 'completion handler'),
            ('Congratulations!', 'congratulations message'),
            ('stopGameTimer()', 'stopping the timer'),
        ):
            self.assert_source_contains(MAIN_JS, 'static/main.js', snippet, feature)

    @feature_test
    def test_top_ten_scores_are_saved_locally_per_difficulty(self):
        for snippet, feature in (
            ('localStorage.setItem(SCORE_STORAGE_KEY, JSON.stringify(scores))', 'local leaderboard persistence'),
            ('scores[gameDifficulty]', 'per-difficulty ranking'),
            ('adjustedTimeMs', 'adjusted-time ranking'),
        ):
            self.assert_source_contains(MAIN_JS, 'static/main.js', snippet, feature)
        for heading in ('Rank', 'Name', 'Elapsed time', 'Adjusted time', 'Difficulty', 'Hints used'):
            self.assert_source_contains(
                INDEX_HTML, 'templates/index.html', heading, f'leaderboard field {heading}'
            )

    @feature_test
    def test_dark_and_light_themes_define_interface_colors(self):
        for snippet, feature in (
            ('color-scheme: light;', 'light palette'),
            (':root[data-theme="dark"]', 'dark palette'),
            ('prefers-color-scheme: dark', 'system theme default'),
            ('--surface-background:', 'surface colors'),
            ('--text-color:', 'text colors'),
        ):
            self.assert_source_contains(STYLES_CSS, 'static/styles.css', snippet, feature)
        self.assert_source_contains(MAIN_JS, 'static/main.js',
                                    "window.matchMedia('(prefers-color-scheme: dark)')", 'system theme initialization')

    @feature_test
    def test_all_layouts_keep_game_information_and_use_separate_rules(self):
        for element_id in ('title', 'active-player-name', 'active-difficulty', 'timer', 'sudoku-board'):
            self.assert_source_contains(
                INDEX_HTML, 'templates/index.html', f'id="{element_id}"',
                f'{element_id} layout element'
            )
        for snippet, feature in (
            ('/* Desktop layout */', 'desktop layout section'),
            ('/* Mobile Portrait Layout */', 'portrait layout section'),
            ('/* Landscape Layout */', 'landscape layout section'),
            ('@media (min-width: 1024px)', 'desktop breakpoint'),
            ('@media (max-width: 1023px) and (orientation: portrait)', 'portrait breakpoint'),
            ('@media (max-width: 1023px) and (orientation: landscape)', 'landscape breakpoint'),
        ):
            self.assert_source_contains(STYLES_CSS, 'static/styles.css', snippet, feature)


if __name__ == '__main__':
    unittest.main(verbosity=2)
