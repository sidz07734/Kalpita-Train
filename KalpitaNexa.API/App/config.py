import os
import struct
from typing import Any
import pyodbc
from dotenv import load_dotenv
from azure.identity import DefaultAzureCredential
import logging

logger = logging.getLogger(__name__)

# Load .env file if it exists (for local development)
# In Azure App Service, environment variables come from Configuration settings
try:
    load_dotenv(verbose=True, override=True)
except Exception:
    logger.debug("No .env file found (expected in production)")

# --- JWT & Security Configuration ---
# Generate a strong random key: openssl rand -hex 32
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "super-secret-key-change-this-in-prod") 
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours
INTEGRATION_SECRET_KEY = "YourSuperStrongSharedSecretKeyHere"
SYSTEM_ADMIN_EMAIL = "Madhan.Kumar@kalpitatechnologies.com" # Used for background auto-provisioning
 
# --- Azure Configuration ---
# Ensure these are loaded from .env for security
AZURE_AD_CLIENT_ID = os.getenv('AZURE_AD_CLIENT_ID')
AZURE_AD_TENANT_ID = os.getenv('AZURE_AD_TENANT_ID')
OPTIMIZED_PAYMENTS_TID = os.getenv("OPTIMIZED_PAYMENTS_TID", "DAC63AC8-914D-45BE-A9B5-0AD9E725973E")


# --- Microsoft Teams Bot Configuration ---
# These are required for the Bot Framework Adapter to authenticate Teams messages
MICROSOFT_APP_ID = os.getenv("MicrosoftAppId") 
MICROSOFT_APP_PASSWORD = os.getenv("MicrosoftAppPassword")
MICROSOFT_APP_TENANT_ID = os.getenv("MicrosoftAppTenantId")

# Training(summary,q/a,shorts) Module SharePoint credentials
SP_TRAINING_TENANT_ID     = os.getenv("SP_TRAINING_TENANT_ID", "")
SP_TRAINING_CLIENT_ID     = os.getenv("SP_TRAINING_CLIENT_ID", "")
SP_TRAINING_CLIENT_SECRET = os.getenv("SP_TRAINING_CLIENT_SECRET", "")



# Validate bot credentials are configured
if not MICROSOFT_APP_ID:
    logger.warning("WARNING: MICROSOFT_APP_ID not configured. Bot Framework authentication will fail.")
if not MICROSOFT_APP_PASSWORD:
    logger.warning("WARNING: MICROSOFT_APP_PASSWORD not configured. Bot Framework authentication will fail.")
if not MICROSOFT_APP_TENANT_ID:
    logger.warning("WARNING: MICROSOFT_APP_TENANT_ID not configured. Bot Framework authentication will fail.")

# --- SQL Database Connection Details ---
SQL_SERVER = os.getenv("SQL_SERVER", "kalpita.database.windows.net")
SQL_DATABASE = os.getenv("SQL_DATABASE", "KalpitaNexa-Dev")
SENDGRID_API_KEY = ''
SENDER_EMAIL = 'recruitment@kalpitatechnologies.com'
AZURE_AD_CLIENT_ID='0326d913-091e-4506-9f75-68fe2066c3eb'
RECRUIT_SQL_SERVER="kalpita.database.windows.net"
RECRUIT_SQL_DATABASE="KalpitaRecruit-Prod"



WINDOWS_AUTH_SQL_SERVER = "kalpitanexaop.database.windows.net"
WINDOWS_AUTH_SQL_DATABASE = "KalpitaNexaOP-Dev"
WINDOWS_AUTH_SQL_USERNAME = "KalpitaNexaOP" 
WINDOWS_AUTH_SQL_PASSWORD = "OPtest@123" 

# Global dictionary to store configurations fetched from the database
DB_CONFIGS = {}

# ==================== PERFORMANCE FIX #1: Cache Azure Credentials ====================
_cached_credential = None
_cached_recruit_credential = None

def get_azure_credential():
    """
    Returns a cached Azure credential to avoid repeated authentication overhead.
    This dramatically reduces connection time.
    """
    global _cached_credential
    if _cached_credential is None:
        logger.info("Creating new Azure credential (first time only)")
        _cached_credential = DefaultAzureCredential(exclude_interactive_browser_credential=False)
    return _cached_credential

