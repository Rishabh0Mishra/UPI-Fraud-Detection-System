#!/usr/bin/env python3
"""
embed_lsb.py
============
Standalone utility for embedding secret strings into PNG screenshots
using LSB (Least Significant Bit) steganography.

This is NOT part of the main UPI Fraud Detection app.
It is a separate tool used to prepare test screenshots for the
Screenshot Verification POC feature.

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
    - The secret is embedded in the LSB of the RED channel
    - Changes are completely invisible to the human eye
    - String length should be exactly 16 characters
"""

import sys
from PIL import Image


def embed_lsb(input_path: str, secret: str, output_path: str):
    """
    Embed a secret string into a PNG image using LSB steganography.

    The string is encoded into the Least Significant Bit of the RED channel
    of the first (len(secret) × 8) pixels.
    """
    img = Image.open(input_path)

    if img.format and img.format.upper() != "PNG":
        print(f"⚠️  Warning: Input is {img.format}, not PNG. Converting to PNG for output.")

    if img.mode != "RGB":
        img = img.convert("RGB")

    pixels = list(img.getdata())
    bits_needed = len(secret) * 8

    if len(pixels) < bits_needed:
        print(f"❌ Error: Image too small ({len(pixels)} pixels) for {len(secret)}-char string ({bits_needed} pixels needed)")
        sys.exit(1)

    # Convert secret to bits
    secret_bits = []
    for char in secret:
        byte = format(ord(char), "08b")
        secret_bits.extend(int(b) for b in byte)

    # Embed bits into LSB of red channel
    modified_pixels = list(pixels)
    for i, bit in enumerate(secret_bits):
        r, g, b = pixels[i][:3]
        # Clear LSB and set to our bit
        r = (r & 0xFE) | bit
        modified_pixels[i] = (r, g, b)

    # Create output image
    out_img = Image.new("RGB", img.size)
    out_img.putdata(modified_pixels)
    out_img.save(output_path, "PNG")

    print(f"✅ Successfully embedded {len(secret)}-char string into {output_path}")
    print(f"   Secret: {secret}")
    print(f"   Pixels modified: {bits_needed}")
    print(f"   Total pixels: {len(pixels)}")
    print(f"   Modification: {bits_needed / len(pixels) * 100:.4f}% of pixels")


def verify_embedding(image_path: str, string_length: int = 16):
    """Verify that a string was correctly embedded by extracting it back."""
    img = Image.open(image_path)
    if img.mode != "RGB":
        img = img.convert("RGB")

    pixels = list(img.getdata())
    bits_needed = string_length * 8

    bits = []
    for i in range(bits_needed):
        r, g, b = pixels[i][:3]
        bits.append(r & 1)

    chars = []
    for i in range(0, len(bits), 8):
        byte = bits[i:i + 8]
        char_code = int("".join(str(b) for b in byte), 2)
        if 32 <= char_code <= 126:
            chars.append(chr(char_code))
        else:
            chars.append("?")

    extracted = "".join(chars)
    print(f"🔍 Extracted string: {extracted}")
    return extracted


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python embed_lsb.py <input.png> <secret_string> <output.png>")
        print("")
        print("Options:")
        print("  python embed_lsb.py --verify <image.png>    Verify embedded string")
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
        verify_embedding(output_path, len(secret))
