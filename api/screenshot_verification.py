"""
screenshot_verification.py
===========================
UPI Transaction Screenshot Verification Module (Proof-of-Concept)

This module provides:
  1. UPI screenshot classification (is this even a UPI screenshot?)
  2. Database table for app → secret string lookup
  3. UPI app detection via OCR keywords + dominant color analysis
  4. LSB steganography extraction from PNG pixels (Mulberry32 scatter)
  5. Verification of extracted string against lookup table

NOTE: This is a POC/demo feature. In production, screenshot verification
would be replaced by server-side payment gateway verification. The secret
strings are pre-embedded into screenshots using the separate embed_lsb.py
utility (not part of this main app).

Dependencies: Pillow, pytesseract, opencv-python
System dep:   tesseract-ocr (brew install tesseract on macOS)
"""

import os
import re
import logging
import sqlite3
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

logger = logging.getLogger("upi_fraud_api")

# ── Tesseract binary path (Homebrew on macOS puts it here) ───────────
# pytesseract needs to know where the tesseract binary is if it's not in PATH
try:
    import pytesseract as _pyt
    _TESSERACT_CANDIDATES = [
        "/opt/homebrew/bin/tesseract",   # Apple Silicon Mac (Homebrew)
        "/usr/local/bin/tesseract",      # Intel Mac (Homebrew)
        "/usr/bin/tesseract",            # Linux
    ]
    for _candidate in _TESSERACT_CANDIDATES:
        if Path(_candidate).exists():
            _pyt.pytesseract.tesseract_cmd = _candidate
            logger.info(f"  Tesseract OCR configured at: {_candidate}")
            break
except ImportError:
    pass  # pytesseract not installed — OCR will be unavailable

# ────────────────────────────────────────────────────────────────────
# PATHS
# ────────────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "upi_reports.db"

# ────────────────────────────────────────────────────────────────────
# SECRET STRINGS — 16-char hex per UPI app (demo/POC)
# ────────────────────────────────────────────────────────────────────

APP_SECRETS = {
    "gpay":    "a7f3b9c1d2e8f4a6",
    "phonepe": "e5d1c8b4a9f2d7e3",
    "paytm":   "c2e6a8d4f1b3e9c7",
    "bhim":    "f9a4d7e2c5b8a1f6",
}

# ────────────────────────────────────────────────────────────────────
# APP DETECTION FINGERPRINTS
# ────────────────────────────────────────────────────────────────────

APP_SIGNATURES = {
    "gpay": {
        "keywords": ["Google Pay", "GPay", "Paid to", "Google"],
        "dominant_colors": [
            (66, 133, 244),   # Google Blue
            (52, 168, 83),    # Google Green
            (251, 188, 4),    # Google Yellow
            (234, 67, 53),    # Google Red
        ],
    },
    "phonepe": {
        "keywords": ["PhonePe", "Transfer to", "phonepe"],
        "dominant_colors": [
            (94, 53, 177),    # PhonePe Purple
            (118, 75, 191),   # Light Purple
        ],
    },
    "paytm": {
        "keywords": ["Paytm", "paid to", "paytm"],
        "dominant_colors": [
            (0, 48, 135),     # Paytm Navy
            (0, 176, 240),    # Paytm Cyan
        ],
    },
    "bhim": {
        "keywords": ["BHIM", "Bharat Interface", "bhim"],
        "dominant_colors": [
            (0, 100, 0),      # Green
            (255, 153, 51),   # Saffron
        ],
    },
}

APP_DISPLAY_NAMES = {
    "gpay": "Google Pay",
    "phonepe": "PhonePe",
    "paytm": "Paytm",
    "bhim": "BHIM",
}

# ────────────────────────────────────────────────────────────────────
# DATABASE INIT
# ────────────────────────────────────────────────────────────────────

