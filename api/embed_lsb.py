#!/usr/bin/env python3
"""
embed_lsb.py
============
Standalone utility for embedding secret strings into PNG screenshots
using LSB (Least Significant Bit) steganography.

This is NOT part of the main UPI Fraud Detection app.
It is a separate tool used to prepare test screenshots for the
Screenshot Verification POC feature.

IMPORTANT: This uses the SAME Mulberry32 PRNG + Fisher-Yates shuffle
algorithm as extract_lsb_string() in screenshot_verification.py, so
embedded strings can be correctly extracted and verified.

Usage:
    python embed_lsb.py <input.png> <secret_string> <output.png>

Examples:
    # Embed GPay secret into a screenshot
    python embed_lsb.py gpay_screenshot.png "a7f3b9c1d2e8f4a6" gpay_test.png

    # Embed PhonePe secret
    python embed_lsb.py phonepe_screenshot.png "e5d1c8b4a9f2d7e3" phonepe_test.png

    # Embed Paytm secret
    python embed_lsb.py paytm_screenshot.png "c2e6a8d4f1b3e9c7" paytm_test.png

    # Embed BHIM secret
    python embed_lsb.py bhim_screenshot.png "f9a4d7e2c5b8a1f6" bhim_test.png

Secret Strings (for reference):
    GPay    → a7f3b9c1d2e8f4a6
    PhonePe → e5d1c8b4a9f2d7e3
    Paytm   → c2e6a8d4f1b3e9c7
    BHIM    → f9a4d7e2c5b8a1f6

NOTE:
    - Only works with PNG images (JPEG is lossy and destroys LSB data)
    - The secret is scatter-embedded across ALL channels (R, G, B)
      using a deterministic shuffled order (Mulberry32 PRNG, seed=42)
    - A ###END### delimiter is appended so the extractor knows where
      the message ends
    - Changes are completely invisible to the human eye
"""

import sys
from PIL import Image


# ────────────────────────────────────────────────────────────────────
# PRNG + SHUFFLE — must be IDENTICAL to screenshot_verification.py
# ────────────────────────────────────────────────────────────────────

_LSB_DELIMITER = "###END###"
_DEFAULT_SEED = 42


def _mulberry32(seed: int):
    """
    Mulberry32 PRNG — identical to the JavaScript implementation in steg.js
    and to extract_lsb_string() in screenshot_verification.py.
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
    Generate Fisher-Yates-shuffled channel indices — identical to steg.js
    and to extract_lsb_string() in screenshot_verification.py.
    Each pixel contributes 3 indices (R, G, B byte offsets in a flat RGBA array).
    """
    rng = _mulberry32(seed)
    n = total_pixels * 3
    idx = []
    for i in range(total_pixels):
        b = i * 4  # RGBA stride
        idx.append(b)      # R
        idx.append(b + 1)  # G
        idx.append(b + 2)  # B
    for i in range(n - 1, 0, -1):
        j = int(rng() * (i + 1))
        idx[i], idx[j] = idx[j], idx[i]
    return idx


# ────────────────────────────────────────────────────────────────────
# EMBED
# ────────────────────────────────────────────────────────────────────

