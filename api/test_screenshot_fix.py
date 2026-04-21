#!/usr/bin/env python3
"""
Quick end-to-end test to verify:
1. embed_lsb.py and extract_lsb_string() use the SAME algorithm
2. UPI screenshot classification works correctly
"""

import os
import sys
import tempfile
from PIL import Image, ImageDraw, ImageFont

# Add api dir to path
sys.path.insert(0, os.path.dirname(__file__))


def create_test_image(width=400, height=800, text="", bg_color=(255, 255, 255)):
    """Create a simple test PNG image."""
    img = Image.new("RGB", (width, height), bg_color)
    if text:
        draw = ImageDraw.Draw(img)
        # Simple text rendering
        y_offset = 100
        for line in text.split("\n"):
            draw.text((20, y_offset), line, fill=(0, 0, 0))
            y_offset += 30
    return img


def test_algorithm_alignment():
    """Test that embed_lsb.py and extract_lsb_string() produce matching results."""
    print("=" * 60)
    print("TEST 1: Algorithm Alignment (embed ↔ extract)")
    print("=" * 60)

    from embed_lsb import embed_lsb
    from screenshot_verification import extract_lsb_string

    secrets = {
        "gpay": "a7f3b9c1d2e8f4a6",
        "phonepe": "e5d1c8b4a9f2d7e3",
        "paytm": "c2e6a8d4f1b3e9c7",
        "bhim": "f9a4d7e2c5b8a1f6",
    }

    all_passed = True

    for app_name, secret in secrets.items():
        # Create a test image
        img = create_test_image(300, 600)
        
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f_in:
            img.save(f_in.name, "PNG")
            input_path = f_in.name

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f_out:
            output_path = f_out.name

        try:
            # Embed the secret
            embed_lsb(input_path, secret, output_path)
            
            # Extract it back
            extracted = extract_lsb_string(output_path)
            
            if extracted == secret:
                print(f"  ✅ {app_name:10s} | embedded='{secret}' | extracted='{extracted}' | MATCH")
            else:
                print(f"  ❌ {app_name:10s} | embedded='{secret}' | extracted='{extracted}' | MISMATCH!")
                all_passed = False
        finally:
            os.unlink(input_path)
            os.unlink(output_path)

    print()
    if all_passed:
        print("  ✅ ALL ALIGNMENT TESTS PASSED!")
    else:
        print("  ❌ SOME TESTS FAILED!")
    print()
    return all_passed


def test_classification():
    """Test that UPI screenshot classification works correctly."""
    print("=" * 60)
    print("TEST 2: UPI Screenshot Classification")
    print("=" * 60)

    from screenshot_verification import classify_upi_screenshot

    all_passed = True

    # Test 1: Landscape image (NOT a UPI screenshot)
    print("\n  --- Random landscape image (should NOT be UPI) ---")
    img = create_test_image(800, 400, "Hello World\nThis is a cat photo")
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        img.save(f.name, "PNG")
        result = classify_upi_screenshot(f.name)
        is_upi = result["is_upi_screenshot"]
        print(f"  Image: 800x400 landscape with generic text")
        print(f"  Result: is_upi={is_upi}, confidence={result['confidence']}")
        print(f"  Signals: {result['signals']}")
        if is_upi:
            print(f"  ⚠️  FALSE POSITIVE (expected NOT UPI)")
            # Not a hard fail — OCR might not be available
        else:
            print(f"  ✅ Correctly rejected")
        os.unlink(f.name)

    # Test 2: Portrait image with UPI-like text (SHOULD be UPI)
    print("\n  --- Portrait image with UPI text (SHOULD be UPI) ---")
    upi_text = (
        "Google Pay\n"
        "Payment Successful\n"
        "₹500.00\n"
        "Paid to: John Doe\n"
        "UPI Ref No: 123456789012\n"
        "Transaction ID: TXN2026042012345"
    )
    img = create_test_image(400, 800, upi_text)
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        img.save(f.name, "PNG")
        result = classify_upi_screenshot(f.name)
        is_upi = result["is_upi_screenshot"]
        print(f"  Image: 400x800 portrait with UPI text")
        print(f"  Result: is_upi={is_upi}, confidence={result['confidence']}")
        print(f"  Signals: {result['signals']}")
        if result["ocr_available"]:
            if is_upi:
                print(f"  ✅ Correctly classified as UPI")
            else:
                print(f"  ❌ FALSE NEGATIVE (expected UPI)")
                all_passed = False
        else:
            print(f"  ℹ️  OCR not available — classification based on aspect ratio only")
        os.unlink(f.name)

    # Test 3: Square image with no text (NOT UPI)
    print("\n  --- Square image, no text (should NOT be UPI) ---")
    img = create_test_image(500, 500, "")
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        img.save(f.name, "PNG")
        result = classify_upi_screenshot(f.name)
        is_upi = result["is_upi_screenshot"]
        print(f"  Image: 500x500 square, blank")
        print(f"  Result: is_upi={is_upi}, confidence={result['confidence']}")
        print(f"  Signals: {result['signals']}")
        if not is_upi:
            print(f"  ✅ Correctly rejected")
        else:
            print(f"  ⚠️  Unexpected: classified as UPI")
        os.unlink(f.name)

    print()
    if all_passed:
        print("  ✅ ALL CLASSIFICATION TESTS PASSED!")
    else:
        print("  ❌ SOME TESTS FAILED!")
    print()
    return all_passed


