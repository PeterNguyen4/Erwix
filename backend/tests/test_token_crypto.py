import pytest
from cryptography.fernet import Fernet

from app.services import token_crypto


class _FakeSecret:
    def __init__(self, value: str):
        self._value = value

    def get_secret_value(self) -> str:
        return self._value


class _FakeSettings:
    def __init__(self, key: str):
        self.token_encryption_key = _FakeSecret(key)


@pytest.fixture(autouse=True)
def _configured_encryption_key(monkeypatch):
    monkeypatch.setattr(
        token_crypto,
        "get_settings",
        lambda: _FakeSettings(Fernet.generate_key().decode()),
    )
    token_crypto._fernet.cache_clear()
    yield
    token_crypto._fernet.cache_clear()


def test_encrypt_decrypt_survives_round_trip():
    encrypted = token_crypto.encrypt_token("this is my test encrypted token")
    assert encrypted != "this is my test encrypted token"
    assert token_crypto.decrypt_token(encrypted) == "this is my test encrypted token"


def test_decrypt_rejects_invalid_ciphertext():
    with pytest.raises(ValueError):
        token_crypto.decrypt_token("this is an invalid ciphertext")


def test_decrypt_rejects_ciphertext_from_a_different_key(monkeypatch):
    from cryptography.fernet import Fernet

    encrypted_under_other_key = Fernet(Fernet.generate_key()).encrypt(b"secret").decode()
    with pytest.raises(ValueError):
        token_crypto.decrypt_token(encrypted_under_other_key)


def test_fernet_raises_when_encryption_key_not_configured(monkeypatch):
    class _EmptySecret:
        def get_secret_value(self):
            return ""

    class _FakeSettings:
        token_encryption_key = _EmptySecret()

    monkeypatch.setattr(token_crypto, "get_settings", lambda: _FakeSettings())

    with pytest.raises(RuntimeError):
        token_crypto.encrypt_token("anything")
