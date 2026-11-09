package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"sync"
	"time"
)

// CalculationRequest defines incoming payloads from the React frontend
type CalculationRequest struct {
	A  float64  `json:"a"`
	B  *float64 `json:"b,omitempty"`
	Op string   `json:"op"`
}

// CalculationResponse defines structured responses sent back to the client
type CalculationResponse struct {
	Result     float64 `json:"result"`
	Expression string  `json:"expression"`
	Error      string  `json:"error,omitempty"`
}

// HistoryItem represents an evaluated operation log
type HistoryItem struct {
	ID         string `json:"id"`
	Expression string `json:"expression"`
	Result     string `json:"result"`
	Timestamp  string `json:"timestamp"`
}

// HistoryStore keeps state safely in memory using RWMutex
type HistoryStore struct {
	sync.RWMutex
	items []HistoryItem
}

var store = HistoryStore{items: make([]HistoryItem, 0)}

// CORS Middleware allowing local Vite development environments
func enableCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}

// Handles calculation requests
func calculateHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Set response content type to JSON
	w.Header().Set("Content-Type", "application/json")
	var req CalculationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(CalculationResponse{Error: "Invalid JSON format"})
		return
	}

	var res float64
	var expr string
	bVal := 0.0
	if req.B != nil {
		bVal = *req.B
	}

	// Perform the calculation based on the operator
	switch req.Op {
	case "+":
		res = req.A + bVal
		expr = fmt.Sprintf("%g + %g", req.A, bVal)
	case "-":
		res = req.A - bVal
		expr = fmt.Sprintf("%g - %g", req.A, bVal)
	case "*", "×":
		res = req.A * bVal
		expr = fmt.Sprintf("%g × %g", req.A, bVal)
	case "/", "÷":
		if bVal == 0 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(CalculationResponse{Error: "Zero Division!"})
			return
		}
		res = req.A / bVal
		expr = fmt.Sprintf("%g ÷ %g", req.A, bVal)
	case "^":
		res = math.Pow(req.A, bVal)
		expr = fmt.Sprintf("%g ^ %g", req.A, bVal)
	case "%":
		res = req.A / 100.0
		expr = fmt.Sprintf("%g%%", req.A)
	case "sqrt", "√":
		if req.A < 0 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(CalculationResponse{Error: "Invalid Input!"})
			return
		}
		res = math.Sqrt(req.A)
		expr = fmt.Sprintf("√(%g)", req.A)
	default:
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(CalculationResponse{Error: "Unsupported operator"})
		return
	}

	// Store the result in history with a timestamp
	formattedRes := fmt.Sprintf("%g", res)
	item := HistoryItem{
		ID:         fmt.Sprintf("%d", time.Now().UnixNano()),
		Expression: expr,
		Result:     formattedRes,
		Timestamp:  time.Now().Format("15:04:05"),
	}

	// Add the new item to the history, ensuring thread safety and
	// limiting the history to the most recent 20 calculations
	store.Lock()
	store.items = append([]HistoryItem{item}, store.items...)
	if len(store.items) > 20 {
		store.items = store.items[:20]
	}
	store.Unlock()

	// Send the calculation result back to the client
	json.NewEncoder(w).Encode(CalculationResponse{
		Result:     res,
		Expression: expr,
	})
}

// Handles retrieval of calculation history
func getHistoryHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	store.RLock()
	defer store.RUnlock()
	json.NewEncoder(w).Encode(store.items)
}

// Handles clearing of calculation history
func clearHistoryHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete && r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	store.Lock()
	store.items = make([]HistoryItem, 0)
	store.Unlock()
	w.WriteHeader(http.StatusOK)
}

// Sets up the HTTP router with CORS-enabled endpoints
func newRouter() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/calculate", enableCORS(calculateHandler))
	mux.HandleFunc("/api/v1/history", enableCORS(getHistoryHandler))
	mux.HandleFunc("/api/v1/history/clear", enableCORS(clearHistoryHandler))
	return mux
}

// Entry point for the GO backend server
func main() {
	fmt.Println("🚀 Go Backend Server listening on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", newRouter()))
}
