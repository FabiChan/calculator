package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Clears the history store before each test and restores it later
func resetHistory(t *testing.T) {
	t.Helper()

	store.Lock()
	previous := store.items
	store.items = []HistoryItem{}
	store.Unlock()

	t.Cleanup(func() {
		store.Lock()
		store.items = previous
		store.Unlock()
	})
}

// Sends an HTTP request to the specified handler and returns the 
// response recorder for inspection.
func sendRequest(handler http.Handler, method, path string, body []byte) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

// TestCalculateAPI verifies supported operations and rejects invalid requests.
func TestCalculateAPI(t *testing.T) {
	tests := []struct {
		name           string
		body           string
		method         string
		wantStatus     int
		wantResult     float64
		wantExpression string
		wantError      string
	}{
		{name: "addition", body: `{"a":7,"b":5,"op":"+"}`, method: http.MethodPost, wantStatus: http.StatusOK, wantResult: 12, wantExpression: "7 + 5"},
		{name: "subtraction", body: `{"a":7,"b":5,"op":"-"}`, method: http.MethodPost, wantStatus: http.StatusOK, wantResult: 2, wantExpression: "7 - 5"},
		{name: "multiplication alias", body: `{"a":7,"b":5,"op":"×"}`, method: http.MethodPost, wantStatus: http.StatusOK, wantResult: 35, wantExpression: "7 × 5"},
		{name: "division alias", body: `{"a":12,"b":4,"op":"÷"}`, method: http.MethodPost, wantStatus: http.StatusOK, wantResult: 3, wantExpression: "12 ÷ 4"},
		{name: "power", body: `{"a":2,"b":3,"op":"^"}`, method: http.MethodPost, wantStatus: http.StatusOK, wantResult: 8, wantExpression: "2 ^ 3"},
		{name: "percent", body: `{"a":25,"op":"%"}`, method: http.MethodPost, wantStatus: http.StatusOK, wantResult: 0.25, wantExpression: "25%"},
		{name: "square root", body: `{"a":9,"op":"sqrt"}`, method: http.MethodPost, wantStatus: http.StatusOK, wantResult: 3, wantExpression: "√(9)"},
		{name: "division by zero", body: `{"a":1,"b":0,"op":"/"}`, method: http.MethodPost, wantStatus: http.StatusBadRequest, wantError: "Zero Division!"},
		{name: "negative square root", body: `{"a":-1,"op":"√"}`, method: http.MethodPost, wantStatus: http.StatusBadRequest, wantError: "Invalid Input!"},
		{name: "unsupported operator", body: `{"a":1,"b":2,"op":"//"}`, method: http.MethodPost, wantStatus: http.StatusBadRequest, wantError: "Unsupported operator"},
		{name: "invalid JSON", body: `{`, method: http.MethodPost, wantStatus: http.StatusBadRequest, wantError: "Invalid JSON format"},
		{name: "wrong method", body: `{}`, method: http.MethodGet, wantStatus: http.StatusMethodNotAllowed},
	}

	// Run each test case in a subtest to isolate failures and clarity
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			resetHistory(t)
			response := sendRequest(newRouter(), test.method, "/api/v1/calculate", []byte(test.body))
			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d; body: %s", response.Code, test.wantStatus, response.Body.String())
			}
			if test.wantStatus == http.StatusMethodNotAllowed {
				return
			}
			if got := response.Header().Get("Content-Type"); !strings.HasPrefix(got, "application/json") {
				t.Fatalf("Content-Type = %q, want application/json", got)
			}

			var result CalculationResponse
			if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			if test.wantError != "" {
				if result.Error != test.wantError {
					t.Fatalf("error = %q, want %q", result.Error, test.wantError)
				}
				if len(store.items) != 0 {
					t.Fatalf("failed calculation was added to history")
				}
				return
			}
			if result.Result != test.wantResult || result.Expression != test.wantExpression {
				t.Fatalf("response = (%v, %q), want (%v, %q)", result.Result, result.Expression, test.wantResult, test.wantExpression)
			}
			if len(store.items) != 1 {
				t.Fatalf("history length = %d, want 1", len(store.items))
			}
		})
	}
}

