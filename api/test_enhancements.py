import unittest
import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from fraud_enhancements import (
    load_approved_handles,
    validate_upi_format,
    check_upi_handle_validity,
    calculate_name_similarity,
    check_name_upi_mismatch,
    get_risk_level_updated,
    submit_fraud_report,
    check_fraud_reports,
    report_upi_id,
    check_report_threshold,
    classify_binary,
    calculate_name_penalty,
    calculate_report_penalty,
)

class TestUPIFormatValidation(unittest.TestCase):
    """Test strict UPI format validation (Issue 1)."""

    def test_multiple_at_symbols(self):
        """xyz@ybl@fraud should be rejected — multiple @ symbols."""
        res = validate_upi_format("xyz@ybl@fraud")
        self.assertFalse(res['is_valid'])
        self.assertEqual(res['error_type'], 'MULTIPLE_AT_SYMBOLS')

    def test_missing_username(self):
        """@paytm should be rejected — no username."""
        res = validate_upi_format("@paytm")
        self.assertFalse(res['is_valid'])
        self.assertEqual(res['error_type'], 'MISSING_USERNAME')

    def test_missing_handle(self):
        """merchant@ should be rejected — no handle."""
        res = validate_upi_format("merchant@")
        self.assertFalse(res['is_valid'])
        self.assertEqual(res['error_type'], 'MISSING_HANDLE')

    def test_double_at(self):
        """user@@paytm should be rejected."""
        res = validate_upi_format("user@@paytm")
        self.assertFalse(res['is_valid'])
        self.assertEqual(res['error_type'], 'MULTIPLE_AT_SYMBOLS')

    def test_leading_space(self):
        """ user@paytm should be rejected."""
        res = validate_upi_format(" user@paytm")
        self.assertFalse(res['is_valid'])
        self.assertEqual(res['error_type'], 'WHITESPACE')

    def test_trailing_space(self):
        """user@paytm  should be rejected."""
        res = validate_upi_format("user@paytm ")
        self.assertFalse(res['is_valid'])
        self.assertEqual(res['error_type'], 'WHITESPACE')

    def test_space_in_middle(self):
        """user @paytm should be rejected."""
        res = validate_upi_format("user @paytm")
        self.assertFalse(res['is_valid'])
        self.assertEqual(res['error_type'], 'SPACE_IN_MIDDLE')

    def test_username_too_short(self):
        """us@paytm should be rejected — username < 3 chars."""
        res = validate_upi_format("us@paytm")
        self.assertFalse(res['is_valid'])
        self.assertEqual(res['error_type'], 'USERNAME_TOO_SHORT')

    def test_handle_too_short(self):
        """user@p should be rejected — handle < 2 chars."""
        res = validate_upi_format("user@p")
        self.assertFalse(res['is_valid'])
        self.assertEqual(res['error_type'], 'HANDLE_TOO_SHORT')

    def test_username_starts_with_dot(self):
        """.user@paytm should be rejected."""
        res = validate_upi_format(".user@paytm")
        self.assertFalse(res['is_valid'])
        self.assertEqual(res['error_type'], 'USERNAME_SPECIAL_BOUNDARY')

    def test_username_ends_with_dot(self):
        """user.@paytm should be rejected."""
        res = validate_upi_format("user.@paytm")
        self.assertFalse(res['is_valid'])
        self.assertEqual(res['error_type'], 'USERNAME_SPECIAL_BOUNDARY')

    def test_no_at_symbol(self):
        """nousername should be rejected."""
        res = validate_upi_format("nousername")
        self.assertFalse(res['is_valid'])
        self.assertEqual(res['error_type'], 'NO_AT_SYMBOL')

    def test_valid_simple(self):
        """merchant@paytm should pass."""
        res = validate_upi_format("merchant@paytm")
        self.assertTrue(res['is_valid'])
        self.assertEqual(res['username'], 'merchant')
        self.assertEqual(res['handle'], 'paytm')

    def test_valid_with_dots(self):
        """shop.name@ybl should pass."""
        res = validate_upi_format("shop.name@ybl")
        self.assertTrue(res['is_valid'])
        self.assertEqual(res['username'], 'shop.name')

    def test_valid_with_numbers(self):
        """user123@oksbi should pass."""
        res = validate_upi_format("user123@oksbi")
        self.assertTrue(res['is_valid'])

    def test_valid_with_underscore(self):
        """business_account@paytm should pass."""
        res = validate_upi_format("business_account@paytm")
        self.assertTrue(res['is_valid'])

    def test_empty_input(self):
        """Empty string should be rejected."""
        res = validate_upi_format("")
        self.assertFalse(res['is_valid'])
        self.assertEqual(res['error_type'], 'EMPTY_INPUT')

    def test_none_input(self):
        """None should be rejected."""
        res = validate_upi_format(None)
        self.assertFalse(res['is_valid'])
        self.assertEqual(res['error_type'], 'EMPTY_INPUT')


