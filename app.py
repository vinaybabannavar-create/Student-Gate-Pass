from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import sqlite3
import uuid
import datetime
import socket
import os
import ai_module
import qr_generator
import face_verify

app = Flask(__name__)
CORS(app)

# Detect local IP so QR codes route back to this machine on LAN
def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
    except:
        ip = '127.0.0.1'
    return ip

LOCAL_IP = get_local_ip()
PORT = int(os.environ.get('PORT', 5000))

# Deployment URLs
# If BASE_URL is set (on Render), use it. Otherwise fallback to local IP.
BASE_URL = os.environ.get('BASE_URL', f'http://{LOCAL_IP}:{PORT}')

def get_db_connection():
    conn = sqlite3.connect('database.db')
    conn.row_factory = sqlite3.Row
    return conn

# Auto-initialize database on startup
def init_db():
    conn = get_db_connection()
    conn.execute('''
    CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        usn TEXT NOT NULL,
        roll TEXT,
        branch TEXT,
        year_sem TEXT,
        college TEXT,
        reason TEXT NOT NULL,
        ai_priority TEXT,
        letter TEXT,
        status TEXT DEFAULT 'pending_teacher',
        teacher_status TEXT DEFAULT 'pending',
        hod_status TEXT DEFAULT 'pending',
        security_status TEXT DEFAULT 'pending',
        qr TEXT UNIQUE,
        security_key TEXT UNIQUE,
        out_time TEXT,
        expiry_time TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    
    # Migration: Ensure all columns exist for older databases
    columns_to_add = [
        ('teacher_status', "TEXT DEFAULT 'pending'"),
        ('hod_status', "TEXT DEFAULT 'pending'"),
        ('security_status', "TEXT DEFAULT 'pending'"),
        ('expiry_time', "TEXT")
    ]
    
    for col_name, col_def in columns_to_add:
        try:
            conn.execute(f"ALTER TABLE requests ADD COLUMN {col_name} {col_def}")
        except sqlite3.OperationalError:
            pass # already exists
        
    # Ensure defaults for old records
    try:
        conn.execute("UPDATE requests SET teacher_status = 'pending' WHERE teacher_status IS NULL")
        conn.execute("UPDATE requests SET hod_status = 'pending' WHERE hod_status IS NULL")
    except:
        pass

    conn.commit()
    conn.close()

init_db()

# --- ROUTES FOR HTML TEMPLATES ---

@app.route('/')
def index():
    return render_template('student.html')

@app.route('/student')
def student_dashboard():
    return render_template('student.html')

@app.route('/teacher')
def teacher_dashboard():
    return render_template('teacher.html')

@app.route('/hod')
def hod_dashboard():
    return render_template('hod.html')

@app.route('/security')
def security_dashboard():
    return render_template('security.html')


# --- REST APIS ---

# 1. Student Applies
@app.route('/apply', methods=['POST'])
def apply():
    data = request.json
    name = data.get('name')
    usn = data.get('usn')
    roll = data.get('roll')
    branch = data.get('branch')
    year_sem = data.get('year_sem')
    college = data.get('college')
    reason = data.get('reason')

    if not name or not reason:
        return jsonify({'error': 'Name and Reason are required'}), 400

    # AI Processing
    ai_priority = ai_module.analyze_reason(reason)
    letter = ai_module.generate_letter(name, usn, branch, year_sem, college, reason)

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO requests (name, branch, year_sem, usn, roll, college, reason, ai_priority, letter, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_teacher')
    ''', (name, branch, year_sem, usn, roll, college, reason, ai_priority, letter))
    request_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return jsonify({
        'id': request_id,
        'ai_priority': ai_priority,
        'letter': letter,
        'status': 'pending_teacher'
    }), 201

# 2. Teacher Endpoints
@app.route('/teacher/requests', methods=['GET'])
def teacher_requests():
    conn = get_db_connection()
    requests = conn.execute("SELECT * FROM requests WHERE status = 'pending_teacher'").fetchall()
    conn.close()
    return jsonify([dict(ix) for ix in requests])

