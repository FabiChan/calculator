# Calculator

A calculator with a React and TypeScript frontend and a Go HTTP API. The frontend collects keypad input and displays results; the Go backend performs arithmetic calculations, validations and owns calculation history.

## Features

- Addition, subtraction, multiplication, division, powers, percentage, and square root.
- Mouse and keyboard input, display errors, and synthesized button sounds.
- Server-backed calculation history, newest first, with a clear-history action.
- Responsive keypad and history panel styled with Tailwind CSS 4.

## Requirements

- Node.js 20.19+ or 22.12+ and npm.
- Go 1.22 or newer.
- Playwright Chromium for browser tests.

## Setup and Run

From the project root, install frontend dependencies:

```powershell
npm ci
```

Start the Go API in one terminal:

```powershell
cd server
go run .
```

The API listens on `http://localhost:8080`.

Start the frontend in a second terminal from the project root:

```powershell
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` requests to Go on port 8080. Both servers must be running for calculations and history to work.

To point the frontend to a separately hosted API, set `VITE_API_BASE_URL` before starting Vite. For example, in PowerShell:

```powershell
$env:VITE_API_BASE_URL = "http://localhost:8080"
npm run dev
```

## HTTP API

All endpoints are under `/api/v1` and exchange JSON unless otherwise noted.

### Calculate

`POST /api/v1/calculate`

The JSON body has `a` (first number), optional `b` (second number), and `op` (operator). Supported operators are `+`, `-`, `*`, `/`, `^`, `%`, and `sqrt`. The keypad's Unicode multiplication, division, and square-root symbols are also accepted as aliases. Percentage and square root are unary operations and do not require `b`.

Example request (PowerShell):

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://localhost:8080/api/v1/calculate" `
  -ContentType "application/json" `
  -Body '{"a":12,"b":4,"op":"/"}'
```

Example response:

```json
{
  "result": 3,
  "expression": "12 \u00f7 4"
}
```

Invalid JSON, unsupported operators, division by zero, and square roots of negative values return HTTP `400` with an `error` field. A successful calculation is added to history.

### Read History

`GET /api/v1/history`

Returns up to 20 calculation records, newest first:

```json
[
  {
    "id": "1731096000000000000",
    "expression": "12 \u00f7 4",
    "result": "3",
    "timestamp": "14:20:00"
  }
]
```

### Clear History

`DELETE /api/v1/history/clear` clears history and returns HTTP `200` with an empty body. `POST` is also accepted.

```powershell
Invoke-RestMethod -Method Delete `
  -Uri "http://localhost:8080/api/v1/history/clear"
```

## Tests

### Go API Tests

The Go tests use `net/http/httptest` to send requests through the same router used by the server, without opening a network port. History is reset between tests. The suite checks supported arithmetic and aliases, malformed requests and error responses, JSON headers, history metadata and ordering, the 20-entry limit, both clear methods, rejected methods, and CORS preflight.

Run from the `server` directory:

```powershell
go test ./...
go test -cover ./...
```

For per-function coverage:

```powershell
go test -coverprofile=coverage.out ./...
go tool cover -func=coverage.out
```

### Playwright UI Tests

The Playwright tests run Chromium against the React UI and Go API. The Playwright config starts both servers if they are not already running. A setup hook clears backend history before each test. The tests verify that keypad input calls Go and displays the returned result/history, division by zero appears once, clearing history updates the backend, and enabled keypad buttons show a hand cursor on hover.

Install Chromium once, then run from the project root:

```powershell
npx playwright install chromium
npm run test:e2e
```

Playwright writes an HTML report to `playwright-report/` and failure details to `test-results/`; both are generated and ignored by Git.

Other project checks:

```powershell
npm run lint
npm run build
```

## Design Decisions and Assumptions

- Go is the source for arithmetic results and history. It was used as part of the backend microservice functional requirement. React keeps the current keypad input and display state, as stated in the functional requirement for the frontend.

- Binary operations are submitted when equals is pressed or when chaining to another operator. Percentage and square root are submitted as unary API operations.

- Percentage means `a / 100`; it can be used later to calculate that percentage for another number. For example, as Google Calculator does when the user inputs 15% and then a 9, it will calculate the 15% of 9. Same happens for this calculator, first converts the 15% to decimal and then multiplies by the next input number, 9 for this case.

- History is held in process memory, protected by a mutex, and limited to the newest 20 records, so the interface is not oversaturated with older calculations. It is not persisted and is lost when the Go server restarts, so older calculations are cleaned.

- The Go server uses port 8080; Vite uses port 5173 and proxies `/api` to Go during development. Vite was used to have an instant server startup.

- The API has no authentication or database and is intended as a local/demo application, not a production service.

- The layout design is based in a mixture of real life calulators, as well as considering online calculators such as Google Calculator. For example, the vertical layout for arithmetic classic operators is in the same way most online calculators align basic arithmetic operators like Google. This design applies also to the number buttons. And for the optional operators, they are also classified in another color and grouped in a different way. Exponent operator is located far from the optional operators group and nearest to the numbers because exponent operator is more likely to be used when typing digits, than a sqrt or a percentage. This decision is also to complete the layout and leave the = operator big at the bottom of the calculator.

- For accesibility, keyboard input is allowed and validated to provide another way to enter data.

## Styling & Aesthetics

Theme & Palette: Built around a retro 90s anime aesthetic using deep dark-violet backgrounds (#1c162b, #251e36) accented with vibrant pastel neon highlights:

- Pink (#ff79c6): Primary accents, highlight glows, bow header badge, and backspace key.

- Purple (#bd93f9): Secondary borders, secondary operations (√, %, ^), and history sidebar.

- Yellow (#f1fa8c): Screen display text for high legibility.

- Cyan (#8be9fd): Basic arithmetic operators (+, -, ×, ÷).

- Red (#ff5555): Clear (AC) button and error states.

Component Layout: Single-screen dashboard split into two main sections:

- Left: 4-column calculator keypad and digital LED-style display screen.

- Right: Log History sidebar for viewing and restoring past calculations.

## AI assistants

This project was implemented with the help of Gemini (3.6 Flash) and Copilot (GPT-6 Luna).
