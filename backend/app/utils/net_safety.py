"""
SSRF protection for every outbound fetch of a URL that originates from data we do not control
(Google / OpenStreetMap place records, user input).

SafeClient behaves like the small part of httpx.AsyncClient we use (``await client.get(url)``) but:
  * only http/https on standard web ports;
  * refuses URLs with credentials in them;
  * resolves the host and refuses loopback / private / link-local / reserved / multicast addresses;
  * follows redirects MANUALLY and re-validates every hop;
  * reads at most ``max_bytes`` of the body.
"""
import asyncio
import ipaddress
import socket
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urljoin, urlparse

# pyrefly: ignore [missing-import]
import httpx

ALLOWED_PORTS = {None, 80, 443, 8080, 8443}


class UnsafeURL(Exception):
    """The URL points somewhere we must never connect to."""


@dataclass
class SafeResponse:
    status_code: int
    url: str
    text: str
    headers: dict


def is_public_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped:
        addr = addr.ipv4_mapped
    return bool(addr.is_global and not addr.is_multicast)


async def assert_public_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise UnsafeURL("scheme not allowed")
    host = parsed.hostname
    if not host:
        raise UnsafeURL("missing host")
    if parsed.username or parsed.password:
        raise UnsafeURL("credentials in URL")
    try:
        port = parsed.port
    except ValueError:
        raise UnsafeURL("invalid port")
    if port not in ALLOWED_PORTS:
        raise UnsafeURL("port not allowed")

    # literal IP: check directly (no DNS)
    try:
        ipaddress.ip_address(host)
        literal = True
    except ValueError:
        literal = False
    if literal:
        if not is_public_ip(host):
            raise UnsafeURL("non-public address")
        return

    try:
        infos = await asyncio.to_thread(
            socket.getaddrinfo, host, port or (443 if parsed.scheme == "https" else 80), 0, socket.SOCK_STREAM
        )
    except socket.gaierror:
        raise httpx.ConnectError(f"cannot resolve {host}")
    if not infos:
        raise httpx.ConnectError(f"cannot resolve {host}")
    for info in infos:
        if not is_public_ip(info[4][0]):
            raise UnsafeURL("host resolves to a non-public address")


class SafeClient:
    def __init__(self, timeout: float = 10, verify: bool = True, max_redirects: int = 5,
                 max_bytes: int = 2_000_000, **_ignored):
        self.timeout = timeout
        self.verify = verify
        self.max_redirects = max_redirects
        self.max_bytes = max_bytes

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url: str, headers: Optional[dict] = None) -> SafeResponse:
        current = url
        for _hop in range(self.max_redirects + 1):
            await assert_public_url(current)
            async with httpx.AsyncClient(follow_redirects=False, timeout=self.timeout, verify=self.verify) as client:
                async with client.stream("GET", current, headers=headers) as resp:
                    location = resp.headers.get("location")
                    if resp.status_code in (301, 302, 303, 307, 308) and location:
                        current = urljoin(current, location)
                        continue
                    body = bytearray()
                    async for chunk in resp.aiter_bytes():
                        body.extend(chunk)
                        if len(body) >= self.max_bytes:
                            break
                    encoding = resp.encoding or "utf-8"
                    try:
                        text = bytes(body[: self.max_bytes]).decode(encoding, errors="replace")
                    except LookupError:
                        text = bytes(body[: self.max_bytes]).decode("utf-8", errors="replace")
                    return SafeResponse(resp.status_code, current, text, dict(resp.headers))
        raise httpx.TooManyRedirects("too many redirects")