def get_recruit_azure_credential():
    """
    Returns a cached Azure credential for recruitment DB.
    """
    global _cached_recruit_credential
    if _cached_recruit_credential is None:
        logger.info("Creating new Azure credential for recruitment DB (first time only)")
        _cached_recruit_credential = DefaultAzureCredential(exclude_interactive_browser_credential=False)
    return _cached_recruit_credential

# ==================== PERFORMANCE FIX #2: Token Caching ====================
_token_cache = {}
_token_cache_recruit = {}

def get_cached_token(scope: str, cache_dict: dict, credential):
    """
    Caches access tokens to avoid repeated token requests.
    Tokens are typically valid for 1 hour, so this saves significant time.
    """
    import time
    
    if scope in cache_dict:
        token_obj, timestamp = cache_dict[scope]
        # Token valid for ~55 minutes (3300 seconds) to be safe
        if time.time() - timestamp < 3300:
            return token_obj
    
    # Get new token
    token_obj = credential.get_token(scope)
    cache_dict[scope] = (token_obj, time.time())
    return token_obj

def get_recruit_sql_connection():
    """
    Creates a pyodbc connection to the Recruitment DB using cached credentials and tokens.
    OPTIMIZED: Uses credential and token caching.
    """
    server = RECRUIT_SQL_SERVER
    database = RECRUIT_SQL_DATABASE

    if not all([server, database]):
        error_msg = "RECRUIT_SQL_SERVER and RECRUIT_SQL_DATABASE environment variables must be set."
        logger.critical(error_msg)
        raise ValueError(error_msg)

    try:
        # Use cached credential
        credential = get_recruit_azure_credential()
        
        # Use cached token
        token_object = get_cached_token(
            "https://database.windows.net/.default",
            _token_cache_recruit,
            credential
        )
        
        token_bytes = token_object.token.encode("utf-16-le")
        token_struct = struct.pack(f"<I{len(token_bytes)}s", len(token_bytes), token_bytes)

        conn_str = (
            f"Driver={{ODBC Driver 17 for SQL Server}};"
            f"Server=tcp:{server},1433;"
            f"Database={database};"
            f"Encrypt=yes;"
            f"TrustServerCertificate=no;"
            f"Connection Timeout=30;"
        )

        SQL_COPT_SS_ACCESS_TOKEN = 1256
        conn = pyodbc.connect(conn_str, attrs_before={SQL_COPT_SS_ACCESS_TOKEN: token_struct})
        
        logger.info(f"Successfully connected to recruitment database '{database}'")
        return conn

    except Exception as e:
        logger.error(f"FATAL: Recruitment database connection failed. Error: {e}")
        raise
 
def get_sql_connection():
    """
    Creates and returns a pyodbc SQL connection object using passwordless token authentication.
    OPTIMIZED: Uses cached credentials and tokens to reduce connection time.
    """
    if not SQL_SERVER or not SQL_DATABASE:
        raise ValueError("SQL_SERVER and SQL_DATABASE environment variables must be set for initial DB connection.")
 
    conn_str = (
        f"Driver={{ODBC Driver 17 for SQL Server}};"
        f"Server=tcp:{SQL_SERVER},1433;"
        f"Database={SQL_DATABASE};"
        f"Encrypt=yes;"
        f"TrustServerCertificate=no;"
        f"Connection Timeout=30;"
    )
 
    try:
        # Use cached credential
        credential = get_azure_credential()
        
        # Use cached token
        token_object = get_cached_token(
            "https://database.windows.net/.default",
            _token_cache,
            credential
        )
        
    except Exception as e:
        logger.error(f"FATAL: Failed to get Azure AD token. Error: {e}", exc_info=True)
        raise
 
    token_bytes = token_object.token.encode("utf-16-le")
    token_struct = struct.pack(f"<I{len(token_bytes)}s", len(token_bytes), token_bytes)
   
    SQL_COPT_SS_ACCESS_TOKEN = 1256
 
    try:
        conn = pyodbc.connect(conn_str, attrs_before={SQL_COPT_SS_ACCESS_TOKEN: token_struct})
        return conn
    except pyodbc.Error as ex:
        sqlstate = ex.args[0]
        logger.error(f"FATAL: Database connection failed. SQLSTATE: {sqlstate}. Error: {ex}", exc_info=True)
        raise

