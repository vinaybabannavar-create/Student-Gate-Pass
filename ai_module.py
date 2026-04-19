import datetime

def analyze_reason(reason):
    reason_lower = reason.lower()
    high_priority_keywords = ['emergency', 'hospital', 'fever', 'accident', 'urgent', 'death', 'sick']
    medium_priority_keywords = ['doctor', 'wedding', 'family', 'function', 'function', 'appointment', 'ill']
    
    if any(keyword in reason_lower for keyword in high_priority_keywords):
        return 'High'
    elif any(keyword in reason_lower for keyword in medium_priority_keywords):
        return 'Medium'
    else:
        return 'Low'

def generate_letter(name, usn, branch, year_sem, college, reason):
    date = datetime.date.today().strftime('%B %d, %Y')
    letter = f"""Date: {date}

From,
{name}
USN: {usn}
{branch}, {year_sem}
{college}

To,
The Head of Department,
{branch} Department,
{college}

Subject: Application for Leave / Gate Pass

Respected Sir/Madam,

I am writing to formally request a gate pass to leave the college premises today. The reason for my early departure is: {reason}.

I assure you that I have completed my essential academic responsibilities for the day. I request you to kindly grant me permission to leave the campus.

Thanking you,

Yours sincerely,
{name}"""
    return letter
