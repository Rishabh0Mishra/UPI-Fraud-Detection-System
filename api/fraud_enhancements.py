import os
import re
import csv
import json
import sqlite3
import logging
from pathlib import Path
from datetime import datetime
from difflib import SequenceMatcher
from pydantic import BaseModel
from typing import Optional, Set

logger = logging.getLogger("upi_fraud_api")

# ────────────────────────────────────────────────────────────────────
# SETUP & INIT
# ────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "upi_reports.db"

def init_db():
    """Initialise SQLite database with fraud_reports + fraud_report_summary tables."""
    os.makedirs(DB_PATH.parent, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # ── Legacy table (keep for backwards compat) ──
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS upi_id_reports (
            report_id INTEGER PRIMARY KEY AUTOINCREMENT,
            upi_id VARCHAR(255) NOT NULL,
            upi_handle VARCHAR(100),
            payee_name VARCHAR(255),
            reporter_user_id VARCHAR(255),
            report_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            report_reason VARCHAR(500),
            fraud_occurred BOOLEAN DEFAULT 0,
            amount_lost DECIMAL(15,2) DEFAULT 0,
            additional_notes TEXT,
            transaction_id VARCHAR(255),
            report_status VARCHAR(50) DEFAULT 'PENDING',
            admin_notes TEXT
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_upi_id ON upi_id_reports(upi_id)")

    # ── NEW: Comprehensive fraud_reports table ──
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fraud_reports (
            report_id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_type VARCHAR(50) NOT NULL DEFAULT 'UPI_ID',
            fraud_identifier VARCHAR(500) NOT NULL,
            upi_id_extracted VARCHAR(255),
            reporter_user_id VARCHAR(255),
            report_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            report_reason VARCHAR(500),
            fraud_confirmed BOOLEAN DEFAULT 0,
            amount_lost DECIMAL(15,2) DEFAULT 0,
            additional_notes TEXT,
            status VARCHAR(50) DEFAULT 'PENDING',
            verification_timestamp TIMESTAMP,
            verified_by VARCHAR(255)
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_fraud_identifier ON fraud_reports(fraud_identifier)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_fraud_report_type ON fraud_reports(report_type)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_fraud_report_ts ON fraud_reports(report_timestamp DESC)")

    # ── NEW: Aggregated summary table for fast lookups ──
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fraud_report_summary (
            fraud_identifier VARCHAR(500) PRIMARY KEY,
            report_count INTEGER DEFAULT 0,
            first_reported TIMESTAMP,
            last_reported TIMESTAMP,
            confirmed_fraud_count INTEGER DEFAULT 0,
            total_amount_lost DECIMAL(15,2) DEFAULT 0,
            status VARCHAR(50) DEFAULT 'ACTIVE'
        )
    """)

    conn.commit()
    conn.close()

# Initialise DB on load
init_db()

# ────────────────────────────────────────────────────────────────────
# ENHANCEMENT 1: STRICT UPI FORMAT VALIDATION
# ────────────────────────────────────────────────────────────────────

def validate_upi_format(upi_id: str) -> dict:
    """
    STEP 1: Strict UPI ID format validation.
    Must run BEFORE handle or report checks.
    
    Valid format: [username]@[handle]
    - Exactly one @ symbol
    - Username: ≥3 chars, alphanumeric + . _ -, cannot start/end with special chars
    - Handle: ≥2 chars, alphanumeric only
    - No leading/trailing spaces
    """
    result = {
        'is_valid': False,
        'username': None,
        'handle': None,
        'error_type': None,
        'error_message': None
    }

    if not upi_id or not isinstance(upi_id, str):
        result['error_type'] = 'EMPTY_INPUT'
        result['error_message'] = '❌ Invalid UPI ID Format\n\nNo UPI ID provided. Please enter a valid UPI ID.'
        return result

    # Check for leading/trailing spaces
    if upi_id != upi_id.strip():
        result['error_type'] = 'WHITESPACE'
        result['error_message'] = (
            f'❌ Invalid UPI ID Format\n\n'
            f'The UPI ID "{upi_id}" contains leading or trailing spaces.\n\n'
            f'Valid format: username@handle\n'
            f'Example: merchant@paytm'
        )
        return result

    # Check for spaces in middle
    if ' ' in upi_id:
        result['error_type'] = 'SPACE_IN_MIDDLE'
        result['error_message'] = (
            f'❌ Invalid UPI ID Format\n\n'
            f'The UPI ID "{upi_id}" contains spaces.\n\n'
            f'Valid format: username@handle\n'
            f'Example: merchant@paytm'
        )
        return result

    # Count @ symbols
    at_count = upi_id.count('@')
    if at_count == 0:
        result['error_type'] = 'NO_AT_SYMBOL'
        result['error_message'] = (
            f'❌ Invalid UPI ID Format\n\n'
            f'The UPI ID "{upi_id}" is missing the @ symbol.\n\n'
            f'Valid format: username@handle\n'
            f'Example: merchant@paytm'
        )
        return result

    if at_count > 1:
        result['error_type'] = 'MULTIPLE_AT_SYMBOLS'
        result['error_message'] = (
            f'❌ Invalid UPI ID Format\n\n'
            f'The UPI ID "{upi_id}" contains multiple @ symbols.\n\n'
            f'Valid format: username@handle\n'
            f'Example: merchant@paytm\n\n'
            f'This appears to be a fraudulent or malformed UPI ID.'
        )
        return result

    # Split into username and handle
    parts = upi_id.split('@')
    username = parts[0]
    handle = parts[1]

    # Check missing username
    if not username:
        result['error_type'] = 'MISSING_USERNAME'
        result['error_message'] = (
            f'❌ Invalid UPI ID Format\n\n'
            f'The UPI ID "{upi_id}" is missing the username.\n\n'
            f'Valid format: username@handle\n'
            f'Your input only has: @{handle}\n\n'
            f'Please verify the correct UPI ID.'
        )
        return result

    # Check missing handle
    if not handle:
        result['error_type'] = 'MISSING_HANDLE'
        result['error_message'] = (
            f'❌ Invalid UPI ID Format\n\n'
            f'The UPI ID "{upi_id}" is missing the handle.\n\n'
            f'Valid format: username@handle\n'
            f'Your input only has: {username}@\n\n'
            f'Please verify the correct UPI ID.'
        )
        return result

    # Validate username: at least 3 chars
    if len(username) < 3:
        result['error_type'] = 'USERNAME_TOO_SHORT'
        result['error_message'] = (
            f'❌ Invalid UPI ID Format\n\n'
            f'Username must be at least 3 characters long.\n\n'
            f'Your input: "{username}" (only {len(username)} characters)\n\n'
            f'Please verify the correct UPI ID.'
        )
        return result

    # Validate username: allowed chars (letters, digits, dots, underscores, hyphens)
    if not re.match(r'^[a-zA-Z0-9._\-]+$', username):
        result['error_type'] = 'INVALID_USERNAME_CHARS'
        result['error_message'] = (
            f'❌ Invalid UPI ID Format\n\n'
            f'Username "{username}" contains invalid characters.\n\n'
            f'Allowed: letters, numbers, dots (.), underscores (_), hyphens (-)\n\n'
            f'Please verify the correct UPI ID.'
        )
        return result

    # Validate username: cannot start or end with special chars
    if username[0] in '._-' or username[-1] in '._-':
        result['error_type'] = 'USERNAME_SPECIAL_BOUNDARY'
        result['error_message'] = (
            f'❌ Invalid UPI ID Format\n\n'
            f'Username "{username}" cannot start or end with special characters (., _, -).\n\n'
            f'Please verify the correct UPI ID.'
        )
        return result

    # Validate handle: at least 2 chars
    if len(handle) < 2:
        result['error_type'] = 'HANDLE_TOO_SHORT'
        result['error_message'] = (
            f'❌ Invalid UPI ID Format\n\n'
            f'Handle must be at least 2 characters long.\n\n'
            f'Your input: "@{handle}" (only {len(handle)} character)\n\n'
            f'Please verify the correct UPI ID.'
        )
        return result

    # Validate handle: alphanumeric only
    if not re.match(r'^[a-zA-Z0-9]+$', handle):
        result['error_type'] = 'INVALID_HANDLE_CHARS'
        result['error_message'] = (
            f'❌ Invalid UPI ID Format\n\n'
            f'Handle "@{handle}" contains invalid characters.\n\n'
            f'Handle must be alphanumeric only.\n\n'
            f'Please verify the correct UPI ID.'
        )
        return result

    # All checks passed
    result['is_valid'] = True
    result['username'] = username
    result['handle'] = handle.lower()
    return result


# ────────────────────────────────────────────────────────────────────
# ENHANCEMENT 1b: UPI HANDLE VERIFICATION
# ────────────────────────────────────────────────────────────────────

def load_approved_handles(folder_path=None) -> Set[str]:
    """
    Load all approved UPI handles from files in the upi_handles folder.
    Returns: set of approved handles (lowercase, without @)
    """
    if folder_path is None:
        folder_path = BASE_DIR / "upi_handles"
    
    handles = set()
    folder = Path(folder_path)
    
    if not folder.exists():
        return handles

    for file_path in folder.iterdir():
        if not file_path.is_file():
            continue
            
        try:
            if file_path.suffix == '.csv':
                with open(file_path, 'r', encoding='utf-8') as f:
                    reader = csv.reader(f)
                    for row in reader:
                        if not row: continue
                        h = row[0].strip().lower()
                        if h == 'upi_handle': continue
                        if h.startswith('@'):
                            h = h[1:]
                        if h: handles.add(h)
                        
            elif file_path.suffix == '.txt':
                with open(file_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        h = line.strip().lower()
                        if h.startswith('@'):
                            h = h[1:]
                        if h: handles.add(h)
                        
            elif file_path.suffix == '.json':
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        for h in data:
                            h = str(h).strip().lower()
                            if h.startswith('@'): h = h[1:]
                            if h: handles.add(h)
        except Exception as e:
            print(f"Error loading {file_path}: {e}")
            
    return handles

def extract_upi_handle(upi_id: str) -> tuple:
    """
    Extract username and handle from UPI ID.
    Returns (username, handle) or (None, None) if malformed.
    """
    if not upi_id or type(upi_id) != str:
        return (None, None)
        
    parts = upi_id.strip().lower().split('@')
    if len(parts) == 2 and parts[0] and parts[1]:
        return (parts[0], parts[1])
    return (None, None)

def check_upi_handle_validity(upi_id: str, approved_handles: set) -> dict:
    """
    Full 3-step UPI validation: format → handle → reports.
    Returns validation result with specific error messages.
    """
    # STEP 1: Format validation (MUST run first)
    format_result = validate_upi_format(upi_id)
    if not format_result['is_valid']:
        return {
            'is_valid_handle': False,
            'handle': None,
            'username': None,
            'risk_level': 'CRITICAL',
            'validation_step': 'FORMAT',
            'error_type': format_result['error_type'],
            'message': format_result['error_message']
        }

    username = format_result['username']
    handle = format_result['handle']
    
    # STEP 2: Handle validation
    if not approved_handles:
        # If handles couldn't be loaded, we can't accurately block, default to valid
        return {
            'is_valid_handle': True,
            'handle': handle,
            'username': username,
            'validation_step': 'HANDLE',
            'message': 'Handle list not available — cannot verify.'
        }
        
    if handle not in approved_handles:
        msg = (
            "🚨 FRAUDULENT UPI ID DETECTED!\n\n"
            f"The UPI handle \"@{handle}\" is NOT recognized by NPCI.\n\n"
            "✓ Valid UPI handles include: @paytm, @phonepe, @googlepay, @okaxis, @ybl\n"
            f"✗ Detected handle: @{handle}\n\n"
            "⚠️ This is a CONFIRMED SCAM.\n"
            "DO NOT PROCEED WITH THIS PAYMENT!"
        )
        return {
            'is_valid_handle': False,
            'handle': handle,
            'username': username,
            'risk_level': 'CRITICAL',
            'validation_step': 'HANDLE',
            'error_type': 'INVALID_HANDLE',
            'message': msg
        }
        
    return {
        'is_valid_handle': True,
        'handle': handle,
        'username': username,
        'risk_level': 'MINIMAL',
        'validation_step': 'HANDLE',
        'message': 'Valid handle.'
    }

# ────────────────────────────────────────────────────────────────────
# ENHANCEMENT 2: PAYEE NAME vs UPI ID SIMILARITY
# ────────────────────────────────────────────────────────────────────

def calculate_name_similarity(payee_name: str, upi_username: str) -> float:
    """Calculate string similarity, treating containment as highly similar."""
    if not payee_name or not upi_username:
        return 0.0
        
    def clean(s):
        s = s.lower()
        s = re.sub(r'[^a-z0-9\s]', '', s)
        common_words = ['ltd', 'pvt', 'limited', 'private', 'store', 'shop', 'mart', 'enterprises', 'agency']
        words = s.split()
        return ' '.join([w for w in words if w not in common_words])
        
    clean_payee = clean(payee_name)
    clean_upi = clean(upi_username)
    
    if not clean_payee or not clean_upi:
        return 0.0
        
    if clean_payee in clean_upi or clean_upi in clean_payee:
        return 0.85
        
    return SequenceMatcher(None, clean_payee, clean_upi).ratio()

def check_name_upi_mismatch(payee_name: str, upi_id: str, similarity_threshold: float = 0.3) -> dict:
    username, handle = extract_upi_handle(upi_id)
    if not username:
        return {'is_suspicious': False, 'similarity_score': 0.0}

    if username.isdigit():
        return {
            'is_suspicious': False,
            'similarity_score': 1.0,
            'payee_name': payee_name,
            'upi_username': username,
            'warning_message': 'Numeric UPI ID - similarity check skipped.'
        }
        
    sim_score = calculate_name_similarity(payee_name, username)
    is_suspicious = sim_score < similarity_threshold
    
    risk_level = 'LOW'
    msg = ""
    
    if sim_score < 0.3:
        risk_level = 'CRITICAL'
        msg = (
            "⚠️ NAME MISMATCH DETECTED!\n\n"
            f"Payee Name: \"{payee_name}\"\n"
            f"UPI ID: {upi_id}\n\n"
            "These DO NOT match!\n\n"
            f"Similarity Score: {int(sim_score*100)}% (Very Low)\n\n"
            "🚨 WARNING: Scammers use fake names to trick users.\n"
            "✓ Legitimate merchants have matching names\n"
            "✗ This payee name and UPI ID don't match\n\n"
            "VERIFY THE RECEIVER CAREFULLY BEFORE SENDING MONEY!"
        )
    elif sim_score < 0.7:
        risk_level = 'MEDIUM'
        msg = (
            "ℹ️ VERIFICATION RECOMMENDED\n\n"
            f"Payee Name: \"{payee_name}\"\n"
            f"UPI ID: {upi_id}\n\n"
            f"Similarity: {int(sim_score*100)}% (Moderate)\n\n"
            "The payee name partially matches the UPI ID, but please verify:\n"
            "- Is this the correct merchant?\n"
            "- Did you initiate this transaction?\n\n"
            "Proceed with caution."
        )
        
    return {
        'is_suspicious': is_suspicious,
        'similarity_score': round(sim_score, 2),
        'payee_name': payee_name,
        'upi_username': username,
        'risk_level': risk_level,
        'warning_message': msg
    }

# ────────────────────────────────────────────────────────────────────
# ENHANCEMENT 3: COMPREHENSIVE FRAUD REPORT DATABASE
# ────────────────────────────────────────────────────────────────────

def submit_fraud_report(
    fraud_identifier: str,
    report_type: str = 'UPI_ID',
    reporter_user_id: str = 'anonymous',
    report_reason: str = 'Suspicious',
    fraud_confirmed: bool = False,
    amount_lost: float = 0,
    additional_notes: str = None,
    upi_id_extracted: str = None
) -> dict:
    """
    Insert a fraud report and update the summary table.
    report_type: 'UPI_ID', 'QR_CODE', 'URL', 'PHONE_NUMBER'
    """
    identifier = fraud_identifier.lower().strip()
    if not identifier:
        return {'status': 'error', 'message': 'No identifier provided'}

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # Insert into fraud_reports
        cursor.execute("""
            INSERT INTO fraud_reports 
            (report_type, fraud_identifier, upi_id_extracted, reporter_user_id,
             report_reason, fraud_confirmed, amount_lost, additional_notes, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
        """, (report_type, identifier, (upi_id_extracted or '').lower().strip() or None,
              reporter_user_id, report_reason, int(fraud_confirmed),
              amount_lost, additional_notes))

        report_id = cursor.lastrowid
        now = datetime.now(tz=__import__('datetime').timezone.utc).isoformat()

        # Upsert into fraud_report_summary
        cursor.execute("SELECT report_count FROM fraud_report_summary WHERE fraud_identifier = ?", (identifier,))
        existing = cursor.fetchone()

        if existing:
            cursor.execute("""
                UPDATE fraud_report_summary SET
                    report_count = report_count + 1,
                    last_reported = ?,
                    confirmed_fraud_count = confirmed_fraud_count + ?,
                    total_amount_lost = total_amount_lost + ?
                WHERE fraud_identifier = ?
            """, (now, int(fraud_confirmed), amount_lost, identifier))
        else:
            cursor.execute("""
                INSERT INTO fraud_report_summary
                (fraud_identifier, report_count, first_reported, last_reported,
                 confirmed_fraud_count, total_amount_lost, status)
                VALUES (?, 1, ?, ?, ?, ?, 'ACTIVE')
            """, (identifier, now, now, int(fraud_confirmed), amount_lost))

        # Also insert into legacy table for backward compatibility
        username, handle = extract_upi_handle(fraud_identifier)
        cursor.execute("""
            INSERT INTO upi_id_reports 
            (upi_id, upi_handle, reporter_user_id, report_reason,
             fraud_occurred, amount_lost, additional_notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (identifier, handle, reporter_user_id, report_reason,
              int(fraud_confirmed), amount_lost, additional_notes))

        conn.commit()

        return {
            'report_id': str(report_id),
            'status': 'submitted',
            'message': 'Thank you for reporting. This helps protect others.',
            'fraud_identifier': identifier,
            'report_type': report_type
        }

    except Exception as e:
        conn.rollback()
        logger.error(f"Error submitting fraud report: {e}")
        return {'status': 'error', 'message': f'Failed to submit report: {str(e)}'}
    finally:
        conn.close()


def check_fraud_reports(identifier: str) -> dict:
    """
    STEP 3: Check if an identifier has been reported as fraud.
    Returns report stats and tiered risk score adjustment.
    """
    norm = identifier.lower().strip()
    if not norm:
        return {
            'found': False,
            'report_count': 0,
            'risk_adjustment': 0,
            'warning_message': ''
        }

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT report_count, first_reported, last_reported,
                   confirmed_fraud_count, total_amount_lost, status
            FROM fraud_report_summary
            WHERE fraud_identifier = ?
        """, (norm,))
        row = cursor.fetchone()

        if not row:
            return {
                'found': False,
                'report_count': 0,
                'confirmed_fraud_count': 0,
                'total_amount_lost': 0.0,
                'risk_adjustment': 0,
                'warning_message': ''
            }

        report_count = row[0]
        first_reported = row[1]
        last_reported = row[2]
        confirmed_fraud_count = row[3]
        total_amount_lost = float(row[4] or 0)
        status = row[5]

        # Tiered risk adjustment
        if confirmed_fraud_count > 0:
            risk_adj = 90
        elif report_count >= 11:
            risk_adj = 80
        elif report_count >= 6:
            risk_adj = 60
        elif report_count >= 3:
            risk_adj = 40
        elif report_count >= 1:
            risk_adj = 20
        else:
            risk_adj = 0

        warning = (
            f"⚠️ FRAUD ALERT — Previously Reported\n\n"
            f"This identifier has been reported {report_count} time(s) as fraudulent.\n\n"
            f"First reported: {first_reported or 'Unknown'}\n"
            f"Last reported: {last_reported or 'Unknown'}\n"
            f"Confirmed fraud cases: {confirmed_fraud_count}\n"
            f"Total money lost: ₹{total_amount_lost:,.2f}\n\n"
            f"⚠️ Proceed with extreme caution or cancel this transaction."
        )

        return {
            'found': True,
            'report_count': report_count,
            'first_reported': first_reported,
            'last_reported': last_reported,
            'confirmed_fraud_count': confirmed_fraud_count,
            'total_amount_lost': total_amount_lost,
            'status': status,
            'risk_adjustment': risk_adj,
            'warning_message': warning
        }

    finally:
        conn.close()


# Legacy wrapper — used by existing code
def report_upi_id(
    upi_id: str,
    reporter_user_id: str,
    report_reason: str,
    fraud_occurred: bool = False,
    amount_lost: float = 0,
    additional_notes: str = None,
    transaction_id: str = None
) -> dict:
    """Legacy wrapper — delegates to submit_fraud_report."""
    return submit_fraud_report(
        fraud_identifier=upi_id,
        report_type='UPI_ID',
        reporter_user_id=reporter_user_id,
        report_reason=report_reason,
        fraud_confirmed=fraud_occurred,
        amount_lost=amount_lost,
        additional_notes=additional_notes
    )


def check_report_threshold(upi_id: str) -> dict:
    """Legacy wrapper — delegates to check_fraud_reports and returns old-style dict."""
    res = check_fraud_reports(upi_id)

    is_flagged = False
    msg = ""

    report_count = res.get('report_count', 0)
    confirmed = res.get('confirmed_fraud_count', 0)
    total_lost = res.get('total_amount_lost', 0.0)

    if confirmed >= 2:
        is_flagged = True
        msg = f"⛔ This UPI ID has been confirmed as FRAUDULENT in {confirmed} reports."
    elif report_count >= 3:
        is_flagged = True
        msg = f"⚠️ HIGH RISK: This ID has been reported {report_count} times."
    elif report_count >= 5:
        is_flagged = True
        msg = f"⚠️ HIGH RISK: This ID has a history of suspicious reports ({report_count} total)."

    return {
        'is_flagged': is_flagged,
        'report_count': report_count,
        'confirmed_fraud_count': confirmed,
        'total_amount_lost': total_lost,
        'recent_reports_7d': 0,
        'warning_message': msg,
        'risk_adjustment': res.get('risk_adjustment', 0)
    }

# ────────────────────────────────────────────────────────────────────
# ENHANCEMENT 4: REVISED RISK SCORING (NO SAFE)
# ────────────────────────────────────────────────────────────────────

def get_risk_level_updated(risk_score: float) -> dict:
    if risk_score <= 25:
        return {
            'level': 'MINIMAL RISK',
            'score': risk_score,
            'color': '#4CAF50',
            'icon': 'ℹ️',
            'user_message': (
                f"Risk Score: {risk_score}/100 - MINIMAL RISK\n\n"
                f"This transaction shows minimal fraud indicators.\n"
                f"However, ALWAYS verify:\n"
                f"• Is the payee name correct?\n"
                f"• Did you initiate this transaction?\n"
                f"• Is the amount accurate?\n\n"
                f"When in doubt, cancel and verify."
            ),
            'should_block': False
        }
    
    elif risk_score <= 40:
        return {
            'level': 'LOW RISK',
            'score': risk_score,
            'color': '#2196F3',
            'icon': 'ℹ️',
            'user_message': (
                f"Risk Score: {risk_score}/100 - LOW RISK\n\n"
                f"Some minor concerns detected:\n"
                f"• Verify the payee details carefully\n"
                f"• Ensure this is a legitimate transaction\n"
                f"• Double-check the amount\n\n"
                f"Proceed only if you're certain."
            ),
            'should_block': False
        }
    
    elif risk_score <= 60:
        return {
            'level': 'MEDIUM RISK',
            'score': risk_score,
            'color': '#FF9800',
            'icon': '⚠️',
            'user_message': (
                f"⚠️ Risk Score: {risk_score}/100 - MEDIUM RISK\n\n"
                f"Multiple warning signs detected!\n\n"
                f"Common scam patterns identified:\n"
                f"• Name mismatch between payee and UPI ID\n"
                f"• Unusual transaction characteristics\n"
                f"• Limited merchant history\n\n"
                f"⚠️ PROCEED WITH EXTREME CAUTION\n"
                f"Verify receiver identity before paying."
            ),
            'should_block': False
        }
    
    elif risk_score <= 80:
        return {
            'level': 'HIGH RISK',
            'score': risk_score,
            'color': '#FF5722',
            'icon': '🚨',
            'user_message': (
                f"🚨 Risk Score: {risk_score}/100 - HIGH RISK\n\n"
                f"STRONG FRAUD INDICATORS DETECTED!\n\n"
                f"This transaction shows multiple signs of fraud:\n"
                f"• Suspicious payee/UPI mismatch\n"
                f"• Known scam patterns\n"
                f"• Flagged by other users\n\n"
                f"⛔ WE STRONGLY RECOMMEND NOT PROCEEDING\n\n"
                f"If you choose to continue, you do so at YOUR OWN RISK."
            ),
            'should_block': False
        }
    
    else:  # 81-100
        return {
            'level': 'CRITICAL RISK',
            'score': risk_score,
            'color': '#D32F2F',
            'icon': '🛑',
            'user_message': (
                f"🛑 Risk Score: {risk_score}/100 - CRITICAL RISK\n\n"
                f"CONFIRMED FRAUD DETECTED!\n\n"
                f"This payment has been BLOCKED for your safety.\n\n"
                f"Reasons:\n"
                f"• Invalid/unrecognized UPI handle\n"
                f"• Blacklisted UPI ID\n"
                f"• Multiple fraud reports\n"
                f"• Confirmed scam patterns\n\n"
                f"❌ PAYMENT BLOCKED\n\n"
                f"Report this UPI ID to help protect others."
            ),
            'should_block': True
        }


# ────────────────────────────────────────────────────────────────────
# ENHANCED PENALTY CALCULATIONS (Granular Tiers)
# ────────────────────────────────────────────────────────────────────

BINARY_THRESHOLD = 50  # Score >= 50 = FRAUD, < 50 = NO FRAUD


def calculate_name_penalty(similarity_score: float) -> dict:
    """
    Granular name-mismatch penalty based on similarity score.

    Returns dict with penalty points and indicator label.
    """
    if similarity_score < 0.20:
        return {"penalty": 50, "indicator": "name_mismatch_critical"}
    elif similarity_score < 0.30:
        return {"penalty": 40, "indicator": "name_mismatch_high"}
    elif similarity_score < 0.50:
        return {"penalty": 25, "indicator": "name_mismatch_moderate"}
    elif similarity_score < 0.70:
        return {"penalty": 10, "indicator": "name_mismatch_minor"}
    else:
        return {"penalty": 0, "indicator": None}


def calculate_report_penalty(report_count: int, confirmed_count: int) -> dict:
    """
    Community-report penalty based on report volume and confirmations.

    5+ verified → force score to 100 (instant FRAUD).
    Returns dict with penalty points, indicator, and force_fraud flag.
    """
    if confirmed_count >= 5:
        return {"penalty": 100, "indicator": "confirmed_fraud_5plus", "force_fraud": True}
    if confirmed_count >= 2:
        return {"penalty": 80, "indicator": "confirmed_fraud_multiple", "force_fraud": False}
    if confirmed_count >= 1:
        return {"penalty": 60, "indicator": "confirmed_fraud_single", "force_fraud": False}
    if report_count >= 6:
        return {"penalty": 30, "indicator": "unverified_reports_many", "force_fraud": False}
    if report_count >= 4:
        return {"penalty": 30, "indicator": "unverified_reports_several", "force_fraud": False}
    if report_count >= 2:
        return {"penalty": 15, "indicator": "unverified_reports_few", "force_fraud": False}
    if report_count >= 1:
        return {"penalty": 5, "indicator": "unverified_report_single", "force_fraud": False}
    return {"penalty": 0, "indicator": None, "force_fraud": False}


# ────────────────────────────────────────────────────────────────────
# BINARY CLASSIFICATION (User-Facing)
# ────────────────────────────────────────────────────────────────────

def classify_binary(final_score: float, fraud_indicators: list = None) -> dict:
    """
    Convert a 0-100 risk score into a binary FRAUD/NO_FRAUD classification.

    Threshold: 50
      - Score >= 50 → FRAUD
      - Score <  50 → NO FRAUD

    Sub-actions based on score bands:
      FRAUD:
        >= 80: BLOCKED (payment cannot proceed)
        65-79: STRONG_WARNING (can proceed at own risk)
        50-64: WARNING (show concerns, allow if verified)
      NO FRAUD:
        30-49: VERIFY (show verification checklist)
         0-29: ALLOW (minimal verification)

    Returns:
        dict with classification, action, status, user_message, color, icon.
    """
    indicators = fraud_indicators or []

    if final_score >= BINARY_THRESHOLD:
        # ── FRAUD ──
        if final_score >= 80:
            action = "BLOCKED"
            status = "BLOCKED"
            icon = "🛑"
            message = (
                "🛑 FRAUD DETECTED\n\n"
                "This transaction has been flagged as fraudulent.\n\n"
                "⛔ PAYMENT BLOCKED FOR YOUR SAFETY\n\n"
                "What you should do:\n"
                "✓ Do NOT proceed with this payment\n"
                "✓ Report this to authorities if you lost money\n"
                "✓ Block this contact if received via message\n\n"
                "Report to Cyber Crime — Call 1930"
            )
        elif final_score >= 65:
            action = "STRONG_WARNING"
            status = "BLOCKED"
            icon = "⛔"
            message = (
                "⛔ FRAUD DETECTED\n\n"
                "High fraud risk detected — NOT recommended to proceed.\n\n"
                "🚨 WARNING SIGNS DETECTED:\n"
                + ("".join(f"• {ind}\n" for ind in indicators[:5]) if indicators else "• Suspicious transaction patterns\n")
                + "\n⚠️ WE STRONGLY RECOMMEND NOT PROCEEDING\n"
                "If you choose to continue, you do so at YOUR OWN RISK."
            )
        else:  # 50-64
            action = "WARNING"
            status = "WARNING"
            icon = "⚠️"
            message = (
                "⚠️ FRAUD DETECTED\n\n"
                "Fraud indicators detected — verify carefully.\n\n"
                + ("".join(f"• {ind}\n" for ind in indicators[:5]) if indicators else "• Some warning signs detected\n")
                + "\n⚠️ PROCEED ONLY IF YOU TRUST THIS RECIPIENT"
            )

        return {
            "classification": "FRAUD",
            "action": action,
            "status": status,
            "icon": icon,
            "color": "#FF3B5C",
            "user_message": message,
            "should_block": final_score >= 65,
            "score": final_score,
        }

    else:
        # ── NO FRAUD ──
        if final_score >= 30:
            action = "VERIFY"
            icon = "⚠️"
            message = (
                "✅ NO FRAUD DETECTED (Verify Carefully)\n\n"
                "This transaction shows some warning signs.\n\n"
                "✓ VERIFICATION CHECKLIST:\n"
                "□ I recognize this payee/merchant\n"
                "□ The payee name matches the business\n"
                "□ I initiated this transaction\n"
                "□ The amount is correct\n\n"
                "⚠️ PROCEED ONLY IF YOU TRUST THIS RECIPIENT"
            )
        else:  # 0-29
            action = "ALLOW"
            icon = "✅"
            message = (
                "✅ NO FRAUD DETECTED\n\n"
                "This transaction appears legitimate.\n\n"
                "✓ VERIFICATION CHECKLIST:\n"
                "Before proceeding, confirm:\n"
                "□ I recognize this payee/merchant\n"
                "□ The payee name matches the business\n"
                "□ I initiated this transaction\n"
                "□ The amount is correct\n\n"
                "⚠️ Always verify details before making payment"
            )

        return {
            "classification": "NO_FRAUD",
            "action": action,
            "status": "ALLOWED",
            "icon": icon,
            "color": "#00E5A0",
            "user_message": message,
            "should_block": False,
            "score": final_score,
        }
