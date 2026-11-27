"""Nối model — chỗ DUY NHẤT trong bản chạy thử gọi model AI.

Hợp đồng (giữ nguyên để khung đo được token):
    call_model(system: str, user: str, timeout: float = TIMEOUT_S) -> dict với 4 khoá
        "text":       str   chữ model trả về
        "model":      str   tên model đã gọi (để tra giá ở bảng giá model)
        "tokens_in":  int   số token vào, lấy từ trường usage trong phản hồi API — KHÔNG ước lượng
        "tokens_out": int   số token ra, gồm cả token suy luận / suy nghĩ nếu API tính riêng
    @model_call (từ tracing.py) tự ghi mỗi lần gọi vào trace; agent.py gọi call_model bao nhiêu lần
    cũng được, khung tự cộng token.
    Lỗi gọi model (hết lượt, sai key, mất mạng, quá giờ): exception bay ra. agent.py bắt lỗi để bot
    rơi về mock trong ván; trace vẫn ghi lỗi.

Chế độ giả (mặc định khi .env chưa có MODEL_PROVIDER, hoặc MODEL_PROVIDER=fake):
    trả một câu giả cố định, model "fake", token 0 — để luồng chạy hết từ trước CP2 (guide bước 3.2).
    Lượt `run.py eval` / `run.py simulate` chạy bằng model giả KHÔNG được tính.

Nối model thật: điền .env (chép từ .env.example). Không dán API key vào file này.
    MODEL_PROVIDER   openai · anthropic · gemini · ollama
    MODEL_NAME       mã gọi API của model, vd gpt-5.4-nano, claude-haiku-5-5, gemini-3.1-flash-lite
    API_KEY          key của nhóm (ollama không cần)
    MODEL_BASE_URL   (tuỳ chọn) đổi URL cho API cùng định dạng OpenAI, vd DeepSeek
    MODEL_TIMEOUT_S  (tuỳ chọn) giới hạn giây cho một lần gọi, mặc định 4.5 để bot trả lời dưới 5 giây
"""
import json
import os
import urllib.error
import urllib.request

from tracing import model_call

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_env(path=os.path.join(ROOT, ".env")):
    """Đọc file .env (KEY=VALUE mỗi dòng) vào biến môi trường, không ghi đè biến đã có. Khung — không cần sửa."""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env()
MODEL_PROVIDER = (os.environ.get("MODEL_PROVIDER") or "fake").strip().lower()
MODEL_NAME = (os.environ.get("MODEL_NAME") or "").strip()
API_KEY = (os.environ.get("API_KEY") or "").strip()
BASE_URL = (os.environ.get("MODEL_BASE_URL") or "").strip()
TIMEOUT_S = float(os.environ.get("MODEL_TIMEOUT_S") or 4.5)
MAX_TOKENS = 400   # đủ cho một object JSON ngắn; giữ nhỏ để bot trả lời nhanh

URL_OPENAI = BASE_URL or "https://api.openai.com/v1/chat/completions"
URL_CLAUDE = "https://api.anthropic.com/v1/messages"
URL_GEMINI = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent"
URL_OLLAMA = BASE_URL or "http://localhost:11434/api/chat"

SHOW_RAW = False   # đổi thành True để in nguyên phản hồi của API khi cần tìm tên trường


def post_json(url, headers, body, timeout):
    """Gửi POST JSON, trả về JSON phản hồi. Chỉ dùng thư viện chuẩn (urllib)."""
    req = urllib.request.Request(
        url, data=json.dumps(body).encode("utf-8"), method="POST",
        headers=dict({"Content-Type": "application/json"}, **headers))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError("HTTP %d: %s" % (e.code, e.read().decode("utf-8", "replace")[:300]))
    if SHOW_RAW:
        print(json.dumps(data, ensure_ascii=False, indent=2)[:3000])
    return data


def call_openai(system, user, timeout):
    messages = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": user}]
    data = post_json(URL_OPENAI, {"Authorization": "Bearer " + API_KEY},
                     {"model": MODEL_NAME, "messages": messages,
                      "response_format": {"type": "json_object"}}, timeout)
    u = data["usage"]
    return {"text": data["choices"][0]["message"]["content"] or "",
            "tokens_in": u["prompt_tokens"], "tokens_out": u["completion_tokens"]}


def call_claude(system, user, timeout):
    # Bot cần trả nhanh một object JSON ngắn: tắt thinking (Haiku 5.5 mặc định bật) và đặt effort thấp,
    # để token suy nghĩ không ăn hết MAX_TOKENS và làm chậm lượt chơi.
    data = post_json(URL_CLAUDE, {"x-api-key": API_KEY, "anthropic-version": "2023-06-01"},
                     {"model": MODEL_NAME, "max_tokens": MAX_TOKENS, "system": system or "",
                      "thinking": {"type": "disabled"}, "output_config": {"effort": "low"},
                      "messages": [{"role": "user", "content": user}]}, timeout)
    if data.get("stop_reason") == "refusal":
        raise RuntimeError("Claude từ chối trả lời (stop_reason=refusal)")
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    u = data["usage"]
    return {"text": text, "tokens_in": u["input_tokens"], "tokens_out": u["output_tokens"]}


def call_gemini(system, user, timeout):
    body = {"contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {"responseMimeType": "application/json", "maxOutputTokens": MAX_TOKENS}}
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    data = post_json(URL_GEMINI % MODEL_NAME, {"x-goog-api-key": API_KEY}, body, timeout)
    parts = (data.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
    u = data["usageMetadata"]
    return {"text": "".join(p.get("text", "") for p in parts),
            "tokens_in": u.get("promptTokenCount", 0),
            "tokens_out": u.get("candidatesTokenCount", 0) + u.get("thoughtsTokenCount", 0)}


def call_ollama(system, user, timeout):
    messages = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": user}]
    data = post_json(URL_OLLAMA, {}, {"model": MODEL_NAME, "messages": messages,
                                      "stream": False, "format": "json"}, timeout)
    return {"text": data["message"]["content"],
            "tokens_in": data.get("prompt_eval_count", 0), "tokens_out": data.get("eval_count", 0)}


PROVIDERS = {"openai": call_openai, "anthropic": call_claude, "claude": call_claude,
             "gemini": call_gemini, "ollama": call_ollama}


@model_call
def call_model(system: str, user: str, timeout: float = TIMEOUT_S) -> dict:
    if MODEL_PROVIDER == "fake":
        last = (user.strip().splitlines() or [""])[-1]
        return {"text": "[câu trả lời giả — chưa nối model] " + last[:60], "model": "fake", "tokens_in": 0, "tokens_out": 0}
    fn = PROVIDERS.get(MODEL_PROVIDER)
    if fn is None:
        raise NotImplementedError("MODEL_PROVIDER=%s chưa hỗ trợ; dùng một trong: %s"
                                  % (MODEL_PROVIDER, ", ".join(sorted(PROVIDERS))))
    if not MODEL_NAME:
        raise NotImplementedError("Chưa điền MODEL_NAME trong .env — xem docs/connect-model.md")
    r = fn(system, user, timeout)
    return {"text": r["text"], "model": MODEL_NAME,
            "tokens_in": int(r["tokens_in"]), "tokens_out": int(r["tokens_out"])}
