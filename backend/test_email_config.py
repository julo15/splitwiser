#!/usr/bin/env python3
"""
Test email configuration for Splitwiser
Usage: python test_email_config.py
"""

import asyncio
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.dirname(__file__))

from utils.email import BREVO_API_KEY, FROM_EMAIL, FROM_NAME, FRONTEND_URL, is_email_configured, send_email


def print_config():
    """Print current email configuration"""
    print("=" * 60)
    print("EMAIL CONFIGURATION (Brevo API)")
    print("=" * 60)
    print(f"BREVO_API_KEY: {'✓ SET (hidden)' if BREVO_API_KEY else '❌ NOT SET'}")
    print(f"FROM_EMAIL:    {FROM_EMAIL or '❌ NOT SET'}")
    print(f"FROM_NAME:     {FROM_NAME}")
    print(f"FRONTEND_URL:  {FRONTEND_URL}")
    print()
    print(f"Status: {'✓ CONFIGURED' if is_email_configured() else '❌ NOT CONFIGURED'}")
    print("=" * 60)


async def test_email(recipient: str):
    """Send a test email"""
    print(f"\nSending test email to {recipient}...")

    subject = "Test Email from Splitwiser"

    html_content = """
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #4F46E5;">Test Email</h2>
        <p>This is a test email from your Splitwiser application.</p>
        <p>If you received this, your email configuration is working correctly! ✓</p>
        <hr>
        <p style="font-size: 12px; color: #666;">
            Sent from Splitwiser email service
        </p>
    </body>
    </html>
    """

    text_content = """
Test Email from Splitwiser

This is a test email from your Splitwiser application.

If you received this, your email configuration is working correctly! ✓

---
Sent from Splitwiser email service
    """

    success = await send_email(recipient, subject, html_content, text_content)

    if success:
        print("✓ Email sent successfully!")
        print(f"  Check {recipient} for the test email.")
    else:
        print("❌ Failed to send email.")
        print("  Check the logs above for error details.")

    return success


async def main():
    """Main test function"""
    print()
    print_config()

    if not is_email_configured():
        print("\n❌ Email service is not configured.")
        print("\nTo configure, set these environment variables:")
        print("  export BREVO_API_KEY=<your-brevo-api-key>")
        print("  export FROM_EMAIL=<your-verified-sender-email>")
        print("  export FROM_NAME=Splitwiser")
        print()
        print("To get your Brevo API key:")
        print("  1. Sign up at https://www.brevo.com/")
        print("  2. Go to Settings > SMTP & API > API Keys")
        print("  3. Create a new API key")
        print("  4. Verify your sender email in Settings > Senders & IP")
        print()
        return

    # Prompt for test email
    print()
    recipient = input("Enter email address to send test email to: ").strip()

    if not recipient or '@' not in recipient:
        print("❌ Invalid email address")
        return

    print()
    await test_email(recipient)
    print()


if __name__ == "__main__":
    asyncio.run(main())
