import sqlite3

def init_db():
    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        branch TEXT,
        year_sem TEXT,
        usn TEXT,
        roll TEXT,
        college TEXT,
        reason TEXT NOT NULL,
        ai_priority TEXT,
        letter TEXT,
        status TEXT DEFAULT 'pending_teacher',
        qr TEXT,
        security_key TEXT,
        expiry_time DATETIME
    )
    ''')
    
    conn.commit()
    conn.close()
    print("Database initialized successfully.")

if __name__ == '__main__':
    init_db()