def embed_lsb(input_path: str, secret: str, output_path: str):
    """
    Embed a secret string into a PNG image using LSB steganography.

    Uses the Mulberry32 PRNG + Fisher-Yates shuffle to scatter bits
    across R, G, B channels in a deterministic but non-sequential order.
    Appends ###END### delimiter so the extractor knows where to stop.
    """
    img = Image.open(input_path)

    if img.format and img.format.upper() != "PNG":
        print(f"⚠️  Warning: Input is {img.format}, not PNG. Converting to PNG for output.")

    if img.mode != "RGB":
        img = img.convert("RGB")

    pixels = list(img.getdata())
    w, h = img.size
    total_pixels = w * h

    # Build the full message: secret + delimiter
    message = secret + _LSB_DELIMITER

    # Convert message to bits
    message_bits = []
    for char in message:
        byte_val = ord(char)
        for bit_pos in range(7, -1, -1):
            message_bits.append((byte_val >> bit_pos) & 1)

    total_bits_needed = len(message_bits)
    max_capacity = total_pixels * 3  # 3 channels per pixel

    if total_bits_needed > max_capacity:
        print(f"❌ Error: Image too small ({total_pixels} pixels, {max_capacity} bit capacity) "
              f"for message ({total_bits_needed} bits needed)")
        sys.exit(1)

    # Build a flat RGBA-like byte array (matching Canvas ImageData layout)
    flat_data = []
    for r, g, b in pixels:
        flat_data.extend([r, g, b, 255])  # alpha = 255

    # Get shuffled indices (same seed as extractor)
    idx = _shuffled_indices(total_pixels, _DEFAULT_SEED)

    # Embed bits into LSB at shuffled positions
    for i, bit in enumerate(message_bits):
        pos = idx[i]
        if pos < len(flat_data):
            flat_data[pos] = (flat_data[pos] & 0xFE) | bit

    # Reconstruct pixel tuples from flat_data
    modified_pixels = []
    for p in range(total_pixels):
        base = p * 4
        modified_pixels.append((flat_data[base], flat_data[base + 1], flat_data[base + 2]))

    # Create output image
    out_img = Image.new("RGB", img.size)
    out_img.putdata(modified_pixels)
    out_img.save(output_path, "PNG")

    print(f"✅ Successfully embedded {len(secret)}-char string into {output_path}")
    print(f"   Secret: {secret}")
    print(f"   Message (with delimiter): {message}")
    print(f"   Bits embedded: {total_bits_needed}")
    print(f"   Capacity: {max_capacity} bits ({total_pixels} pixels × 3 channels)")
    print(f"   Usage: {total_bits_needed / max_capacity * 100:.4f}%")
    print(f"   Algorithm: Mulberry32 PRNG + Fisher-Yates shuffle (seed={_DEFAULT_SEED})")


# ────────────────────────────────────────────────────────────────────
# VERIFY (uses the same extraction logic as screenshot_verification.py)
# ────────────────────────────────────────────────────────────────────

def verify_embedding(image_path: str):
    """
    Verify that a string was correctly embedded by extracting it back
    using the exact same algorithm as screenshot_verification.py.
    """
    img = Image.open(image_path)
    if img.mode != "RGB":
        img = img.convert("RGB")

    w, h = img.size
    total_pixels = w * h
    pixels = list(img.getdata())

    # Build flat RGBA array
    flat_data = []
    for r, g, b in pixels:
        flat_data.extend([r, g, b, 255])

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

        # Check for delimiter every 8 bits
        if len(bits) >= delim_bits_len and len(bits) % 8 == 0:
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
                print(f"🔍 Extracted string: {extracted}")
                print(f"   Length: {len(extracted)} characters")
                print(f"   Printable: {extracted.isprintable()}")
                return extracted

    print("❌ No delimiter found — extraction failed")
    return None


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python embed_lsb.py <input.png> <secret_string> <output.png>")
        print("")
        print("Options:")
        print("  python embed_lsb.py --verify <image.png>    Verify embedded string")
        print("")
        print("Algorithm: Mulberry32 PRNG + Fisher-Yates shuffle (seed=42)")
        print("           Bits scattered across R, G, B channels")
        print("           ###END### delimiter appended")
        print("")
        print("Secret Strings:")
        print("  GPay    → a7f3b9c1d2e8f4a6")
        print("  PhonePe → e5d1c8b4a9f2d7e3")
        print("  Paytm   → c2e6a8d4f1b3e9c7")
        print("  BHIM    → f9a4d7e2c5b8a1f6")
        sys.exit(1)

    if sys.argv[1] == "--verify":
        verify_embedding(sys.argv[2])
    else:
        input_path = sys.argv[1]
        secret = sys.argv[2]
        output_path = sys.argv[3]
        embed_lsb(input_path, secret, output_path)
        print("\n--- Verification ---")
        verify_embedding(output_path)
