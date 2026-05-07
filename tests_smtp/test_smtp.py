import socket
import smtplib
import ssl

def check_port(host, port, timeout=2):
    """Checks if a port is open and reachable (IPv4 only)."""
    try:
        # Force IPv4 resolution
        addr_info = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM)

        for addr in addr_info:
            try:
                with socket.create_connection(addr[4], timeout=timeout):
                    return True, "Open"
            except socket.timeout:
                return False, "Timeout"
            except ConnectionRefusedError:
                return False, "Refused"
            except OSError:
                continue  # try next address if available

        return False, "Unreachable"

    except Exception as e:
        return False, f"Error: {str(e)}"


def test_smtp_connectivity():
    targets = [
        ("smtp.gmail.com", [587, 465]),   # removed 25 (often blocked)
        ("smtp.office365.com", [587, 465]),
        ("smtp-mail.outlook.com", [587, 465]),
    ]

    print("\n--- SMTP Port Connectivity Test ---")
    print(f"{'Host':<25} {'Port':<10} {'Status':<15}")
    print("-" * 55)

    for host, ports in targets:
        for port in ports:
            success, status = check_port(host, port)
            status_text = f"[\033[92m{status}\033[0m]" if success else f"[\033[91m{status}\033[0m]"
            print(f"{host:<25} {port:<10} {status_text}")


if __name__ == "__main__":
    test_smtp_connectivity()