class TestThreeStepValidation(unittest.TestCase):
    """Test the 3-step flow: format → handle → reports."""

    def setUp(self):
        self.mock_handles = {"okaxis", "paytm", "oksbi", "ybl"}

    def test_format_fails_stops_early(self):
        """If format fails, should not reach handle check."""
        res = check_upi_handle_validity("xyz@ybl@fraud", self.mock_handles)
        self.assertFalse(res['is_valid_handle'])
        self.assertEqual(res['validation_step'], 'FORMAT')
        self.assertEqual(res['error_type'], 'MULTIPLE_AT_SYMBOLS')

    def test_format_passes_handle_fails(self):
        """Valid format but invalid handle should fail at HANDLE step."""
        res = check_upi_handle_validity("merchant@fakebank", self.mock_handles)
        self.assertFalse(res['is_valid_handle'])
        self.assertEqual(res['validation_step'], 'HANDLE')
        self.assertIn("NOT recognized", res['message'])

    def test_format_and_handle_pass(self):
        """Valid format + valid handle should pass."""
        res = check_upi_handle_validity("merchant@paytm", self.mock_handles)
        self.assertTrue(res['is_valid_handle'])
        self.assertEqual(res['handle'], 'paytm')

    def test_missing_username_stops_at_format(self):
        """@paytm should stop at format validation."""
        res = check_upi_handle_validity("@paytm", self.mock_handles)
        self.assertFalse(res['is_valid_handle'])
        self.assertEqual(res['validation_step'], 'FORMAT')


class TestFraudReportDatabase(unittest.TestCase):
    """Test the comprehensive fraud reports database (Issue 3)."""

    def test_submit_and_check(self):
        """Submit a report and verify it appears in check."""
        test_id = f"test_db_{os.getpid()}_{id(self)}@paytm"

        # Submit a report
        res = submit_fraud_report(
            fraud_identifier=test_id,
            report_type='UPI_ID',
            reporter_user_id='tester',
            report_reason='Test',
            fraud_confirmed=True,
            amount_lost=5000
        )
        self.assertEqual(res['status'], 'submitted')
        self.assertIn('report_id', res)

        # Check reports
        check = check_fraud_reports(test_id)
        self.assertTrue(check['found'])
        self.assertEqual(check['report_count'], 1)
        self.assertEqual(check['confirmed_fraud_count'], 1)
        self.assertEqual(check['total_amount_lost'], 5000.0)

    def test_multiple_reports_aggregate(self):
        """Multiple reports should aggregate in summary."""
        test_id = f"test_agg_{os.getpid()}_{id(self)}@ybl"

        submit_fraud_report(test_id, 'UPI_ID', 'userA', 'Phishing', False, 0)
        submit_fraud_report(test_id, 'UPI_ID', 'userB', 'Scam', True, 1000)
        submit_fraud_report(test_id, 'UPI_ID', 'userC', 'Fraud', True, 2000)

        check = check_fraud_reports(test_id)
        self.assertTrue(check['found'])
        self.assertEqual(check['report_count'], 3)
        self.assertEqual(check['confirmed_fraud_count'], 2)
        self.assertEqual(check['total_amount_lost'], 3000.0)
        self.assertEqual(check['risk_adjustment'], 90)  # confirmed fraud = +90

    def test_tiered_risk_scoring(self):
        """Verify tiered risk adjustments based on report count."""
        test_id = f"test_tier_{os.getpid()}_{id(self)}@oksbi"

        # 1 report = +20
        submit_fraud_report(test_id, 'UPI_ID', 'u1', 'Test')
        check1 = check_fraud_reports(test_id)
        self.assertEqual(check1['risk_adjustment'], 20)

        # 3 reports total = +40
        submit_fraud_report(test_id, 'UPI_ID', 'u2', 'Test')
        submit_fraud_report(test_id, 'UPI_ID', 'u3', 'Test')
        check3 = check_fraud_reports(test_id)
        self.assertEqual(check3['risk_adjustment'], 40)

    def test_no_reports(self):
        """Non-existent identifier should return no reports."""
        check = check_fraud_reports("nonexistent_xyzzy_12345@paytm")
        self.assertFalse(check['found'])
        self.assertEqual(check['report_count'], 0)
        self.assertEqual(check['risk_adjustment'], 0)

    def test_report_types(self):
        """Different report types should work."""
        test_url = f"http://scam-{os.getpid()}.com"
        res = submit_fraud_report(test_url, 'URL', 'tester', 'Phishing link')
        self.assertEqual(res['status'], 'submitted')
        self.assertEqual(res['report_type'], 'URL')

        check = check_fraud_reports(test_url)
        self.assertTrue(check['found'])

    def test_legacy_wrappers(self):
        """Legacy report_upi_id and check_report_threshold should still work."""
        test_id = f"test_legacy_{os.getpid()}_{id(self)}@ybl"
        res = report_upi_id(test_id, "userA", "Phishing attempt")
        self.assertIn("message", res)

        thresh = check_report_threshold(test_id)
        self.assertEqual(thresh['report_count'], 1)


