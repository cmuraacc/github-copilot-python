from flask import Flask, render_template, jsonify, request
import sudoku_logic

app = Flask(__name__)

# Keep a simple in-memory store for current puzzle and solution
CURRENT = {
    'puzzle': None,
    'solution': None
}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/new')
def new_game():
    try:
        clues = int(request.args.get('clues', 35))
    except (TypeError, ValueError):
        return jsonify({'error': 'Clues must be a whole number between 1 and 81.'}), 400

    try:
        puzzle, solution = sudoku_logic.generate_puzzle(clues)
    except ValueError as error:
        return jsonify({'error': str(error)}), 400
    except Exception:
        app.logger.exception('Failed to generate a Sudoku puzzle.')
        return jsonify({'error': 'Unable to generate a puzzle right now.'}), 500

    CURRENT['puzzle'] = puzzle
    CURRENT['solution'] = solution
    return jsonify({'puzzle': puzzle})

@app.route('/check', methods=['POST'])
def check_solution():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': 'Request body must be a JSON object.'}), 400
    board = data.get('board')
    if not sudoku_logic.is_well_formed_board(board):
        return jsonify({'error': 'Board must be a 9 by 9 grid containing digits 0 through 9.'}), 400
    solution = CURRENT.get('solution')
    if solution is None:
        return jsonify({'error': 'No game in progress'}), 400
    incorrect = []
    has_empty_cells = False
    for i in range(sudoku_logic.SIZE):
        for j in range(sudoku_logic.SIZE):
            if board[i][j] == sudoku_logic.EMPTY:
                has_empty_cells = True
            elif board[i][j] != solution[i][j]:
                incorrect.append([i, j])
    return jsonify({'incorrect': incorrect, 'complete': not has_empty_cells and not incorrect})

@app.route('/check-cell', methods=['POST'])
def check_cell():
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify({'error': 'Request body must be a JSON object.'}), 400
    solution = CURRENT.get('solution')
    if solution is None:
        return jsonify({'error': 'No game in progress'}), 400

    row = data.get('row')
    col = data.get('col')
    value = data.get('value')
    if (type(row) is not int or type(col) is not int or type(value) is not int
            or not 0 <= row < sudoku_logic.SIZE
            or not 0 <= col < sudoku_logic.SIZE
            or not 1 <= value <= sudoku_logic.SIZE):
        return jsonify({'error': 'Invalid cell value'}), 400

    return jsonify({'correct': solution[row][col] == value})

@app.route('/hint', methods=['POST'])
def get_hint():
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify({'error': 'Request body must be a JSON object.'}), 400
    solution = CURRENT.get('solution')
    if solution is None:
        return jsonify({'error': 'No game in progress'}), 400

    board = data.get('board')
    if not sudoku_logic.is_valid_board(board):
        return jsonify({'error': 'The current board has invalid entries'}), 400

    hint = sudoku_logic.find_hint(board)
    if hint is None or solution[hint['row']][hint['col']] != hint['value']:
        return jsonify({'hint': None, 'message': 'No supported single-step hint is available.'})
    return jsonify({'hint': hint})

if __name__ == '__main__':
    app.run(debug=True)