@app.route('/teacher/approve/<int:req_id>', methods=['POST'])
def teacher_approve(req_id):
    conn = get_db_connection()
    conn.execute("UPDATE requests SET status = 'pending_hod', teacher_status = 'approved' WHERE id = ?", (req_id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Approved by teacher'})

@app.route('/teacher/reject/<int:req_id>', methods=['POST'])
def teacher_reject(req_id):
    conn = get_db_connection()
    conn.execute("UPDATE requests SET status = 'rejected', teacher_status = 'rejected' WHERE id = ?", (req_id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Rejected by teacher'})

# 3. HOD Endpoints
@app.route('/hod/requests', methods=['GET'])
def hod_requests():
    conn = get_db_connection()
    requests = conn.execute("SELECT * FROM requests WHERE status = 'pending_hod'").fetchall()
    conn.close()
    return jsonify([dict(ix) for ix in requests])

@app.route('/hod/approve/<int:req_id>', methods=['POST'])
def hod_approve(req_id):
    qr_id = str(uuid.uuid4())
    security_key = uuid.uuid4().hex[:6].upper()
    expiry_time = (datetime.datetime.now() + datetime.timedelta(hours=2)).strftime('%Y-%m-%d %H:%M:%S')

    # Use BASE_URL for the scannable QR code
    pass_url = f'{BASE_URL}/pass/{qr_id}'
    qr_image_b64 = qr_generator.generate_secure_qr(pass_url)

    conn = get_db_connection()
    conn.execute("""
        UPDATE requests 
        SET status = 'approved', hod_status = 'approved', qr = ?, security_key = ?, expiry_time = ? 
        WHERE id = ?
    """, (qr_id, security_key, expiry_time, req_id))
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Approved by HOD', 'qr_image': qr_image_b64, 'security_key': security_key})

@app.route('/hod/reject/<int:req_id>', methods=['POST'])
def hod_reject(req_id):
    conn = get_db_connection()
    conn.execute("UPDATE requests SET status = 'rejected', hod_status = 'rejected' WHERE id = ?", (req_id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Rejected by HOD'})

@app.route('/hod/history', methods=['GET'])
def hod_history():
    conn = get_db_connection()
    requests = conn.execute("SELECT * FROM requests WHERE status = 'used'").fetchall()
    conn.close()
    return jsonify([dict(ix) for ix in requests])

@app.route('/teacher/history', methods=['GET'])
def teacher_history():
    conn = get_db_connection()
    requests = conn.execute("SELECT * FROM requests WHERE teacher_status != 'pending'").fetchall()
    conn.close()
    return jsonify([dict(ix) for ix in requests])

@app.route('/stats', methods=['GET'])
def get_stats():
    conn = get_db_connection()
    stats = {
        'pending_teacher': conn.execute("SELECT COUNT(*) FROM requests WHERE status = 'pending_teacher'").fetchone()[0],
        'pending_hod': conn.execute("SELECT COUNT(*) FROM requests WHERE status = 'pending_hod'").fetchone()[0],
        'approved_today': conn.execute("SELECT COUNT(*) FROM requests WHERE status IN ('approved', 'used')").fetchone()[0],
        'rejected': conn.execute("SELECT COUNT(*) FROM requests WHERE status = 'rejected'").fetchone()[0]
    }
    conn.close()
    return jsonify(stats)

@app.route('/delete/<int:req_id>', methods=['DELETE'])
def delete_request(req_id):
    conn = get_db_connection()
    conn.execute("DELETE FROM requests WHERE id = ?", (req_id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Record deleted successfully'})

# 4. Security Endpoints

@app.route('/security/upcoming', methods=['GET'])
def security_upcoming():
    conn = get_db_connection()
    requests = conn.execute("SELECT * FROM requests WHERE status = 'approved'").fetchall()
    conn.close()
    return jsonify([dict(ix) for ix in requests])


@app.route('/verify/complete/<qr_id>', methods=['POST'])
def complete_exit_endpoint(qr_id):
    # Mark as used (support both QR UUID and Secret Key)
    conn = get_db_connection()
    conn.execute("UPDATE requests SET status = 'used' WHERE qr = ? OR security_key = ?", (qr_id, qr_id))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Exit Permitted. Pass marked as used.'})
        
# Student Polling Endpoint
@app.route('/student/status/<int:req_id>', methods=['GET'])
def student_status(req_id):
    conn = get_db_connection()
    req = conn.execute("SELECT status, qr FROM requests WHERE id = ?", (req_id,)).fetchone()
    conn.close()
    if req:
         req_dict = dict(req)
         if req_dict['status'] == 'approved' and req_dict['qr']:
              # Use consistent base URL
              pass_url = f'{BASE_URL}/pass/{req_dict["qr"]}'
              req_dict['qr_image'] = qr_generator.generate_secure_qr(pass_url)
         return jsonify(req_dict)
    return jsonify({'error': 'Not found'}), 404

# Public Pass Details Page — scannable by ANY phone
@app.route('/pass/<qr_id>')
def pass_details_page(qr_id):
    conn = get_db_connection()
    req = conn.execute("SELECT * FROM requests WHERE qr = ?", (qr_id,)).fetchone()
    conn.close()
    if not req:
        return render_template('pass_invalid.html'), 404
    return render_template('pass_details.html', req=dict(req))

# Security lookup by qr_id UUID (extracted from scanned URL)
@app.route('/verify/<qr_id>', methods=['GET'])
def verify_qr(qr_id):
    # Strip URL prefix if scanner captured the full URL
    if '/' in qr_id:
        qr_id = qr_id.split('/')[-1]
    conn = get_db_connection()
    # Search by QR (UUID) OR Security Key (Secret Key)
    req = conn.execute("SELECT * FROM requests WHERE qr = ? OR security_key = ?", (qr_id, qr_id)).fetchone()
    conn.close()

    if not req:
        return jsonify({'error': 'Invalid QR Code'}), 404

    req_dict = dict(req)

    expiry_str = req_dict['expiry_time']
    if expiry_str:
        try:
            expiry_date = datetime.datetime.strptime(expiry_str, '%Y-%m-%d %H:%M:%S.%f')
        except ValueError:
            expiry_date = datetime.datetime.strptime(expiry_str, '%Y-%m-%d %H:%M:%S')
        if datetime.datetime.now() > expiry_date:
            return jsonify({'error': 'QR Code Expired', 'request': req_dict}), 400

    if req_dict['status'] == 'used':
        return jsonify({'error': 'QR Code already used', 'request': req_dict}), 400

    return jsonify({'message': 'QR Valid', 'request': req_dict})

@app.route('/links')
def links_portal():
    return render_template('links.html', base_url=BASE_URL)

if __name__ == '__main__':
    print(f'\nLAN URL: http://{LOCAL_IP}:{PORT} - use this IP for QR scanning on phones\n')
    app.run(debug=True, host='0.0.0.0', port=PORT)