def init_screenshot_db():
    """
    Create the screenshot_verification_table in the existing upi_reports.db.
    Seeds the 4 UPI app → secret string mappings.
    """
    os.makedirs(DB_PATH.parent, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS screenshot_verification_table (
            app_id        INTEGER PRIMARY KEY AUTOINCREMENT,
            app_name      VARCHAR(50) NOT NULL UNIQUE,
            secret_string VARCHAR(50) NOT NULL
        )
    """)

    # Seed data (upsert to avoid duplicates on re-init)
    for app_name, secret in APP_SECRETS.items():
        cursor.execute("""
            INSERT OR REPLACE INTO screenshot_verification_table (app_name, secret_string)
            VALUES (?, ?)
        """, (app_name, secret))

    conn.commit()
    conn.close()
    logger.info("  Screenshot verification table initialised ✓")


# Initialise on module load
init_screenshot_db()


# ────────────────────────────────────────────────────────────────────
# FUNCTION 0: UPI SCREENSHOT CLASSIFICATION
# ────────────────────────────────────────────────────────────────────

# UPI-specific text patterns to look for via OCR
_UPI_TEXT_PATTERNS = [
    # Transaction status phrases
    r"(?i)payment\s+successful",
    r"(?i)money\s+sent",
    r"(?i)money\s+received",
    r"(?i)transaction\s+successful",
    r"(?i)transfer\s+successful",
    r"(?i)paid\s+to",
    r"(?i)received\s+from",
    r"(?i)payment\s+completed",
    r"(?i)transaction\s+complete",
    r"(?i)sent\s+to",
    # UPI-specific identifiers
    r"(?i)upi\s*(ref|reference|txn|transaction|id)",
    r"(?i)(txn|transaction)\s*(id|no|number|ref)",
    r"(?i)utr\s*(no|number|:)",
    # Rupee amounts (₹ symbol or Rs or INR)
    r"₹\s*[\d,]+",
    r"(?i)rs\.?\s*[\d,]+",
    r"(?i)inr\s*[\d,]+",
    # UPI app names (strong signal)
    r"(?i)google\s*pay",
    r"(?i)phonepe",
    r"(?i)paytm",
    r"(?i)\bbhim\b",
    r"(?i)gpay",
    # UPI ID patterns (user@bank)
    r"[a-zA-Z0-9._-]+@[a-zA-Z]{2,}",
    # Bank / payment keywords
    r"(?i)credited\s+to",
    r"(?i)debited\s+from",
    r"(?i)bank\s+account",
    r"(?i)a/c\s+ending",
]

# Phone-like aspect ratios (height/width) — generous bounds to cover cropped screenshots
_MIN_ASPECT_RATIO = 0.9   # Allow slightly wider-than-tall (e.g. cropped screenshots)
_MAX_ASPECT_RATIO = 3.5   # Allow very tall screenshots (some phones)


def classify_upi_screenshot(image_path: str) -> dict:
    """
    Determine whether an image is actually a UPI payment screenshot.

    Checks:
    1. Aspect ratio — UPI screenshots are phone-sized (portrait, ~9:16 to 9:20)
    2. UPI-specific text patterns — via OCR (transaction IDs, ₹ amounts, status, app names)
    3. Combined confidence scoring

    Returns: {
        is_upi_screenshot: bool,
        confidence: float (0-1),
        signals: list[str],      # what was detected
        ocr_available: bool,
        aspect_ratio_ok: bool,
    }
    """
    signals = []
    score = 0.0

    try:
        img = Image.open(image_path)
        w, h = img.size
    except Exception as e:
        logger.warning(f"Could not open image for classification: {e}")
        return {
            "is_upi_screenshot": False,
            "confidence": 0,
            "signals": ["image_open_failed"],
            "ocr_available": False,
            "aspect_ratio_ok": False,
        }

    # ── Check 1: Aspect ratio ────────────────────────────────────
    aspect_ratio = h / w if w > 0 else 0
    aspect_ok = _MIN_ASPECT_RATIO <= aspect_ratio <= _MAX_ASPECT_RATIO

    if aspect_ok:
        signals.append("portrait_aspect_ratio")
        # Portrait alone is enough to pass — UPI screenshots are always phone-shaped.
        # OCR patterns are a bonus on top of this.
        score += 0.50
    else:
        # Landscape/square — still give a small score, OCR can rescue it
        signals.append("non_portrait_aspect_ratio")
        score += 0.05

    # ── Check 2: Minimum resolution ─────────────────────────────
    if w >= 100 and h >= 150:
        signals.append("adequate_resolution")
        score += 0.05
    else:
        signals.append("very_low_resolution")

    # ── Check 3: OCR text pattern matching ───────────────────────
    ocr_available = False
    ocr_text = ""

    try:
        import pytesseract
        ocr_text = pytesseract.image_to_string(img)
        ocr_available = True
    except ImportError:
        logger.warning("pytesseract not available — skipping OCR classification")
        signals.append("ocr_unavailable")
    except Exception as e:
        logger.warning(f"OCR failed during classification: {e}")
        signals.append("ocr_error")

    if ocr_available and ocr_text:
        pattern_matches = 0
        matched_patterns = []

        for pattern in _UPI_TEXT_PATTERNS:
            if re.search(pattern, ocr_text):
                pattern_matches += 1
                # Extract a human-readable label from the pattern
                clean = pattern.replace("(?i)", "").replace(r"\s+", " ").replace(r"\s*", "")
                clean = re.sub(r"[\\(){}|?+*\[\]]", "", clean)[:30]
                matched_patterns.append(clean.strip())

        if pattern_matches >= 4:
            score += 0.60  # Very strong signal — multiple UPI indicators
            signals.append(f"strong_upi_text ({pattern_matches} patterns)")
        elif pattern_matches >= 2:
            score += 0.40  # Good signal — some UPI indicators
            signals.append(f"moderate_upi_text ({pattern_matches} patterns)")
        elif pattern_matches == 1:
            score += 0.15  # Weak signal — could be coincidence
            signals.append(f"weak_upi_text ({pattern_matches} pattern)")
        else:
            signals.append("no_upi_text_found")

        if matched_patterns:
            signals.append(f"matched: {', '.join(matched_patterns[:5])}")

        # Check for Rupee symbol specifically (very strong UPI indicator)
        if re.search(r"₹", ocr_text):
            score += 0.10
            signals.append("rupee_symbol_found")

    elif not ocr_available:
        # OCR unavailable — portrait aspect ratio alone is sufficient to pass
        signals.append("ocr_unavailable_aspect_sufficient")

    # ── Final classification ─────────────────────────────────────
    # Threshold is 0.25 — portrait alone (0.50+0.05) far exceeds this.
    # Only truly non-portrait images with no OCR text will be rejected.
    confidence = min(1.0, score)
    is_upi = confidence >= 0.25

    logger.info(
        f"  UPI classification: is_upi={is_upi}, confidence={confidence:.2f}, "
        f"signals={signals}"
    )

    return {
        "is_upi_screenshot": is_upi,
        "confidence": round(confidence, 2),
        "signals": signals,
        "ocr_available": ocr_available,
        "aspect_ratio_ok": aspect_ok,
    }


# ────────────────────────────────────────────────────────────────────
# FUNCTION 1: DETECT UPI APP
# ────────────────────────────────────────────────────────────────────

def _ocr_detect(image_path: str) -> dict:
    """
    Attempt OCR-based app detection using pytesseract.
    Returns {app, confidence} or {app: None} if OCR fails/unavailable.
    """
    try:
        import pytesseract
        img = Image.open(image_path)
        text = pytesseract.image_to_string(img)
        text_lower = text.lower()

        for app_key, sig in APP_SIGNATURES.items():
            matches = sum(1 for kw in sig["keywords"] if kw.lower() in text_lower)
            if matches > 0:
                confidence = min(1.0, matches / len(sig["keywords"]) + 0.3)
                return {
                    "app": app_key,
                    "confidence": round(confidence, 2),
                    "method": "ocr",
                    "ocr_text_snippet": text[:200],
                }

        return {"app": None, "confidence": 0, "method": "ocr"}

    except ImportError:
        logger.warning("pytesseract not available — skipping OCR detection")
        return {"app": None, "confidence": 0, "method": "ocr_unavailable"}
    except Exception as e:
        logger.warning(f"OCR detection failed: {e}")
        return {"app": None, "confidence": 0, "method": "ocr_error"}


def _color_detect(image_path: str) -> dict:
    """
    Detect UPI app by analysing dominant colors in the image.
    Uses K-means clustering on the image pixels.
    """
    try:
        import cv2

        img = cv2.imread(image_path)
        if img is None:
            return {"app": None, "confidence": 0, "method": "color_error"}

        # Convert BGR → RGB
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        # Resize for speed
        small = cv2.resize(img_rgb, (100, 100))
        pixels = small.reshape(-1, 3).astype(np.float32)

        # K-means to find dominant colors
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
        _, labels, centers = cv2.kmeans(pixels, 5, None, criteria, 3, cv2.KMEANS_RANDOM_CENTERS)
        dominant_colors = centers.astype(int).tolist()

        # Score each app by color proximity
        best_app = None
        best_score = float("inf")

        for app_key, sig in APP_SIGNATURES.items():
            total_dist = 0
            match_count = 0
            for app_color in sig["dominant_colors"]:
                min_dist = min(
                    np.sqrt(sum((c - a) ** 2 for c, a in zip(dom, app_color)))
                    for dom in dominant_colors
                )
                if min_dist < 80:  # Threshold for "close enough"
                    match_count += 1
                total_dist += min_dist

            avg_dist = total_dist / max(len(sig["dominant_colors"]), 1)
            if match_count > 0 and avg_dist < best_score:
                best_score = avg_dist
                best_app = app_key

        if best_app and best_score < 120:
            confidence = max(0.3, min(0.85, 1.0 - (best_score / 200)))
            return {
                "app": best_app,
                "confidence": round(confidence, 2),
                "method": "color",
            }

        return {"app": None, "confidence": 0, "method": "color"}

    except ImportError:
        logger.warning("opencv-python not available — skipping color detection")
        return {"app": None, "confidence": 0, "method": "color_unavailable"}
    except Exception as e:
        logger.warning(f"Color detection failed: {e}")
        return {"app": None, "confidence": 0, "method": "color_error"}


def detect_upi_app(image_path: str) -> dict:
    """
    Detect which UPI app a screenshot is from.
    Combines OCR keyword matching + dominant color analysis.

    Returns: {
        detected_app: str | None,
        display_name: str,
        confidence: float (0-1),
        method: str
    }
    """
    # Try OCR first (more reliable when text is readable)
    ocr_result = _ocr_detect(image_path)
    if ocr_result["app"]:
        return {
            "detected_app": ocr_result["app"],
            "display_name": APP_DISPLAY_NAMES.get(ocr_result["app"], "Unknown"),
            "confidence": ocr_result["confidence"],
            "method": "ocr",
        }

    # Fall back to color analysis
    color_result = _color_detect(image_path)
    if color_result["app"]:
        return {
            "detected_app": color_result["app"],
            "display_name": APP_DISPLAY_NAMES.get(color_result["app"], "Unknown"),
            "confidence": color_result["confidence"],
            "method": "color",
        }

    # Neither method could detect
    return {
        "detected_app": None,
        "display_name": "Unknown",
        "confidence": 0,
        "method": "none",
    }


# ────────────────────────────────────────────────────────────────────
# FUNCTION 2: EXTRACT LSB STEGANOGRAPHY STRING
# ────────────────────────────────────────────────────────────────────

def _mulberry32(seed: int):
    """
    Mulberry32 PRNG — identical to the JavaScript implementation in steg.js.
    Must produce the exact same sequence to decode scatter-embedded data.
    """
    state = seed & 0xFFFFFFFF

    def _next():
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = ((state ^ (state >> 15)) * (1 | state)) & 0xFFFFFFFF
        t = (t + (((t ^ (t >> 7)) * (61 | t)) & 0xFFFFFFFF) ^ t) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
    return _next


def _shuffled_indices(total_pixels: int, seed: int = 42):
    """
    Generate Fisher-Yates-shuffled channel indices — identical to steg.js.
    Each pixel contributes 3 indices (R, G, B byte offsets in a flat array).
    """
    rng = _mulberry32(seed)
    n = total_pixels * 3
    idx = []
    for i in range(total_pixels):
        b = i * 4
        idx.append(b)
        idx.append(b + 1)
        idx.append(b + 2)
    for i in range(n - 1, 0, -1):
        j = int(rng() * (i + 1))
        idx[i], idx[j] = idx[j], idx[i]
    return idx


_LSB_DELIMITER = "###END###"
_DEFAULT_SEED = 42


def extract_lsb_string(image_path: str, string_length: int = 16) -> str | None:
    """
    Extract a hidden LSB steganography string from a PNG image.

    Uses the SAME Mulberry32 PRNG + Fisher-Yates shuffle algorithm as
    the StegaVault steg.js engine (from the emmebeeding folder), so
    admin-embedded screenshots are correctly verified.

    The algorithm:
    1. Generates a shuffled list of byte-offsets into the flat RGBA pixel data
    2. Reads the LSB of each shuffled position
    3. Assembles bits into characters, scanning for the ###END### delimiter
    4. Returns the message portion (before the delimiter)

    Only works with PNG images (JPEG destroys LSB data).
    """
    try:
        img = Image.open(image_path)

        # Must be PNG (lossless) for LSB to survive
        if img.format and img.format.upper() != "PNG":
            return None

        # Convert to RGB if necessary
        if img.mode != "RGB":
            img = img.convert("RGB")

        w, h = img.size
        total_pixels = w * h

        # Build a flat RGBA-like byte array (matching Canvas ImageData layout)
        # steg.js works with ImageData.data which is [R,G,B,A, R,G,B,A, ...]
        pixels = list(img.getdata())
        flat_data = []
        for r, g, b in pixels:
            flat_data.extend([r, g, b, 255])  # alpha = 255

        # Get shuffled indices
        idx = _shuffled_indices(total_pixels, _DEFAULT_SEED)
        max_bits = total_pixels * 3
        delim_bits_len = len(_LSB_DELIMITER) * 8

        # Extract bits following the shuffled order
        bits = []
        for i in range(min(max_bits, len(idx))):
            pos = idx[i]
            if pos < len(flat_data):
                bits.append(flat_data[pos] & 1)
            else:
                bits.append(0)

            # Check for delimiter every 8 bits (byte boundary)
            if len(bits) >= delim_bits_len and len(bits) % 8 == 0:
                # Convert the last delim_bits_len bits to string
                tail_chars = []
                tail_start = len(bits) - delim_bits_len
                for ci in range(tail_start, len(bits), 8):
                    c = 0
                    for bi in range(8):
                        c = (c << 1) | bits[ci + bi]
                    if c == 0:
                        break
                    tail_chars.append(chr(c))
                tail_str = "".join(tail_chars)

                if tail_str == _LSB_DELIMITER:
                    # Found delimiter! Extract message (everything before delimiter)
                    msg_bits = bits[:len(bits) - delim_bits_len]
                    msg_chars = []
                    for ci in range(0, len(msg_bits) - 7, 8):
                        c = 0
                        for bi in range(8):
                            c = (c << 1) | msg_bits[ci + bi]
                        if c == 0:
                            break
                        msg_chars.append(chr(c))
                    extracted = "".join(msg_chars)

                    if extracted and extracted.isprintable():
                        return extracted
                    return None

        # No delimiter found — no valid watermark
        return None

    except Exception as e:
        logger.error(f"LSB extraction failed: {e}")
        return None


# ────────────────────────────────────────────────────────────────────
# FUNCTION 3: VERIFY AGAINST LOOKUP TABLE
# ────────────────────────────────────────────────────────────────────

REASON_MESSAGES = {
    "GENUINE": "This screenshot has a valid verification signature. The transaction appears authentic.",
    "NO_STRING": "No verification signature found. This is likely a fake or unverified screenshot.",
    "STRING_MISMATCH": "Cross-app forgery detected! The embedded signature belongs to a different app than what the screenshot appears to be.",
    "UNKNOWN_APP": "Screenshot does not match any known UPI app.",
    "INVALID_FORMAT": "Only PNG screenshots are supported. JPEG and other formats destroy the verification signature.",
    "NOT_UPI_SCREENSHOT": "This image does not appear to be a UPI payment screenshot. Please upload a screenshot from a UPI app like Google Pay, PhonePe, Paytm, or BHIM.",
}


def verify_against_table(detected_app: str | None, extracted_string: str | None) -> dict:
    """
    Verify the extracted LSB string against the screenshot_verification_table.

    APP-MATCH-REQUIRED approach:
    1. Extract the hidden string from the image
    2. Look up which app the string belongs to in the DB
    3. Compare against the detected app (via OCR/color)
    4. GENUINE only if the string's app matches the detected app
    5. If string belongs to a different app → FRAUD (cross-app forgery)

    Returns: {
        result:       "GENUINE" | "FRAUD",
        reason_code:  str,
        message:      str,
        risk_score:   int (0 or 100),
        matched_app:  str | None  (the app the string belongs to)
    }
    """
    # Case: No string extracted at all
    if not extracted_string:
        if detected_app:
            return {
                "result": "FRAUD",
                "reason_code": "NO_STRING",
                "message": REASON_MESSAGES["NO_STRING"],
                "risk_score": 100,
                "matched_app": None,
            }
        else:
            return {
                "result": "FRAUD",
                "reason_code": "NO_STRING",
                "message": REASON_MESSAGES["NO_STRING"],
                "risk_score": 100,
                "matched_app": None,
            }

    # STRING-FIRST: Look up the extracted string directly in the DB
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Direct lookup: does this string belong to ANY app?
        cursor.execute(
            "SELECT app_name FROM screenshot_verification_table WHERE secret_string = ?",
            (extracted_string,)
        )
        string_match = cursor.fetchone()
        conn.close()

        if string_match:
            matched_app_key = string_match[0]
            matched_app_name = APP_DISPLAY_NAMES.get(matched_app_key, matched_app_key)

            # Check: does the detected app match the app the secret belongs to?
            if detected_app and detected_app != matched_app_key:
                # CROSS-APP MISMATCH: screenshot looks like one app but has
                # a secret string belonging to a different app.
                # This means someone embedded e.g. PhonePe's secret into a
                # GPay screenshot — that's a forgery attempt.
                detected_display = APP_DISPLAY_NAMES.get(detected_app, detected_app)
                return {
                    "result": "FRAUD",
                    "reason_code": "STRING_MISMATCH",
                    "message": (
                        f"Cross-app forgery detected! This screenshot appears to be from "
                        f"{detected_display}, but the embedded signature belongs to "
                        f"{matched_app_name}. This is a forgery attempt."
                    ),
                    "risk_score": 100,
                    "matched_app": matched_app_key,
                }
            else:
                # Perfect match: app detection matches the secret's app
                # (or no app was detected — string is proof enough)
                return {
                    "result": "GENUINE",
                    "reason_code": "GENUINE",
                    "message": (
                        f"This screenshot has a valid verification signature matching "
                        f"{matched_app_name}. The transaction appears authentic."
                    ),
                    "risk_score": 0,
                    "matched_app": matched_app_key,
                }
        else:
            # String extracted but doesn't match any known app
            return {
                "result": "FRAUD",
                "reason_code": "STRING_MISMATCH",
                "message": (
                    "A signature was found but does not match any known UPI app. "
                    "This is a possible forgery attempt."
                ),
                "risk_score": 100,
                "matched_app": None,
            }

    except Exception as e:
        logger.error(f"DB verification failed: {e}")
        return {
            "result": "FRAUD",
            "reason_code": "UNKNOWN_APP",
            "message": f"Verification failed: {str(e)}",
            "risk_score": 100,
            "matched_app": None,
        }


# ────────────────────────────────────────────────────────────────────
# MAIN VERIFICATION PIPELINE
# ────────────────────────────────────────────────────────────────────

def verify_screenshot(image_path: str, original_filename: str = "") -> dict:
    """
    Full screenshot verification pipeline (STRING-FIRST approach).

    1. Check file format (PNG only)
    2. Classify whether the image is a UPI screenshot at all
    3. Extract LSB steganography string FIRST (this is the crypto proof)
    4. Look up string in DB to identify which app it belongs to
    5. Detect UPI app via OCR/color as secondary context
    6. Return verdict

    Returns complete verification result (never exposes secret strings).
    """
    # Step 0: Format check
    ext = Path(original_filename or image_path).suffix.lower()
    if ext not in (".png",):
        return {
            "result": "REJECTED",
            "reason_code": "INVALID_FORMAT",
            "message": REASON_MESSAGES["INVALID_FORMAT"],
            "risk_score": 100,
            "detected_app": None,
            "display_name": "N/A",
            "confidence": 0,
            "confidence_label": "LOW",
            "signature_status": "N/A",
            "detection_method": "none",
            "extracted_string": None,
            "is_upi_screenshot": None,
            "classification_signals": [],
        }

    # Step 1: Classify whether this is even a UPI screenshot
    classification = classify_upi_screenshot(image_path)
    logger.info(
        f"  UPI classification: is_upi={classification['is_upi_screenshot']}, "
        f"confidence={classification['confidence']}"
    )

    if not classification["is_upi_screenshot"]:
        return {
            "result": "REJECTED",
            "reason_code": "NOT_UPI_SCREENSHOT",
            "message": REASON_MESSAGES["NOT_UPI_SCREENSHOT"],
            "risk_score": 100,
            "detected_app": None,
            "display_name": "Not a UPI Screenshot",
            "confidence": classification["confidence"],
            "confidence_label": "LOW",
            "signature_status": "N/A",
            "detection_method": "classification",
            "extracted_string": None,
            "is_upi_screenshot": False,
            "classification_signals": classification["signals"],
        }

    # Step 2: Extract LSB string FIRST (this is the primary check)
    extracted = extract_lsb_string(image_path, string_length=16)
    logger.info(f"  LSB extraction: {'found string' if extracted else 'no string found'}")

    # Step 3: Detect UPI app (secondary context)
    app_info = detect_upi_app(image_path)
    logger.info(f"  App detection: {app_info['display_name']} ({app_info['method']}, conf={app_info['confidence']})")

    # Step 4: Verify string against DB (string-first)
    verification = verify_against_table(app_info["detected_app"], extracted)

    # Use matched_app from string lookup if available (more reliable than color detection)
    final_app = verification.get("matched_app") or app_info["detected_app"]
    final_display = APP_DISPLAY_NAMES.get(final_app, app_info["display_name"]) if final_app else app_info["display_name"]

    # Confidence: if string matched, boost confidence
    final_confidence = app_info["confidence"]
    if verification.get("matched_app"):
        final_confidence = max(final_confidence, 0.95)  # String match = high confidence

    # Build response (NEVER expose actual secret strings)
    return {
        "result": verification["result"],
        "reason_code": verification["reason_code"],
        "message": verification["message"],
        "risk_score": verification["risk_score"],
        "detected_app": final_app,
        "display_name": final_display,
        "confidence": final_confidence,
        "confidence_label": (
            "HIGH" if final_confidence >= 0.7
            else "MEDIUM" if final_confidence >= 0.4
            else "LOW"
        ),
        "signature_status": (
            "VALID ✓" if verification["reason_code"] == "GENUINE"
            else "INVALID ✗" if extracted
            else "NOT FOUND"
        ),
        "detection_method": (
            "signature" if verification.get("matched_app")
            else app_info["method"]
        ),
        # Never expose actual strings
        "extracted_string": "[HIDDEN]" if extracted else None,
        "is_upi_screenshot": True,
        "classification_signals": classification["signals"],
    }