class TestEnhancements(unittest.TestCase):
    """Existing tests for handle validity, name similarity, risk scoring."""

    def setUp(self):
        self.mock_handles = {"okaxis", "paytm", "oksbi", "ybl"}

    def test_handle_validity(self):
        res1 = check_upi_handle_validity("merchant@okaxis", self.mock_handles)
        self.assertTrue(res1['is_valid_handle'])

        res2 = check_upi_handle_validity("scammer@fakebank", self.mock_handles)
        self.assertFalse(res2['is_valid_handle'])
        self.assertIn("NOT recognized", res2['message'])

        res3 = check_upi_handle_validity("invalid_format_no_at", self.mock_handles)
        self.assertFalse(res3['is_valid_handle'])

    def test_name_similarity(self):
        sim1 = calculate_name_similarity("Rahul Sharma", "rahulsharma")
        self.assertGreater(sim1, 0.8)
        sim2 = calculate_name_similarity("Amazon Pay", "scammer123")
        self.assertLess(sim2, 0.4)

    def test_name_upi_mismatch(self):
        res1 = check_name_upi_mismatch("Rahul Sharma", "rahul.sharma99@oksbi")
        self.assertFalse(res1['is_suspicious'])
        res2 = check_name_upi_mismatch("Amazon Complete Care", "randomguy@ybl")
        self.assertTrue(res2['is_suspicious'])

    def test_risk_scoring(self):
        r1 = get_risk_level_updated(10)
        self.assertEqual(r1['level'], "MINIMAL RISK")
        r2 = get_risk_level_updated(35)
        self.assertEqual(r2['level'], "LOW RISK")
        r3 = get_risk_level_updated(50)
        self.assertEqual(r3['level'], "MEDIUM RISK")
        r4 = get_risk_level_updated(75)
        self.assertEqual(r4['level'], "HIGH RISK")
        r5 = get_risk_level_updated(95)
        self.assertEqual(r5['level'], "CRITICAL RISK")
        self.assertTrue(r5['should_block'])


# ────────────────────────────────────────────────────────────────────
# NEW TESTS: Binary Classification, Penalties, Reductions, Circular Buffer
# ────────────────────────────────────────────────────────────────────