def load_configurations_from_db():
    """
    OPTIMIZED: Only loads once and caches in DB_CONFIGS.
    """
    global DB_CONFIGS
    if DB_CONFIGS:
        return

    logger.info("Loading configurations from SQL database...")
    try:
        with get_sql_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT ConfigKey, ConfigValue FROM Configurations")
            
            rows = cursor.fetchall()
            logger.info(f"Fetched {len(rows)} rows from 'Configurations' table.")
            
            for row in rows:
                config_key, config_value = row
                if config_key and config_value is not None:
                    DB_CONFIGS[config_key.upper()] = config_value
            
            logger.info(f"Successfully loaded {len(DB_CONFIGS)} configurations.")
            
    except Exception as e:
        logger.warning(f"Could not load configurations from DB. Using environment variables. Error: {e}")
        load_configurations_from_env()

def load_configurations_from_env():
    """Fallback to environment variables if DB is not available"""
    global DB_CONFIGS
    import os
    
    env_mapping = {
        'AZURE_OPENAI_API_KEY': os.getenv('AZURE_OPENAI_API_KEY'),
        'AZURE_OPENAI_ENDPOINT': os.getenv('AZURE_OPENAI_ENDPOINT'),
        'AZURE_OPENAI_API_VERSION': os.getenv('AZURE_OPENAI_API_VERSION'),  # ADD THIS LINE
        'AZURE_OPENAI_DEPLOYMENT_NAME_GPT4': os.getenv('AZURE_OPENAI_DEPLOYMENT_NAME_GPT4'),  # ADD THIS LINE
    }
    
    for key, value in env_mapping.items():
        if value:
            DB_CONFIGS[key.upper()] = value
    
    logger.info(f"Loaded {len(DB_CONFIGS)} configurations from environment variables")

def get_config_value(key: str, default: Any = None) -> Any:
    """
    OPTIMIZED: Removed the redundant check that was calling load_configurations_from_db() 
    on every request. Configurations are now loaded once at startup.
    """
    value = DB_CONFIGS.get(key.upper(), default)
    if value is None:
        logger.warning(f"Configuration key '{key.upper()}' not found. Using default: {default}")
    return value
 
# --- Initialize configurations from DB when config.py is imported ---
try:
    load_configurations_from_db()
except Exception as e:
    logger.warning(f"Could not load configurations from database. Application will continue with available configurations. Error: {e}")
 



def get_windows_auth_sql_connection():
    """
    Creates a pyodbc connection to the Azure SQL Server (OP Database)
    using Standard SQL Authentication (Username & Password) defined in this file.
    """
    server = WINDOWS_AUTH_SQL_SERVER
    database = WINDOWS_AUTH_SQL_DATABASE
    username = WINDOWS_AUTH_SQL_USERNAME
    password = WINDOWS_AUTH_SQL_PASSWORD
 
    # Check if variables are actually filled in
    if not all([server, database, username, password]):
        error_msg = "Username and Password are missing in config.py for OP Database connection."
        logger.critical(error_msg)
        raise ValueError(error_msg)
 
    try:
        # Standard Azure SQL Connection String with User/Pass
        conn_str = (
            f"Driver={{ODBC Driver 17 for SQL Server}};"
            f"Server=tcp:{server},1433;"
            f"Database={database};"
            f"Uid={username};"
            f"Pwd={password};"
            f"Encrypt=yes;"
            f"TrustServerCertificate=no;"
            f"Connection Timeout=30;"
        )
 
        # Connect directly
        conn = pyodbc.connect(conn_str)
       
        logger.info(f"Successfully connected to Azure database '{database}' on server '{server}' using SQL Auth.")
        return conn
 
    except pyodbc.Error as ex:
        # This will print the error if the password is wrong
        sqlstate = ex.args[0] if ex.args else "Unknown"
        logger.error(f"FATAL: Database connection failed. SQLSTATE: {sqlstate}. Error: {ex}")
        raise
    except Exception as e:
        logger.error(f"FATAL: Database connection failed. Error: {e}")
        raise
# --- Initialize configurations from DB when config.py is imported ---
try:
    load_configurations_from_db()
except Exception as e:
    logger.warning(f"Could not load configurations from database. Application will continue with available configurations. Error: {e}")
 
 

