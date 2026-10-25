"""Helpers shared by the build scripts."""
import re
import unicodedata

VOWELS = "aeiouàèéìíòóùúAEIOUÀÈÉÌÍÒÓÙÚ"
_ACCENTED = {"à": "a", "è": "e", "é": "e", "ì": "i", "í": "i", "ò": "o", "ó": "o", "ù": "u", "ú": "u",
             "À": "A", "È": "E", "É": "E", "Ì": "I", "Í": "I", "Ò": "O", "Ó": "O", "Ù": "U", "Ú": "U"}
MONO_ACCENTED = {"è", "é", "dà", "sì", "né", "sé", "là", "lì", "tè", "ché", "più", "può", "già", "ciò",
                 "giù", "piè", "dì", "scià"}
# Standard Italian writes final accents grave except closed final é (perché, poté, né, sé).
_FINAL = {"í": "ì", "ó": "ò", "ú": "ù", "á": "à"}


def nfc(s):
    return unicodedata.normalize("NFC", s)


def it_plain_word(w):
    """Wiktionary marks Italian stress on every form (parlàvano, imprégno).
    Standard spelling keeps an accent only on a final stressed vowel (parlò, città, perché)."""
    w = nfc(w)
    if not any(c in _ACCENTED for c in w):
        return w
    # final accented vowel (possibly followed by nothing) stays, others go
    m = re.search(r"[àèéìíòóùú]$", w)
    body, last = (w[:-1], w[-1]) if m else (w, "")
    body = "".join(_ACCENTED.get(c, c) for c in body)
    if last:
        last = _FINAL.get(last, last)
        # Wiktionary also marks stress on monosyllables (và, fù, dài); standard spelling writes an
        # accent there only for a fixed set that distinguishes homographs or ends in a diphthong.
        if len(re.findall(r"[aeiou]+", (body + _ACCENTED.get(last, last)).lower())) <= 1 \
                and (body + last).lower() not in MONO_ACCENTED:
            last = _ACCENTED.get(last, last)
    return body + last


def it_plain(form):
    return " ".join(it_plain_word(x) for x in form.split(" "))
