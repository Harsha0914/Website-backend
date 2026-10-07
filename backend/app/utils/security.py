# pyrefly: ignore [missing-import]
import bcrypt

# Valid bcrypt hash of a random string, used so that a login for an unknown account costs
# the same time as one for a real account (no user enumeration by response time).
_DUMMY_HASH = bcrypt.hashpw(b"timing-equaliser", bcrypt.gensalt()).decode("utf-8")


def hash_password(password: str) -> str:
    # bcrypt limits passwords to 72 bytes
    pwd_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """bcrypt only: there is deliberately no plain-text fallback."""
    if not plain_password or not hashed_password:
        return False
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8')[:72], hashed_password.strip().encode('utf-8'))
    except Exception:
        return False


def burn_password_check(plain_password: str) -> None:
    """Spend the same CPU as a real verification (call when the account does not exist)."""
    verify_password(plain_password or "x", _DUMMY_HASH)
