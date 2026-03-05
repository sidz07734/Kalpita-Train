# app/utils/email_service.py
import logging
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
# The '..' correctly navigates up from 'utils' to the 'app' directory to find the config module
from .. import config

logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        """
        Initializes the Email Service using credentials from the central config.
        """
        self.api_key = config.SENDGRID_API_KEY
        self.from_email = config.SENDER_EMAIL
        # It's good practice to allow overriding the sender name
        self.from_name = config.get_config_value("SENDER_NAME", "Kalpita AI Platform")
        
        if not self.api_key or not self.from_email:
            logger.critical("SendGrid API Key or From Email is not configured. Email service will be disabled.")
            # This check prevents the app from crashing if email isn't set up,
            # but logs a critical error.
            self.sendgrid_client = None
        else:
            self.sendgrid_client = SendGridAPIClient(self.api_key)

    async def send_otp_email(self, recipient_email: str, otp: str) -> bool:
        """
        Sends a password reset One-Time Password (OTP) to the user's email.
        
        Args:
            recipient_email: The email address of the recipient.
            otp: The OTP code to be sent.
            
        Returns:
            True if the email was sent successfully, False otherwise.
        """
        if not self.sendgrid_client:
            logger.error(f"Could not send OTP email to {recipient_email}: Email service is not configured.")
            return False

        message = Mail(
            from_email=(self.from_email, self.from_name),
            to_emails=recipient_email,
            subject='Your Password Reset OTP Code',
            html_content=f"""
                <html>
                <body>
                <p>Dear User,</p>
                <p>Your One-Time Password (OTP) to reset your password is: <strong>{otp}</strong></p>
                <p>This code is valid for 5 minutes. If you did not request this, please ignore this email.</p>
                <p>Regards,<br><strong>The {self.from_name} Team</strong></p>
                </body>
                </html>
            """
        )
        try:
            response = self.sendgrid_client.send(message)
            logger.info(f"OTP email sent to {recipient_email}, status code: {response.status_code}")
            # Check for a successful status code (2xx range)
            return 200 <= response.status_code < 300
        except Exception as e:
            logger.error(f"Failed to send OTP email to {recipient_email}: {e}")
            return False
        
    async def send_welcome_email(self, recipient_email: str, user_name: str, temp_password: str) -> bool:
        """
        Sends a welcome email with a temporary password after a new user is created.
        
        Args:
            recipient_email: The new user's email address.
            user_name: The new user's name.
            temp_password: The temporary password for their first login.
            
        Returns:
            True if the email was sent successfully, False otherwise.
        """
        if not self.sendgrid_client:
            logger.error(f"Could not send welcome email to {recipient_email}: Email service is not configured.")
            return False

        message = Mail(
            from_email=(self.from_email, self.from_name),
            to_emails=recipient_email,
            subject=f'Welcome to {self.from_name}!',
            html_content=f"""
                <html>
                <body>
                <p>Hello {user_name},</p>
                <p>An account has been created for you on the {self.from_name}. Please log in using the following credentials:</p>
                <p><strong>Email:</strong> {recipient_email}</p>
                <p><strong>Temporary Password:</strong> <strong>{temp_password}</strong></p>
                <p>You will be prompted to change this password upon your first login for security.</p>
                <p>Regards,<br><strong>The {self.from_name} Team</strong></p>
                </body>
                </html>
            """
        )
        try:
            response = self.sendgrid_client.send(message)
            logger.info(f"Welcome email sent to {recipient_email}, status code: {response.status_code}")
            return 200 <= response.status_code < 300
        except Exception as e:
            logger.error(f"Failed to send welcome email to {recipient_email}: {e}")
            return False