class TestBinaryClassification(unittest.TestCase):
    """Test the FRAUD/NO_FRAUD binary classification at threshold 50."""

    def test_score_49_is_no_fraud(self):
        res = classify_binary(49)
        self.assertEqual(res['classification'], 'NO_FRAUD')
        self.assertFalse(res['should_block'])

    def test_score_50_is_fraud(self):
        res = classify_binary(50)
        self.assertEqual(res['classification'], 'FRAUD')

    def test_score_0_is_no_fraud(self):
        res = classify_binary(0)
        self.assertEqual(res['classification'], 'NO_FRAUD')
        self.assertEqual(res['action'], 'ALLOW')

    def test_score_100_is_fraud_blocked(self):
        res = classify_binary(100)
        self.assertEqual(res['classification'], 'FRAUD')
        self.assertEqual(res['action'], 'BLOCKED')
        self.assertTrue(res['should_block'])

    def test_score_65_is_fraud_strong_warning(self):
        res = classify_binary(65)
        self.assertEqual(res['classification'], 'FRAUD')
        self.assertEqual(res['action'], 'STRONG_WARNING')
        self.assertTrue(res['should_block'])

    def test_score_55_is_fraud_warning(self):
        res = classify_binary(55)
        self.assertEqual(res['classification'], 'FRAUD')
        self.assertEqual(res['action'], 'WARNING')
        self.assertFalse(res['should_block'])

    def test_score_35_is_no_fraud_verify(self):
        res = classify_binary(35)
        self.assertEqual(res['classification'], 'NO_FRAUD')
        self.assertEqual(res['action'], 'VERIFY')

    def test_score_10_is_no_fraud_allow(self):
        res = classify_binary(10)
        self.assertEqual(res['classification'], 'NO_FRAUD')
        self.assertEqual(res['action'], 'ALLOW')

    def test_fraud_indicators_in_message(self):
        res = classify_binary(75, ['name_mismatch_critical', 'unverified_reports'])
        self.assertIn('name_mismatch_critical', res['user_message'])


class TestNamePenalty(unittest.TestCase):
    """Test granular name-mismatch penalty tiers."""

    def test_critical_mismatch(self):
        """Similarity < 20% → +50 penalty."""
        res = calculate_name_penalty(0.15)
        self.assertEqual(res['penalty'], 50)
        self.assertEqual(res['indicator'], 'name_mismatch_critical')

    def test_high_mismatch(self):
        """Similarity 20-30% → +40 penalty."""
        res = calculate_name_penalty(0.25)
        self.assertEqual(res['penalty'], 40)
        self.assertEqual(res['indicator'], 'name_mismatch_high')

    def test_moderate_mismatch(self):
        """Similarity 30-50% → +25 penalty."""
        res = calculate_name_penalty(0.40)
        self.assertEqual(res['penalty'], 25)
        self.assertEqual(res['indicator'], 'name_mismatch_moderate')

    def test_minor_mismatch(self):
        """Similarity 50-70% → +10 penalty."""
        res = calculate_name_penalty(0.60)
        self.assertEqual(res['penalty'], 10)
        self.assertEqual(res['indicator'], 'name_mismatch_minor')

    def test_no_mismatch(self):
        """Similarity >= 70% → no penalty."""
        res = calculate_name_penalty(0.85)
        self.assertEqual(res['penalty'], 0)
        self.assertIsNone(res['indicator'])


class TestReportPenalty(unittest.TestCase):
    """Test community-report penalty tiers."""

    def test_5plus_confirmed_forces_fraud(self):
        res = calculate_report_penalty(5, 5)
        self.assertEqual(res['penalty'], 100)
        self.assertTrue(res['force_fraud'])

    def test_2_confirmed(self):
        res = calculate_report_penalty(2, 2)
        self.assertEqual(res['penalty'], 80)
        self.assertFalse(res['force_fraud'])

    def test_1_confirmed(self):
        res = calculate_report_penalty(1, 1)
        self.assertEqual(res['penalty'], 60)

    def test_1_unverified(self):
        res = calculate_report_penalty(1, 0)
        self.assertEqual(res['penalty'], 5)

    def test_no_reports(self):
        res = calculate_report_penalty(0, 0)
        self.assertEqual(res['penalty'], 0)
        self.assertFalse(res['force_fraud'])


