import pandas as pd
import base64
from azure.core.credentials import AzureKeyCredential
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.indexes.models import (
    SearchIndex, SimpleField, SearchableField, SearchFieldDataType
)

# --- CONFIGURATION ---
ENDPOINT = "https://kalpitanexa.search.windows.net" 
KEY = "" 
INDEX_NAME = "kalpita-holiday-calendar-2026"
EXCEL_FILE = "App/Documents/Holiday Calendar for 2026.xlsx" 

def create_and_upload():
    print(f"Reading {EXCEL_FILE}...")
    df = pd.read_excel(EXCEL_FILE)

    # --- FIX START: CLEAN HEADERS ---
    # This removes extra spaces, dots, and newlines from the Excel headers
    # "Sl. No" becomes "Sl No", "Date\n" becomes "Date", etc.
    df.columns = df.columns.astype(str).str.replace(r'\s+', ' ', regex=True).str.strip()
    print(f"Cleaned Headers found in Excel: {list(df.columns)}")
    
    # Map the cleaned headers to our internal field names
    # Adjust the left side if your Excel headers are slightly different
    mapping = {
        "Sl. No": "SlNo",
        "Holiday": "HolidayName",
        "Date": "RawDate",
        "Day": "DayOfWeek",
        "Type": "HolidayType"
    }
    
    # Only rename if the column actually exists to avoid errors
    df = df.rename(columns={k: v for k, v in mapping.items() if k in df.columns})
    # --- FIX END ---

    # 2. Create Index Schema
    index_client = SearchIndexClient(ENDPOINT, AzureKeyCredential(KEY))
    fields = [
        SimpleField(name="id", type=SearchFieldDataType.String, key=True),
        SimpleField(name="SlNo", type=SearchFieldDataType.Int32),
        SearchableField(name="HolidayName", type=SearchFieldDataType.String, filterable=True),
        SimpleField(name="HolidayDate", type=SearchFieldDataType.DateTimeOffset, filterable=True, sortable=True),
        SearchableField(name="Month", type=SearchFieldDataType.String, filterable=True),
        SearchableField(name="DateString", type=SearchFieldDataType.String, filterable=True),
        SearchableField(name="DayOfWeek", type=SearchFieldDataType.String, filterable=True),
        SearchableField(name="HolidayType", type=SearchFieldDataType.String, filterable=True)
    ]
    index = SearchIndex(name=INDEX_NAME, fields=fields)
    index_client.create_or_update_index(index)
    print(f"Index '{INDEX_NAME}' created/updated.")

    # 3. Upload Data
    search_client = SearchClient(ENDPOINT, INDEX_NAME, AzureKeyCredential(KEY))
    documents = []

    for index, row in df.iterrows():
        # Using .get() and column index as fallback to prevent KeyError
        try:
            sl_val = row.get("SlNo", row.get("Sl. No"))
            name_val = row.get("HolidayName", row.get("Holiday"))
            date_val = row.get("RawDate", row.get("Date"))
            day_val = row.get("DayOfWeek", row.get("Day"))
            type_val = row.get("HolidayType", row.get("Type"))

            if pd.isna(date_val): continue
            
            h_dt = pd.to_datetime(date_val)
            
            # Generate safe ID
            safe_id = base64.urlsafe_b64encode(f"2026-{sl_val}-{name_val}".encode("utf-8")).decode("utf-8")

            doc = {
                "id": safe_id,
                "SlNo": int(sl_val),
                "HolidayName": str(name_val).strip(),
                "HolidayDate": h_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "Month": h_dt.strftime("%B"),
                "DateString": h_dt.strftime("%d-%b-%Y"),
                "DayOfWeek": str(day_val).strip(),
                "HolidayType": str(type_val).strip()
            }
            documents.append(doc)
        except Exception as row_err:
            print(f"Skipping row {index} due to error: {row_err}")

    if documents:
        search_client.upload_documents(documents)
        print(f"✅ Successfully uploaded {len(documents)} holidays.")
    else:
        print("❌ No documents were prepared. Check if Excel column names match mapping.")

if __name__ == "__main__":
    create_and_upload()