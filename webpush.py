"""Web Push (RFC 8291 + RFC 8292) ohne Zusatzpakete – nur mit `cryptography` und `requests`.

Die Nachricht wird für jedes Gerät einzeln Ende-zu-Ende verschlüsselt: Der Push-Dienst
(Apple, Google, Mozilla) sieht nur Datensalat, entschlüsseln kann nur das Gerät selbst.
"""
import base64
import json
import os
import struct
import time
from urllib.parse import urlparse

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


def b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def b64ud(s: str) -> bytes:
    s = str(s).strip()
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _hkdf(salt: bytes, ikm: bytes, info: bytes, n: int) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=n, salt=salt, info=info).derive(ikm)


def _pub_raw(pub) -> bytes:
    return pub.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)


def verschluesseln(nutzlast: bytes, p256dh: str, auth: str, salt: bytes = None, server_priv=None) -> bytes:
    """aes128gcm-Inhalt nach RFC 8291 (ein Datensatz)."""
    ua_pub = b64ud(p256dh)
    auth_secret = b64ud(auth)
    if len(ua_pub) != 65 or len(auth_secret) < 16:
        raise ValueError("ungültiges Abo")
    as_priv = server_priv or ec.generate_private_key(ec.SECP256R1())
    as_pub = _pub_raw(as_priv.public_key())
    gemeinsam = as_priv.exchange(ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_pub))
    ikm = _hkdf(auth_secret, gemeinsam, b"WebPush: info\x00" + ua_pub + as_pub, 32)
    salt = salt or os.urandom(16)
    cek = _hkdf(salt, ikm, b"Content-Encoding: aes128gcm\x00", 16)
    nonce = _hkdf(salt, ikm, b"Content-Encoding: nonce\x00", 12)
    rs = 4096
    if len(nutzlast) + 17 > rs:
        raise ValueError("Nachricht zu lang")
    ct = AESGCM(cek).encrypt(nonce, nutzlast + b"\x02", None)   # 0x02 = letzter Datensatz
    return salt + struct.pack("!I", rs) + bytes([len(as_pub)]) + as_pub + ct


def schluessel_aus(priv_b64u: str):
    """VAPID-Schlüssel aus dem Secret (32 Byte, base64url)."""
    d = int.from_bytes(b64ud(priv_b64u), "big")
    return ec.derive_private_key(d, ec.SECP256R1())


def vapid_kopf(endpoint: str, priv, sub: str, gueltig_s: int = 12 * 3600) -> str:
    u = urlparse(endpoint)
    kopf = b64u(json.dumps({"typ": "JWT", "alg": "ES256"}, separators=(",", ":")).encode())
    claims = b64u(json.dumps({"aud": f"{u.scheme}://{u.netloc}", "exp": int(time.time()) + gueltig_s, "sub": sub},
                             separators=(",", ":")).encode())
    signiert = f"{kopf}.{claims}".encode()
    r, s = decode_dss_signature(priv.sign(signiert, ec.ECDSA(hashes.SHA256())))
    jwt = f"{kopf}.{claims}.{b64u(r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))}"
    return f"vapid t={jwt}, k={b64u(_pub_raw(priv.public_key()))}"


def senden(abo: dict, daten: dict, priv_b64u: str, sub: str, ttl: int = 24 * 3600, dringend: bool = False) -> int:
    """Schickt eine Nachricht an ein Abo {endpoint, p256dh, auth}. Gibt den HTTP-Status zurück
    (201 = angekommen, 404/410 = Abo existiert nicht mehr)."""
    import requests
    endpoint = abo["endpoint"]
    if urlparse(endpoint).scheme != "https":
        raise ValueError("Endpoint muss https sein")
    priv = schluessel_aus(priv_b64u)
    inhalt = verschluesseln(json.dumps(daten, ensure_ascii=False).encode(), abo["p256dh"], abo["auth"])
    r = requests.post(endpoint, data=inhalt, timeout=15, headers={
        "Authorization": vapid_kopf(endpoint, priv, sub),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        "TTL": str(ttl),
        "Urgency": "high" if dringend else "normal",
    })
    return r.status_code


def neues_schluesselpaar():
    """(privat_b64u, oeffentlich_b64u) – privat gehört als Secret VAPID_PRIVATE zu GitHub."""
    p = ec.generate_private_key(ec.SECP256R1())
    return b64u(p.private_numbers().private_value.to_bytes(32, "big")), b64u(_pub_raw(p.public_key()))