class TestCircularBuffer(unittest.TestCase):
    """Test circular buffer insert/query functionality."""

    def test_insert_and_retrieve(self):
        from circular_buffer import insert_transaction, get_recent_transactions, init_live_db
        init_live_db()

        # Insert a test transaction
        result = insert_transaction({
            "transaction_id": f"TEST_CB_{os.getpid()}",
            "upi_id_sender": "test_sender@paytm",
            "upi_id_receiver": "test_receiver@ybl",
            "amount": 5000,
            "classification": "NO_FRAUD",
            "internal_risk_score": 25,
            "status": "ALLOWED",
        })
        self.assertIn("slot_id", result)
        self.assertGreater(result["total_processed"], 0)

        # Retrieve recent
        recent = get_recent_transactions(10)
        self.assertGreater(len(recent), 0)

    def test_buffer_status(self):
        from circular_buffer import get_buffer_status, init_live_db
        init_live_db()
        status = get_buffer_status()
        self.assertIn("current_slot", status)
        self.assertIn("total_processed", status)
        self.assertIn("max_buffer_size", status)
        self.assertEqual(status["max_buffer_size"], 50000)

    def test_filtered_query(self):
        from circular_buffer import insert_transaction, get_filtered_transactions, init_live_db
        init_live_db()

        # Insert a FRAUD transaction
        insert_transaction({
            "transaction_id": f"TEST_FRAUD_{os.getpid()}",
            "upi_id_sender": "fraud_sender@paytm",
            "upi_id_receiver": "fraud_receiver@ybl",
            "amount": 50000,
            "classification": "FRAUD",
            "internal_risk_score": 85,
            "status": "BLOCKED",
        })

        # Query filtered
        fraud = get_filtered_transactions(classification="FRAUD", limit=10)
        self.assertTrue(any(t.get("classification") == "FRAUD" for t in fraud))


class TestScanHistory(unittest.TestCase):
    """Test scan history recording and reduction calculations."""

    def test_record_scan(self):
        from scan_history import record_scan
        result = record_scan(f"test_scan_{os.getpid()}@paytm", "test_user", 25, "VIEWED")
        self.assertEqual(result["status"], "recorded")
        self.assertIn("scan_id", result)

    def test_scan_reduction_no_scans(self):
        """No scans should give zero reduction."""
        from scan_history import calculate_scan_reduction
        red = calculate_scan_reduction(f"nonexistent_{os.getpid()}_xyz@paytm")
        self.assertEqual(red, 0)

    def test_total_reduction_cap(self):
        """Total reductions should not exceed -25."""
        from scan_history import calculate_all_reductions
        result = calculate_all_reductions(
            upi_id_receiver="test@paytm",
            upi_id_sender="sender@ybl",
            amount=500,
            hour=12,
            sender_avg_amount=500,
            receiver_is_verified_merchant=True,
            current_score=40,
            has_any_fraud_reports=False,
            has_invalid_handle=False,
        )
        self.assertGreaterEqual(result["capped_total"], -25)

    def test_no_reductions_when_fraud_reported(self):
        """No reductions should apply when fraud reports exist."""
        from scan_history import calculate_all_reductions
        result = calculate_all_reductions(
            upi_id_receiver="test@paytm",
            amount=500,
            hour=12,
            sender_avg_amount=500,
            receiver_is_verified_merchant=True,
            current_score=40,
            has_any_fraud_reports=True,
            has_invalid_handle=False,
        )
        self.assertEqual(result["capped_total"], 0)
        self.assertEqual(result["reason"], "no_reductions_fraud_detected")

    def test_no_reductions_when_invalid_handle(self):
        """No reductions should apply when handle is invalid."""
        from scan_history import calculate_all_reductions
        result = calculate_all_reductions(
            upi_id_receiver="test@fakebank",
            amount=500,
            hour=12,
            sender_avg_amount=500,
            receiver_is_verified_merchant=False,
            current_score=40,
            has_any_fraud_reports=False,
            has_invalid_handle=True,
        )
        self.assertEqual(result["capped_total"], 0)
        self.assertEqual(result["reason"], "no_reductions_invalid_handle")


if __name__ == '__main__':
    unittest.main()
