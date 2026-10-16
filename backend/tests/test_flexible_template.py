"""A flexible template lets the user's own edited text go out as a first message (WhatsApp otherwise only allows fixed approved templates)."""
from app.config import settings
from app.services.mr_lad_client import MrLadWhatsAppClient as Lad


def _known(monkeypatch, **templates):
    monkeypatch.setattr(Lad, "list_templates", classmethod(lambda cls, max_age=300.0: templates))


def test_no_flexible_template_configured_means_none(monkeypatch):
    monkeypatch.setattr(settings, "WHATSAPP_FLEX_TEMPLATE_TEXT", "")
    monkeypatch.setattr(settings, "WHATSAPP_FLEX_TEMPLATE_PICTURE", "")
    assert Lad.pick_flexible(False) is None and Lad.pick_flexible(True) is None


def test_only_an_approved_template_with_the_right_header_is_used(monkeypatch):
    monkeypatch.setattr(settings, "WHATSAPP_FLEX_TEMPLATE_TEXT", "lexon_custom_text")
    monkeypatch.setattr(settings, "WHATSAPP_FLEX_TEMPLATE_PICTURE", "lexon_custom_picture")
    _known(monkeypatch,
           lexon_custom_text={"status": "APPROVED", "header_type": ""},
           lexon_custom_picture={"status": "PENDING", "header_type": "IMAGE"})
    assert Lad.pick_flexible(False) == "lexon_custom_text"
    assert Lad.pick_flexible(True) is None                      # not approved yet: the fixed templates are used instead
    _known(monkeypatch, lexon_custom_picture={"status": "APPROVED", "header_type": "IMAGE"})
    assert Lad.pick_flexible(True) == "lexon_custom_picture"


def test_text_is_flattened_to_one_line_for_a_fill_in_field():
    flat = Lad.flatten_for_template("Hello Prime Cafe,\n\nLine two\tends\r\n  \nLine three      spaced")
    assert "\n" not in flat and "\t" not in flat and "    " not in flat
    assert flat.startswith("Hello Prime Cafe, | Line two") and flat.endswith("Line three   spaced")