# --- All your Azure service configurations ---
AZURE_OPENAI_API_KEY = get_config_value("AZURE_OPENAI_API_KEY")
AZURE_OPENAI_ENDPOINT = get_config_value("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_API_VERSION = get_config_value("AZURE_OPENAI_API_VERSION")
logger.info(f"Loaded AZURE_OPENAI_API_VERSION: {AZURE_OPENAI_API_VERSION}")
AZURE_OPENAI_DEPLOYMENT_NAME_GPT35 = get_config_value("AZURE_OPENAI_DEPLOYMENT_NAME_GPT35")
AZURE_OPENAI_DEPLOYMENT_NAME_GPT4 = get_config_value("AZURE_OPENAI_DEPLOYMENT_NAME_GPT4")
 
AZURE_OPENAI_DEPLOYMENT_NAME = AZURE_OPENAI_DEPLOYMENT_NAME_GPT35 
 
AZURE_SEARCH_KEY = get_config_value("AZURE_SEARCH_KEY")
AZURE_SEARCH_ENDPOINT = get_config_value("AZURE_SEARCH_ENDPOINT")
AZURE_SEARCH_INDEX_NAME = get_config_value("AZURE_SEARCH_INDEX_NAME")
AZURE_SEARCH_INDEX_NAME_SQL = get_config_value("AZURE_SEARCH_INDEX_NAME_SQL") 
AZURE_SEARCH_INDEX_NAME_KALPITAPOLICY = get_config_value("AZURE_SEARCH_INDEX_NAME_KALPITAPOLICY") 
AZURE_BLOB_CONNECTION_STRING = get_config_value("AZURE_BLOB_CONNECTION_STRING")
AZURE_BLOB_CONTAINER_NAME = get_config_value("AZURE_BLOB_CONTAINER_NAME")
BRAVE_API_KEY = get_config_value("BRAVE_API_KEY")
AZURE_TRANSLATOR_KEY = get_config_value("AZURE_TRANSLATOR_KEY")
AZURE_TRANSLATOR_ENDPOINT = get_config_value("AZURE_TRANSLATOR_ENDPOINT")
AZURE_TRANSLATOR_REGION = get_config_value("AZURE_TRANSLATOR_REGION")
#AZURE TEXT TO SPEECH

AZURE_SPEECH_KEY = os.getenv("AZURE_SPEECH_KEY", "")
AZURE_SPEECH_REGION = os.getenv("AZURE_SPEECH_REGION", "eastus")



AZURE_CONTENT_SAFETY_ENDPOINT = os.getenv("AZURE_CONTENT_SAFETY_ENDPOINT", "https://nexatestsafety.cognitiveservices.azure.com/")
AZURE_CONTENT_SAFETY_KEY = os.getenv("AZURE_CONTENT_SAFETY_KEY", "")

# AZURE_SEARCH_INDEX_NAME_ATTENDANCE = os.getenv("AZURE_SEARCH_INDEX_NAME_ATTENDANCE") 
AZURE_SEARCH_INDEX_NAME_EMPLOYEE_ROSTER = get_config_value("AZURE_SEARCH_INDEX_NAME_ATTENDANCE")
HR_DATABASE_CONNECTION_STRING = os.getenv("HR_DATABASE_CONNECTION_STRING", "DRIVER={ODBC Driver 17 for SQL Server};SERVER=IT-SUPPORT,1433;DATABASE=Attendance;UID=attendance_user;PWD=Attend@12345")
 

SHAREPOINT_HOSTNAME = "kalpitatechnologies0.sharepoint.com"
SHAREPOINT_SITE_PATH = "/sites/KalpitaInternalPolicy"

SHAREPOINT_EMPLOYEE_FOLDER = "KALPITA RM FM"
SHAREPOINT_HOLIDAY_FOLDER = "HolidayCalendar"

GRAPH_TENANT_ID = "8049d4ef-045b-4505-8745-7bca3a5691a3"
GRAPH_CLIENT_ID = "50d4b271-3c66-4b43-a9b7-c34b62e8be5b"
GRAPH_CLIENT_SECRET = ""


logger.info("--- Database Configuration ---")
logger.info("Authentication Mode: Unified Passwordless (Managed Identity or Local Azure AD)")
logger.info(f"SQL Server: {SQL_SERVER}")
logger.info(f"SQL Database: {SQL_DATABASE}")
logger.info("----------------------------")