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


def test_the_room_for_a_first_message_is_worked_out_from_the_template_itself(monkeypatch):
    body = "Message from Lexon IT for {{1}}:\n\n{{2}}\n\n- Team Lexon IT"          # 52 characters around the two fill-in fields
    _known(monkeypatch, lexon_custom_text={"status": "APPROVED", "header_type": "", "body": body})
    fixed = Lad.flex_fixed_chars("lexon_custom_text")
    assert fixed == len(body) - len("{{1}}") - len("{{2}}")
    room = Lad.flex_message_room("lexon_custom_text", "Maxx Cycle World")
    assert room == 1024 - fixed - len("Maxx Cycle World") - Lad.FLEX_SAFETY
    # a message of 1057 characters (flattened) does not fit; one of 900 does
    assert 1057 > room > 900 - 1


def test_when_the_template_body_is_unknown_a_safe_default_is_used(monkeypatch):
    _known(monkeypatch)
    assert Lad.flex_fixed_chars("anything") == 70


def test_a_long_message_is_split_into_numbered_parts_at_its_line_breaks():
    room = 400
    text = "\n".join(f"Line number {i} " + "word " * 12 for i in range(1, 15))       # far longer than one message
    parts = Lad.split_for_template(text, room)
    assert parts is not None and 1 < len(parts) <= Lad.FLEX_MAX_PARTS
    assert all(len(p) <= room for p in parts)
    assert parts[0].endswith(f"(1/{len(parts)})") and parts[-1].endswith(f"({len(parts)}/{len(parts)})")
    joined = " ".join(parts)
    assert "Line number 1 " in joined and "Line number 14 " in joined               # nothing is lost


def test_a_short_message_stays_one_part_and_a_huge_one_is_refused():
    assert Lad.split_for_template("Hello\n\nthere", 900) == ["Hello | there"]
    assert Lad.split_for_template("x " * 5000, 900) is None                         # more than 3 parts: shorten it
