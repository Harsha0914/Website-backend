import os

# Must be set BEFORE the app (and therefore app.config) is imported.
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")
os.environ.setdefault("DEBUG", "false")                         # a developer's local .env must not change test results
os.environ.setdefault("GOOGLE_PLACES_API_KEY", "")
os.environ.setdefault("WHATSAPP_IS_TEST_MODE", "false")
os.environ.setdefault("ADMIN_SECRET_CODE", "test-admin-code-123")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")   # never touch the committed shop.db
# Tests must never reach a real service, whatever the developer keeps in a local .env
for _name in ("LAD_AUTH_PASSWORD", "LAD_API_TOKEN", "OPENAI_API_KEY", "WHATSAPP_ADMIN_COPY_NUMBER"):
    os.environ[_name] = ""
os.environ["GOOGLE_PLACES_API_KEY"] = ""
os.environ["MONGODB_URI"] = ""                                 # never reach a real MongoDB in tests

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, get_db
from app.models.user import User, UserRole
from app.utils.security import hash_password
from app.auth.jwt import create_access_token

# Use SQLite in-memory for fast, isolated testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="session", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def db_session():
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

@pytest.fixture
def normal_user(db_session):
    user = User(
        full_name="Test User",
        email="user@example.com",
        password_hash=hash_password("Password123"),
        role=UserRole.USER,
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

@pytest.fixture
def admin_user(db_session):
    admin = User(
        full_name="Admin User",
        email="admin@example.com",
        password_hash=hash_password("AdminPass123"),
        role=UserRole.ADMIN,
        is_active=True
    )
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)
    return admin

@pytest.fixture
def user_token(normal_user):
    return create_access_token(normal_user.id)

@pytest.fixture
def admin_token(admin_user):
    return create_access_token(admin_user.id)


@pytest.fixture(autouse=True)
def _reset_security_state():
    """Throttles and OTPs are process-wide: isolate every test."""
    from app.utils import login_throttle
    from app.services.email_service import reset_otp_cache
    login_throttle.reset_all()
    reset_otp_cache()
    yield
    login_throttle.reset_all()
    reset_otp_cache()
