# Refactor a Sudoku Game written in Python Flask

Use this simple Sudoku game as a starting point to practice your skills with GitHub Copilot. The goal is to refactor the code to use modern technologies, while also adding new features and improving the overall user experience.

## Getting Started

Follow these instructions to get a copy of the project up and running on your local machine.

### Dependencies

```
- Modern web browser (Chrome, Firefox, Edge, etc.)
- Python 3
```

### Installation

1. Fork this repository to your GitHub account. (You can use the "Fork" button on the top right corner of the repository page.)

2. Clone your forked repository to your local machine.

3. Open a terminal window and navigate to the "github-copilot-python/starter" directory.

4. Create a Python virtual environment and activate it (optional but highly recommended).

```bash
python3 -m venv .venv
source .venv/bin/activate
```

5. Install required Python packages.

```bash
pip install -r requirements.txt
```

6. Run the Flask app.

```bash
python app.py
```

7. Open http://127.0.0.1:5000 in your browser.

## Implemented Features

- Easy, medium, and hard puzzles are generated to remain solvable using naked and hidden single deductions.
- Hard and light hints identify the target cell and supporting cells; hard hints fill and lock the answer.
- Entered mistakes are checked and highlighted, and correctly completed rows, columns, boxes, and digits receive temporary feedback.
- Light and dark themes follow the system preference by default and can be changed in Settings.
- The responsive game has separate desktop, mobile portrait, and mobile landscape layouts.
- Per-difficulty Top 10 rankings are stored in browser local storage. Scores show elapsed and adjusted time, with a 30-second penalty per hint.

## Running Tests

From the `starter` directory, run the `unittest` feature suite. In PowerShell with the project virtual environment:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

If the virtual environment is activated, use:

```bash
python -m unittest discover -s tests -v
```

The verbose report lists each feature test as passed or failed. The suite covers Sudoku rules, difficulty clue counts, generated-solution validity and uniqueness, hint/check APIs, completion behavior, local ranking persistence, and client-side UI contracts. Visual layout and browser interactions are checked through source contracts, not automated browser rendering.

## Project Instructions

Use GitHub Copilot to refactor the code for this game to add more advanced features. The goal is to create a more modern and maintainable codebase and add additional functionality to the final product. You can use any combination of code completion and chat features, like Ask, Edit, or Agent modes.

- Errors should be handled gracefully with appropriate messages to the user.
- Implement a Sudoku board generator that creates a valid Sudoku puzzle with a unique solution.
- Add a timer to track how long it takes to solve the puzzle.
- Implement a solution checker that verifies if the user's solution is correct using event delegation.
- Add a difficulty selector to allow users to choose between easy, medium, and hard puzzles.
- Add a hint feature that provides clues for the user that are noted with unique colors.
- Add a check puzzle button that checks the current state of the board against the solution.
- User should get immediate feedback on their input, such as highlighting invalid entries.
- Top 10 scores should be saved in local storage and displayed on the page with the user's name, time taken, hints used, and difficulty level.
- The game should be responsive and work well on both desktop and mobile devices.
- UI colors should be visually appealing and accessible.
- Completed and correct puzzles should display a congratulatory message with the time taken and hints used and ask for the user's name for Top 10 times.

## Copilot considerations

Copilot is a great tool to speed up development, add validation and building testing framework. It automatically adapts and improve the code with just a writen instruction.
However, as observed in the helpful hints, it still struggle for styling and responsiveness. I requested some visual changes, rejected and coded it myself.

## Directory structure
```
+---agent
|       game-developer.agent.md
|
+---Screenshots
|   +---interface
|   |       interface_check_solution.png
|   |       interface_completion_message.png
|   |       interface_completion_message_anotherplayer.png
|   |       interface_completion_message_no_hints.png
|   |       interface_dark_mode.png
|   |       interface_desktop_view.png
|   |       interface_hint_used.png
|   |       interface_landscape_view.png
|   |       interface_portrait_view.png
|   |       interface_ranking.png
|   |       interface_wrong_number_entered.png
|   |
|   +---prompts
|   |       01_prompt_difficulty_selector.png
|   |       02_prompt_wrong_input_feedback.png
|   |       03_prompt_hint_button.png
|   |       04_prompt_completion_number_strip.png
|   |       05_prompt_timer_ranking_and_completion_message.png
|   |       06_prompt_alternating_colors_grid.png
|   |       07_prompt_creating_dark_mode.png
|   |       08_prompt_generating_solvable_board.png
|   |       09_prompt_settings_button.png
|   |       10_prompt_testing_framework.png
|   |       11_prompt_rejected_layout1.png
|   |       12_prompt_rejected_layout2.png
|   |
|   \---unittest
|           01_unittest_initial_code.png
|           02_unittest_final_code.png
|
+---starter
|   |   app.py
|   |   requirements.txt
|   |   sudoku_logic.py
|   |
|   +---static
|   |      main.js
|   |      styles.css
|   |
|   +---templates
|   |      index.html
|   |
|   \---tests
|          test_sudoku_features.py
|
|   CODEOWNERS
|   LICENSE.txt
\   README.md
```
