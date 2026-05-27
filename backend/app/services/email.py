"""Service d'envoi d'e-mails via SMTP async (aiosmtplib + Jinja2).

Configuration requise dans .env :
    SMTP_HOST=smtp.example.com
    SMTP_PORT=587          # STARTTLS (défaut)
    SMTP_USE_TLS=false     # false pour STARTTLS / true pour SSL direct (port 465)
    SMTP_STARTTLS=true     # true pour STARTTLS (port 587)
    MAIL_FROM_ADDRESS=noreply@example.com
"""

from __future__ import annotations

import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import aiosmtplib
from jinja2 import Environment, FileSystemLoader

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_TEMPLATE_DIR = Path(__file__).parent / "templates"
_jinja_env = Environment(loader=FileSystemLoader(str(_TEMPLATE_DIR)), autoescape=True)


async def _send_smtp(to: str, subject: str, html: str) -> None:
    """Envoie l'e-mail via SMTP async. Journalise l'erreur sans la propager."""
    settings = get_settings()

    if not settings.SMTP_HOST or not settings.MAIL_FROM_ADDRESS:
        logger.warning("SMTP non configuré — e-mail non envoyé à %s", to)
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.MAIL_FROM_NAME} <{settings.MAIL_FROM_ADDRESS}>"
    msg["To"] = to
    msg.attach(MIMEText(html, "html", "utf-8"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USERNAME or None,
            password=settings.SMTP_PASSWORD or None,
            use_tls=settings.SMTP_USE_TLS,
            start_tls=settings.SMTP_STARTTLS,
        )
        logger.info("E-mail envoyé à %s (sujet : %s)", to, subject)
    except Exception as exc:  # noqa: BLE001
        logger.error("Échec envoi e-mail à %s : %s", to, exc)


async def send_validation_email(
    to: str,
    campagne_nom: str,
    magasin_nom: str,
    lignes: list[dict],
) -> None:
    """Envoie l'e-mail de validation d'inventaire.

    Args:
        to: Adresse e-mail du destinataire.
        campagne_nom: Nom de la campagne validée.
        magasin_nom: Nom du magasin.
        lignes: Liste de dicts avec keys :
            code_barre, libelle, qt_theo, qt_compte, ecart, ecart_pct.
    """
    template = _jinja_env.get_template("validation_email.html")
    html = template.render(
        campagne_nom=campagne_nom,
        magasin_nom=magasin_nom,
        lignes=lignes,
    )
    subject = f"[G2C Inventaire] Campagne validée : {campagne_nom}"
    await _send_smtp(to, subject, html)
