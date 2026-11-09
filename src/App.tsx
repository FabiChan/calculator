import {
  useState,
  useEffect,
  useCallback,
  useEffectEvent,
  useRef,
} from "react";
import { History, Sparkles, Heart, Trash2, HelpCircle } from "lucide-react";
import {
  ApiError,
  calculate,
  clearHistory as clearHistoryRequest,
  getHistory,
  type HistoryItem,
} from "./api";

// ==========================================
// 1. WEB AUDIO SYNTHESIZER (RETRO CHIME & CLICKS)
// ==========================================
class AnimeAudioSynth {
  private ctx: AudioContext | null = null;

  private initCtx() {
    if (!this.ctx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new AudioCtxClass();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  public playClick(freq = 523.25, duration = 0.06) {
    try {
      this.initCtx();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        freq * 1.05,
        this.ctx.currentTime + duration,
      );

      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        this.ctx.currentTime + duration,
      );

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn("Audio Context playback error:", e);
    }
  }

  public playOperator() {
    this.playClick(659.25, 0.08);
  }

  public playEquals() {
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = "sine";
      osc2.type = "sine";
      osc1.frequency.setValueAtTime(523.25, now);
      osc2.frequency.setValueAtTime(783.99, now + 0.06);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.12);
      osc2.start(now + 0.06);
      osc2.stop(now + 0.25);
    } catch (e) {
      console.warn("Audio Context error:", e);
    }
  }

  public playError() {
    this.playClick(220, 0.18);
  }

  public playClear() {
    this.playClick(440, 0.09);
  }
}

const audioSynth = new AnimeAudioSynth();

