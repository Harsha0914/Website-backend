# pyrefly: ignore [missing-import]
import pytest

def test_register_success(client):
    response = client.post("/api/auth/register", json={
        "full_name": "New Person",
        "email": "newperson@example.com",
        "phone": "+1234567890",
        "password": "SecurePassword1",
        "confirm_password": "SecurePassword1",
        "role": "USER",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "newperson@example.com"
    assert data["role"] == "USER"

def test_register_admin_success(client):
    response = client.post("/api/auth/register", json={
        "full_name": "New Admin Person",
        "email": "newadmin@example.com",
        "phone": "+1234567890",
        "password": "AdminPassword1",
        "confirm_password": "AdminPassword1",
        "role": "ADMIN",
        "admin_code": "test-admin-code-123",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "newadmin@example.com"
    assert data["role"] == "ADMIN"

def test_register_admin_invalid_code(client):
    response = client.post("/api/auth/register", json={
        "full_name": "Fake Admin",
        "email": "fakeadmin@example.com",
        "password": "AdminPassword1",
        "confirm_password": "AdminPassword1",
        "role": "ADMIN",
        "admin_code": "WRONGCODE",
    })
    assert response.status_code == 403
    assert "Invalid Admin Secret Code" in response.json()["detail"]

def test_register_duplicate_email(client, normal_user):
    response = client.post("/api/auth/register", json={
        "full_name": "Duplicate Person",
        "email": normal_user.email,
        "password": "SecurePassword1",
        "confirm_password": "SecurePassword1",
    })
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"]

def test_register_weak_password(client):
    response = client.post("/api/auth/register", json={
        "full_name": "Weak Pass",
        "email": "weak@example.com",
        "password": "weak",
        "confirm_password": "weak",
    })
    assert response.status_code == 422

def test_login_success(client, normal_user):
    response = client.post("/api/auth/login", json={
        "email": normal_user.email,
        "password": "Password123",
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["role"] == "USER"

def test_login_invalid_password(client, normal_user):
    response = client.post("/api/auth/login", json={
        "email": normal_user.email,
        "password": "WrongPassword999",
    })
    assert response.status_code == 401
    # same message as for an unknown account: login never reveals which usernames exist
    assert response.json()["detail"] == "Invalid username/email or password."

def test_login_unregistered_user(client):
    response = client.post("/api/auth/login", json={
        "username": "nonexistentuser9999",
        "password": "Password123",
    })
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid username/email or password."

def test_register_and_login_with_username(client):
    reg_resp = client.post("/api/auth/register", json={
        "username": "customuser",
        "full_name": "Custom User",
        "email": "customuser@example.com",
        "password": "SecurePassword1",
        "confirm_password": "SecurePassword1",
    })
    assert reg_resp.status_code == 201

    login_resp = client.post("/api/auth/login", json={
        "username": "customuser",
        "password": "SecurePassword1",
    })
    assert login_resp.status_code == 200
    assert "access_token" in login_resp.json()