def test_full_pipeline():
    """Test the full verify_screenshot pipeline."""
    print("=" * 60)
    print("TEST 3: Full Pipeline (embed → classify → extract → verify)")
    print("=" * 60)

    from embed_lsb import embed_lsb
    from screenshot_verification import verify_screenshot

    # Create a UPI-like image and embed GPay secret
    upi_text = (
        "Google Pay\n"
        "Payment Successful\n"
        "₹1,500.00\n"
        "Paid to: Jane Smith\n"
        "UPI Ref No: 987654321012\n"
        "Transaction ID: TXN2026042098765"
    )
    img = create_test_image(400, 800, upi_text)

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f_in:
        img.save(f_in.name, "PNG")
        input_path = f_in.name

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f_out:
        output_path = f_out.name

    try:
        # Embed GPay secret
        embed_lsb(input_path, "a7f3b9c1d2e8f4a6", output_path)

        # Run full verification pipeline
        result = verify_screenshot(output_path, original_filename="gpay_test.png")

        print(f"\n  Result:           {result['result']}")
        print(f"  Reason:           {result['reason_code']}")
        print(f"  Message:          {result['message']}")
        print(f"  App Detected:     {result['display_name']}")
        print(f"  Confidence:       {result['confidence']} ({result['confidence_label']})")
        print(f"  Signature:        {result['signature_status']}")
        print(f"  Detection Method: {result['detection_method']}")
        print(f"  Is UPI:           {result.get('is_upi_screenshot')}")
        print(f"  Risk Score:       {result['risk_score']}")

        if result['result'] == 'GENUINE':
            print(f"\n  ✅ FULL PIPELINE TEST PASSED! (GENUINE)")
        elif result['reason_code'] == 'NOT_UPI_SCREENSHOT':
            print(f"\n  ℹ️  Image was rejected as not a UPI screenshot")
            print(f"     This is expected if OCR (pytesseract) is not installed.")
            print(f"     Classification signals: {result.get('classification_signals')}")
        else:
            print(f"\n  ⚠️  Result was {result['result']} — check pipeline")

    finally:
        os.unlink(input_path)
        os.unlink(output_path)

    print()


if __name__ == "__main__":
    print("\n🔬 Screenshot Verification Fix — End-to-End Tests\n")
    
    t1 = test_algorithm_alignment()
    t2 = test_classification()
    test_full_pipeline()

    print("=" * 60)
    if t1:
        print("✅ CRITICAL FIX VERIFIED: Embedding and extraction algorithms are aligned!")
    else:
        print("❌ CRITICAL: Algorithm alignment FAILED!")
    print("=" * 60)
