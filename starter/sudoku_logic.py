import copy
import random

SIZE = 9
EMPTY = 0

def deep_copy(board):
    return copy.deepcopy(board)

def create_empty_board():
    return [[EMPTY for _ in range(SIZE)] for _ in range(SIZE)]

def is_safe(board, row, col, num):
    # Check row and column
    for x in range(SIZE):
        if board[row][x] == num or board[x][col] == num:
            return False
    # Check 3x3 box
    start_row = row - row % 3
    start_col = col - col % 3
    for i in range(3):
        for j in range(3):
            if board[start_row + i][start_col + j] == num:
                return False
    return True

def is_well_formed_board(board):
    if not isinstance(board, list) or len(board) != SIZE:
        return False
    if any(not isinstance(row, list) or len(row) != SIZE for row in board):
        return False
    return all(
        type(value) is int and EMPTY <= value <= SIZE
        for row in board for value in row
    )

def is_valid_board(board):
    if not is_well_formed_board(board):
        return False

    for index in range(SIZE):
        row_values = [value for value in board[index] if value != EMPTY]
        column_values = [board[row][index] for row in range(SIZE) if board[row][index] != EMPTY]
        if len(row_values) != len(set(row_values)):
            return False
        if len(column_values) != len(set(column_values)):
            return False

    for box_row in range(0, SIZE, 3):
        for box_col in range(0, SIZE, 3):
            values = [
                board[row][col]
                for row in range(box_row, box_row + 3)
                for col in range(box_col, box_col + 3)
                if board[row][col] != EMPTY
            ]
            if len(values) != len(set(values)):
                return False
    return True

def get_candidates(board, row, col):
    if board[row][col] != EMPTY:
        return set()
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

def get_peers(row, col):
    peers = {(row, index) for index in range(SIZE) if index != col}
    peers.update((index, col) for index in range(SIZE) if index != row)
    box_row = row - row % 3
    box_col = col - col % 3
    peers.update(
        (box_row + row_offset, box_col + col_offset)
        for row_offset in range(3)
        for col_offset in range(3)
        if (box_row + row_offset, box_col + col_offset) != (row, col)
    )
    return peers

def find_hint(board):
    if not is_valid_board(board):
        return None

    candidates = {
        (row, col): get_candidates(board, row, col)
        for row in range(SIZE)
        for col in range(SIZE)
        if board[row][col] == EMPTY
    }

    for (row, col), possible_values in candidates.items():
        if len(possible_values) != 1:
            continue
        value = next(iter(possible_values))
        supports = set()
        for excluded_value in range(1, SIZE + 1):
            if excluded_value == value:
                continue
            blocker = next(
                ((peer_row, peer_col) for peer_row, peer_col in get_peers(row, col)
                 if board[peer_row][peer_col] == excluded_value),
                None
            )
            if blocker:
                supports.add(blocker)
        return {
            'row': row,
            'col': col,
            'value': value,
            'rule': 'naked-single',
            'unit': None,
            'support': [list(cell) for cell in sorted(supports)]
        }

    units = []
    units.extend(
        ('row', index, [(index, col) for col in range(SIZE)])
        for index in range(SIZE)
    )
    units.extend(
        ('column', index, [(row, index) for row in range(SIZE)])
        for index in range(SIZE)
    )
    units.extend(
        ('box', box_row * 3 + box_col,
         [(row, col)
          for row in range(box_row * 3, box_row * 3 + 3)
          for col in range(box_col * 3, box_col * 3 + 3)])
        for box_row in range(3)
        for box_col in range(3)
    )

    for unit_type, unit_index, cells in units:
        present = {board[row][col] for row, col in cells}
        for value in range(1, SIZE + 1):
            if value in present:
                continue
            possible_cells = [
                (row, col) for row, col in cells
                if board[row][col] == EMPTY and value in candidates[(row, col)]
            ]
            if len(possible_cells) != 1:
                continue

            target = possible_cells[0]
            unit_cells = set(cells)
            supports = set()
            for other_row, other_col in cells:
                if (other_row, other_col) == target or board[other_row][other_col] != EMPTY:
                    continue
                supports.add((other_row, other_col))
                blocker = next(
                    ((peer_row, peer_col)
                     for peer_row, peer_col in get_peers(other_row, other_col)
                     if (peer_row, peer_col) not in unit_cells
                     and board[peer_row][peer_col] == value),
                    None
                )
                if blocker:
                    supports.add(blocker)
            return {
                'row': target[0],
                'col': target[1],
                'value': value,
                'rule': 'hidden-single',
                'unit': unit_type,
                'unit_index': unit_index,
                'support': [list(cell) for cell in sorted(supports)]
            }
    return None

def solve_with_logic(board):
    if not is_valid_board(board):
        return None
    solved = deep_copy(board)
    while True:
        hint = find_hint(solved)
        if hint is None:
            if all(value != EMPTY for row in solved for value in row):
                return solved
            return None
        solved[hint['row']][hint['col']] = hint['value']

def fill_board(board):
    for row in range(SIZE):
        for col in range(SIZE):
            if board[row][col] == EMPTY:
                possible = list(range(1, SIZE + 1))
                random.shuffle(possible)
                for candidate in possible:
                    if is_safe(board, row, col, candidate):
                        board[row][col] = candidate
                        if fill_board(board):
                            return True
                        board[row][col] = EMPTY
                return False
    return True

def remove_cells(board, clues):
    attempts = SIZE * SIZE - clues
    while attempts > 0:
        row = random.randrange(SIZE)
        col = random.randrange(SIZE)
        if board[row][col] != EMPTY:
            board[row][col] = EMPTY
            attempts -= 1

def generate_puzzle(clues=35):
    if type(clues) is not int or not 1 <= clues <= SIZE * SIZE:
        raise ValueError(f'Clues must be between 1 and {SIZE * SIZE}.')

    best_puzzle = None
    best_solution = None
    best_clue_count = SIZE * SIZE + 1
    attempts = 8

    for _ in range(attempts):
        solution = create_empty_board()
        if not fill_board(solution):
            raise RuntimeError('Unable to generate a complete Sudoku solution.')
        puzzle = deep_copy(solution)
        cells = [(row, col) for row in range(SIZE) for col in range(SIZE)]
        random.shuffle(cells)
        clue_count = SIZE * SIZE

        for row, col in cells:
            if clue_count == clues:
                break
            value = puzzle[row][col]
            puzzle[row][col] = EMPTY
            if solve_with_logic(puzzle) is None:
                puzzle[row][col] = value
            else:
                clue_count -= 1

        if clue_count < best_clue_count:
            best_puzzle = deep_copy(puzzle)
            best_solution = deep_copy(solution)
            best_clue_count = clue_count
        if clue_count == clues:
            return puzzle, solution

    return best_puzzle, best_solution