// Covers history operations and browser preflight headers.
func TestHistoryAPIAndCORS(t *testing.T) {
	resetHistory(t)
	handler := newRouter()

	calculate := sendRequest(handler, http.MethodPost, "/api/v1/calculate", []byte(`{"a":8,"b":5,"op":"-"}`))
	if calculate.Code != http.StatusOK {
		t.Fatalf("calculate status = %d, want %d", calculate.Code, http.StatusOK)
	}

	// Verify that the calculation was added to history
	historyResponse := sendRequest(handler, http.MethodGet, "/api/v1/history", nil)
	if historyResponse.Code != http.StatusOK {
		t.Fatalf("history status = %d, want %d", historyResponse.Code, http.StatusOK)
	}
	var items []HistoryItem

	// Decode the response and check that it contains the expected 
	// calculation entry with a valid ID and timestamp.
	if err := json.Unmarshal(historyResponse.Body.Bytes(), &items); err != nil {
		t.Fatalf("decode history: %v", err)
	}
	if len(items) != 1 || items[0].Expression != "8 - 5" || items[0].Result != "3" {
		t.Fatalf("history = %+v, want one entry for 8 - 5 = 3", items)
	}
	if items[0].ID == "" || items[0].Timestamp == "" {
		t.Fatalf("history entry is missing its ID or timestamp: %+v", items[0])
	}

	// Test CORS preflight and history clearing endpoints.
	preflight := sendRequest(handler, http.MethodOptions, "/api/v1/calculate", nil)
	if preflight.Code != http.StatusOK || preflight.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("CORS preflight = status %d, origin %q", preflight.Code, preflight.Header().Get("Access-Control-Allow-Origin"))
	}

	// Test clearing the history and verify it's empty
	clear := sendRequest(handler, http.MethodDelete, "/api/v1/history/clear", nil)
	if clear.Code != http.StatusOK {
		t.Fatalf("clear status = %d, want %d", clear.Code, http.StatusOK)
	}
	historyResponse = sendRequest(handler, http.MethodGet, "/api/v1/history", nil)
	if err := json.Unmarshal(historyResponse.Body.Bytes(), &items); err != nil {
		t.Fatalf("decode cleared history: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("history after clear = %+v, want empty", items)
	}

	// Test that POST method is also accepted for clearing history
	calculate = sendRequest(handler, http.MethodPost, "/api/v1/calculate", []byte(`{"a":1,"b":1,"op":"+"}`))
	if calculate.Code != http.StatusOK {
		t.Fatalf("second calculate status = %d, want %d", calculate.Code, http.StatusOK)
	}
	postClear := sendRequest(handler, http.MethodPost, "/api/v1/history/clear", nil)
	if postClear.Code != http.StatusOK {
		t.Fatalf("POST clear status = %d, want %d", postClear.Code, http.StatusOK)
	}
	wrongClearMethod := sendRequest(handler, http.MethodGet, "/api/v1/history/clear", nil)
	if wrongClearMethod.Code != http.StatusMethodNotAllowed {
		t.Fatalf("GET clear status = %d, want %d", wrongClearMethod.Code, http.StatusMethodNotAllowed)
	}
}

// Checks order and retention limits.
func TestHistoryIsNewestFirstAndLimitedToTwenty(t *testing.T) {
	resetHistory(t)
	handler := newRouter()

	// Send 21 calculations to make sure only the 20 recent remain
	for value := 0; value < 21; value++ {
		body := []byte(fmt.Sprintf(`{"a":%d,"b":1,"op":"+"}`, value))
		response := sendRequest(handler, http.MethodPost, "/api/v1/calculate", body)
		if response.Code != http.StatusOK {
			t.Fatalf("calculation %d status = %d", value, response.Code)
		}
	}
	
	response := sendRequest(handler, http.MethodGet, "/api/v1/history", nil)
	var items []HistoryItem
	if err := json.Unmarshal(response.Body.Bytes(), &items); err != nil {
		t.Fatalf("decode history: %v", err)
	}
	if len(items) != 20 {
		t.Fatalf("history length = %d, want 20", len(items))
	}
	if items[0].Expression != "20 + 1" || items[19].Expression != "1 + 1" {
		t.Fatalf("history order/range = first %q, last %q", items[0].Expression, items[19].Expression)
	}
}
