import smtplib
import ssl
import os
from email.message import EmailMessage

def load_env():
    """Simple helper to load .env variables into os.environ (No external lib needed)."""
    # Look for .env in the script's directory or the parent directory (project root)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    search_paths = [
        os.path.join(script_dir, ".env"),
        os.path.join(os.path.dirname(script_dir), ".env")
    ]
    
    for path in search_paths:
        if os.path.exists(path):
            with open(path, "r") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, value = line.split("=", 1)
                        os.environ[key.strip()] = value.strip()
            return True
    return False

def send_mail():
    # Load environment variables
    load_env()
    
    # --- CONFIGURATION ---
    smtp_server = "smtp.gmail.com"
    smtp_port = 465  
    
    # Fetch credentials from environment variables
    sender_email = os.getenv("SENDER_EMAIL")
    sender_password = os.getenv("SENDER_PASSWORD")
    receiver_email = os.getenv("RECEIVER_EMAIL")
    wifi_ip=os.getenv("wifi_ip")
    if not all([sender_email, sender_password, receiver_email]):
        print("\u274c Error: Credentials missing! Check your .env file.")
        return

    # --- CREATE THE EMAIL ---
    msg = EmailMessage()
    msg.set_content("The SMTP Gmail port is accessible. you can use gmail account to send emails. follow the documentation (doc.md) to use it.")
    msg["Subject"] = "SMTP Gmail Port Accessible & Scripts"
    msg["From"] = sender_email
    msg["To"] = receiver_email
    
    # --- ATTACHMENTS ---
    current_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(current_dir)
    # files_to_attach = ["doc.md", "send_email.py", "test_smtp.py", ".env-example"]
    files_to_attach = []
    for filename in files_to_attach:
        # Check current dir first, then parent dir
        file_path = os.path.join(current_dir, filename)
        if not os.path.exists(file_path):
            file_path = os.path.join(parent_dir, filename)
            
        if os.path.exists(file_path):
            with open(file_path, "rb") as f:
                file_data = f.read()
                msg.add_attachment(
                    file_data,
                    maintype="application",
                    subtype="octet-stream",
                    filename=filename
                )
            print(f"Attached: {filename}")
        else:
            print(f"Warning: {filename} not found.")

    # --- SEND THE EMAIL ---
    context = ssl.create_default_context()
    try:
        print(f"\nConnecting to {smtp_server} on port {smtp_port}...")
        with smtplib.SMTP_SSL(smtp_server, smtp_port, context=context,source_address=(wifi_ip, 0)) as server:
            server.login(sender_email, sender_password)
            server.send_message(msg)
            
        print("\n\u2705 Success! Email sent with attachments.")
    except smtplib.SMTPAuthenticationError:
        print("\n\u274c Authentication Failed: Check your App Password in .env.")
    except Exception as e:
        print(f"\n\u274c Error: {e}")

if __name__ == "__main__":
    send_mail()