// ==========================================
// 2. TYPES & UTILS
// ==========================================
// ==========================================
// 3. MAIN APPLICATION COMPONENT
// ==========================================
export default function App() {
  const [displayValue, setDisplayValue] = useState<string>("0");
  const [expression, setExpression] = useState<string>("");
  const [prevOperand, setPrevOperand] = useState<number | null>(null);
  const [currentOperator, setCurrentOperator] = useState<string | null>(null);
  const [waitingForNextOperand, setWaitingForNextOperand] =
    useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [justCalculatedPercent, setJustCalculatedPercent] =
    useState<boolean>(false);
  const requestInFlight = useRef(false);

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await getHistory());
      setHistoryError(null);
    } catch (error) {
      setHistoryError(
        error instanceof Error ? error.message : "Unable to load history",
      );
    } finally {
      setIsHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    getHistory()
      .then((items) => {
        if (active) {
          setHistory(items);
          setHistoryError(null);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setHistoryError(
            error instanceof Error ? error.message : "Unable to load history",
          );
        }
      })
      .finally(() => {
        if (active) setIsHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // ----------------------------------------
  // BACKEND CALCULATION
  // ----------------------------------------
  const evaluate = async (
    a: number,
    b: number | null,
    op: string,
  ): Promise<{ result: number; expr: string }> => {
    requestInFlight.current = true;
    setIsCalculating(true);

    try {
      const response = await calculate({ a, ...(b === null ? {} : { b }), op });
      void refreshHistory();
      return { result: response.result, expr: response.expression };
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "Cannot reach the Go API. Make sure the server is running on port 8080.";
      throw new Error(message, { cause: error });
    } finally {
      requestInFlight.current = false;
      setIsCalculating(false);
    }
  };

  const inputDigit = (digit: string) => {
    if (requestInFlight.current) return;
    audioSynth.playClick(500 + parseInt(digit) * 35);
    if (hasError) {
      setDisplayValue(digit);
      setHasError(false);
      setExpression("");
      setJustCalculatedPercent(false);
      return;
    }

    if (justCalculatedPercent) {
      const pctValue = parseFloat(displayValue);
      setPrevOperand(pctValue);
      setCurrentOperator("×");
      setExpression(`${pctValue} ×`);
      setDisplayValue(digit);
      setWaitingForNextOperand(false);
      setJustCalculatedPercent(false);
      return;
    }

    if (waitingForNextOperand) {
      setDisplayValue(digit);
      setWaitingForNextOperand(false);
    } else {
      setDisplayValue(displayValue === "0" ? digit : displayValue + digit);
    }
  };

  const inputDecimal = () => {
    if (requestInFlight.current) return;
    audioSynth.playClick(620);
    if (hasError) {
      setDisplayValue("0.");
      setHasError(false);
      setExpression("");
      setJustCalculatedPercent(false);
      return;
    }

    if (justCalculatedPercent) {
      const pctValue = parseFloat(displayValue);
      setPrevOperand(pctValue);
      setCurrentOperator("×");
      setExpression(`${pctValue} ×`);
      setDisplayValue("0.");
      setWaitingForNextOperand(false);
      setJustCalculatedPercent(false);
      return;
    }

    if (waitingForNextOperand) {
      setDisplayValue("0.");
      setWaitingForNextOperand(false);
      return;
    }

    if (!displayValue.includes(".")) {
      setDisplayValue(displayValue + ".");
    }
  };

  const clearAll = () => {
    if (requestInFlight.current) return;
    audioSynth.playClear();
    setDisplayValue("0");
    setExpression("");
    setPrevOperand(null);
    setCurrentOperator(null);
    setWaitingForNextOperand(false);
    setHasError(false);
    setJustCalculatedPercent(false);
  };

  const handleBackspace = () => {
    if (requestInFlight.current) return;
    audioSynth.playClick(380);
    if (hasError || waitingForNextOperand) return;
    setJustCalculatedPercent(false);

    if (displayValue.length > 1) {
      setDisplayValue(displayValue.slice(0, -1));
    } else {
      setDisplayValue("0");
    }
  };

  const handleOperator = async (nextOperator: string) => {
    if (requestInFlight.current) return;
    audioSynth.playOperator();
    const inputValue = parseFloat(displayValue);

    if (hasError) return;

    if (nextOperator === "%") {
      try {
        const res = await evaluate(inputValue, null, "%");
        const formattedRes = Number(res.result.toFixed(8)).toString();
        setDisplayValue(formattedRes);
        setExpression(res.expr);
        setJustCalculatedPercent(true);
        setWaitingForNextOperand(true);
      } catch (err: unknown) {
        audioSynth.playError();
        setDisplayValue(err instanceof Error ? err.message : "ERROR");
        setHasError(true);
      }
      return;
    }

    setJustCalculatedPercent(false);

    if (nextOperator === "√") {
      try {
        const res = await evaluate(inputValue, null, "sqrt");
        const formattedRes = Number(res.result.toFixed(8)).toString();
        setDisplayValue(formattedRes);
        setExpression(`${res.expr} =`);
        setPrevOperand(null);
        setCurrentOperator(null);
        setWaitingForNextOperand(true);
      } catch (err: unknown) {
        audioSynth.playError();
        setDisplayValue(err instanceof Error ? err.message : "ERROR");
        setHasError(true);
      }
      return;
    }

    if (prevOperand === null) {
      setPrevOperand(inputValue);
      setExpression(`${inputValue} ${nextOperator}`);
    } else if (currentOperator && !waitingForNextOperand) {
      try {
        const res = await evaluate(prevOperand, inputValue, currentOperator);
        const formattedRes = Number(res.result.toFixed(8)).toString();
        setPrevOperand(res.result);
        setDisplayValue(formattedRes);
        setExpression(`${formattedRes} ${nextOperator}`);
      } catch (err: unknown) {
        audioSynth.playError();
        setDisplayValue(err instanceof Error ? err.message : "ERROR");
        setHasError(true);
        return;
      }
    } else {
      setExpression(`${displayValue} ${nextOperator}`);
    }

    setWaitingForNextOperand(true);
    setCurrentOperator(nextOperator);
  };

  const handleEquals = async () => {
    if (requestInFlight.current) return;
    if (!currentOperator || prevOperand === null || hasError) return;

    const inputValue = parseFloat(displayValue);
    audioSynth.playEquals();

    try {
      const res = await evaluate(prevOperand, inputValue, currentOperator);
      const formattedRes = Number(res.result.toFixed(8)).toString();
      setExpression(`${res.expr} =`);
      setDisplayValue(formattedRes);

      setPrevOperand(null);
      setCurrentOperator(null);
      setWaitingForNextOperand(true);
      setJustCalculatedPercent(false);
    } catch (err: unknown) {
      audioSynth.playError();
      setDisplayValue(err instanceof Error ? err.message : "ERROR");
      setHasError(true);
    }
  };

  const handleClearHistory = async () => {
    setIsHistoryLoading(true);
    setHistoryError(null);
    try {
      await clearHistoryRequest();
      setHistory([]);
    } catch (error) {
      setHistoryError(
        error instanceof Error ? error.message : "Unable to clear history",
      );
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const restoreHistory = (item: HistoryItem) => {
    if (requestInFlight.current) return;
    audioSynth.playClick(700);
    setDisplayValue(item.result);
    setExpression(`Restored: ${item.expression}`);
    setPrevOperand(null);
    setCurrentOperator(null);
    setWaitingForNextOperand(true);
    setHasError(false);
    setJustCalculatedPercent(false);
  };

  // Keyboard Shortcuts
  const handleKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (requestInFlight.current) return;
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    )
      return;

    const key = e.key;
    setPressedKey(key);
    setTimeout(() => setPressedKey(null), 150);

    if (/[0-9]/.test(key)) {
      inputDigit(key);
    } else if (key === ".") {
      inputDecimal();
    } else if (key === "+") {
      handleOperator("+");
    } else if (key === "-") {
      handleOperator("-");
    } else if (key === "*") {
      handleOperator("×");
    } else if (key === "/") {
      e.preventDefault();
      handleOperator("÷");
    } else if (key === "^") {
      handleOperator("^");
    } else if (key === "%") {
      handleOperator("%");
    } else if (key === "Enter" || key === "=") {
      e.preventDefault();
      handleEquals();
    } else if (key === "Backspace") {
      handleBackspace();
    } else if (key === "Escape") {
      clearAll();
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-[#1c162b] text-[#fce8f3] font-sans flex flex-col items-center justify-between p-4 sm:p-8 relative select-none">
      {/* CUTE AMBIENT BACKDROP DECORATIONS */}
      <div className="fixed top-10 left-10 text-[#ff79c6] opacity-30 animate-pulse pointer-events-none">
        <Sparkles className="w-12 h-12" />
      </div>
      <div className="fixed bottom-10 right-10 text-[#bd93f9] opacity-30 animate-pulse pointer-events-none">
        <Heart className="w-10 h-10" />
      </div>

      {/* TOP BAR */}
      <header className="w-full max-w-4xl flex justify-center items-center mb-6">
        <div className="flex items-center space-x-2">
          <h1 className="text-xl sm:text-2xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-[#ff79c6] via-[#f1fa8c] to-[#8be9fd]">
            CALCULATOR
          </h1>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="w-full max-w-4xl flex-grow flex flex-col lg:flex-row gap-8 items-center lg:items-start justify-center">
        {/* CALCULATOR CONTAINER */}
        <div className="w-full max-w-md bg-[#251e36] border-2 border-[#ff79c6]/40 p-6 rounded-3xl shadow-[0_10px_30px_rgba(0,0,0,0.5),0_0_20px_rgba(255,121,198,0.15)] relative backdrop-blur-md">
          {/* CUTE DECORATIVE BOW HEADER */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#ff79c6] to-[#bd93f9] text-[#1c162b] text-[10px] font-bold px-4 py-0.5 rounded-full shadow-md flex items-center space-x-1">
            <Heart className="w-3 h-3 fill-current" />
            <span>POCKET EDITION</span>
          </div>

          {/* SCREEN DISPLAY */}
          <div className="bg-[#181324] border-2 border-[#bd93f9]/30 rounded-2xl p-4 mb-6 shadow-[inset_0_2px_8px_rgba(0,0,0,0.6)] flex flex-col justify-end min-h-[90px] relative overflow-hidden">
            <div className="text-right text-[#bd93f9] text-xs h-5 font-mono overflow-hidden whitespace-nowrap opacity-80">
              {expression || " "}
            </div>
            <div
              className={`text-right text-3xl sm:text-4xl font-bold font-mono tracking-wider mt-1 break-all ${
                hasError
                  ? "text-[#ff5555]"
                  : "text-[#f1fa8c] drop-shadow-[0_0_10px_rgba(241,250,140,0.4)]"
              }`}
            >
              {isCalculating ? "..." : displayValue}
            </div>
          </div>

          {/* KEYPAD GRID */}
          <div className="grid grid-cols-4 gap-3">
            {/* Row 1: Actions & Top Ops */}
            <button
              onClick={clearAll}
              className="btn-anime bg-[#ff5555]/20 text-[#ff5555] border-[#ff5555]/40 hover:bg-[#ff5555] hover:text-white"
            >
              AC
            </button>
            <button
              onClick={handleBackspace}
              className="btn-anime bg-[#ff79c6]/20 text-[#ff79c6] border-[#ff79c6]/40 hover:bg-[#ff79c6] hover:text-white"
            >
              ⌫
            </button>
            <button
              onClick={() => handleOperator("√")}
              className="btn-anime bg-[#bd93f9]/20 text-[#bd93f9] border-[#bd93f9]/40 hover:bg-[#bd93f9] hover:text-[#1c162b]"
            >
              √
            </button>
            <button
              onClick={() => handleOperator("%")}
              className="btn-anime bg-[#bd93f9]/20 text-[#bd93f9] border-[#bd93f9]/40 hover:bg-[#bd93f9] hover:text-[#1c162b]"
            >
              %
            </button>

            {/* Row 2: 7 8 9 ÷ */}
            <button
              onClick={() => inputDigit("7")}
              className={`btn-anime btn-digit ${pressedKey === "7" ? "scale-95" : ""}`}
            >
              7
            </button>
            <button
              onClick={() => inputDigit("8")}
              className={`btn-anime btn-digit ${pressedKey === "8" ? "scale-95" : ""}`}
            >
              8
            </button>
            <button
              onClick={() => inputDigit("9")}
              className={`btn-anime btn-digit ${pressedKey === "9" ? "scale-95" : ""}`}
            >
              9
            </button>
            <button
              onClick={() => handleOperator("÷")}
              className="btn-anime bg-[#8be9fd]/20 text-[#8be9fd] border-[#8be9fd]/40 hover:bg-[#8be9fd] hover:text-[#1c162b]"
            >
              ÷
            </button>

            {/* Row 3: 4 5 6 × */}
            <button
              onClick={() => inputDigit("4")}
              className={`btn-anime btn-digit ${pressedKey === "4" ? "scale-95" : ""}`}
            >
              4
            </button>
            <button
              onClick={() => inputDigit("5")}
              className={`btn-anime btn-digit ${pressedKey === "5" ? "scale-95" : ""}`}
            >
              5
            </button>
            <button
              onClick={() => inputDigit("6")}
              className={`btn-anime btn-digit ${pressedKey === "6" ? "scale-95" : ""}`}
            >
              6
            </button>
            <button
              onClick={() => handleOperator("×")}
              className="btn-anime bg-[#8be9fd]/20 text-[#8be9fd] border-[#8be9fd]/40 hover:bg-[#8be9fd] hover:text-[#1c162b]"
            >
              ×
            </button>

            {/* Row 4: 1 2 3 - */}
            <button
              onClick={() => inputDigit("1")}
              className={`btn-anime btn-digit ${pressedKey === "1" ? "scale-95" : ""}`}
            >
              1
            </button>
            <button
              onClick={() => inputDigit("2")}
              className={`btn-anime btn-digit ${pressedKey === "2" ? "scale-95" : ""}`}
            >
              2
            </button>
            <button
              onClick={() => inputDigit("3")}
              className={`btn-anime btn-digit ${pressedKey === "3" ? "scale-95" : ""}`}
            >
              3
            </button>
            <button
              onClick={() => handleOperator("-")}
              className="btn-anime bg-[#8be9fd]/20 text-[#8be9fd] border-[#8be9fd]/40 hover:bg-[#8be9fd] hover:text-[#1c162b]"
            >
              -
            </button>

            {/* Row 5: 0 . ^ + */}
            <button
              onClick={() => inputDigit("0")}
              className={`btn-anime btn-digit ${pressedKey === "0" ? "scale-95" : ""}`}
            >
              0
            </button>
            <button onClick={inputDecimal} className="btn-anime btn-digit">
              .
            </button>
            <button
              onClick={() => handleOperator("^")}
              className="btn-anime bg-[#bd93f9]/20 text-[#bd93f9] border-[#bd93f9]/40 hover:bg-[#bd93f9] hover:text-[#1c162b]"
            >{`^`}</button>
            <button
              onClick={() => handleOperator("+")}
              className="btn-anime bg-[#8be9fd]/20 text-[#8be9fd] border-[#8be9fd]/40 hover:bg-[#8be9fd] hover:text-[#1c162b]"
            >
              +
            </button>

            {/* Row 6: = (Spans all 4 columns) */}
            <button
              onClick={handleEquals}
              className="col-span-4 btn-anime bg-gradient-to-r from-[#ff79c6] to-[#bd93f9] text-[#1c162b] border-white font-black text-2xl shadow-[0_4px_15px_rgba(255,121,198,0.4)] hover:brightness-110"
            >
              =
            </button>
          </div>

          <div className="mt-4 text-center text-[11px] text-[#bd93f9]/60 flex items-center justify-center space-x-1">
            <HelpCircle className="w-3 h-3" />
            <span>Keyboard shortcuts supported</span>
          </div>
        </div>

        {/* LOG HISTORY SIDEBAR */}
        <div className="w-full lg:w-72 bg-[#251e36] border-2 border-[#bd93f9]/30 rounded-3xl p-5 shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex flex-col h-[480px]">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#bd93f9]/20">
            <div className="flex items-center space-x-2 text-[#ff79c6]">
              <History className="w-4 h-4" />
              <h3 className="font-bold text-sm tracking-wide">Log History</h3>
            </div>
            {history.length > 0 && (
              <button
                onClick={handleClearHistory}
                disabled={isHistoryLoading}
                className="text-[11px] text-[#ff5555] hover:text-white p-1 rounded transition-colors"
                title="Clear Log History"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex-grow overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {isHistoryLoading ? (
              <div className="text-center py-16 text-[#bd93f9]/60 text-xs">
                Loading history...
              </div>
            ) : historyError ? (
              <div className="text-center py-8 text-[#ff5555] text-xs">
                {historyError}
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-16 text-[#bd93f9]/40 text-xs italic">
                No past calculations
              </div>
            ) : (
              history.map((item) => (
                <div
                  key={item.id}
                  onClick={() => restoreHistory(item)}
                  className="bg-[#1c162b] border border-[#bd93f9]/20 hover:border-[#ff79c6] p-3 rounded-xl cursor-pointer transition-all duration-200 group shadow-sm hover:shadow-[0_0_10px_rgba(255,121,198,0.2)]"
                >
                  <div className="text-[10px] text-[#bd93f9]/60 mb-0.5">
                    {item.timestamp}
                  </div>
                  <div className="text-xs text-[#fce8f3]/80 group-hover:text-white truncate">
                    {item.expression}
                  </div>
                  <div className="text-sm font-bold text-[#f1fa8c] text-right mt-1 font-mono">
                    = {item.result}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="w-full max-w-4xl mt-6 border-t border-[#bd93f9]/10 pt-3 text-center text-[11px] text-[#bd93f9]/50 flex justify-center items-center space-x-2"></footer>

      {/* STYLES */}
      <style>{`
        .btn-anime {
          padding: 0.85rem 0.5rem;
          font-weight: 700;
          font-size: 1rem;
          border-width: 1px;
          border-style: solid;
          border-radius: 1rem;
          transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex;
          align-items: center;
          justify-content: center;
          user-select: none;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
        }
        .btn-anime:active {
          transform: translateY(2px) scale(0.97);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
        }
        .btn-digit {
          background-color: rgba(40, 33, 54, 0.6);
          color: #fce8f3;
          border-color: rgba(189, 147, 249, 0.2);
        }
        .btn-digit:hover {
          background-color: rgba(255, 121, 198, 0.2);
          border-color: rgba(255, 121, 198, 0.6);
          color: #ffffff;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(24, 19, 36, 0.5);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 121, 198, 0.4);
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}
